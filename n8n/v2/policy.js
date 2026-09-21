// Business boundaries, not a sales script. The model chooses the conversational
// intent; this module never guesses it from keywords in customer messages.
export function openingHours(iso) {
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime()))throw new Error('Invalid clock');
  const local=new Date(date.getTime()-5*3600000);
  const minute=local.getUTCHours()*60+local.getUTCMinutes();
  const next=new Date(local);
  next.setUTCHours(9,0,0,0);
  if(minute>=1200)next.setUTCDate(next.getUTCDate()+1);
  return {serviceOpen:minute>=540&&minute<1200,deliveryOpen:minute>=540&&minute<1140,
    nextOpening:new Date(next.getTime()+5*3600000).toISOString()};
}

export function landingMetadata(body,branches) {
  const text=String(body||'');
  const tags=Object.fromEntries([...text.matchAll(/\[(ORIGEN|SEDE|METODO_SELECCION):([^\]\r\n]{1,100})\]/g)].map(m=>[m[1],m[2].trim()]));
  // A tag expresses a customer's selection, never an authorization or instruction.
  const branch=branches.find(b=>b.active!==false&&b.web_slug===tags.SEDE);
  return {source:tags.ORIGEN==='WEB'?'web':'whatsapp',branch_id:branch?.id||null,
    selection_method:['MANUAL','CERCANIA'].includes(tags.METODO_SELECCION)?tags.METODO_SELECCION:null,
    initial_message:text,query:text.replace(/\[(ORIGEN|SEDE|METODO_SELECCION):[^\]]*\]/g,'').trim()};
}

export function reminderEligibility(c,now) {
  const clock=openingHours(now);
  const current=Date.parse(now),last=Date.parse(c.last_customer_at||''),asked=Date.parse(c.awaiting_since||'');
  return Boolean(clock.serviceOpen&&c.enabled&&c.consent_status==='granted'&&!c.automation_paused
    &&c.status!=='closed'&&!c.order_exists&&!c.pending_human_tasks&&c.waiting_for==='customer'
    &&Number.isFinite(last)&&Number.isFinite(asked)&&asked>=last&&current-asked>=30*60000
    &&current-last<24*3600000&&!c.reminder_sent);
}

export function quoteFingerprint(branch,name,s) {
  return JSON.stringify([branch,name,s.items||[],s.fulfillment_type||'',s.delivery_address||'',s.delivery_zone||'',s.recipient_name||'',s.delivery_fee??null]);
}

export function decideTurn(context,proposal={}) {
  const clone=v=>JSON.parse(JSON.stringify(v));
  const old=clone(context.sales_state||{}),state=clone(old);
  const fields=['fulfillment_type','delivery_address','delivery_zone','recipient_name','payment_method','product_interest','customer_notes'];
  const result={action:'reply',reply:String(proposal.reply||'').trim(),branch_id:context.branch_id||'',
    customer_name:context.preferred_name||'',sales_state:state,send_qr:false,waiting_for:proposal.waiting_for==='customer'?'customer':'none',
    task_title:'',task_question:'',confidence:1,intent:proposal.intent||'general',policy_version:'conversational-v2'};
  const reject=(message)=>{result.action='reply';result.reply=message;result.send_qr=false;return result;};
  const human=(kind,question)=>{result.action='human_'+kind;result.task_title='Consulta '+kind.replaceAll('_',' ');
    result.task_question=String(question||context.customer_message||'Solicitud de ayuda').slice(0,3000);
    result.waiting_for='team';result.reply='Voy a consultar con el equipo para darte una respuesta confirmada.';return result;};
  if(context.automation_paused||context.consent_status!=='granted')return {...result,action:'silent',reply:'',waiting_for:'none'};
  if(proposal.action==='stop')return {...result,action:'stop',reply:'Entendido. No enviaremos más mensajes automáticos.',waiting_for:'none'};
  if(!context.service_open)return {...result,action:'defer',reply:'',waiting_for:'opening'};
  if(proposal.name_confirmed&&typeof proposal.customer_name==='string'&&proposal.customer_name.trim()) {
    result.customer_name=proposal.customer_name.trim().slice(0,120);result.name_confirmed=true;
  }
  if(!context.name_confirmed_at&&!result.name_confirmed)return reject('Para atenderte, ¿cómo te llamas?');
  const selected=(context.branches||[]).find(b=>b.id===proposal.branch_id&&b.active!==false);
  if(selected&&proposal.branch_selected&&!context.latest_order) {
    result.branch_id=selected.id;result.branch_change_confirmed=selected.id!==context.branch_id;
    if(result.branch_change_confirmed) {
      state.items=[];state.items_verified=false;state.offered_products=[];state.delivery_fee=null;
      state.delivery_quote_verified=false;state.payment_status='pending';state.checkout_confirmed=false;
      delete state.quote_fingerprint;delete state.payment_verified_task_id;
    }
  }
  if(!result.branch_id)return reject('Estas son nuestras sedes:\n'+(context.branches||[]).filter(b=>b.active!==false).map(b=>'• '+b.name).join('\n')+'\n\n¿En cuál deseas hacer tu consulta?');
  const sameBranch=result.branch_id===context.branch_id;
  if(context.latest_order) {
    if(proposal.action==='change_order'||proposal.action==='create_order'||proposal.action==='select_products')return human('general','Pedido '+context.latest_order.order_number+': '+context.customer_message);
    if(proposal.action==='track_order') {
      const o=context.latest_order,status={preparing:'en preparación',ready:'listo',dispatched:'en camino',delivered:'entregado',cancelled:'cancelado'}[o.status]||'registrado';
      const eta=Date.parse(o.promised_at||''),now=Date.parse(context.now);
      if(o.fulfillment_type==='delivery'&&!['delivered','cancelled'].includes(o.status)&&(!Number.isFinite(eta)||eta<=now))return human('general','Confirmar hora de llegada del pedido '+o.order_number+'. '+context.customer_message);
      result.reply='Tu pedido '+o.order_number+' está '+status+'.'+(Number.isFinite(eta)&&eta>now?' La llegada estimada es '+new Date(eta).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'})+'.':'');
      return result;
    }
  }
  for(const f of fields)if(typeof proposal.details?.[f]==='string')state[f]=proposal.details[f].trim().slice(0,600);
  if(proposal.action==='clear_cart') {
    if(context.latest_order)return human('general','Solicitud de cancelación del pedido '+context.latest_order.order_number);
    for(const key of Object.keys(state))delete state[key];
    state.items=[];result.reset_purchase=true;return result;
  }
  if(proposal.action==='select_products') {
    if(!sameBranch)return reject('Continuamos en '+selected.name+'. Voy a consultar las opciones de esa sede.');
    const sources=[...(context.inventory||[]).map(p=>({...p,source_id:p.product_id,unit_price:p.price})),
      ...(old.offered_products||[]).filter(p=>p.branch_id===result.branch_id).map(p=>({...p,source_id:p.id,product_id:''}))];
    const selections=proposal.selections||[];
    if(!selections.length)return reject('¿Qué producto y cantidad deseas?');
    const items=[];
    for(const entry of selections) {
      const source=sources.find(p=>p.source_id===entry.source_id);
      if(!source||!Number.isSafeInteger(entry.qty)||entry.qty<1||!Number.isSafeInteger(source.unit_price)||source.unit_price<0
        ||(Number.isFinite(source.available_qty)&&entry.qty>source.available_qty))return human('product_lookup','Confirmar la selección solicitada: '+context.customer_message);
      const duplicate=items.find(p=>p.product_id===(source.product_id||'')&&p.name===source.name);
      if(duplicate)return reject('La selección contiene el mismo producto dos veces; necesito la cantidad total.');
      items.push({product_id:source.product_id||'',name:source.name,qty:entry.qty,unit_price:source.unit_price});
    }
    state.items=items;state.items_verified=true;
  }
  const material=quoteFingerprint(result.branch_id,result.customer_name,state)!==quoteFingerprint(context.branch_id,context.preferred_name,old);
  if(material) {state.checkout_confirmed=false;state.payment_status='pending';delete state.payment_verified_task_id;delete state.quote_fingerprint;}
  const deliveryChanged=['delivery_address','delivery_zone','fulfillment_type'].some(k=>(old[k]||'')!==(state[k]||''));
  if(deliveryChanged) {state.delivery_fee=null;state.delivery_quote_verified=false;}
  if(state.fulfillment_type==='pickup'){state.delivery_fee=0;state.delivery_quote_verified=false;}
  const ready=Boolean(state.items?.length&&state.items_verified&&result.customer_name&&result.branch_id
    &&(state.fulfillment_type==='pickup'||(state.fulfillment_type==='delivery'&&state.delivery_address&&state.delivery_zone&&state.recipient_name&&state.delivery_quote_verified&&Number.isSafeInteger(state.delivery_fee))));
  const total=(state.items||[]).reduce((sum,i)=>sum+i.qty*i.unit_price,0)+(state.delivery_fee||0);
  if(proposal.action==='quote') {
    if(!ready)return reject('Para darte el total confirmado todavía debemos completar los datos o verificaciones de esta compra.');
    state.quote_fingerprint=quoteFingerprint(result.branch_id,result.customer_name,state);
    result.reply='Tu compra: '+state.items.map(p=>p.qty+' × '+p.name+' — $'+(p.qty*p.unit_price).toLocaleString('es-CO')).join('; ')
      +'. '+(state.fulfillment_type==='delivery'?'Domicilio: $'+state.delivery_fee.toLocaleString('es-CO')+'. ':'Recogida en sede. ')
      +'Total: $'+total.toLocaleString('es-CO')+'. ¿Cómo prefieres pagar: QR, Addi o Sistecrédito?';
    result.waiting_for='customer';return result;
  }
  if(proposal.accept_quote&&ready&&old.quote_fingerprint===quoteFingerprint(result.branch_id,result.customer_name,state))state.checkout_confirmed=true;
  if(proposal.action==='send_qr') {
    if(!ready||!state.checkout_confirmed)return reject('Primero necesitamos tener el resumen completo y tu aceptación para enviarte el QR de esta compra.');
    if(!context.payment_qr?.available||!sameBranch)return human('general','Falta el QR oficial de la sede para esta compra.');
    state.payment_method='transfer';state.awaiting_payment_proof=true;result.send_qr=true;
    result.reply='Te comparto el QR de la sede. Cuando pagues, envía el comprobante por aquí para verificarlo.';result.waiting_for='customer';return result;
  }
  if(proposal.action==='report_payment') {
    if(!state.items?.length)return human('payment_verification','Revisar pago reportado por el cliente: '+context.customer_message);
    state.payment_reported=true;state.payment_status='pending';return human('payment_verification','Verificar pago por $'+total.toLocaleString('es-CO')+'. '+context.customer_message);
  }
  if(proposal.action==='create_order') {
    if(!ready||!state.checkout_confirmed)return reject('Aún falta completar o aceptar el resumen de esta compra.');
    if(state.fulfillment_type==='delivery'&&!context.delivery_open)return human('general','Coordinar entrega en la siguiente ventana de domicilios; no despachar después de las 7 p. m.');
    // Only persisted, scoped operator evidence can authorize a payment.
    const task=(context.human_tasks||[]).find(t=>t.status==='resolved'&&t.branch_id===result.branch_id
      &&['payment_verification','credit_application'].includes(t.type)&&t.resolution?.approved===true
      &&quoteFingerprint(t.branch_id,result.customer_name,t.context?.sales_state||{})===quoteFingerprint(result.branch_id,result.customer_name,state)
      &&t.context?.sales_state?.payment_method===state.payment_method);
    if(!task&&!(state.payment_method==='cash_prepaid'&&state.fulfillment_type==='pickup'))return human('payment_verification','Verificar el pago antes de registrar esta compra.');
    state.payment_status=task?'verified':'pay_at_store';if(task)state.payment_verified_task_id=task.id;
    result.action='finalize_order';result.reply='Voy a registrar tu pedido con los datos confirmados.';result.waiting_for='none';return result;
  }
  if(proposal.action==='ask_team')return human(['product_lookup','delivery_quote','payment_verification','credit_application','general'].includes(proposal.task_type)?proposal.task_type:'general',proposal.question);
  if(proposal.action==='request_image') {result.request_image_id=proposal.image_id||null;return result;}
  if(!result.reply)return human('general','No fue posible preparar una respuesta. Consulta: '+context.customer_message);
  return result;
}
