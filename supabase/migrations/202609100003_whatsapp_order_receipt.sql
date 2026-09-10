-- Link the exact attachment reviewed by the payment task, retaining private storage.
alter table public.orders add column payment_receipt_bucket text not null default 'payment-receipts'
  check (payment_receipt_bucket in ('payment-receipts','whatsapp-media'));
alter table public.orders drop constraint orders_payment_receipt_size_check;
alter table public.orders add constraint orders_payment_receipt_size_check
  check (payment_receipt_size is null or payment_receipt_size between 1 and 10485760);

create function public.link_verified_whatsapp_receipt(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.orders; proof public.whatsapp_attachments;
begin
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null or target.payment_receipt_path is not null or target.payment_method<>'transfer' then return false; end if;
  select a.* into proof from public.whatsapp_conversations c
    join public.human_tasks t on t.id::text=c.sales_state->>'payment_verified_task_id'
      and t.conversation_id=c.id and t.branch_id=target.branch_id and t.task_type='payment_verification' and t.status='resolved'
    join public.whatsapp_attachments a on a.message_id::text=t.context->>'inbound_message_id' and a.conversation_id=c.id
    join public.whatsapp_messages m on m.id=a.message_id and m.direction='inbound' and m.sender_type='customer'
    where c.id=target.whatsapp_conversation_id and t.context#>'{sales_state,items}'=target.items
      and lower(coalesce(t.resolution->>'answer','')) !~ '\m(no|rechazado|rechazada|pendiente|falta|inválido|invalido)\M'
      and (t.resolution->>'approved'='true' or lower(coalesce(t.resolution->>'answer','')) ~ '\m(aprobado|aprobada|verificado|verificada|validado|validada|válido|valido|válida|valida|pago recibido)\M')
      and a.mime_type in ('image/jpeg','image/png','image/webp','application/pdf')
    order by a.created_at desc limit 1;
  if proof.id is null then return false; end if;
  update public.orders set payment_receipt_bucket='whatsapp-media',payment_receipt_path=proof.storage_path,
    payment_receipt_name=coalesce(proof.original_name,'Comprobante de WhatsApp'),payment_receipt_mime_type=proof.mime_type,
    payment_receipt_size=proof.size_bytes,payment_receipt_uploaded_at=proof.created_at,payment_receipt_uploaded_by=null
    where id=target.id and payment_receipt_path is null;
  return found;
end;
$$;
revoke all on function public.link_verified_whatsapp_receipt(uuid) from public,anon,authenticated;
grant execute on function public.link_verified_whatsapp_receipt(uuid) to service_role;

create function public.link_whatsapp_receipt_on_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_id uuid;
begin
  if TG_TABLE_NAME='orders' then perform public.link_verified_whatsapp_receipt(new.id);
  else
    for order_id in select id from public.orders where whatsapp_conversation_id=new.conversation_id and payment_receipt_path is null
    loop perform public.link_verified_whatsapp_receipt(order_id); end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.link_whatsapp_receipt_on_insert() from public,anon,authenticated;
create trigger order_link_whatsapp_receipt after insert on public.orders for each row execute function public.link_whatsapp_receipt_on_insert();
create trigger attachment_link_whatsapp_receipt after insert on public.whatsapp_attachments for each row execute function public.link_whatsapp_receipt_on_insert();

-- A manual replacement returns to the existing payment-receipts bucket.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.attach_payment_receipt(uuid,text,text,text,bigint)'::regprocedure);
  if position('payment_receipt_path=p_path,' in definition)=0 then raise exception 'Unexpected receipt attachment function'; end if;
  execute replace(definition,'payment_receipt_path=p_path,','payment_receipt_bucket=''payment-receipts'', payment_receipt_path=p_path,');
end; $$;
create policy whatsapp_order_receipts_read on storage.objects for select to authenticated using (
  bucket_id='whatsapp-media' and exists(select 1 from public.orders o
    where o.payment_receipt_bucket='whatsapp-media' and o.payment_receipt_path=storage.objects.name
      and (public.is_admin() or o.branch_id=public.current_branch_id()))
);
select public.link_verified_whatsapp_receipt(id) from public.orders
where whatsapp_conversation_id is not null and payment_receipt_path is null;
