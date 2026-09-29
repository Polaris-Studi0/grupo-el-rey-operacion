-- One-time reset explicitly requested by Samuel on 2026-09-29.
-- Run as database administrator, after pausing application writes/workers.
-- Atomic backup + reset. Never use CASCADE or replay old migrations.
-- Preserves staff/accounts, couriers, branches, catalog, stock counts, QR and settings.
-- Retains sequences and private Storage files as part of the recovery archive.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $reset$
declare
  target_names text[] := array[
    'whatsapp_contacts','whatsapp_conversations','privacy_consents','whatsapp_messages',
    'whatsapp_attachments','whatsapp_message_status_events','conversation_events','ai_runs',
    'human_tasks','whatsapp_webhook_inbox','automation_outbox','whatsapp_operator_actions',
    'whatsapp_shared_media','whatsapp_bot_jobs','orders','order_events',
    'inventory_reservations','inventory_movements',
    'pqrs_cases','pqrs_events','pqrs_attachments','pqrs_email_log'];
  preserved_names text[] := array[
    'branches','profiles','couriers','staff_members','products','branch_inventory',
    'branch_knowledge','branch_payment_qrs','catalog_audit_events','whatsapp_bot_runtime'];
  present_targets text[] := '{}';
  present_preserved text[] := '{}';
  table_name text;
  table_list text;
  dependency text;
  source_count bigint;
  archive_count bigint;
  different boolean;
  archive constant text := 'elrey_reset_20260929';
begin
  perform pg_advisory_xact_lock(hashtextextended('elrey-operational-reset-20260929',0));
  if exists(select 1 from pg_namespace where nspname=archive) then
    raise exception 'El respaldo de esta limpieza ya existe. No se repite ni se sobrescribe.';
  end if;
  foreach table_name in array array['whatsapp_contacts','whatsapp_conversations','whatsapp_messages','orders','pqrs_cases','branch_inventory'] loop
    if to_regclass(format('public.%I',table_name)) is null then
      raise exception 'Falta tabla requerida: %. Revisar el esquema antes de limpiar.',table_name;
    end if;
  end loop;
  foreach table_name in array target_names loop
    if to_regclass(format('public.%I',table_name)) is not null then
      present_targets := array_append(present_targets,table_name);
    end if;
  end loop;
  foreach table_name in array preserved_names loop
    if to_regclass(format('public.%I',table_name)) is not null then
      present_preserved := array_append(present_preserved,table_name);
    end if;
  end loop;
  select string_agg(format('public.%I',name),', ' order by name)
    into table_list from unnest(present_targets||present_preserved) name;
  execute 'lock table '||table_list||' in access exclusive mode';

  -- Fail rather than silently expand the user's deletion scope.
  select c.conrelid::regclass::text into dependency
  from pg_constraint c
  where c.contype='f'
    and c.confrelid in (select to_regclass(format('public.%I',n)) from unnest(present_targets) n)
    and c.conrelid not in (select to_regclass(format('public.%I',n)) from unnest(present_targets) n)
  limit 1;
  if dependency is not null then raise exception 'Dependencia no incluida en el alcance: %',dependency; end if;
  if exists(select 1 from public.whatsapp_webhook_inbox where processing_started_at>now()-interval '10 minutes')
    or exists(select 1 from public.automation_outbox where status='processing' and processing_started_at>now()-interval '10 minutes')
    or exists(select 1 from public.whatsapp_messages where send_started_at is not null and delivery_status='queued') then
    raise exception 'Hay procesamiento o envíos pendientes de conciliar; no se limpió nada.';
  end if;

  execute format('create schema %I',archive);
  execute format('revoke all on schema %I from public,anon,authenticated,service_role',archive);
  execute format('create table %I.manifest (table_name text primary key, rows_before bigint not null, rows_after bigint, disposition text not null, backed_up_at timestamptz not null default now())',archive);
  foreach table_name in array present_targets||present_preserved loop
    execute format('create table %I.%I as table public.%I',archive,table_name,table_name);
    execute format('select count(*) from public.%I',table_name) into source_count;
    execute format('select count(*) from %I.%I',archive,table_name) into archive_count;
    execute format('select exists(select to_jsonb(t) from public.%I t except all select to_jsonb(b) from %I.%I b)',table_name,archive,table_name) into different;
    if source_count<>archive_count or different then raise exception 'Respaldo no coincide para %',table_name; end if;
    execute format('insert into %I.manifest(table_name,rows_before,disposition) values($1,$2,$3)',archive)
      using table_name,source_count,case when table_name=any(present_targets) then 'reset' else 'preserved' end;
  end loop;
  -- Metadata only: binary objects remain private, available for recovery.
  if to_regclass('storage.objects') is not null then
    execute format('create table %I.storage_objects_manifest as select * from storage.objects where bucket_id in (''whatsapp-media'',''payment-receipts'',''pqrs-files'')',archive);
  end if;

  select string_agg(format('public.%I',name),', ' order by name)
    into table_list from unnest(present_targets) name;
  execute 'truncate table '||table_list; -- Explicit tables, no CASCADE, no sequence restart.

  -- Preserve manual catalog/count movements unrelated to chats, orders or holds.
  execute format('insert into public.inventory_movements select * from %I.inventory_movements where order_id is null and conversation_id is null and reservation_id is null',archive);
  update public.branch_inventory set reserved_qty=0 where reserved_qty<>0;

  foreach table_name in array present_targets||present_preserved loop
    execute format('select count(*) from public.%I',table_name) into source_count;
    execute format('update %I.manifest set rows_after=$1 where table_name=$2',archive) using source_count,table_name;
    if table_name=any(present_targets) and table_name<>'inventory_movements' and source_count<>0 then
      raise exception 'Tabla no vacía después de limpiar: %',table_name;
    end if;
    if table_name=any(present_preserved) then
      if table_name='branch_inventory' then
        execute format('select exists((select to_jsonb(t)-''reserved_qty''-''updated_at'' from public.branch_inventory t except all select to_jsonb(b)-''reserved_qty''-''updated_at'' from %I.branch_inventory b) union all (select to_jsonb(b)-''reserved_qty''-''updated_at'' from %I.branch_inventory b except all select to_jsonb(t)-''reserved_qty''-''updated_at'' from public.branch_inventory t))',archive,archive) into different;
      else
        execute format('select exists((select to_jsonb(t) from public.%I t except all select to_jsonb(b) from %I.%I b) union all (select to_jsonb(b) from %I.%I b except all select to_jsonb(t) from public.%I t))',table_name,archive,table_name,archive,table_name,table_name) into different;
      end if;
      if different then raise exception 'Cambió una tabla que debía conservarse: %',table_name; end if;
    end if;
  end loop;
  if exists(select 1 from public.branch_inventory where reserved_qty<>0) then raise exception 'Quedaron reservas de stock'; end if;
  -- Private archive: no application role can read it, even if exposed accidentally.
  for table_name in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=archive and c.relkind='r' loop
    execute format('alter table %I.%I enable row level security',archive,table_name);
    execute format('revoke all on table %I.%I from public,anon,authenticated,service_role',archive,table_name);
  end loop;
end;
$reset$;
commit;

select table_name,rows_before,rows_after,disposition,backed_up_at
from elrey_reset_20260929.manifest order by disposition,table_name;
