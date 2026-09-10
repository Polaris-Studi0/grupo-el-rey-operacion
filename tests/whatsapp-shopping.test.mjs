import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {normalizeDecision} from '../n8n/commercial/normalize.js';
const Ajv=createRequire(import.meta.url)('ajv');
const schema=JSON.parse(readFileSync(new URL('../n8n/commercial/schema.json',import.meta.url),'utf8'));
const context={customer_message:'Continuemos',current_sender_type:'customer',branch_id:'b1',branch_name:'Sede ejemplo',preferred_name:'Ana',branches:[{id:'b1',name:'Sede ejemplo'}],inventory:[],human_tasks:[],pending_human_tasks:[],sales_state:{items:[]},service_open:true,delivery_open:true};
const run=(c={},ai={})=>normalizeDecision({...structuredClone(context),...c},{action:'reply',reply:'Con gusto',...ai}).ai;
test('saludo puro no activa un pago histórico',()=>{
 const r=run({customer_message:'Hola',sales_state:{items:[],payment_reported:true,store_purchase_reported:true}}, {action:'human_payment_verification',reply:'Voy a verificar el pago'});
 assert.equal(r.action,'reply');assert.doesNotMatch(r.reply,/pago|entrega/);
});
test('saludo con petición conserva la petición',()=>{
 const r=run({customer_message:'Hola, necesito un termo'});assert.equal(r.action,'human_product_lookup');
});
test('cancelar selección limpia pago y conserva conversación',()=>{
 const r=run({customer_message:'ya no quiero eso',current_message_created_at:'2026-09-09T16:00:00Z',sales_state:{payment_reported:true,items:[{name:'Termo',qty:1,unit_price:30000}]}}, {action:'stop'});
 assert.equal(r.action,'reply');assert.equal(r.reset_purchase,true);assert.deepEqual(r.sales_state.items,[]);assert.equal(r.sales_state.payment_reported,false);
});
test('no contactar sigue siendo stop',()=>assert.equal(run({customer_message:'No me escriban más'}, {action:'stop'}).action,'stop'));
test('pedido existente no se cancela automáticamente',()=>{
 const r=run({customer_message:'Cancela mi pedido',latest_order:{order_number:'REY-1001'}});assert.equal(r.action,'human_general');assert.equal(r.reset_purchase,false);
});
test('sin catálogo primero busca producto en la sede',()=>{
 const r=run({customer_message:'quiero porfa algun shampoo para cuidar el cabello'}, {reply:'Te muestro tres marcas. Dame dirección y quién recibe.'});
 assert.equal(r.action,'human_product_lookup');assert.match(r.task_question,/shampoo/);assert.doesNotMatch(r.reply,/direcci[oó]n|destinatario|tres marcas/);
});
test('sin sede conserva interés y pide únicamente sede',()=>{
 const r=run({customer_message:'necesito un ventilador',branch_id:null}, {branch_id:''});assert.match(r.sales_state.product_interest,/ventilador/);assert.match(r.reply,/sede/);assert.doesNotMatch(r.reply,/direcci[oó]n|recibe/);
});
test('porfa retoma interés aunque falte salida de modelo',()=>{
 const r=run({customer_message:'porfa',branch_id:null,sales_state:{items:[],product_interest:'shampoo'}}, {error:'parser failed',reply:''});assert.match(r.reply,/shampoo/);assert.doesNotMatch(r.reply,/dificultad/);
});
test('cuáles tienes recupera interés de mensaje real anterior',()=>{
 const r=run({customer_message:'cuales tienes?',branch_id:null,recent_messages:[{sender_type:'customer',body:'quiero algún shampoo'}]}, {error:'parser failed',reply:''});assert.match(r.reply,/shampoo/);
});
test('contrato permite omitir campos técnicos que normalizador conserva',()=>{
 const validate=new Ajv({strict:false}).compile(schema);
 assert.equal(validate({action:'reply',reply:'Con gusto',sales_state:{stage:'browsing'}}),true);
 assert.equal(validate({action:'approve_everything',reply:'Listo'}),false);
});
