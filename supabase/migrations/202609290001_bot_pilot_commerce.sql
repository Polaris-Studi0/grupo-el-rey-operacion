-- New pilot consumer. Does not restore v2 or any old commercial automation.
begin;
alter table public.branch_inventory
  add column stock_confirmed_at timestamptz,
  add column stock_confirmed_by uuid references public.profiles(id) on delete restrict;

create function public.bot_stock_valid_until(p_confirmed timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
 select ((p_confirmed at time zone 'America/Bogota')::date + time '20:00') at time zone 'America/Bogota';
$$;
create function public.confirm_bot_stock(p_branch_id text,p_product_id uuid,p_available_qty integer)
returns public.branch_inventory language plpgsql security definer set search_path='' as $$
declare s public.branch_inventory;
begin
 if not public.is_admin() then raise exception 'Solo un administrador puede confirmar las existencias'; end if;
 select * into s from public.branch_inventory where branch_id=p_branch_id and product_id=p_product_id for update;
 if s.product_id is null or p_available_qty is null or p_available_qty<s.reserved_qty then raise exception 'La cantidad debe cubrir las unidades reservadas'; end if;
 if (now() at time zone 'America/Bogota')::time>=time '20:00' then raise exception 'El conteo se confirma antes del cierre de las 8 p. m.'; end if;
 update public.branch_inventory set available_qty=p_available_qty,stock_confirmed_at=now(),stock_confirmed_by=auth.uid()
 where branch_id=p_branch_id and product_id=p_product_id;
 insert into public.catalog_audit_events(branch_id,product_id,action,before_state,after_state)
 select p_branch_id,p_product_id,'stock_confirmed_until_close',to_jsonb(s),to_jsonb(b) from public.branch_inventory b where b.branch_id=p_branch_id and b.product_id=p_product_id;
 if p_available_qty<>s.available_qty then
  insert into public.inventory_movements(branch_id,product_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
  values(p_branch_id,p_product_id,'adjustment',p_available_qty-s.available_qty,s.available_qty,p_available_qty,s.reserved_qty,s.reserved_qty,'Conteo físico confirmado hasta el cierre','Administrador');
 end if;
 select * into s from public.branch_inventory where branch_id=p_branch_id and product_id=p_product_id;
 return s;
end; $$;
revoke all on function public.confirm_bot_stock(text,uuid,integer) from public,anon;
grant execute on function public.confirm_bot_stock(text,uuid,integer) to authenticated;

-- Editing a quantity through the older panel cannot silently renew a physical count.
create function public.invalidate_bot_stock_count() returns trigger language plpgsql set search_path='' as $$
begin
 if new.available_qty is distinct from old.available_qty and new.stock_confirmed_at is not distinct from old.stock_confirmed_at
    and new.reserved_qty is not distinct from old.reserved_qty then
  new.stock_confirmed_at:=null; new.stock_confirmed_by:=null;
 end if;
 return new;
end; $$;
create trigger branch_inventory_count_guard before update on public.branch_inventory for each row execute function public.invalidate_bot_stock_count();

create function public.bot_money(p_value bigint) returns text language sql immutable set search_path='' as $$
 select '$'||replace(to_char(p_value,'FM999,999,999,990'),',','.');
$$;
create function public.bot_order_summary(p_branch text,p_state jsonb) returns text language plpgsql immutable set search_path='' as $$
declare lines text;
begin
 select string_agg((i->>'qty')||' × '||(i->>'name')||' — '||public.bot_money((i->>'qty')::bigint*(i->>'unit_price')::bigint),E'\n' order by ord)
 into lines from jsonb_array_elements(p_state->'cart') with ordinality t(i,ord);
 return 'Tu compra en '||p_branch||E':\n'||lines||E'\nProductos: '||public.bot_money((p_state->>'subtotal')::bigint)
 ||E'\nA nombre de: '||(p_state->>'customer_name')
 ||case when p_state->>'fulfillment_type'='delivery' then E'\nDomicilio: '||(p_state->>'delivery_address')||', '||(p_state->>'delivery_zone')
    ||E'\nRecibe: '||(p_state->>'recipient_name')||' · '||(p_state->>'recipient_phone')
    ||E'\nEnvío: '||public.bot_money((p_state->>'delivery_fee')::bigint) else E'\nRecogida en sede' end
 ||E'\nTotal: '||public.bot_money((p_state->>'subtotal')::bigint+coalesce((p_state->>'delivery_fee')::bigint,0))
 ||E'\n\n¿Está todo correcto? Puedes elegir transferencia, Addi o Sistecrédito'
 ||case when p_state->>'fulfillment_type'='pickup' then ', o pagar al recoger en la sede.' else '. No manejamos pago contraentrega.' end;
end; $$;

-- Structured admin decisions. A free-form sentence can never approve money.
create function public.resolve_bot_commerce_task(p_task_id uuid,p_status text,p_resolution jsonb)
returns public.human_tasks language plpgsql security definer set search_path='' as $$
declare t public.human_tasks; amount bigint;
begin
 if not public.is_admin() then raise exception 'Solo un administrador puede confirmar esta decisión'; end if;
 select * into t from public.human_tasks where id=p_task_id for update;
 if t.context->>'pilot_engine'<>'new-whatsapp-v1' or not(t.context ? 'commerce') then raise exception 'El pendiente no es comercial'; end if;
 if p_status='resolved' then
  if t.task_type='delivery_quote' then
   if jsonb_typeof(p_resolution->'delivery_fee')<>'number' or coalesce(p_resolution->>'delivery_fee','')!~'^[0-9]+$' then raise exception 'Indica el valor confirmado del domicilio'; end if;
   amount:=(p_resolution->>'delivery_fee')::bigint;
   if amount>1000000 then raise exception 'Revisa el valor del domicilio'; end if;
  elsif t.task_type in ('payment_verification','credit_application') then
   if p_resolution->'approved' is distinct from 'true'::jsonb or jsonb_typeof(p_resolution->'amount')<>'number'
      or (p_resolution->>'amount')::bigint is distinct from (t.context#>>'{commerce,amount}')::bigint then
    raise exception 'Confirma explícitamente la aprobación y el importe exacto'; end if;
  end if;
 end if;
 return public.resolve_human_task(p_task_id,p_status,p_resolution);
end; $$;
revoke all on function public.resolve_bot_commerce_task(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_bot_commerce_task(uuid,text,jsonb) to authenticated;

create function public.commit_bot_commerce_turn(
 p_conversation_id uuid,p_inbound_message_id uuid,p_control_version integer,p_commerce_version integer,
 p_decision jsonb,p_owner_phone text,p_task_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.whatsapp_conversations; m public.whatsapp_messages; contact public.whatsapp_contacts;
 s jsonb; old_s jsonb; patch jsonb; item jsonb; items jsonb:='[]'; line jsonb; offered jsonb:='[]';
 stock public.branch_inventory; product public.products; reservation public.inventory_reservations;
 task public.human_tasks; fee_task public.human_tasks; payment_task public.human_tasks; human public.human_tasks;
 proof public.whatsapp_attachments; qr public.branch_payment_qrs; purchase public.orders;
 result jsonb; cached jsonb; queued jsonb; image_queue jsonb; v_run_key text; body text; intent text;
 branch_name text; field text; changed boolean:=false; can_accept boolean:=false; payment_ok boolean:=false;
 needs_checkout boolean:=false; needs_summary boolean:=false; want_qr boolean:=false; reason text; task_kind text;
 quantity integer; own_quantity integer; unit_price bigint; subtotal bigint:=0; total bigint; scope text;
 task_ids jsonb:='[]'; message_ids jsonb:='[]'; missing text[]:=array[]::text[];
begin
 select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
 if c.id is null then raise exception 'Conversación inexistente'; end if;
 v_run_key:=case when p_task_id is null then 'pilot-commerce:'||p_inbound_message_id else 'pilot-commerce-task:'||p_task_id end;
 select output into cached from public.ai_runs where ai_runs.run_key=v_run_key;
 if cached is not null then return cached||'{"duplicate":true}'::jsonb; end if;
 select * into m from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1;
 if c.automation_paused or c.status='closed' or c.consent_status<>'granted' or c.consented_at is null or c.consent_version is null
  or c.automation_control_version is distinct from p_control_version or m.id is distinct from p_inbound_message_id or m.created_at<now()-interval '23 hours'
  or not exists(select 1 from public.branches where id=c.branch_id and active) then return '{"skipped":true,"reason":"conversation_changed"}'::jsonb; end if;
 s:=coalesce(c.sales_state->'pilot_commerce','{}'); old_s:=s;
 if coalesce((s->>'version')::integer,0) is distinct from p_commerce_version then return '{"skipped":true,"reason":"commerce_changed"}'::jsonb; end if;
 select * into contact from public.whatsapp_contacts where id=c.contact_id;
 select name into branch_name from public.branches where id=c.branch_id;
 intent:=coalesce(p_decision->>'intent','clarification'); body:=left(trim(p_decision->>'reply_text'),1800);
 patch:=coalesce(p_decision->'checkout','{}');
 if p_task_id is not null then
  select * into task from public.human_tasks where id=p_task_id and conversation_id=c.id and branch_id=c.branch_id for update;
  if task.id is null or task.status not in ('resolved','rejected') or task.resolved_by is null or task.context->>'pilot_engine'<>'new-whatsapp-v1' then return '{"skipped":true,"reason":"task_changed"}'::jsonb; end if;
  if task.context#>>'{commerce,quote_id}' is distinct from s->>'quote_id' or s->>'stage'='ordered' then
   update public.human_tasks set automation_resumed_at=now(),automation_error='La compra cambió; la aclaración no se aplica.' where id=task.id;
   return '{"skipped":true,"reason":"stale_task"}'::jsonb;
  end if;
  needs_checkout:=true;
  if task.task_type='delivery_quote' then
   if task.status='resolved' and task.resolution->>'delivery_fee' ~ '^[0-9]+$' then
    s:=s||jsonb_build_object('delivery_fee',(task.resolution->>'delivery_fee')::bigint,'delivery_scope',task.context#>>'{commerce,delivery_scope}');
   else needs_checkout:=false;body:=coalesce(nullif(trim(task.resolution->>'answer'),''),'No tenemos confirmado el domicilio para esa dirección. Podemos revisar otra dirección o la recogida en sede.'); end if;
  elsif task.task_type in ('payment_verification','credit_application') then
   if task.status='resolved' and task.resolution->'approved'='true'::jsonb and task.resolution->'amount'=task.context#>'{commerce,amount}'
    and task.context#>>'{commerce,payment_method}'=s->>'payment_method' and s->>'accepted_quote_id'=s->>'quote_id'
    and task.context#>>'{commerce,amount}'=((s->>'subtotal')::bigint+coalesce((s->>'delivery_fee')::bigint,0))::text then
    payment_ok:=true; s:=s||jsonb_build_object('approved_payment_task_id',task.id);
    if task.task_type='payment_verification' then
     select a.* into proof from public.whatsapp_attachments a join public.whatsapp_messages am on am.id=a.message_id
      where a.id::text=task.context->>'attachment_id' and a.conversation_id=c.id and am.direction='inbound' and am.sender_type='customer'
       and a.message_id::text=task.context->>'inbound_message_id' and a.mime_type in ('image/jpeg','image/png','image/webp','application/pdf');
     if proof.id is null then payment_ok:=false; needs_checkout:=false; body:='Necesitamos el comprobante de esta compra para terminar la revisión.'; end if;
    end if;
   else
    needs_checkout:=false; body:='El pago todavía no está aprobado. Revisemos el comprobante antes de continuar.';
   end if;
  end if;
 else
  if jsonb_typeof(patch)<>'object' then raise exception 'Datos de compra inválidos'; end if;
  if coalesce(p_decision->>'cancel_cart','false')='true' and s->>'stage'<>'ordered' then
   for reservation in select * from public.inventory_reservations where conversation_id=c.id and id::text in (select jsonb_array_elements_text(coalesce(s->'reservations','[]'))) and status='active' order by product_id loop
    perform public.release_chat_inventory(reservation.id,'Cliente canceló la compra');
   end loop;
   s:=jsonb_build_object('version',p_commerce_version,'stage','cancelled'); body:='De acuerdo, cancelé esta compra. Puedes seguir consultándome lo que necesites.';
  else
   if intent='quote' and jsonb_array_length(coalesce(p_decision#>'{quote,items}','[]'))>0 then
    if jsonb_array_length(p_decision#>'{quote,items}')>10 then raise exception 'Demasiados productos'; end if;
    -- All locks in product order; model prices and names are ignored.
    for item in select value from jsonb_array_elements(p_decision#>'{quote,items}') order by value->>'product_id' loop
     quantity:=(item->>'quantity')::integer;
     if quantity not between 1 and 99 or exists(select 1 from jsonb_array_elements(items) x where x->>'product_id'=item->>'product_id') then raise exception 'Cantidad o referencia inválida'; end if;
     select * into stock from public.branch_inventory where branch_id=c.branch_id and product_id=(item->>'product_id')::uuid and active for update;
     select * into product from public.products where id=stock.product_id and active;
     select coalesce(sum(r.quantity),0) into own_quantity from public.inventory_reservations r where r.conversation_id=c.id and r.product_id=stock.product_id and r.status='active' and r.expires_at>now() and r.id::text in(select jsonb_array_elements_text(coalesce(s->'reservations','[]')));
     if product.id is null or stock.stock_confirmed_at is null or stock.stock_confirmed_at>now() or public.bot_stock_valid_until(stock.stock_confirmed_at)<=now() or stock.available_qty-stock.reserved_qty+own_quantity<quantity then
      reason:='stock_check'; exit;
     end if;
     unit_price:=case when stock.promotional_price is not null and (stock.promotion_from is null or stock.promotion_from<=now()) and (stock.promotion_until is null or stock.promotion_until>now()) then stock.promotional_price else stock.price end;
     items:=items||jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'qty',quantity,'unit_price',unit_price));
     subtotal:=subtotal+quantity*unit_price;
    end loop;
    if reason is null then
     if s->>'stage'='ordered' then s:=jsonb_build_object('version',p_commerce_version,'customer_name',s->>'customer_name'); end if;
     changed:=items is distinct from coalesce(s->'cart','[]'); s:=s||jsonb_build_object('cart',items,'subtotal',subtotal);
    end if;
   end if;
   for field in select unnest(array['customer_name','recipient_name','recipient_phone','fulfillment_type','delivery_address','delivery_zone','payment_method']) loop
    if nullif(trim(patch->>field),'') is not null then
     if length(patch->>field)>300 then raise exception 'Dato demasiado largo'; end if;
     if field='fulfillment_type' and patch->>field not in ('delivery','pickup') then raise exception 'Modalidad inválida'; end if;
     if field='payment_method' and patch->>field not in ('transfer','addi','sistecredito','cash_prepaid') then raise exception 'Medio de pago inválido'; end if;
     if field='recipient_phone' and regexp_replace(patch->>field,'[^0-9]','','g') !~ '^[0-9]{10,15}$' then raise exception 'Teléfono de destinatario inválido'; end if;
     if field<>'payment_method' and patch->>field is distinct from s->>field then changed:=true; end if;
     if s->>'stage'<>'ordered' or s->>'stage' is null then s:=jsonb_set(s,array[field],to_jsonb(trim(patch->>field))); end if;
    end if;
   end loop;
   needs_checkout:=intent in ('quote','checkout','qr') or (intent='handoff' and p_decision#>>'{actions,0,reason}'='payment_review');
   can_accept:=coalesce(p_decision->>'accept_summary','false')='true' and not changed
    and s->>'stage' in ('summary','payment','review') and exists(select 1 from public.whatsapp_messages sm where sm.id::text=s->>'summary_message_id' and sm.conversation_id=c.id and sm.delivery_status in ('sent','delivered','read') and sm.created_at<m.created_at);
   if changed then
    for reservation in select * from public.inventory_reservations where conversation_id=c.id and id::text in(select jsonb_array_elements_text(coalesce(s->'reservations','[]'))) and status='active' order by product_id loop
     perform public.release_chat_inventory(reservation.id,'Se actualizó el resumen de compra');
    end loop;
    if s->>'stage'='review' or s ? 'approved_payment_task_id' then s:=s||'{"payment_revision_required":true}'::jsonb; end if;
    s:=(s-'accepted_quote_id'-'summary_message_id'-'reservations'-'reservation_until'-'approved_payment_task_id')||jsonb_build_object('quote_id',gen_random_uuid(),'stage','collecting');
   end if;
  end if;
 end if;

 -- Retain an explicit approval if stock had to be recounted; never request a
 -- second transfer for the exact same accepted quote.
 if needs_checkout and not payment_ok and s->>'approved_payment_task_id' is not null then
  select * into payment_task from public.human_tasks where id::text=s->>'approved_payment_task_id' and conversation_id=c.id and branch_id=c.branch_id
   and status='resolved' and resolved_by is not null and resolution->'approved'='true'::jsonb
   and context#>>'{commerce,quote_id}'=s->>'quote_id' and context#>>'{commerce,payment_method}'=s->>'payment_method'
   and resolution->'amount'=context#>'{commerce,amount}' and context#>>'{commerce,amount}'=((s->>'subtotal')::bigint+coalesce((s->>'delivery_fee')::bigint,0))::text;
  if payment_task.id is not null then
   if payment_task.task_type='credit_application' then payment_ok:=true;
   elsif payment_task.task_type='payment_verification' then
    select * into proof from public.whatsapp_attachments where id::text=payment_task.context->>'attachment_id' and conversation_id=c.id and message_id::text=payment_task.context->>'inbound_message_id';
    payment_ok:=proof.id is not null;
   end if;
  end if;
 end if;
 if needs_checkout and s->>'payment_revision_required'='true' then reason:='payment_changed'; end if;

 if needs_checkout and s->>'stage' is distinct from 'ordered' and coalesce(p_decision->>'cancel_cart','false')<>'true' then
  if jsonb_array_length(coalesce(s->'cart','[]'))=0 then
   needs_checkout:=false; body:='¿Qué producto te gustaría comprar?';
  else
   -- Recheck before collecting payment and after an approval. Existing reservations
   -- belong to this quote only; expired stock is never inferred from updated_at.
   for line in select value from jsonb_array_elements(s->'cart') order by value->>'product_id' loop
    select * into stock from public.branch_inventory where branch_id=c.branch_id and product_id=(line->>'product_id')::uuid and active for update;
    select * into product from public.products where id=stock.product_id and active;
    select coalesce(sum(r.quantity),0) into own_quantity from public.inventory_reservations r where r.conversation_id=c.id and r.product_id=stock.product_id and r.status='active' and r.expires_at>now() and r.id::text in(select jsonb_array_elements_text(coalesce(s->'reservations','[]')));
    unit_price:=case when stock.promotional_price is not null and (stock.promotion_from is null or stock.promotion_from<=now()) and (stock.promotion_until is null or stock.promotion_until>now()) then stock.promotional_price else stock.price end;
    if product.id is null or stock.stock_confirmed_at is null or stock.stock_confirmed_at>now() or public.bot_stock_valid_until(stock.stock_confirmed_at)<=now()
     or unit_price is distinct from (line->>'unit_price')::bigint or stock.available_qty-stock.reserved_qty+own_quantity<(line->>'qty')::integer then reason:='stock_check'; end if;
   end loop;
   if reason is null then
    if nullif(s->>'customer_name','') is null then missing:=array_append(missing,'tu nombre'); end if;
    if nullif(s->>'fulfillment_type','') is null then missing:=array_append(missing,'si prefieres domicilio o recoger en la sede'); end if;
    if s->>'fulfillment_type'='delivery' then
     if nullif(s->>'delivery_address','') is null then missing:=array_append(missing,'la dirección completa'); end if;
     if nullif(s->>'delivery_zone','') is null then missing:=array_append(missing,'el barrio o sector'); end if;
     if nullif(s->>'recipient_name','') is null then missing:=array_append(missing,'el nombre de quien recibe'); end if;
     if nullif(s->>'recipient_phone','') is null then missing:=array_append(missing,'su teléfono de contacto'); end if;
    else s:=s||'{"delivery_fee":0}'::jsonb; end if;
    if cardinality(missing)>0 then body:='Para continuar con tu compra, cuéntame '||array_to_string(missing,', ')||'.';
    else
     scope:=md5(jsonb_build_array(c.branch_id,s->'cart',s->>'delivery_address',s->>'delivery_zone')::text);
     if s->>'fulfillment_type'='delivery' and (s->>'delivery_scope' is distinct from scope or s->>'delivery_fee' is null) then
      s:=s-'delivery_fee';
      fee_task:=public.create_human_task(c.id,'pilot-fee:'||c.id||':'||(s->>'quote_id')||':'||scope,'delivery_quote','normal','Confirmar valor del domicilio',
       'Confirmar cobertura y tarifa para '||(s->>'delivery_address')||', '||(s->>'delivery_zone')||'. Productos: '||(s->'cart')::text,
       jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',m.id,'commerce',jsonb_build_object('quote_id',s->>'quote_id','delivery_scope',scope)),null,p_owner_phone,null);
      s:=s||'{"stage":"delivery_quote"}'::jsonb;task_ids:=task_ids||jsonb_build_array(fee_task.id);
      body:='Voy a confirmar el valor del domicilio para esa dirección antes de darte el total y continuar con el pago.';
     else
      total:=(s->>'subtotal')::bigint+coalesce((s->>'delivery_fee')::bigint,0);
      if can_accept then s:=s||jsonb_build_object('accepted_quote_id',s->>'quote_id'); end if;
      if s->>'accepted_quote_id' is distinct from s->>'quote_id' or s->>'quote_id' is null then
       if s->>'quote_id' is null then s:=s||jsonb_build_object('quote_id',gen_random_uuid()); end if;
       body:=public.bot_order_summary(branch_name,s);needs_summary:=true;s:=s||'{"stage":"summary"}'::jsonb;
      elsif nullif(s->>'payment_method','') is null then body:='¿Cómo prefieres pagar: transferencia, Addi o Sistecrédito'||case when s->>'fulfillment_type'='pickup' then ', o al recoger en la sede?' else '?' end;
      elsif s->>'payment_method'='cash_prepaid' and s->>'fulfillment_type'='delivery' then body:='Para domicilio puedes pagar por transferencia, Addi o Sistecrédito. No manejamos pago contraentrega.';
      else
       -- Release expired reservation records; acquiring again still checks free stock.
       for reservation in select * from public.inventory_reservations where conversation_id=c.id and id::text in(select jsonb_array_elements_text(coalesce(s->'reservations','[]'))) and status='active' and expires_at<=now() order by product_id loop
        perform public.release_chat_inventory(reservation.id,'Reserva vencida');
       end loop;
       if s->>'reservation_until' is null or (s->>'reservation_until')::timestamptz<=now() then
        s:=s||jsonb_build_object('reservations','[]'::jsonb,'reservation_until',least(now()+interval '30 minutes',public.bot_stock_valid_until(now())));
        update public.whatsapp_conversations set status='open' where id=c.id;
        for line in select value from jsonb_array_elements(s->'cart') order by value->>'product_id' loop
         reservation:=public.reserve_chat_inventory(c.id,c.branch_id,(line->>'product_id')::uuid,(line->>'qty')::integer,'pilot-reserve:'||v_run_key||':'||(line->>'product_id'),30);
         update public.inventory_reservations set expires_at=(s->>'reservation_until')::timestamptz where id=reservation.id;
         s:=jsonb_set(s,'{reservations}',(s->'reservations')||jsonb_build_array(reservation.id));
        end loop;
       end if;
       if payment_ok or s->>'payment_method'='cash_prepaid' and s->>'fulfillment_type'='pickup' then
        update public.whatsapp_conversations set status='open' where id=c.id;
        insert into public.orders(branch_id,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_zone,items,total,delivery_fee,payment_method,source,customer_notes,whatsapp_conversation_id,
          payment_receipt_bucket,payment_receipt_path,payment_receipt_name,payment_receipt_mime_type,payment_receipt_size,payment_receipt_uploaded_at)
        values(c.branch_id,(s->>'fulfillment_type')::public.fulfillment_type,s->>'customer_name',contact.phone_e164,s->>'delivery_address',s->>'delivery_zone',s->'cart',(s->>'subtotal')::bigint,
         coalesce((s->>'delivery_fee')::bigint,0),(s->>'payment_method')::public.payment_method,'WhatsApp',
         case when s->>'fulfillment_type'='delivery' then 'Recibe: '||(s->>'recipient_name')||' · '||(s->>'recipient_phone') end,c.id,
         case when proof.id is null then 'payment-receipts' else 'whatsapp-media' end,proof.storage_path,proof.original_name,proof.mime_type,proof.size_bytes,proof.created_at) returning * into purchase;
        for reservation in select * from public.inventory_reservations where conversation_id=c.id and id::text in(select jsonb_array_elements_text(s->'reservations')) order by product_id loop
         reservation:=public.commit_chat_inventory(reservation.id,purchase.id);
         if reservation.status<>'committed' then raise exception 'La reserva venció antes de confirmar el pedido'; end if;
        end loop;
        s:=s||jsonb_build_object('stage','ordered','order_id',purchase.id,'order_number',purchase.order_number);
        body:='Tu pedido '||purchase.order_number||' quedó registrado en '||branch_name||'. Total: '||public.bot_money(total)||'. '
          ||case when s->>'payment_method'='cash_prepaid' then 'El pago se realiza al recoger en la sede.' else 'El pago está aprobado.' end
          ||' Puedes consultar el estado del pedido por este chat. Aún no tenemos una hora de entrega confirmada.';
       elsif s->>'payment_method'='transfer' and p_task_id is null and exists(select 1 from public.whatsapp_attachments where conversation_id=c.id and message_id=m.id and mime_type in ('image/jpeg','image/png','image/webp','application/pdf')) then
        select * into proof from public.whatsapp_attachments where conversation_id=c.id and message_id=m.id and mime_type in ('image/jpeg','image/png','image/webp','application/pdf') order by created_at,id limit 1;
        task_kind:='payment_verification';
       elsif s->>'payment_method' in ('addi','sistecredito') then task_kind:='credit_application';
       elsif s->>'payment_method'='transfer' then
        select * into qr from public.branch_payment_qrs where branch_id=c.branch_id and active for share;
        if qr.branch_id is null then reason:='missing_qr';
        else
         want_qr:=true;body:='QR de '||branch_name||'. Valor total: '||public.bot_money(total)||'. Revisa estos datos antes de transferir y envía el comprobante por este chat. El pago será revisado antes de confirmar el pedido.';
         s:=s||'{"stage":"payment"}'::jsonb;
        end if;
       end if;
       if task_kind is not null then
        payment_task:=public.create_human_task(c.id,'pilot-payment:'||c.id||':'||(s->>'quote_id')||':'||(s->>'payment_method')||':'||coalesce(proof.id::text,'credit'),task_kind,'high','Revisar pago de la compra',
         'Revisar '||(s->>'payment_method')||' por '||public.bot_money(total)||'. '||public.bot_order_summary(branch_name,s),
         jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',m.id,'attachment_id',proof.id,'commerce',jsonb_build_object('quote_id',s->>'quote_id','payment_method',s->>'payment_method','amount',total)),null,p_owner_phone,null);
        task_ids:=task_ids||jsonb_build_array(payment_task.id);s:=s||'{"stage":"review"}'::jsonb;
        body:=case when task_kind='payment_verification' then 'Recibí tu comprobante. El pago queda pendiente de revisión antes de confirmar el pedido.' else 'La compra con '||case when s->>'payment_method'='addi' then 'Addi' else 'Sistecrédito' end||' necesita aprobación. Te confirmaremos el resultado por este chat.' end;
       end if;
      end if;
     end if;
    end if;
   end if;
  end if;
 end if;
 if reason is not null or (intent='handoff' and not needs_checkout and p_task_id is null) then
  human:=public.create_human_task(c.id,'pilot-human:'||m.id,'general','normal','Información necesaria para el bot',
   case when reason='stock_check' then 'Revisar el conteo vigente, precio y existencias de la compra: '||coalesce(s->'cart',p_decision#>'{quote,items}','[]')::text
    when reason='payment_changed' then 'La compra cambió después de enviar el comprobante. Revisar el pago y el nuevo resumen antes de solicitar otra transferencia.'
    when reason='missing_qr' then 'Cargar el QR vigente de esta sede para continuar con el pago de la compra.' else coalesce(nullif(p_decision#>>'{actions,0,question}',''),'Revisar la última consulta del cliente.') end,
   jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',m.id,'human_reason',coalesce(reason,p_decision#>>'{actions,0,reason}'))||case when reason in ('stock_check','missing_qr') and s->>'quote_id' is not null then jsonb_build_object('commerce',jsonb_build_object('quote_id',s->>'quote_id','kind',reason)) else '{}'::jsonb end,null,p_owner_phone,null);
  task_ids:=task_ids||jsonb_build_array(human.id);
  if reason='payment_changed' then body:='Como ya hay un pago en revisión, el equipo debe revisar el cambio de la compra. No hagas otra transferencia mientras lo confirmamos.'; end if;
  if reason='stock_check' then body:='Necesito confirmar las existencias y el precio de esta compra antes de continuar con el pago. Si ya pagaste, conservaremos tu comprobante para revisarlo.'; end if;
  if reason='missing_qr' then body:='El QR de esta sede necesita revisión antes de que puedas pagar. Voy a consultar ese dato.'; end if;
 end if;
 if needs_summary and s->>'fulfillment_type'='delivery' and ((now() at time zone 'America/Bogota')::time>=time '19:00' or (now() at time zone 'America/Bogota')::time<time '09:00') then body:=body||E'\nLos despachos se coordinan en el horario de 9 a. m. a 7 p. m.; aún no hay una hora de entrega confirmada.'; end if;
 if nullif(body,'') is null then raise exception 'La respuesta quedó vacía'; end if;
 if want_qr then
  image_queue:=public.queue_outbound_whatsapp_message(c.id,v_run_key||':qr','assistant','image',body,
   jsonb_build_object('pilot',true,'commerce',true,'control_version',p_control_version,'inbound_message_id',m.id,'quote_id',s->>'quote_id','storage_bucket','payment-qrs','storage_path',qr.storage_path,'mime_type',qr.mime_type,'caption',body));
  message_ids:=message_ids||jsonb_build_array(image_queue->>'message_id');queued:=image_queue;
 else
  queued:=public.queue_outbound_whatsapp_message(c.id,v_run_key||':reply','assistant','text',body,
   jsonb_build_object('pilot',true,'commerce',true,'control_version',p_control_version,'inbound_message_id',m.id,'quote_id',s->>'quote_id','order_id',purchase.id));
  message_ids:=message_ids||jsonb_build_array(queued->>'message_id');
 end if;
 if needs_summary then s:=s||jsonb_build_object('summary_message_id',queued->>'message_id'); end if;
 if intent='discovery' then
  for item in select value from jsonb_array_elements(coalesce(p_decision->'offered_product_ids','[]')) loop
   if not exists(select 1 from public.branch_inventory b join public.products p on p.id=b.product_id where b.branch_id=c.branch_id and b.product_id::text=item#>>'{}' and b.active and p.active and b.available_qty>b.reserved_qty and b.stock_confirmed_at<=now() and public.bot_stock_valid_until(b.stock_confirmed_at)>now()) then raise exception 'La opción ofrecida ya no está vigente'; end if;
   offered:=offered||jsonb_build_array(item);
  end loop;
  s:=s||jsonb_build_object('offered_ids',offered,'offered_message_id',queued->>'message_id');
 end if;
 s:=s||jsonb_build_object('version',p_commerce_version+1);
 update public.whatsapp_conversations set sales_state=jsonb_set(coalesce(sales_state,'{}'),'{pilot_commerce}',s),current_intent=intent where id=c.id;
 if nullif(s->>'customer_name','') is not null then update public.whatsapp_contacts set preferred_name=s->>'customer_name' where id=c.contact_id; end if;

 result:=jsonb_build_object('ok',true,'message_ids',message_ids,'task_ids',task_ids,'order_id',purchase.id,'order_receipt_id',case when purchase.id is not null then queued->>'message_id' end,'commerce_version',p_commerce_version+1,'control_version',p_control_version,'inbound_message_id',m.id);
 insert into public.ai_runs(conversation_id,message_id,purpose,run_key,prompt_version,model,output) values(c.id,m.id,'response',v_run_key,'pilot-commerce-v1','gpt-5-mini',result);
 return result;
end; $$;
revoke all on function public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid) to service_role;
create function public.save_bot_catalog_item(p_values jsonb) returns public.branch_inventory language plpgsql security definer set search_path='' as $$
declare s public.branch_inventory; promo bigint; starts timestamptz; ends timestamptz;
begin
 if not public.is_admin() then raise exception 'Solo un administrador puede editar el catálogo'; end if;
 if nullif(trim(p_values->>'name'),'') is null then raise exception 'Escribe el nombre del producto'; end if;
 promo:=(p_values->>'promotional_price')::bigint; starts:=(p_values->>'promotion_from')::timestamptz; ends:=(p_values->>'promotion_until')::timestamptz;
 if promo is not null and (starts is null or ends is null or ends<=starts or promo<0 or promo>=(p_values->>'price')::bigint) then raise exception 'La promoción necesita fechas válidas y un precio menor al regular'; end if;
 s:=public.adjust_branch_inventory(p_values->>'branch_id',nullif(p_values->>'product_id','')::uuid,p_values->>'sku',p_values->>'name',p_values->>'description',
  (p_values->>'price')::bigint,(p_values->>'available_qty')::integer,coalesce((p_values->>'low_stock_threshold')::integer,2),coalesce((p_values->>'seasonal')::boolean,false),coalesce((p_values->>'active')::boolean,true),'Ajuste de catálogo para el bot');
 update public.branch_inventory set promotional_price=promo,promotion_from=starts,promotion_until=ends where branch_id=s.branch_id and product_id=s.product_id returning * into s;
 if p_values->>'confirm_stock'='true' then s:=public.confirm_bot_stock(s.branch_id,s.product_id,s.available_qty); end if;
 return s;
end; $$;
revoke all on function public.save_bot_catalog_item(jsonb) from public,anon;
grant execute on function public.save_bot_catalog_item(jsonb) to authenticated;
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
create function public.expire_bot_commerce_reservations(p_conversation_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare r public.inventory_reservations; c public.whatsapp_conversations; n integer:=0;
begin
 select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
 for r in select * from public.inventory_reservations where conversation_id=c.id and status='active' and expires_at<=now()
  and id::text in(select jsonb_array_elements_text(coalesce(c.sales_state#>'{pilot_commerce,reservations}','[]'))) order by product_id loop
  perform public.release_chat_inventory(r.id,'Reserva de compra vencida');n:=n+1;
 end loop;
 return n;
end; $$;
revoke all on function public.expire_bot_commerce_reservations(uuid) from public,anon,authenticated;
grant execute on function public.expire_bot_commerce_reservations(uuid) to service_role;
-- Only orders owned by the verified WhatsApp contact; clients never supply a phone.
create function public.bot_customer_orders(p_conversation_id uuid)
returns table(id uuid,order_number text,status text,fulfillment_type text,delivery_fee bigint,total bigint,promised_at timestamptz,updated_at timestamptz,branch_id text,branch_name text)
language sql stable security definer set search_path='' as $$
 select o.id,o.order_number,o.status::text,o.fulfillment_type::text,o.delivery_fee,o.total,o.promised_at,o.updated_at,o.branch_id,b.name
 from public.whatsapp_conversations c join public.whatsapp_contacts ct on ct.id=c.contact_id
 join public.orders o on (
   o.whatsapp_conversation_id in(select old.id from public.whatsapp_conversations old where old.contact_id=c.contact_id)
   or regexp_replace(o.customer_phone,'[^0-9]','','g')=regexp_replace(ct.phone_e164,'[^0-9]','','g')
 ) join public.branches b on b.id=o.branch_id
 where c.id=p_conversation_id and c.consent_status='granted' and c.consented_at is not null
 order by o.created_at desc,o.id desc limit 10;
$$;
revoke all on function public.bot_customer_orders(uuid) from public,anon,authenticated;
grant execute on function public.bot_customer_orders(uuid) to service_role;
commit;
