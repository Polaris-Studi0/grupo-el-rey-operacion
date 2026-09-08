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
    p_payload is null or p_payload->>'storage_bucket'<>'payment-qrs' or nullif(trim(p_payload->>'storage_path'),'') is null
  ) then raise exception 'Falta el archivo de imagen'; end if;

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
