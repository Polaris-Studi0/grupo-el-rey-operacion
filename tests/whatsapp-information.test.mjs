import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStoreInformation} from '../n8n/commercial/information.js';
import {normalizeDecision} from '../n8n/commercial/normalize.js';
const branches=[{id:'b1',name:'Robledo Aures'},{id:'b2',name:'La Floresta'}];
const base={current_sender_type:'customer',stored_branch_id:'b1',branch_id:'b1',preferred_name:'Samuel',branches,sales_state:{items:[{name:'Peluche',qty:1,unit_price:300000}],payment_status:'verified'},latest_order:{order_number:'REY-1002',status:'preparing'},pending_human_tasks:[{type:'general',branch_id:'b1'}]};
for(const message of ['Quisiera consultar las sedes que tienen','me cuentas cuáles son sus sedes porfa','dónde están ubicadas sus tiendas','quiero conocer sus sucursales','qué sedes hay?','dime las direcciones de los almacenes','las sedes que tienen cuáles son','hola, quisiera saber dónde tienen locales','me puedes mostrar los puntos de venta','lista de sedes','no conozco las tiendas, muéstramelas']) {
 test('independent branch answer: '+message,()=>{
  for(const error of [{error:'credits exhausted'},{action:'human_general',reply:'La sede revisará'}]) {
   const c={...base,customer_message:message};const a=normalizeDecision(c,error).ai;
   for(const b of branches)assert.ok(a.reply.includes(b.name));
   assert.equal(a.action,'reply');assert.equal(a.branch_id,'b1');assert.deepEqual(a.sales_state,base.sales_state);
   assert.equal(a.send_qr,false);assert.equal(a.task_question,'');
  }
 });
}
test('store information never interprets human instructions or branch selection as listing',()=>{
 assert.equal(resolveStoreInformation({...base,current_sender_type:'human',customer_message:'consultar sedes'}),null);
 assert.equal(resolveStoreInformation({...base,customer_message:'Aures',stored_branch_id:null}),null);
 assert.equal(resolveStoreInformation({...base,customer_message:'qué productos tienen en las sedes'}),null);
 assert.equal(resolveStoreInformation({...base,customer_message:'no me escriban, quiero consultar las sedes'}),null);
});
test('hours require scoped current knowledge, not the service_open testing flag',()=>{
 const c={...base,customer_message:'qué horario manejan las sedes?',service_open:true,current_message_created_at:'2026-09-12T18:00:00Z'};
 assert.equal(resolveStoreInformation(c),null);
 const k={category:'schedule',title:'Horario Robledo Aures',content:'Lunes a sábado de 9 a. m. a 7 p. m.',branch_id:'b1'};
 assert.match(resolveStoreInformation({...c,knowledge:[k]}).reply,/Lunes a sábado/);
 assert.equal(resolveStoreInformation({...c,knowledge:[{...k,branch_id:'b2'}]}),null);
 assert.equal(resolveStoreInformation({...c,knowledge:[{...k,valid_until:'2026-09-01'}]}),null);
});
