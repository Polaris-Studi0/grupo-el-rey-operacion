begin;
-- Remember a customer's selection from an operator's answer without pretending
-- that free text has already created inventory, reserved units or approved payment.
create function public.bot_confirmed_selection(p_conversation_id uuid,p_item jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.human_tasks; excerpt text; name text; variant text; prices text[]; qty integer; price bigint;
begin
 select * into t from public.human_tasks where id::text=p_item->>'source_task_id' and conversation_id=p_conversation_id
 and branch_id=(select branch_id from public.whatsapp_conversations where id=p_conversation_id)
 and status='resolved' and resolved_by is not null and context->>'pilot_engine'='new-whatsapp-v1';
 excerpt:=trim(p_item->>'source_excerpt');name:=trim(p_item->>'name');variant:=trim(coalesce(p_item->>'variant',''));
 if t.id is null or nullif(excerpt,'') is null or nullif(name,'') is null or length(excerpt)>800 or length(name)>160 or length(variant)>80
 or position(lower(excerpt) in lower(t.resolution->>'answer'))=0 or position(lower(name) in lower(excerpt))=0
 or (variant<>'' and position(lower(variant) in lower(excerpt))=0) then raise exception 'La selección no coincide con la información confirmada'; end if;
 select array_agg(r[1]) into prices from regexp_matches(excerpt,'([0-9]{1,3}(?:[.][0-9]{3})+|[0-9]{4,})','g') r;
 if coalesce(cardinality(prices),0)<>1 then raise exception 'El precio de la selección requiere aclaración'; end if;
 price:=replace(prices[1],'.','')::bigint;qty:=(p_item->>'quantity')::integer;
 if price is distinct from (p_item->>'unit_price_cop')::bigint or price<=0 or qty is null or qty not between 1 and 99 then raise exception 'Precio o cantidad de selección inválidos'; end if;
 return jsonb_build_object('source_task_id',t.id,'source_excerpt',excerpt,'name',name,'variant',variant,'unit_price_cop',price,'quantity',qty);
end; $$;
revoke all on function public.bot_confirmed_selection(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bot_confirmed_selection(uuid,jsonb) to service_role;

do $patch$
declare def text; marker text; replacement text;
begin
 def:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 marker:=$old$  if task.task_type='delivery_quote' then$old$;
 replacement:=$new$  if task.context#>>'{commerce,kind}'='confirmed_item' then
   if task.status='resolved' and task.resolution->'approved_item'='true'::jsonb and task.resolution->>'product_id' is not null then
    select * into stock from public.branch_inventory where branch_id=c.branch_id and product_id=(task.resolution->>'product_id')::uuid and active for update;
    select * into product from public.products where id=stock.product_id and active;
    if product.id is null or stock.price is distinct from (s#>>'{pending_selection,unit_price_cop}')::bigint then raise exception 'El producto confirmado cambió'; end if;
    quantity:=(s#>>'{pending_selection,quantity}')::integer;
    s:=(s-'pending_selection')||jsonb_build_object('cart',jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'qty',quantity,'unit_price',stock.price)),'subtotal',quantity*stock.price,'stage','collecting');
   else
    needs_checkout:=false;s:=s-'pending_selection';body:=coalesce(nullif(trim(task.resolution->>'answer'),''),'No está disponible esa cantidad. Podemos revisar otra opción.');
   end if;
  elsif task.task_type='delivery_quote' then$new$;
 if position(marker in def)=0 then raise exception 'Versión de consumidor no compatible (tarea)';end if;def:=replace(def,marker,replacement);
 marker:=$old$   if intent='quote' and jsonb_array_length$old$;
 replacement:=$new$   if p_decision->'confirmed_item' is not null and p_decision->'confirmed_item'<>'null'::jsonb then
    if intent<>'checkout' then raise exception 'La selección requiere un turno de compra';end if;
    item:=public.bot_confirmed_selection(c.id,p_decision->'confirmed_item');
    if s->>'stage'='ordered' then s:=jsonb_build_object('version',p_commerce_version,'customer_name',s->>'customer_name');end if;
    changed:=item is distinct from s->'pending_selection';
    s:=s||jsonb_build_object('pending_selection',item,'cart','[]'::jsonb,'subtotal',0);
   end if;
   if intent='quote' and jsonb_array_length$new$;
 if position(marker in def)=0 then raise exception 'Versión de consumidor no compatible (selección)';end if;def:=replace(def,marker,replacement);
 marker:=$old$changed:=items is distinct from coalesce(s->'cart','[]'); s:=s||jsonb_build_object('cart',items,'subtotal',subtotal);$old$;
 if position(marker in def)=0 then raise exception 'Versión de consumidor no compatible (carrito)';end if;
 def:=replace(def,marker,$new$changed:=items is distinct from coalesce(s->'cart','[]'); s:=(s-'pending_selection')||jsonb_build_object('cart',items,'subtotal',subtotal);$new$);
 marker:=$old$   needs_checkout:=false; body:='¿Qué producto te gustaría comprar?';$old$;
 replacement:=$new$   needs_checkout:=false;
   if s->'pending_selection' is not null then
    item:=s->'pending_selection';
    body:='Claro, '||(item->>'quantity')||' '||(item->>'name')||case when nullif(item->>'variant','') is not null then ' ('||(item->>'variant')||')' else '' end||', a '||public.bot_money((item->>'unit_price_cop')::bigint)||' cada uno. ';
    if nullif(s->>'fulfillment_type','') is null then body:=body||'¿Lo prefieres a domicilio o lo recoges en la sede?';
    elsif nullif(s->>'customer_name','') is null then body:=body||'¿A nombre de quién hacemos la compra?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'delivery_address','') is null then body:=body||'¿Cuál es la dirección de entrega?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'delivery_zone','') is null then body:=body||'¿En qué barrio o sector queda?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'recipient_name','') is null then body:=body||'¿Quién recibe el pedido?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'recipient_phone','') is null then body:=body||'¿Cuál es el teléfono de quien recibe?';
    else
     human:=public.create_human_task(c.id,'pilot-confirmed-item:'||c.id||':'||(s->>'quote_id'),'product_lookup','normal','Confirmar existencias de la selección',
      'El cliente eligió '||(item->>'quantity')||' '||(item->>'name')||' '||coalesce(item->>'variant','')||' a '||public.bot_money((item->>'unit_price_cop')::bigint)||' cada uno. Nombre, talla y precio ya confirmados. Indica únicamente las existencias físicas para continuar.',
      jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',m.id,'commerce',jsonb_build_object('kind','confirmed_item','quote_id',s->>'quote_id','selection',item)),null,p_owner_phone,null);
     task_ids:=task_ids||jsonb_build_array(human.id);s:=s||'{"stage":"stock_review"}'::jsonb;
     body:='Ya tengo tu selección y los datos de entrega. Confirmaré las unidades disponibles antes de darte el resumen final y continuar con el pago.';
    end if;
   else body:='¿Qué producto te gustaría comprar?';end if;$new$;
 if position(marker in def)=0 then raise exception 'Versión de consumidor no compatible (continuación)';end if;def:=replace(def,marker,replacement);
 execute def;
end; $patch$;

-- Only an operator may turn that remembered selection into counted inventory.
-- No products or promotions are created merely by running this migration.
do $patch$
declare def text; marker text; replacement text;
begin
 def:=pg_get_functiondef('public.resolve_bot_commerce_task(uuid,text,jsonb)'::regprocedure);
 def:=replace(def,'declare t public.human_tasks; amount bigint;','declare t public.human_tasks; amount bigint; item jsonb; counted public.branch_inventory; c public.whatsapp_conversations;');
 marker:=$old$  if t.task_type='delivery_quote' then$old$;
 replacement:=$new$  if t.context#>>'{commerce,kind}'='confirmed_item' then
   select * into c from public.whatsapp_conversations where id=t.conversation_id;
   if c.branch_id is distinct from t.branch_id or c.sales_state#>>'{pilot_commerce,quote_id}' is distinct from t.context#>>'{commerce,quote_id}' then raise exception 'La selección cambió; actualiza la conversación';end if;
   if t.status='resolved' and t.resolution->>'product_id' is not null then return t;end if;
   item:=public.bot_confirmed_selection(t.conversation_id,t.context#>'{commerce,selection}');
   if p_resolution->'approved_item' is distinct from 'true'::jsonb or coalesce(p_resolution->>'available_qty','')!~'^[0-9]+$'
    or (p_resolution->>'available_qty')::integer<(item->>'quantity')::integer then raise exception 'Confirma las existencias físicas suficientes para esta selección';end if;
   counted:=public.save_bot_catalog_item(jsonb_build_object('branch_id',t.branch_id,'sku','CONFIRMADO-'||t.id,'name',(item->>'name')||case when nullif(item->>'variant','') is not null then ' · '||(item->>'variant') else '' end,'description','Producto confirmado para una consulta de WhatsApp','price',(item->>'unit_price_cop')::bigint,'available_qty',(p_resolution->>'available_qty')::integer,'seasonal',false,'active',true,'confirm_stock',true));
   p_resolution:=p_resolution||jsonb_build_object('product_id',counted.product_id);
  elsif t.task_type='delivery_quote' then$new$;
 if position(marker in def)=0 then raise exception 'Versión de resolución no compatible';end if;
 execute replace(def,marker,replacement);
end; $patch$;
commit;
