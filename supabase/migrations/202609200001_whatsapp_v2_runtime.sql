-- New bot foundations are opt-in. Existing production maintenance stays intact.
create table public.whatsapp_bot_runtime (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  owner_phone text not null check(owner_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);
insert into public.whatsapp_bot_runtime(id,enabled,owner_phone) values(true,false,'+573127378289');
alter table public.whatsapp_bot_runtime enable row level security;
revoke all on public.whatsapp_bot_runtime from anon,authenticated;
grant select,update on public.whatsapp_bot_runtime to service_role;

alter table public.branches add column web_slug text unique;
update public.branches set web_slug=case id when 'b1' then 'robledo-aures'
 when 'b2' then 'robledo-diamante-calle-80' when 'b3' then 'santa-cruz'
 when 'b4' then 'san-gabriel-itagui' when 'b5' then 'robledo-diamante-diagonal-85'
 when 'b6' then 'floresta' when 'b7' then 'la-80' when 'b8' then 'la-estrella'
 when 'b9' then 'campo-valdez' when 'b10' then 'san-antonio-prado' end;
alter table public.whatsapp_contacts add column name_confirmed_at timestamptz;
alter table public.whatsapp_conversations
 add column bot_version text,
 add column waiting_for text not null default 'none' check(waiting_for in ('none','customer','team','opening')),
 add column awaiting_message_id uuid references public.whatsapp_messages(id),
 add column awaiting_since timestamptz,
 add column reminder_sent_at timestamptz,
 add column resume_due_at timestamptz;

create table public.whatsapp_bot_jobs (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.whatsapp_conversations(id),
 inbound_message_id uuid not null references public.whatsapp_messages(id),
 kind text not null check(kind in ('opening','reminder','owner_reply')),
 job_key text not null unique,
 status text not null default 'pending' check(status in ('pending','processing','done','cancelled')),
 lease_until timestamptz,
 lease_id uuid,
 attempts integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.whatsapp_bot_jobs enable row level security;
revoke all on public.whatsapp_bot_jobs from anon,authenticated;
grant select,insert,update on public.whatsapp_bot_jobs to service_role;

create function public.whatsapp_service_open(p_at timestamptz default now(),p_delivery boolean default false)
returns boolean language sql stable set search_path='' as $$
 select timezone('America/Bogota',p_at)::time>=time '09:00'
 and timezone('America/Bogota',p_at)::time<case when p_delivery then time '19:00' else time '20:00' end;
$$;
create function public.whatsapp_next_opening(p_at timestamptz default now())
returns timestamptz language sql stable set search_path='' as $$
 select ((timezone('America/Bogota',p_at)::date
   +case when timezone('America/Bogota',p_at)::time>=time '20:00' then 1 else 0 end)
   +time '09:00') at time zone 'America/Bogota';
$$;

create function public.prepare_whatsapp_v2_turn(p_message_id uuid,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.whatsapp_messages; c public.whatsapp_conversations; contact public.whatsapp_contacts;
 notice constant text := 'Antes de continuar: Grupo Almacenes El Rey tratará tu nombre, teléfono, mensajes y datos del pedido para atender tu solicitud, gestionar la compra y conservar la trazabilidad. Responde ACEPTO para continuar o NO ACEPTO para finalizar.';
 hours constant text := 'Nuestro horario de atención es de 9:00 a. m. a 8:00 p. m.; los domicilios se gestionan hasta las 7:00 p. m. Retomaremos tu consulta a las 9:00 a. m. en la siguiente apertura.';
 selected_branch text; selected_slug text; key text; body text; consent jsonb; queued jsonb; old_message uuid;
begin
 if not exists(select 1 from public.whatsapp_bot_runtime where enabled) then return jsonb_build_object('route','maintenance'); end if;
 select * into m from public.whatsapp_messages where id=p_message_id and direction='inbound';
 if m.id is null then raise exception 'Mensaje inválido'; end if;
 select * into c from public.whatsapp_conversations where id=m.conversation_id for update;
 select * into contact from public.whatsapp_contacts where id=c.contact_id;
 if c.status='closed' or c.consent_status='denied' then return jsonb_build_object('route','silent'); end if;
 if c.automation_paused then return jsonb_build_object('route','human_control'); end if;
 select id into old_message from public.whatsapp_messages where idempotency_key='v2-gate:'||m.id;
 if old_message is not null then return jsonb_build_object('route','send','message_id',old_message,'reused',true); end if;
 if m.sender_type='customer' and not(c.landing_context ? 'initial_message') then
   selected_slug:=substring(coalesce(m.body,'') from '\[SEDE:([a-z0-9-]+)\]');
   select id into selected_branch from public.branches where active and web_slug=selected_slug;
   update public.whatsapp_conversations set bot_version='v2',
     branch_id=coalesce(branch_id,selected_branch),
     landing_context=landing_context||jsonb_strip_nulls(jsonb_build_object('initial_message',m.body,
       'initial_message_id',m.id,'web_slug',selected_slug,'branch_id',selected_branch,
       'origin',case when position('[ORIGEN:WEB]' in coalesce(m.body,''))>0 then 'web' else 'whatsapp' end))
   where id=c.id returning * into c;
 end if;
 if c.consent_status<>'granted' then
   if exists(select 1 from public.whatsapp_messages where conversation_id=c.id and raw_payload->>'v2_privacy'='true') then
     consent:=public.record_whatsapp_consent(c.id,'2026-09-01',notice,m.body,m.meta_message_id);
     if consent->>'granted'='false' then return jsonb_build_object('route','silent'); end if;
     if consent->>'granted'='true' then c.consent_status:='granted'; end if;
   end if;
   if c.consent_status<>'granted' then
     queued:=public.queue_outbound_whatsapp_message(c.id,'privacy-notice:v2:'||m.id,'system','text',
       case when public.whatsapp_service_open(p_at) then notice else hours||E'\n\n'||notice end,
       jsonb_build_object('v2_privacy',true));
     if not public.whatsapp_service_open(p_at) then
       update public.whatsapp_conversations set resume_due_at=public.whatsapp_next_opening(p_at),waiting_for='opening' where id=c.id;
     end if;
     return jsonb_build_object('route','send','message_id',queued->>'message_id','consent_required',true);
   end if;
 end if;
 if not public.whatsapp_service_open(p_at) then
   body:=hours;
   update public.whatsapp_conversations set bot_version='v2',resume_due_at=public.whatsapp_next_opening(p_at),waiting_for='opening' where id=c.id;
 elsif consent->>'granted'='true' and contact.name_confirmed_at is null then
   body:='¡Gracias por autorizar! ¿Cómo te llamas?';
   update public.whatsapp_conversations set bot_version='v2',status='waiting_customer',waiting_for='customer',awaiting_since=p_at,awaiting_message_id=m.id where id=c.id;
 else
   update public.whatsapp_conversations set bot_version='v2',resume_due_at=null,waiting_for='none' where id=c.id;
   return jsonb_build_object('route','agent','inbound_message_id',m.id,'conversation_id',c.id,
     'phase',case when contact.name_confirmed_at is null then 'name' when c.branch_id is null then 'branch' else 'conversation' end);
 end if;
 key:='v2-gate:'||m.id;
 queued:=public.queue_outbound_whatsapp_message(c.id,key,'system','text',body,'{"bot_version":"v2"}'::jsonb);
 return jsonb_build_object('route','send','message_id',queued->>'message_id');
end;
$$;

-- Durable work queue. Nothing is scheduled while the new bot is disabled.
create function public.claim_whatsapp_v2_jobs(p_at timestamptz default now(),p_limit integer default 10)
returns setof public.whatsapp_bot_jobs language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.whatsapp_bot_runtime where enabled) or not public.whatsapp_service_open(p_at) then return; end if;
 insert into public.whatsapp_bot_jobs(conversation_id,inbound_message_id,kind,job_key)
 select c.id,m.id,'opening','opening:'||c.id||':'||c.resume_due_at
 from public.whatsapp_conversations c
 cross join lateral(select id,created_at from public.whatsapp_messages where conversation_id=c.id and sender_type='customer' and direction='inbound' order by created_at desc,id desc limit 1)m
 where c.bot_version='v2' and not c.automation_paused and c.consent_status='granted' and c.status<>'closed'
   and c.resume_due_at<=p_at and m.created_at>p_at-interval '24 hours'
 on conflict(job_key) do nothing;
 insert into public.whatsapp_bot_jobs(conversation_id,inbound_message_id,kind,job_key)
 select c.id,c.awaiting_message_id,'reminder','reminder:'||c.id
 from public.whatsapp_conversations c
 where c.bot_version='v2' and not c.automation_paused and c.consent_status='granted' and c.status='waiting_customer'
   and c.waiting_for='customer' and c.awaiting_since<=p_at-interval '30 minutes' and c.reminder_sent_at is null
   and c.awaiting_message_id is not null
   and exists(select 1 from public.whatsapp_messages m where m.id=c.awaiting_message_id and m.created_at>p_at-interval '24 hours')
   and not exists(select 1 from public.whatsapp_messages m where m.conversation_id=c.id and m.direction='inbound' and m.sender_type='customer' and m.created_at>c.awaiting_since)
   and not exists(select 1 from public.orders where whatsapp_conversation_id=c.id)
   and not exists(select 1 from public.human_tasks where conversation_id=c.id and status in ('pending','in_progress'))
 on conflict(job_key) do nothing;
 return query with picked as (
   select j.id from public.whatsapp_bot_jobs j join public.whatsapp_conversations c on c.id=j.conversation_id
   where j.status in ('pending','processing') and (j.lease_until is null or j.lease_until<p_at)
    and j.attempts<5 and not c.automation_paused and c.consent_status='granted' and c.status<>'closed'
   order by j.created_at for update of j skip locked limit least(greatest(p_limit,1),20)
 ) update public.whatsapp_bot_jobs j set status='processing',lease_id=gen_random_uuid(),lease_until=p_at+interval '2 minutes',attempts=j.attempts+1
 from picked where j.id=picked.id returning j.*;
end;
$$;

create function public.prepare_whatsapp_v2_job(p_job_id uuid,p_lease_id uuid,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.whatsapp_bot_jobs; c public.whatsapp_conversations; queued jsonb; incoming public.whatsapp_messages;
begin
 select * into j from public.whatsapp_bot_jobs where id=p_job_id and lease_id=p_lease_id and status='processing' for update;
 if j.id is null then return jsonb_build_object('route','silent'); end if;
 select * into c from public.whatsapp_conversations where id=j.conversation_id for update;
 if not exists(select 1 from public.whatsapp_bot_runtime where enabled) or not public.whatsapp_service_open(p_at) then
   update public.whatsapp_bot_jobs set status='pending',lease_until=null,lease_id=null where id=j.id;
   return jsonb_build_object('route','silent');
 end if;
 if c.automation_paused or c.consent_status<>'granted' or c.status='closed' then
   update public.whatsapp_bot_jobs set status='cancelled' where id=j.id;return jsonb_build_object('route','silent');
 end if;
 if j.kind='reminder' then
   if c.waiting_for<>'customer' or (c.reminder_sent_at is not null and not exists(select 1 from public.whatsapp_messages where idempotency_key='v2-reminder:'||c.id))
    or not exists(select 1 from public.whatsapp_messages where id=j.inbound_message_id and created_at>p_at-interval '24 hours')
    or exists(select 1 from public.orders where whatsapp_conversation_id=c.id)
    or exists(select 1 from public.human_tasks where conversation_id=c.id and status in ('pending','in_progress'))
    or exists(select 1 from public.whatsapp_messages where conversation_id=c.id and direction='inbound' and sender_type='customer' and created_at>c.awaiting_since)
   then update public.whatsapp_bot_jobs set status='cancelled' where id=j.id;return jsonb_build_object('route','silent'); end if;
   queued:=public.queue_outbound_whatsapp_message(c.id,'v2-reminder:'||c.id,'assistant','text',
      '¿Te ayudo a continuar con tu consulta o tu compra? Aquí estamos cuando quieras retomarla. 😊','{"bot_version":"v2","reminder":true}'::jsonb);
   return jsonb_build_object('route','send','message_id',queued->>'message_id','job_id',j.id,'lease_id',j.lease_id);
 end if;
 if j.kind='opening' then
   if c.resume_due_at is null then
     update public.whatsapp_bot_jobs set status='cancelled' where id=j.id;return jsonb_build_object('route','silent');
   end if;
   insert into public.whatsapp_messages(conversation_id,direction,sender_type,message_type,body,raw_payload,delivery_status,idempotency_key)
   values(c.id,'inbound','system','text','Retomar la consulta pendiente al abrir la atención.',jsonb_build_object('opening_followup',true,'source_message_id',j.inbound_message_id),'received','v2-opening:'||j.id)
   on conflict(idempotency_key) where idempotency_key is not null do update set idempotency_key=excluded.idempotency_key returning * into incoming;
   return jsonb_build_object('route','agent','inbound_message_id',incoming.id,'conversation_id',c.id,'job_id',j.id,'lease_id',j.lease_id);
 end if;
 return jsonb_build_object('route','agent','inbound_message_id',j.inbound_message_id,'conversation_id',c.id,'job_id',j.id,'lease_id',j.lease_id);
end;
$$;
create function public.complete_whatsapp_v2_job(p_job_id uuid,p_lease_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.whatsapp_bot_jobs;
begin
 update public.whatsapp_bot_jobs set status='done',lease_until=null where id=p_job_id and lease_id=p_lease_id and status='processing' returning * into j;
 if j.kind='reminder' then update public.whatsapp_conversations set reminder_sent_at=now() where id=j.conversation_id;end if;
 if j.kind='opening' then update public.whatsapp_conversations set resume_due_at=null where id=j.conversation_id;end if;
 return j.id is not null;
end;
$$;

revoke all on function public.prepare_whatsapp_v2_turn(uuid,timestamptz),public.claim_whatsapp_v2_jobs(timestamptz,integer),public.prepare_whatsapp_v2_job(uuid,uuid,timestamptz),public.complete_whatsapp_v2_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_v2_turn(uuid,timestamptz),public.claim_whatsapp_v2_jobs(timestamptz,integer),public.prepare_whatsapp_v2_job(uuid,uuid,timestamptz),public.complete_whatsapp_v2_job(uuid,uuid) to service_role;
