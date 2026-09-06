-- Grupo Almacenes El Rey - comercio conversacional y trazabilidad de WhatsApp

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_id text unique,
  display_name text,
  preferred_name text,
  default_branch_id text references public.branches(id) on delete set null,
  first_source text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.whatsapp_contacts(id) on delete restrict,
  branch_id text references public.branches(id) on delete set null,
  linked_order_id uuid references public.orders(id) on delete set null,
  status text not null default 'open' check (status in ('open','waiting_customer','waiting_human','converted','closed')),
  consent_status text not null default 'pending' check (consent_status in ('pending','granted','denied')),
  consent_version text,
  consented_at timestamptz,
  source text not null default 'whatsapp',
  campaign text,
  landing_context jsonb not null default '{}'::jsonb,
  current_intent text,
  summary text,
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consent_is_complete check (
    consent_status <> 'granted' or (consented_at is not null and nullif(trim(consent_version),'') is not null)
  )
);

alter table public.orders
  add column whatsapp_conversation_id uuid references public.whatsapp_conversations(id) on delete set null;

create table public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.whatsapp_contacts(id) on delete restrict,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  policy_version text not null,
  notice_text text not null,
  customer_response text not null,
  granted boolean not null,
  meta_message_id text,
  captured_at timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  meta_message_id text unique,
  reply_to_meta_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_type text not null check (sender_type in ('customer','assistant','human','system')),
  message_type text not null default 'text',
  body text,
  media_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','read','failed')),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  failure_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);

create table public.branch_knowledge (
  id uuid primary key default gen_random_uuid(),
  branch_id text references public.branches(id) on delete cascade,
  category text not null check (category in ('general','schedule','location','promotion','policy','payment','delivery','faq')),
  title text not null check (nullif(trim(title),'') is not null),
  content text not null check (nullif(trim(content),'') is not null),
  source_file_name text,
  source_file_path text,
  version integer not null default 1,
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_valid_range check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null check (nullif(trim(name),'') is not null),
  description text,
  attributes jsonb not null default '{}'::jsonb,
  seasonal boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branch_inventory (
  branch_id text not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  price bigint not null default 0 check (price >= 0),
  promotional_price bigint check (promotional_price is null or promotional_price >= 0),
  promotion_from timestamptz,
  promotion_until timestamptz,
  available_qty integer not null default 0 check (available_qty >= 0),
  reserved_qty integer not null default 0 check (reserved_qty >= 0 and reserved_qty <= available_qty),
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (branch_id,product_id),
  constraint inventory_promotion_range check (promotion_until is null or promotion_from is null or promotion_until > promotion_from)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  branch_id text not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','committed','released','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id,product_id) references public.branch_inventory(branch_id,product_id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  reservation_id uuid references public.inventory_reservations(id) on delete set null,
  movement_type text not null check (movement_type in ('import','adjustment','reservation','release','sale','return')),
  quantity integer not null check (quantity <> 0),
  available_before integer not null,
  available_after integer not null,
  reserved_before integer not null,
  reserved_after integer not null,
  reason text,
  actor_label text not null default 'Sistema',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.human_tasks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  branch_id text references public.branches(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  task_type text not null check (task_type in ('product_lookup','delivery_quote','payment_verification','credit_application','general')),
  status text not null default 'pending' check (status in ('pending','in_progress','resolved','rejected','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  title text not null,
  question text not null,
  context jsonb not null default '{}'::jsonb,
  resolution jsonb,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  assigned_to_phone text,
  due_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resolved_task_has_resolution check (
    status not in ('resolved','rejected') or (resolution is not null and resolved_at is not null)
  )
);

create table public.whatsapp_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);

create index whatsapp_contacts_last_seen_idx on public.whatsapp_contacts(last_seen_at desc);
create index whatsapp_conversations_contact_idx on public.whatsapp_conversations(contact_id,last_message_at desc);
create index whatsapp_conversations_queue_idx on public.whatsapp_conversations(status,branch_id,last_message_at desc);
create index whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id,created_at);
create index privacy_consents_contact_idx on public.privacy_consents(contact_id,captured_at desc);
create index branch_knowledge_lookup_idx on public.branch_knowledge(branch_id,category,active);
create index inventory_stock_idx on public.branch_inventory(branch_id,active,available_qty);
create index inventory_reservations_expiry_idx on public.inventory_reservations(status,expires_at);
create index inventory_movements_lookup_idx on public.inventory_movements(branch_id,product_id,created_at desc);
create index human_tasks_queue_idx on public.human_tasks(status,priority,due_at,created_at);
create index whatsapp_webhook_processing_idx on public.whatsapp_webhook_inbox(processed_at,received_at);

create or replace function public.touch_chatbot_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then new.updated_by := coalesce(auth.uid(),new.updated_by); end if;
  return new;
end;
$$;

create trigger whatsapp_contacts_touch before update on public.whatsapp_contacts for each row execute function public.touch_chatbot_record();
create trigger whatsapp_conversations_touch before update on public.whatsapp_conversations for each row execute function public.touch_chatbot_record();
create trigger branch_knowledge_touch before update on public.branch_knowledge for each row execute function public.touch_chatbot_record();
create trigger products_touch before update on public.products for each row execute function public.touch_chatbot_record();
create trigger branch_inventory_touch before update on public.branch_inventory for each row execute function public.touch_chatbot_record();
create trigger inventory_reservations_touch before update on public.inventory_reservations for each row execute function public.touch_chatbot_record();
create trigger human_tasks_touch before update on public.human_tasks for each row execute function public.touch_chatbot_record();

create or replace function public.resolve_human_task(p_task_id uuid,p_status text,p_resolution jsonb)
returns public.human_tasks language plpgsql security definer set search_path = '' as $$
declare target public.human_tasks;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede resolver este pendiente'; end if;
  if p_status not in ('resolved','rejected') then raise exception 'Resultado inválido'; end if;
  if p_resolution is null then raise exception 'Debes registrar la respuesta'; end if;
  update public.human_tasks set status=p_status,resolution=p_resolution,resolved_by=auth.uid(),resolved_at=now()
  where id=p_task_id and status in ('pending','in_progress') returning * into target;
  if target.id is null then raise exception 'El pendiente ya fue atendido o no existe'; end if;
  return target;
end;
$$;

create or replace function public.reserve_chat_inventory(
  p_conversation_id uuid,p_branch_id text,p_product_id uuid,p_quantity integer,p_minutes integer default 20
)
returns public.inventory_reservations language plpgsql security definer set search_path = '' as $$
declare stock public.branch_inventory; reservation public.inventory_reservations;
begin
  if p_quantity < 1 or p_minutes not between 1 and 120 then raise exception 'Reserva inválida'; end if;
  select * into stock from public.branch_inventory where branch_id=p_branch_id and product_id=p_product_id and active for update;
  if stock.product_id is null then raise exception 'Producto no disponible en esta sede'; end if;
  if stock.available_qty-stock.reserved_qty < p_quantity then raise exception 'Inventario insuficiente'; end if;
  insert into public.inventory_reservations(conversation_id,branch_id,product_id,quantity,expires_at)
  values(p_conversation_id,p_branch_id,p_product_id,p_quantity,now()+make_interval(mins=>p_minutes)) returning * into reservation;
  update public.branch_inventory set reserved_qty=reserved_qty+p_quantity where branch_id=p_branch_id and product_id=p_product_id;
  insert into public.inventory_movements(branch_id,product_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,actor_label)
  values(p_branch_id,p_product_id,p_conversation_id,reservation.id,'reservation',p_quantity,stock.available_qty,stock.available_qty,stock.reserved_qty,stock.reserved_qty+p_quantity,'Asistente WhatsApp');
  return reservation;
end;
$$;

create or replace function public.release_chat_inventory(p_reservation_id uuid,p_reason text default 'Reserva liberada')
returns public.inventory_reservations language plpgsql security definer set search_path = '' as $$
declare reservation public.inventory_reservations; stock public.branch_inventory;
begin
  select * into reservation from public.inventory_reservations where id=p_reservation_id for update;
  if reservation.id is null then raise exception 'Reserva no encontrada'; end if;
  if reservation.status <> 'active' then return reservation; end if;
  select * into stock from public.branch_inventory where branch_id=reservation.branch_id and product_id=reservation.product_id for update;
  update public.branch_inventory set reserved_qty=greatest(0,reserved_qty-reservation.quantity) where branch_id=reservation.branch_id and product_id=reservation.product_id;
  update public.inventory_reservations set status=case when expires_at<=now() then 'expired' else 'released' end where id=reservation.id returning * into reservation;
  insert into public.inventory_movements(branch_id,product_id,order_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
  values(stock.branch_id,stock.product_id,reservation.order_id,reservation.conversation_id,reservation.id,'release',-reservation.quantity,stock.available_qty,stock.available_qty,stock.reserved_qty,greatest(0,stock.reserved_qty-reservation.quantity),p_reason,'Automatización de inventario');
  return reservation;
end;
$$;

create or replace function public.commit_chat_inventory(p_reservation_id uuid,p_order_id uuid)
returns public.inventory_reservations language plpgsql security definer set search_path = '' as $$
declare reservation public.inventory_reservations; stock public.branch_inventory;
begin
  select * into reservation from public.inventory_reservations where id=p_reservation_id for update;
  if reservation.id is null or reservation.status <> 'active' then raise exception 'La reserva no está activa'; end if;
  select * into stock from public.branch_inventory where branch_id=reservation.branch_id and product_id=reservation.product_id for update;
  if stock.available_qty < reservation.quantity or stock.reserved_qty < reservation.quantity then raise exception 'Inventario inconsistente'; end if;
  update public.branch_inventory set available_qty=available_qty-reservation.quantity,reserved_qty=reserved_qty-reservation.quantity where branch_id=reservation.branch_id and product_id=reservation.product_id;
  update public.inventory_reservations set status='committed',order_id=p_order_id where id=reservation.id returning * into reservation;
  insert into public.inventory_movements(branch_id,product_id,order_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
  values(stock.branch_id,stock.product_id,p_order_id,reservation.conversation_id,reservation.id,'sale',-reservation.quantity,stock.available_qty,stock.available_qty-reservation.quantity,stock.reserved_qty,stock.reserved_qty-reservation.quantity,'Compra confirmada','Automatización de inventario');
  return reservation;
end;
$$;

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.privacy_consents enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.branch_knowledge enable row level security;
alter table public.products enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.human_tasks enable row level security;
alter table public.whatsapp_webhook_inbox enable row level security;

grant select on public.whatsapp_contacts,public.whatsapp_conversations,public.privacy_consents,public.whatsapp_messages,public.branch_knowledge,public.products,public.branch_inventory,public.inventory_reservations,public.inventory_movements,public.human_tasks to authenticated;
grant insert,update,delete on public.branch_knowledge,public.products,public.branch_inventory to authenticated;

create policy whatsapp_contacts_admin_read on public.whatsapp_contacts for select to authenticated using (public.is_admin());
create policy whatsapp_conversations_read on public.whatsapp_conversations for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());
create policy privacy_consents_admin_read on public.privacy_consents for select to authenticated using (public.is_admin());
create policy whatsapp_messages_read on public.whatsapp_messages for select to authenticated using (
  public.is_admin() or exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id and c.branch_id=public.current_branch_id())
);
create policy branch_knowledge_read on public.branch_knowledge for select to authenticated using (public.is_admin() or branch_id is null or branch_id=public.current_branch_id());
create policy branch_knowledge_admin_write on public.branch_knowledge for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_read on public.products for select to authenticated using (true);
create policy products_admin_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy branch_inventory_read on public.branch_inventory for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());
create policy branch_inventory_admin_write on public.branch_inventory for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_reservations_read on public.inventory_reservations for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());
create policy inventory_movements_read on public.inventory_movements for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());
create policy human_tasks_read on public.human_tasks for select to authenticated using (public.is_admin() or branch_id=public.current_branch_id());

revoke all on public.whatsapp_webhook_inbox from anon,authenticated;
revoke insert,update,delete on public.whatsapp_contacts,public.whatsapp_conversations,public.privacy_consents,public.whatsapp_messages,public.inventory_reservations,public.inventory_movements,public.human_tasks from anon,authenticated;
revoke all on function public.resolve_human_task(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_human_task(uuid,text,jsonb) to authenticated;
revoke all on function public.reserve_chat_inventory(uuid,text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.release_chat_inventory(uuid,text) from public,anon,authenticated;
revoke all on function public.commit_chat_inventory(uuid,uuid) from public,anon,authenticated;
grant insert,update,select on public.whatsapp_contacts,public.whatsapp_conversations,public.privacy_consents,public.whatsapp_messages,public.whatsapp_webhook_inbox,public.human_tasks,public.inventory_reservations,public.inventory_movements to service_role;
grant select,insert,update on public.branches,public.branch_knowledge,public.products,public.branch_inventory,public.orders to service_role;
grant execute on function public.reserve_chat_inventory(uuid,text,uuid,integer,integer) to service_role;
grant execute on function public.release_chat_inventory(uuid,text) to service_role;
grant execute on function public.commit_chat_inventory(uuid,uuid) to service_role;
