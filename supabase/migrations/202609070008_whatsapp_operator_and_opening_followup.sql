-- Reanudaciones exactas, seguimiento de apertura y control humano del chat.

alter table public.whatsapp_conversations
  add column if not exists automation_paused boolean not null default false,
  add column if not exists opening_followup_sent_at timestamptz;

create index if not exists whatsapp_conversations_opening_followup_idx
  on public.whatsapp_conversations(opening_followup_sent_at,last_message_at)
  where consent_status='granted' and status not in ('closed','converted');

create or replace function public.claim_automation_event(p_task_id uuid,p_topic text)
returns setof public.automation_outbox
language plpgsql security definer set search_path=''
as $$
begin
  if p_task_id is null or p_topic not in ('human_task.created','human_task.completed') then
    raise exception 'Evento de automatización inválido';
  end if;

  if p_topic='human_task.completed' then
    update public.automation_outbox
    set status='processed',processed_at=coalesce(processed_at,now()),processing_started_at=null,lease_id=null,
      last_error='Omitido porque el pendiente ya fue resuelto'
    where aggregate_id=p_task_id and topic='human_task.created' and status in ('pending','failed','processing');
  elsif not exists (
    select 1 from public.human_tasks where id=p_task_id and status in ('pending','in_progress')
  ) then
    update public.automation_outbox
    set status='processed',processed_at=coalesce(processed_at,now()),processing_started_at=null,lease_id=null,
      last_error='Omitido porque el pendiente ya fue resuelto'
    where aggregate_id=p_task_id and topic=p_topic and status in ('pending','failed','processing');
    return;
  end if;

  return query
  with candidate as (
    select id from public.automation_outbox
    where aggregate_id=p_task_id and topic=p_topic and attempts<10 and (
      (status in ('pending','failed') and next_attempt_at<=now()) or
      (status='processing' and (processing_started_at is null or processing_started_at<now()-interval '2 minutes'))
    )
    order by created_at desc
    for update skip locked limit 1
  )
  update public.automation_outbox o
  set status='processing',processing_started_at=now(),lease_id=gen_random_uuid(),attempts=o.attempts+1,last_error=null
  from candidate where o.id=candidate.id
  returning o.*;
end;
$$;

create or replace function public.prepare_whatsapp_opening_followups()
returns table(inbound_message_id uuid,conversation_id uuid,ready_for_next_step boolean)
language plpgsql security definer set search_path=''
as $$
declare
  local_today date := timezone('America/Bogota',now())::date;
  candidate record;
  synthetic public.whatsapp_messages;
begin
  if timezone('America/Bogota',now())::time < time '08:55'
     or timezone('America/Bogota',now())::time >= time '10:00' then
    return;
  end if;

  for candidate in
    with latest as (
      select c.id as conversation_id,max(m.created_at) as last_inbound_at
      from public.whatsapp_conversations c
      join public.whatsapp_messages m on m.conversation_id=c.id
      where c.consent_status='granted' and c.status not in ('closed','converted')
        and not c.automation_paused and m.direction='inbound' and m.sender_type='customer'
      group by c.id
    )
    select c.id,l.last_inbound_at
    from latest l join public.whatsapp_conversations c on c.id=l.conversation_id
    where (c.opening_followup_sent_at is null or timezone('America/Bogota',c.opening_followup_sent_at)::date<local_today)
      and (
        (timezone('America/Bogota',l.last_inbound_at)::date=local_today-1
          and timezone('America/Bogota',l.last_inbound_at)::time>=time '20:00')
        or
        (timezone('America/Bogota',l.last_inbound_at)::date=local_today
          and timezone('America/Bogota',l.last_inbound_at)::time>=time '06:00'
          and timezone('America/Bogota',l.last_inbound_at)::time<time '09:00')
      )
      and not exists (
        select 1 from public.whatsapp_messages newer
        where newer.conversation_id=c.id and newer.direction='inbound' and newer.sender_type='customer'
          and timezone('America/Bogota',newer.created_at)::date=local_today
          and timezone('America/Bogota',newer.created_at)::time>=time '09:00'
      )
    for update of c skip locked
  loop
    insert into public.whatsapp_messages(
      conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key
    ) values(
      candidate.conversation_id,'inbound','human','text',
      'INSTRUCCIÓN DEL SISTEMA: La atención acaba de abrir. Retoma de manera natural el punto pendiente de esta conversación; saluda brevemente y haz la siguiente pregunta útil.',
      jsonb_build_object('opening_followup',true,'local_date',local_today),
      'received','opening-followup:'||candidate.conversation_id::text||':'||local_today::text
    ) on conflict(idempotency_key) where idempotency_key is not null do nothing returning * into synthetic;

    if synthetic.id is not null then
      update public.whatsapp_conversations set opening_followup_sent_at=now(),last_message_at=now()
      where id=candidate.conversation_id;
      inbound_message_id:=synthetic.id;
      conversation_id:=candidate.conversation_id;
      ready_for_next_step:=true;
      return next;
      synthetic:=null;
    end if;
  end loop;
end;
$$;

create or replace function public.prepare_operator_whatsapp_instruction(
  p_conversation_id uuid,p_instruction text,p_request_key text,p_operator_id uuid
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.whatsapp_conversations; m public.whatsapp_messages;
begin
  if nullif(trim(p_instruction),'') is null or nullif(trim(p_request_key),'') is null then
    raise exception 'La instrucción y su identificador son obligatorios';
  end if;
  select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
  if c.id is null or c.consent_status<>'granted' or c.status='closed' then
    raise exception 'La conversación no admite instrucciones';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_request_key),12));
  select * into m from public.whatsapp_messages where idempotency_key='operator-instruction:'||trim(p_request_key);
  if m.id is null then
  insert into public.whatsapp_messages(
    conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key
  ) values(
    c.id,'inbound','human','text','INSTRUCCIÓN INTERNA DEL OPERADOR: '||trim(p_instruction),
    jsonb_build_object('operator_instruction',true,'instruction',trim(p_instruction),'operator_id',p_operator_id),
    'received','operator-instruction:'||trim(p_request_key)
  ) returning * into m;
  end if;
  update public.whatsapp_conversations set status='open',last_message_at=now() where id=c.id;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,actor_profile_id,source_key)
  values(c.id,'operator','instruction',jsonb_build_object('message_id',m.id,'instruction',trim(p_instruction)),
    'human',p_operator_id,'operator-instruction:'||trim(p_request_key)) on conflict(source_key) do nothing;
  return jsonb_build_object('inbound_message_id',m.id,'conversation_id',c.id,'ready_for_next_step',true);
end;
$$;

create or replace function public.queue_operator_whatsapp_message(
  p_conversation_id uuid,p_body text,p_request_key text,p_operator_id uuid
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.whatsapp_conversations; queued jsonb;
begin
  if nullif(trim(p_body),'') is null or nullif(trim(p_request_key),'') is null then
    raise exception 'El mensaje y su identificador son obligatorios';
  end if;
  select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
  if c.id is null or c.status='closed' then raise exception 'La conversación está cerrada'; end if;
  queued:=public.queue_outbound_whatsapp_message(c.id,'operator-message:'||trim(p_request_key),'human','text',trim(p_body),
    jsonb_build_object('operator_message',true,'operator_id',p_operator_id));
  update public.whatsapp_conversations set automation_paused=true,status='waiting_customer',last_message_at=now() where id=c.id;
  return queued;
end;
$$;

create or replace function public.set_whatsapp_automation_paused(
  p_conversation_id uuid,p_paused boolean,p_operator_id uuid
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.whatsapp_conversations;
begin
  update public.whatsapp_conversations set automation_paused=coalesce(p_paused,false)
  where id=p_conversation_id returning * into c;
  if c.id is null then raise exception 'Conversación no encontrada'; end if;
  insert into public.conversation_events(conversation_id,event_type,action,details,actor_type,actor_profile_id,source_key)
  values(c.id,'operator',case when c.automation_paused then 'takeover' else 'automation_resumed' end,
    jsonb_build_object('automation_paused',c.automation_paused),'human',p_operator_id,
    'automation-mode:'||c.id::text||':'||clock_timestamp()::text);
  return jsonb_build_object('conversation_id',c.id,'automation_paused',c.automation_paused);
end;
$$;

update public.automation_outbox o
set status='processed',processed_at=coalesce(processed_at,now()),processing_started_at=null,lease_id=null,
  last_error='Omitido durante saneamiento: el pendiente ya estaba resuelto'
from public.human_tasks h
where o.aggregate_id=h.id and o.topic='human_task.created'
  and h.status not in ('pending','in_progress') and o.status in ('pending','failed','processing');

revoke all on function public.claim_automation_event(uuid,text) from public,anon,authenticated;
revoke all on function public.prepare_whatsapp_opening_followups() from public,anon,authenticated;
revoke all on function public.prepare_operator_whatsapp_instruction(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.queue_operator_whatsapp_message(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.set_whatsapp_automation_paused(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.claim_automation_event(uuid,text) to service_role;
grant execute on function public.prepare_whatsapp_opening_followups() to service_role;
grant execute on function public.prepare_operator_whatsapp_instruction(uuid,text,text,uuid) to service_role;
grant execute on function public.queue_operator_whatsapp_message(uuid,text,text,uuid) to service_role;
grant execute on function public.set_whatsapp_automation_paused(uuid,boolean,uuid) to service_role;
