-- Convierte eventos de pendientes humanos en mensajes de WhatsApp listos para enviar.

create or replace function public.prepare_whatsapp_automation_message(
  p_outbox_id uuid,
  p_lease_id uuid,
  p_admin_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
begin
  select * into event
  from public.automation_outbox
  where id = p_outbox_id and lease_id = p_lease_id and status = 'processing'
  for update;

  if event.id is null then
    raise exception 'Evento de automatización no reclamado';
  end if;

  select * into task from public.human_tasks where id = event.aggregate_id;
  if task.id is null then raise exception 'Pendiente humano no encontrado'; end if;

  select * into customer_conversation
  from public.whatsapp_conversations where id = task.conversation_id;
  select * into customer from public.whatsapp_contacts where id = customer_conversation.contact_id;
  select name into branch_name from public.branches where id = task.branch_id;

  if event.topic = 'human_task.created' then
    if p_admin_phone !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Número interno de WhatsApp inválido';
    end if;

    insert into public.whatsapp_contacts(phone_e164, display_name, preferred_name, first_source, metadata)
    values(p_admin_phone, 'Administrador El Rey', 'Administrador', 'internal_admin', '{"role":"admin_recipient"}'::jsonb)
    on conflict(phone_e164) do update
      set metadata = coalesce(public.whatsapp_contacts.metadata, '{}'::jsonb) || '{"role":"admin_recipient"}'::jsonb
    returning * into admin_contact;

    select * into admin_conversation
    from public.whatsapp_conversations
    where contact_id = admin_contact.id and status <> 'closed'
    order by created_at desc limit 1 for update;

    if admin_conversation.id is null then
      insert into public.whatsapp_conversations(
        contact_id, status, consent_status, consent_version, consented_at, source
      ) values(
        admin_contact.id, 'open', 'granted', 'internal-operator-v1', now(), 'internal_admin'
      ) returning * into admin_conversation;
    end if;

    body := '🔔 Solicitud interna de WhatsApp' || E'\n' ||
      'Sede: ' || coalesce(branch_name, 'Sin sede') || E'\n' ||
      'Cliente: ' || coalesce(nullif(customer.preferred_name, ''), nullif(customer.display_name, ''), customer.phone_e164) || E'\n' ||
      'Consulta: ' || task.question || E'\n' ||
      'Respóndela desde el panel de Operación.';

    queued := public.queue_outbound_whatsapp_message(
      admin_conversation.id,
      'admin-human-task:' || task.id::text,
      'system', 'text', body,
      jsonb_build_object('human_task_id', task.id, 'internal_notification', true)
    );
  elsif event.topic = 'human_task.completed' then
    answer := nullif(trim(task.resolution->>'answer'), '');
    if answer is null then answer := 'la consulta ya fue revisada por nuestro equipo.'; end if;

    body := case when task.status = 'resolved'
      then '¡Listo! Desde la sede ' || coalesce(branch_name, 'seleccionada') || ' nos confirman: ' || answer
      else 'Ya revisamos tu consulta con la sede ' || coalesce(branch_name, 'seleccionada') || ': ' || answer
    end;

    queued := public.queue_outbound_whatsapp_message(
      customer_conversation.id,
      'human-task-response:' || task.id::text,
      'assistant', 'text', body,
      jsonb_build_object('human_task_id', task.id)
    );

    update public.whatsapp_conversations
    set status = 'waiting_customer'
    where id = customer_conversation.id and status <> 'closed';
  else
    raise exception 'Tipo de evento de automatización no compatible: %', event.topic;
  end if;

  return jsonb_build_object(
    'outbox_id', event.id,
    'lease_id', event.lease_id,
    'topic', event.topic,
    'message_id', queued->>'message_id',
    'queue_result', queued
  );
end;
$$;

revoke all on function public.prepare_whatsapp_automation_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_whatsapp_automation_message(uuid, uuid, text) to service_role;
