import test from 'node:test';
import assert from 'node:assert/strict';
import {businessOverviewReply,BUSINESS_CATEGORIES_ID,OWNER_REPLY_WINDOW_MS} from '../src/bot-business.js';
const context=text=>({snapshot:{message:{text,kind:'text'},information:[{id:BUSINESS_CATEGORIES_ID,text:'Vendemos productos para el hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería.\nNo certifica stock de cada referencia.'}]}});
test('general product questions use the owner-confirmed business lines without stock assertions',()=>{
 for(const text of ['y que venden alla','¿Qué venden?','qué tipo de productos manejan','que venden en esa sede','¿Qué puedo comprar allí?']){
  const result=businessOverviewReply(context(text));assert.equal(result.intent,'information');assert.deepEqual(result.actions,[]);assert.match(result.reply_text,/hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería/);assert.doesNotMatch(result.reply_text,/certifica|existencias|disponible/);
 }
});
test('a broad answer cannot replace a request for a product, price, availability, multiple facts or an absent source',()=>{
 for(const text of ['¿Tienen licuadoras?','Qué productos de Click Hair venden','Que venden y cuanto cuesta','Qué electrodomésticos hay en Prado','¿Qué venden en la sede San Antonio de Prado y a qué hora cierran?'])assert.equal(businessOverviewReply(context(text)),null);
 const missing=context('que venden');missing.snapshot.information=[];assert.equal(businessOverviewReply(missing),null);
 const audio=context('que venden');audio.snapshot.message.kind='audio';assert.equal(businessOverviewReply(audio),null);
 assert.equal(OWNER_REPLY_WINDOW_MS,23*60*60*1000+55*60*1000);
});
