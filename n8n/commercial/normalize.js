// Shared by local scenario tests and the existing n8n Code node.
export function normalizeDecision(context, output) {
  const text = value => String(value ?? '').trim();
  const fold = value => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let raw = output?.output ?? output;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = {}; } }
  raw = object(raw?.output ?? raw);
  const previous = object(context.sales_state);
  const proposed = object(raw.sales_state);
  const payload = object(context.current_message_payload);
  const internal = context.current_sender_type === 'human';
  const instruction = internal && payload.operator_instruction === true;
  const customerText = internal ? '' : fold(context.customer_message);
  const branches = context.branches || [];
  const storedBranch = context.stored_branch_id === undefined ? context.branch_id : context.stored_branch_id;
  const resolvedSelection = context.branch_id && context.branch_id !== storedBranch;
  const candidate = resolvedSelection ? context.branch_id : branches.find(b => b.id === raw.branch_id)?.id || '';
  const branchChange = Boolean(storedBranch && candidate && candidate !== storedBranch && (resolvedSelection || raw.branch_change_confirmed === true) && !context.latest_order);
  const branch = branchChange ? candidate : (storedBranch || context.branch_id || candidate);
  const contextBranchChanged = Boolean(branch && branch !== context.branch_id);
  const name = text(raw.name_confirmed === true && raw.customer_name ? raw.customer_name : context.preferred_name).slice(0,120);
  const state = {...previous};
  for (const field of ['stage','fulfillment_type','delivery_zone','recipient_name','payment_reference','customer_notes','credit_document','credit_phone','credit_installments','credit_code']) {
    state[field] = text(proposed[field]) || text(previous[field]);
  }
  const number = value => value !== null && value !== '' && value !== undefined && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const normalizeItems = values => (Array.isArray(values) ? values : []).filter(x => x && text(x.name)).map(x => ({product_id:text(x.product_id),name:text(x.name).slice(0,180),qty:Number.isSafeInteger(Number(x.qty)) && Number(x.qty)>0 ? Number(x.qty) : 1,unit_price:number(x.unit_price)}));
  const beforeItems = normalizeItems(previous.items);
  state.items = raw.cart_operation === 'clear' ? [] : raw.cart_operation === 'replace' ? normalizeItems(proposed.items) : beforeItems;
  // A missing/unknown fee must never turn a priced delivery into a free one.
  state.delivery_fee = number(previous.delivery_fee);
  const previousAddress = text(previous.delivery_address), address = text(proposed.delivery_address);
  state.delivery_address = previousAddress;
  if (raw.address_operation === 'replace') state.delivery_address = address || previousAddress;
  else if (raw.address_operation === 'append' && address) {
    state.delivery_address = !previousAddress || fold(address).includes(fold(previousAddress)) ? address : fold(previousAddress).includes(fold(address)) ? previousAddress : previousAddress + ', ' + address;
  }
  const paymentAliases = {transfer:'transfer',transferencia:'transfer',qr:'transfer',transferencia_qr:'transfer',transfer_qr:'transfer',addi:'addi',sistecredito:'sistecredito',cash_prepaid:'cash_prepaid',pago_en_local:'cash_prepaid',pago_en_tienda:'cash_prepaid'};
  state.payment_method = paymentAliases[fold(proposed.payment_method).replace(/[\s-]+/g,'_')] || previous.payment_method || '';
  const fulfillmentAliases = {delivery:'delivery',domicilio:'delivery',pickup:'pickup',recogida:'pickup',recoger:'pickup'};
  state.fulfillment_type = fulfillmentAliases[fold(state.fulfillment_type)] || '';
  const tasks = (context.human_tasks || []).filter(t => !t.branch_id || t.branch_id === branch).slice().reverse();
  const negative = answer => /\b(no|rechazad\w*|pendiente\w*|falta\w*|invalido|insuficiente|sin confirmar|sin verificar)\b/.test(fold(answer));
  const resolutionPositive = task => task?.status === 'resolved' && !negative(task.resolution?.answer) && (task.resolution?.approved === true || /\b(aprobado|aprobada|verificado|verificada|valido|valida|pago recibido|recibido correctamente)\b/.test(fold(task.resolution?.answer)));
  const fingerprint = items => JSON.stringify(normalizeItems(items).map(x => [x.product_id,x.name,x.qty,x.unit_price]));
  const sameItems = task => fingerprint(task.context?.sales_state?.items) === fingerprint(state.items);
  const sameDelivery = task => ['delivery_address','delivery_zone'].every(k => fold(task.context?.sales_state?.[k]) === fold(state[k]));
  const productAnswers = tasks.filter(t => t.type === 'product_lookup' && t.status === 'resolved' && !negative(t.resolution?.answer));
  const inventory = contextBranchChanged ? [] : (context.inventory || []);
  let unverifiedItems = false;
  for (const item of state.items) {
    const stock = inventory.find(x => x.product_id === item.product_id);
    if (stock) {
      item.name = stock.name;
      item.unit_price = number(stock.price);
      if (item.unit_price === null || item.qty > Number(stock.available_qty)) unverifiedItems = true;
    } else {
      const prior = beforeItems.find(x => x.name === item.name && x.product_id === item.product_id && x.unit_price === item.unit_price);
      const supported = productAnswers.some(t => {
        const requested = (t.context?.sales_state?.items || []).find(x => fold(x.name)===fold(item.name));
        if (!requested || Number(requested.qty)<item.qty) return false;
        const answer = fold(t.resolution?.answer).replace(/[.,\s]/g,'');
        return item.unit_price !== null && item.unit_price > 0 && answer.includes(String(item.unit_price));
      });
      if (contextBranchChanged || (!supported && !(prior && previous.items_verified === true && prior.qty >= item.qty))) unverifiedItems = true;
      // Invented catalog UUIDs must not reach stock deduction.
      if (!stock && !prior) item.product_id = '';
    }
  }
  state.items_verified = state.items.length > 0 && !unverifiedItems;
  const deliveryChanged = ['delivery_address','delivery_zone','fulfillment_type'].some(k => fold(state[k]) !== fold(previous[k]));
  const itemsChanged = fingerprint(state.items) !== fingerprint(beforeItems);
  const methodChanged = state.payment_method !== (previous.payment_method || '');
  if (deliveryChanged || itemsChanged || branchChange) { state.delivery_fee = null; state.delivery_quote_verified = false; }
  const quote = tasks.find(t => t.type==='delivery_quote' && t.status==='resolved' && sameDelivery(t) && sameItems(t) && !negative(t.resolution?.answer));
  if (quote && number(proposed.delivery_fee) !== null) {
    const fee = number(proposed.delivery_fee);
    const answer = fold(quote.resolution?.answer).replace(/[.,\s]/g,'');
    if ((fee>0 && answer.includes(String(fee))) || (fee===0 && /gratis|sin costo|costo cero/.test(fold(quote.resolution?.answer))) || number(quote.resolution?.delivery_fee)===fee) {
      state.delivery_fee = fee; state.delivery_quote_verified = true;
    }
  }
  if (state.fulfillment_type==='pickup') {state.delivery_fee=0;state.delivery_quote_verified=false;}
  const materialChange = itemsChanged || deliveryChanged || methodChanged || branchChange || state.delivery_fee !== number(previous.delivery_fee);
  const paymentTaskType = state.payment_method==='transfer' ? 'payment_verification' : 'credit_application';
  const paymentTask = tasks.find(t => t.type===paymentTaskType && sameItems(t) && sameDelivery(t) && t.context?.sales_state?.payment_method===state.payment_method && number(t.context?.sales_state?.delivery_fee)===state.delivery_fee);
  const approved = resolutionPositive(paymentTask);
  // Never accept a payment status proposed by the model or a customer's screenshot.
  state.payment_status = !materialChange && previous.payment_verified_task_id && ['verified','approved'].includes(previous.payment_status) ? previous.payment_status : 'pending';
  if (approved && !contextBranchChanged) {
    state.payment_status=state.payment_method==='transfer' ? 'verified':'approved';
    state.payment_verified_task_id=paymentTask.id;
  } else if (materialChange || (paymentTask && !resolutionPositive(paymentTask))) {
    delete state.payment_verified_task_id;
    state.payment_status=paymentTask?.status==='rejected' || negative(paymentTask?.resolution?.answer) ? 'rejected':'pending';
  }
  if (state.payment_method==='cash_prepaid' && state.fulfillment_type==='pickup') state.payment_status='pay_at_store';
  const lastAssistant=(context.recent_messages||[]).filter(m=>m.sender_type==='assistant').at(-1)?.body || '';
  const explicitCheckout=/\bconfirmo (el pedido|la compra)\b/.test(customerText) || (/^(si|si confirmo|confirmo|de acuerdo|adelante|correcto|esta bien)[.! ]*$/.test(customerText) && /resumen|confirmas (este|el) pedido/i.test(lastAssistant));
  state.checkout_confirmed = raw.checkout_confirmed===true && !internal && explicitCheckout ? true : !materialChange && previous.checkout_confirmed===true;
  if (materialChange) state.checkout_confirmed=false;
  const allowed = new Set(['reply','ask_branch','human_product_lookup','human_delivery_quote','human_payment_verification','human_credit_application','human_general','finalize_order','stop']);
  let action=allowed.has(raw.action) ? raw.action:'reply';
  let reply=text(raw.reply);
  const respond = message => {action='reply';reply=message;};
  if (!reply) {
    if (branch) {action='human_general';reply='Voy a pedir apoyo al equipo para atender tu consulta y conservar lo que ya me compartiste.';}
    else respond('Estoy teniendo una dificultad para interpretar tu consulta. ¿En qué sede o zona deseas que te ayudemos?');
  }
  const offerQuery = /ofertas?|promociones?|descuentos?|temporada/.test(customerText);
  const promotions = (context.knowledge||[]).filter(k => k.category==='promotion');
  if (offerQuery && promotions.length===0 && !inventory.some(i=>i.promotion_active) && !action.startsWith('human_')) {
    respond('Aún no tengo ofertas de temporada confirmadas para compartirte. Puedo ayudarte a consultar un producto con la sede. ¿Qué estás buscando?');
  }
  if (branchChange) {
    state.items_verified=!contextBranchChanged && state.items.length>0 && !unverifiedItems;state.delivery_fee=null;state.delivery_quote_verified=false;state.payment_status='pending';state.checkout_confirmed=false;delete state.payment_verified_task_id;
    if (state.items.length && !state.items_verified) {action='human_product_lookup';reply='Revisaré estos productos y sus precios en '+branches.find(b=>b.id===branch).name+' para continuar con tu compra allí.';}
    else if (state.items.length) respond('Listo, continuamos con '+branches.find(b=>b.id===branch).name+'. '+state.items.map(x=>x.qty+' × '+x.name+' a $'+x.unit_price.toLocaleString('es-CO')).join(', ')+'. ¿Prefieres recoger en esta sede o recibir a domicilio?');
    else respond('Listo, continuamos con '+branches.find(b=>b.id===branch).name+'. ¿Qué producto u oferta te gustaría consultar?');
  }
  if (['finalize_order','human_delivery_quote','human_payment_verification','human_credit_application'].includes(action) && !state.items_verified) {
    if (state.items.length && branch) {action='human_product_lookup';reply='Voy a confirmar con la sede el precio y la disponibilidad de los productos para darte una cotización correcta.';}
    else respond('¿Qué producto y cantidad te gustaría cotizar?');
  }
  if (action==='human_delivery_quote') {
    const missing = !state.delivery_address ? 'la dirección completa' : !state.delivery_zone ? 'el barrio y municipio' : !state.recipient_name ? 'el nombre de quien recibe' : '';
    if (missing) respond('Para cotizar el domicilio me falta '+missing+'. ¿Me lo compartes?');
  }
  if (action==='human_payment_verification' && ['addi','sistecredito'].includes(state.payment_method)) action='human_credit_application';
  if (action==='human_credit_application') {
    if (!state.credit_document) respond('¿Cuál es tu número de cédula para consultar la solicitud de crédito?');
    else if (!state.credit_phone) respond('¿Qué celular usaremos para la solicitud de crédito?');
  }
  const ready = Boolean(name && branch && state.items_verified && ['pickup','delivery'].includes(state.fulfillment_type) && (state.fulfillment_type==='pickup' || (state.delivery_address && state.delivery_zone && state.recipient_name && state.delivery_quote_verified && state.delivery_fee!==null)));
  const paymentReady = ['verified','approved','pay_at_store'].includes(state.payment_status);
  if (action==='finalize_order') {
    if (context.latest_order) respond('Tu pedido '+context.latest_order.order_number+' ya está registrado. ¿Qué necesitas consultar sobre él?');
    else if (!name) respond('¿A nombre de quién registramos el pedido?');
    else if (!ready) respond(!state.fulfillment_type ? '¿Prefieres recoger en la sede o recibir a domicilio?' : 'Antes de confirmar, necesitamos completar los datos y la cotización de entrega.');
    else if (!state.checkout_confirmed) {
      const total=state.items.reduce((sum,x)=>sum+x.qty*x.unit_price,0)+(state.fulfillment_type==='delivery'?state.delivery_fee:0);
      respond('Resumen: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. '+branches.find(b=>b.id===branch)?.name+'. '+(state.fulfillment_type==='pickup'?'Recogida en sede':'Domicilio: '+state.delivery_address)+'. Total: $'+total.toLocaleString('es-CO')+'. ¿Confirmas este pedido?');
    } else if (!paymentReady) {action=['addi','sistecredito'].includes(state.payment_method)?'human_credit_application':'human_payment_verification';reply='El equipo debe confirmar el pago o crédito antes de registrar tu pedido.';}
  }
  // Gate every new human request without forcing a menu on ordinary questions.
  if (action.startsWith('human_') && !branch) respond('¿En cuál sede o zona deseas hacer la consulta? Así la reviso con el equipo indicado.');
  const typeByAction={human_product_lookup:'product_lookup',human_delivery_quote:'delivery_quote',human_payment_verification:'payment_verification',human_credit_application:'credit_application',human_general:'general'};
  if (action.startsWith('human_') && (context.pending_human_tasks||[]).some(t=>t.type===typeByAction[action] && (!t.branch_id || t.branch_id===branch))) {
    respond('El equipo ya está revisando esa solicitud. Dejé los nuevos datos en la conversación para que los tenga en cuenta.');
  }
  if (state.payment_method==='cash_prepaid' && state.fulfillment_type==='delivery') {state.payment_method='';state.payment_status='pending';respond('El pago en la sede aplica para recogida. Para domicilio puedes usar transferencia, Addi o Sistecrédito. ¿Cuál prefieres?');}
  if (context.delivery_open===false && (action==='human_delivery_quote' || (action==='finalize_order' && state.fulfillment_type==='delivery'))) respond('Los domicilios se gestionan hasta las 7:00 p. m. Podemos continuar al abrir a las 9:00 a. m. o revisar recogida en sede.');
  let sendQr = raw.request_qr===true && Boolean(context.payment_qr?.available) && !contextBranchChanged && state.payment_method==='transfer' && !['verified','approved'].includes(state.payment_status) && action!=='stop';
  if (sendQr && !/(\bqr\b|transferencia|codigo)/.test(customerText) && !instruction) sendQr=false;
  if (sendQr) {reply='Te comparto el QR de '+context.branch_name+'. Cuando hagas la transferencia, envíame el comprobante para que el equipo lo verifique.';}
  if (context.service_open===false && !instruction && !(internal && context.operator_confirmation)) {respond('En este momento no hay atención. Volvemos a las 9:00 a. m.; conservamos tu consulta para continuar.');sendQr=false;}
  if (raw.action==='stop') {action='stop';reply='Entendido. Gracias por escribirnos; quedamos a tu disposición cuando lo necesites.';sendQr=false;}
  return {...context, ai:{intent:text(raw.intent||'general').slice(0,80),action,branch_id:branch||'',branch_change_confirmed:branchChange,customer_name:name,reply:reply.slice(0,1500),summary:text(raw.summary||context.conversation_summary||context.customer_message).slice(0,1000),task_title:text(raw.task_title||'Consulta de WhatsApp para la sede').slice(0,180),task_question:text(raw.task_question||context.customer_message||'Revisar los datos de la conversación.').slice(0,1200),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0)),sales_state:state,send_qr:sendQr}};
}
