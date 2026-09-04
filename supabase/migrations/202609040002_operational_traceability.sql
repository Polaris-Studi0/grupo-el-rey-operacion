-- Grupo Almacenes El Rey - trazabilidad operativa ampliada

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id),
  full_name text not null check (nullif(trim(full_name),'') is not null),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_members_branch_active_idx on public.staff_members(branch_id,active,full_name);

alter table public.orders
  add column delivery_fee bigint not null default 0 check (delivery_fee >= 0),
  add column courier_name text,
  add column courier_plate text,
  add column courier_phone text,
  add column courier_provider text,
  add column courier_assigned_at timestamptz,
  add column courier_assigned_by uuid references auth.users(id) on delete set null,
  add column handoff_staff_id uuid references public.staff_members(id) on delete set null,
  add column handoff_staff_name text,
  add column payment_receipt_path text,
  add column payment_receipt_name text,
  add column payment_receipt_mime_type text,
  add column payment_receipt_size bigint check (payment_receipt_size is null or payment_receipt_size between 1 and 5242880),
  add column payment_receipt_uploaded_at timestamptz,
  add column payment_receipt_uploaded_by uuid references auth.users(id) on delete set null;

alter table public.orders add constraint occasional_courier_has_trace_data check (
  courier_name is null or (
    nullif(trim(courier_name),'') is not null and
    nullif(trim(coalesce(courier_plate,'')),'') is not null and
    nullif(trim(coalesce(courier_provider,'')),'') is not null
  )
);

update public.orders as orders
set courier_name=couriers.name,
    courier_plate=couriers.plate,
    courier_phone=couriers.phone,
    courier_provider=couriers.provider,
    courier_assigned_at=coalesce(orders.updated_at,orders.created_at)
from public.couriers as couriers
where orders.courier_id=couriers.id;

alter table public.orders drop constraint dispatched_requires_courier;
alter table public.orders add constraint dispatched_requires_courier
  check (
    status <> 'dispatched' or
    (fulfillment_type='delivery' and (courier_id is not null or nullif(trim(courier_name),'') is not null))
  );

alter table public.order_events
  add column staff_member_id uuid references public.staff_members(id) on delete set null,
  add column staff_name text;

create or replace function public.touch_staff_member()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.full_name := trim(new.full_name);
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_members_touch before insert or update on public.staff_members
for each row execute function public.touch_staff_member();

create or replace function public.prepare_order_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare saved_courier public.couriers;
begin
  if tg_op = 'INSERT' then
    if new.order_number is null or trim(new.order_number) = '' then
      new.order_number := 'REY-' || lpad(nextval('public.order_number_seq')::text,4,'0');
    end if;
    new.created_by := coalesce(auth.uid(),new.created_by);
  end if;

  if new.courier_id is not null then
    select * into saved_courier from public.couriers where id=new.courier_id;
    if saved_courier.id is null then raise exception 'Domiciliario frecuente no encontrado'; end if;
    new.courier_name := saved_courier.name;
    new.courier_plate := saved_courier.plate;
    new.courier_phone := saved_courier.phone;
    new.courier_provider := saved_courier.provider;
  end if;

  if new.fulfillment_type='pickup' then
    new.courier_id := null;
    new.courier_name := null;
    new.courier_plate := null;
    new.courier_phone := null;
    new.courier_provider := null;
    new.courier_assigned_at := null;
    new.courier_assigned_by := null;
    new.delivery_fee := 0;
  elsif nullif(trim(coalesce(new.courier_name,'')),'') is not null and (
    tg_op='INSERT' or
    old.courier_id is distinct from new.courier_id or
    old.courier_name is distinct from new.courier_name or
    old.courier_plate is distinct from new.courier_plate or
    old.courier_provider is distinct from new.courier_provider
  ) then
    new.courier_assigned_at := now();
    new.courier_assigned_by := auth.uid();
  end if;

  new.updated_by := coalesce(auth.uid(),new.updated_by);
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    if old.status is distinct from new.status then
      if new.status='ready' then new.ready_at := now(); end if;
      if new.status='dispatched' then new.dispatched_at := now(); end if;
      if new.status='delivered' then new.delivered_at := now(); end if;
      if new.status='cancelled' then new.cancelled_at := now(); end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_cashier_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_fixed jsonb; new_fixed jsonb;
begin
  if public.current_app_role() = 'cashier' then
    old_fixed := to_jsonb(old) - array[
      'status','ready_at','dispatched_at','delivered_at','updated_at','updated_by','version',
      'handoff_staff_id','handoff_staff_name',
      'payment_receipt_path','payment_receipt_name','payment_receipt_mime_type',
      'payment_receipt_size','payment_receipt_uploaded_at','payment_receipt_uploaded_by'
    ];
    new_fixed := to_jsonb(new) - array[
      'status','ready_at','dispatched_at','delivered_at','updated_at','updated_by','version',
      'handoff_staff_id','handoff_staff_name',
      'payment_receipt_path','payment_receipt_name','payment_receipt_mime_type',
      'payment_receipt_size','payment_receipt_uploaded_at','payment_receipt_uploaded_by'
    ];
    if old_fixed <> new_fixed then raise exception 'Caja no puede modificar información administrativa'; end if;
    if old.status is distinct from new.status and not (
      (old.status='preparing' and new.status='ready') or
      (old.status='ready' and new.status='dispatched' and old.fulfillment_type='delivery' and nullif(trim(coalesce(old.courier_name,'')),'') is not null) or
      (old.status='ready' and new.status='delivered' and old.fulfillment_type='pickup')
    ) then raise exception 'Transición de estado no permitida para caja'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.audit_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  actor_full_name text;
  actor_app_role public.app_role;
  responsible_id uuid;
  responsible_name text;
begin
  if tg_op = 'INSERT' then event_action := 'created';
  elsif old.status is distinct from new.status then
    event_action := case new.status when 'ready' then 'ready' when 'dispatched' then 'dispatch' when 'delivered' then case when new.fulfillment_type='pickup' then 'pickup' else 'delivered' end when 'cancelled' then 'cancelled' else 'status_changed' end;
  elsif old.courier_id is distinct from new.courier_id
     or old.courier_name is distinct from new.courier_name
     or old.courier_plate is distinct from new.courier_plate
     or old.courier_provider is distinct from new.courier_provider then event_action := 'courier_assigned';
  elsif old.payment_receipt_path is distinct from new.payment_receipt_path then event_action := 'payment_receipt_uploaded';
  else event_action := 'updated'; end if;

  if event_action in ('dispatch','pickup') then
    responsible_id := new.handoff_staff_id;
    responsible_name := new.handoff_staff_name;
  end if;

  select full_name,role into actor_full_name,actor_app_role from public.profiles where id=auth.uid();
  insert into public.order_events(order_id,action,before_data,after_data,changed_by,actor_name,actor_role,staff_member_id,staff_name)
  values(new.id,event_action,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid(),coalesce(actor_full_name,'Sistema'),actor_app_role,responsible_id,responsible_name);
  return new;
end;
$$;

drop function if exists public.transition_order(uuid,text);
create function public.transition_order(p_order_id uuid,p_action text,p_staff_id uuid default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  target public.orders;
  caller_role public.app_role;
  caller_branch text;
  responsible public.staff_members;
begin
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null then raise exception 'Pedido no encontrado'; end if;
  select role,branch_id into caller_role,caller_branch from public.profiles where id=auth.uid() and active;
  if caller_role is null then raise exception 'Usuario inactivo o sin perfil'; end if;
  if caller_role='cashier' and target.branch_id<>caller_branch then raise exception 'Pedido fuera de la sede asignada'; end if;

  if p_action in ('dispatch','pickup') then
    if p_staff_id is null then raise exception 'Selecciona la persona de caja que realizó la entrega'; end if;
    select * into responsible from public.staff_members
    where id=p_staff_id and branch_id=target.branch_id and active;
    if responsible.id is null then raise exception 'La persona seleccionada no está activa en esta sede'; end if;
  end if;

  if p_action='ready' and target.status='preparing' then
    update public.orders set status='ready',ready_at=now() where id=p_order_id returning * into target;
  elsif p_action='dispatch' and target.status='ready' and target.fulfillment_type='delivery' and nullif(trim(coalesce(target.courier_name,'')),'') is not null then
    update public.orders set status='dispatched',dispatched_at=now(),handoff_staff_id=responsible.id,handoff_staff_name=responsible.full_name where id=p_order_id returning * into target;
  elsif p_action='pickup' and target.status='ready' and target.fulfillment_type='pickup' then
    update public.orders set status='delivered',delivered_at=now(),handoff_staff_id=responsible.id,handoff_staff_name=responsible.full_name where id=p_order_id returning * into target;
  elsif p_action='delivered' and caller_role='admin' and target.status='dispatched' then
    update public.orders set status='delivered',delivered_at=now() where id=p_order_id returning * into target;
  else raise exception 'Movimiento no permitido para el estado actual';
  end if;
  return target;
end;
$$;

create or replace function public.attach_payment_receipt(
  p_order_id uuid,
  p_path text,
  p_name text,
  p_mime_type text,
  p_size bigint
)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare target public.orders; caller_role public.app_role; caller_branch text;
begin
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null then raise exception 'Pedido no encontrado'; end if;
  select role,branch_id into caller_role,caller_branch from public.profiles where id=auth.uid() and active;
  if caller_role is null then raise exception 'Usuario inactivo o sin perfil'; end if;
  if caller_role='cashier' and target.branch_id<>caller_branch then raise exception 'Pedido fuera de la sede asignada'; end if;
  if p_size < 1 or p_size > 5242880 then raise exception 'El comprobante debe pesar máximo 5 MB'; end if;
  if p_path not like target.branch_id || '/' || target.id::text || '/%' then raise exception 'Ruta de comprobante inválida'; end if;
  update public.orders set
    payment_receipt_path=p_path,
    payment_receipt_name=left(p_name,255),
    payment_receipt_mime_type=left(p_mime_type,100),
    payment_receipt_size=p_size,
    payment_receipt_uploaded_at=now(),
    payment_receipt_uploaded_by=auth.uid()
  where id=p_order_id returning * into target;
  return target;
end;
$$;

alter table public.staff_members enable row level security;
grant select,insert,update,delete on table public.staff_members to authenticated;
create policy staff_members_read on public.staff_members for select to authenticated
using (public.is_admin() or branch_id=public.current_branch_id());
create policy staff_members_admin_write on public.staff_members for all to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-receipts','payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy payment_receipts_read on storage.objects for select to authenticated
using (
  bucket_id='payment-receipts' and
  (public.is_admin() or (storage.foldername(name))[1]=public.current_branch_id())
);
create policy payment_receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id='payment-receipts' and
  (public.is_admin() or (storage.foldername(name))[1]=public.current_branch_id())
);
create policy payment_receipts_admin_delete on storage.objects for delete to authenticated
using (bucket_id='payment-receipts' and public.is_admin());

revoke all on function public.transition_order(uuid,text,uuid) from public,anon;
grant execute on function public.transition_order(uuid,text,uuid) to authenticated;
revoke all on function public.attach_payment_receipt(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.attach_payment_receipt(uuid,text,text,text,bigint) to authenticated;
