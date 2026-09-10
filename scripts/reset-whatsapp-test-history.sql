-- ONE-TIME maintenance authorized by Samuel on 2026-09-09.
-- Stops if there are other contacts, orders or stock movements/reservations.
-- Backup stays in a private schema, outside the API. Does not change sequences.
begin;
lock table public.whatsapp_contacts,public.whatsapp_conversations,public.whatsapp_messages,
  public.human_tasks,public.orders,public.inventory_movements,public.inventory_reservations,
  public.whatsapp_webhook_inbox,public.automation_outbox in access exclusive mode;
do $guard$
begin
  if exists(select 1 from public.whatsapp_contacts where phone_e164 is distinct from '+573127378289')
    or exists(select 1 from public.orders) or exists(select 1 from public.inventory_movements)
    or exists(select 1 from public.inventory_reservations) then
    raise exception 'Hay datos ajenos a la prueba autorizada: no se limpió nada';
  end if;
end $guard$;
create schema if not exists elrey_test_backups;
revoke all on schema elrey_test_backups from public,anon,authenticated,service_role;
create table elrey_test_backups.whatsapp_20260909 (
  table_name text not null, row_data jsonb not null, backed_up_at timestamptz not null default now()
);
alter table elrey_test_backups.whatsapp_20260909 enable row level security;
revoke all on table elrey_test_backups.whatsapp_20260909 from public,anon,authenticated,service_role;
do $backup$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_contacts','whatsapp_conversations','privacy_consents',
    'whatsapp_messages','whatsapp_attachments','whatsapp_message_status_events','conversation_events',
    'ai_runs','human_tasks','whatsapp_webhook_inbox','automation_outbox','orders','order_events',
    'inventory_reservations','inventory_movements'] loop
    execute format('insert into elrey_test_backups.whatsapp_20260909(table_name,row_data) select %L,to_jsonb(t) from public.%I t',table_name,table_name);
  end loop;
end $backup$;
truncate table public.whatsapp_attachments,public.whatsapp_message_status_events,public.conversation_events,
  public.ai_runs,public.privacy_consents,public.human_tasks,public.automation_outbox,
  public.whatsapp_webhook_inbox,public.inventory_movements,public.inventory_reservations,
  public.order_events,public.orders,public.whatsapp_messages,public.whatsapp_conversations,public.whatsapp_contacts;
commit;
select (select count(*) from public.whatsapp_contacts) as contacts,
  (select count(*) from public.whatsapp_conversations) as conversations,
  (select count(*) from public.whatsapp_messages) as messages,
  (select count(*) from public.orders) as orders,
  (select count(*) from elrey_test_backups.whatsapp_20260909) as backed_up_rows;
