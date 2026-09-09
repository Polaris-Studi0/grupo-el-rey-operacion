with persisted as materialized (
  select public.persist_whatsapp_commercial_response($1::uuid,$2::uuid,$3::jsonb,$4::jsonb) as result
), messages as (
  select result, result->>'qr_message_id' as outbound_message_id, 0 as send_order, null::jsonb as human_task from persisted
  union all
  select result, result->>'outbound_message_id', 1, result->'human_task' from persisted
)
select result->>'inbound_message_id' as inbound_message_id,
  result->>'conversation_id' as conversation_id,result->'ai_output' as ai_output,
  human_task,outbound_message_id
from messages where nullif(outbound_message_id,'') is not null order by send_order;
