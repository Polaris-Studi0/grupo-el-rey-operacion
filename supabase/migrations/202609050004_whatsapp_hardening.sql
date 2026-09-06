-- Grupo Almacenes El Rey - endurecimiento del canal WhatsApp antes de conectar n8n

begin;

alter table public.whatsapp_webhook_inbox
  add column processing_started_at timestamptz,
  add column lease_id uuid,
  add column dead_lettered_at timestamptz,
  add column next_attempt_at timestamptz not null default now();

alter table public.human_tasks
  add column admin_notified_at timestamptz,
  add column automation_resumed_at timestamptz,
  add column automation_error text;

-- El pedido es la única fuente de relación; una conversación puede originar varios pedidos.
do $$
begin
  if exists(
    select 1 from public.whatsapp_conversations c
    join public.orders o on o.id=c.linked_order_id
    where o.whatsapp_conversation_id is not null and o.whatsapp_conversation_id<>c.id
  ) then
    raise exception 'Hay pedidos con relaciones de WhatsApp contradictorias; corrígelos antes de migrar';
  end if;
  if exists(
    select linked_order_id from public.whatsapp_conversations
    where linked_order_id is not null group by linked_order_id having count(*)>1
  ) then
    raise exception 'Hay pedidos vinculados a más de una conversación; corrígelos antes de migrar';
  end if;
  if exists(
    select 1 from public.whatsapp_conversations c
    join public.orders o on o.id=c.linked_order_id
    where c.branch_id is distinct from o.branch_id
  ) then
    raise exception 'Hay pedidos vinculados a conversaciones de otra sede; corrígelos antes de migrar';
  end if;
end;
$$;

update public.orders o
set whatsapp_conversation_id=c.id
from public.whatsapp_conversations c
where c.linked_order_id=o.id and o.whatsapp_conversation_id is null;

alter table public.whatsapp_conversations drop column linked_order_id;

-- Si hubo pruebas simultáneas antes de esta migración, conserva activa solo la conversación más reciente.
with ranked as (
  select id,row_number() over(partition by contact_id order by last_message_at desc,created_at desc,id desc) as position
  from public.whatsapp_conversations
  where status in ('open','waiting_customer','waiting_human')
)
update public.whatsapp_conversations c
set status='closed',closed_at=coalesce(c.closed_at,now())
from ranked r where c.id=r.id and r.position>1;

create unique index whatsapp_one_active_conversation_per_contact
on public.whatsapp_conversations(contact_id)
where status in ('open','waiting_customer','waiting_human');

do $$
begin
  if exists(
    select meta_message_id from public.privacy_consents
    where meta_message_id is not null group by meta_message_id having count(*)>1
  ) then
    raise exception 'Hay consentimientos duplicados; deben revisarse sin borrar evidencia antes de migrar';
  end if;
end;
$$;

create unique index privacy_consents_meta_message_uniq
on public.privacy_consents(meta_message_id)
where meta_message_id is not null;

alter table public.inventory_reservations add column idempotency_key text;
create unique index inventory_reservations_idempotency_uniq
on public.inventory_reservations(idempotency_key)
where idempotency_key is not null;

alter table public.inventory_reservations alter column conversation_id set not null;
alter table public.inventory_reservations drop constraint inventory_reservations_conversation_id_fkey;
alter table public.inventory_reservations add constraint inventory_reservations_conversation_id_fkey
  foreign key(conversation_id) references public.whatsapp_conversations(id) on delete restrict;

alter table public.whatsapp_messages
  add column idempotency_key text,
  add column send_started_at timestamptz,
  add column send_lease_id uuid,
  add column send_attempts integer not null default 0 check (send_attempts>=0);
create unique index whatsapp_messages_outbound_idempotency_uniq
on public.whatsapp_messages(idempotency_key)
where idempotency_key is not null;

alter table public.human_tasks add column request_key text;
create unique index human_tasks_request_key_uniq on public.human_tasks(request_key) where request_key is not null;

create table public.whatsapp_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  message_id uuid not null references public.whatsapp_messages(id) on delete restrict,
  meta_media_id text not null,
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text,
  created_at timestamptz not null default now(),
  unique(message_id,meta_media_id)
);

create table public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  event_type text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_type text not null default 'automation' check (actor_type in ('customer','assistant','human','automation','system')),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  source_key text unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  message_id uuid references public.whatsapp_messages(id) on delete restrict,
  purpose text not null check (purpose in ('classification','extraction','response')),
  run_key text not null unique,
  prompt_version text not null,
  model text not null,
  input_summary text,
  output jsonb not null,
  knowledge_refs jsonb not null default '[]'::jsonb,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  succeeded boolean not null default true,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.whatsapp_message_status_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_messages(id) on delete restrict,
  meta_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  event_key text not null unique,
  source_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  action text not null,
  before_state jsonb,
  after_state jsonb not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.automation_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed','dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  lease_id uuid,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index whatsapp_attachments_conversation_idx on public.whatsapp_attachments(conversation_id,created_at);
create index conversation_events_timeline_idx on public.conversation_events(conversation_id,created_at);
create index ai_runs_conversation_idx on public.ai_runs(conversation_id,created_at);
create index whatsapp_message_status_timeline_idx on public.whatsapp_message_status_events(message_id,source_timestamp,created_at);
create index catalog_audit_timeline_idx on public.catalog_audit_events(branch_id,product_id,created_at);
create index automation_outbox_queue_idx on public.automation_outbox(status,next_attempt_at,created_at);
create index whatsapp_webhook_pending_idx on public.whatsapp_webhook_inbox(next_attempt_at,received_at)
where processed_at is null and dead_lettered_at is null;
create unique index automation_outbox_topic_aggregate_uniq on public.automation_outbox(topic,aggregate_id);
create index orders_whatsapp_conversation_idx on public.orders(whatsapp_conversation_id) where whatsapp_conversation_id is not null;

insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
select id,'conversation','closed_duplicate',jsonb_build_object('reason','Migración de unicidad de conversación activa'),'system','migration:closed-duplicate:'||id::text
from public.whatsapp_conversations
where status='closed' and closed_at=transaction_timestamp()
on conflict(source_key) do nothing;

create or replace function public.validate_whatsapp_attachment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(
    select 1 from public.whatsapp_messages m
    where m.id=new.message_id and m.conversation_id=new.conversation_id
  ) then
    raise exception 'El adjunto no corresponde al mensaje y conversación indicados';
  end if;
  return new;
end;
$$;

create trigger whatsapp_attachments_validate before insert or update on public.whatsapp_attachments
for each row execute function public.validate_whatsapp_attachment();

create or replace function public.block_append_only_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Este registro es inmutable; agrega un nuevo evento para corregirlo';
end;
$$;

create trigger privacy_consents_append_only before update or delete on public.privacy_consents for each row execute function public.block_append_only_changes();
create trigger inventory_movements_append_only before update or delete on public.inventory_movements for each row execute function public.block_append_only_changes();
create trigger conversation_events_append_only before update or delete on public.conversation_events for each row execute function public.block_append_only_changes();
create trigger ai_runs_append_only before update or delete on public.ai_runs for each row execute function public.block_append_only_changes();
create trigger whatsapp_message_status_events_append_only before update or delete on public.whatsapp_message_status_events for each row execute function public.block_append_only_changes();
create trigger catalog_audit_events_append_only before update or delete on public.catalog_audit_events for each row execute function public.block_append_only_changes();

-- La evidencia no se reescribe cuando se elimina una entidad relacionada.
alter table public.inventory_movements drop constraint inventory_movements_order_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_order_id_fkey foreign key(order_id) references public.orders(id) on delete restrict;
alter table public.inventory_movements drop constraint inventory_movements_conversation_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_conversation_id_fkey foreign key(conversation_id) references public.whatsapp_conversations(id) on delete restrict;
alter table public.inventory_movements drop constraint inventory_movements_reservation_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_reservation_id_fkey foreign key(reservation_id) references public.inventory_reservations(id) on delete restrict;
alter table public.inventory_movements drop constraint inventory_movements_created_by_fkey;
alter table public.inventory_movements add constraint inventory_movements_created_by_fkey foreign key(created_by) references auth.users(id) on delete restrict;

create or replace function public.validate_privacy_consent_contact()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(
    select 1 from public.whatsapp_conversations c
    join public.whatsapp_messages m on m.conversation_id=c.id
    where c.id=new.conversation_id and c.contact_id=new.contact_id
      and m.meta_message_id=new.meta_message_id and m.direction='inbound'
  ) then
    raise exception 'El consentimiento no corresponde al contacto de la conversación';
  end if;
  return new;
end;
$$;

create trigger privacy_consents_validate_contact before insert on public.privacy_consents for each row execute function public.validate_privacy_consent_contact();

create or replace function public.validate_chatbot_relationships()
returns trigger language plpgsql set search_path = '' as $$
declare conversation public.whatsapp_conversations; target_order public.orders;
begin
  if tg_table_name='human_tasks' then
    select * into conversation from public.whatsapp_conversations where id=new.conversation_id;
    if conversation.id is null or (new.branch_id is not null and conversation.branch_id is distinct from new.branch_id) then
      raise exception 'La sede del pendiente no corresponde a la conversación';
    end if;
    if new.order_id is not null then
      select * into target_order from public.orders where id=new.order_id;
      if target_order.id is null or target_order.branch_id is distinct from conversation.branch_id or target_order.whatsapp_conversation_id is distinct from conversation.id then
        raise exception 'El pedido del pendiente no corresponde a la conversación';
      end if;
    end if;
  elsif tg_table_name='ai_runs' and new.message_id is not null and not exists(
    select 1 from public.whatsapp_messages m where m.id=new.message_id and m.conversation_id=new.conversation_id
  ) then
    raise exception 'La ejecución de IA no corresponde al mensaje y conversación indicados';
  end if;
  return new;
end;
$$;

create trigger human_tasks_validate_relationships before insert or update on public.human_tasks
for each row execute function public.validate_chatbot_relationships();
create trigger ai_runs_validate_relationships before insert on public.ai_runs
for each row execute function public.validate_chatbot_relationships();

create or replace function public.validate_order_whatsapp_conversation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.whatsapp_conversation_id is not null and not exists(
    select 1 from public.whatsapp_conversations c
    where c.id=new.whatsapp_conversation_id and c.branch_id=new.branch_id
  ) then
    raise exception 'La conversación de WhatsApp no corresponde a la sede del pedido';
  end if;
  return new;
end;
$$;

create trigger orders_validate_whatsapp_conversation before insert or update of branch_id,whatsapp_conversation_id on public.orders
for each row execute function public.validate_order_whatsapp_conversation();

create or replace function public.version_knowledge_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger branch_knowledge_version before update on public.branch_knowledge for each row execute function public.version_knowledge_record();

create or replace function public.claim_pending_whatsapp_events(p_limit integer default 20)
returns setof public.whatsapp_webhook_inbox language plpgsql security definer set search_path = '' as $$
begin
  update public.whatsapp_webhook_inbox set dead_lettered_at=now(),processing_started_at=null,lease_id=null,
    last_error=coalesce(last_error,'Tiempo de procesamiento agotado en el último intento')
  where processed_at is null and dead_lettered_at is null and attempts>=10
    and (processing_started_at is null or processing_started_at<now()-interval '2 minutes');
  return query
  with candidates as (
    select id from public.whatsapp_webhook_inbox
    where processed_at is null and dead_lettered_at is null and next_attempt_at<=now() and attempts<10
      and (processing_started_at is null or processing_started_at<now()-interval '2 minutes')
    order by received_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update public.whatsapp_webhook_inbox inbox
  set processing_started_at=now(),lease_id=gen_random_uuid(),attempts=inbox.attempts+1,last_error=null
  from candidates where inbox.id=candidates.id
  returning inbox.*;
end;
$$;

create or replace function public.claim_whatsapp_event(p_event_key text)
returns setof public.whatsapp_webhook_inbox language plpgsql security definer set search_path = '' as $$
begin
  update public.whatsapp_webhook_inbox set dead_lettered_at=now(),processing_started_at=null,lease_id=null,
    last_error=coalesce(last_error,'Tiempo de procesamiento agotado en el último intento')
  where event_key=p_event_key and processed_at is null and dead_lettered_at is null and attempts>=10
    and (processing_started_at is null or processing_started_at<now()-interval '2 minutes');
  return query
  update public.whatsapp_webhook_inbox inbox
  set processing_started_at=now(),lease_id=gen_random_uuid(),attempts=inbox.attempts+1,last_error=null
  where inbox.event_key=p_event_key and inbox.processed_at is null and inbox.dead_lettered_at is null and inbox.next_attempt_at<=now() and inbox.attempts<10
    and (inbox.processing_started_at is null or inbox.processing_started_at<now()-interval '2 minutes')
  returning inbox.*;
end;
$$;

create or replace function public.complete_whatsapp_event(p_event_key text,p_lease_id uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_error is null then
    update public.whatsapp_webhook_inbox
    set processed_at=now(),processing_started_at=null,lease_id=null,last_error=null
    where event_key=p_event_key and lease_id=p_lease_id and processed_at is null;
  else
    update public.whatsapp_webhook_inbox
    set processing_started_at=null,lease_id=null,last_error=left(p_error,2000),
      dead_lettered_at=case when attempts>=10 then now() else null end,
      next_attempt_at=now()+make_interval(mins=>least(30,power(2,least(5,attempts))::integer))
    where event_key=p_event_key and lease_id=p_lease_id and processed_at is null;
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

create or replace function public.claim_automation_events(p_limit integer default 20)
returns setof public.automation_outbox language plpgsql security definer set search_path = '' as $$
begin
  update public.automation_outbox set status='dead_letter',processing_started_at=null,lease_id=null,
    last_error=coalesce(last_error,'Tiempo de procesamiento agotado en el último intento')
  where status='processing' and attempts>=10 and (processing_started_at is null or processing_started_at<now()-interval '2 minutes');
  return query
  with candidates as (
    select id from public.automation_outbox
    where attempts<10 and (
      (status in ('pending','failed') and next_attempt_at<=now())
      or (status='processing' and (processing_started_at is null or processing_started_at<now()-interval '2 minutes'))
    )
    order by created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update public.automation_outbox outbox
  set status='processing',processing_started_at=now(),lease_id=gen_random_uuid(),attempts=outbox.attempts+1,last_error=null
  from candidates where outbox.id=candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.complete_automation_event(p_id uuid,p_lease_id uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.automation_outbox;
begin
  select * into target from public.automation_outbox where id=p_id and lease_id=p_lease_id and status='processing' for update;
  if target.id is null then return false; end if;
  if p_error is null then
    update public.automation_outbox set status='processed',processed_at=now(),processing_started_at=null,lease_id=null,last_error=null where id=p_id and lease_id=p_lease_id;
    if target.topic='human_task.created' then
      update public.human_tasks set admin_notified_at=now(),automation_error=null where id=target.aggregate_id;
    elsif target.topic='human_task.completed' then
      update public.human_tasks set automation_resumed_at=now(),automation_error=null where id=target.aggregate_id;
    end if;
  else
    update public.automation_outbox
    set status=case when target.attempts>=10 then 'dead_letter' else 'failed' end,processing_started_at=null,lease_id=null,last_error=left(p_error,2000),next_attempt_at=now()+make_interval(mins=>least(30,power(2,least(5,attempts))::integer))
    where id=p_id and lease_id=p_lease_id;
    if target.topic in ('human_task.created','human_task.completed') then
      update public.human_tasks set automation_error=left(p_error,2000) where id=target.aggregate_id;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.ingest_whatsapp_message(
  p_phone_e164 text,p_whatsapp_id text,p_display_name text,p_meta_message_id text,p_message_type text,
  p_body text,p_media_id text,p_raw_payload jsonb,p_source text default 'whatsapp',p_branch_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare contact public.whatsapp_contacts; conversation public.whatsapp_conversations; message public.whatsapp_messages; created_message boolean := false;
begin
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' or nullif(trim(p_meta_message_id),'') is null then raise exception 'Mensaje de WhatsApp inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone_e164,0));
  select * into message from public.whatsapp_messages where meta_message_id=p_meta_message_id;
  if message.id is not null then
    select * into conversation from public.whatsapp_conversations where id=message.conversation_id;
    select * into contact from public.whatsapp_contacts where id=conversation.contact_id;
    if contact.phone_e164<>p_phone_e164 then raise exception 'El identificador de Meta ya pertenece a otro contacto'; end if;
    return jsonb_build_object('created',false,'contact_id',contact.id,'conversation_id',conversation.id,'message_id',message.id,'consent_status',conversation.consent_status,'branch_id',conversation.branch_id,'phone_e164',contact.phone_e164,'body',message.body,'message_type',message.message_type,'media_id',message.media_id);
  end if;
  insert into public.whatsapp_contacts(phone_e164,whatsapp_id,display_name,first_source,last_seen_at)
  values(p_phone_e164,nullif(trim(p_whatsapp_id),''),nullif(trim(p_display_name),''),coalesce(nullif(trim(p_source),''),'whatsapp'),now())
  on conflict(phone_e164) do update set whatsapp_id=coalesce(excluded.whatsapp_id,public.whatsapp_contacts.whatsapp_id),display_name=coalesce(excluded.display_name,public.whatsapp_contacts.display_name),last_seen_at=now()
  returning * into contact;
  select * into conversation from public.whatsapp_conversations
  where contact_id=contact.id and status in ('open','waiting_customer','waiting_human') for update;
  if conversation.id is null then
    insert into public.whatsapp_conversations(contact_id,branch_id,source,status,consent_status)
    values(contact.id,p_branch_id,coalesce(nullif(trim(p_source),''),'whatsapp'),'open','pending') returning * into conversation;
  elsif conversation.branch_id is null and p_branch_id is not null then
    update public.whatsapp_conversations set branch_id=p_branch_id where id=conversation.id returning * into conversation;
  end if;
  insert into public.whatsapp_messages(conversation_id,meta_message_id,direction,sender_type,message_type,body,media_id,raw_payload,delivery_status)
  values(conversation.id,p_meta_message_id,'inbound','customer',coalesce(nullif(trim(p_message_type),''),'text'),nullif(p_body,''),nullif(p_media_id,''),coalesce(p_raw_payload,'{}'::jsonb),'received')
  on conflict(meta_message_id) do nothing returning * into message;
  if message.id is not null then
    created_message := true;
    update public.whatsapp_conversations set last_message_at=now(),status=case when status='waiting_customer' then 'open' else status end where id=conversation.id returning * into conversation;
    insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
    values(conversation.id,'message','received',jsonb_build_object('message_id',message.id,'meta_message_id',p_meta_message_id,'message_type',message.message_type),'customer','message:'||p_meta_message_id)
    on conflict(source_key) do nothing;
  else
    select * into message from public.whatsapp_messages where meta_message_id=p_meta_message_id;
    select * into conversation from public.whatsapp_conversations where id=message.conversation_id;
    select * into contact from public.whatsapp_contacts where id=conversation.contact_id;
    if contact.phone_e164<>p_phone_e164 then raise exception 'El identificador de Meta ya pertenece a otro contacto'; end if;
  end if;
  return jsonb_build_object('created',created_message,'contact_id',contact.id,'conversation_id',conversation.id,'message_id',message.id,'consent_status',conversation.consent_status,'branch_id',conversation.branch_id,'phone_e164',contact.phone_e164,'body',message.body,'message_type',message.message_type,'media_id',message.media_id);
end;
$$;

create or replace function public.queue_outbound_whatsapp_message(
  p_conversation_id uuid,p_idempotency_key text,p_sender_type text,p_message_type text,p_body text,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; existing public.whatsapp_messages; target public.whatsapp_messages;
begin
  if nullif(trim(p_idempotency_key),'') is null or p_sender_type not in ('assistant','human','system') or p_message_type not in ('text','template') then raise exception 'Mensaje saliente inválido'; end if;
  if p_message_type='text' and nullif(trim(p_body),'') is null then raise exception 'El mensaje de texto está vacío'; end if;
  if p_message_type='template' and (p_payload is null or not (p_payload ? 'template')) then raise exception 'Falta la plantilla del mensaje'; end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key),4));
  select * into existing from public.whatsapp_messages where idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id or existing.sender_type is distinct from p_sender_type or existing.message_type is distinct from p_message_type
      or existing.body is distinct from nullif(p_body,'') or existing.raw_payload is distinct from coalesce(p_payload,'{}'::jsonb) then raise exception 'La clave ya pertenece a otro mensaje'; end if;
    return jsonb_build_object('created',false,'message_id',existing.id,'delivery_status',existing.delivery_status,'meta_message_id',existing.meta_message_id);
  end if;
  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.status='closed' then raise exception 'La conversación no permite enviar mensajes'; end if;
  if conversation.consent_status<>'granted' and not (p_sender_type='system' and trim(p_idempotency_key) like 'privacy-notice:%') then raise exception 'No se puede responder antes de obtener autorización'; end if;
  insert into public.whatsapp_messages(conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key)
  values(conversation.id,'outbound',p_sender_type,p_message_type,nullif(p_body,''),coalesce(p_payload,'{}'::jsonb),'queued',trim(p_idempotency_key)) returning * into target;
  update public.whatsapp_conversations set last_message_at=now() where id=conversation.id;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
  values(conversation.id,'message','queued',jsonb_build_object('message_id',target.id,'message_type',target.message_type),case when p_sender_type='human' then 'human' when p_sender_type='system' then 'system' else 'assistant' end,'outbound-queued:'||target.id::text)
  on conflict(source_key) do nothing;
  return jsonb_build_object('created',true,'message_id',target.id,'delivery_status',target.delivery_status);
end;
$$;

create or replace function public.claim_outbound_whatsapp_message(p_message_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.whatsapp_messages; phone text;
begin
  if p_lease_id is null then raise exception 'Lease de envío inválido'; end if;
  select m.* into target from public.whatsapp_messages m where m.id=p_message_id for update;
  if target.id is null then raise exception 'Mensaje saliente no encontrado'; end if;
  select wc.phone_e164 into phone from public.whatsapp_conversations c
  join public.whatsapp_contacts wc on wc.id=c.contact_id where c.id=target.conversation_id;
  if target.direction<>'outbound' then raise exception 'El mensaje no es saliente'; end if;
  if target.meta_message_id is not null then return jsonb_build_object('send',false,'state','sent','message_id',target.id,'meta_message_id',target.meta_message_id); end if;
  if target.send_started_at is not null then return jsonb_build_object('send',false,'state','blocked_uncertain','message_id',target.id,'reason',target.failure_reason); end if;
  if target.delivery_status<>'queued' then return jsonb_build_object('send',false,'state',target.delivery_status,'message_id',target.id,'reason',target.failure_reason); end if;
  update public.whatsapp_messages set send_started_at=now(),send_lease_id=p_lease_id,send_attempts=send_attempts+1 where id=target.id returning * into target;
  return jsonb_build_object('send',true,'state','claimed','message_id',target.id,'to',ltrim(phone,'+'),'type',target.message_type,'text',target.body,'template',target.raw_payload->'template');
end;
$$;

create or replace function public.complete_outbound_whatsapp_message(
  p_message_id uuid,p_lease_id uuid,p_meta_message_id text,p_response jsonb,p_error text default null,p_uncertain boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.whatsapp_messages; action text;
begin
  select * into target from public.whatsapp_messages where id=p_message_id and send_lease_id=p_lease_id for update;
  if target.id is null then return jsonb_build_object('updated',false,'reason','lease_mismatch'); end if;
  if p_error is null then
    if nullif(trim(p_meta_message_id),'') is null then raise exception 'Meta no devolvió identificador del mensaje'; end if;
    update public.whatsapp_messages as wm set meta_message_id=trim(p_meta_message_id),delivery_status='sent',sent_at=now(),failed_at=null,failure_reason=null,send_started_at=null,send_lease_id=null,
      raw_payload=coalesce(wm.raw_payload,'{}'::jsonb)||jsonb_build_object('send_response',coalesce(p_response,'{}'::jsonb))
    where id=target.id returning * into target;
    action:='sent';
  else
    update public.whatsapp_messages as wm set delivery_status='failed',failed_at=now(),failure_reason=left(case when p_uncertain then 'RESULTADO_INCIERTO: ' else '' end||p_error,2000),
      send_started_at=case when p_uncertain then wm.send_started_at else null end,send_lease_id=case when p_uncertain then wm.send_lease_id else null end,
      raw_payload=coalesce(wm.raw_payload,'{}'::jsonb)||jsonb_build_object('send_error',coalesce(p_response,'{}'::jsonb))
    where id=target.id returning * into target;
    action:=case when p_uncertain then 'send_uncertain' else 'failed' end;
  end if;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
  values(target.conversation_id,'message',action,jsonb_build_object('message_id',target.id,'meta_message_id',target.meta_message_id,'error',target.failure_reason),'automation','outbound-result:'||target.id::text||':'||p_lease_id::text||':'||action)
  on conflict(source_key) do nothing;
  return jsonb_build_object('updated',true,'message_id',target.id,'delivery_status',target.delivery_status,'meta_message_id',target.meta_message_id,'uncertain',p_uncertain);
end;
$$;

drop function if exists public.record_whatsapp_message_status(text,text,timestamptz,jsonb);

create function public.record_whatsapp_message_status(p_meta_message_id text,p_status text,p_timestamp timestamptz,p_raw_payload jsonb,p_status_event_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare message public.whatsapp_messages; status_event public.whatsapp_message_status_events; existing_event public.whatsapp_message_status_events; rank_current integer; rank_new integer; applied boolean:=false;
begin
  if p_status not in ('sent','delivered','read','failed') or nullif(trim(p_status_event_key),'') is null then raise exception 'Estado de mensaje inválido'; end if;
  select * into message from public.whatsapp_messages where meta_message_id=p_meta_message_id for update;
  if message.id is null then raise exception 'El mensaje saliente aún no existe; reintenta este estado'; end if;
  if message.direction<>'outbound' then raise exception 'Solo los mensajes salientes reciben estados de Meta'; end if;
  insert into public.whatsapp_message_status_events(message_id,meta_message_id,status,event_key,source_timestamp,payload)
  values(message.id,p_meta_message_id,p_status,trim(p_status_event_key),p_timestamp,coalesce(p_raw_payload,'{}'::jsonb))
  on conflict(event_key) do nothing returning * into status_event;
  if status_event.id is null then
    select * into existing_event from public.whatsapp_message_status_events where event_key=trim(p_status_event_key);
    if existing_event.message_id<>message.id or existing_event.status<>p_status then raise exception 'La clave del estado ya pertenece a otro evento'; end if;
    return jsonb_build_object('updated',false,'duplicate',true,'message_id',message.id,'conversation_id',message.conversation_id,'status',message.delivery_status);
  end if;
  rank_current := case message.delivery_status when 'received' then 0 when 'queued' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'failed' then 5 else 0 end;
  rank_new := case p_status when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'failed' then 5 end;
  if rank_new>rank_current and not (p_status='failed' and message.delivery_status in ('delivered','read')) then
    update public.whatsapp_messages as wm set delivery_status=p_status,
      sent_at=case when p_status='sent' then coalesce(wm.sent_at,p_timestamp,now()) else wm.sent_at end,
      delivered_at=case when p_status='delivered' then coalesce(wm.delivered_at,p_timestamp,now()) else wm.delivered_at end,
      read_at=case when p_status='read' then coalesce(wm.read_at,p_timestamp,now()) else wm.read_at end,
      failed_at=case when p_status='failed' then coalesce(wm.failed_at,p_timestamp,now()) else wm.failed_at end,
      failure_reason=case when p_status='failed' then coalesce(p_raw_payload#>>'{errors,0,title}',p_raw_payload#>>'{errors,0,message}',wm.failure_reason) else wm.failure_reason end
    where id=message.id returning * into message;
    applied:=true;
  end if;
  insert into public.conversation_events(conversation_id,event_type,action,details,source_key,occurred_at)
  values(message.conversation_id,'message_status',p_status,jsonb_build_object('message_id',message.id,'meta_message_id',p_meta_message_id,'timestamp',p_timestamp,'applied_to_current_state',applied),
    'message-status:'||trim(p_status_event_key),coalesce(p_timestamp,now()))
  on conflict(source_key) do nothing;
  return jsonb_build_object('updated',applied,'event_recorded',true,'message_id',message.id,'conversation_id',message.conversation_id,'status',message.delivery_status);
end;
$$;

create or replace function public.record_whatsapp_consent(
  p_conversation_id uuid,p_policy_version text,p_notice_text text,p_customer_response text,p_meta_message_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; existing public.privacy_consents; source_message public.whatsapp_messages; normalized text; granted boolean; decision text;
begin
  if nullif(trim(p_policy_version),'') is null or nullif(trim(p_notice_text),'') is null or nullif(trim(p_meta_message_id),'') is null then raise exception 'El consentimiento requiere política, aviso y mensaje de origen'; end if;
  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null then raise exception 'Conversación no encontrada'; end if;
  select * into existing from public.privacy_consents where meta_message_id=p_meta_message_id;
  if existing.id is not null then
    if existing.conversation_id<>p_conversation_id then raise exception 'El mensaje de consentimiento ya pertenece a otra conversación'; end if;
    return jsonb_build_object('recognized',true,'granted',existing.granted,'consent_status',case when existing.granted then 'granted' else 'denied' end,'conversation_id',existing.conversation_id,'duplicate',true);
  end if;
  select * into source_message from public.whatsapp_messages
  where conversation_id=p_conversation_id and meta_message_id=p_meta_message_id and direction='inbound';
  if source_message.id is null or source_message.body is null then raise exception 'No existe el mensaje de autorización indicado'; end if;
  if trim(source_message.body)<>trim(coalesce(p_customer_response,'')) then raise exception 'La respuesta indicada no coincide con el mensaje original'; end if;
  normalized := trim(regexp_replace(translate(upper(source_message.body),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]+',' ','g'));
  if normalized in ('ACEPTO','SI ACEPTO','SÍ ACEPTO') then granted:=true;decision:='granted';
  elsif normalized in ('NO ACEPTO','NO AUTORIZO') then granted:=false;decision:='denied';
  else return jsonb_build_object('recognized',false,'consent_status',conversation.consent_status); end if;
  insert into public.privacy_consents(contact_id,conversation_id,policy_version,notice_text,customer_response,granted,meta_message_id)
  values(conversation.contact_id,conversation.id,p_policy_version,p_notice_text,source_message.body,granted,p_meta_message_id);
  update public.whatsapp_conversations set consent_status=decision,consent_version=p_policy_version,consented_at=case when granted then now() else null end,status=case when granted then 'open' else 'closed' end,closed_at=case when granted then null else now() end
  where id=conversation.id;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,source_key)
  values(conversation.id,'privacy_consent',decision,jsonb_build_object('policy_version',p_policy_version,'meta_message_id',p_meta_message_id),'customer','consent:'||p_meta_message_id)
  on conflict(source_key) do nothing;
  return jsonb_build_object('recognized',true,'granted',granted,'consent_status',decision,'conversation_id',conversation.id);
end;
$$;

create or replace function public.create_human_task(
  p_conversation_id uuid,p_request_key text,p_task_type text,p_priority text,p_title text,p_question text,
  p_context jsonb default '{}'::jsonb,p_order_id uuid default null,p_assigned_to_phone text default null,p_due_at timestamptz default null
)
returns public.human_tasks language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; existing public.human_tasks; target public.human_tasks;
begin
  if nullif(trim(p_request_key),'') is null or nullif(trim(p_title),'') is null or nullif(trim(p_question),'') is null then raise exception 'El pendiente requiere clave, título y pregunta'; end if;
  if p_assigned_to_phone is not null and p_assigned_to_phone!~'^\+[1-9][0-9]{7,14}$' then raise exception 'Teléfono de responsable inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_request_key),3));
  select * into existing from public.human_tasks where request_key=trim(p_request_key);
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id or existing.task_type is distinct from p_task_type then raise exception 'La clave ya pertenece a otro pendiente'; end if;
    return existing;
  end if;
  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.consent_status<>'granted' or conversation.status not in ('open','waiting_customer','waiting_human') then raise exception 'La conversación no permite crear pendientes'; end if;
  if conversation.branch_id is null then raise exception 'Debes confirmar la sede antes de escalar la consulta'; end if;
  insert into public.human_tasks(conversation_id,branch_id,order_id,task_type,priority,title,question,context,assigned_to_phone,due_at,request_key)
  values(conversation.id,conversation.branch_id,p_order_id,p_task_type,p_priority,trim(p_title),trim(p_question),coalesce(p_context,'{}'::jsonb),p_assigned_to_phone,p_due_at,trim(p_request_key)) returning * into target;
  update public.whatsapp_conversations set status='waiting_human' where id=conversation.id;
  insert into public.conversation_events(conversation_id,event_type,action,details,source_key)
  values(conversation.id,'human_task','created',jsonb_build_object('task_id',target.id,'task_type',target.task_type,'priority',target.priority),'human-task-created:'||target.id::text)
  on conflict(source_key) do nothing;
  insert into public.automation_outbox(topic,aggregate_id,payload)
  values('human_task.created',target.id,jsonb_build_object('task_id',target.id,'conversation_id',target.conversation_id,'task_type',target.task_type,'title',target.title));
  return target;
end;
$$;

create or replace function public.resolve_human_task(p_task_id uuid,p_status text,p_resolution jsonb)
returns public.human_tasks language plpgsql security definer set search_path = '' as $$
declare target public.human_tasks;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede resolver este pendiente'; end if;
  if p_status not in ('resolved','rejected') then raise exception 'Resultado inválido'; end if;
  if p_resolution is null then raise exception 'Debes registrar la respuesta'; end if;
  update public.human_tasks set status=p_status,resolution=p_resolution,resolved_by=auth.uid(),resolved_at=now(),automation_error=null
  where id=p_task_id and status in ('pending','in_progress') returning * into target;
  if target.id is null then raise exception 'El pendiente ya fue atendido o no existe'; end if;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,actor_profile_id,source_key)
  values(target.conversation_id,'human_task',target.status,jsonb_build_object('task_id',target.id,'task_type',target.task_type,'status',target.status,'resolution',target.resolution),'human',auth.uid(),'human-task:'||target.id::text||':'||target.status)
  on conflict(source_key) do nothing;
  insert into public.automation_outbox(topic,aggregate_id,payload)
  values('human_task.completed',target.id,jsonb_build_object('task_id',target.id,'conversation_id',target.conversation_id,'status',target.status,'resolution',target.resolution));
  return target;
end;
$$;

create or replace function public.adjust_branch_inventory(
  p_branch_id text,p_product_id uuid,p_sku text,p_name text,p_description text,p_price bigint,
  p_available_qty integer,p_low_stock_threshold integer,p_seasonal boolean,p_active boolean,p_reason text default 'Ajuste desde el panel'
)
returns public.branch_inventory language plpgsql security definer set search_path = '' as $$
declare product public.products; previous_product public.products; stock public.branch_inventory; previous public.branch_inventory; delta integer; before_state jsonb; after_state jsonb;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede modificar inventario'; end if;
  if p_available_qty < 0 or p_price < 0 or p_low_stock_threshold < 0 then raise exception 'Valores de inventario inválidos'; end if;
  if p_product_id is not null then
    select * into product from public.products where id=p_product_id for update;
    if product.id is null then raise exception 'Producto no encontrado'; end if;
    previous_product:=product;
    update public.products set sku=nullif(trim(p_sku),''),name=trim(p_name),description=nullif(trim(p_description),''),seasonal=p_seasonal where id=product.id returning * into product;
  elsif nullif(trim(p_sku),'') is not null then
    perform pg_advisory_xact_lock(hashtextextended('product:'||trim(p_sku),2));
    select * into product from public.products where sku=trim(p_sku) for update;
    if product.id is null then
      insert into public.products(sku,name,description,seasonal,active) values(trim(p_sku),trim(p_name),nullif(trim(p_description),''),p_seasonal,true) returning * into product;
    else
      previous_product:=product;
      update public.products set name=trim(p_name),description=nullif(trim(p_description),''),seasonal=p_seasonal where id=product.id returning * into product;
    end if;
  else
    insert into public.products(name,description,seasonal,active) values(trim(p_name),nullif(trim(p_description),''),p_seasonal,true) returning * into product;
  end if;
  select * into previous from public.branch_inventory where branch_id=p_branch_id and product_id=product.id for update;
  if previous.product_id is not null and p_available_qty < previous.reserved_qty then raise exception 'La existencia no puede ser menor que las unidades reservadas'; end if;
  insert into public.branch_inventory(branch_id,product_id,price,available_qty,reserved_qty,low_stock_threshold,active)
  values(p_branch_id,product.id,p_price,p_available_qty,coalesce(previous.reserved_qty,0),p_low_stock_threshold,p_active)
  on conflict(branch_id,product_id) do update set price=excluded.price,available_qty=excluded.available_qty,low_stock_threshold=excluded.low_stock_threshold,active=excluded.active
  returning * into stock;
  before_state:=jsonb_build_object('product',case when previous_product.id is null then null else to_jsonb(previous_product) end,'inventory',case when previous.product_id is null then null else to_jsonb(previous) end);
  after_state:=jsonb_build_object('product',to_jsonb(product),'inventory',to_jsonb(stock));
  if before_state is distinct from after_state then
    insert into public.catalog_audit_events(branch_id,product_id,action,before_state,after_state)
    values(stock.branch_id,stock.product_id,case when previous.product_id is null then 'created' else 'updated' end,before_state,after_state);
  end if;
  delta := stock.available_qty-coalesce(previous.available_qty,0);
  if delta <> 0 then
    insert into public.inventory_movements(branch_id,product_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
    values(stock.branch_id,stock.product_id,case when previous.product_id is null then 'import' else 'adjustment' end,delta,coalesce(previous.available_qty,0),stock.available_qty,coalesce(previous.reserved_qty,0),stock.reserved_qty,p_reason,'Administrador');
  end if;
  return stock;
end;
$$;

drop function public.reserve_chat_inventory(uuid,text,uuid,integer,integer);

create function public.reserve_chat_inventory(
  p_conversation_id uuid,p_branch_id text,p_product_id uuid,p_quantity integer,p_idempotency_key text,p_minutes integer default 20
)
returns public.inventory_reservations language plpgsql security definer set search_path = '' as $$
declare conversation public.whatsapp_conversations; stock public.branch_inventory; reservation public.inventory_reservations;
begin
  if p_quantity < 1 or p_minutes not between 1 and 120 or nullif(trim(p_idempotency_key),'') is null then raise exception 'Reserva inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key),1));
  select * into reservation from public.inventory_reservations where idempotency_key=trim(p_idempotency_key);
  if reservation.id is not null then
    if reservation.conversation_id is distinct from p_conversation_id or reservation.branch_id is distinct from p_branch_id or reservation.product_id is distinct from p_product_id or reservation.quantity is distinct from p_quantity then
      raise exception 'La clave de idempotencia ya pertenece a otra reserva';
    end if;
    return reservation;
  end if;
  select * into conversation from public.whatsapp_conversations where id=p_conversation_id for update;
  if conversation.id is null or conversation.consent_status <> 'granted' then raise exception 'La conversación no tiene autorización vigente'; end if;
  if conversation.status not in ('open','waiting_customer') then raise exception 'La conversación no está disponible para reservar inventario'; end if;
  if conversation.branch_id is distinct from p_branch_id then raise exception 'La sede no coincide con la conversación'; end if;
  select bi.* into stock from public.branch_inventory bi join public.products p on p.id=bi.product_id
  where bi.branch_id=p_branch_id and bi.product_id=p_product_id and bi.active and p.active for update of bi;
  if stock.product_id is null then raise exception 'Producto no disponible en esta sede'; end if;
  if stock.available_qty-stock.reserved_qty < p_quantity then raise exception 'Inventario insuficiente'; end if;
  insert into public.inventory_reservations(conversation_id,branch_id,product_id,quantity,expires_at,idempotency_key)
  values(p_conversation_id,p_branch_id,p_product_id,p_quantity,now()+make_interval(mins=>p_minutes),trim(p_idempotency_key)) returning * into reservation;
  update public.branch_inventory set reserved_qty=reserved_qty+p_quantity where branch_id=p_branch_id and product_id=p_product_id;
  insert into public.inventory_movements(branch_id,product_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,actor_label)
  values(p_branch_id,p_product_id,p_conversation_id,reservation.id,'reservation',p_quantity,stock.available_qty,stock.available_qty,stock.reserved_qty,stock.reserved_qty+p_quantity,'Asistente WhatsApp');
  insert into public.conversation_events(conversation_id,event_type,action,details,source_key)
  values(p_conversation_id,'inventory','reserved',jsonb_build_object('reservation_id',reservation.id,'product_id',p_product_id,'quantity',p_quantity,'expires_at',reservation.expires_at),'inventory-reserved:'||reservation.id::text)
  on conflict(source_key) do nothing;
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
  if stock.product_id is null or stock.reserved_qty<reservation.quantity then raise exception 'Inventario reservado inconsistente'; end if;
  update public.branch_inventory set reserved_qty=reserved_qty-reservation.quantity where branch_id=reservation.branch_id and product_id=reservation.product_id;
  update public.inventory_reservations set status=case when expires_at<=now() then 'expired' else 'released' end where id=reservation.id returning * into reservation;
  insert into public.inventory_movements(branch_id,product_id,order_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
  values(stock.branch_id,stock.product_id,reservation.order_id,reservation.conversation_id,reservation.id,'release',-reservation.quantity,stock.available_qty,stock.available_qty,stock.reserved_qty,stock.reserved_qty-reservation.quantity,p_reason,'Automatización de inventario');
  if reservation.conversation_id is not null then
    insert into public.conversation_events(conversation_id,event_type,action,details,source_key)
    values(reservation.conversation_id,'inventory',reservation.status,jsonb_build_object('reservation_id',reservation.id,'product_id',reservation.product_id,'quantity',reservation.quantity,'reason',p_reason),'inventory-release:'||reservation.id::text)
    on conflict(source_key) do nothing;
  end if;
  return reservation;
end;
$$;

create or replace function public.commit_chat_inventory(p_reservation_id uuid,p_order_id uuid)
returns public.inventory_reservations language plpgsql security definer set search_path = '' as $$
declare reservation public.inventory_reservations; stock public.branch_inventory; target public.orders; conversation public.whatsapp_conversations; ordered_quantity integer; committed_quantity integer;
begin
  select * into reservation from public.inventory_reservations where id=p_reservation_id for update;
  if reservation.id is null then raise exception 'Reserva no encontrada'; end if;
  if reservation.status='committed' and reservation.order_id=p_order_id then return reservation; end if;
  if reservation.status <> 'active' then raise exception 'La reserva no está activa'; end if;
  if reservation.expires_at <= now() then
    select * into reservation from public.release_chat_inventory(reservation.id,'Reserva vencida antes de confirmar la compra');
    return reservation;
  end if;
  select * into conversation from public.whatsapp_conversations where id=reservation.conversation_id for update;
  if conversation.id is null or conversation.consent_status <> 'granted' then raise exception 'La conversación no tiene autorización vigente'; end if;
  if conversation.branch_id is distinct from reservation.branch_id or conversation.status not in ('open','waiting_human','converted') then raise exception 'La conversación no corresponde a una compra activa'; end if;
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null or target.branch_id <> reservation.branch_id then raise exception 'El pedido no pertenece a la sede reservada'; end if;
  if target.whatsapp_conversation_id is not null and target.whatsapp_conversation_id <> reservation.conversation_id then raise exception 'El pedido pertenece a otra conversación'; end if;
  select coalesce(sum((item->>'qty')::integer),0) into ordered_quantity
  from jsonb_array_elements(target.items) item
  where item->>'product_id'=reservation.product_id::text and coalesce(item->>'qty','')~'^[0-9]+$';
  select coalesce(sum(quantity),0) into committed_quantity from public.inventory_reservations
  where order_id=p_order_id and product_id=reservation.product_id and status='committed' and id<>reservation.id;
  if committed_quantity+reservation.quantity>ordered_quantity then raise exception 'La reserva no coincide con los productos y cantidades del pedido'; end if;
  select * into stock from public.branch_inventory where branch_id=reservation.branch_id and product_id=reservation.product_id for update;
  if stock.available_qty < reservation.quantity or stock.reserved_qty < reservation.quantity then raise exception 'Inventario inconsistente'; end if;
  update public.orders set whatsapp_conversation_id=reservation.conversation_id where id=target.id and whatsapp_conversation_id is null;
  update public.branch_inventory set available_qty=available_qty-reservation.quantity,reserved_qty=reserved_qty-reservation.quantity where branch_id=reservation.branch_id and product_id=reservation.product_id;
  update public.inventory_reservations set status='committed',order_id=p_order_id where id=reservation.id returning * into reservation;
  insert into public.inventory_movements(branch_id,product_id,order_id,conversation_id,reservation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after,reason,actor_label)
  values(stock.branch_id,stock.product_id,p_order_id,reservation.conversation_id,reservation.id,'sale',-reservation.quantity,stock.available_qty,stock.available_qty-reservation.quantity,stock.reserved_qty,stock.reserved_qty-reservation.quantity,'Compra confirmada','Automatización de inventario');
  insert into public.conversation_events(conversation_id,event_type,action,details,source_key)
  values(reservation.conversation_id,'inventory','committed',jsonb_build_object('reservation_id',reservation.id,'order_id',p_order_id,'product_id',reservation.product_id,'quantity',reservation.quantity),'inventory-committed:'||reservation.id::text)
  on conflict(source_key) do nothing;
  return reservation;
end;
$$;

alter table public.whatsapp_attachments enable row level security;
alter table public.conversation_events enable row level security;
alter table public.ai_runs enable row level security;
alter table public.whatsapp_message_status_events enable row level security;
alter table public.catalog_audit_events enable row level security;
alter table public.automation_outbox enable row level security;

grant select on public.whatsapp_attachments,public.conversation_events,public.ai_runs,public.whatsapp_message_status_events,public.catalog_audit_events to authenticated;
create policy whatsapp_attachments_admin_read on public.whatsapp_attachments for select to authenticated using (public.is_admin());
create policy conversation_events_admin_read on public.conversation_events for select to authenticated using (public.is_admin());
create policy ai_runs_admin_read on public.ai_runs for select to authenticated using (public.is_admin());
create policy whatsapp_message_status_events_admin_read on public.whatsapp_message_status_events for select to authenticated using (public.is_admin());
create policy catalog_audit_events_admin_read on public.catalog_audit_events for select to authenticated using (public.is_admin());

drop policy whatsapp_conversations_read on public.whatsapp_conversations;
create policy whatsapp_conversations_admin_read on public.whatsapp_conversations for select to authenticated using (public.is_admin());
drop policy whatsapp_messages_read on public.whatsapp_messages;
create policy whatsapp_messages_admin_read on public.whatsapp_messages for select to authenticated using (public.is_admin());
drop policy human_tasks_read on public.human_tasks;
create policy human_tasks_admin_read on public.human_tasks for select to authenticated using (public.is_admin());
drop policy products_admin_write on public.products;
drop policy branch_inventory_admin_write on public.branch_inventory;
revoke insert,update,delete on public.products,public.branch_inventory from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('whatsapp-media','whatsapp-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','audio/ogg','audio/mpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy whatsapp_media_admin_read on storage.objects for select to authenticated using (bucket_id='whatsapp-media' and public.is_admin());

revoke all on public.whatsapp_attachments,public.conversation_events,public.ai_runs,public.whatsapp_message_status_events,public.catalog_audit_events,public.automation_outbox from anon;
revoke insert,update,delete on public.whatsapp_attachments,public.conversation_events,public.ai_runs,public.whatsapp_message_status_events,public.catalog_audit_events,public.automation_outbox from authenticated;
grant select,insert on public.whatsapp_attachments,public.conversation_events,public.ai_runs,public.whatsapp_message_status_events,public.catalog_audit_events to service_role;
grant select,insert,update on public.automation_outbox to service_role;

revoke all on function public.adjust_branch_inventory(text,uuid,text,text,text,bigint,integer,integer,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.adjust_branch_inventory(text,uuid,text,text,text,bigint,integer,integer,boolean,boolean,text) to authenticated;
revoke all on function public.reserve_chat_inventory(uuid,text,uuid,integer,text,integer) from public,anon,authenticated;
revoke all on function public.release_chat_inventory(uuid,text) from public,anon,authenticated;
revoke all on function public.commit_chat_inventory(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_chat_inventory(uuid,text,uuid,integer,text,integer) to service_role;
grant execute on function public.release_chat_inventory(uuid,text) to service_role;
grant execute on function public.commit_chat_inventory(uuid,uuid) to service_role;
revoke all on function public.claim_pending_whatsapp_events(integer) from public,anon,authenticated;
revoke all on function public.claim_whatsapp_event(text) from public,anon,authenticated;
revoke all on function public.complete_whatsapp_event(text,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_automation_events(integer) from public,anon,authenticated;
revoke all on function public.complete_automation_event(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_pending_whatsapp_events(integer) to service_role;
grant execute on function public.claim_whatsapp_event(text) to service_role;
grant execute on function public.complete_whatsapp_event(text,uuid,text) to service_role;
grant execute on function public.claim_automation_events(integer) to service_role;
grant execute on function public.complete_automation_event(uuid,uuid,text) to service_role;
revoke all on function public.ingest_whatsapp_message(text,text,text,text,text,text,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_outbound_whatsapp_message(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_outbound_whatsapp_message(uuid,uuid,text,jsonb,text,boolean) from public,anon,authenticated;
revoke all on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) from public,anon,authenticated;
revoke all on function public.record_whatsapp_consent(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_human_task(uuid,text,text,text,text,text,jsonb,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.resolve_human_task(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_whatsapp_message(text,text,text,text,text,text,text,jsonb,text,text) to service_role;
grant execute on function public.queue_outbound_whatsapp_message(uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.claim_outbound_whatsapp_message(uuid,uuid) to service_role;
grant execute on function public.complete_outbound_whatsapp_message(uuid,uuid,text,jsonb,text,boolean) to service_role;
grant execute on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) to service_role;
grant execute on function public.record_whatsapp_consent(uuid,text,text,text,text) to service_role;
grant execute on function public.create_human_task(uuid,text,text,text,text,text,jsonb,uuid,text,timestamptz) to service_role;
grant execute on function public.resolve_human_task(uuid,text,jsonb) to authenticated;

commit;
