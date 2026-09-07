-- Estado comercial estructurado y creación idempotente de pedidos desde WhatsApp.

alter table public.whatsapp_conversations
  add column if not exists sales_state jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_conversations_sales_state_object'
      and conrelid = 'public.whatsapp_conversations'::regclass
  ) then
    alter table public.whatsapp_conversations
      add constraint whatsapp_conversations_sales_state_object
      check (jsonb_typeof(sales_state) = 'object');
  end if;
end;
$$;

insert into public.branch_knowledge(branch_id,category,title,content,version,active)
select null,'payment','Métodos de pago de WhatsApp',
  'Métodos disponibles: transferencia mediante código QR o número de cuenta, Addi y Sistecrédito. El pago en el local solo está disponible cuando el cliente recoge el pedido en la sede. No existe pago contraentrega.',
  1,true
where not exists (
  select 1 from public.branch_knowledge where branch_id is null and title='Métodos de pago de WhatsApp' and active
);

insert into public.branch_knowledge(branch_id,category,title,content,version,active)
select null,'schedule','Horario de atención y domicilios',
  'Horario de atención: 9:00 a. m. a 8:00 p. m. Los domicilios solo se gestionan hasta las 7:00 p. m.; después de esa hora se programan para el día siguiente desde las 9:00 a. m. Después de las 8:00 p. m. no hay servicio y se retoma a las 9:00 a. m.',
  1,true
where not exists (
  select 1 from public.branch_knowledge where branch_id is null and title='Horario de atención y domicilios' and active
);

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
  contact public.whatsapp_contacts;
  selected_branch_id text;
  action_name text;
  task_type_name text;
  task_result public.human_tasks;
  queue_result jsonb;
  task_json jsonb;
  next_state jsonb;
  order_row public.orders;
  order_items jsonb;
  order_fulfillment text;
  order_payment text;
  order_payment_status text;
  order_delivery_fee bigint;
  order_subtotal bigint;
  outbound_body text;
  item jsonb;
  item_product_id uuid;
  item_qty integer;
  stock public.branch_inventory;
begin
  if p_inbound_message_id is null or p_conversation_id is null then
    raise exception 'Faltan identificadores para persistir la respuesta';
  end if;
  if p_proposed_output is null or jsonb_typeof(p_proposed_output) <> 'object' then
    raise exception 'La respuesta de IA debe ser un objeto JSON';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 7));

  select * into inbound_message from public.whatsapp_messages
  where id=p_inbound_message_id and conversation_id=p_conversation_id and direction='inbound';
  if inbound_message.id is null then raise exception 'El mensaje de entrada no pertenece a la conversación'; end if;

  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.consent_status<>'granted' or conversation.status='closed' then
    raise exception 'La conversación no permite respuestas automáticas';
  end if;
  select * into contact from public.whatsapp_contacts where id=conversation.contact_id;

  insert into public.ai_runs(
    conversation_id,message_id,purpose,run_key,prompt_version,model,input_summary,output,knowledge_refs,succeeded
  ) values(
    p_conversation_id,p_inbound_message_id,'response','commercial-response:'||p_inbound_message_id::text,
    'commercial-v2','gpt-5.4-mini',left(coalesce(p_proposed_output->>'summary',''),1000),
    p_proposed_output,coalesce(p_knowledge_refs,'[]'::jsonb),true
  ) on conflict(run_key) do nothing returning output into canonical_output;

  if canonical_output is null then
    select output into canonical_output from public.ai_runs
    where run_key='commercial-response:'||p_inbound_message_id::text;
  end if;

  action_name := coalesce(nullif(canonical_output->>'action',''),'reply');
  select id into selected_branch_id from public.branches
  where active and id=nullif(canonical_output->>'branch_id','');

  next_state := case
    when jsonb_typeof(canonical_output->'sales_state')='object' then canonical_output->'sales_state'
    else coalesce(conversation.sales_state,'{}'::jsonb)
  end;

  update public.whatsapp_conversations
  set branch_id=coalesce(branch_id,selected_branch_id),
      current_intent=nullif(canonical_output->>'intent',''),
      summary=nullif(canonical_output->>'summary',''),
      sales_state=next_state,
      status=case when action_name like 'human_%' then 'waiting_human' else 'waiting_customer' end
  where id=p_conversation_id returning * into conversation;

  if nullif(trim(canonical_output->>'customer_name'),'') is not null then
    update public.whatsapp_contacts
    set preferred_name=left(trim(canonical_output->>'customer_name'),120)
    where id=conversation.contact_id returning * into contact;
  end if;

  task_type_name := case action_name
    when 'human_product_lookup' then 'product_lookup'
    when 'human_delivery_quote' then 'delivery_quote'
    when 'human_payment_verification' then 'payment_verification'
    when 'human_credit_application' then 'credit_application'
    else null
  end;

  if task_type_name is not null and conversation.branch_id is not null and not exists(
    select 1 from public.human_tasks pending
    where pending.conversation_id=p_conversation_id
      and pending.status in ('pending','in_progress') and pending.task_type=task_type_name
  ) then
    task_result := public.create_human_task(
      p_conversation_id,'human:'||action_name||':'||p_inbound_message_id::text,task_type_name,
      case when action_name='human_payment_verification' then 'high' else 'normal' end,
      coalesce(nullif(canonical_output->>'task_title',''),'Atención requerida en WhatsApp'),
      coalesce(nullif(canonical_output->>'task_question',''),'Revisar la conversación y responder al cliente.'),
      jsonb_build_object('inbound_message_id',p_inbound_message_id,'intent',canonical_output->>'intent',
        'summary',canonical_output->>'summary','customer_name',canonical_output->>'customer_name',
        'sales_state',next_state),null,null,
      now()+case action_name when 'human_product_lookup' then interval '20 minutes'
        when 'human_credit_application' then interval '15 minutes' else interval '10 minutes' end
    );
    task_json := to_jsonb(task_result);
  end if;

  outbound_body := canonical_output->>'reply';

  if action_name='finalize_order' then
    select * into order_row from public.orders
    where whatsapp_conversation_id=p_conversation_id order by created_at desc limit 1;

    if order_row.id is null then
      order_items := next_state->'items';
      order_fulfillment := nullif(next_state->>'fulfillment_type','');
      order_payment := nullif(next_state->>'payment_method','');
      order_payment_status := nullif(next_state->>'payment_status','');
      order_delivery_fee := coalesce(nullif(next_state->>'delivery_fee','')::bigint,0);

      if nullif(trim(contact.preferred_name),'') is null then raise exception 'Falta el nombre confirmado del cliente'; end if;
      if conversation.branch_id is null then raise exception 'Falta la sede del pedido'; end if;
      if jsonb_typeof(order_items)<>'array' or jsonb_array_length(order_items)=0 then raise exception 'El pedido no tiene productos'; end if;
      if order_fulfillment not in ('delivery','pickup') then raise exception 'Falta definir entrega o recogida'; end if;
      if order_fulfillment='delivery' and (
        nullif(trim(next_state->>'delivery_address'),'') is null or nullif(trim(next_state->>'delivery_zone'),'') is null
      ) then raise exception 'Faltan dirección o barrio para el domicilio'; end if;
      if order_payment not in ('transfer','addi','sistecredito','cash_prepaid') then raise exception 'Método de pago inválido'; end if;
      if order_payment='cash_prepaid' and order_fulfillment<>'pickup' then raise exception 'El pago en el local solo aplica para recogida'; end if;
      if order_payment='transfer' and order_payment_status<>'verified' then raise exception 'La transferencia todavía no está verificada'; end if;
      if order_payment in ('addi','sistecredito') and order_payment_status<>'approved' then raise exception 'El crédito todavía no está aprobado'; end if;
      if order_payment='cash_prepaid' and order_payment_status<>'pay_at_store' then raise exception 'Falta confirmar el pago en sede'; end if;
      if exists(
        select 1 from jsonb_array_elements(order_items) value
        where nullif(trim(value->>'name'),'') is null
          or coalesce(nullif(value->>'qty','')::integer,0)<1
          or coalesce(nullif(value->>'unit_price','')::bigint,-1)<0
      ) then raise exception 'Los productos del pedido están incompletos'; end if;

      select coalesce(sum((value->>'qty')::integer*(value->>'unit_price')::bigint),0)
      into order_subtotal from jsonb_array_elements(order_items) value;

      insert into public.orders(
        order_number,branch_id,fulfillment_type,status,customer_name,customer_phone,
        delivery_address,delivery_zone,items,total,delivery_fee,payment_method,payment_reference,
        source,customer_notes,internal_notes,whatsapp_conversation_id
      ) values(
        null,conversation.branch_id,order_fulfillment::public.fulfillment_type,'preparing',
        contact.preferred_name,coalesce(contact.phone_e164,contact.whatsapp_id),
        case when order_fulfillment='delivery' then next_state->>'delivery_address' else null end,
        case when order_fulfillment='delivery' then next_state->>'delivery_zone' else null end,
        order_items,order_subtotal+case when order_fulfillment='delivery' then order_delivery_fee else 0 end,
        case when order_fulfillment='delivery' then order_delivery_fee else 0 end,
        order_payment::public.payment_method,nullif(next_state->>'payment_reference',''),
        'WhatsApp',nullif(next_state->>'customer_notes',''),
        'Pedido creado automáticamente desde WhatsApp.',p_conversation_id
      ) returning * into order_row;

      for item in select value from jsonb_array_elements(order_items) value loop
        if coalesce(item->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          item_product_id := (item->>'product_id')::uuid;
          item_qty := (item->>'qty')::integer;
          select * into stock from public.branch_inventory
          where branch_id=conversation.branch_id and product_id=item_product_id and active for update;
          if stock.product_id is null or stock.available_qty-stock.reserved_qty<item_qty then
            raise exception 'Inventario insuficiente para %',item->>'name';
          end if;
          update public.branch_inventory set available_qty=available_qty-item_qty
          where branch_id=conversation.branch_id and product_id=item_product_id;
          insert into public.inventory_movements(
            branch_id,product_id,order_id,conversation_id,movement_type,quantity,
            available_before,available_after,reserved_before,reserved_after,reason,actor_label
          ) values(
            conversation.branch_id,item_product_id,order_row.id,p_conversation_id,'sale',-item_qty,
            stock.available_qty,stock.available_qty-item_qty,stock.reserved_qty,stock.reserved_qty,
            'Compra confirmada por WhatsApp','Asistente WhatsApp'
          );
        end if;
      end loop;
    end if;

    next_state := next_state || jsonb_build_object('order_id',order_row.id,'order_number',order_row.order_number,'stage','completed');
    update public.whatsapp_conversations
    set sales_state=next_state,status='converted'
    where id=p_conversation_id returning * into conversation;
    insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
    values(p_conversation_id,'order','created',jsonb_build_object('order_id',order_row.id,'order_number',order_row.order_number),
      'automation','order-created:'||p_conversation_id::text)
    on conflict(source_key) do nothing;
    outbound_body := trim(coalesce(outbound_body,''))||E'\nNúmero de pedido: '||order_row.order_number||'.';
  end if;

  queue_result := public.queue_outbound_whatsapp_message(
    p_conversation_id,'assistant-reply:'||p_inbound_message_id::text,'assistant','text',outbound_body,
    jsonb_strip_nulls(jsonb_build_object('order_id',order_row.id,'order_number',order_row.order_number))
  );

  return jsonb_build_object(
    'inbound_message_id',p_inbound_message_id,'conversation_id',p_conversation_id,
    'ai_output',canonical_output,'human_task',task_json,'queue_result',queue_result,
    'outbound_message_id',nullif(queue_result->>'message_id',''),
    'order_id',order_row.id,'order_number',order_row.order_number
  );
end;
$$;

revoke all on function public.persist_whatsapp_ai_response(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_whatsapp_ai_response(uuid,uuid,jsonb,jsonb) to service_role;
