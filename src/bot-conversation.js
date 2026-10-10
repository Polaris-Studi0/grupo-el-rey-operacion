const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const greeting=/^(?:hola|holi|hey|buenos dias|buenas tardes|buenas noches|buenas)(?: (?:hola|buenos dias|buenas tardes|buenas noches|como estas))*$/;
const courtesy=/^(?:ok(?:ay)?|dale+|listo|perfecto|gracias+|muchas gracias+|mil gracias|quedo (?:atento|atenta|pendiente)|por favor gracias)(?: (?:ok(?:ay)?|dale+|listo|perfecto|gracias+|muchas gracias+|por (?:su|tu) (?:atencion|ayuda)|muy amable|quedo (?:atento|atenta|pendiente)))*$/;
export const isGreeting=body=>greeting.test(normalize(body));
export const isBranchArrival=body=>/\[SEDE:/i.test(body||'')||/^hola[,\s]+quiero comunicarme con la sede\b/i.test(String(body||'').trim());
export function isPendingPriceQuestion(text,tasks){
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return /^(?:y )?(?:(?:el )?precio|cuanto (?:vale|cuesta|sale))(?: porfa| por favor)?$/.test(norm(text))&&!!tasks?.some(t=>/\bprecio\b|cuanto (?:vale|cuesta)|\bvalor\b/.test(norm(t.question)));
}
export function verifiedPriceReply(s,now=Date.now()){
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const q=norm(s.onboarding_request||s.message.text),shopping=s.checkout||{};
  if(s.message.kind!=='text'||s.human_resolution||(shopping.cart?.length||shopping.pending_selection)&&!['ordered','cancelled'].includes(shopping.stage))return null;
  if(!/(?:cuanto (?:cuesta|vale|sale)|(?:que|cual) (?:es el )?precio|(?:y el |el )?precio(?: de| del| tiene| para|$))/.test(q)||/\b(?:dame|deme|comprar|comprarlo|comprarlos|me llevo|agrega|pedido|foto|imagen|horario|direccion|talla|color|garantia|envio|domicilio|[2-9]|[1-9]\d|dos|tres|cuatro|cinco)\b|\b(?:quiero|necesito)(?! saber\b)/.test(q))return null;
  const matches=(s.products||[]).filter(p=>p.branch_id===s.branch.id&&norm(p.name).length>=4&&(' '+q+' ').includes(' '+norm(p.name)+' ')&&p.active&&p.stock_verified&&p.available_quantity>0&&Number.isSafeInteger(p.price_cop)&&p.price_cop>=0&&Date.parse(p.stock_valid_until)>now&&(!p.offer_starts_at||Date.parse(p.offer_starts_at)<=now)&&(!p.offer_ends_at||Date.parse(p.offer_ends_at)>now));
  if(matches.length!==1)return null;
  const p=matches[0],words=new Set('cuanto cuesta cuestan vale valen sale salen que cual es el la los las un una precio de del tiene y me dices das puedes podrias por favor porfa hola gracias quiero saber necesito'.split(' '));
  if(q.replace(norm(p.name),' ').split(' ').filter(Boolean).some(w=>!words.has(w)))return null;
  return {intent:'discovery',reply_text:'El '+p.name+' cuesta $'+p.price_cop.toLocaleString('es-CO')+' por unidad. ¿Te gustaría comprarlo?',offered_product_ids:[p.id],actions:[],checkout:{}};
}
export function onboardingRequest(history,current=''){
  // A branch name and a question can arrive together in the same message.
  if(/[?¿]/.test(current)||/\b(?:tienen|venden|busco|necesito|cuanto|precio|horario|informacion|pedido|producto)\b/.test(normalize(current)))return String(current).trim().slice(0,2000);
  // Only the intake before any substantive reply. Never revive an old enquiry.
  const messages=[...history].reverse();
  for(const m of messages){
    if(m.role!=='customer'){
      if(!/Soy el asistente virtual|Responde S[IÍ]|¿En cuál sede te atendemos|\[aviso privacidad\]/i.test(m.text||''))return '';
      continue;
    }
    const text=normalize(m.text);
    if(isGreeting(m.text)||isBranchArrival(m.text)||courtesy.test(text)||/^(?:si|si acepto|acepto|autorizo|\d{1,2})$/.test(text))continue;
    if(text.length>5)return String(m.text).trim().slice(0,2000);
  }
  return '';
}
export function socialReply(context){
  const s=context.snapshot;
  if(s.message.kind!=='text'||s.human_resolution)return null;
  const shopping=s.checkout||{};
  if((shopping.cart?.length||shopping.pending_selection)&&!['ordered','cancelled'].includes(shopping.stage))return null;
  const text=normalize(s.message.text),pending=!!s.pending_tasks?.length;
  const waiting=pending&&/^(?:y entonces|alguna (?:respuesta|novedad)|aun espero|sigo esperando|(?:pero )?no (?:demores|tardes) tanto|que paso|ya tienes (?:la )?respuesta)$/.test(text);
  const pricePending=isPendingPriceQuestion(s.message.text,s.pending_tasks);
  if(!greeting.test(text)&&!courtesy.test(text)&&!waiting&&!pricePending)return null;
  const reply=pending?'Estoy pendiente de la confirmación de tu consulta. Te respondo por aquí cuando la tenga.':greeting.test(text)?'¡Hola! ¿En qué te puedo ayudar?':'¡Con gusto! Aquí estamos si necesitas algo más.';
  return {intent:'clarification',reply_text:reply,actions:[],checkout:{}};
}
export function fallbackQuestion(snapshot){
  const recent=[...(snapshot.history||[]).filter(m=>m.role==='customer').slice(-3).map(m=>m.text),snapshot.message.text].filter(t=>t&&!isGreeting(t)&&!courtesy.test(normalize(t)));
  const detail=recent.join(' | ').slice(-650);
  return 'Revisar la consulta del cliente: '+detail+(snapshot.message.attachment?' (Adjunto recibido; revisar la imagen o archivo de esta conversación sin asumir su contenido.)':'');
}
export function naturalResolutionText(generated,answer){
  let value=String(generated||'').trim();
  // Preserve a question supplied by the operator (e.g. delivery or pickup).
  // Remove an invented invitation as a whole clause, including its pronouns.
  if(!/[?¿]/.test(answer))value=value.replace(/\s*(?:¿\s*(?:(?:Lo|La|Los|Las|Te)\s+)?(?:Quieres|Deseas|Prefieres|Gustaría)\b|¿\s*Te gustaría\b|(?:Si quieres|Si lo deseas|Si\s+(?:puedo|podemos)|(?:Puedo|Podemos))\s+(?:consultar|verificar|confirmar|preguntar|ayudar|pedir|buscar)|¿\s*(?:Lo|La|Los|Las|Te)\s*$)[\s\S]*$/i,'').trim();
  value=value.replace(/([.!?])\s+(?:Si|¿(?:Lo|La|Los|Las|Te))\s*$/i,'$1').trim();
  return value||String(answer).trim();
}
