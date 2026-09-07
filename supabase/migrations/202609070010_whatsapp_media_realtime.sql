-- Envío del QR por WhatsApp, archivos recibidos visibles y actualización en vivo del panel.

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
    p_payload is null or p_payload->>'storage_bucket'<>'payment-qrs' or nullif(trim(p_payload->>'storage_path'),'') is null
  ) then raise exception 'Falta el archivo de imagen'; end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key),4));
  select * into existing from public.whatsapp_messages where idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id
       or existing.sender_type is distinct from p_sender_type
       or existing.message_type is distinct from p_message_type
       or existing.body is distinct from nullif(p_body,'')
       or existing.raw_payload is distinct from coalesce(p_payload,'{}'::jsonb) then
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

create or replace function public.claim_outbound_whatsapp_message(p_message_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.whatsapp_messages; recipient text;
begin
  if p_lease_id is null then raise exception 'Lease de envío inválido'; end if;
  select m.* into target from public.whatsapp_messages m where m.id=p_message_id for update;
  if target.id is null then raise exception 'Mensaje saliente no encontrado'; end if;
  select coalesce(nullif(ltrim(wc.phone_e164,'+'),''),nullif(trim(wc.whatsapp_id),'')) into recipient
  from public.whatsapp_conversations c join public.whatsapp_contacts wc on wc.id=c.contact_id
  where c.id=target.conversation_id;
  if recipient is null then raise exception 'El contacto no tiene un destinatario de WhatsApp'; end if;
  if target.direction<>'outbound' then raise exception 'El mensaje no es saliente'; end if;
  if target.meta_message_id is not null then return jsonb_build_object('send',false,'state','sent','message_id',target.id,'meta_message_id',target.meta_message_id); end if;
  if target.send_started_at is not null then return jsonb_build_object('send',false,'state','blocked_uncertain','message_id',target.id,'reason',target.failure_reason); end if;
  if target.delivery_status<>'queued' then return jsonb_build_object('send',false,'state',target.delivery_status,'message_id',target.id,'reason',target.failure_reason); end if;
  update public.whatsapp_messages set send_started_at=now(),send_lease_id=p_lease_id,send_attempts=send_attempts+1
  where id=target.id returning * into target;
  return jsonb_build_object(
    'send',true,'state','claimed','message_id',target.id,'to',recipient,'type',target.message_type,
    'text',target.body,'template',target.raw_payload->'template',
    'storage_bucket',target.raw_payload->>'storage_bucket','storage_path',target.raw_payload->>'storage_path',
    'mime_type',target.raw_payload->>'mime_type','caption',target.raw_payload->>'caption'
  );
end;
$$;

create or replace function public.prepare_branch_payment_qr(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; qr public.branch_payment_qrs%rowtype; queued jsonb;
begin
  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.consent_status<>'granted' or conversation.status='closed' then
    return jsonb_build_object('created',false,'reason','conversation_unavailable');
  end if;
  if lower(coalesce(conversation.sales_state->>'payment_method',''))<>'transfer' then
    return jsonb_build_object('created',false,'reason','not_transfer');
  end if;
  if conversation.branch_id is null then return jsonb_build_object('created',false,'reason','branch_missing'); end if;
  select * into qr from public.branch_payment_qrs where branch_id=conversation.branch_id and active;
  if qr.branch_id is null then return jsonb_build_object('created',false,'reason','qr_missing'); end if;

  queued:=public.queue_outbound_whatsapp_message(
    conversation.id,'payment-qr:'||conversation.id::text||':'||md5(qr.storage_path),'assistant','image',
    'Código QR para pagar tu pedido en '||(select name from public.branches where id=conversation.branch_id)||'.',
    jsonb_build_object('storage_bucket','payment-qrs','storage_path',qr.storage_path,'mime_type',qr.mime_type,
      'caption','Escanea este código QR para realizar la transferencia. Cuando termines, envíame el comprobante por este chat.')
  );
  return queued;
end;
$$;

revoke all on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_outbound_whatsapp_message(uuid,uuid) from public,anon,authenticated;
revoke all on function public.prepare_branch_payment_qr(uuid) from public,anon,authenticated;
grant execute on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.claim_outbound_whatsapp_message(uuid,uuid) to service_role;
grant execute on function public.prepare_branch_payment_qr(uuid) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_contacts','whatsapp_conversations','whatsapp_messages','whatsapp_attachments','human_tasks','branch_payment_qrs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end;
$$;
