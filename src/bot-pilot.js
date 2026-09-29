import {branchSelection,branchMenu,orderedBranches} from './bot-branches.js';
import {authenticates} from './bot-connection.js';
import {loadPreviewContext,readBotRows,requestBotDecision} from './bot-preview.js';

const PHONE=/^[1-9]\d{7,14}$/;
const NOTICE='Soy el asistente virtual con IA de Almacenes El Rey. Para atender tu consulta y gestionar una posible compra, necesitamos tu autorización para tratar los datos de esta conversación. Consulta nuestra política: https://intranet.almaceneselrey.co/privacidad . Responde ACEPTO para continuar o NO ACEPTO para finalizar la atención automatizada.';
function dbHeaders(env){const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;return {apikey:key,'content-type':'application/json',prefer:'return=representation',...(!key?.startsWith('sb_secret_')?{authorization:`Bearer ${key}`}:{})};}
async function patch(env,table,filters,body){
  const url=new URL(`/rest/v1/${table}`,env.SUPABASE_URL);url.search=new URLSearchParams(filters).toString();
  const result=await fetch(url,{method:'PATCH',headers:dbHeaders(env),body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error(`No fue posible guardar el estado del piloto (${result.status})`);
  return result.json();
}
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function pilotPhone(env){const phone=String(env.BOT_PILOT_PHONE||'').replace(/^\+/,'');return PHONE.test(phone)?phone:null;}
function afterPilotStart(message,env){return !env.BOT_PILOT_STARTED_AT||Number(message.timestamp)*1000>=Date.parse(env.BOT_PILOT_STARTED_AT);}
export function partitionPilotWebhook(payload,env){
  const phone=env.BOT_PILOT_ENABLED==='true'?pilotPhone(env):null;
  const select=pilot=>({...payload,entry:(payload.entry||[]).map(entry=>({...entry,changes:(entry.changes||[]).map(change=>({...change,value:{...change.value,statuses:[],messages:(change.value?.messages||[]).filter(m=>(phone!==null&&m.from===phone&&afterPilotStart(m,env))===pilot)}})).filter(change=>change.value.messages.length)})).filter(entry=>entry.changes.length)});
  return {pilot:select(true),legacy:select(false)};
}

export async function pilotDeliveryEligible(env,expected){
  const c=(await readBotRows(env,'whatsapp_conversations',{id:`eq.${expected.conversation_id}`,select:'id,contact_id,status,consent_status,consented_at,consent_version,automation_paused,automation_control_version',limit:'1'}))[0];
  if(!c||c.status==='closed'||c.automation_paused||c.automation_control_version!==expected.control_version)return false;
  const contact=(await readBotRows(env,'whatsapp_contacts',{id:`eq.${c.contact_id}`,select:'phone_e164',limit:'1'}))[0];
  if(contact?.phone_e164!==`+${pilotPhone(env)}`)return false;
  if(expected.require_consent&&!(c.consent_status==='granted'&&c.consented_at&&c.consent_version))return false;
  const latest=(await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,direction:'eq.inbound',sender_type:'eq.customer',select:'id,created_at',order:'created_at.desc,id.desc',limit:'1'}))[0];
  return latest?.id===expected.inbound_message_id&&Date.parse(latest.created_at)>Date.now()-23*60*60*1000;
}

export async function processPilotWebhook(payload,env,{rpc,persistMedia,deliver}){
  if(env.BOT_PILOT_ENABLED!=='true'||!pilotPhone(env))throw Error('Piloto no habilitado');
  const received=[];
  for(const entry of payload.entry||[])for(const change of entry.changes||[])for(const message of change.value?.messages||[]){
    if(message.from!==pilotPhone(env)||!afterPilotStart(message,env))throw Error('Mensaje fuera del piloto');
    const contact=(change.value.contacts||[]).find(c=>c.wa_id===message.from);
    const body=message.text?.body??message[message.type]?.caption??message.button?.text??message.interactive?.button_reply?.title??message.interactive?.list_reply?.title??'';
    const ingested=await rpc('ingest_whatsapp_message',{p_phone_e164:`+${message.from}`,p_whatsapp_id:message.from,p_display_name:contact?.profile?.name||null,p_meta_message_id:message.id,p_message_type:message.type,p_body:body,p_media_id:message[message.type]?.id||null,p_raw_payload:{message,contact:contact||{},metadata:change.value.metadata||{}},p_source:'whatsapp',p_branch_id:null},env);
    received.push({...ingested,body,meta_message_id:message.id});
  }
  // The new route stores inbound messages before attempting their attachments.
  await persistMedia(payload,env);
  for(const inbound of received)await processTurn(inbound,env,{rpc,deliver});
}

async function processTurn(inbound,env,{rpc,deliver}){
  let c=(await readBotRows(env,'whatsapp_conversations',{id:`eq.${inbound.conversation_id}`,select:'*',limit:'1'}))[0];
  if(!c||c.status==='closed')return;
  const expected=()=>({conversation_id:c.id,inbound_message_id:inbound.message_id,control_version:c.automation_control_version,require_consent:c.consent_status==='granted'});
  const committed=(await readBotRows(env,'ai_runs',{run_key:`eq.pilot-commerce:${inbound.message_id}`,select:'output',limit:'1'}))[0];
  if(committed){await deliverCommerceResult(committed.output,c.id,env,{rpc,deliver});return;}
  const queued=await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,idempotency_key:`in.(assistant-reply:${inbound.message_id},pilot-onboarding:${inbound.message_id},privacy-notice:pilot:${inbound.message_id})`,select:'id,delivery_status,meta_message_id,raw_payload',limit:'3'});
  if(queued.length){
    const cached=(await readBotRows(env,'ai_runs',{run_key:`eq.commercial-response:${inbound.message_id}`,select:'output',limit:'1'}))[0];
    if(cached?.output?.pilot_engine?.workflow_id==='pGxqUgjYE6NCyiwZ')await ensurePilotHumanTask(inbound,cached.output,env,{rpc,deliver});
    for(const m of queued)if(m.delivery_status==='queued')await deliver(m.id,env,{...expected(),control_version:cached?.output?.pilot_engine?.control_version??m.raw_payload?.control_version??-1});return;
  }
  // Explicit start command is accepted only from the configured owner test number.
  // An ingress retry never releases a later manual takeover.
  if(normalize(inbound.body)==='probar bot'&&inbound.created){
    const rows=await patch(env,'whatsapp_conversations',{id:`eq.${c.id}`,automation_control_version:`eq.${c.automation_control_version}`},{automation_paused:false,automation_control_version:c.automation_control_version+1});
    if(!rows.length)return;c=rows[0];
  }
  if(['no acepto','no autorizo'].includes(normalize(inbound.body))){
    await rpc('record_whatsapp_consent',{p_conversation_id:c.id,p_policy_version:c.consent_version||'2026-09-01',p_notice_text:NOTICE,p_customer_response:inbound.body,p_meta_message_id:inbound.meta_message_id},env);
    return;
  }
  if(c.automation_paused)return;
  const lastConsent=(await readBotRows(env,'privacy_consents',{contact_id:`eq.${c.contact_id}`,select:'granted',order:'captured_at.desc,id.desc',limit:'1'}))[0];
  if(lastConsent?.granted===false&&c.consent_status==='granted'){
    const rows=await patch(env,'whatsapp_conversations',{id:`eq.${c.id}`,automation_control_version:`eq.${c.automation_control_version}`},{consent_status:'pending',consented_at:null,consent_version:null});
    if(!rows.length)return;c=rows[0];
  }
  async function sendFixed(text,privacy=false,metadata={}){
    if(!await pilotDeliveryEligible(env,expected()))return;
    const q=await rpc('queue_outbound_whatsapp_message',{p_conversation_id:c.id,p_idempotency_key:`${privacy?'privacy-notice:pilot':'pilot-onboarding'}:${inbound.message_id}`,p_sender_type:'system',p_message_type:'text',p_body:text,p_payload:{pilot:true,inbound_message_id:inbound.message_id,control_version:c.automation_control_version,...metadata}},env);
    await deliver(q.message_id,env,expected());
  }
  if(c.consent_status!=='granted'||!c.consented_at||!c.consent_version){
    const notices=await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,direction:'eq.outbound',idempotency_key:'like.privacy-notice:pilot:*',delivery_status:'in.(sent,delivered,read)',select:'id',limit:'1'});
    const consent=notices.length?await rpc('record_whatsapp_consent',{p_conversation_id:c.id,p_policy_version:'2026-09-01',p_notice_text:NOTICE,p_customer_response:inbound.body,p_meta_message_id:inbound.meta_message_id},env):null;
    if(consent?.recognized&&!consent.granted)return;
    if(!consent?.granted){await sendFixed(NOTICE,true);return;}
    c=(await readBotRows(env,'whatsapp_conversations',{id:`eq.${c.id}`,select:'*',limit:'1'}))[0];
  }
  if(c.branch_id&&/\b(cambiar(?:me)?(?: de)? sede|otra sede)\b/.test(normalize(inbound.body))){
    const shopping=c.sales_state?.pilot_commerce;
    if(shopping?.cart?.length&&shopping.stage!=='ordered'&&shopping.stage!=='cancelled'){
      await sendFixed('Tienes una compra en curso. Antes de cambiar de sede, dime si deseas cancelar ese carrito.');return;
    }
    if(!await pilotDeliveryEligible(env,expected()))return;
    const rows=await patch(env,'whatsapp_conversations',{id:`eq.${c.id}`,automation_control_version:`eq.${c.automation_control_version}`},{branch_id:null});
    if(!rows.length)return;c=rows[0];
  }
  if(!c.branch_id){
    const branches=await readBotRows(env,'branches',{active:'eq.true',select:'id,name',order:'id.asc',limit:'20'});
    const menus=await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,direction:'eq.outbound',delivery_status:'in.(sent,delivered,read)',select:'raw_payload',order:'created_at.desc,id.desc',limit:'20'});
    const priorOptions=menus.find(m=>m.raw_payload?.branch_options)?.raw_payload.branch_options||[];
    let {selected,choices}=branchSelection(inbound.body,branches,priorOptions);
    if(!selected&&!priorOptions.length){
      const arrivals=await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,direction:'eq.inbound',sender_type:'eq.customer',select:'body',order:'created_at.asc,id.asc',limit:'10'});
      const tagged=arrivals.find(m=>/\[SEDE:/i.test(m.body||''));
      if(tagged)selected=branchSelection(tagged.body,branches).selected;
    }
    if(selected){const rows=await patch(env,'whatsapp_conversations',{id:`eq.${c.id}`,branch_id:'is.null',automation_control_version:`eq.${c.automation_control_version}`},{branch_id:selected.id});if(!rows.length)return;c=rows[0];}
    else{const list=choices||orderedBranches(branches);await sendFixed(branchMenu(list),false,{branch_options:list.map(b=>b.id)});return;}
  }
  if(normalize(inbound.body)==='probar bot'){await sendFixed('El piloto del nuevo bot está activo en este chat. Puedes preguntarme por información de la sede o consultar productos. Las compras y los pagos necesitan confirmación del equipo.');return;}
  const context=await loadPreviewContext(env,{role:'admin'},c.id,c.automation_control_version);
  if(context.snapshot.message.id!==inbound.message_id)return;
  let decision;
  try{decision=await requestBotDecision(env,context,'pilot',inbound.message_id);}
  catch{decision={decision:{intent:'handoff',reply_text:'No pude completar esta consulta automáticamente. El equipo debe revisarla para continuar por este chat.',actions:[{type:'propose_human_task',reason:'missing_information',question:`Revisar la consulta porque la respuesta automática no estuvo disponible: ${String(inbound.body).slice(0,650)}`}]}};}

  const current=await loadPreviewContext(env,{role:'admin'},c.id,c.automation_control_version);
  if(current.context_fingerprint!==context.context_fingerprint)return;
  if(!await pilotDeliveryEligible(env,expected()))return;
  const saved=await rpc('commit_bot_commerce_turn',{p_conversation_id:c.id,p_inbound_message_id:inbound.message_id,p_control_version:c.automation_control_version,p_commerce_version:context.commerce_version||0,p_decision:decision.decision,p_owner_phone:`+${pilotPhone(env)}`,p_task_id:null},env);
  await deliverCommerceResult(saved,c.id,env,{rpc,deliver});
}

async function deliverCommerceResult(result,conversationId,env,{rpc,deliver}){
  if(result.skipped)return;
  for(const id of result.task_ids||[])await notifyPilotTask(id,env,{rpc,deliver});
  for(const id of result.message_ids||[]){
    const sent=await deliver(id,env,{conversation_id:conversationId,inbound_message_id:result.inbound_message_id,control_version:result.control_version,require_consent:true});
    if(!sent.ok)throw Error('La respuesta de la compra quedó pendiente de entrega');
  }
  if(result.order_receipt_id){
    // Owner-only pilot: the owner window equals this customer's verified window.
    const q=await rpc('prepare_whatsapp_order_notification',{p_receipt_id:result.order_receipt_id,p_admin_phone:`+${pilotPhone(env)}`},env);
    if(q?.message_id){const sent=await deliver(q.message_id,env);if(!sent.ok)throw Error('El aviso de compra quedó pendiente');}
  }
}

async function ensurePilotHumanTask(inbound,proposal,env,{rpc,deliver}){
  const details=proposal.pilot_engine;if(!details?.human_question)return;
  const created=await rpc('create_human_task',{p_conversation_id:inbound.conversation_id,p_request_key:`pilot-human:${inbound.message_id}`,p_task_type:'general',p_priority:'normal',p_title:'Información necesaria para el bot',p_question:details.human_question,
    p_context:{pilot_engine:'new-whatsapp-v1',inbound_message_id:inbound.message_id,human_reason:details.human_reason,attachment_id:details.attachment_id},p_order_id:null,p_assigned_to_phone:`+${pilotPhone(env)}`,p_due_at:null},env);
  const task=Array.isArray(created)?created[0]:created;
  if(!task?.id)throw Error('No fue posible comprobar el pendiente humano');
  await notifyPilotTask(task.id,env,{rpc,deliver});
}

export async function notifyPilotTask(taskId,env,{rpc,deliver}){
  const owner=(await readBotRows(env,'whatsapp_contacts',{phone_e164:`eq.+${pilotPhone(env)}`,select:'id',limit:'1'}))[0];if(!owner)return;
  const chats=await readBotRows(env,'whatsapp_conversations',{contact_id:`eq.${owner.id}`,select:'id',order:'created_at.desc',limit:'20'});if(!chats.length)return;
  const latest=(await readBotRows(env,'whatsapp_messages',{conversation_id:`in.(${chats.map(c=>c.id).join(',')})`,direction:'eq.inbound',sender_type:'eq.customer',select:'created_at',order:'created_at.desc',limit:'1'}))[0];
  if(!latest||Date.parse(latest.created_at)<=Date.now()-23*60*60*1000)return;
  const event=(await rpc('claim_automation_event',{p_task_id:taskId,p_topic:'human_task.created'},env))?.[0];if(!event)return;
  try{
    const queued=await rpc('prepare_whatsapp_automation_message',{p_outbox_id:event.id,p_lease_id:event.lease_id,p_admin_phone:`+${pilotPhone(env)}`},env);
    const response=await deliver(queued.message_id,env);
    if(!response.ok)throw Error('El aviso al responsable quedó pendiente de entrega');
    await rpc('complete_automation_event',{p_id:event.id,p_lease_id:event.lease_id,p_error:null},env);
  }catch(error){await rpc('complete_automation_event',{p_id:event.id,p_lease_id:event.lease_id,p_error:error.message},env);}
}

export async function resumePilotTask(taskId,env,{rpc,deliver}){
  const task=(await readBotRows(env,'human_tasks',{id:`eq.${taskId}`,'context->>pilot_engine':'eq.new-whatsapp-v1',select:'*',limit:'1'}))[0];
  if(!task)return null;
  if(!['resolved','rejected'].includes(task.status)||(!task.context?.commerce&&!task.resolution?.answer))return {ok:true,deferred:true,reason:'answer_required'};
  const c=(await readBotRows(env,'whatsapp_conversations',{id:`eq.${task.conversation_id}`,select:'*',limit:'1'}))[0];
  if(!c||c.automation_paused||c.status==='closed')return {ok:true,deferred:true,reason:'manual_control_or_closed'};
  if(task.branch_id!==c.branch_id)return {ok:true,deferred:true,reason:'branch_changed'};
  const latest=(await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,direction:'eq.inbound',sender_type:'eq.customer',select:'id,created_at',order:'created_at.desc,id.desc',limit:'1'}))[0];
  const expected={conversation_id:c.id,inbound_message_id:latest?.id,control_version:c.automation_control_version,require_consent:true};
  if(!await pilotDeliveryEligible(env,expected))return {ok:true,deferred:true,reason:'conversation_not_eligible'};
  const event=(await rpc('claim_automation_event',{p_task_id:task.id,p_topic:'human_task.completed'},env))?.[0];if(!event)return {ok:true,already_claimed:true};
  try{
    if(task.context?.commerce){
      const saved=await rpc('commit_bot_commerce_turn',{p_conversation_id:c.id,p_inbound_message_id:latest.id,p_control_version:c.automation_control_version,p_commerce_version:c.sales_state?.pilot_commerce?.version||0,p_decision:{},p_owner_phone:`+${pilotPhone(env)}`,p_task_id:task.id},env);
      await deliverCommerceResult(saved,c.id,env,{rpc,deliver});
      await rpc('complete_automation_event',{p_id:event.id,p_lease_id:event.lease_id,p_error:null},env);
      return {ok:true,pilot:true,task_id:task.id,skipped:!!saved.skipped};
    }
    const key=`human-task-response:${task.id}`;
    // Reuse the canonical queued text on retries: model wording is not deterministic.
    let queued=(await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,idempotency_key:`eq.${key}`,select:'id,raw_payload',limit:'1'}))[0];
    if(!queued){
      const context=await loadPreviewContext(env,{role:'admin'},c.id,c.automation_control_version);
      const resolution={task_id:task.id,inbound_message_id:task.context.inbound_message_id,question:task.question,answer:String(task.resolution.answer).trim()};
      if(!resolution.inbound_message_id||!resolution.answer||resolution.answer.length>1800)throw Error('La aclaración requiere revisión antes de enviarla');
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([context.context_fingerprint,resolution])));
      const fingerprint=[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const packet={...context,context_fingerprint:fingerprint,snapshot:{...context.snapshot,human_resolution:resolution}};
      // If wording generation is unavailable, preserve the exact confirmed fact.
      // Never expose the internal questionnaire or an attribution wrapper.
      let body=resolution.answer.charAt(0).toLocaleUpperCase('es')+resolution.answer.slice(1),style='direct_fallback';
      try{
        const result=await requestBotDecision(env,packet,'pilot',task.id);
        if(result.decision.intent==='information'&&Array.isArray(result.decision.actions)&&!result.decision.actions.length&&!/el equipo responde|según (?:el administrador|la intranet)|sobre tu consulta/i.test(result.decision.reply_text)){
          body=result.decision.reply_text;style='contextual';
        }
      }catch{/* Delivery can continue with the approved answer, without new facts. */}
      const current=await loadPreviewContext(env,{role:'admin'},c.id,c.automation_control_version);
      const fresh=(await readBotRows(env,'human_tasks',{id:`eq.${task.id}`,select:'status,resolution,branch_id',limit:'1'}))[0];
      if(current.context_fingerprint!==context.context_fingerprint||fresh?.status!==task.status||fresh?.resolution?.answer!==task.resolution.answer||fresh?.branch_id!==c.branch_id)throw Error('La conversación o la aclaración cambió durante la respuesta');
      if(!await pilotDeliveryEligible(env,expected))throw Error('La conversación cambió antes de enviar la aclaración');
      const saved=await rpc('queue_outbound_whatsapp_message',{p_conversation_id:c.id,p_idempotency_key:key,p_sender_type:'assistant',p_message_type:'text',p_body:body,p_payload:{human_task_id:task.id,pilot:true,answer_style:style,control_version:expected.control_version,inbound_message_id:expected.inbound_message_id}},env);
      queued={id:saved.message_id,raw_payload:{control_version:expected.control_version,inbound_message_id:expected.inbound_message_id}};
    }
    const response=await deliver(queued.id,env,{...expected,control_version:queued.raw_payload?.control_version??expected.control_version,inbound_message_id:queued.raw_payload?.inbound_message_id??expected.inbound_message_id});
    if(!response.ok)throw Error('La respuesta del equipo quedó pendiente de entrega');
    await rpc('complete_automation_event',{p_id:event.id,p_lease_id:event.lease_id,p_error:null},env);
    return {ok:true,task_id:task.id,pilot:true};
  }catch(error){await rpc('complete_automation_event',{p_id:event.id,p_lease_id:event.lease_id,p_error:error.message},env);return {ok:false,deferred:true,reason:'delivery_pending'};}
}

export async function recoverPilotTasks(env,dependencies){
  if(env.BOT_PILOT_ENABLED!=='true'||!pilotPhone(env))return;
  const contact=(await readBotRows(env,'whatsapp_contacts',{phone_e164:`eq.+${pilotPhone(env)}`,select:'id',limit:'1'}))[0];if(!contact)return;
  const conversations=await readBotRows(env,'whatsapp_conversations',{contact_id:`eq.${contact.id}`,source:'neq.internal_admin',status:'neq.closed',select:'id',limit:'5'});
  for(const c of conversations){
    await dependencies.rpc('expire_bot_commerce_reservations',{p_conversation_id:c.id},env);
    const tasks=await readBotRows(env,'human_tasks',{conversation_id:`eq.${c.id}`,'context->>pilot_engine':'eq.new-whatsapp-v1',or:'(and(status.in.(pending,in_progress),admin_notified_at.is.null),and(status.in.(resolved,rejected),automation_resumed_at.is.null))',select:'id,status',order:'created_at.asc',limit:'5'});
    for(const task of tasks){if(['resolved','rejected'].includes(task.status))await resumePilotTask(task.id,env,dependencies);else await notifyPilotTask(task.id,env,dependencies);}
  }
}
export async function handlePilotStatus(request,env){
  if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.N8N_REBUILD_GATEWAY_SECRET||!await authenticates(request,env.N8N_REBUILD_GATEWAY_SECRET))return Response.json({error:'unauthorized'},{status:401});
  try{
    const phone=pilotPhone(env);
    if(!phone)return Response.json({ok:false,reason:'pilot_phone_missing'},{status:503});
    const requiredFunctions=['ingest_whatsapp_message','commit_bot_commerce_turn','bot_customer_orders','persist_whatsapp_commercial_response','create_human_task','claim_automation_event','prepare_whatsapp_automation_message','complete_automation_event','queue_outbound_whatsapp_message','claim_outbound_whatsapp_message'];
    const api=await fetch(`${env.SUPABASE_URL}/rest/v1/`,{headers:{...dbHeaders(env),accept:'application/openapi+json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    const schema=api.ok?await api.json():null;
    const missingFunctions=requiredFunctions.filter(name=>!schema?.paths?.[`/rpc/${name}`]);
    await Promise.all([
      readBotRows(env,'branch_knowledge',{active:'eq.true',select:'id,branch_id,category,title,content,valid_from,valid_until,updated_at',limit:'0'}),
      readBotRows(env,'branch_inventory',{select:'*,product:products(id,name,description,active,seasonal)',limit:'0'}),
      readBotRows(env,'human_tasks',{select:'id,question,resolution,resolved_at,context,admin_notified_at,automation_resumed_at',limit:'0'}),
      // Exercise the same query contract used on every live incoming message.
      readBotRows(env,'privacy_consents',{select:'granted',order:'captured_at.desc,id.desc',limit:'0'})
    ]);
    const meta=await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION||'v26.0'}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number`,{headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(10000)});
    const metaData=await meta.json().catch(()=>({}));
    const contacts=await readBotRows(env,'whatsapp_contacts',{phone_e164:`eq.+${phone}`,select:'id',limit:'1'});
    const conversations=contacts[0]?await readBotRows(env,'whatsapp_conversations',{contact_id:`eq.${contacts[0].id}`,status:'neq.closed',source:'neq.internal_admin',select:'id,branch_id,consent_status,consented_at,consent_version,automation_paused,automation_control_version,updated_at',order:'created_at.desc',limit:'1'}):[];
    const c=conversations[0];let context;
    if(c?.branch_id&&c.consent_status==='granted'&&!c.automation_paused){
      const snapshot=await loadPreviewContext(env,{role:'admin'},c.id,c.automation_control_version);
      context={readable:true,information:snapshot.snapshot.information.length,products:snapshot.snapshot.products.length,stock_verified:snapshot.snapshot.products.filter(p=>p.stock_verified).length,qr_assets:snapshot.snapshot.qr_assets.length};
    }
    let diagnostics;
    if(new URL(request.url).searchParams.get('diagnostics')==='true'){
      const events=await readBotRows(env,'whatsapp_webhook_inbox',{select:'id,event_type,received_at,processed_at,processing_started_at,attempts,last_error,dead_lettered_at,payload',order:'received_at.desc',limit:'20'});
      const ownEvents=events.filter(event=>(event.payload?.entry||[]).some(entry=>(entry.changes||[]).some(change=>(change.value?.messages||[]).some(message=>message.from===phone))));
      diagnostics={events:ownEvents.map(({payload,...event})=>({...event,messages:payload.entry.flatMap(entry=>entry.changes||[]).flatMap(change=>change.value?.messages||[]).filter(message=>message.from===phone).map(message=>({id:message.id,timestamp:message.timestamp,type:message.type}))})),messages:c?await readBotRows(env,'whatsapp_messages',{conversation_id:`eq.${c.id}`,select:'id,direction,sender_type,delivery_status,failure_reason,created_at,idempotency_key,send_started_at,meta_message_id',order:'created_at.desc,id.desc',limit:'10'}):[]};
    }
    return Response.json({ok:!missingFunctions.length&&meta.ok,pilot_enabled:env.BOT_PILOT_ENABLED==='true',schema_verified:!missingFunctions.length,missing_functions:missingFunctions,meta_connected:meta.ok,meta_error_code:metaData.error?.code||null,business_phone:meta.ok?metaData.display_phone_number:null,phone_suffix:phone.slice(-4),conversation:c?{id:c.id,branch_id:c.branch_id,consent_status:c.consent_status,manual_control:c.automation_paused,control_version:c.automation_control_version}:null,context:context||null,diagnostics},{headers:{'cache-control':'no-store'}});
  }catch(error){return Response.json({ok:false,error:error.message},{status:503});}
}
