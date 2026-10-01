begin;
create function public.next_public_bot_task(p_owner_phone text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'status',t.status)
 from public.human_tasks t join public.whatsapp_conversations c on c.id=t.conversation_id
 join public.automation_outbox o on o.aggregate_id=t.id
 where t.context->>'pilot_engine'='new-whatsapp-v1' and c.status<>'closed' and not c.automation_paused
 and c.consent_status='granted' and t.branch_id=c.branch_id
 and exists(select 1 from public.whatsapp_messages m where m.conversation_id=c.id and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours')
 and o.attempts<10 and ((o.status in ('pending','failed') and o.next_attempt_at<=now()) or (o.status='processing' and o.processing_started_at<now()-interval '2 minutes'))
 and ((t.status in ('resolved','rejected') and t.automation_resumed_at is null and o.topic='human_task.completed')
 or(t.status in ('pending','in_progress') and t.admin_notified_at is null and o.topic='human_task.created'
 and exists(select 1 from public.whatsapp_messages m join public.whatsapp_conversations oc on oc.id=m.conversation_id join public.whatsapp_contacts ct on ct.id=oc.contact_id
 where ct.phone_e164=p_owner_phone and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours')))
 order by case when t.status in ('resolved','rejected') then 0 else 1 end,o.next_attempt_at,o.created_at limit 1;
$$;
revoke all on function public.next_public_bot_task(text) from public,anon,authenticated;
grant execute on function public.next_public_bot_task(text) to service_role;

create table public.whatsapp_demo_sends(
 id uuid primary key,actor_id uuid not null references auth.users(id),phone_e164 text not null,
 asset_id uuid not null references public.bot_media_assets(id),
 status text not null check(status in ('sending','sent','delivered','read','failed','uncertain')),
 meta_message_id text unique,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.whatsapp_demo_sends enable row level security;
grant select on public.whatsapp_demo_sends to authenticated;
grant all on public.whatsapp_demo_sends to service_role;
create policy demo_admin_read on public.whatsapp_demo_sends for select to authenticated using(public.is_admin());
create function public.claim_whatsapp_demo(p_actor uuid,p_id uuid,p_phone text,p_asset uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.whatsapp_demo_sends;a public.bot_media_assets;
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and role='admin') then raise exception 'Solo administradores'; end if;
 if p_id is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Número o solicitud inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,6));
 select * into r from public.whatsapp_demo_sends where id=p_id;
 if r.id is not null then
  if (r.actor_id,r.phone_e164,r.asset_id) is distinct from (p_actor,p_phone,p_asset) then raise exception 'La solicitud pertenece a otro envío'; end if;
  return jsonb_build_object('send',false,'result',to_jsonb(r));
 end if;
 if exists(select 1 from public.whatsapp_marketing_permissions where phone_e164=p_phone and status='revoked') then return jsonb_build_object('error','Este número solicitó no recibir publicidad'); end if;
 if not exists(select 1 from public.whatsapp_contacts ct join public.whatsapp_conversations c on c.contact_id=ct.id join public.whatsapp_messages m on m.conversation_id=c.id
 where ct.phone_e164=p_phone and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '24 hours') then
 return jsonb_build_object('error','Para el demo, escribe primero desde ese número al WhatsApp de El Rey y vuelve a enviar'); end if;
 select * into a from public.bot_media_assets where id=p_asset and active and kind='flyer';
 if a.id is null then return jsonb_build_object('error','Selecciona una imagen de demostración válida'); end if;
 insert into public.whatsapp_demo_sends(id,actor_id,phone_e164,asset_id,status) values(p_id,p_actor,p_phone,p_asset,'sending') returning * into r;
 return jsonb_build_object('send',true,'result',to_jsonb(r),'asset',to_jsonb(a));
end; $$;
revoke all on function public.claim_whatsapp_demo(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_demo(uuid,uuid,text,uuid) to service_role;
alter function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) rename to record_whatsapp_message_status_before_demo;
revoke all on function public.record_whatsapp_message_status_before_demo(text,text,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
create function public.record_whatsapp_message_status(p_meta_message_id text,p_status text,p_timestamp timestamptz,p_raw_payload jsonb,p_status_event_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.whatsapp_demo_sends;
begin
 select * into r from public.whatsapp_demo_sends where meta_message_id=p_meta_message_id for update;
 if r.id is null then return public.record_whatsapp_message_status_before_demo(p_meta_message_id,p_status,p_timestamp,p_raw_payload,p_status_event_key); end if;
 if p_status not in ('sent','delivered','read','failed') then raise exception 'Estado inválido'; end if;
 if (p_status='read' or p_status='delivered' and r.status<>'read' or p_status='failed' and r.status not in ('delivered','read')) then
 update public.whatsapp_demo_sends set status=p_status,error=case when p_status='failed' then 'WhatsApp no pudo entregar la imagen' else null end,updated_at=now() where id=r.id;
 end if;
 return jsonb_build_object('updated',true,'demo_id',r.id,'status',p_status);
end; $$;
revoke all on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) to service_role;
-- Public customers and the owner have independent WhatsApp reply windows.
alter function public.prepare_whatsapp_order_notification(uuid,text) rename to prepare_whatsapp_order_notification_before_public;
revoke all on function public.prepare_whatsapp_order_notification_before_public(uuid,text) from public,anon,authenticated,service_role;
create function public.prepare_whatsapp_order_notification(p_receipt_id uuid,p_admin_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.whatsapp_messages m join public.whatsapp_conversations c on c.id=m.conversation_id join public.whatsapp_contacts ct on ct.id=c.contact_id
 where ct.phone_e164=p_admin_phone and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours') then return null; end if;
 return public.prepare_whatsapp_order_notification_before_public(p_receipt_id,p_admin_phone);
end; $$;
revoke all on function public.prepare_whatsapp_order_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_order_notification(uuid,text) to service_role;
commit;
