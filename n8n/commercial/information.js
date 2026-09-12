// Public store information is independent of checkout, pending tasks and model availability.
// Null means the conversational model must interpret the message.
export function resolveStoreInformation(context, interpretation={}) {
  if (context.current_sender_type!=='customer') return null;
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const input=fold(context.customer_message).replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  if (!input || /\b(?:no me escriban|no mas mensajes|no quiero recibir|dejen de escribirme)\b/.test(input)) return null;
  const branches=(context.branches||[]).filter(b=>b.active!==false);
  const selection=context.branch_id && context.stored_branch_id!==undefined && context.branch_id!==context.stored_branch_id;
  const hours=/\b(?:horario|horarios|abren|cierran|abierto|abiertos|apertura|cierre|atienden)\b/.test(input);
  const places=/\b(?:sedes?|sucursales?|tiendas?|locales|puntos de venta|almacenes)\b/.test(input);
  const wantsList=/\b(?:consultar|conocer|saber|ver|mostrar|muestra\w*|dime|digan|digas|lista|listado|cuales|cuantas|donde|ubicaciones|ubicados|direccion|direcciones)\b/.test(input)
    || /\b(?:que sedes|que tiendas|que sucursales|sedes que|tiendas que|sedes tienen|sedes hay)\b/.test(input);
  const productQuestion=/\b(?:producto|productos|precio|precios|stock|inventario|disponibilidad|comprar|venden)\b/.test(input);
  const asksList=!selection && !hours && ((places && wantsList && !productQuestion) || interpretation.response_topic==='branch_list');
  const asksHours=hours && !/\b(?:entrega|pedido|domicilio|recoger|recogida)\b/.test(input);
  let reply='',topic='';
  if (asksList && branches.length) {
    topic='branch_list';
    reply='Estas son nuestras sedes:\n'+branches.map(b=>'• '+b.name).join('\n')+'\n\n¿Cuál te queda mejor? Puedes decirme su nombre o tu zona.';
  } else if (asksHours) {
    const now=Date.parse(context.current_message_created_at||'')||Date.now();
    // Never infer opening hours from a testing flag or a stale/cross-branch entry.
    const knowledge=(context.knowledge||[]).filter(k=>
      (k.category==='hours' || k.category==='schedule' || /horario/.test(fold(k.title)))
      && k.active!==false && (!k.branch_id||k.branch_id===(context.stored_branch_id||context.branch_id))
      && (!k.valid_from||Date.parse(k.valid_from)<=now) && (!k.valid_until||Date.parse(k.valid_until)>now)
      && typeof k.content==='string' && k.content.trim());
    if (knowledge.length) {
      topic='store_information';
      reply=knowledge.map(k=>k.title+': '+k.content.trim()).join('\n').slice(0,1400);
    }
  }
  if (!reply) return null;
  return {intent:topic,action:'reply',branch_id:context.stored_branch_id||context.branch_id||'',branch_change_confirmed:false,
    customer_name:context.preferred_name||'',reply,summary:'Pregunta actual: '+String(context.customer_message||'').slice(0,400)+'. Se respondió con información de la tienda.',
    task_title:'',task_question:'',confidence:1,sales_state:{...(context.sales_state||{})},send_qr:false,reset_purchase:false};
}
