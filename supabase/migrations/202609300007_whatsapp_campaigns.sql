begin;
create table public.whatsapp_marketing_permissions(
 phone_e164 text primary key check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 status text not null check(status in ('granted','revoked')),evidence text not null,
 recorded_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table public.whatsapp_campaigns(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 120),
 asset_id uuid not null references public.bot_media_assets(id),template jsonb not null,
 status text not null default 'draft' check(status in ('draft','queued','completed','cancelled')),
 excluded_count integer not null default 0,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),started_at timestamptz
);
create table public.whatsapp_campaign_recipients(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.whatsapp_campaigns(id),
 phone_e164 text not null references public.whatsapp_marketing_permissions(phone_e164),
 status text not null default 'pending' check(status in ('pending','sending','sent','delivered','read','failed','uncertain','skipped')),
 meta_message_id text unique,error text,claimed_at timestamptz,sent_at timestamptz,updated_at timestamptz not null default now(),
 unique(campaign_id,phone_e164)
);
create index campaign_pending on public.whatsapp_campaign_recipients(campaign_id) where status='pending';
alter table public.whatsapp_marketing_permissions enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;
create policy marketing_read on public.whatsapp_marketing_permissions for select to authenticated using(public.is_admin());
create policy campaign_read on public.whatsapp_campaigns for select to authenticated using(public.is_admin());
create policy campaign_recipient_read on public.whatsapp_campaign_recipients for select to authenticated using(public.is_admin());
grant select on public.whatsapp_marketing_permissions,public.whatsapp_campaigns,public.whatsapp_campaign_recipients to authenticated;
grant all on public.whatsapp_marketing_permissions,public.whatsapp_campaigns,public.whatsapp_campaign_recipients to service_role;

-- The server authenticates the admin and verifies the actual Meta template.
create function public.prepare_whatsapp_campaign(p_actor uuid,p_name text,p_asset uuid,p_template jsonb,p_phones jsonb,p_permission_evidence text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign public.whatsapp_campaigns;phone text;included integer:=0;excluded integer:=0;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception 'Solo administradores'; end if;
 if jsonb_typeof(p_phones)<>'array' or jsonb_array_length(p_phones) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 números'; end if;
 if not exists(select 1 from public.bot_media_assets where id=p_asset and kind='flyer' and active) then raise exception 'Selecciona un flyer vigente'; end if;
 if nullif(p_template->>'name','') is null or nullif(p_template#>>'{language,code}','') is null then raise exception 'Falta plantilla'; end if;
 insert into public.whatsapp_campaigns(name,asset_id,template,created_by) values(trim(p_name),p_asset,p_template,p_actor) returning * into campaign;
 for phone in select distinct jsonb_array_elements_text(p_phones) loop
  if phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Número de teléfono inválido'; end if;
  if length(trim(p_permission_evidence)) between 8 and 500 then
   insert into public.whatsapp_marketing_permissions(phone_e164,status,evidence,recorded_by)
   values(phone,'granted',trim(p_permission_evidence),p_actor) on conflict(phone_e164) do nothing;
  end if;
  if exists(select 1 from public.whatsapp_marketing_permissions where phone_e164=phone and status='granted') then
   insert into public.whatsapp_campaign_recipients(campaign_id,phone_e164) values(campaign.id,phone);included:=included+1;
  else excluded:=excluded+1; end if;
 end loop;
 update public.whatsapp_campaigns set excluded_count=excluded where id=campaign.id;
 return jsonb_build_object('id',campaign.id,'included',included,'excluded',excluded,'status','draft');
end; $$;
create function public.start_whatsapp_campaign(p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_campaigns;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception 'Solo administradores'; end if;
 select * into c from public.whatsapp_campaigns where id=p_id for update;
 if c.id is null then raise exception 'Campaña no encontrada'; end if;
 if c.status<>'draft' then return jsonb_build_object('status',c.status); end if;
 if not exists(select 1 from public.whatsapp_campaign_recipients where campaign_id=c.id) then raise exception 'No hay destinatarios autorizados'; end if;
 update public.whatsapp_campaigns set status='queued',started_at=now() where id=c.id;
 return jsonb_build_object('status','queued');
end; $$;
create function public.cancel_whatsapp_campaign(p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception 'Solo administradores'; end if;
 update public.whatsapp_campaigns set status='cancelled' where id=p_id and status in ('draft','queued');
 update public.whatsapp_campaign_recipients set status='skipped',error='Campaña detenida',updated_at=now() where campaign_id=p_id and status='pending';
end; $$;
create function public.claim_whatsapp_campaign() returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_campaigns;recipients jsonb;
begin
 -- A lost HTTP result is never blindly sent a second time.
 update public.whatsapp_campaign_recipients set status='uncertain',error='Envío interrumpido: revisar antes de volver a enviar',updated_at=now()
 where status='sending' and claimed_at<now()-interval '10 minutes';
 update public.whatsapp_campaigns wc set status='completed' where status='queued' and not exists(select 1 from public.whatsapp_campaign_recipients where campaign_id=wc.id and status in ('pending','sending'));
 select * into c from public.whatsapp_campaigns where status='queued' order by started_at for update skip locked limit 1;
 if c.id is null then return null; end if;
 update public.whatsapp_campaign_recipients r set status='skipped',error='Autorización retirada',updated_at=now() where campaign_id=c.id and status='pending' and not exists(select 1 from public.whatsapp_marketing_permissions where phone_e164=r.phone_e164 and status='granted');
 with picked as(select id from public.whatsapp_campaign_recipients where campaign_id=c.id and status='pending' order by id for update skip locked limit 5),
 changed as(update public.whatsapp_campaign_recipients r set status='sending',claimed_at=now(),updated_at=now() from picked where r.id=picked.id returning r.id,r.phone_e164)
 select jsonb_agg(changed) into recipients from changed;
 return jsonb_build_object('campaign',to_jsonb(c),'recipients',coalesce(recipients,'[]'),'asset',(select to_jsonb(a) from public.bot_media_assets a where id=c.asset_id and active));
end; $$;
create function public.marketing_opt_out(p_phone text,p_evidence text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.whatsapp_marketing_permissions(phone_e164,status,evidence) values(p_phone,'revoked',left(p_evidence,500))
 on conflict(phone_e164) do update set status='revoked',evidence=excluded.evidence,updated_at=now();
 update public.whatsapp_campaign_recipients set status='skipped',error='Autorización retirada',updated_at=now() where phone_e164=p_phone and status='pending';
end; $$;
revoke all on function public.prepare_whatsapp_campaign(uuid,text,uuid,jsonb,jsonb,text),public.start_whatsapp_campaign(uuid,uuid),public.cancel_whatsapp_campaign(uuid,uuid),public.claim_whatsapp_campaign(),public.marketing_opt_out(text,text) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_campaign(uuid,text,uuid,jsonb,jsonb,text),public.start_whatsapp_campaign(uuid,uuid),public.cancel_whatsapp_campaign(uuid,uuid),public.claim_whatsapp_campaign(),public.marketing_opt_out(text,text) to service_role;
alter function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) rename to record_whatsapp_message_status_before_campaigns;
revoke all on function public.record_whatsapp_message_status_before_campaigns(text,text,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
create function public.record_whatsapp_message_status(p_meta_message_id text,p_status text,p_timestamp timestamptz,p_raw_payload jsonb,p_status_event_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.whatsapp_campaign_recipients;old_rank integer;new_rank integer;
begin
 select * into r from public.whatsapp_campaign_recipients where meta_message_id=p_meta_message_id for update;
 if r.id is null then return public.record_whatsapp_message_status_before_campaigns(p_meta_message_id,p_status,p_timestamp,p_raw_payload,p_status_event_key); end if;
 if p_status not in ('sent','delivered','read','failed') then raise exception 'Estado inválido'; end if;
 old_rank:=case r.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
 new_rank:=case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 end;
 if new_rank>old_rank and not (p_status='failed' and r.status in ('delivered','read')) then
 update public.whatsapp_campaign_recipients set status=p_status,updated_at=now(),error=case when p_status='failed' then left(coalesce(p_raw_payload#>>'{errors,0,title}','Meta rechazó la entrega'),500) else null end where id=r.id;
 end if;
 return jsonb_build_object('updated',true,'campaign_id',r.campaign_id,'status',p_status);
end; $$;
revoke all on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_whatsapp_message_status(text,text,timestamptz,jsonb,text) to service_role;
create view public.whatsapp_campaign_totals with(security_invoker=true) as
 select campaign_id,status,count(*)::integer as count from public.whatsapp_campaign_recipients group by campaign_id,status;
grant select on public.whatsapp_campaign_totals to authenticated,service_role;
commit;
