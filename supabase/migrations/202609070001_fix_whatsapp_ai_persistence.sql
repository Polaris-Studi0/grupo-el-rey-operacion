-- Evita actualizar whatsapp_conversations varias veces dentro de un mismo CTE.
-- PostgreSQL no permite que una operacion y una funcion llamada por esa misma
-- operacion modifiquen la misma tupla. La secuencia se ejecuta aqui como pasos
-- PL/pgSQL independientes y conserva la idempotencia del flujo.

create or replace function public.persist_whatsapp_ai_response(
  p_inbound_message_id uuid,
  p_conversation_id uuid,
  p_proposed_output jsonb,
  p_knowledge_refs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_output jsonb;
  conversation public.whatsapp_conversations;
  inbound_message public.whatsapp_messages;
  selected_branch_id text;
  action_name text;
  task_type_name text;
  task_result public.human_tasks;
  queue_result jsonb;
  task_json jsonb;
begin
  if p_inbound_message_id is null or p_conversation_id is null then
    raise exception 'Faltan identificadores para persistir la respuesta';
  end if;

  if p_proposed_output is null or jsonb_typeof(p_proposed_output) <> 'object' then
    raise exception 'La respuesta de IA debe ser un objeto JSON';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 7));

  select * into inbound_message
  from public.whatsapp_messages
  where id = p_inbound_message_id
    and conversation_id = p_conversation_id
    and direction = 'inbound';

  if inbound_message.id is null then
    raise exception 'El mensaje de entrada no pertenece a la conversacion';
  end if;

  select * into conversation
  from public.whatsapp_conversations
  where id = p_conversation_id
  for update;

  if conversation.id is null or conversation.consent_status <> 'granted' or conversation.status = 'closed' then
    raise exception 'La conversacion no permite respuestas automaticas';
  end if;

  insert into public.ai_runs(
    conversation_id,
    message_id,
    purpose,
    run_key,
    prompt_version,
    model,
    input_summary,
    output,
    knowledge_refs,
    succeeded
  )
  values(
    p_conversation_id,
    p_inbound_message_id,
    'response',
    'commercial-response:' || p_inbound_message_id::text,
    'commercial-v1',
    'gpt-5.4-mini',
    left(coalesce(p_proposed_output->>'summary', ''), 1000),
    p_proposed_output,
    coalesce(p_knowledge_refs, '[]'::jsonb),
    true
  )
  on conflict (run_key) do nothing
  returning output into canonical_output;

  if canonical_output is null then
    select output into canonical_output
    from public.ai_runs
    where run_key = 'commercial-response:' || p_inbound_message_id::text;
  end if;

  action_name := coalesce(nullif(canonical_output->>'action', ''), 'reply');

  select id into selected_branch_id
  from public.branches
  where active
    and id = nullif(canonical_output->>'branch_id', '');

  update public.whatsapp_conversations
  set branch_id = coalesce(branch_id, selected_branch_id),
      current_intent = nullif(canonical_output->>'intent', ''),
      summary = nullif(canonical_output->>'summary', ''),
      status = case
        when action_name like 'human_%' then status
        else 'waiting_customer'
      end
  where id = p_conversation_id
  returning * into conversation;

  if nullif(trim(canonical_output->>'customer_name'), '') is not null then
    update public.whatsapp_contacts
    set preferred_name = left(trim(canonical_output->>'customer_name'), 120)
    where id = conversation.contact_id;
  end if;

  task_type_name := case action_name
    when 'human_product_lookup' then 'product_lookup'
    when 'human_delivery_quote' then 'delivery_quote'
    when 'human_payment_verification' then 'payment_verification'
    when 'human_credit_application' then 'credit_application'
    else null
  end;

  if task_type_name is not null
    and conversation.branch_id is not null
    and not exists (
      select 1
      from public.human_tasks pending
      where pending.conversation_id = p_conversation_id
        and pending.status in ('pending', 'in_progress')
        and pending.task_type = task_type_name
    ) then
    task_result := public.create_human_task(
      p_conversation_id,
      'human:' || action_name || ':' || p_inbound_message_id::text,
      task_type_name,
      case when action_name = 'human_payment_verification' then 'high' else 'normal' end,
      coalesce(nullif(canonical_output->>'task_title', ''), 'Atencion requerida en WhatsApp'),
      coalesce(nullif(canonical_output->>'task_question', ''), 'Revisar la conversacion y responder al cliente.'),
      jsonb_build_object(
        'inbound_message_id', p_inbound_message_id,
        'intent', canonical_output->>'intent',
        'summary', canonical_output->>'summary',
        'customer_name', canonical_output->>'customer_name'
      ),
      null,
      null,
      now() + case action_name
        when 'human_product_lookup' then interval '20 minutes'
        when 'human_credit_application' then interval '15 minutes'
        else interval '10 minutes'
      end
    );
    task_json := to_jsonb(task_result);
  end if;

  queue_result := public.queue_outbound_whatsapp_message(
    p_conversation_id,
    'assistant-reply:' || p_inbound_message_id::text,
    'assistant',
    'text',
    canonical_output->>'reply',
    '{}'::jsonb
  );

  return jsonb_build_object(
    'inbound_message_id', p_inbound_message_id,
    'conversation_id', p_conversation_id,
    'ai_output', canonical_output,
    'human_task', task_json,
    'queue_result', queue_result,
    'outbound_message_id', nullif(queue_result->>'message_id', '')
  );
end;
$$;

revoke all on function public.persist_whatsapp_ai_response(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_whatsapp_ai_response(uuid, uuid, jsonb, jsonb) to service_role;

