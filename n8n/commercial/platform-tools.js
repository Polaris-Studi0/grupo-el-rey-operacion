import {normalizeDecision} from './normalize.js';

// The context comes from the authenticated, conversation-scoped database query.
// Tool arguments cannot supply another contact, conversation, order or SQL query.
export function consultPlatform(context, input={}) {
  const allowed=['branches','knowledge','products','order','purchase','assistance'];
  if (!allowed.includes(input.resource)) return {ok:false,error:'unknown_resource'};
  if (input.branch_id && input.branch_id!==context.branch_id && input.resource!=='branches') {
    return {ok:false,error:'branch_not_loaded',instruction:'Confirma la sede elegida. Sus datos se cargarán en el siguiente mensaje; no traslades precios de otra sede.'};
  }
  const select=(value,fields)=>Object.fromEntries(fields.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
  const result={ok:true,resource:input.resource,branch_id:context.branch_id||null};
  const now=Date.parse(context.current_message_created_at||'')||Date.now();
  const current=row=>row.active!==false && (!row.branch_id||row.branch_id===context.branch_id)
    && (!row.valid_from||Date.parse(row.valid_from)<=now) && (!row.valid_until||Date.parse(row.valid_until)>now);
  if(input.resource==='branches') result.data=(context.branches||[]).filter(b=>b.active!==false).map(b=>select(b,['id','name','address','hours']));
  if(input.resource==='knowledge') result.data=(context.knowledge||[]).filter(current).map(k=>select(k,['id','version','category','title','content','valid_from','valid_until']));
  if(input.resource==='products') {
    result.data={inventory:(context.inventory||[]).filter(current),offered_products:(context.sales_state?.offered_products||[]).filter(current)};
    result.limit='Es la información cargada para esta conversación, no un catálogo exhaustivo. Si falta una opción, consulta a la sede.';
  }
  if(input.resource==='order') result.data=context.latest_order ? select(context.latest_order,['id','order_number','status','fulfillment_type','delivery_address','delivery_zone','recipient_name','promised_at','delivered_at','total','delivery_fee']) : null;
  if(input.resource==='purchase') result.data={customer_name:context.preferred_name||'',sales_state:context.sales_state||{},payment_qr:context.payment_qr||null};
  if(input.resource==='assistance') result.data={pending:context.pending_human_tasks||[],history:context.human_tasks||[]};
  // Never return references that a caller could mutate before the final check.
  return JSON.parse(JSON.stringify(result));
}

export function preparePlatformAction(context, proposal) {
  const decision=normalizeDecision(context,proposal,{agentMode:true}).ai;
  // The persistence action for a quote is reply, but the agent must retain the
  // explicit quote operation until final validation stores its trusted snapshot.
  if(proposal?.action==='present_quote' && !context.latest_order
    && decision.sales_state?.checkout_offer_snapshot
    && decision.sales_state?.stage==='awaiting_checkout_confirmation')decision.action='present_quote';
  decision.request_qr=decision.send_qr===true;
  decision.checkout_confirmed=decision.sales_state?.checkout_confirmed===true;
  for(const key of ['cart_operation','address_operation','selection','product_offers','name_confirmed','turn_kind','response_topic']) {
    if(proposal?.[key]!==undefined)decision[key]=proposal[key];
  }
  return {
    executed:false,
    instruction:'Esta es una validación, todavía no se ha enviado ni registrado nada. La decisión final se ejecutará una sola vez al terminar este turno.',
    requested_action:proposal?.action||null,
    action_changed:decision.action!==proposal?.action,
    decision,
  };
}
