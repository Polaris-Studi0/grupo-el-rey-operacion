import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutReply,recoveredCheckoutFields} from '../src/bot-checkout.js';

const prompt='Para coordinar el domicilio, envíame estos datos juntos:\n• Nombre para la compra y de quien recibe (si es la misma persona, basta un nombre)\n• Número de contacto\n• Dirección completa\n• Barrio o sector';
function context(text,checkout={},history=prompt){return {snapshot:{message:{id:'current',kind:'text',text},checkout:{stage:'collecting',fulfillment_type:'delivery',pending_selection:{name:'Artículo confirmado'},...checkout},history:[{role:'assistant',text:history}],customer:{name:'Nombre del perfil'}}};}

test('one labelled message extracts every delivery field and keeps apartment details',()=>{
 const d=checkoutReply(context('Nombre: Ana Pérez\nTeléfono: +57 300 123 4567\nDirección: Carrera 10 # 20-30, apto 402\nBarrio: Aures'));
 assert.deepEqual(d.checkout,{customer_name:'Ana Pérez',recipient_name:'Ana Pérez',recipient_phone:'573001234567',delivery_address:'Carrera 10 # 20-30, apto 402',delivery_zone:'Aures'});
 assert.equal(d.intent,'checkout');assert.deepEqual(d.actions,[]);assert.equal(d.accept_summary,false);
});
test('buyer and recipient remain distinct when the customer names both',()=>{
 const d=checkoutReply(context('Comprador: Juan Pérez; Recibe: Luisa Díaz; Celular: 3001234567; Dirección: Calle 12 # 34-56; Sector: Prado'));
 assert.equal(d.checkout.customer_name,'Juan Pérez');assert.equal(d.checkout.recipient_name,'Luisa Díaz');
 assert.equal(d.checkout.delivery_zone,'Prado');assert.equal(Object.keys(d.checkout).length,5);
});
test('comma-separated labelled fields and numbered bullets work without losing the address',()=>{
 const d=checkoutReply(context('1. Nombre: Ana, teléfono: 3001234567, dirección: Calle 10 # 20-30, apto 5, barrio: Aures'));
 assert.equal(d.checkout.recipient_name,'Ana');assert.equal(d.checkout.delivery_address,'Calle 10 # 20-30, apto 5');assert.equal(d.checkout.delivery_zone,'Aures');
});
test('partial delivery data is a patch and never clears fields already saved',()=>{
 const d=checkoutReply(context('Dirección: Calle 10 # 20-30\nBarrio: Aures',{customer_name:'Ana',recipient_name:'Luis',recipient_phone:'3001234567'}));
 assert.deepEqual(d.checkout,{delivery_address:'Calle 10 # 20-30',delivery_zone:'Aures'});
});
test('a bare lowercase name answers an explicitly combined name request',()=>{
 assert.deepEqual(checkoutReply(context('ana pérez')).checkout,{customer_name:'ana pérez',recipient_name:'ana pérez'});
});
test('combined name response supplies only the recipient when buyer is already known',()=>{
 const d=checkoutReply(context('Nombre: Luisa',{customer_name:'Juan'},'Solo me falta:\n• Nombre de quien recibe'));
 assert.deepEqual(d.checkout,{recipient_name:'Luisa'});
});
test('an explicit buyer name alone never silently names the recipient',()=>{
 assert.deepEqual(checkoutReply(context('A nombre de Ana porfa')).checkout,{customer_name:'Ana'});
 assert.deepEqual(checkoutReply(context('Nombre: Ana',{},'¿Lo prefieres a domicilio o recogida?')).checkout,{customer_name:'Ana'});
});
test('recibo yo uses only the buyer explicitly saved for this purchase',()=>{
 assert.deepEqual(checkoutReply(context('Recibo yo',{customer_name:'Ana'})).checkout,{recipient_name:'Ana'});
 assert.equal(checkoutReply(context('Recibo yo')),null);
});
test('free prose, unlabelled lines and product changes stay with the model',()=>{
 for(const text of ['Soy Ana, recibe Luis, vivo en Calle 10 # 20-30, Aures, 3001234567','Ana\n3001234567\nCalle 10 # 20-30\nAures','Quiero dos unidades\nNombre: Ana\nTeléfono: 3001234567','Nombre: Ana\nDirección: Calle 10 # 20-30\nY quiero cambiar el producto'])assert.equal(checkoutReply(context(text)),null,text);
});
test('conflicting names require interpretation rather than selecting one silently',()=>{
 assert.equal(checkoutReply(context('Comprador: Ana\nComprador: Luisa\nTeléfono: 3001234567')),null);
});
test('two people in a generic name line are interpreted before any partial fields are stored',()=>{
 assert.equal(checkoutReply(context('Nombre: Ana y Luisa\nTeléfono: 3001234567')),null);
 assert.equal(checkoutReply(context('Ana y Luisa')),null);
});
test('a delivery form does not interpret a question or product reference as a person',()=>{
 for(const text of ['Tengo una duda','Ya te escribo','Estoy consultando','Artículo confirmado'])assert.equal(checkoutReply(context(text)),null,text);
});
test('invalid or empty phone leaves a missing field while preserving other explicit data',()=>{
 const d=checkoutReply(context('Nombre: Ana\nTeléfono: 123\nDirección: Calle 10 # 20-30\nBarrio: Aures'));
 assert.equal(d.checkout.recipient_phone,undefined);assert.equal(d.checkout.customer_name,'Ana');assert.equal(d.checkout.delivery_zone,'Aures');
 assert.equal(checkoutReply(context('Teléfono: 123')),null);
});
test('contact phones accept explicit international numbers within database length limits',()=>{
 assert.equal(checkoutReply(context('Número de contacto: +1 (202) 555-0123')).checkout.recipient_phone,'12025550123');
 assert.equal(checkoutReply(context('3001234567')).checkout.recipient_phone,'3001234567');
});
test('no data from a profile, inactive purchase or unsupported message is inferred',()=>{
 assert.equal(checkoutReply(context('Hola')),null);
 for(const stage of ['ordered','cancelled','payment','review'])assert.equal(checkoutReply(context('Nombre: Ana',{stage})),null);
 const c=context('Nombre: Ana');c.snapshot.message.kind='audio';assert.equal(checkoutReply(c),null);
});
test('quotation-scoped explicit lists recover only missing fields',()=>{
 const c=context('continúa',{customer_name:'Nombre corregido'});c.snapshot.checkout_inputs=[{id:'earlier',kind:'text',text:'Comprador: Ana\nRecibe: Luis\nTeléfono: 3001234567'}];
 assert.deepEqual(recoveredCheckoutFields(c),{recipient_name:'Luis',recipient_phone:'3001234567'});
 assert.deepEqual(checkoutReply(c).checkout,{recipient_name:'Luis',recipient_phone:'3001234567'});
});
