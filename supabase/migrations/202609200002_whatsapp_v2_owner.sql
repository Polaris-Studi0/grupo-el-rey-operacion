-- Owner replies are linked by WhatsApp's reply-to ID, never by a claimed role in text.
create table public.whatsapp_shared_media (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.whatsapp_conversations(id),
 human_task_id uuid not null references public.human_tasks(id),
 attachment_id uuid not null references public.whatsapp_attachments(id),
 caption text not null default '',
 created_at timestamptz not null default now(),
 unique(human_task_id,attachment_id)
);
alter table public.whatsapp_shared_media enable row level security;
revoke all on public.whatsapp_shared_media from anon,authenticated;
grant select,insert on public.whatsapp_shared_media to service_role;

create function public.route_whatsapp_owner_reply(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.whatsapp_messages; notification public.whatsapp_messages; t public.human_tasks;
 owner_phone text; sender_phone text; quoted text; a public.whatsapp_attachments;
begin
 if not exists(select 1 from public.whatsapp_bot_runtime where enabled) then return jsonb_build_object('route','customer');end if;
 select * into m from public.whatsapp_messages where id=p_message_id and direction='inbound' and sender_type='customer';
 select wc.phone_e164 into sender_phone from public.whatsapp_conversations c join public.whatsapp_contacts wc on wc.id=c.contact_id where c.id=m.conversation_id;
 select r.owner_phone into owner_phone from public.whatsapp_bot_runtime r;
 if sender_phone is distinct from owner_phone then return jsonb_build_object('route','customer');end if;
 quoted:=coalesce(m.reply_to_meta_message_id,m.raw_payload#>>'{message,context,id}');
 select * into notification from public.whatsapp_messages where meta_message_id=quoted and direction='outbound'
   and conversation_id=m.conversation_id and raw_payload->>'internal_notification'='true'
   and raw_payload->>'human_task_id' is not null;
 if notification.id is null then return jsonb_build_object('route','customer');end if;
 select * into t from public.human_tasks where id::text=notification.raw_payload->>'human_task_id' for update;
 if t.id is null then return jsonb_build_object('route','owner','accepted',false,'reason','task_missing');end if;
 if t.resolution->>'owner_message_id'=m.id::text then return jsonb_build_object('route','owner','accepted',true,'task_id',t.id,'reused',true);end if;
 if t.status not in ('pending','in_progress') then return jsonb_build_object('route','owner','accepted',false,'reason','task_already_resolved');end if;
 if m.message_type='image' and not exists(select 1 from public.whatsapp_attachments where message_id=m.id) then
   raise exception 'La imagen del responsable aún no está guardada';
 end if;
 if nullif(trim(m.body),'') is null and m.message_type<>'image' then
   return jsonb_build_object('route','owner','accepted',false,'reason','text_or_image_required');
 end if;
 update public.human_tasks set status='resolved',resolved_at=now(),automation_error=null,
   resolution=jsonb_build_object('answer',coalesce(m.body,''),'owner_message_id',m.id,'source','owner_whatsapp')
 where id=t.id returning * into t;
 -- A payment receipt is never repurposed as a product photo.
 if t.task_type in ('product_lookup','general') then
   for a in select * from public.whatsapp_attachments where message_id=m.id and mime_type in ('image/jpeg','image/png') and size_bytes<=5242880 loop
     insert into public.whatsapp_shared_media(conversation_id,human_task_id,attachment_id,caption)
     values(t.conversation_id,t.id,a.id,coalesce(m.body,'')) on conflict do nothing;
   end loop;
 end if;
 insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
 values(t.conversation_id,'human_task','resolved',jsonb_build_object('task_id',t.id,'source_message_id',m.id,'source','owner_whatsapp'),'human','owner-task:'||m.id)
 on conflict(source_key) do nothing;
 insert into public.automation_outbox(topic,aggregate_id,payload)
 values('human_task.completed',t.id,jsonb_build_object('task_id',t.id,'conversation_id',t.conversation_id,'status',t.status,'resolution',t.resolution));
 return jsonb_build_object('route','owner','accepted',true,'task_id',t.id);
end;
$$;

-- Grant the sender only a scoped media ID, never arbitrary storage access.
create function public.queue_whatsapp_shared_image(p_conversation_id uuid,p_media_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare media public.whatsapp_shared_media; a public.whatsapp_attachments; c public.whatsapp_conversations; m public.whatsapp_messages;
begin
 select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
 if c.id is null or c.consent_status<>'granted' or c.status='closed' or c.automation_paused then raise exception 'Conversación no disponible';end if;
 select * into media from public.whatsapp_shared_media where id=p_media_id and conversation_id=c.id;
 select * into a from public.whatsapp_attachments where id=media.attachment_id;
 if a.id is null or a.storage_bucket<>'whatsapp-media' or a.mime_type not in ('image/jpeg','image/png') or a.size_bytes>5242880 then raise exception 'Imagen no autorizada';end if;
 if nullif(trim(p_key),'') is null then raise exception 'Falta clave de envío';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,4));
 select * into m from public.whatsapp_messages where idempotency_key=p_key;
 if m.id is not null then
   if m.conversation_id<>c.id or m.raw_payload->>'shared_media_id'<>media.id::text then raise exception 'Clave de imagen usada';end if;
   return jsonb_build_object('message_id',m.id,'reused',true);
 end if;
 insert into public.whatsapp_messages(conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key)
 values(c.id,'outbound','assistant','image',media.caption,
   jsonb_build_object('shared_media_id',media.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'mime_type',a.mime_type,'caption',media.caption),
   'queued',p_key) returning * into m;
 return jsonb_build_object('message_id',m.id,'reused',false);
end;
$$;

-- Gateway obtains the authorization from the database, not from incoming model JSON.
alter function public.claim_outbound_whatsapp_message(uuid,uuid) rename to claim_outbound_whatsapp_message_pre_v2;
revoke all on function public.claim_outbound_whatsapp_message_pre_v2(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_outbound_whatsapp_message(p_message_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.whatsapp_messages; result jsonb; allowed boolean;
begin
 select * into m from public.whatsapp_messages where id=p_message_id;
 if m.message_type='image' and m.raw_payload->>'storage_bucket'='whatsapp-media' then
   select exists(select 1 from public.whatsapp_shared_media s join public.whatsapp_attachments a on a.id=s.attachment_id
     where s.id::text=m.raw_payload->>'shared_media_id' and s.conversation_id=m.conversation_id
       and a.storage_path=m.raw_payload->>'storage_path' and a.storage_bucket='whatsapp-media'
       and a.mime_type in ('image/jpeg','image/png') and a.size_bytes<=5242880) into allowed;
   if not allowed then raise exception 'Imagen no autorizada';end if;
 end if;
 result:=public.claim_outbound_whatsapp_message_pre_v2(p_message_id,p_lease_id);
 return result||jsonb_build_object('shared_media_authorized',coalesce(allowed,false));
end;
$$;

revoke all on function public.route_whatsapp_owner_reply(uuid),public.queue_whatsapp_shared_image(uuid,uuid,text),public.claim_outbound_whatsapp_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.route_whatsapp_owner_reply(uuid),public.queue_whatsapp_shared_image(uuid,uuid,text),public.claim_outbound_whatsapp_message(uuid,uuid) to service_role;
