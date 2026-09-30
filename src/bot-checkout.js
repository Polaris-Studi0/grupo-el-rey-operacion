// Read unambiguous checkout replies from the customer's own words. The model
// still handles questions and compound requests; it does not need to interpret
// a phone number or decide whether an explicit buyer name is a recipient name.
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function personName(value){
  const name=value.trim().replace(/[,\s]+(?:porfa|por favor|gracias)[.!]*$/i,'').replace(/[.!]+$/,'').trim();
  if(!/^[\p{L}][\p{L}\p{M}'’ -]{0,79}$/u.test(name)||name.split(/\s+/).length>7)return null;
  if(/\b(?:hola|si|no|gracias|listo|bueno|domicilio|recoger|precio|cuanto|quiero|tienen|cancel\w*|pagar|disfraz|pedido|prefiero|necesito|ayuda|continu\w*)\b/.test(normalize(name))||/^(?:de acuerdo|por supuesto|esta bien|buenos dias|buenas tardes)$/.test(normalize(name)))return null;
  return name;
}
function explicitFields(message){
  if(message.kind!=='text')return {};
  const value=message.text?.trim()||'',n=normalize(value),patch={};
  if(/^(?:a domicilio|domicilio|lo quiero a domicilio|envio a domicilio)[.!]?$/.test(n))patch.fulfillment_type='delivery';
  if(/^(?:lo recojo(?: en la sede)?|recogida(?: en sede)?|recoger(?: en la sede)?)[.!]?$/.test(n))patch.fulfillment_type='pickup';
  const buyer=/^(?:a nombre de|mi nombre es|me llamo)\s+(.+)$/i.exec(value);
  if(buyer){const name=personName(buyer[1]);if(name)patch.customer_name=name;}
  const recipient=/^(?:recibe|lo recibe|quien recibe es)\s+(.+)$/i.exec(value);
  if(recipient){const name=personName(recipient[1]);if(name)patch.recipient_name=name;}
  const phone=value.replace(/^(?:(?:mi|el) (?:tel[eé]fono|n[uú]mero)(?: (?:de contacto|para el env[ií]o))?(?: es)?\s*:?\s*)/i,'');
  if(/^\+?[\d ()-]+$/.test(phone)){
    const digits=phone.replace(/\D/g,'');
    if(/^(?:57)?3\d{9}$/.test(digits))patch.recipient_phone=digits;
  }
  return patch;
}
export function recoveredCheckoutFields(context){
  const s=context.snapshot,cart=s.checkout||{};
  if(!['collecting','stock_review'].includes(cart.stage)||!(cart.pending_selection||cart.cart?.length))return {};
  const patch={};
  // Recover only explicit missing fields in the current quotation's customer
  // messages. Never read the profile name or an older/foreign purchase.
  for(const m of s.checkout_inputs||[]){
    if(m.id===s.message.id)continue;
    for(const [key,value] of Object.entries(explicitFields(m)))if(!cart[key])patch[key]=value;
  }
  return patch;
}
export function checkoutReply(context){
  const s=context.snapshot,cart=s.checkout||{};
  if(!['collecting','stock_review'].includes(cart.stage)||!(cart.pending_selection||cart.cart?.length))return null;
  const patch=recoveredCheckoutFields(context);
  const current=explicitFields(s.message);
  const lastAssistant=[...(s.history||[])].reverse().find(m=>m.role==='assistant')?.text||'';
  if(!Object.keys(current).length&&s.message.kind==='text'){
    const expected=/a nombre de qui[eé]n|cu[aá]l es tu nombre|c[oó]mo te llamas/i.test(lastAssistant)?'customer_name':/qui[eé]n recibe|nombre de quien recibe/i.test(lastAssistant)?'recipient_name':null;
    const name=expected&&personName(s.message.text||'');
    const looksLikeName=name&&name.split(/\s+/).every(word=>/^(?:\p{Lu}[\p{L}\p{M}'’-]*|de|del|la|las|los|y)$/u.test(word));
    if(looksLikeName&&normalize(name).replace(/\s/g,'')!==normalize(cart.pending_selection?.name).replace(/\s/g,''))current[expected]=name;
  }
  if(!Object.keys(current).length&&!(Object.keys(patch).length&&/^(?:contin[uú]a|continuar|continuemos|sigamos|listo)[.!]?$/i.test(s.message.text?.trim()||'')))return null;
  Object.assign(patch,current);
  return {intent:'checkout',reply_text:'Continuemos con los datos de tu compra.',checkout:patch,confirmed_item:null,actions:[],accept_summary:false,cancel_cart:false};
}
