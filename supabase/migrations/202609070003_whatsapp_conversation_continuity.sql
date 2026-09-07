-- Reduce ejecuciones innecesarias, reanuda la venta tras una respuesta humana
-- y admite los identificadores privados (BSUID) que Meta entrega sin teléfono.

alter table public.whatsapp_contacts alter column phone_e164 drop not null;

alter table public.whatsapp_contacts
  add constraint whatsapp_contacts_identity_required check (
    phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
    or nullif(trim(whatsapp_id), '') is not null
  );

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
  contact := coalesce(contact_by_id, contact_by_phone);

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
  where contact_id=contact.id and status in ('open','waiting_customer','waiting_human')
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
  update public.whatsapp_messages set send_started_at=now(),send_lease_id=p_lease_id,send_attempts=send_attempts+1 where id=target.id returning * into target;
  return jsonb_build_object('send',true,'state','claimed','message_id',target.id,'to',recipient,'type',target.message_type,'text',target.body,'template',target.raw_payload->'template');
end;
$$;

create or replace function public.prepare_whatsapp_automation_message(
  p_outbox_id uuid,
  p_lease_id uuid,
  p_admin_phone text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event public.automation_outbox;
  task public.human_tasks;
  customer_conversation public.whatsapp_conversations;
  customer public.whatsapp_contacts;
  admin_contact public.whatsapp_contacts;
  admin_conversation public.whatsapp_conversations;
  branch_name text;
  answer text;
  body text;
  queued jsonb;
  resume_message public.whatsapp_messages;
begin
  select * into event from public.automation_outbox
  where id=p_outbox_id and lease_id=p_lease_id and status='processing' for update;
  if event.id is null then raise exception 'Evento de automatización no reclamado'; end if;

  select * into task from public.human_tasks where id=event.aggregate_id;
  if task.id is null then raise exception 'Pendiente humano no encontrado'; end if;
  select * into customer_conversation from public.whatsapp_conversations where id=task.conversation_id for update;
  select * into customer from public.whatsapp_contacts where id=customer_conversation.contact_id;
  select name into branch_name from public.branches where id=task.branch_id;

  if event.topic='human_task.created' then
    if p_admin_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Número interno de WhatsApp inválido'; end if;
    insert into public.whatsapp_contacts(phone_e164,display_name,preferred_name,first_source,metadata)
    values(p_admin_phone,'Administrador El Rey','Administrador','internal_admin','{"role":"admin_recipient"}'::jsonb)
    on conflict(phone_e164) do update set metadata=coalesce(public.whatsapp_contacts.metadata,'{}'::jsonb)||'{"role":"admin_recipient"}'::jsonb
    returning * into admin_contact;
    select * into admin_conversation from public.whatsapp_conversations
    where contact_id=admin_contact.id and status<>'closed' order by created_at desc limit 1 for update;
    if admin_conversation.id is null then
      insert into public.whatsapp_conversations(contact_id,status,consent_status,consent_version,consented_at,source)
      values(admin_contact.id,'open','granted','internal-operator-v1',now(),'internal_admin') returning * into admin_conversation;
    end if;
    body := '🔔 Solicitud interna de WhatsApp'||E'\n'||
      'Sede: '||coalesce(branch_name,'Sin sede')||E'\n'||
      'Cliente: '||coalesce(nullif(customer.preferred_name,''),nullif(customer.display_name,''),customer.phone_e164,customer.whatsapp_id)||E'\n'||
      'Consulta: '||task.question||E'\n'||'Respóndela desde el panel de Operación.';
    queued := public.queue_outbound_whatsapp_message(admin_conversation.id,'admin-human-task:'||task.id::text,'system','text',body,
      jsonb_build_object('human_task_id',task.id,'internal_notification',true));
    return jsonb_build_object('action','send','outbox_id',event.id,'lease_id',event.lease_id,'topic',event.topic,
      'message_id',queued->>'message_id','queue_result',queued);
  elsif event.topic='human_task.completed' then
    answer := coalesce(nullif(trim(task.resolution->>'answer'),''),'La consulta fue revisada por nuestro equipo.');
    body := 'CONFIRMACIÓN INTERNA VERIFICADA'||E'\n'||
      'Tipo: '||task.task_type||E'\n'||
      'Sede: '||coalesce(branch_name,'seleccionada')||E'\n'||
      'Pregunta original: '||task.question||E'\n'||
      'Respuesta del responsable: '||answer||E'\n'||
      'Usa esta información con el historial del pedido y continúa con el siguiente paso lógico de la venta.';

    select * into resume_message from public.whatsapp_messages
    where idempotency_key='human-task-resume:'||task.id::text;
    if resume_message.id is null then
      insert into public.whatsapp_messages(
        conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key
      ) values(
        customer_conversation.id,'inbound','human','text',body,
        jsonb_build_object('operator_confirmation',true,'human_task_id',task.id,'task_type',task.task_type,
          'question',task.question,'answer',answer,'resolution',task.resolution),
        'received','human-task-resume:'||task.id::text
      ) returning * into resume_message;
    end if;

    update public.whatsapp_conversations set status='open',last_message_at=now()
    where id=customer_conversation.id and status<>'closed';
    insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
    values(customer_conversation.id,'human_task','resumed_by_operator',jsonb_build_object('task_id',task.id,'message_id',resume_message.id),'human','human-task-resume:'||task.id::text)
    on conflict(source_key) do nothing;
    return jsonb_build_object('action','resume_ai','outbox_id',event.id,'lease_id',event.lease_id,'topic',event.topic,
      'inbound_message_id',resume_message.id,'conversation_id',customer_conversation.id,'ready_for_next_step',true);
  end if;
  raise exception 'Tipo de evento de automatización no compatible: %',event.topic;
end;
$$;

revoke all on function public.prepare_whatsapp_automation_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_automation_message(uuid,uuid,text) to service_role;
