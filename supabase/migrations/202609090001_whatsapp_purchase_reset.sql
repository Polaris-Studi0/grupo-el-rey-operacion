-- Reset unfinished purchases without revoking contact consent or cancelling existing orders.
-- Commercial orchestration wrapper. Preserves the existing atomic order/stock
-- transaction and the outbound payload idempotency fix from 202609070011.
create or replace function public.persist_whatsapp_commercial_response(
  p_inbound_message_id uuid, p_conversation_id uuid, p_proposed_output jsonb,
  p_knowledge_refs jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.whatsapp_conversations;
  m public.whatsapp_messages;
  cached public.ai_runs;
  reply_message public.whatsapp_messages;
  qr_message public.whatsapp_messages;
  qr public.branch_payment_qrs;
  task public.human_tasks;
  proposed jsonb := p_proposed_output;
  state jsonb := coalesce(p_proposed_output->'sales_state','{}'::jsonb);
  result jsonb;
  qr_result jsonb;
  action text;
  selected_branch text;
  payment_task_id uuid;
  payment_ok boolean := false;
  branch_changed boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,7));
  select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
  select * into m from public.whatsapp_messages where id=p_inbound_message_id and conversation_id=c.id and direction='inbound';
  if c.id is null or m.id is null then raise exception 'Conversación o mensaje inválido'; end if;
  if c.consent_status<>'granted' then return jsonb_build_object('skipped',true,'reason','consent_required'); end if;
  if c.automation_paused and not (m.sender_type='human' and coalesce(m.raw_payload->>'operator_instruction','')='true') then
    return jsonb_build_object('skipped',true,'reason','manual_control');
  end if;
  -- Retries reuse the canonical decision and both already prepared messages.
  select * into cached from public.ai_runs where run_key='commercial-response:'||m.id::text;
  if cached.id is not null then
    select * into reply_message from public.whatsapp_messages where idempotency_key='assistant-reply:'||m.id::text;
    select * into qr_message from public.whatsapp_messages where idempotency_key='payment-qr-request:'||m.id::text;
    return jsonb_build_object('inbound_message_id',m.id,'conversation_id',c.id,'ai_output',cached.output,
      'outbound_message_id',reply_message.id,'qr_message_id',qr_message.id,'reused',true);
  end if;
  if c.status='closed' then return jsonb_build_object('skipped',true,'reason','closed'); end if;
  if m.sender_type='customer' and exists(select 1 from public.whatsapp_messages newer
    where newer.conversation_id=c.id and newer.sender_type='customer' and newer.direction='inbound'
      and (newer.created_at,newer.id)>(m.created_at,m.id)) then
    return jsonb_build_object('skipped',true,'reason','newer_customer_message');
  end if;

  -- Discard a late human reply from a purchase the customer already abandoned.
  if m.sender_type='human' and nullif(c.sales_state->>'purchase_reset_at','') is not null
    and m.created_at < (c.sales_state->>'purchase_reset_at')::timestamptz then
    return jsonb_build_object('skipped',true,'reason','previous_purchase');
  end if;
  if proposed->>'reset_purchase'='true' and m.sender_type='customer'
    and not exists(select 1 from public.orders where whatsapp_conversation_id=c.id) then
    state := jsonb_build_object('stage','browsing','product_interest','','items','[]'::jsonb,
      'items_verified',false,'fulfillment_type','','delivery_address','','delivery_zone','','recipient_name','',
      'delivery_fee',null,'delivery_quote_verified',false,'payment_method','','payment_status','pending',
      'payment_reference','','payment_reported',false,'store_purchase_reported',false,'checkout_confirmed',false,
      'customer_notes','','credit_document','','credit_phone','','credit_installments','','credit_code','',
      'purchase_reset_at',m.created_at,'purchase_reset_message_id',m.id);
    update public.human_tasks set status='cancelled',resolved_at=now(),
      resolution=jsonb_build_object('reason','Cliente descartó la compra pendiente','reset_message_id',m.id)
    where conversation_id=c.id and status in ('pending','in_progress');
    update public.automation_outbox set status='processed',processed_at=now(),lease_id=null,
      last_error='Compra descartada por el cliente'
    where aggregate_id in (select id from public.human_tasks where conversation_id=c.id and status='cancelled')
      and status in ('pending','failed');
    insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
    values(c.id,'conversation','purchase_reset',jsonb_build_object('message_id',m.id),'customer','purchase-reset:'||m.id::text)
    on conflict(source_key) do nothing;
    proposed := proposed || jsonb_build_object('action','reply','send_qr',false);
  end if;

  select id into selected_branch from public.branches where active and id=proposed->>'branch_id';
  if selected_branch is not null and selected_branch is distinct from c.branch_id
    and (c.branch_id is null or proposed->>'branch_change_confirmed'='true')
    and not exists(select 1 from public.orders where whatsapp_conversation_id=c.id) then
    branch_changed := c.branch_id is not null;
    if branch_changed then
      state := state || '{"delivery_fee":null,"delivery_quote_verified":false,"payment_status":"pending","checkout_confirmed":false}'::jsonb;
      state := state - 'payment_verified_task_id';
      update public.human_tasks set status='cancelled',resolution=jsonb_build_object('reason','Cliente cambió de sede'),resolved_at=now()
      where conversation_id=c.id and status in ('pending','in_progress') and branch_id is distinct from selected_branch;
      insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
      values(c.id,'conversation','branch_changed',jsonb_build_object('previous_branch',c.branch_id,'branch_id',selected_branch),'automation','branch-change:'||m.id::text)
      on conflict(source_key) do nothing;
    end if;
    update public.whatsapp_conversations set branch_id=selected_branch where id=c.id returning * into c;
  end if;
  proposed := proposed || jsonb_build_object('branch_id',c.branch_id,'sales_state',state,'policy_version','commercial-v4');
  action := proposed->>'action';
  if action='finalize_order' then
    -- This is a DB guard too: model output is never a payment approval.
    if coalesce(state->>'payment_verified_task_id','') ~* '^[0-9a-f-]{36}$' then
      payment_task_id := (state->>'payment_verified_task_id')::uuid;
      select * into task from public.human_tasks where id=payment_task_id and conversation_id=c.id and branch_id=c.branch_id;
      payment_ok := task.status='resolved'
        and task.task_type=case when state->>'payment_method'='transfer' then 'payment_verification' else 'credit_application' end
        and task.context->'sales_state'->'items'=state->'items'
        and coalesce(task.context#>>'{sales_state,payment_method}','')=coalesce(state->>'payment_method','')
        and coalesce(task.context#>>'{sales_state,delivery_address}','')=coalesce(state->>'delivery_address','')
        and coalesce(task.context#>>'{sales_state,delivery_zone}','')=coalesce(state->>'delivery_zone','')
        and coalesce(task.context#>>'{sales_state,delivery_fee}','')=coalesce(state->>'delivery_fee','')
        and lower(coalesce(task.resolution->>'answer','')) !~ '\m(no|rechazado|rechazada|pendiente|inválido|invalido)\M'
        and (task.resolution->>'approved'='true' or lower(coalesce(task.resolution->>'answer','')) ~ '\m(aprobado|aprobada|verificado|verificada|válido|valido|válida|valida|pago recibido)\M');
    end if;
    if state->>'payment_method'='cash_prepaid' and state->>'fulfillment_type'='pickup' and state->>'payment_status'='pay_at_store' then payment_ok:=true; end if;
    if coalesce(state->>'checkout_confirmed','false')<>'true' or coalesce(state->>'items_verified','false')<>'true'
      or not coalesce(payment_ok,false)
      or (state->>'fulfillment_type'='delivery' and (coalesce(state->>'delivery_quote_verified','false')<>'true' or state->>'delivery_fee' is null)) then
      proposed := proposed || jsonb_build_object('action','reply','reply','Antes de registrar el pedido debemos confirmar el resumen y las verificaciones pendientes. El equipo puede ayudarte a completarlo.','send_qr',false);
      action := 'reply';
    end if;
  end if;
  begin
    result := public.persist_whatsapp_ai_response(m.id,c.id,proposed,p_knowledge_refs);
  exception when raise_exception then
    -- A concurrent stock change should create a useful human task, not silence.
    if SQLERRM not like 'Inventario insuficiente%' then raise; end if;
    proposed := proposed || jsonb_build_object('action','human_product_lookup','reply','La disponibilidad cambió al confirmar. Voy a revisarla con la sede antes de registrar tu pedido.','task_title','Revisar disponibilidad al confirmar','task_question','Verificar existencias y ofrecer alternativas para el carrito registrado.','send_qr',false,
      'sales_state',state||'{"items_verified":false,"checkout_confirmed":false}'::jsonb);
    action := 'human_product_lookup';
    result := public.persist_whatsapp_ai_response(m.id,c.id,proposed,p_knowledge_refs);
  end;
  if action='human_general' and c.branch_id is not null then
    if not exists(select 1 from public.human_tasks where conversation_id=c.id and task_type='general' and status in ('pending','in_progress')) then
      task := public.create_human_task(c.id,'human:human_general:'||m.id::text,'general','normal',
        coalesce(nullif(proposed->>'task_title',''),'Consulta con un asesor'),coalesce(nullif(proposed->>'task_question',''),m.body),
        jsonb_build_object('inbound_message_id',m.id,'sales_state',state,'summary',proposed->>'summary'),null,null,now()+interval '20 minutes');
      result := result || jsonb_build_object('human_task',to_jsonb(task));
    end if;
  end if;
  -- Give a pending task the newest context without creating another notification.
  update public.human_tasks set context=context||jsonb_build_object('latest_sales_state',state,'latest_inbound_message_id',m.id,'latest_summary',proposed->>'summary')
  where conversation_id=c.id and status in ('pending','in_progress');
  if action='stop' then
    update public.whatsapp_conversations set status='closed',closed_at=now() where id=c.id;
  elsif action<>'finalize_order' and exists(select 1 from public.human_tasks where conversation_id=c.id and status in ('pending','in_progress')) then
    update public.whatsapp_conversations set status='waiting_human' where id=c.id;
  end if;
  if proposed->>'send_qr'='true' and action not in ('stop','finalize_order') and state->>'payment_method'='transfer' and not branch_changed then
    select * into qr from public.branch_payment_qrs where branch_id=c.branch_id and active;
    if qr.branch_id is not null then
      qr_result := public.queue_outbound_whatsapp_message(c.id,'payment-qr-request:'||m.id::text,'assistant','image',
        'Código QR para pagar tu pedido en '||(select name from public.branches where id=c.branch_id)||'.',
        jsonb_build_object('storage_bucket','payment-qrs','storage_path',qr.storage_path,'mime_type',qr.mime_type,
          'caption','Cuando realices la transferencia, envía el comprobante para verificación del equipo.'));
      result := result || jsonb_build_object('qr_message_id',qr_result->>'message_id');
    end if;
  end if;
  return result;
end;
$$;
revoke all on function public.persist_whatsapp_commercial_response(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_whatsapp_commercial_response(uuid,uuid,jsonb,jsonb) to service_role;
