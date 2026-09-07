-- Un código QR de transferencia vigente por sede, administrado desde el panel.

create table if not exists public.branch_payment_qrs (
  branch_id text primary key references public.branches(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists branch_payment_qrs_touch on public.branch_payment_qrs;
create trigger branch_payment_qrs_touch before update on public.branch_payment_qrs
for each row execute function public.touch_chatbot_record();

alter table public.branch_payment_qrs enable row level security;
grant select,insert,update,delete on public.branch_payment_qrs to authenticated;

create policy branch_payment_qrs_read on public.branch_payment_qrs for select to authenticated
using (public.is_admin() or branch_id=public.current_branch_id());
create policy branch_payment_qrs_write on public.branch_payment_qrs for all to authenticated
using (public.is_admin() or branch_id=public.current_branch_id())
with check (public.is_admin() or branch_id=public.current_branch_id());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-qrs','payment-qrs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy payment_qrs_read on storage.objects for select to authenticated
using (bucket_id='payment-qrs' and (public.is_admin() or (storage.foldername(name))[1]=public.current_branch_id()));
create policy payment_qrs_insert on storage.objects for insert to authenticated
with check (bucket_id='payment-qrs' and (public.is_admin() or (storage.foldername(name))[1]=public.current_branch_id()));
create policy payment_qrs_delete on storage.objects for delete to authenticated
using (bucket_id='payment-qrs' and (public.is_admin() or (storage.foldername(name))[1]=public.current_branch_id()));

grant select on public.branch_payment_qrs to service_role;
