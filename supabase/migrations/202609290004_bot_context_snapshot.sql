begin;
-- One read-only statement gives the Worker a consistent, bounded snapshot.
-- Service-only: browser operators must pass the Worker's conversation checks.
create function public.bot_context_snapshot(p_conversation_id uuid)
returns table(snapshot jsonb) language sql stable security definer set search_path='' as $$
 with c as (select * from public.whatsapp_conversations where id=p_conversation_id),
 messages as (
   select m.id,m.direction,m.sender_type,m.message_type,m.body,m.delivery_status,m.created_at,m.raw_payload
   from public.whatsapp_messages m where m.conversation_id=p_conversation_id
   and (m.direction='inbound' and m.sender_type='customer' or m.direction='outbound' and m.delivery_status in ('sent','delivered','read'))
   and coalesce(m.raw_payload->>'internal_notification','false')<>'true'
   order by m.created_at desc,m.id desc limit 60
 ), latest as (select id from messages where direction='inbound' order by created_at desc,id desc limit 1)
 select jsonb_build_object(
   'conversation',to_jsonb(c),
   'branches',(select coalesce(jsonb_agg(t),'[]') from (select id,name from public.branches where id=c.branch_id and active) t),
   'contacts',(select coalesce(jsonb_agg(t),'[]') from (select preferred_name,display_name from public.whatsapp_contacts where id=c.contact_id) t),
   'messages',(select coalesce(jsonb_agg(m order by m.created_at desc,m.id desc),'[]') from messages m),
   'knowledge',(select coalesce(jsonb_agg(t),'[]') from (select id,branch_id,category,title,content,valid_from,valid_until,updated_at from public.branch_knowledge where active and (branch_id=c.branch_id or branch_id is null) order by updated_at desc,id asc limit 100) t),
   'inventory',(select coalesce(jsonb_agg(t),'[]') from (select i.*,jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'active',p.active,'seasonal',p.seasonal) as product from public.branch_inventory i join public.products p on p.id=i.product_id where i.branch_id=c.branch_id and i.active order by i.product_id limit 101) t),
   'qrs',(select coalesce(jsonb_agg(t),'[]') from (select branch_id,storage_path,updated_at,mime_type from public.branch_payment_qrs where branch_id=c.branch_id and active limit 2) t),
   'instructions',(select coalesce(jsonb_agg(t),'[]') from (select request_id,payload,created_at from public.whatsapp_operator_actions where conversation_id=c.id and action='instruction' and status='pending_bot' order by created_at desc,request_id desc limit 10) t),
   'orders',(select coalesce(jsonb_agg(t),'[]') from public.bot_customer_orders(c.id) t),
   'answers',(select coalesce(jsonb_agg(t),'[]') from (select id,question,resolution,resolved_at from public.human_tasks where conversation_id=c.id and branch_id=c.branch_id and status in ('resolved','rejected') and context->>'pilot_engine'='new-whatsapp-v1' order by resolved_at desc,id desc limit 10) t),
   'reservations',(select coalesce(jsonb_agg(t),'[]') from (select id,product_id,quantity,expires_at from public.inventory_reservations where conversation_id=c.id and status='active' limit 50) t),
   'allBranches',(select coalesce(jsonb_agg(t),'[]') from (select id,name from public.branches where active order by id limit 20) t),
   'attachments',(select coalesce(jsonb_agg(t),'[]') from (select id,message_id,storage_path,mime_type from public.whatsapp_attachments where conversation_id=c.id and message_id=(select id from latest) order by id limit 1) t)
 ) from c;
$$;
revoke all on function public.bot_context_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.bot_context_snapshot(uuid) to service_role;
commit;
