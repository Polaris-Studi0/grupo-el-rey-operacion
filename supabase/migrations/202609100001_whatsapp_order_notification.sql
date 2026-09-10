-- Reuse the internal WhatsApp recipient and sending gateway after a real order.
create or replace function public.prepare_whatsapp_order_notification(p_receipt_id uuid,p_admin_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  receipt public.whatsapp_messages;
  purchase public.orders;
  existing public.whatsapp_messages;
  admin_contact public.whatsapp_contacts;
  admin_conversation public.whatsapp_conversations;
  branch_name text;
  products text;
  body text;
begin
  select * into receipt from public.whatsapp_messages where id=p_receipt_id and direction='outbound'
    and sender_type='assistant' and nullif(raw_payload->>'order_id','') is not null;
  if receipt.id is null then return null; end if;
  select * into purchase from public.orders where id::text=receipt.raw_payload->>'order_id'
    and whatsapp_conversation_id=receipt.conversation_id;
  if purchase.id is null then return null; end if;
  if p_admin_phone is null or p_admin_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Número interno de WhatsApp inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-order-created:'||purchase.id::text,7));
  select * into existing from public.whatsapp_messages where idempotency_key='admin-order-created:'||purchase.id::text;
  if existing.id is not null then
    return jsonb_build_object('message_id',existing.id,'created',false,'delivery_status',existing.delivery_status);
  end if;
  insert into public.whatsapp_contacts(phone_e164,display_name,preferred_name,first_source,metadata)
    values(p_admin_phone,'Administrador El Rey','Administrador','internal_admin','{"role":"admin_recipient"}'::jsonb)
    on conflict(phone_e164) do update set metadata=coalesce(public.whatsapp_contacts.metadata,'{}'::jsonb)||'{"role":"admin_recipient"}'::jsonb
    returning * into admin_contact;
  select * into admin_conversation from public.whatsapp_conversations where contact_id=admin_contact.id and status<>'closed'
    order by created_at desc limit 1 for update;
  if admin_conversation.id is null then
    insert into public.whatsapp_conversations(contact_id,status,consent_status,consent_version,consented_at,source)
      values(admin_contact.id,'open','granted','internal-operator-v1',now(),'internal_admin') returning * into admin_conversation;
  end if;
  select name into branch_name from public.branches where id=purchase.branch_id;
  select string_agg((item->>'qty')||' × '||(item->>'name'),E'\n' order by ordinal)
    into products from jsonb_array_elements(purchase.items) with ordinality as entries(item,ordinal);
  body := '🛍️ Nueva compra por WhatsApp'||E'\nPedido: '||purchase.order_number||E'\nSede: '||coalesce(branch_name,purchase.branch_id)
    ||E'\nCliente: '||purchase.customer_name||E'\nTeléfono: '||coalesce(purchase.customer_phone,'')
    ||E'\nProductos:\n'||products||E'\nTotal: COP '||(purchase.total+case when purchase.fulfillment_type='delivery' then purchase.delivery_fee else 0 end)
    ||E'\nPago: '||case purchase.payment_method::text when 'transfer' then 'Transferencia verificada' when 'cash_prepaid' then 'Pago al recoger en sede' else 'Crédito aprobado: '||purchase.payment_method::text end
    ||E'\nEntrega: '||case when purchase.fulfillment_type='delivery' then 'Domicilio a '||purchase.delivery_address||', '||purchase.delivery_zone||' (envío COP '||purchase.delivery_fee||')' else 'Recogida en sede' end
    ||E'\nGestiona el pedido en https://intranet.almaceneselrey.co';
  return public.queue_outbound_whatsapp_message(admin_conversation.id,'admin-order-created:'||purchase.id::text,'system','text',body,
    jsonb_build_object('internal_notification',true,'notification_type','order_created','order_id',purchase.id,'order_number',purchase.order_number));
end;
$$;
revoke all on function public.prepare_whatsapp_order_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_order_notification(uuid,text) to service_role;
