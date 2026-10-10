import test from 'node:test';
import assert from 'node:assert/strict';
import {socialReply,verifiedPriceReply,onboardingRequest,isBranchArrival,fallbackQuestion,naturalResolutionText} from '../src/bot-conversation.js';
const context=text=>({snapshot:{message:{text,kind:'text'},checkout:{},pending_tasks:[{id:'pending',question:'Confirmar precio y disponibilidad de un artículo'}]}});
test('an exact verified price answers the enquiry without starting a cart; ambiguity, stale stock and compound requests stay with the model',()=>{
 const now=Date.now(),s={message:{text:'7',kind:'text'},onboarding_request:'¿Cuánto cuesta el artículo de prueba?',branch:{id:'b1'},products:[{id:'one',branch_id:'b1',name:'Artículo de prueba',price_cop:50000,available_quantity:2,active:true,stock_verified:true,stock_valid_until:new Date(now+60000).toISOString()}]};
 const d=verifiedPriceReply(s,now);assert.match(d.reply_text,/50.000/);assert.deepEqual(d.actions,[]);assert.deepEqual(d.offered_product_ids,['one']);
 for(const question of ['Quiero comprar el artículo de prueba','¿Cuánto cuesta el artículo de prueba y me envías una foto?','¿Cuánto cuesta el artículo de prueba a domicilio?','¿Cuánto cuesta el artículo de prueba y de qué material está hecho?'])assert.equal(verifiedPriceReply({...s,onboarding_request:question},now),null);
 assert.equal(verifiedPriceReply({...s,products:[...s.products,...s.products]},now),null);assert.equal(verifiedPriceReply(s,now+60001),null);
});
test('courtesy and waiting messages keep the pending enquiry without another task; a real follow-up still reaches the model',()=>{
 for(const text of ['ok','Daleee','Muchas gracias por su atención muy amable','Quedo atento','pero no demores tanto','¿Y el precio?']){const d=socialReply(context(text));assert.ok(d,text);assert.equal(d.actions.length,0);assert.match(d.reply_text,/confirmación/);assert.doesNotMatch(d.reply_text,/en breve|respondo rápido|¿/);}
 for(const text of ['ok, y el precio de otro producto?','gracias, quiero dos','Si señora','Me gusta','Quisiera un inflador','Por favor confirmar talla'])assert.equal(socialReply(context(text)),null,text);
 const c=context('ok');c.snapshot.checkout={stage:'payment',cart:[{product_id:'one',qty:1}]};assert.equal(socialReply(c),null,'do not consume checkout acceptance');
 c.snapshot.message.kind='image';assert.equal(socialReply(c),null);
 const availability=context('¿Y el precio?');availability.snapshot.pending_tasks[0].question='Confirmar disponibilidad';assert.equal(socialReply(availability),null,'a price missing from the pending request needs to be handled');
});
test('intake preserves a product question through consent and branch selection but never revives an answered enquiry',()=>{
 const h=[{role:'customer',text:'Hola, ¿cuánto vale el champú de prueba?'},{role:'assistant',text:'Soy el asistente virtual. Responde SÍ o ACEPTO'},{role:'customer',text:'Acepto'},{role:'assistant',text:'¿En cuál sede te atendemos?' }];
 assert.match(onboardingRequest(h),/champú/);
 assert.equal(onboardingRequest([...h,{role:'assistant',text:'Ya te confirmé el precio.'}]),'');
 assert.equal(onboardingRequest([{role:'customer',text:'Hola, quiero comunicarme con la sede La Estrella.'}]),'');
 assert.equal(isBranchArrival('Domicilio en el barrio Floresta'),false);
 assert.equal(onboardingRequest([],'¿Tienen champú en Aures?'),'¿Tienen champú en Aures?');
 assert.equal(onboardingRequest([],'En la de Aures'), '');
});
test('natural clarification removes entire invented invitations and dangling tails while preserving the operator question',()=>{
 for(const tail of ['¿Lo quieres a domicilio?','¿Lo prefieres a domicilio?','¿Te gustaría comprarlo?','Si puedo consultar algo más, dime.','Si']){
  assert.equal(naturalResolutionText('Cuesta $72.000. '+tail,'Precio $72.000'),'Cuesta $72.000.',tail);
 }
 const answer='Sí, está disponible. ¿Lo necesitas a domicilio o para recoger?';assert.equal(naturalResolutionText(answer,answer),answer);
 assert.equal(naturalResolutionText('','No hay disponibles'),'No hay disponibles');
});
test('a failed photo turn retains the preceding product enquiry without pretending to see the image',()=>{
 const q=fallbackQuestion({message:{text:'De estas que brillan',attachment:{id:'file'}},history:[{role:'customer',text:'Busco un adorno para torta que diga feliz cumpleaños'},{role:'assistant',text:'¿Tienes una referencia?'}]});
 assert.match(q,/adorno para torta/);assert.match(q,/adjunto|Adjunto/);assert.doesNotMatch(q,/comprobante|aprobado/);
});
