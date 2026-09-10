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
  // Tolerate control fields placed inside sales_state by the model. These are
  // parsing hints only; stock, checkout and payment proof still use their guards.
  for (const field of ['turn_kind','cart_operation','address_operation','name_confirmed','customer_name','branch_id','branch_change_confirmed','request_qr']) {
    if (raw[field]===undefined && proposed[field]!==undefined) raw={...raw,[field]:proposed[field]};
  }
  const payload = object(context.current_message_payload);
  const internal = context.current_sender_type === 'human';
  const instruction = internal && payload.operator_instruction === true;
  const customerText = internal ? '' : fold(context.customer_message);
  const lastAssistant=(context.recent_messages||[]).filter(m=>m.sender_type==='assistant' && m.message_type!=='image' && !/^C[oó]digo QR para pagar/.test(m.body||'')).at(-1)?.body || '';
  const branches = context.branches || [];
  const storedBranch = context.stored_branch_id === undefined ? context.branch_id : context.stored_branch_id;
  const resolvedSelection = context.branch_id && context.branch_id !== storedBranch;
  const proposedBranch=branches.find(b=>b.id===raw.branch_id);
  const branchLabel=fold(proposedBranch?.name);
  const branchLastWord=branchLabel.split(/\s+/).at(-1)||'';
  const messageWords=customerText.split(/[^\p{L}\p{N}]+/u);
  const explicitInitialBranch=Boolean(proposedBranch && (customerText.includes(branchLabel)
    || (branchLastWord.length>3 && /^[a-z]+$/.test(branchLastWord) && messageWords.includes(branchLastWord)
      && branches.filter(b=>fold(b.name).split(/\s+/).includes(branchLastWord)).length===1)));
  // Suggesting a branch in the generated reply is not a customer selection.
  const candidate = resolvedSelection ? context.branch_id : (storedBranch || context.branch_id || explicitInitialBranch ? proposedBranch?.id || '' : '');
  const branchChange = Boolean(storedBranch && candidate && candidate !== storedBranch && (resolvedSelection || raw.branch_change_confirmed === true) && !context.latest_order);
  const branch = branchChange ? candidate : (storedBranch || context.branch_id || candidate);
  const contextBranchChanged = Boolean(branch && branch !== context.branch_id);
  let name = text(raw.name_confirmed === true && raw.customer_name ? raw.customer_name : context.preferred_name).slice(0,120);
  // These turns have a deterministic meaning and must not resume an old checkout.
  // In particular, cancelling an unfinished selection does not revoke consent.
  const simpleTurn = value => fold(value).replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  const yesAnswer=/^(si|si confirmo|confirmo|de acuerdo|adelante|correcto|todo correcto|todo esta correcto|esta bien)$/;
  const isBuyerQuestion=value=>/a nombre de quien (?:registramos|va|hacemos)|cual es tu nombre|como te llamas/.test(fold(value));
  const buyerAnswer=(value,question)=>{
    const candidate=text(value).replace(/^(?:me llamo|mi nombre es|a nombre de)\s+/i,'').replace(/[.!]+$/,'').trim();
    return (isBuyerQuestion(question) || /^(me llamo|mi nombre es|a nombre de)\s/i.test(text(value)))
      && /^[\p{L}]+(?:[ '-][\p{L}]+){0,4}$/u.test(candidate)
      && !/\b(si|no|hola|gracias|correcto|confirmo|quiero|domicilio|pedido|nombre|listo|claro|vale|ok|dale|adelante|seguro|qr|transferencia|addi|sistecredito)\b/.test(fold(candidate)) ? candidate.slice(0,120) : '';
  };
  const nameAnswer=!internal && buyerAnswer(context.customer_message,lastAssistant);
  if (nameAnswer) name=nameAnswer;
  const confirmedRecipientAsBuyer=!internal && !name && previous.recipient_name && /el pedido va tambien a nombre de/.test(fold(lastAssistant)) && yesAnswer.test(simpleTurn(customerText));
  if (confirmedRecipientAsBuyer) name=text(previous.recipient_name);
  const pureGreeting = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|holi)$/.test(simpleTurn(customerText));
  const optOut = value => /\b(?:no me (?:escriban|contacten|envien)|dejen de (?:escribirme|contactarme)|no (?:quiero|deseo) (?:recibir |mas )?mensajes|no mas mensajes)\b/.test(simpleTurn(value));
  const cancelSelection = value => /^(?:(?:ya |mejor )?no (?:quiero|deseo) (?:eso|ese producto|esa compra|ese pedido|el producto|el pedido|la compra)(?: ya)?|(?:cancela|cancelar|cancelen|cancelo) (?:eso|el pedido|mi pedido|la compra|mi compra|el carrito)|dejemos eso)(?: porfa| por favor)?$/.test(simpleTurn(value));
  const resetPurchase = !internal && !optOut(customerText) && (cancelSelection(customerText) || raw.turn_kind==='cancel_purchase');
  const earlyReply = (reply, salesState, options={}) => ({...context, ai:{
    intent:options.intent||'general',action:options.action||'reply',branch_id:branch||'',branch_change_confirmed:false,
    customer_name:name,reply,summary:options.summary||reply,task_title:options.task_title||'',task_question:options.task_question||'',
    confidence:1,sales_state:salesState,send_qr:false,reset_purchase:options.reset_purchase===true,
  }});
  if (!internal && pureGreeting) {
    return earlyReply(context.service_open===false
      ? '¡Hola'+(name?' '+name:'')+'! Volvemos a las 9:00 a. m. ¿Qué te gustaría consultar?'
      : '¡Hola'+(name?' '+name:'')+'! ¿Qué producto u oferta te gustaría consultar?', {...previous},
      {intent:'greeting',summary:'El cliente saludó. No solicitó retomar pagos, entregas ni gestiones anteriores.'});
  }
  if (resetPurchase) {
    if (context.latest_order) {
      const pending=(context.pending_human_tasks||[]).some(t=>t.type==='general' && (!t.branch_id||t.branch_id===branch));
      return earlyReply(pending
        ? 'La revisión de tu pedido sigue pendiente con la sede. Su cancelación todavía no está confirmada.'
        : branch ? 'Voy a pedir a la sede que revise la cancelación de tu pedido. Todavía no está cancelado.'
        : 'Tu pedido ya está registrado. ¿En qué sede lo gestionaste para revisar la cancelación?', {...previous},
        {intent:'cancel_purchase',action:branch&&!pending?'human_general':'reply',task_title:'Revisar cancelación de pedido registrado',
          task_question:'El cliente solicita cancelar el pedido '+context.latest_order.order_number+'. Revisar su estado antes de confirmar la cancelación.'});
    }
    const fresh={stage:'browsing',product_interest:'',items:[],items_verified:false,fulfillment_type:'',
      delivery_address:'',delivery_zone:'',recipient_name:'',delivery_fee:null,delivery_quote_verified:false,
      payment_method:'',payment_status:'pending',payment_reference:'',payment_reported:false,store_purchase_reported:false,
      customer_notes:'',credit_document:'',credit_phone:'',credit_installments:'',credit_code:'',checkout_confirmed:false,
      purchase_reset_at:text(context.current_message_created_at),purchase_reset_message_id:text(context.inbound_message_id)};
    return earlyReply('Listo, dejamos esa compra pendiente de lado. ¿Qué te gustaría buscar ahora?',fresh,
      {intent:'cancel_purchase',reset_purchase:true,summary:'El cliente canceló la selección pendiente. Se vaciaron sus productos y datos de compra; puede consultar otra cosa.'});
  }
  // Limit fallback interpretation to the current purchase, including histories
  // saved before product_interest was introduced. Never revive a cancelled cart.
  let purchaseMessages=(context.recent_messages||[]).slice();
  const resetIndex=purchaseMessages.findLastIndex(m=>m.sender_type==='customer' && cancelSelection(m.body));
  if (resetIndex>=0) purchaseMessages=purchaseMessages.slice(resetIndex+1);
  if (previous.purchase_reset_at) purchaseMessages=purchaseMessages.filter(m=>m.created_at && new Date(m.created_at)>new Date(previous.purchase_reset_at));
  else if (previous.purchase_reset_message_id && resetIndex<0) purchaseMessages=[];
  // Recover explicit answers discarded by older workflow versions, within this purchase only.
  let recoveredBuyerName='';
  if (!name) for (let i=purchaseMessages.length-1;i>0;i--) {
    if (purchaseMessages[i].sender_type!=='customer') continue;
    const question=purchaseMessages.slice(0,i).filter(m=>m.sender_type==='assistant').at(-1)?.body||'';
    recoveredBuyerName=buyerAnswer(purchaseMessages[i].body,question);
    if (recoveredBuyerName) {name=recoveredBuyerName;break;}
  }
  const interestFromMessage = value => {
    const original=text(value), normalized=fold(original);
    if (!original || optOut(original) || cancelSelection(original) || /\b(pag(?:ar|o|ue|ado)|domicilio|direccion|recoger|sede|confirmar|cancelar|cedula|credito)\b/.test(normalized)) return '';
    const direct=/^(?:(?:hola|buenas)[,! ]+)?(?:quiero|necesito|busco|estoy buscando|me interesa|tienen|tienes|venden|manejan)\s+(.+)$/i.exec(original);
    if (direct) {
      const candidate=direct[1].replace(/^(?:(?:porfa|por favor|algun|algún|alguna|un|una|unos|unas)\s+)+/i,'').replace(/[?!.]+$/,'').trim();
      if (candidate && !/^(?:saber|ayuda|hablar|que|eso|lo mismo|ver|consultar)(?:\s|$)/.test(fold(candidate))) return candidate.slice(0,240);
    }
    const question=/^(?:que|qué)\s+(.+?)\s+(?:tienen|tienes|venden|manejan)[?!. ]*$/i.exec(original);
    return question ? text(question[1]).slice(0,240) : '';
  };
  const directInterest=internal?'':interestFromMessage(context.customer_message);
  const productQuery=!internal && (raw.turn_kind==='product_query' || Boolean(directInterest));
  const shortFollowup=!internal && (raw.turn_kind==='followup' || /^(porfa|por favor|si|si porfa|si por favor|claro|cuales tienes|cuales tienen|que opciones hay|que tienes|muestrame|muestrame las opciones|ver opciones)$/.test(simpleTurn(customerText)));
  const historicalInterest=shortFollowup ? purchaseMessages.filter(m=>m.sender_type==='customer').map(m=>interestFromMessage(m.body)).filter(Boolean).at(-1)||'' : '';
  const interest=productQuery ? text(proposed.product_interest)||directInterest : text(previous.product_interest)||(raw.turn_kind==='followup'?text(proposed.product_interest):'')||historicalInterest;
  const interestTurn=Boolean(interest) && (productQuery || (shortFollowup && !previous.items?.length) || resolvedSelection || (!storedBranch && branch));
  const state = {...previous};
  state.product_interest=interest.slice(0,240);
  for (const field of ['stage','fulfillment_type','delivery_zone','recipient_name','payment_reference','customer_notes','credit_document','credit_phone','credit_installments','credit_code']) {
    state[field] = text(proposed[field]) || text(previous[field]);
  }
  // Recover a direct answer to the recipient question even if the model omitted it.
  if (!internal && /¿[^¿?]*(?:nombre[^¿?]*(?:destinatario|recibe)|a nombre de qui[eé]n)[^¿?]*\?/i.test(lastAssistant)) {
    const answer=text(context.customer_message).split(/,|\bconfirmo\b|\bte hab[ií]a dicho\b/i)[0].trim().replace(/^(?:me llamo|a nombre de|recibe|mi nombre es)\s+/i,'');
    if (/^[\p{L}]+(?:[ '-][\p{L}]+){0,4}$/u.test(answer) && !/\b(si|no|hola|gracias|domicilio|direccion|barrio|seguro|quiero|nombre|quien|qr|transferencia|addi|sistecredito)\b/.test(fold(answer))) state.recipient_name=answer;
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
  // A delivery neighbourhood belongs to the address, not to the chosen store.
  const explicitZone=text(state.delivery_address).match(/\bbarrio\s+([^,;\n]+?)(?=\s+recibe\b|[,;\n]|$)/i);
  if (explicitZone) state.delivery_zone=text(explicitZone[1]);
  const paymentAliases = {transfer:'transfer',transferencia:'transfer',qr:'transfer',transferencia_qr:'transfer',transfer_qr:'transfer',addi:'addi',sistecredito:'sistecredito',cash_prepaid:'cash_prepaid',pago_en_local:'cash_prepaid',pago_en_tienda:'cash_prepaid'};
  state.payment_method = paymentAliases[fold(proposed.payment_method).replace(/[\s-]+/g,'_')] || previous.payment_method || '';
  const qrChoice=!internal && /^(?:con |por |pagar con |pago con |y el |el |enviame el |mandame el )?qr(?: estaria bien| porfa| por favor)?$/.test(simpleTurn(customerText));
  if (qrChoice || /^(?:transferencia|transfer)\s*\(qr\)$/.test(fold(proposed.payment_method))) state.payment_method='transfer';
  const fulfillmentAliases = {delivery:'delivery',domicilio:'delivery',pickup:'pickup',recogida:'pickup',recoger:'pickup'};
  state.fulfillment_type = fulfillmentAliases[fold(state.fulfillment_type)] || '';
  const tasks = (context.human_tasks || []).filter(t => !t.branch_id || t.branch_id === branch).slice().reverse();
  const negative = answer => /\b(no|rechazad\w*|pendiente\w*|falta\w*|invalido|insuficiente|sin confirmar|sin verificar)\b/.test(fold(answer));
  const resolutionPositive = task => task?.status === 'resolved' && !negative(task.resolution?.answer) && (task.resolution?.approved === true || /^(confirmo|confirmado|confirmada)$/.test(simpleTurn(task.resolution?.answer)) || /\b(aprobado|aprobada|verificado|verificada|validado|validada|valido|valida|pago recibido|recibido correctamente)\b/.test(fold(task.resolution?.answer)));
  const fingerprint = items => JSON.stringify(normalizeItems(items).map(x => [x.product_id,x.name,x.qty,x.unit_price]));
  const sameItems = task => fingerprint(task.context?.sales_state?.items) === fingerprint(state.items);
  const sameDelivery = task => ['delivery_address','delivery_zone'].every(k => fold(task.context?.sales_state?.[k]) === fold(state[k]));
  const productAnswers = tasks.filter(t => t.type === 'product_lookup' && t.status === 'resolved' && !negative(t.resolution?.answer));
  const amounts = value => (text(value).match(/\d{1,3}(?:[.,]\d{3})+|\d+/g)||[]).map(v=>Number(v.replace(/[.,]/g,'')));
  const productTokens = value => fold(value).replace(/(\d)\s+(ml|l|cm|mm|kg|g)\b/g,'$1$2').split(/[^a-z0-9]+/).filter(w=>w && !['vaso','vasos','termo','termos','marca','estilo','color','de','el','la','un','una'].includes(w));
  const productSupported = (task,item) => {
    const answer=fold(task.resolution?.answer);
    if (item.unit_price===null || item.unit_price<=0) return false;
    const requested=(task.context?.sales_state?.items||[]).find(x=>JSON.stringify(productTokens(x.name))===JSON.stringify(productTokens(item.name)));
    // A short affirmative can confirm a precise quote visible to the operator.
    // A price hidden only in task context is not enough to establish a price.
    const affirmative=/^(si(?: correcto| claro| confirmado| ya te habia confirmado| tenemos disponibilidad| hay disponibles| hay| tenemos| hay disponibilidad)?|tenemos disponibilidad|hay disponibles|correcto|confirmado|asi es|de acuerdo)$/.test(simpleTurn(answer));
    if (affirmative && requested && Number(requested.qty)>=item.qty && requested.unit_price===item.unit_price
      && amounts(task.question).includes(item.unit_price) && productTokens(item.name).every(w=>productTokens(task.question).includes(w))) return true;
    if (!amounts(answer).includes(item.unit_price)) return false;
    if (requested && Number(requested.qty)>=item.qty) return true;
    // Discovery replies inherit the product category from the original lookup.
    // "Sí hay, tenemos marca Kalley a 250.000" confirms at least one unit,
    // without having to repeat "ventilador de torre" from the question.
    const wanted=productTokens(item.name), supplied=productTokens(answer);
    const subject=productTokens(task.context?.sales_state?.product_interest);
    const explicitAvailability=/\b(si hay|tenemos|disponible|disponibles|hay existencias|hay stock)\b/.test(answer);
    const quantity=answer.match(/\b(?:hay|quedan|disponibles?|existencias?)\s+(\d+|uno|una|dos|tres)\b/) || answer.match(/\b(\d+)\s*(?:unidades?|disponibles?)\b/);
    const stock=quantity ? ({uno:1,una:1,dos:2,tres:3}[quantity[1]]||Number(quantity[1])) : explicitAvailability ? 1 : 0;
    const matchesAnswer=wanted.every(w=>supplied.includes(w));
    const matchesSubject=subject.length>0 && subject.every(w=>wanted.includes(w)) && wanted.every(w=>supplied.includes(w)||subject.includes(w))
      && wanted.some(w=>supplied.includes(w));
    return wanted.length>=2 && (matchesAnswer || matchesSubject) && stock>=item.qty;
  };
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
      const supported = productAnswers.some(t => productSupported(t,item));
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
    if ((fee>0 && amounts(quote.resolution?.answer).includes(fee)) || (fee===0 && /gratis|sin costo|costo cero/.test(fold(quote.resolution?.answer))) || number(quote.resolution?.delivery_fee)===fee) {
      state.delivery_fee = fee; state.delivery_quote_verified = true;
    }
  }
  const operatorText=instruction ? fold(context.customer_message) : '';
  const quotedFee=operatorText.match(/\b(?:domicilio|envio)\s+(?:(?:cuesta|vale|es de|tiene un valor de)\s*)?(?:cop\s*|\$\s*)?(\d[\d.,]*)/)
    || (/domicilio|envio/.test(fold(lastAssistant)) ? operatorText.match(/\b(?:cuesta|vale)\s*(?:cop\s*|\$\s*)?(\d[\d.,]*)/) : null);
  if (quotedFee && state.fulfillment_type==='delivery' && state.delivery_address && state.delivery_zone && !branchChange) {
    state.delivery_fee=Number(quotedFee[1].replace(/[.,]/g,''));state.delivery_quote_verified=true;
    state.delivery_quote_message_id=context.inbound_message_id;
  }
  if (state.fulfillment_type==='pickup') {state.delivery_fee=0;state.delivery_quote_verified=false;}
  const materialChange = itemsChanged || deliveryChanged || methodChanged || branchChange || state.delivery_fee !== number(previous.delivery_fee);
  const paymentTaskType = ['addi','sistecredito'].includes(state.payment_method) ? 'credit_application' : 'payment_verification';
  const paymentTask = tasks.find(t => t.type===paymentTaskType && sameItems(t) && sameDelivery(t) && t.context?.sales_state?.payment_method===state.payment_method && number(t.context?.sales_state?.delivery_fee)===state.delivery_fee);
  const approved = resolutionPositive(paymentTask);
  // Never accept a payment status proposed by the model or a customer's screenshot.
  state.payment_status = !materialChange && previous.payment_verified_task_id && ['verified','approved'].includes(previous.payment_status) ? previous.payment_status : 'pending';
  if (approved && !contextBranchChanged) {
    state.payment_status=paymentTaskType==='payment_verification' ? 'verified':'approved';
    state.payment_verified_task_id=paymentTask.id;
  } else if (materialChange || (paymentTask && !resolutionPositive(paymentTask))) {
    delete state.payment_verified_task_id;
    state.payment_status=paymentTask?.status==='rejected' || negative(paymentTask?.resolution?.answer) ? 'rejected':'pending';
  }
  if (state.payment_method==='cash_prepaid' && state.fulfillment_type==='pickup') state.payment_status='pay_at_store';
  const checkoutSnapshot=JSON.stringify([branch,state.items,state.fulfillment_type,state.delivery_address,state.delivery_zone,state.recipient_name,state.delivery_fee,state.payment_method]);
  const offerSnapshot=JSON.stringify([branch,state.items,state.fulfillment_type,state.delivery_address,state.delivery_zone,state.recipient_name,state.delivery_fee,name]);
  const total=state.items.reduce((sum,x)=>sum+x.qty*(x.unit_price||0),0)+(state.fulfillment_type==='delivery'?(state.delivery_fee||0):0);
  // Accept the customer's answer to our actual checkout question, even when the
  // model forgets its action or places the flag inside sales_state.
  const legacyCheckoutQuestion=/todo esta correcto|confirmas (?:este|el) pedido|resumen/i.test(fold(lastAssistant))
    && amounts(lastAssistant).includes(total) && (state.fulfillment_type==='pickup' || simpleTurn(lastAssistant).includes(simpleTurn(state.delivery_address)));
  const offerAccepted=previous.checkout_offer_snapshot===offerSnapshot && !internal && (yesAnswer.test(simpleTurn(customerText)) || qrChoice || /^(transferencia|addi|sistecredito)$/.test(simpleTurn(customerText)));
  const confirmationQuestion=previous.checkout_snapshot===checkoutSnapshot || legacyCheckoutQuestion;
  const explicitCheckout=/\bconfirmo (el pedido|la compra)\b/.test(customerText) || (/^(si|si confirmo|confirmo|de acuerdo|adelante|correcto|todo correcto|todo esta correcto|esta bien)[.! ]*$/.test(customerText) && confirmationQuestion);
  const historicalCheckout=!materialChange && state.payment_status==='verified' && purchaseMessages.some((m,index)=>{
    if(m.sender_type!=='customer' || !yesAnswer.test(simpleTurn(m.body))) return false;
    const question=purchaseMessages.slice(0,index).filter(x=>x.sender_type==='assistant').at(-1)?.body||'';
    return /crear el pedido|confirmas (?:este|el) pedido/.test(fold(question)) && amounts(question).includes(total);
  });
  state.checkout_confirmed = (!internal && explicitCheckout) || historicalCheckout ? true : !materialChange && previous.checkout_confirmed===true;
  if (materialChange) state.checkout_confirmed=false;
  if (offerAccepted && !itemsChanged && !deliveryChanged && !branchChange) state.checkout_confirmed=true;
  const allowed = new Set(['reply','ask_branch','human_product_lookup','human_delivery_quote','human_payment_verification','human_credit_application','human_general','finalize_order','stop']);
  let action=allowed.has(raw.action) ? raw.action:'reply';
  let reply=text(raw.reply);
  let taskTitle=text(raw.task_title), taskQuestion=text(raw.task_question);
  const request=(nextAction,message,title,question)=>{action=nextAction;reply=message;taskTitle=title;taskQuestion=question;};
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
  const addressReady=state.fulfillment_type==='delivery' && state.delivery_address && state.delivery_zone && state.recipient_name;
  const paymentAttachment=!internal && ['image','document'].includes(context.message_type||payload.message?.type) && state.payment_method==='transfer'
    && (/transferencia|comprobante|pago/.test(customerText) || ((!customerText || /^\[image\]$/.test(customerText)) && (previous.awaiting_payment_proof===true || context.payment_qr?.already_sent===true)) || /env[ií]ame el comprobante/.test(lastAssistant));
  const claimsPayment=(paymentAttachment || /\b(?:ya\s+)?pague\b|\bya pago\b|\bya (?:esta )?pagado\b/.test(customerText)) && !/\bno (?:he )?pag(?:ue|ado)\b/.test(customerText);
  const storePurchase=claimsPayment && /efectivo|local|tienda|sede/.test(customerText);
  const priorCustomerClaims=purchaseMessages.filter(m=>m.sender_type==='customer' && /\bpague\b|\bya pago\b/.test(fold(m.body)) && !/\bno (?:he )?pag(?:ue|ado)\b/.test(fold(m.body)));
  state.store_purchase_reported=previous.store_purchase_reported===true || storePurchase || priorCustomerClaims.some(m=>/efectivo|local|tienda|sede/.test(fold(m.body)));
  state.payment_reported=previous.payment_reported===true || claimsPayment || priorCustomerClaims.length>0;
  const scheduling=/agend|program|salida|despach|franja|prepar|salga a entrega|coordinamos la entrega|pedido (?:creado|registrado|confirmado)/.test(fold([raw.intent,raw.reply,raw.task_title].join(' ')));
  const statusQuestion=/\bya\b|seguro|confirmacion|estado|novedad/.test(customerText);
  // Claiming an action in prose never sends it. Advance a complete delivery quote
  // through the real task action, including after a recipient correction.
  const repeatsRecipient=state.recipient_name && /a nombre de quien|nombre del destinatario|nombre de quien recibe/.test(fold(reply));
  if (['reply','ask_branch'].includes(action) && addressReady && !state.delivery_quote_verified && !state.payment_reported && (repeatsRecipient || /domicilio|envio|cotiz/.test(fold([reply,raw.intent,lastAssistant].join(' '))))) action='human_delivery_quote';
  else if (repeatsRecipient && action==='reply') respond('El destinatario queda registrado como '+state.recipient_name+'. ¿Qué otro dato deseas consultar o corregir?');
  if (['finalize_order','human_delivery_quote','human_payment_verification','human_credit_application'].includes(action) && !state.items_verified) {
    if (action==='human_payment_verification' && state.payment_reported) { /* Verify an existing purchase even if its cart isn't in our catalog. */ }
    else if (state.items.length && branch) {action='human_product_lookup';reply='Voy a confirmar con la sede el precio y la disponibilidad de los productos para darte una cotización correcta.';}
    else respond('¿Qué producto y cantidad te gustaría cotizar?');
  }
  // Resolved product evidence remains valid when collecting delivery details.
  // Override a redundant model request with the next missing checkout step.
  if (action==='human_product_lookup' && state.items_verified && !interestTurn) {
    if (addressReady && !state.delivery_quote_verified) action='human_delivery_quote';
    else respond(!state.fulfillment_type ? '¿Prefieres recoger en la sede o recibir a domicilio?'
      : state.fulfillment_type==='delivery' && !addressReady ? 'Para cotizar el domicilio me falta '+(!state.delivery_address?'la dirección completa':!state.delivery_zone?'el barrio y municipio':'el nombre de quien recibe')+'. ¿Me lo compartes?'
      : 'Los productos y su precio ya están confirmados. ¿Qué deseas consultar para continuar con tu compra?');
  }
  if (action==='human_product_lookup' && state.items.length) {
    taskTitle='Confirmar productos y disponibilidad';
    taskQuestion='Confirmar disponibilidad de: '+state.items.map(x=>x.qty+' × '+x.name+(x.unit_price>0?' a COP '+x.unit_price+' por unidad (confirmar este precio)':' (indicar precio unitario)')).join(', ')+'. Si estos datos son correctos, responder sí; si cambian, indicar la corrección.';
  }
  if (action==='human_delivery_quote') {
    const missing = !state.delivery_address ? 'la dirección completa' : !state.delivery_zone ? 'el barrio y municipio' : !state.recipient_name ? 'el nombre de quien recibe' : '';
    if (missing) respond('Para cotizar el domicilio me falta '+missing+'. ¿Me lo compartes?');
    else if (state.delivery_quote_verified && state.delivery_fee!==null) {
      const total=state.items.reduce((sum,x)=>sum+x.qty*x.unit_price,0)+state.delivery_fee;
      respond('El domicilio confirmado cuesta $'+state.delivery_fee.toLocaleString('es-CO')+'. El total de los productos y el envío es $'+total.toLocaleString('es-CO')+'. '+(!state.payment_method?'¿Prefieres pagar por transferencia, Addi o Sistecrédito?':'¿Confirmas el pedido con esta cotización?'));
    }
    else request('human_delivery_quote','Voy a consultar con la sede el valor del domicilio y te aviso cuando lo confirme.','Cotizar domicilio',
      'Confirmar el valor del domicilio a '+state.delivery_address+', '+state.delivery_zone+', recibe '+state.recipient_name+'. Productos: '+state.items.map(x=>x.qty+' × '+x.name+' a COP '+x.unit_price).join(', ')+'.');
  }
  if (action==='human_payment_verification' && ['addi','sistecredito'].includes(state.payment_method)) action='human_credit_application';
  if (action==='human_credit_application') {
    if (!state.credit_document) respond('¿Cuál es tu número de cédula para consultar la solicitud de crédito?');
    else if (!state.credit_phone) respond('¿Qué celular usaremos para la solicitud de crédito?');
  }
  const ready = Boolean(name && branch && state.items_verified && ['pickup','delivery'].includes(state.fulfillment_type) && (state.fulfillment_type==='pickup' || (state.delivery_address && state.delivery_zone && state.recipient_name && state.delivery_quote_verified && state.delivery_fee!==null)));
  const paymentReady = ['verified','approved','pay_at_store'].includes(state.payment_status);
  if (!context.latest_order && !state.store_purchase_reported && ready && paymentReady && state.checkout_confirmed && ['reply','finalize_order','human_payment_verification','human_credit_application'].includes(action)) action='finalize_order';
  if (action==='finalize_order') {
    if (context.latest_order) respond('Tu pedido '+context.latest_order.order_number+' ya está registrado. ¿Qué necesitas consultar sobre él?');
    else if (!name) respond('¿A nombre de quién registramos el pedido?');
    else if (!ready) respond(!state.fulfillment_type ? '¿Prefieres recoger en la sede o recibir a domicilio?' : 'Antes de confirmar, necesitamos completar los datos y la cotización de entrega.');
    else if (!state.checkout_confirmed) {
      const total=state.items.reduce((sum,x)=>sum+x.qty*x.unit_price,0)+(state.fulfillment_type==='delivery'?state.delivery_fee:0);
      respond('Resumen: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. '+branches.find(b=>b.id===branch)?.name+'. '+(state.fulfillment_type==='pickup'?'Recogida en sede':'Domicilio: '+state.delivery_address)+'. Total: $'+total.toLocaleString('es-CO')+'. ¿Confirmas este pedido?');
    } else if (!paymentReady) {action=['addi','sistecredito'].includes(state.payment_method)?'human_credit_application':'human_payment_verification';reply='El equipo debe confirmar el pago o crédito antes de registrar tu pedido.';}
  }
  if (state.payment_reported && !['verified','approved'].includes(state.payment_status) && (claimsPayment || scheduling || statusQuestion || action==='finalize_order' || /paid|pagado|verified|approved/.test(fold(proposed.payment_status)))) {
    state.payment_status='pending';state.stage='awaiting_payment_verification';
    request('human_payment_verification','Gracias por avisar. Voy a pedir a la sede que verifique el pago'+(state.store_purchase_reported?' de tu compra en el local':'')+'. La entrega todavía no está confirmada.',
      state.store_purchase_reported?'Verificar compra pagada en sede y solicitud de domicilio':'Verificar pago reportado por el cliente',
      'El cliente afirma haber pagado; aún NO está verificado. '+(state.store_purchase_reported?'Revisar compra previa en sede, comprobante o registro de caja y coordinar el domicilio desde Operación si corresponde. No cobrar nuevamente ni duplicar la venta. ':'Revisar comprobante y registro de pago. ')+
      'Productos indicados: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. Destinatario: '+state.recipient_name+'. Dirección: '+state.delivery_address+', '+state.delivery_zone+'.');
  } else if (scheduling && !context.latest_order && action!=='finalize_order' && action!=='human_payment_verification' && !state.store_purchase_reported) {
    // A scheduling promise without an order must be replaced by the missing step.
    if (!state.items_verified && state.items.length) request('human_product_lookup','Primero voy a confirmar con la sede el precio y la disponibilidad de los productos.','Confirmar productos y disponibilidad','Confirmar precio y unidades disponibles de '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'.');
    else if (!state.delivery_quote_verified && addressReady) request('human_delivery_quote','Falta confirmar el domicilio con la sede; voy a solicitar esa revisión.','Cotizar domicilio','Confirmar tarifa y cobertura para '+state.delivery_address+', '+state.delivery_zone+', recibe '+state.recipient_name+'.');
    else if (!paymentReady) respond('La entrega aún no está programada. Primero debemos verificar el pago con la sede.');
    else respond('La entrega aún no está programada. Falta completar la confirmación del pedido.');
  }
  if (state.store_purchase_reported && ['verified','approved'].includes(state.payment_status) && !context.latest_order && (scheduling || action==='finalize_order')) {
    request('human_general','La sede confirmó el pago. Voy a solicitar que Operación revise la programación del domicilio; aún no hay una salida confirmada.',
      'Coordinar domicilio de compra previa verificada','Pago revisado en tarea '+state.payment_verified_task_id+'. Coordinar entrega de compra previa sin duplicar la venta. Destinatario: '+state.recipient_name+'. Dirección: '+state.delivery_address+', '+state.delivery_zone+'. Confirmar programación real en Operación.');
  }
  // Payment approval is separate from creating the order. Ask for the final
  // summary once, then persist; only the DB can announce an order number.
  if (!context.latest_order && !state.store_purchase_reported && ready && paymentReady && !state.checkout_confirmed && action!=='stop' && (approved || scheduling)) {
    state.stage='awaiting_checkout_confirmation';state.checkout_snapshot=checkoutSnapshot;
    respond((state.payment_status==='pay_at_store'?'':'La sede confirmó el pago. ')+'Resumen: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. '+(state.fulfillment_type==='pickup'?'Recogida en sede':'Domicilio: '+state.delivery_address+'; recibe '+state.recipient_name)+'. Total: $'+total.toLocaleString('es-CO')+'. ¿Confirmas este pedido?');
  }
  if (!paymentReady && /pago confirmado|pago verificado|validaron tu comprobante/.test(fold(reply))) respond('El pago todavía está pendiente de verificación por la sede. El pedido aún no está registrado.');
  if (action==='finalize_order') {reply='Voy a registrar tu pedido con los datos confirmados.';state.stage='confirming_order';}
  else if (!context.latest_order && /preparation|preparing|completed/.test(state.stage)) state.stage=paymentReady?'awaiting_checkout_confirmation':'payment';
  // Product discovery comes before checkout data. If no source can list options,
  // create a real lookup once a branch is known, retaining short follow-ups.
  const answeredInterest=productAnswers.some(t=>fold(t.context?.sales_state?.product_interest)===fold(interest) && interest);
  if (interestTurn && inventory.length===0 && !answeredInterest) {
    state.stage='product_discovery';
    request('human_product_lookup',branch
      ? 'Voy a consultar con '+(branches.find(b=>b.id===branch)?.name||context.branch_name||'la sede')+' qué opciones y precios tienen para tu búsqueda. Te comparto la respuesta cuando la confirmen.'
      : 'Puedo consultar disponibilidad y precios de '+interest+'. ¿En cuál sede o zona deseas que lo revise?',
      'Consultar opciones, precio y disponibilidad',
      'El cliente busca: '+interest+'. Confirmar opciones disponibles, variantes, precio y existencias. No hay catálogo confirmado para mostrarle; no solicitar datos de entrega antes de confirmar productos.');
  }
  // Checkout has an explicit order. The model can phrase discovery naturally,
  // but it cannot skip prerequisites or collect them again after taking payment.
  const checkoutFlow=state.items.length>0 && !context.latest_order && !state.store_purchase_reported && action!=='stop'
    && (nameAnswer || confirmedRecipientAsBuyer || recoveredBuyerName || offerAccepted || qrChoice || paymentAttachment || explicitCheckout || itemsChanged || deliveryChanged
      || (internal && ['product_lookup','delivery_quote','payment_verification','credit_application'].includes(payload.task_type))
      || ['human_delivery_quote','human_payment_verification','human_credit_application','finalize_order'].includes(action)
      || /purchase_flow|confirm_create_order|confirm_quantity|product_selected/.test(text(raw.intent)+' '+text(raw.sales_state?.stage)));
  const checkoutSummary=()=> 'Resumen: '+state.items.map(x=>x.qty+' × '+x.name+' a $'+x.unit_price.toLocaleString('es-CO')+' c/u').join(', ')
    +'. '+(branches.find(b=>b.id===branch)?.name||context.branch_name||'')+'. A nombre de '+name+'. '
    +(state.fulfillment_type==='delivery'?'Domicilio: '+state.delivery_address+', '+state.delivery_zone+'; recibe '+state.recipient_name+'. Envío: $'+state.delivery_fee.toLocaleString('es-CO')+'. ':'Recogida en sede. ')
    +'Total: $'+total.toLocaleString('es-CO')+'.';
  if (qrChoice) state.qr_requested=true;
  if (checkoutFlow) {
    if (paymentAttachment && !paymentReady) {
      request('human_payment_verification','Recibí el comprobante. La sede verificará el pago y te confirmaré el pedido cuando lo apruebe.','Verificar transferencia del pedido',
        'Verificar recepción de COP '+total+' para '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. Revisar el comprobante del mensaje '+context.inbound_message_id+'. Responder Validado si el pago está recibido; si no, indicar qué falta.');
    } else if (!state.items_verified && branch) {
      request('human_product_lookup','Voy a confirmar que la sede tenga la cantidad que necesitas antes de continuar.','Confirmar cantidad y precio',
        'Confirmar disponibilidad de: '+state.items.map(x=>x.qty+' × '+x.name+(x.unit_price>0?' a COP '+x.unit_price+' por unidad (confirmar este precio)':' (indicar precio unitario)')).join(', ')+'. Si estos datos son correctos, responder sí; si cambian, indicar la corrección.');
    } else if (state.items_verified && !name) {
      respond(state.recipient_name?'¿El pedido va también a nombre de '+state.recipient_name+'?':'¿A nombre de quién registramos el pedido?');
      state.stage='collecting_customer_name';
    } else if (name && state.items_verified && !state.fulfillment_type) {
      respond('¿Prefieres recoger en la sede o recibir a domicilio?');state.stage='choosing_delivery';
    } else if (name && state.items_verified && state.fulfillment_type==='delivery' && !addressReady) {
      const missing=[!state.delivery_address&&'la dirección completa',!state.delivery_zone&&'el barrio y municipio',!state.recipient_name&&'el nombre de quien recibe'].filter(Boolean);
      respond('Para el domicilio me falta '+missing.join(', ')+'. ¿Me lo compartes?');state.stage='collecting_delivery';
    } else if (name && state.items_verified && state.fulfillment_type==='delivery' && !state.delivery_quote_verified) {
      request('human_delivery_quote','Voy a consultar el valor del domicilio con la sede.','Cotizar domicilio',
        'Confirmar valor del domicilio a '+state.delivery_address+', '+state.delivery_zone+', recibe '+state.recipient_name+'. Productos: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'.');
    } else if (ready && state.checkout_confirmed && paymentReady) {
      action='finalize_order';reply='Voy a registrar tu pedido con los datos confirmados.';state.stage='confirming_order';
    } else if (ready && !state.checkout_confirmed && !state.payment_reported) {
      state.checkout_offer_snapshot=offerSnapshot;state.checkout_snapshot=checkoutSnapshot;state.stage='awaiting_checkout_confirmation';
      respond(checkoutSummary()+' '+(state.payment_method?'¿Confirmas estos datos para continuar con el pago?':'Para confirmar y pagar, elige QR, Addi o Sistecrédito. También puedes corregir algún dato.'));
    } else if (ready && state.checkout_confirmed && !paymentReady && !state.payment_reported) {
      state.stage='awaiting_payment';
      if (!state.payment_method) respond('¿Cómo prefieres pagar: QR, Addi o Sistecrédito?');
      else if (state.payment_method==='transfer') respond('Cuando realices la transferencia, envíame el comprobante para que la sede lo verifique.');
      else if (['addi','sistecredito'].includes(state.payment_method)) {
        if (!state.credit_document) respond('¿Cuál es tu número de cédula para solicitar el crédito?');
        else if (!state.credit_phone) respond('¿Qué celular usaremos para la solicitud de crédito?');
        else action='human_credit_application';
      }
    }
  }
  // Gate every new human request without forcing a menu on ordinary questions.
  if (action.startsWith('human_') && !branch) respond(interestTurn ? 'Puedo consultar disponibilidad y precios de '+interest+'. ¿En cuál sede o zona deseas que lo revise?' : '¿En cuál sede o zona deseas hacer la consulta? Así la reviso con el equipo indicado.');
  const typeByAction={human_product_lookup:'product_lookup',human_delivery_quote:'delivery_quote',human_payment_verification:'payment_verification',human_credit_application:'credit_application',human_general:'general'};
  if (action.startsWith('human_') && (context.pending_human_tasks||[]).some(t=>t.type===typeByAction[action] && (!t.branch_id || t.branch_id===branch))) {
    respond(action==='human_payment_verification' ? 'La verificación del pago sigue pendiente con la sede; la entrega todavía no está confirmada.' : 'La solicitud ya está registrada y sigue pendiente de respuesta de la sede. Conservé los nuevos datos.');
  }
  if (!interestTurn && state.payment_method==='cash_prepaid' && state.fulfillment_type==='delivery' && !state.store_purchase_reported) {state.payment_method='';state.payment_status='pending';respond('El pago en la sede aplica para recogida. Para domicilio puedes usar transferencia, Addi o Sistecrédito. ¿Cuál prefieres?');}
  if (context.delivery_open===false && (action==='human_delivery_quote' || (action==='finalize_order' && state.fulfillment_type==='delivery'))) respond('Los domicilios se gestionan hasta las 7:00 p. m. Podemos continuar al abrir a las 9:00 a. m. o revisar recogida en sede.');
  const authorizedPendingQr=previous.qr_requested===true && state.checkout_confirmed && !previous.awaiting_payment_proof;
  let sendQr = (!interestTurn || checkoutFlow) && (raw.request_qr===true || qrChoice || authorizedPendingQr) && Boolean(context.payment_qr?.available) && !contextBranchChanged && state.payment_method==='transfer' && !['verified','approved'].includes(state.payment_status) && action!=='stop';
  if (sendQr && !/(\bqr\b|transferencia|codigo)/.test(customerText) && !instruction && !authorizedPendingQr) sendQr=false;
  if (state.items.length && (!ready || !state.checkout_confirmed)) sendQr=false;
  if (sendQr) {state.awaiting_payment_proof=true;state.qr_requested=false;}
  if (sendQr) {reply='Te comparto el QR de '+context.branch_name+'. Cuando hagas la transferencia, envíame el comprobante para que el equipo lo verifique.';}
  if (context.service_open===false && !instruction && !(internal && context.operator_confirmation)) {respond('En este momento no hay atención. Volvemos a las 9:00 a. m.; conservamos tu consulta para continuar.');sendQr=false;}
  if (raw.action==='stop' && !interestTurn) {action='stop';reply='Entendido. Gracias por escribirnos; quedamos a tu disposición cuando lo necesites.';sendQr=false;}
  const summary='Interés actual: '+state.product_interest+'. Carrito: '+state.items.map(x=>x.qty+' × '+x.name).join(', ')+'. Productos verificados: '+state.items_verified+'. Entrega: '+state.fulfillment_type+'; destinatario: '+state.recipient_name+'; dirección: '+state.delivery_address+', '+state.delivery_zone+'. Domicilio: '+(state.delivery_quote_verified?state.delivery_fee:'sin confirmar')+'. Pago: '+state.payment_status+(state.payment_reported?' (reportado por cliente)':'')+'. Pedido registrado: '+(context.latest_order?.order_number||'no')+'. Acción de este turno: '+action+'.';
  return {...context, ai:{intent:text(raw.intent||'general').slice(0,80),action,branch_id:branch||'',branch_change_confirmed:branchChange,customer_name:name,reply:reply.slice(0,1500),summary:summary.slice(0,1000),task_title:text(taskTitle||'Consulta de WhatsApp para la sede').slice(0,180),task_question:text(taskQuestion||context.customer_message||'Revisar los datos de la conversación.').slice(0,1200),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0)),sales_state:state,send_qr:sendQr,reset_purchase:false}};
}
