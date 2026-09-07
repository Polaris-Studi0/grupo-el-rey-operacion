-- Corrige la conciliación de teléfono + BSUID y separa las alertas internas
-- de la conversación comercial del administrador cuando usa el mismo número.

create or replace function public.ingest_whatsapp_message(
  p_phone_e164 text,p_whatsapp_id text,p_display_name text,p_meta_message_id text,p_message_type text,
  p_body text,p_media_id text,p_raw_payload jsonb,p_source text default 'whatsapp',p_branch_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  contact public.whatsapp_contacts;
  contact_by_phone public.whatsapp_contacts;
  contact_by_id public.whatsapp_contacts;
  conversation public.whatsapp_conversations;
  message public.whatsapp_messages;
  created_message boolean := false;
  normalized_phone text := nullif(trim(p_phone_e164), '');
  normalized_id text := nullif(trim(p_whatsapp_id), '');
begin
  if normalized_phone is not null and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then normalized_phone := null; end if;
  if normalized_id is null or nullif(trim(p_meta_message_id),'') is null then
    raise exception 'Mensaje de WhatsApp inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(normalized_id, normalized_phone),0));

  select * into message from public.whatsapp_messages where meta_message_id=p_meta_message_id;
  if message.id is not null then
    select * into conversation from public.whatsapp_conversations where id=message.conversation_id;
    select * into contact from public.whatsapp_contacts where id=conversation.contact_id;
    return jsonb_build_object(
      'created',false,'contact_id',contact.id,'conversation_id',conversation.id,'message_id',message.id,
      'consent_status',conversation.consent_status,'branch_id',conversation.branch_id,
      'phone_e164',contact.phone_e164,'whatsapp_id',contact.whatsapp_id,
      'recipient_id',coalesce(replace(contact.phone_e164,'+',''),contact.whatsapp_id),
      'body',message.body,'message_type',message.message_type,'media_id',message.media_id
    );
  end if;

  if normalized_phone is not null then
    select * into contact_by_phone from public.whatsapp_contacts where phone_e164=normalized_phone for update;
  end if;
  select * into contact_by_id from public.whatsapp_contacts where whatsapp_id=normalized_id for update;

  if contact_by_phone.id is not null and contact_by_id.id is not null and contact_by_phone.id <> contact_by_id.id then
    raise exception 'El teléfono y el identificador de WhatsApp pertenecen a contactos diferentes';
  end if;

  if contact_by_id.id is not null then
    contact := contact_by_id;
  elsif contact_by_phone.id is not null then
    contact := contact_by_phone;
  else
    contact := null;
  end if;

  if contact.id is null then
    insert into public.whatsapp_contacts(phone_e164,whatsapp_id,display_name,first_source,last_seen_at,metadata)
    values(
      normalized_phone,normalized_id,nullif(trim(p_display_name),''),coalesce(nullif(trim(p_source),''),'whatsapp'),now(),
      jsonb_build_object('username', p_raw_payload#>>'{contact,profile,username}')
    ) returning * into contact;
  else
    update public.whatsapp_contacts
    set phone_e164=coalesce(phone_e164,normalized_phone),
        whatsapp_id=normalized_id,
        display_name=coalesce(nullif(trim(p_display_name),''),display_name),
        last_seen_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('username',p_raw_payload#>>'{contact,profile,username}'))
    where id=contact.id returning * into contact;
  end if;

  select * into conversation from public.whatsapp_conversations
  where contact_id=contact.id
    and status in ('open','waiting_customer','waiting_human')
    and source<>'internal_admin'
  order by created_at desc limit 1 for update;

  if conversation.id is null then
    insert into public.whatsapp_conversations(contact_id,branch_id,source,status,consent_status)
    values(contact.id,p_branch_id,coalesce(nullif(trim(p_source),''),'whatsapp'),'open','pending') returning * into conversation;
  elsif conversation.branch_id is null and p_branch_id is not null then
    update public.whatsapp_conversations set branch_id=p_branch_id where id=conversation.id returning * into conversation;
  end if;

  insert into public.whatsapp_messages(conversation_id,meta_message_id,direction,sender_type,message_type,body,media_id,raw_payload,delivery_status)
  values(conversation.id,p_meta_message_id,'inbound','customer',coalesce(nullif(trim(p_message_type),''),'text'),nullif(p_body,''),nullif(p_media_id,''),coalesce(p_raw_payload,'{}'::jsonb),'received')
  on conflict(meta_message_id) do nothing returning * into message;

  if message.id is not null then
    created_message := true;
    update public.whatsapp_conversations
    set last_message_at=now(),status=case when status='waiting_customer' then 'open' else status end
    where id=conversation.id returning * into conversation;
    insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
    values(conversation.id,'message','received',jsonb_build_object('message_id',message.id,'meta_message_id',p_meta_message_id,'message_type',message.message_type),'customer','message:'||p_meta_message_id)
    on conflict(source_key) do nothing;
  else
    select * into message from public.whatsapp_messages where meta_message_id=p_meta_message_id;
    select * into conversation from public.whatsapp_conversations where id=message.conversation_id;
    select * into contact from public.whatsapp_contacts where id=conversation.contact_id;
  end if;

  return jsonb_build_object(
    'created',created_message,'contact_id',contact.id,'conversation_id',conversation.id,'message_id',message.id,
    'consent_status',conversation.consent_status,'branch_id',conversation.branch_id,
    'phone_e164',contact.phone_e164,'whatsapp_id',contact.whatsapp_id,
    'recipient_id',coalesce(replace(contact.phone_e164,'+',''),contact.whatsapp_id),
    'body',message.body,'message_type',message.message_type,'media_id',message.media_id
  );
end;
$$;

revoke all on function public.ingest_whatsapp_message(text,text,text,text,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ingest_whatsapp_message(text,text,text,text,text,text,text,jsonb,text,text) to service_role;

do $$
declare
  current_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.prepare_whatsapp_automation_message(uuid,uuid,text)'::regprocedure)
  into current_definition;
  patched_definition := replace(
    current_definition,
    'where contact_id=admin_contact.id and status<>''closed'' order by created_at desc limit 1 for update;',
    'where contact_id=admin_contact.id and status<>''closed'' and source=''internal_admin'' order by created_at desc limit 1 for update;'
  );
  if patched_definition=current_definition then
    raise exception 'No se encontró la consulta de conversación administrativa que debía corregirse';
  end if;
  execute patched_definition;
end;
$$;
