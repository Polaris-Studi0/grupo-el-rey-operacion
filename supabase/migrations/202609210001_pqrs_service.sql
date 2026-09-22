-- Servicio público y gestión interna de PQRS
create sequence if not exists public.pqrs_case_number_seq start 1;

create table public.pqrs_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  type text not null check (type in ('peticion','queja','reclamo','sugerencia','felicitacion')),
  status text not null default 'received' check (status in ('received','in_review','awaiting_information','completed','closed')),
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 150),
  document_number text,
  customer_email text not null,
  customer_phone text,
  branch_id text references public.branches(id),
  subject text not null check (char_length(trim(subject)) between 4 and 180),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  consultation_token_hash text not null,
  privacy_accepted_at timestamptz not null,
  internal_notes text,
  latest_response text,
  assigned_to uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pqrs_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pqrs_cases(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  message text,
  public_visible boolean not null default false,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);

create table public.pqrs_attachments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pqrs_cases(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  uploaded_by_customer boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pqrs_email_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pqrs_cases(id) on delete cascade,
  recipient text not null,
  template text not null,
  provider_message_id text,
  status text not null check (status in ('sent','failed','skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index pqrs_cases_status_created_idx on public.pqrs_cases(status,created_at desc);
create index pqrs_cases_email_number_idx on public.pqrs_cases(lower(customer_email),case_number);
create index pqrs_events_case_created_idx on public.pqrs_events(case_id,created_at);
create index pqrs_attachments_case_idx on public.pqrs_attachments(case_id);

create or replace function public.prepare_pqrs_case()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.case_number is null or trim(new.case_number)='' then
    new.case_number := 'PQR-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.pqrs_case_number_seq')::text,6,'0');
  end if;
  new.customer_name := trim(new.customer_name);
  new.customer_email := lower(trim(new.customer_email));
  new.customer_phone := nullif(trim(coalesce(new.customer_phone,'')),'');
  new.document_number := nullif(trim(coalesce(new.document_number,'')),'');
  new.subject := trim(new.subject);
  new.description := trim(new.description);
  new.updated_at := now();
  return new;
end;
$$;

create trigger pqrs_cases_prepare before insert or update on public.pqrs_cases
for each row execute function public.prepare_pqrs_case();

create or replace function public.audit_new_pqrs_case()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pqrs_events(case_id,event_type,to_status,message,public_visible,actor_name)
  values(new.id,'created',new.status,'PQRS radicada correctamente.',true,'Sistema');
  return new;
end;
$$;

create trigger pqrs_cases_created after insert on public.pqrs_cases
for each row execute function public.audit_new_pqrs_case();

alter table public.pqrs_cases enable row level security;
alter table public.pqrs_events enable row level security;
alter table public.pqrs_attachments enable row level security;
alter table public.pqrs_email_log enable row level security;

grant select on public.pqrs_cases,public.pqrs_events,public.pqrs_attachments,public.pqrs_email_log to authenticated;
create policy pqrs_cases_admin_read on public.pqrs_cases for select to authenticated using (public.is_admin());
create policy pqrs_events_admin_read on public.pqrs_events for select to authenticated using (public.is_admin());
create policy pqrs_attachments_admin_read on public.pqrs_attachments for select to authenticated using (public.is_admin());
create policy pqrs_email_log_admin_read on public.pqrs_email_log for select to authenticated using (public.is_admin());

revoke insert,update,delete on public.pqrs_cases,public.pqrs_events,public.pqrs_attachments,public.pqrs_email_log from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pqrs-files','pqrs-files',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy pqrs_files_admin_read on storage.objects for select to authenticated
using (bucket_id='pqrs-files' and public.is_admin());

alter table public.pqrs_cases replica identity full;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pqrs_cases') then
    alter publication supabase_realtime add table public.pqrs_cases;
  end if;
end $$;
