begin;
-- Extend the existing grouped read; no additional per-turn database requests.
create or replace function public.bot_context_snapshot(p_conversation_id uuid)
returns table(snapshot jsonb) language sql stable security definer set search_path='' as $$
 select s.snapshot||jsonb_build_object(
  'productImages',coalesce((select jsonb_agg(t) from (
   select a.id,a.product_id,a.task_id,a.caption from public.bot_media_assets a
   where a.active and public.bot_image_allowed(a.id,p_conversation_id) order by a.created_at desc limit 100) t),'[]'::jsonb),
  'pendingTasks',coalesce((select jsonb_agg(t) from (
   select h.id,h.question,h.status,h.created_at from public.human_tasks h join public.whatsapp_conversations c on c.id=h.conversation_id
   where c.id=p_conversation_id and h.branch_id=c.branch_id and h.status in ('pending','in_progress')
   and h.task_type='general' and h.context->>'pilot_engine'='new-whatsapp-v1' and coalesce(h.context->>'commerce','false')<>'true'
   order by h.created_at desc,h.id desc limit 10) t),'[]'::jsonb)
 ) from public.bot_context_snapshot_before_images(p_conversation_id) s;
$$;
revoke all on function public.bot_context_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.bot_context_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
commit;
