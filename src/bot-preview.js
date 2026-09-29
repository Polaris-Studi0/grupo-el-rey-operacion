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
function productSnapshot(row, branchId, env, now) {
  const product = row.product;
  if (row.branch_id !== branchId || !product?.active || !row.active || !UUID.test(product.id || '')) return null;
  const discountActive = row.promotional_price != null && (!row.promotion_from || Date.parse(row.promotion_from) <= now) && (!row.promotion_until || Date.parse(row.promotion_until) > now);
  const price = Number(discountActive ? row.promotional_price : row.price);
  const quantity = Number(row.available_qty) - Number(row.reserved_qty);
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 0) throw fail('El inventario tiene un dato que requiere revisión.');
  // Never treat generic updated_at as a physical stock count. Until the explicit
  // stock-confirmation field and freshness policy exist, ask the human team.
  const minutes = Number(env.BOT_STOCK_MAX_AGE_MINUTES || 0);
  const confirmed = Date.parse(row.stock_confirmed_at);
  const validUntil = Number.isFinite(confirmed) && minutes > 0 && minutes <= 1440 ? confirmed + minutes * 60000 : 0;
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
  const branchId = conversation.branch_id;
  const [branches, contacts, messages, knowledge, inventory, qrs, instructions, orders, answers] = await Promise.all([
    read(env, 'branches', {id: `eq.${branchId}`, active: 'eq.true', select: 'id,name', limit: '1'}),
    read(env, 'whatsapp_contacts', {id: `eq.${conversation.contact_id}`, select: 'preferred_name,display_name', limit: '1'}),
    read(env, 'whatsapp_messages', {conversation_id: `eq.${conversationId}`, select: 'id,direction,sender_type,message_type,body,delivery_status,created_at,raw_payload', or: '(and(direction.eq.inbound,sender_type.eq.customer),and(direction.eq.outbound,delivery_status.in.(sent,delivered,read)))', order: 'created_at.desc,id.desc', limit: '60'}),
    read(env, 'branch_knowledge', {active: 'eq.true', or: `(branch_id.eq.${branchId},branch_id.is.null)`, select: 'id,branch_id,category,title,content,valid_from,valid_until,updated_at', order: 'updated_at.desc,id.asc', limit: '100'}),
    read(env, 'branch_inventory', {branch_id: `eq.${branchId}`, active: 'eq.true', select: '*,product:products(id,name,description,active,seasonal)', order: 'product_id.asc', limit: '101'}),
    read(env, 'branch_payment_qrs', {branch_id: `eq.${branchId}`, active: 'eq.true', select: 'branch_id,storage_path,updated_at', limit: '2'}),
    read(env, 'whatsapp_operator_actions', {conversation_id: `eq.${conversationId}`, action: 'eq.instruction', status: 'eq.pending_bot', select: 'request_id,payload,created_at', order: 'created_at.desc,request_id.desc', limit: '10'}),
    UUID.test(conversation.linked_order_id || '') ? read(env, 'orders', {id: `eq.${conversation.linked_order_id}`, whatsapp_conversation_id: `eq.${conversationId}`, branch_id: `eq.${branchId}`, select: 'id,order_number,status,updated_at', limit: '1'}) : Promise.resolve([]),
    read(env, 'human_tasks', {conversation_id: `eq.${conversationId}`, branch_id: `eq.${branchId}`, status: 'in.(resolved,rejected)', 'context->>pilot_engine': 'eq.new-whatsapp-v1', select: 'id,question,resolution,resolved_at', order: 'resolved_at.desc,id.desc', limit: '10'})
  ]);
  if (!branches[0]) throw fail('La sede no está disponible.', 409);
  const publicMessages = messages.filter(m => m.raw_payload?.internal_notification !== true && (m.direction === 'inbound' && m.sender_type === 'customer' || m.direction === 'outbound' && ['sent','delivered','read'].includes(m.delivery_status)));
  const latest = publicMessages.find(m => m.direction === 'inbound');
  if (!latest) throw fail('Todavía no hay un mensaje del cliente para probar.', 409);
  const attachments = await read(env, 'whatsapp_attachments', {conversation_id: `eq.${conversationId}`, message_id: `eq.${latest.id}`, select: 'id,message_id,storage_path,mime_type', order: 'id.asc', limit: '1'});
  const file = attachments.find(a => a.message_id === latest.id && a.storage_path);
  const products = inventory.slice(0,100).map(row => productSnapshot(row, branchId, env, now)).filter(Boolean);
  const sourceVersion = Math.max(Date.parse(conversation.updated_at) || 0, Date.parse(conversation.last_message_at) || 0);
  const state = {
    control: {manual_paused: conversation.automation_paused === true, closed: false, consent: 'granted', allow_ai: true},
    branch: branches[0], customer: {name: text(contacts[0]?.preferred_name || contacts[0]?.display_name, 100)},
    message: {id: latest.id, text: text(latest.body, 4000) || `El cliente envió un archivo de tipo ${text(latest.message_type,30)}. No se ha interpretado su contenido.`, kind: latest.message_type,
      ...(file ? {attachment: {id: file.id, message_id: latest.id, persisted: true}} : {})},
    history: [...publicMessages].reverse().filter(m => m.id !== latest.id).map(m => ({role: m.direction === 'inbound' ? 'customer' : m.sender_type === 'human' ? 'operator' : 'assistant', text: text(m.body,2000) || `[Archivo de tipo ${text(m.message_type,30)}]`})),
    information: [...answers.filter(answer=>answer.resolution?.answer).map(answer=>({id:answer.id,topic:'Respuesta del equipo para esta conversación',text:text(`Consulta: ${answer.question}. Respuesta registrada el ${answer.resolved_at}: ${answer.resolution.answer}`,2000)})),...knowledge.filter(record => validAt(record,now)).map(record => ({id: record.id, topic: text(`${record.category}: ${record.title}`,100), text: text(record.content,2000)}))].slice(0,40),
    products, qr_assets: await Promise.all(qrs.filter(qr => qr.branch_id === branchId && qr.storage_path).map(async qr => ({id: `qr:${branchId}:${(await digest([qr.storage_path,qr.updated_at])).slice(0,32)}`, branch_id: branchId, label: 'QR vigente de la sede', active: true}))),
    operator_instructions: [...instructions].reverse().map(note => ({id: note.request_id, text: text(note.payload?.text,1000)})),
    // Legacy sale-state objects are not trusted as the new engine's accepted
    // quotation or ordered offers. The new durable consumer will own these.
    last_options: [], cart: [], payment: {ready_for_qr: false, quote_id: ''},
    order: orders[0] ? {id: orders[0].id, status: orders[0].status, summary: `Pedido ${orders[0].order_number}. Estado registrado: ${orders[0].status}.`} : null
  };
  const fingerprint = await digest({state, sourceVersion, controlVersion: expectedVersion, latestMessage: publicMessages[0]?.id});
  return {contract: 'el-rey.bot.turn.v1', mode: 'preview', conversation_id: conversationId, control_version: expectedVersion,
    context_version: sourceVersion, context_fingerprint: fingerprint,
    snapshot: {source: 'intranet', issued_at: new Date(now).toISOString(), expires_at: new Date(now+240000).toISOString(), ...state},
    latest_message_id: publicMessages[0]?.id,
    warnings: [...(products.some(p=>!p.stock_verified) ? ['Las existencias todavía requieren confirmación del equipo; esta prueba no reserva productos.'] : []), ...(inventory.length>100 ? ['Se consultaron los primeros 100 productos; el catálogo no está completo.'] : [])]};
}

export async function requestBotDecision(env, context, mode = 'preview', turnId = crypto.randomUUID()) {
    const packet = {...context,mode,turn_id:turnId}; delete packet.warnings; delete packet.latest_message_id;
    const result = await fetch(CORE_URL, {method:'POST', headers:{'content-type':'application/json','x-elrey-webhook-secret':env.N8N_REBUILD_WEBHOOK_SECRET},
      body:JSON.stringify(packet), redirect:'manual', signal:AbortSignal.timeout(100000)});
    if (!result.ok) throw fail('El bot no pudo completar la prueba. No se envió ningún mensaje.');
    const data=await result.json();
    if (data.contract!=='el-rey.bot.decision.v1' || data.status!=='decision_ready' || data.mode!==mode || data.source!=='intranet'
      || data.turn_id!==turnId || data.conversation_id!==context.conversation_id || data.expected_control_version!==context.control_version
      || data.expected_context_version!==context.context_version || data.expected_context_fingerprint!==context.context_fingerprint
      || data.send_allowed!==false || !Array.isArray(data.mutations_executed) || data.mutations_executed.length
      || typeof data.decision?.reply_text!=='string' || !data.decision.reply_text.trim() || data.decision.reply_text.length>1800) throw fail('La respuesta no pasó la validación. No se envió ningún mensaje.');
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
