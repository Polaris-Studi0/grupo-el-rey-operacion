-- orders.total is the products subtotal; the operation panel adds delivery_fee.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.persist_whatsapp_ai_response(uuid,uuid,jsonb,jsonb)'::regprocedure);
  if position('order_items,order_subtotal+case' in definition)=0 then raise exception 'Unexpected order subtotal expression'; end if;
  definition:=replace(definition,'order_items,order_subtotal+case when order_fulfillment=''delivery'' then order_delivery_fee else 0 end,','order_items,order_subtotal,');
  definition:=replace(definition,'||order_row.total||','||(order_row.total+case when order_row.fulfillment_type=''delivery'' then order_row.delivery_fee else 0 end)||');
  execute definition;
end;
$$;
-- Repair only auto-created WhatsApp rows with the exact known double-fee shape.
update public.orders o set total=(select sum((i->>'qty')::bigint*(i->>'unit_price')::bigint) from jsonb_array_elements(o.items) i)
where o.whatsapp_conversation_id is not null and o.source='WhatsApp' and o.fulfillment_type='delivery' and o.delivery_fee>0
  and o.internal_notes='Pedido creado automáticamente desde WhatsApp.'
  and o.total=(select sum((i->>'qty')::bigint*(i->>'unit_price')::bigint) from jsonb_array_elements(o.items) i)+o.delivery_fee;
