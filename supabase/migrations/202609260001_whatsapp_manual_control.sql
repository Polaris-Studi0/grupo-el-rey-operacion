-- Nueva reconstrucción: registro durable de acciones manuales, sin activar la IA.
-- Aditiva e independiente de las migraciones v2 que no están en producción.
begin;
alter table public.whatsapp_conversations add column if not exists automation_control_version integer not null default 0;
create index if not exists whatsapp_messages_conversation_cursor on public.whatsapp_messages(conversation_id,created_at desc,id desc);

create table public.whatsapp_operator_actions (
  request_id uuid primary key,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete restrict,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('takeover','message','instruction')),
  payload jsonb not null,
  result jsonb not null,
  status text not null check(status in ('completed','pending_bot')),
  created_at timestamptz not null default now()
);
alter table public.whatsapp_operator_actions enable row level security;
create policy whatsapp_operator_actions_read on public.whatsapp_operator_actions for select to authenticated
using (exists(select 1 from public.profiles p join public.whatsapp_conversations c on c.id=conversation_id
  where p.id=auth.uid() and p.active and (p.role='admin' or p.branch_id=c.branch_id)));
grant select on public.whatsapp_operator_actions to authenticated;
grant all on public.whatsapp_operator_actions to service_role;
create index whatsapp_operator_actions_conversation on public.whatsapp_operator_actions(conversation_id,created_at desc);

create function public.apply_whatsapp_operator_action(
  p_conversation_id uuid,p_operator_id uuid,p_request_id uuid,p_action text,
  p_text text default null,p_paused boolean default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.whatsapp_conversations; p public.profiles; previous public.whatsapp_operator_actions;
  input jsonb; output jsonb; queued jsonb; cancelled integer:=0; inflight integer:=0;
begin
  if p_request_id is null or p_action is null or p_action not in ('takeover','message','instruction') then
    raise exception using errcode='22023',message='Acción inválida';
  end if;
  if p_action='takeover' and p_paused is null then raise exception using errcode='22023',message='Indica el modo de atención'; end if;
  if p_action in ('message','instruction') and (nullif(trim(p_text),'') is null or length(trim(p_text))>4096) then
    raise exception using errcode='22023',message='Escribe entre 1 y 4096 caracteres';
  end if;
  select * into p from public.profiles where id=p_operator_id and active for share;
  select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
  if p.id is null or c.id is null or (p.role<>'admin' and p.branch_id is distinct from c.branch_id) then
    raise exception using errcode='42501',message='No tienes acceso a esta conversación';
  end if;
  input:=jsonb_build_object('text',case when p_action<>'takeover' then trim(p_text) end,
    'paused',case when p_action='takeover' then p_paused end,'expected_version',p_expected_version);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,26));
  select * into previous from public.whatsapp_operator_actions where request_id=p_request_id;
  if previous.request_id is not null then
    if previous.conversation_id<>c.id or previous.operator_id<>p.id or previous.action<>p_action or previous.payload<>input then
      raise exception using errcode='22023',message='El identificador ya pertenece a otra acción';
    end if;
    return previous.result||jsonb_build_object('duplicate',true);
  end if;
  if c.status='closed' then raise exception using errcode='22023',message='La conversación está cerrada'; end if;
  if p_expected_version is distinct from c.automation_control_version then
    raise exception using errcode='40001',message='El control cambió en otra sesión. Actualiza la conversación';
  end if;
  -- Una indicación es contexto interno: no cambia el modo ni llama al flujo anterior.
  update public.whatsapp_conversations set
    automation_paused=case when p_action='takeover' then p_paused when p_action='message' then true else automation_paused end,
    automation_control_version=automation_control_version+1
  where id=c.id returning * into c;
  if c.automation_paused then
    update public.whatsapp_messages set delivery_status='failed',failed_at=now(),failure_reason='manual_control_cancelled'
    where conversation_id=c.id and direction='outbound' and sender_type<>'human'
      and delivery_status='queued' and send_started_at is null and meta_message_id is null;
    get diagnostics cancelled=row_count;
  end if;
  select count(*) into inflight from public.whatsapp_messages where conversation_id=c.id
    and direction='outbound' and sender_type<>'human' and send_started_at is not null and meta_message_id is null;
  if p_action='message' then
    queued:=public.queue_outbound_whatsapp_message(c.id,'operator-message:'||p_request_id::text,'human','text',trim(p_text),
      jsonb_build_object('operator_message',true,'operator_id',p.id));
    update public.whatsapp_conversations set status='waiting_customer' where id=c.id;
  end if;
  output:=jsonb_build_object('ok',true,'conversation_id',c.id,'request_id',p_request_id,
    'automation_paused',c.automation_paused,'automation_control_version',c.automation_control_version,
    'message_id',queued->>'message_id','cancelled_messages',cancelled,'inflight_messages',inflight,
    'instruction_saved',p_action='instruction','bot_dispatch','maintenance');
  insert into public.whatsapp_operator_actions(request_id,conversation_id,operator_id,action,payload,result,status)
  values(p_request_id,c.id,p.id,p_action,input,output,
    case when p_action='instruction' or (p_action='takeover' and not p_paused) then 'pending_bot' else 'completed' end);
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,actor_profile_id,source_key)
  values(c.id,'operator',p_action,output,'human',p.id,'operator-action:'||p_request_id::text);
  return output;
end;
$$;
revoke all on function public.apply_whatsapp_operator_action(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.apply_whatsapp_operator_action(uuid,uuid,uuid,text,text,boolean,integer) to service_role;

-- Los productores anteriores tampoco pueden dejar respuestas nuevas en cola
-- durante el control manual para que salgan accidentalmente al liberarlo.
create function public.guard_whatsapp_manual_queue() returns trigger
language plpgsql security definer set search_path='' as $$
declare paused boolean;
begin
  if new.direction='outbound' and new.sender_type<>'human' and new.delivery_status='queued' then
    select automation_paused into paused from public.whatsapp_conversations where id=new.conversation_id for update;
    if paused then
      new.delivery_status:='failed';new.failed_at:=now();new.failure_reason:='manual_control_cancelled';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_whatsapp_manual_queue() from public,anon,authenticated;
create trigger whatsapp_manual_queue_guard before insert on public.whatsapp_messages
for each row execute function public.guard_whatsapp_manual_queue();

-- Serializa la toma de control con el inicio de envío. Una petición ya enviada a
-- Meta no puede retirarse: se informa al operador como envío en curso/incierto.
create or replace function public.claim_outbound_whatsapp_message(p_message_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.whatsapp_messages; c public.whatsapp_conversations; recipient text;
begin
  if p_lease_id is null then raise exception 'Lease de envío inválido'; end if;
  select wc.* into c from public.whatsapp_conversations wc join public.whatsapp_messages m on m.conversation_id=wc.id
    where m.id=p_message_id for update of wc;
  select * into target from public.whatsapp_messages where id=p_message_id for update;
  if target.id is null then raise exception 'Mensaje saliente no encontrado'; end if;
  if target.direction<>'outbound' then raise exception 'El mensaje no es saliente'; end if;
  if target.meta_message_id is not null then return jsonb_build_object('send',false,'state','sent','message_id',target.id,'meta_message_id',target.meta_message_id); end if;
  if target.send_started_at is not null then return jsonb_build_object('send',false,'state','blocked_uncertain','message_id',target.id,'reason',target.failure_reason); end if;
  if target.delivery_status<>'queued' then return jsonb_build_object('send',false,'state',target.delivery_status,'message_id',target.id,'reason',target.failure_reason); end if;
  if c.status='closed' or (c.automation_paused and target.sender_type<>'human') then
    update public.whatsapp_messages set delivery_status='failed',failed_at=now(),failure_reason='conversation_unavailable' where id=target.id;
    return jsonb_build_object('send',false,'state','blocked','message_id',target.id,'reason','conversation_unavailable');
  end if;
  select coalesce(nullif(ltrim(phone_e164,'+'),''),nullif(trim(whatsapp_id),'')) into recipient
    from public.whatsapp_contacts where id=c.contact_id;
  if recipient is null then raise exception 'El contacto no tiene un destinatario de WhatsApp'; end if;
  update public.whatsapp_messages set send_started_at=now(),send_lease_id=p_lease_id,send_attempts=send_attempts+1 where id=target.id returning * into target;
  return jsonb_build_object('send',true,'state','claimed','message_id',target.id,'to',recipient,'type',target.message_type,
    'text',target.body,'template',target.raw_payload->'template','storage_bucket',target.raw_payload->>'storage_bucket',
    'storage_path',target.raw_payload->>'storage_path','mime_type',target.raw_payload->>'mime_type','caption',target.raw_payload->>'caption');
end;
$$;
revoke all on function public.claim_outbound_whatsapp_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_outbound_whatsapp_message(uuid,uuid) to service_role;
commit;
