begin;
create table public.bot_media_assets(
 id uuid primary key default gen_random_uuid(),
 branch_id text references public.branches(id),
 product_id uuid references public.products(id),task_id uuid references public.human_tasks(id),
 kind text not null check(kind in ('product','task','flyer')),
 storage_path text unique not null,
 original_name text not null,mime_type text not null check(mime_type in ('image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 caption text not null check(length(trim(caption)) between 1 and 500),
 active boolean not null default true,created_at timestamptz not null default now(),
 check((kind='product' and product_id is not null and branch_id is not null and task_id is null)
 or (kind='task' and task_id is not null and product_id is null and branch_id is not null)
 or (kind='flyer' and product_id is null and task_id is null and branch_id is null)),
 check(storage_path ~ '^[a-zA-Z0-9/-]+\.(jpg|png)$')
);
alter table public.bot_media_assets enable row level security;
grant select,insert,update on public.bot_media_assets to authenticated;
grant all on public.bot_media_assets to service_role;
create policy bot_media_admin on public.bot_media_assets for all to authenticated using(public.is_admin()) with check(public.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bot-images','bot-images',false,5242880,array['image/jpeg','image/png']);
create policy bot_images_admin_read on storage.objects for select to authenticated using(bucket_id='bot-images' and public.is_admin());
create policy bot_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='bot-images' and public.is_admin());
create policy bot_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='bot-images' and public.is_admin());

create function public.validate_bot_media_asset() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='product' and not exists(select 1 from public.branch_inventory where branch_id=new.branch_id and product_id=new.product_id) then raise exception 'Producto ajeno a la sede'; end if;
 if new.kind='task' and not exists(select 1 from public.human_tasks where id=new.task_id and branch_id=new.branch_id and task_type not in ('payment_verification','credit_application')) then raise exception 'Pendiente no válido para fotografías de producto'; end if;
 if tg_op='UPDATE' and (new.storage_path,new.kind,new.branch_id,new.task_id,new.product_id) is distinct from (old.storage_path,old.kind,old.branch_id,old.task_id,old.product_id) then raise exception 'La imagen no puede cambiar de origen'; end if;
 return new;
end; $$;
create trigger validate_bot_media before insert or update on public.bot_media_assets for each row execute function public.validate_bot_media_asset();

create function public.bot_image_allowed(p_asset uuid,p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bot_media_assets a join public.whatsapp_conversations c on c.id=p_conversation and c.branch_id=a.branch_id
 where a.id=p_asset and a.active and (
 a.kind='product' and exists(select 1 from public.branch_inventory i join public.products p on p.id=i.product_id where i.branch_id=c.branch_id and i.product_id=a.product_id and i.active and p.active)
 or a.kind='task' and exists(select 1 from public.human_tasks t where t.id=a.task_id and t.conversation_id=c.id and t.branch_id=c.branch_id and t.status='resolved')
 ));
$$;
revoke all on function public.bot_image_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bot_image_allowed(uuid,uuid) to service_role;

-- Canonical image references only: no arbitrary URL or private receipt path.
create function public.queue_bot_images(p_conversation uuid,p_inbound uuid,p_control integer,p_asset_ids jsonb,p_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_conversations;a public.bot_media_assets;result jsonb:='[]';q jsonb;asset text;
begin
 select * into c from public.whatsapp_conversations where id=p_conversation for update;
 if c.id is null or c.status='closed' or c.automation_paused or c.consent_status<>'granted' or c.automation_control_version<>p_control
 or p_inbound is distinct from (select id from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1)
 or not exists(select 1 from public.whatsapp_messages where id=p_inbound and created_at>now()-interval '23 hours') then return result; end if;
 if jsonb_typeof(p_asset_ids)<>'array' or jsonb_array_length(p_asset_ids)>2 then raise exception 'Máximo dos imágenes por respuesta'; end if;
 for asset in select distinct jsonb_array_elements_text(p_asset_ids) loop
  if not public.bot_image_allowed(asset::uuid,c.id) then raise exception 'Imagen no autorizada para esta conversación'; end if;
  select * into a from public.bot_media_assets where id=asset::uuid;
  q:=public.queue_outbound_whatsapp_message(c.id,p_key||':image:'||a.id,'assistant','image',a.caption,
   jsonb_build_object('bot_asset_id',a.id,'storage_bucket','bot-images','storage_path',a.storage_path,'mime_type',a.mime_type,'caption',a.caption,'control_version',p_control,'inbound_message_id',p_inbound));
  result:=result||jsonb_build_array(q->>'message_id');
 end loop;
 return result;
end; $$;
revoke all on function public.queue_bot_images(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.queue_bot_images(uuid,uuid,integer,jsonb,text) to service_role;

-- Extend the existing immutable snapshot without additional network reads.
alter function public.bot_context_snapshot(uuid) rename to bot_context_snapshot_before_images;
revoke all on function public.bot_context_snapshot_before_images(uuid) from public,anon,authenticated,service_role;
create function public.bot_context_snapshot(p_conversation_id uuid) returns table(snapshot jsonb) language sql stable security definer set search_path='' as $$
 select s.snapshot||jsonb_build_object('productImages',coalesce((select jsonb_agg(t) from (
 select a.id,a.product_id,a.task_id,a.caption from public.bot_media_assets a
 where a.active and public.bot_image_allowed(a.id,p_conversation_id) order by a.created_at desc limit 100) t),'[]'::jsonb))
 from public.bot_context_snapshot_before_images(p_conversation_id) s;
$$;
revoke all on function public.bot_context_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.bot_context_snapshot(uuid) to service_role;

-- Append media before writing the immutable AI audit result. Retries reuse that result.
do $migration$
declare definition text;needle text:=' result:=jsonb_build_object(''ok'',true,''message_ids'',message_ids';
begin
 select pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Commerce function shape changed'; end if;
 definition:=replace(definition,needle,$patch$
 if p_task_id is null and jsonb_array_length(coalesce(p_decision->'media_ids','[]'))>0 then
  message_ids:=message_ids||public.queue_bot_images(c.id,m.id,p_control_version,p_decision->'media_ids',v_run_key);
 elsif p_task_id is not null then
  message_ids:=message_ids||public.queue_bot_images(c.id,m.id,p_control_version,coalesce((select jsonb_agg(t.id) from
   (select a.id from public.bot_media_assets a where a.task_id=p_task_id and a.active and public.bot_image_allowed(a.id,c.id) order by a.created_at limit 2) t),'[]'),v_run_key);
 end if;
 result:=jsonb_build_object('ok',true,'message_ids',message_ids$patch$);
 execute definition;
end;
$migration$;

-- Keep outbound idempotency checks stable after Meta delivery metadata is appended.

create or replace function public.queue_outbound_whatsapp_message(
  p_conversation_id uuid,p_idempotency_key text,p_sender_type text,p_message_type text,p_body text,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; existing public.whatsapp_messages; target public.whatsapp_messages;
begin
  if nullif(trim(p_idempotency_key),'') is null
     or p_sender_type not in ('assistant','human','system')
     or p_message_type not in ('text','template','image') then
    raise exception 'Mensaje saliente inválido';
  end if;
  if p_message_type='text' and nullif(trim(p_body),'') is null then raise exception 'El mensaje de texto está vacío'; end if;
  if p_message_type='template' and (p_payload is null or not (p_payload ? 'template')) then raise exception 'Falta la plantilla del mensaje'; end if;
  if p_message_type='image' and (
    p_payload is null or p_payload->>'storage_bucket' not in ('payment-qrs','bot-images') or nullif(trim(p_payload->>'storage_path'),'') is null
  ) then raise exception 'Falta el archivo de imagen'; end if;

  if p_message_type='image' and p_payload->>'storage_bucket'='bot-images' and not exists(select 1 from public.bot_media_assets a where a.id::text=p_payload->>'bot_asset_id' and a.storage_path=p_payload->>'storage_path' and public.bot_image_allowed(a.id,p_conversation_id)) then raise exception 'Imagen fuera de la conversación'; end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key),4));
  select * into existing from public.whatsapp_messages where idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id
       or existing.sender_type is distinct from p_sender_type
       or existing.message_type is distinct from p_message_type
       or existing.body is distinct from nullif(p_body,'')
       or (coalesce(existing.raw_payload,'{}'::jsonb) - 'send_response' - 'send_error')
          is distinct from (coalesce(p_payload,'{}'::jsonb) - 'send_response' - 'send_error') then
      raise exception 'La clave ya pertenece a otro mensaje';
    end if;
    return jsonb_build_object('created',false,'message_id',existing.id,'delivery_status',existing.delivery_status,'meta_message_id',existing.meta_message_id);
  end if;

  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.status='closed' then raise exception 'La conversación no permite enviar mensajes'; end if;
  if conversation.consent_status<>'granted' and not (p_sender_type='system' and trim(p_idempotency_key) like 'privacy-notice:%') then
    raise exception 'No se puede responder antes de obtener autorización';
  end if;

  insert into public.whatsapp_messages(conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key)
  values(conversation.id,'outbound',p_sender_type,p_message_type,nullif(p_body,''),coalesce(p_payload,'{}'::jsonb),'queued',trim(p_idempotency_key))
  returning * into target;
  update public.whatsapp_conversations set last_message_at=now() where id=conversation.id;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
  values(conversation.id,'message','queued',jsonb_build_object('message_id',target.id,'message_type',target.message_type),
    case when p_sender_type='human' then 'human' when p_sender_type='system' then 'system' else 'assistant' end,
    'outbound-queued:'||target.id::text)
  on conflict(source_key) do nothing;
  return jsonb_build_object('created',true,'message_id',target.id,'delivery_status',target.delivery_status);
end;
$$;

revoke all on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.claim_outbound_whatsapp_message(p_message_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.whatsapp_messages; c public.whatsapp_conversations; recipient text;
begin
  if p_lease_id is null then raise exception 'Lease de envío inválido'; end if;
  select wc.* into c from public.whatsapp_conversations wc join public.whatsapp_messages m on m.conversation_id=wc.id
    where m.id=p_message_id for update of wc;
  select * into target from public.whatsapp_messages where id=p_message_id for update;
  if target.id is null then raise exception 'Mensaje saliente no encontrado'; end if;
  if target.direction<>'outbound' then raise exception 'El mensaje no es saliente'; end if;
  if target.meta_message_id is not null then return jsonb_build_object('send',false,'state','sent','message_id',target.id,'meta_message_id',target.meta_message_id); end if;
  if target.send_started_at is not null then return jsonb_build_object('send',false,'state','blocked_uncertain','message_id',target.id,'reason',target.failure_reason); end if;
  if target.delivery_status<>'queued' then return jsonb_build_object('send',false,'state',target.delivery_status,'message_id',target.id,'reason',target.failure_reason); end if;
  if c.status='closed' or (c.automation_paused and target.sender_type<>'human') then
    update public.whatsapp_messages set delivery_status='failed',failed_at=now(),failure_reason='conversation_unavailable' where id=target.id;
    return jsonb_build_object('send',false,'state','blocked','message_id',target.id,'reason','conversation_unavailable');
  end if;
  if target.raw_payload->>'commerce'='true' and (
    c.consent_status<>'granted' or c.consented_at is null or c.consent_version is null
    or target.raw_payload->>'control_version' is distinct from c.automation_control_version::text
    or target.raw_payload->>'inbound_message_id' is distinct from (select id::text from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1)
    or not exists(select 1 from public.whatsapp_messages where id::text=target.raw_payload->>'inbound_message_id' and created_at>now()-interval '23 hours')
    or (target.message_type='image' and (
      target.raw_payload->>'quote_id' is distinct from c.sales_state#>>'{pilot_commerce,accepted_quote_id}'
      or coalesce((c.sales_state#>>'{pilot_commerce,reservation_until}')::timestamptz,now())<=now()
      or not exists(select 1 from public.branch_payment_qrs where branch_id=c.branch_id and active and storage_path=target.raw_payload->>'storage_path')
    ))
  ) then
    update public.whatsapp_messages set delivery_status='failed',failed_at=now(),failure_reason='commerce_context_changed' where id=target.id;
    return jsonb_build_object('send',false,'state','blocked','message_id',target.id,'reason','commerce_context_changed');
  end if;
  if target.raw_payload ? 'bot_asset_id' and (
    not public.bot_image_allowed((target.raw_payload->>'bot_asset_id')::uuid,c.id)
    or c.consent_status<>'granted' or c.automation_control_version::text is distinct from target.raw_payload->>'control_version'
    or target.raw_payload->>'inbound_message_id' is distinct from (select id::text from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1)
    or not exists(select 1 from public.whatsapp_messages where id::text=target.raw_payload->>'inbound_message_id' and created_at>now()-interval '23 hours')
  ) then return jsonb_build_object('send',false,'state','blocked','reason','image_context_changed'); end if;
  select coalesce(nullif(ltrim(phone_e164,'+'),''),nullif(trim(whatsapp_id),'')) into recipient
    from public.whatsapp_contacts where id=c.contact_id;
  if recipient is null then raise exception 'El contacto no tiene un destinatario de WhatsApp'; end if;
  update public.whatsapp_messages set send_started_at=now(),send_lease_id=p_lease_id,send_attempts=send_attempts+1 where id=target.id returning * into target;
  return jsonb_build_object('send',true,'state','claimed','message_id',target.id,'to',recipient,'type',target.message_type,
    'text',target.body,'template',target.raw_payload->'template','storage_bucket',target.raw_payload->>'storage_bucket',
    'storage_path',target.raw_payload->>'storage_path','mime_type',target.raw_payload->>'mime_type','caption',target.raw_payload->>'caption');
end;
$$;
revoke all on function public.claim_outbound_whatsapp_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_outbound_whatsapp_message(uuid,uuid) to service_role;

commit;
