-- LIMPIEZA COMPLETA — autorizada por Samuel el 30/09/2026.
-- Ejecutar TODO este archivo en Supabase > SQL Editor, como postgres.
-- No enviar mensajes al bot ni editar la intranet durante la ejecución.
-- Conserva usuarios de acceso (auth), perfiles/permisos, sedes y estructura/configuración.
-- Vacía pedidos, domicilios, domiciliarios, personal de caja, chats, pendientes,
-- PQRS, catálogo, inventario, conocimientos, QR y datos preparatorios de publicidad.
-- Crea un respaldo privado elrey_reset_20260930; no sobrescribe el respaldo del 29/09.
-- Los archivos físicos siguen en Storage privado para recuperación: se quitan sus
-- vínculos activos, NO se borran objetos por SQL. Las secuencias no se reinician.
-- Si hay actividad en curso o una dependencia inesperada, se revierte todo.
-- Preparado para el esquema comprobado el 30/09; NO es una migración automática.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $reset$
declare
  target_names text[] := array[
    'ai_runs','automation_outbox','bot_media_assets','branch_inventory',
    'branch_knowledge','branch_payment_qrs','catalog_audit_events','conversation_events',
    'couriers','human_tasks','inventory_movements','inventory_reservations','order_events',
    'orders','pqrs_attachments','pqrs_cases','pqrs_email_log','pqrs_events','privacy_consents',
    'products','staff_members','whatsapp_attachments','whatsapp_campaign_recipients',
    'whatsapp_campaigns','whatsapp_contacts','whatsapp_conversations',
    'whatsapp_marketing_permissions','whatsapp_message_status_events','whatsapp_messages',
    'whatsapp_operator_actions','whatsapp_webhook_inbox'];
  preserved_names text[] := array['branches','profiles'];
  table_name text;
  table_list text;
  dependency text;
  source_count bigint;
  archive_count bigint;
  different boolean;
  archive constant text := 'elrey_reset_20260930';
begin
  perform pg_advisory_xact_lock(hashtextextended('elrey-full-reset-20260930',0));
  if exists(select 1 from pg_namespace where nspname=archive) then
    raise exception 'El respaldo de esta limpieza ya existe. No se repite ni se sobrescribe.';
  end if;
  -- Explicit allowlist: any changed schema requires reviewing this file first.
  foreach table_name in array target_names||preserved_names loop
    if to_regclass(format('public.%I',table_name)) is null then
      raise exception 'Falta tabla requerida: %. Revisar el esquema antes de limpiar.',table_name;
    end if;
  end loop;
  select c.relname into dependency from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','f')
      and not (c.relname=any(target_names||preserved_names)) limit 1;
  if dependency is not null then
    raise exception 'Tabla no incluida en el alcance: %. No se limpió nada.',dependency;
  end if;
  select string_agg(format('public.%I',name),', ' order by name)
    into table_list from unnest(target_names||preserved_names) name;
  execute 'lock table '||table_list||' in access exclusive mode';

  -- Fail rather than silently expand the user's deletion scope.
  select c.conrelid::regclass::text into dependency
  from pg_constraint c
  where c.contype='f'
    and c.confrelid in (select to_regclass(format('public.%I',n)) from unnest(target_names) n)
    and c.conrelid not in (select to_regclass(format('public.%I',n)) from unnest(target_names) n)
  limit 1;
  if dependency is not null then raise exception 'Dependencia no incluida en el alcance: %',dependency; end if;
  if exists(select 1 from public.whatsapp_webhook_inbox
      where processed_at is null and processing_started_at>now()-interval '10 minutes')
    or exists(select 1 from public.automation_outbox where status='processing')
    or exists(select 1 from public.whatsapp_messages
      where send_started_at is not null and delivery_status='queued')
    or exists(select 1 from public.whatsapp_campaign_recipients where status in ('sending','uncertain')) then
    raise exception 'Hay procesamiento o envíos pendientes de conciliar; no se limpió nada.';
  end if;

  execute format('create schema %I',archive);
  execute format('revoke all on schema %I from public,anon,authenticated,service_role',archive);
  execute format('create table %I.manifest (table_name text primary key, rows_before bigint not null, rows_after bigint, disposition text not null, backed_up_at timestamptz not null default now())',archive);
  foreach table_name in array target_names||preserved_names loop
    execute format('create table %I.%I as table public.%I',archive,table_name,table_name);
    execute format('select count(*) from public.%I',table_name) into source_count;
    execute format('select count(*) from %I.%I',archive,table_name) into archive_count;
    execute format('select exists(select to_jsonb(t) from public.%I t except all select to_jsonb(b) from %I.%I b)',table_name,archive,table_name) into different;
    if source_count<>archive_count or different then raise exception 'Respaldo no coincide para %',table_name; end if;
    execute format('insert into %I.manifest(table_name,rows_before,disposition) values($1,$2,$3)',archive)
      using table_name,source_count,case when table_name=any(target_names) then 'reset' else 'preserved' end;
  end loop;
  -- Metadata only: binary objects remain private, available for recovery.
  if to_regclass('storage.objects') is not null then
    execute format('create table %I.storage_objects_manifest as select * from storage.objects where bucket_id in (''whatsapp-media'',''payment-receipts'',''pqrs-files'',''bot-images'',''payment-qrs'')',archive);
  end if;

  select string_agg(format('public.%I',name),', ' order by name)
    into table_list from unnest(target_names) name;
  execute 'truncate table '||table_list; -- Explicit tables, no CASCADE, no sequence restart.

  foreach table_name in array target_names||preserved_names loop
    execute format('select count(*) from public.%I',table_name) into source_count;
    execute format('update %I.manifest set rows_after=$1 where table_name=$2',archive) using source_count,table_name;
    if table_name=any(target_names) and source_count<>0 then
      raise exception 'Tabla no vacía después de limpiar: %',table_name;
    end if;
    if table_name=any(preserved_names) then
      execute format('select exists((select to_jsonb(t) from public.%I t except all select to_jsonb(b) from %I.%I b) union all (select to_jsonb(b) from %I.%I b except all select to_jsonb(t) from public.%I t))',table_name,archive,table_name,archive,table_name,table_name) into different;
      if different then raise exception 'Cambió una tabla que debía conservarse: %',table_name; end if;
    end if;
  end loop;
  -- Private archive: no application role can read it, even if exposed accidentally.
  for table_name in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=archive and c.relkind='r' loop
    execute format('alter table %I.%I enable row level security',archive,table_name);
    execute format('revoke all on table %I.%I from public,anon,authenticated,service_role',archive,table_name);
  end loop;
end;
$reset$;
commit;

select table_name,rows_before,rows_after,disposition,backed_up_at
from elrey_reset_20260930.manifest order by disposition,table_name;
