export const BUSINESS_CATEGORIES_ID='58b54750-c012-4ae0-a890-2febce5eaa1c';
export function businessOverviewReply(context){
  const message=context.snapshot.message;
  if(message.kind!=='text')return null;
  const text=String(message.text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  // Only a general question about the store. Specific brands, prices and stock
  // must still use the catalogue or a human-confirmed answer.
  if(!/^(?:y )?(?:que venden(?: (?:alla|alli|ahi|aqui|ustedes|en (?:esa|esta|la) sede))?|que (?:productos|cosas|tipo de productos|clase de productos) (?:venden|manejan|ofrecen)(?: (?:alla|alli|ahi|aqui|ustedes))?|que puedo comprar(?: (?:alla|alli|ahi|aqui))?)$/.test(text))return null;
  const fact=context.snapshot.information.find(info=>info.id===BUSINESS_CATEGORIES_ID);
  if(!fact?.text?.trim())return null;
  return {intent:'information',reply_text:fact.text.split('\n')[0].trim()+' ¿Buscas algo en particular?',actions:[],checkout:{}};
}
// Keep a five-minute transport margin inside Meta's 24-hour window.
export const OWNER_REPLY_WINDOW_MS=(24*60-5)*60*1000;
