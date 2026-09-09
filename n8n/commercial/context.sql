with incoming as (
  select m.*, trim(regexp_replace(translate(lower(coalesce(m.body,'')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9 ]', '', 'g')) as branch_answer
  from public.whatsapp_messages m where m.id=$1::uuid
), base as (
  select m.id as inbound_message_id, m.created_at as current_message_created_at, m.meta_message_id, m.message_type, m.sender_type as current_sender_type,
    m.body as customer_message, m.media_id, m.raw_payload as current_message_payload,
    coalesce((m.raw_payload->>'operator_confirmation')::boolean,false) as operator_confirmation,
    c.id as conversation_id, c.branch_id as stored_branch_id, coalesce(selected.id,c.branch_id) as branch_id, c.status as conversation_status, c.automation_paused, c.current_intent, c.summary as conversation_summary,
    c.sales_state, c.source, c.campaign, c.landing_context,
    wc.id as contact_id, wc.phone_e164, wc.whatsapp_id, wc.display_name, wc.preferred_name,
    b.name as branch_name,
    timezone('America/Bogota', now()) as local_now,
    true as service_open,
    true as delivery_open
  from incoming m
  join public.whatsapp_conversations c on c.id = m.conversation_id
  join public.whatsapp_contacts wc on wc.id = c.contact_id
  left join lateral (
    select br.id from public.branches br
    join (values ('b1','aures'),('b1','robledo aures'),('b2','robledo diamante calle 80'),
      ('b3','santa cruz'),('b4','san gabriel'),('b4','san gabriel itagui'),
      ('b5','robledo diamante diagonal 85'),('b6','floresta'),('b6','la floresta'),
      ('b7','la 80'),('b8','la estrella'),('b9','campo valdez'),('b10','san antonio de prado'),('b10','prado')) as aliases(id,label)
      on aliases.id=br.id
    where br.active and m.sender_type='customer'
      and (regexp_replace(m.branch_answer,'^(quiero |prefiero |mejor |cambia a |cambiar a |en |la sede |sede )+','')=aliases.label
        or m.raw_payload#>>'{message,interactive,list_reply,id}'='branch:'||br.id)
    limit 1
  ) selected on true
  left join public.branches b on b.id = coalesce(selected.id,c.branch_id)
  where m.id = $1::uuid and c.consent_status = 'granted' and c.status <> 'closed'
    and (not c.automation_paused or (m.sender_type='human' and m.raw_payload->>'operator_instruction'='true'))
),
enriched as (
  select base.*,
    coalesce((select jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name) order by br.name)
      from public.branches br where br.active), '[]'::jsonb) as branches,
    coalesce((select jsonb_agg(k.item order by k.category, k.title) from (
      select bk.category, bk.title, jsonb_build_object('id', bk.id, 'version', bk.version, 'valid_from',bk.valid_from,'valid_until',bk.valid_until,'category', bk.category, 'title', bk.title, 'content', bk.content) as item
      from public.branch_knowledge bk
      where bk.active and (bk.branch_id is null or bk.branch_id = base.branch_id)
        and (bk.valid_from is null or bk.valid_from <= now()) and (bk.valid_until is null or bk.valid_until > now())
      order by (bk.category='promotion') desc, (bk.branch_id is not null) desc, bk.updated_at desc limit 30
    ) k), '[]'::jsonb) as knowledge,
    coalesce((select jsonb_agg(i.item order by i.name) from (
      select p.name, jsonb_build_object(
        'product_id', p.id, 'sku', p.sku, 'name', p.name, 'description', p.description,
        'attributes', p.attributes, 'seasonal', p.seasonal, 'regular_price',bi.price,
        'promotion_active', (bi.promotional_price is not null and bi.promotional_price < bi.price
          and (bi.promotion_from is null or bi.promotion_from <= now())
          and (bi.promotion_until is null or bi.promotion_until > now())),
        'promotion_until',bi.promotion_until,
        'price', case when bi.promotional_price is not null
          and (bi.promotion_from is null or bi.promotion_from <= now())
          and (bi.promotion_until is null or bi.promotion_until > now())
          then bi.promotional_price else bi.price end,
        'available_qty', greatest(bi.available_qty - bi.reserved_qty, 0)
      ) as item
      from public.branch_inventory bi join public.products p on p.id = bi.product_id
      where bi.branch_id = base.branch_id and bi.active and p.active
        and bi.available_qty - bi.reserved_qty > 0
      order by (p.id::text in (select value->>'product_id' from jsonb_array_elements(coalesce(base.sales_state->'items','[]'::jsonb)))) desc,
        (bi.promotional_price is not null and bi.promotional_price < bi.price and (bi.promotion_from is null or bi.promotion_from<=now()) and (bi.promotion_until is null or bi.promotion_until>now())) desc,
        p.seasonal desc,p.name limit 60
    ) i), '[]'::jsonb) as inventory,
    coalesce((select jsonb_agg(h.item order by h.created_at) from (
      select wm.created_at, jsonb_build_object(
        'direction',wm.direction,'sender_type',wm.sender_type,'message_type',wm.message_type,
        'body',wm.body,'created_at',wm.created_at,
        'operator_confirmation',wm.sender_type='human' and wm.raw_payload->>'operator_confirmation'='true',
        'task_type',case when wm.sender_type='human' then wm.raw_payload->>'task_type' end
      ) as item
      from public.whatsapp_messages wm
      where wm.conversation_id=base.conversation_id
        and coalesce((wm.raw_payload->>'internal_notification')::boolean,false)=false
      order by wm.created_at desc,wm.id desc limit 24
    ) h), '[]'::jsonb) as recent_messages,
    coalesce((select jsonb_agg(t.item order by t.created_at) from (
      select ht.created_at, jsonb_build_object(
        'id',ht.id,'branch_id',ht.branch_id,'type',ht.task_type,'status',ht.status,'title',ht.title,'question',ht.question,
        'context',ht.context,'resolution',ht.resolution,'resolved_at',ht.resolved_at
      ) as item
      from public.human_tasks ht
      where ht.conversation_id=base.conversation_id
      order by ht.created_at desc limit 10
    ) t), '[]'::jsonb) as human_tasks,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',ht.id,'branch_id',ht.branch_id,'type',ht.task_type,'status',ht.status,'title',ht.title,'question',ht.question
    ) order by ht.created_at)
      from public.human_tasks ht
      where ht.conversation_id=base.conversation_id and ht.status in ('pending','in_progress')), '[]'::jsonb) as pending_human_tasks,
    (select jsonb_build_object('available',true,'original_name',qr.original_name,'updated_at',qr.updated_at,
        'already_sent',exists(select 1 from public.whatsapp_messages qm where qm.conversation_id=base.conversation_id and qm.raw_payload->>'storage_path'=qr.storage_path and qm.meta_message_id is not null))
      from public.branch_payment_qrs qr
      where qr.branch_id=base.branch_id and qr.active limit 1) as payment_qr,
    (select ar.output from public.ai_runs ar where ar.run_key='commercial-response:'||base.inbound_message_id::text and ar.succeeded limit 1) as cached_response,
    (select to_jsonb(o) from public.orders o
      where o.whatsapp_conversation_id=base.conversation_id
      order by o.created_at desc limit 1) as latest_order
  from base
)
select * from enriched;
