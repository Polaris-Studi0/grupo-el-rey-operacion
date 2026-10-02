begin;
create table public.internal_chat_messages(
 id bigint generated always as identity primary key,
 branch_id text not null references public.branches(id),
 sender_id uuid not null references public.profiles(id),
 sender_name text not null,sender_role public.app_role not null,
 body text not null check(length(btrim(body)) between 1 and 4000),
 request_id uuid not null,created_at timestamptz not null default now(),
 unique(sender_id,request_id)
);
create index internal_chat_branch_idx on public.internal_chat_messages(branch_id,id desc);
create table public.internal_chat_reads(
 user_id uuid not null references public.profiles(id),branch_id text not null references public.branches(id),
 last_read_id bigint not null default 0,updated_at timestamptz not null default now(),primary key(user_id,branch_id)
);
alter table public.internal_chat_messages enable row level security;
alter table public.internal_chat_reads enable row level security;
revoke all on public.internal_chat_messages,public.internal_chat_reads from anon,authenticated;
grant select on public.internal_chat_messages,public.internal_chat_reads to authenticated;
grant all on public.internal_chat_messages,public.internal_chat_reads to service_role;
create policy internal_chat_read on public.internal_chat_messages for select to authenticated
 using(public.is_admin() or(public.current_app_role()='cashier' and branch_id=public.current_branch_id()));
create policy internal_chat_read_markers on public.internal_chat_reads for select to authenticated
 using(user_id=auth.uid() and(public.is_admin() or(public.current_app_role()='cashier' and branch_id=public.current_branch_id())));
create function public.send_internal_chat(p_branch text,p_body text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;m public.internal_chat_messages;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null or(actor.role<>'admin' and (actor.role<>'cashier' or actor.branch_id is distinct from p_branch)) then raise exception 'No tienes acceso a este chat'; end if;
 if p_request is null or p_body is null or length(btrim(p_body)) not between 1 and 4000 then raise exception 'Escribe un mensaje de hasta 4000 caracteres'; end if;
 if not exists(select 1 from public.branches where id=p_branch and active) then raise exception 'La sede no está activa'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||p_request::text,21));
 perform pg_advisory_xact_lock(hashtextextended('branch-chat:'||p_branch,22));
 select * into m from public.internal_chat_messages where sender_id=actor.id and request_id=p_request;
 if m.id is not null then
  if m.branch_id<>p_branch or m.body<>btrim(p_body) then raise exception 'El identificador corresponde a otro mensaje'; end if;
  return to_jsonb(m);
 end if;
 insert into public.internal_chat_messages(branch_id,sender_id,sender_name,sender_role,body,request_id)
 values(p_branch,actor.id,actor.full_name,actor.role,btrim(p_body),p_request) returning * into m;
 return to_jsonb(m);
end; $$;
create function public.mark_internal_chat_read(p_branch text,p_through bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_admin() or(public.current_app_role()='cashier' and p_branch=public.current_branch_id()),false) then raise exception 'No tienes acceso a este chat'; end if;
 if p_through is null or not exists(select 1 from public.internal_chat_messages where branch_id=p_branch and id=p_through) then return; end if;
 insert into public.internal_chat_reads(user_id,branch_id,last_read_id) values(auth.uid(),p_branch,p_through)
 on conflict(user_id,branch_id) do update set last_read_id=greatest(public.internal_chat_reads.last_read_id,excluded.last_read_id),updated_at=now();
end; $$;
create function public.internal_chat_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('branch_id',b.id,'name',b.name,'last_message',to_jsonb(latest),'unread',
 (select count(*) from public.internal_chat_messages m where m.branch_id=b.id and m.sender_id<>auth.uid() and m.id>coalesce(r.last_read_id,0))) order by b.created_at,b.id),'[]'::jsonb)
 from public.branches b left join public.internal_chat_reads r on r.branch_id=b.id and r.user_id=auth.uid()
 left join lateral(select m.id,m.body,m.created_at,m.sender_name,m.sender_id from public.internal_chat_messages m where m.branch_id=b.id order by m.id desc limit 1) latest on true
 where b.active and(public.is_admin() or(public.current_app_role()='cashier' and b.id=public.current_branch_id()));
$$;
revoke all on function public.send_internal_chat(text,text,uuid),public.mark_internal_chat_read(text,bigint),public.internal_chat_overview() from public,anon;
grant execute on function public.send_internal_chat(text,text,uuid),public.mark_internal_chat_read(text,bigint),public.internal_chat_overview() to authenticated;
alter publication supabase_realtime add table public.internal_chat_messages,public.internal_chat_reads;
commit;
