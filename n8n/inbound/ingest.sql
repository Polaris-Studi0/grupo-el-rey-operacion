with input as (
  select $1::jsonb as payload
),
message_results as (
  select
    'message'::text as kind,
    public.ingest_whatsapp_message(
      m->>'phone_e164',
      m->>'whatsapp_id',
      nullif(m->>'display_name',''),
      m->>'meta_message_id',
      coalesce(nullif(m->>'message_type',''),'text'),
      nullif(m->>'body',''),
      nullif(m->>'media_id',''),
      coalesce(m->'raw_payload','{}'::jsonb),
      coalesce(nullif(m->>'source',''),'whatsapp'),
      nullif(m->>'branch_id','')
    ) as result
  from input
  cross join lateral jsonb_array_elements(coalesce(payload->'messages','[]'::jsonb)) as m
),
status_results as (
  select
    'status'::text as kind,
    public.record_whatsapp_message_status(
      s->>'meta_message_id',
      s->>'status',
      case when nullif(s->>'timestamp','') is null then null else to_timestamp((s->>'timestamp')::double precision) end,
      coalesce(s->'raw_payload','{}'::jsonb),
      s->>'status_event_key'
    ) as result
  from input
  cross join lateral jsonb_array_elements(coalesce(payload->'statuses','[]'::jsonb)) as s
),
processed as (
  select * from message_results
  union all
  select * from status_results
)
select kind, result || jsonb_build_object('retry_ready',
  kind='message' and result->>'consent_status'='granted' and (
    not exists(select 1 from public.ai_runs ar where ar.run_key='commercial-response:'||(result->>'message_id'))
    or exists(select 1 from public.whatsapp_messages outbound
      where outbound.idempotency_key in ('assistant-reply:'||(result->>'message_id'),'payment-qr-request:'||(result->>'message_id'))
        and outbound.delivery_status='queued' and outbound.send_started_at is null)
  )) as result
from processed
union all
select 'ignored'::text, jsonb_build_object('processed',true,'reason','no_supported_events')
from input
where jsonb_array_length(coalesce(payload->'messages','[]'::jsonb)) = 0
  and jsonb_array_length(coalesce(payload->'statuses','[]'::jsonb)) = 0;
