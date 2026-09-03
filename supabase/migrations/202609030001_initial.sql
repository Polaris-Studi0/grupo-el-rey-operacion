-- Grupo Almacenes El Rey - esquema inicial de operación
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','cashier');
create type public.order_status as enum ('preparing','ready','dispatched','delivered','cancelled');
create type public.fulfillment_type as enum ('delivery','pickup');
create type public.payment_method as enum ('transfer','addi','sistecredito','cash_prepaid');

create table public.branches (
  id text primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.branches (id,name) values
  ('b1','Robledo Aures'),
  ('b2','Robledo Diamante - Calle 80'),
  ('b3','Santa Cruz'),
  ('b4','San Gabriel, Itagüí'),
  ('b5','Robledo Diamante - Diagonal 85'),
  ('b6','Floresta'),
  ('b7','La 80'),
  ('b8','La Estrella'),
  ('b9','Campo Valdez'),
  ('b10','San Antonio de Prado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Usuario',
  role public.app_role not null default 'cashier',
  branch_id text references public.branches(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashier_requires_branch check (role = 'admin' or branch_id is not null)
);

create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text not null,
  phone text not null,
  provider text not null default 'Independiente',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plate)
);

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  branch_id text not null references public.branches(id),
  fulfillment_type public.fulfillment_type not null default 'delivery',
  status public.order_status not null default 'preparing',
  customer_name text not null,
  customer_phone text not null,
  delivery_address text,
  delivery_zone text,
  items jsonb not null,
  total bigint not null default 0 check (total >= 0),
  payment_method public.payment_method not null,
  payment_reference text,
  source text,
  customer_notes text,
  internal_notes text,
  courier_id uuid references public.couriers(id),
  eta_minutes integer check (eta_minutes is null or eta_minutes between 1 and 1440),
  promised_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_are_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  constraint delivery_has_address check (fulfillment_type = 'pickup' or nullif(trim(delivery_address),'') is not null),
  constraint courier_only_on_delivery check (fulfillment_type = 'delivery' or courier_id is null),
  constraint dispatched_requires_courier check (status <> 'dispatched' or (fulfillment_type = 'delivery' and courier_id is not null))
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  actor_name text,
  actor_role public.app_role,
  created_at timestamptz not null default now()
);

create index orders_branch_status_idx on public.orders(branch_id,status);
create index orders_created_at_idx on public.orders(created_at desc);
create index events_order_created_idx on public.order_events(order_id,created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.current_branch_id()
returns text language sql stable security definer set search_path = '' as $$
  select branch_id from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role,branch_id)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Usuario'),'cashier',null);
  return new;
end;
$$;

-- Se difiere la validación de sede para poder crear el perfil y asignarla inmediatamente.
alter table public.profiles drop constraint cashier_requires_branch;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.prepare_order_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.order_number is null or trim(new.order_number) = '' then
      new.order_number := 'REY-' || lpad(nextval('public.order_number_seq')::text,4,'0');
    end if;
    new.created_by := coalesce(auth.uid(),new.created_by);
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
    old_fixed := to_jsonb(old) - array['status','ready_at','dispatched_at','delivered_at','updated_at','updated_by','version'];
    new_fixed := to_jsonb(new) - array['status','ready_at','dispatched_at','delivered_at','updated_at','updated_by','version'];
    if old_fixed <> new_fixed then raise exception 'Caja no puede modificar información administrativa'; end if;
    if not (
      (old.status='preparing' and new.status='ready') or
      (old.status='ready' and new.status='dispatched' and old.fulfillment_type='delivery' and old.courier_id is not null) or
      (old.status='ready' and new.status='delivered' and old.fulfillment_type='pickup')
    ) then raise exception 'Transición de estado no permitida para caja'; end if;
    if new.status='ready' then new.ready_at := now(); end if;
    if new.status='dispatched' then new.dispatched_at := now(); end if;
    if new.status='delivered' then new.delivered_at := now(); end if;
  end if;
  return new;
end;
$$;

create or replace function public.audit_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_action text; actor_full_name text; actor_app_role public.app_role;
begin
  if tg_op = 'INSERT' then event_action := 'created';
  elsif old.status is distinct from new.status then
    event_action := case new.status when 'ready' then 'ready' when 'dispatched' then 'dispatch' when 'delivered' then 'delivered' when 'cancelled' then 'cancelled' else 'status_changed' end;
  elsif old.courier_id is distinct from new.courier_id then event_action := 'courier_assigned';
  else event_action := 'updated'; end if;
  select full_name,role into actor_full_name,actor_app_role from public.profiles where id=auth.uid();
  insert into public.order_events(order_id,action,before_data,after_data,changed_by,actor_name,actor_role)
  values(new.id,event_action,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid(),coalesce(actor_full_name,'Sistema'),actor_app_role);
  return new;
end;
$$;

create trigger orders_protect_cashier before update on public.orders for each row execute function public.protect_cashier_updates();
create trigger orders_prepare before insert or update on public.orders for each row execute function public.prepare_order_write();
create trigger orders_audit after insert or update on public.orders for each row execute function public.audit_order_change();

create or replace function public.transition_order(p_order_id uuid,p_action text)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare target public.orders; caller_role public.app_role; caller_branch text;
begin
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null then raise exception 'Pedido no encontrado'; end if;
  select role,branch_id into caller_role,caller_branch from public.profiles where id=auth.uid() and active;
  if caller_role is null then raise exception 'Usuario inactivo o sin perfil'; end if;
  if caller_role='cashier' and target.branch_id<>caller_branch then raise exception 'Pedido fuera de la sede asignada'; end if;

  if p_action='ready' and target.status='preparing' then
    update public.orders set status='ready',ready_at=now() where id=p_order_id returning * into target;
  elsif p_action='dispatch' and target.status='ready' and target.fulfillment_type='delivery' and target.courier_id is not null then
    update public.orders set status='dispatched',dispatched_at=now() where id=p_order_id returning * into target;
  elsif p_action='pickup' and target.status='ready' and target.fulfillment_type='pickup' then
    update public.orders set status='delivered',delivered_at=now() where id=p_order_id returning * into target;
  elsif p_action='delivered' and caller_role='admin' and target.status='dispatched' then
    update public.orders set status='delivered',delivered_at=now() where id=p_order_id returning * into target;
  else raise exception 'Movimiento no permitido para el estado actual';
  end if;
  return target;
end;
$$;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;

create policy branches_read on public.branches for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy couriers_read on public.couriers for select to authenticated using (true);
create policy couriers_admin_write on public.couriers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_read on public.orders for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());
create policy orders_admin_insert on public.orders for insert to authenticated with check (public.is_admin());
create policy orders_update on public.orders for update to authenticated using (public.is_admin() or branch_id=public.current_branch_id()) with check (public.is_admin() or branch_id=public.current_branch_id());
create policy orders_admin_delete on public.orders for delete to authenticated using (public.is_admin());
create policy events_read on public.order_events for select to authenticated using (public.is_admin() or exists(select 1 from public.orders where orders.id=order_events.order_id and orders.branch_id=public.current_branch_id()));

revoke insert,update,delete on public.order_events from anon,authenticated;
grant execute on function public.transition_order(uuid,text) to authenticated;

alter table public.orders replica identity full;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
