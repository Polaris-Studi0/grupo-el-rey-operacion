begin;
-- Dedicated to the public v1 bot. No old v2 scheduler is activated.
create function public.bot_service_window(p_at timestamptz default now()) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('attention_open',t::time>=time '09:00' and t::time<time '20:00',
 'delivery_open',t::time>=time '09:00' and t::time<time '19:00',
 'next_opening',(t::date+case when t::time<time '09:00' then 0 else 1 end+time '09:00') at time zone 'America/Bogota')
 from (select p_at at time zone 'America/Bogota' t) clock;
$$;

create table public.bot_service_waits(
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
 inbound_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
 control_version integer not null,
 kind text not null check(kind in ('attention','delivery')),
 due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','queued','notified','cancelled','expired','uncertain')),
 notice_id uuid references public.whatsapp_messages(id) on delete set null,
 reminder_id uuid references public.whatsapp_messages(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(conversation_id,kind,due_at)
);
create index bot_service_waits_due on public.bot_service_waits(due_at) where status in ('pending','queued');
alter table public.bot_service_waits enable row level security;
grant select,insert,update on public.bot_service_waits to service_role;
grant select on public.bot_service_waits to authenticated;
create policy bot_service_waits_read on public.bot_service_waits for select to authenticated using (
 public.is_admin() or exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id and c.branch_id=public.current_branch_id())
);

create function public.defer_bot_service_turn(p_conversation_id uuid,p_inbound_message_id uuid,p_control_version integer,p_kind text,p_notify boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_conversations; m public.whatsapp_messages; w public.bot_service_waits; v_window jsonb; q jsonb; body text;
begin
 if p_kind not in ('attention','delivery') then raise exception 'Horario inválido';end if;
 select * into c from public.whatsapp_conversations where id=p_conversation_id for update;
 select * into m from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1;
 if c.id is null or c.status='closed' or c.automation_paused or c.automation_control_version is distinct from p_control_version
 or c.consent_status<>'granted' or c.consented_at is null or c.consent_version is null or m.id is distinct from p_inbound_message_id
 or (select granted from public.privacy_consents where contact_id=c.contact_id order by captured_at desc,id desc limit 1)=false
 or m.created_at<=now()-interval '23 hours' then return '{"skipped":true}'::jsonb;end if;
 v_window:=public.bot_service_window();
 if (p_kind='attention' and (v_window->>'attention_open')::boolean) or (p_kind='delivery' and (v_window->>'delivery_open')::boolean) then return '{"skipped":true}'::jsonb;end if;
 insert into public.bot_service_waits(conversation_id,inbound_message_id,control_version,kind,due_at)
 values(c.id,m.id,p_control_version,p_kind,(v_window->>'next_opening')::timestamptz)
 on conflict(conversation_id,kind,due_at) do update set inbound_message_id=excluded.inbound_message_id,control_version=excluded.control_version,updated_at=now()
 returning * into w;
 if p_notify then
  body:='Gracias por escribirnos. Nuestro horario de atención es de 9:00 a. m. a 8:00 p. m., hora de Colombia. Ahora estamos fuera de horario. '
   ||case when (now() at time zone 'America/Bogota')::time<time '09:00' then 'Hoy' else 'Mañana' end
   ||' a partir de las 9:00 a. m. te escribiré para continuar. Los domicilios se gestionan hasta las 7:00 p. m.';
  if p_kind='delivery' and (v_window->>'attention_open')::boolean then body:='Los domicilios se gestionan de 9:00 a. m. a 7:00 p. m. Por hoy ya cerramos ese servicio. Mañana a partir de las 9:00 a. m. te escribiré para continuar. También puedes recoger en sede hasta las 8:00 p. m.';end if;
  if w.notice_id is not null then q:=jsonb_build_object('message_id',w.notice_id);else
  q:=public.queue_outbound_whatsapp_message(c.id,'bot-hours-notice:'||w.id,'system','text',body,
   jsonb_build_object('pilot',true,'hours_notice',true,'notice_kind',case when (v_window->>'attention_open')::boolean then 'delivery' else 'attention' end,'hours_guard',true,'inbound_message_id',m.id,'control_version',p_control_version));
  end if;
  -- A burst updates the delivery guard only while the single notice has not started sending.
  update public.whatsapp_messages set raw_payload=raw_payload||jsonb_build_object('inbound_message_id',m.id,'control_version',p_control_version)
   where id=(q->>'message_id')::uuid and send_started_at is null and meta_message_id is null;
  update public.bot_service_waits set notice_id=(q->>'message_id')::uuid where id=w.id;
 end if;
 return jsonb_build_object('wait_id',w.id,'message_id',q->>'message_id','due_at',w.due_at);
end;$$;

create function public.prepare_next_bot_service_reminder() returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.bot_service_waits; c public.whatsapp_conversations; m public.whatsapp_messages; out_message public.whatsapp_messages; q jsonb;
begin
 if not (public.bot_service_window()->>'attention_open')::boolean then return null;end if;
 -- Consistent lock order with outbound claims: conversation before wait/message.
 select wc.* into c from public.whatsapp_conversations wc join public.bot_service_waits sw on sw.conversation_id=wc.id
 where sw.status in ('pending','queued') and sw.due_at<=now() order by sw.due_at,sw.id limit 1 for update of wc skip locked;
 if c.id is null then return null;end if;
 select * into w from public.bot_service_waits where conversation_id=c.id and status in ('pending','queued') and due_at<=now() order by due_at,id limit 1 for update;
 select * into m from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1;
 if c.status='closed' or c.automation_paused or c.consent_status<>'granted' or c.consented_at is null or c.consent_version is null
 or (select granted from public.privacy_consents where contact_id=c.contact_id order by captured_at desc,id desc limit 1)=false
 or c.automation_control_version<>w.control_version or m.id is distinct from w.inbound_message_id then
  update public.bot_service_waits set status='cancelled',updated_at=now() where id=w.id;return jsonb_build_object('wait_id',w.id,'cancelled',true);
 end if;
 -- The normal overnight wait is at most 13 hours. After an outage, do not send
 -- free text outside Meta's customer-service window or claim it was delivered.
 if m.created_at<=now()-interval '23 hours' then
  update public.bot_service_waits set status='expired',updated_at=now() where id=w.id;return jsonb_build_object('wait_id',w.id,'expired',true);
 end if;
 if w.reminder_id is not null then
  select * into out_message from public.whatsapp_messages where id=w.reminder_id;
  if out_message.meta_message_id is not null then
   update public.bot_service_waits set status='notified',updated_at=now() where id=w.id;return jsonb_build_object('wait_id',w.id,'notified',true);
  elsif out_message.send_started_at is not null then
   if out_message.send_started_at<now()-interval '5 minutes' then update public.bot_service_waits set status='uncertain',updated_at=now() where id=w.id;end if;
   return jsonb_build_object('wait_id',w.id,'sending',true);
  elsif out_message.delivery_status<>'queued' then
   update public.bot_service_waits set status='cancelled',updated_at=now() where id=w.id;return jsonb_build_object('wait_id',w.id,'cancelled',true);
  end if;
 end if;
 q:=public.queue_outbound_whatsapp_message(c.id,'bot-hours-opening:'||w.id,'system','text',
 case when w.kind='delivery' then '¡Hola! Ya estamos atendiendo y podemos continuar con tu domicilio. ¿Seguimos con tu compra?'
 else '¡Hola! Ya estamos atendiendo de nuevo. Podemos continuar con lo que nos escribiste. ¿En qué te ayudo?' end,
 jsonb_build_object('pilot',true,'hours_guard',true,'service_wait_id',w.id,'control_version',w.control_version,'inbound_message_id',m.id));
 update public.bot_service_waits set status='queued',reminder_id=(q->>'message_id')::uuid,updated_at=now() where id=w.id;
 -- One opening message per chat even if delivery cutoff and evening closure overlap.
 update public.bot_service_waits set status='cancelled',updated_at=now() where conversation_id=c.id and id<>w.id and status='pending' and due_at<=now();
 return jsonb_build_object('wait_id',w.id,'message_id',q->>'message_id');
end;$$;

create function public.finish_bot_service_reminder(p_wait_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.bot_service_waits w set status=case when m.meta_message_id is not null then 'notified'
 when m.delivery_status='failed' and m.send_started_at is null then 'cancelled' else w.status end,updated_at=now()
 from public.whatsapp_messages m where w.id=p_wait_id and m.id=w.reminder_id and w.status='queued';
end;$$;

-- Patch only the expected fragments of the current v1 implementations. Preserve
-- all subsequent stock, payment, attachment, privacy and manual-control guards.
do $patch$
declare definition text; before_fragment text; after_fragment text;
begin
 definition:=pg_get_functiondef('public.record_whatsapp_consent(uuid,text,text,text,text)'::regprocedure);
 before_fragment:=$old$  if normalized in ('ACEPTO','SI ACEPTO','SÍ ACEPTO') then$old$;
 after_fragment:=$new$  if normalized in ('SI','NO') and (conversation.consent_status='granted' or not exists(
    select 1 from public.whatsapp_messages notice where notice.conversation_id=conversation.id and notice.direction='outbound'
    and notice.idempotency_key like 'privacy-notice:pilot:%' and notice.delivery_status in ('sent','delivered','read')
    and coalesce(notice.sent_at,notice.created_at)<=source_message.created_at
  )) then return jsonb_build_object('recognized',false,'consent_status',conversation.consent_status);end if;
  if normalized in ('ACEPTO','SI ACEPTO','SÍ ACEPTO','SI') then$new$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar versión de consentimiento';end if;
 definition:=replace(definition,before_fragment,after_fragment);
 definition:=replace(definition,$old$normalized in ('NO ACEPTO','NO AUTORIZO')$old$,$new$normalized in ('NO ACEPTO','NO AUTORIZO','NO')$new$);
 execute definition;

 definition:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 before_fragment:=' needs_checkout boolean:=false;';
 if position(before_fragment in definition)=0 then raise exception 'Revisar versión comercial';end if;
 definition:=replace(definition,before_fragment,' delivery_deferred boolean:=false; needs_checkout boolean:=false;');
 before_fragment:=$old$ s:=coalesce(c.sales_state->'pilot_commerce','{}'); old_s:=s;$old$;
 after_fragment:=$new$ if p_decision->>'service_hours_enforced'='true' and not (public.bot_service_window()->>'attention_open')::boolean then
  return '{"skipped":true,"reason":"outside_attention_hours"}'::jsonb;end if;
 s:=coalesce(c.sales_state->'pilot_commerce','{}'); old_s:=s;$new$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar guarda comercial';end if;
 definition:=replace(definition,before_fragment,after_fragment);
 before_fragment:=$old$ if needs_checkout and s->>'stage' is distinct from 'ordered' and coalesce(p_decision->>'cancel_cart','false')<>'true' then$old$;
 after_fragment:=$new$ if p_decision->>'service_hours_enforced'='true' and needs_checkout and s->>'fulfillment_type'='delivery'
 and s->>'stage' is distinct from 'ordered' and coalesce(p_decision->>'cancel_cart','false')<>'true'
 and not (public.bot_service_window()->>'delivery_open')::boolean then
  delivery_deferred:=true;needs_checkout:=false;reason:=null;intent:='checkout';
  body:='Los domicilios se gestionan de 9:00 a. m. a 7:00 p. m. Por hoy ya cerramos ese servicio. Conservamos los datos de tu compra y mañana, desde las 9:00 a. m., te escribiré para continuar. También puedes recoger en sede hasta las 8:00 p. m.'
   ||case when s->>'stage' in ('payment','review') or s ? 'approved_payment_task_id' then ' Si ya pagaste, conservamos tu comprobante; no hagas otra transferencia.' else '' end;
 end if;
 if needs_checkout and s->>'stage' is distinct from 'ordered' and coalesce(p_decision->>'cancel_cart','false')<>'true' then$new$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar checkout';end if;
 definition:=replace(definition,before_fragment,after_fragment);
 before_fragment:=' result:=jsonb_build_object(''ok'',true,''message_ids'',message_ids';
 after_fragment:=$new$ if p_decision->>'service_hours_enforced'='true' then
  update public.whatsapp_messages set raw_payload=raw_payload||jsonb_build_object('hours_guard',true,'delivery_guard',needs_checkout and s->>'fulfillment_type'='delivery' and purchase.id is null and not delivery_deferred)
   where id::text in(select jsonb_array_elements_text(message_ids));end if;
 result:=jsonb_build_object('delivery_deferred',delivery_deferred,'ok',true,'message_ids',message_ids$new$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar resultado comercial';end if;
 definition:=replace(definition,before_fragment,after_fragment);
 execute definition;

 definition:=pg_get_functiondef('public.claim_outbound_whatsapp_message(uuid,uuid)'::regprocedure);
 before_fragment:=$old$  if target.raw_payload->>'commerce'='true' and ($old$;
 after_fragment:=$new$  if target.raw_payload->>'hours_guard'='true' and coalesce(target.raw_payload->>'internal_notification','false')<>'true' then
    if target.raw_payload->>'hours_notice'='true' then
      if (public.bot_service_window()->>case when target.raw_payload->>'notice_kind'='delivery' then 'delivery_open' else 'attention_open' end)::boolean then
        update public.whatsapp_messages set delivery_status='failed',failure_reason='hours_notice_expired',failed_at=now() where id=target.id;
        return jsonb_build_object('send',false,'state','blocked','reason','hours_notice_expired');end if;
    elsif not (public.bot_service_window()->>'attention_open')::boolean then
      return jsonb_build_object('send',false,'state','deferred','reason','outside_attention_hours');
    end if;
    if target.raw_payload->>'delivery_guard'='true' and not (public.bot_service_window()->>'delivery_open')::boolean then
      return jsonb_build_object('send',false,'state','deferred','reason','outside_delivery_hours');end if;
    if c.consent_status<>'granted' or c.consented_at is null or c.consent_version is null
      or (select granted from public.privacy_consents where contact_id=c.contact_id order by captured_at desc,id desc limit 1)=false
      or target.raw_payload->>'control_version' is distinct from c.automation_control_version::text
      or target.raw_payload->>'inbound_message_id' is distinct from (select id::text from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' order by created_at desc,id desc limit 1)
      or not exists(select 1 from public.whatsapp_messages where id::text=target.raw_payload->>'inbound_message_id' and created_at>now()-interval '23 hours') then
      update public.whatsapp_messages set delivery_status='failed',failure_reason='service_context_changed',failed_at=now() where id=target.id;
      return jsonb_build_object('send',false,'state','blocked','reason','service_context_changed');end if;
  end if;
  if target.raw_payload ? 'bot_asset_id' and target.sender_type<>'human' and not (public.bot_service_window()->>'attention_open')::boolean then
    return jsonb_build_object('send',false,'state','deferred','reason','outside_attention_hours');end if;
  if target.raw_payload->>'commerce'='true' and ($new$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar claim de envío';end if;
 execute replace(definition,before_fragment,after_fragment);
end;$patch$;

revoke all on function public.bot_service_window(timestamptz),public.defer_bot_service_turn(uuid,uuid,integer,text,boolean),public.prepare_next_bot_service_reminder(),public.finish_bot_service_reminder(uuid) from public,anon,authenticated;
grant execute on function public.bot_service_window(timestamptz),public.defer_bot_service_turn(uuid,uuid,integer,text,boolean),public.prepare_next_bot_service_reminder(),public.finish_bot_service_reminder(uuid) to service_role;
notify pgrst,'reload schema';
commit;
