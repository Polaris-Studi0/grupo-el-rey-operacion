import {orderedBranches,stockClosingTime} from './bot-branches.js';
// Operator-requested preview only. This module never writes to Supabase or Meta.
const CORE_URL = 'https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRANCH = /^b(?:10|[1-9])$/;
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function reply(body, status = 200) {
  return Response.json(body, {status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
}
function fail(message, status = 503) {
  return Object.assign(new Error(message), {status});
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function readBotRows(env, table, params) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !env.SUPABASE_URL) throw fail('La conexión de datos no está disponible.');
  const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
  url.search = new URLSearchParams(params).toString();
  const headers = {apikey: key};
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  const result = await fetch(url, {headers, redirect: 'manual', signal: AbortSignal.timeout(10000)});
  if (!result.ok) throw fail('No fue posible consultar el contexto del bot.');
  const rows = await result.json();
  if (!Array.isArray(rows)) throw fail('El contexto recibido no es válido.');
  return rows;
}
const read = readBotRows;
function allowed(operator, conversation) {
  return operator.role === 'admin' || operator.role === 'cashier' && operator.branch_id && operator.branch_id === conversation.branch_id;
}
function eligible(conversation) {
  if (conversation.status === 'closed') throw fail('La conversación está cerrada.', 409);
  if (conversation.automation_paused) throw fail('El control manual está activo. El bot permanece detenido.', 409);
  if (conversation.consent_status !== 'granted' || !conversation.consented_at || !conversation.consent_version) throw fail('Primero se necesita la autorización del cliente para la atención con IA.', 409);
  if (!BRANCH.test(conversation.branch_id || '')) throw fail('La conversación todavía no tiene una sede confirmada.', 409);
}
function validAt(record, now) {
  return (!record.valid_from || Date.parse(record.valid_from) <= now) && (!record.valid_until || Date.parse(record.valid_until) > now);
}
function productSnapshot(row, branchId, now, ownQuantity = 0) {
  const product = row.product;
  if (row.branch_id !== branchId || !product?.active || !row.active || !UUID.test(product.id || '')) return null;
  const discountActive = row.promotional_price != null && (!row.promotion_from || Date.parse(row.promotion_from) <= now) && (!row.promotion_until || Date.parse(row.promotion_until) > now);
  const price = Number(discountActive ? row.promotional_price : row.price);
  const quantity = Number(row.available_qty) - Number(row.reserved_qty) + ownQuantity;
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 0) throw fail('El inventario tiene un dato que requiere revisión.');
  const confirmed = Date.parse(row.stock_confirmed_at);
  const validUntil = stockClosingTime(row.stock_confirmed_at);
  return {id: product.id, branch_id: branchId, name: text(product.name, 160),
    description: text(`${product.description || ''}${discountActive ? ' Precio promocional vigente.' : ' Precio regular; no representa un descuento.'}`, 600),
    price_cop: price, available_quantity: quantity, active: true,
    stock_verified: validUntil > now && confirmed <= now,
    stock_valid_until: validUntil ? new Date(validUntil).toISOString() : '',
    offer_starts_at: discountActive ? row.promotion_from || '' : '', offer_ends_at: discountActive ? row.promotion_until || '' : ''};
}

export async function loadPreviewContext(env, operator, conversationId, expectedVersion, now = Date.now()) {
  const conversation = (await read(env, 'whatsapp_conversations', {id: `eq.${conversationId}`, select: '*', limit: '1'}))[0];
  if (!conversation || !allowed(operator, conversation)) throw fail('No tienes acceso a esta conversación.', 403);
  eligible(conversation);
  if (conversation.automation_control_version !== expectedVersion) throw fail('El control de la conversación cambió. Actualiza e inténtalo de nuevo.', 409);
  const data = (await read(env, 'rpc/bot_context_snapshot', {p_conversation_id:conversationId}))[0]?.snapshot;
  if (!data?.conversation || !allowed(operator,data.conversation)) throw fail('No tienes acceso a esta conversación.',403);
  eligible(data.conversation);
  if (data.conversation.automation_control_version !== expectedVersion) throw fail('El control de la conversación cambió. Actualiza e inténtalo de nuevo.',409);
  Object.assign(conversation,data.conversation);
  const branchId = conversation.branch_id;
  const {branches,contacts,messages,knowledge,inventory,qrs,instructions,orders,answers,reservations,allBranches,attachments}=data;
  if ([branches,contacts,messages,knowledge,inventory,qrs,instructions,orders,answers,reservations,allBranches,attachments].some(rows=>!Array.isArray(rows))) throw fail('El contexto recibido no es válido.');
  if (!branches[0]) throw fail('La sede no está disponible.', 409);
  const publicMessages = messages.filter(m => m.raw_payload?.internal_notification !== true && (m.direction === 'inbound' && m.sender_type === 'customer' || m.direction === 'outbound' && ['sent','delivered','read'].includes(m.delivery_status)));
  const latest = publicMessages.find(m => m.direction === 'inbound');
  if (!latest) throw fail('Todavía no hay un mensaje del cliente para probar.', 409);
  const file = attachments.find(a => a.message_id === latest.id && a.storage_path);
  const commerce = conversation.sales_state?.pilot_commerce || {};
  const ownQuantity = productId => reservations.filter(r=>r.product_id===productId && (commerce.reservations||[]).includes(r.id) && Date.parse(r.expires_at)>now).reduce((n,r)=>n+r.quantity,0);
  const products = inventory.slice(0,100).map(row => productSnapshot(row, branchId, now, ownQuantity(row.product_id))).filter(Boolean);
  const offeredDelivered = publicMessages.some(m=>m.id===commerce.offered_message_id);
  const summaryDelivered = publicMessages.some(m=>m.id===commerce.summary_message_id);
  const requestedNumber = /\bREY[- ]?(\d+)\b/i.exec(latest.body||'');
  const order = requestedNumber ? orders.find(o=>o.order_number.toUpperCase()===`REY-${requestedNumber[1]}`) : orders.find(o=>o.id===commerce.order_id) || (orders.length===1 ? orders[0] : null);
  const labels = {preparing:'en preparación',ready:order?.fulfillment_type==='pickup'?'listo para recoger':'listo para despacho',dispatched:'en camino',delivered:'entregado',cancelled:'cancelado'};
  const sourceVersion = Math.max(Date.parse(conversation.updated_at) || 0, Date.parse(conversation.last_message_at) || 0);
  const state = {
    control: {manual_paused: conversation.automation_paused === true, closed: false, consent: 'granted', allow_ai: true},
    branch: branches[0], customer: {name: text(contacts[0]?.preferred_name, 100)},
    message: {id: latest.id, text: text(latest.body, 4000) || `El cliente envió un archivo de tipo ${text(latest.message_type,30)}. No se ha interpretado su contenido.`, kind: latest.message_type,
      ...(file ? {attachment: {id: file.id, message_id: latest.id, persisted: true}} : {})},
    history: [...publicMessages].reverse().filter(m => m.id !== latest.id).map(m => ({role: m.direction === 'inbound' ? 'customer' : m.sender_type === 'human' ? 'operator' : 'assistant', text: text(m.body,2000) || `[Archivo de tipo ${text(m.message_type,30)}]`})),
    information: [{id:'verified-active-branches',topic:'Nuestras sedes',text:'Sedes activas de Almacenes El Rey: '+orderedBranches(allBranches).map(b=>b.name).join('; ')+'. Puedes pedir cambiar de sede antes de iniciar la compra.'},...answers.filter(answer=>answer.resolution?.answer).map(answer=>({id:answer.id,topic:'Respuesta del equipo para esta conversación',text:text(`Consulta: ${answer.question}. Respuesta registrada el ${answer.resolved_at}: ${answer.resolution.answer}`,2000)})),...knowledge.filter(record => validAt(record,now)).map(record => ({id: record.id, topic: text(`${record.category}: ${record.title}`,100), text: text(record.content,2000)}))].slice(0,40),
    confirmed_answers: answers.filter(answer=>answer.resolution?.answer).map(answer=>({id:answer.id,answer:text(answer.resolution.answer,1800)})),
    products, qr_assets: await Promise.all(qrs.filter(qr => qr.branch_id === branchId && qr.storage_path && ['image/jpeg','image/png'].includes(qr.mime_type)).map(async qr => ({id: `qr:${branchId}:${(await digest([qr.storage_path,qr.updated_at])).slice(0,32)}`, branch_id: branchId, label: 'QR vigente de la sede', active: true}))),
    operator_instructions: [...instructions].reverse().map(note => ({id: note.request_id, text: text(note.payload?.text,1000)})),
    // Legacy sale-state objects are not trusted as the new engine's accepted
    // quotation or ordered offers. The new durable consumer will own these.
    last_options: offeredDelivered ? (commerce.offered_ids||[]).filter(id=>products.some(p=>p.id===id)) : [],
    cart: (commerce.stage==='ordered'?[]:commerce.cart||[]).filter(i=>products.some(p=>p.id===i.product_id)).map(i=>({product_id:i.product_id,quantity:i.qty})),
    checkout: {...commerce,summary_delivered:summaryDelivered},
    payment: {ready_for_qr: commerce.payment_method==='transfer' && commerce.accepted_quote_id===commerce.quote_id && !!commerce.quote_id && Date.parse(commerce.reservation_until)>now,quote_id:commerce.quote_id||''},
    order: order ? {id: order.id, status: order.status, summary: `Tu pedido ${order.order_number} de ${order.branch_name||branches[0].name} está ${labels[order.status]||'pendiente de revisión'}. Total: ${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(order.total)+Number(order.delivery_fee))}. ${order.promised_at && Date.parse(order.promised_at)>now ? `Hora estimada confirmada: ${new Date(order.promised_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}.` : 'No hay hora de entrega vigente confirmada.'}`} : null
  };
  const fingerprint = await digest({state, sourceVersion, controlVersion: expectedVersion, latestMessage: publicMessages[0]?.id});
  return {contract: 'el-rey.bot.turn.v1', mode: 'preview', conversation_id: conversationId, control_version: expectedVersion,
    context_version: sourceVersion, commerce_version:commerce.version||0, context_fingerprint: fingerprint,
    snapshot: {source: 'intranet', issued_at: new Date(now).toISOString(), expires_at: new Date(now+240000).toISOString(), ...state},
    latest_message_id: publicMessages[0]?.id,
    warnings: [...(products.some(p=>!p.stock_verified) ? ['Las existencias todavía requieren confirmación del equipo; esta prueba no reserva productos.'] : []), ...(inventory.length>100 ? ['Se consultaron los primeros 100 productos; el catálogo no está completo.'] : [])]};
}

export async function requestBotDecision(env, context, mode = 'preview', turnId = crypto.randomUUID()) {
    const packet = {...context,mode,turn_id:turnId}; delete packet.warnings; delete packet.latest_message_id;
    const result = await fetch(CORE_URL, {method:'POST', headers:{'content-type':'application/json','x-elrey-webhook-secret':env.N8N_REBUILD_WEBHOOK_SECRET},
      body:JSON.stringify(packet), redirect:'manual', signal:AbortSignal.timeout(100000)});
    const data=await result.json().catch(()=>null);
    const decisionError = message => Object.assign(fail(message), {code:typeof data?.status==='string'&&/^[a-z_]{1,60}$/.test(data.status)?data.status:'invalid_decision',upstream_status:result.status});
    if (!result.ok || !data) throw decisionError('El bot no pudo completar la prueba. No se envió ningún mensaje.');
    if (data.contract!=='el-rey.bot.decision.v1' || data.status!=='decision_ready' || data.mode!==mode || data.source!=='intranet'
      || data.turn_id!==turnId || data.conversation_id!==context.conversation_id || data.expected_control_version!==context.control_version
      || data.expected_context_version!==context.context_version || data.expected_context_fingerprint!==context.context_fingerprint
      || data.send_allowed!==false || !Array.isArray(data.mutations_executed) || data.mutations_executed.length
      || typeof data.decision?.reply_text!=='string' || !data.decision.reply_text.trim() || data.decision.reply_text.length>1800) throw decisionError('La respuesta no pasó la validación. No se envió ningún mensaje.');
    if (!(Date.parse(data.expires_at)>Date.now())) throw fail('La prueba venció. Vuelve a generarla.',409);

    return data;
}

export async function handleBotPreview(request, env, authenticateOperator) {
  if (request.method !== 'POST') return reply({error:'Método no permitido.'},405);
  let operator;
  try { operator = await authenticateOperator(request,env); } catch { return reply({error:'No fue posible verificar la sesión.'},503); }
  if (!operator) return reply({error:'Inicia sesión para probar el bot.'},401);
  let body;
  try { const raw = await request.text(); if (raw.length>2048) throw new Error(); body=JSON.parse(raw); } catch { return reply({error:'Solicitud inválida.'},400); }
  if (!UUID.test(body?.conversation_id || '') || !Number.isSafeInteger(body.expected_version) || body.expected_version<0) return reply({error:'Selecciona una conversación vigente.'},400);
  if (!env.N8N_REBUILD_WEBHOOK_SECRET) return reply({error:'La conexión con el bot nuevo todavía no está configurada.'},503);
  try {
    const context = await loadPreviewContext(env,operator,body.conversation_id,body.expected_version);
    const data = await requestBotDecision(env,context);
    // A preview is still stale if a customer or operator intervened during the
    // model request. No result is copied into the outgoing queue automatically.
    const freshOperator=await authenticateOperator(request,env);
    if (!freshOperator || freshOperator.id!==operator.id) throw fail('La sesión cambió. Inicia sesión de nuevo.',401);
    const current=await loadPreviewContext(env,freshOperator,body.conversation_id,body.expected_version);
    if (current.context_fingerprint!==context.context_fingerprint) throw fail('La conversación o sus datos cambiaron durante la prueba. Genera una respuesta nueva.',409);
    return reply({ok:true,mode:'preview',sent:false,conversation_id:body.conversation_id,source_message_id:context.snapshot.message.id,
      latest_message_id:context.latest_message_id,control_version:body.expected_version,
      reply_text:data.decision.reply_text,intent:data.decision.intent,requires_human:data.decision.intent==='handoff',warnings:context.warnings});
  } catch(error) {
    return reply({error:error.status?error.message:'No fue posible completar la prueba. No se envió ningún mensaje.'},error.status||503);
  }
}
