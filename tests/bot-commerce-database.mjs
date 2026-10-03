import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkoutReply} from '../src/bot-checkout.js';
const dir=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
const db=new PGlite();const withV2=false;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
   create publication supabase_realtime;`);
  for(const f of files){if(!withV2&&f.startsWith('20260920'))continue;await db.exec((await readFile(new URL(f,dir),'utf8')).replace(/create extension if not exists pgcrypto;/,''));}


const uid='20000000-0000-4000-8000-000000000001',pid='20000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users(id,email) values('${uid}','admin@example.invalid');update profiles set role='admin' where id='${uid}';select set_config('test.user','${uid}',false);`);
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
assert.equal(Number((await one("select extract(epoch from bot_stock_valid_until('2026-09-29T15:00:00Z')) value")).value),Date.parse('2026-09-30T01:00:00Z')/1000);
// Freeze only stock validity for transaction scenarios, independent of test wall clock.
await db.exec(`create or replace function public.bot_stock_valid_until(p_confirmed timestamptz) returns timestamptz language sql immutable as $$select $1+interval '24 hours'$$;`);
await db.exec(`insert into products(id,name) values('${pid}','Promoción de prueba');insert into branch_inventory(branch_id,product_id,price,available_qty,stock_confirmed_at,stock_confirmed_by) values('b1','${pid}',250000,10,now(),'${uid}');insert into branch_payment_qrs(branch_id,storage_path,original_name,mime_type,size_bytes) values('b1','b1/test-qr.png','test.png','image/png',50);`);
assert.equal((await one("select has_function_privilege('authenticated','public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)','execute') ok")).ok,false);
let n=10;
async function chat(phone){const ct=(await one('insert into whatsapp_contacts(phone_e164) values($1) returning id',[phone])).id;return (await one("insert into whatsapp_conversations(contact_id,branch_id,consent_status,consented_at,consent_version) values($1,'b1','granted',now(),'v1') returning id",[ct])).id;}
async function inbound(cid,body='Mensaje sintético'){return (await one("insert into whatsapp_messages(conversation_id,direction,sender_type,message_type,body,created_at) values($1,'inbound','customer','text',$2,now()+$3*interval '1 millisecond') returning id",[cid,body,n++])).id;}
async function state(cid){return (await one("select coalesce(sales_state->'pilot_commerce','{}') s from whatsapp_conversations where id=$1",[cid])).s;}
async function commit(cid,decision,mid=null,task=null,overrides={}){mid=mid||await inbound(cid);let c=await one('select automation_control_version v from whatsapp_conversations where id=$1',[cid]);const st=await state(cid);const r=await one('select commit_bot_commerce_turn($1,$2,$3,$4,$5,$6,$7) r',[cid,mid,overrides.control??c.v,overrides.version??st.version??0,{intent:'checkout',reply_text:'Prueba',...decision},'+570000000999',task]);return {...r.r,mid};}
async function sent(result){for(const id of result.message_ids||[])await db.query("update whatsapp_messages set delivery_status='sent',meta_message_id=$2,created_at=now()-interval '1 second' where id=$1",[id,'synthetic-'+id]);}
async function body(result){return (await one('select body,message_type,raw_payload from whatsapp_messages where id=$1',[result.message_ids[0]]));}
const cid=await chat('+570000000011');
const cart={intent:'quote',quote:{items:[{product_id:pid,quantity:1,unit_price_cop:1}]},checkout:{customer_name:'Ana',fulfillment_type:'delivery',delivery_address:'Calle de prueba 10',delivery_zone:'Barrio de prueba',recipient_name:'Ana',recipient_phone:'3000000000'}};
const first=await commit(cid,cart);assert.equal(first.task_ids.length,1);assert.match((await body(first)).body,/domicilio/);await sent(first);
const feeId=first.task_ids[0];
await assert.rejects(()=>db.query("select resolve_bot_commerce_task($1,'resolved','{\"answer\":\"10 mil\"}')",[feeId]),/valor confirmado/);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"delivery_fee\":10000}')",[feeId]);
const summary=await commit(cid,{},first.mid,feeId);assert.match((await body(summary)).body,/\$260\.000/);assert.equal((await state(cid)).subtotal,250000);assert.equal((await state(cid)).delivery_fee,10000);
// Cannot accept a summary that was never actually sent.
const unsent=await commit(cid,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await state(cid)).accepted_quote_id,undefined);await sent(unsent);
const accepted=await commit(cid,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await body(accepted)).message_type,'image');assert.equal((await body(accepted)).raw_payload.storage_path,'b1/test-qr.png');assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,1);await sent(accepted);
const repeat=await commit(cid,{accept_summary:true},accepted.mid);assert.deepEqual(repeat.message_ids,accepted.message_ids);assert.equal(repeat.duplicate,true);assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,1);
const noProof=await commit(cid,{intent:'handoff',actions:[{type:'propose_human_task',reason:'payment_review'}]});assert.equal((await body(noProof)).message_type,'text');assert.match((await body(noProof)).body,/No repitas la transferencia/);await sent(noProof);
const receiptMid=await inbound(cid,'Comprobante');const proof=(await one("insert into whatsapp_attachments(conversation_id,message_id,meta_media_id,storage_path,mime_type,size_bytes) values($1,$2,'test-media','test/receipt.png','image/png',120) returning id",[cid,receiptMid])).id;
const review=await commit(cid,{intent:'handoff',actions:[{type:'propose_human_task',reason:'payment_review'}]},receiptMid);assert.equal(review.task_ids.length,1);await sent(review);
const noRepeat=await commit(cid,{intent:'qr'});assert.equal((await body(noRepeat)).message_type,'text');assert.match((await body(noRepeat)).body,/No hagas otra transferencia/);await sent(noRepeat);
const paymentId=review.task_ids[0];assert.equal((await one('select context from human_tasks where id=$1',[paymentId])).context.attachment_id,proof);
await assert.rejects(()=>db.query("select resolve_bot_commerce_task($1,'resolved','{\"answer\":\"aprobado\"}')",[paymentId]),/explícitamente/);
await assert.rejects(()=>db.query("select resolve_bot_commerce_task($1,'resolved','{\"approved\":true,\"amount\":250000}')",[paymentId]),/importe exacto/);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"approved\":true,\"amount\":260000}')",[paymentId]);
const order=await commit(cid,{},noRepeat.mid,paymentId);assert.ok(order.order_id);const saved=await one('select * from orders where id=$1',[order.order_id]);assert.equal(Number(saved.total),250000);assert.equal(Number(saved.delivery_fee),10000);assert.equal(saved.payment_receipt_path,'test/receipt.png');assert.equal(saved.payment_receipt_bucket,'whatsapp-media');assert.equal(saved.status,'preparing');
assert.deepEqual(await one('select available_qty,reserved_qty from branch_inventory'),{available_qty:9,reserved_qty:0});
assert.doesNotMatch((await body(order)).body,/no tenemos una hora de entrega/,'receipt should not contradict a later estimate entered in intranet');
const orderAgain=await commit(cid,{},noRepeat.mid,paymentId);assert.equal(orderAgain.order_id,order.order_id);assert.equal((await one('select count(*)::int n from orders')).n,1);
const info=await commit(cid,{intent:'information',reply_text:'Tu consulta informativa.'});assert.equal((await body(info)).body,'Tu consulta informativa.');assert.equal((await state(cid)).stage,'ordered');
console.log('PASS delivery fee, exact subtotal, actual QR queue, receipt scope, explicit approval, single order, stock deduction and retry');
const cid2=await chat('+570000000012');const s2=await commit(cid2,{...cart,checkout:{...cart.checkout,fulfillment_type:'pickup'}});await sent(s2);
const a2=await commit(cid2,{accept_summary:true,checkout:{payment_method:'transfer'}});await sent(a2);
const before=await state(cid2);const change=await commit(cid2,{checkout:{fulfillment_type:'delivery',delivery_address:'Otra calle',delivery_zone:'Otro barrio'}});assert.notEqual((await state(cid2)).quote_id,before.quote_id);assert.equal((await state(cid2)).accepted_quote_id,undefined);assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,0);assert.equal(change.task_ids.length,1);
const staleMid=await inbound(cid2);await inbound(cid2,'Mensaje más nuevo');assert.equal((await commit(cid2,{accept_summary:true},staleMid)).skipped,true);
const staleControl=await commit(cid2,{accept_summary:true},null,null,{control:999});assert.equal(staleControl.skipped,true);
await db.query('update whatsapp_conversations set automation_paused=true where id=$1',[cid2]);assert.equal((await commit(cid2,{accept_summary:true})).skipped,true);
console.log('PASS address changes release reservations and invalidate acceptance; newest inbound and manual-control CAS');
const cid3=await chat('+570000000013');const s3=await commit(cid3,{intent:'quote',quote:cart.quote,checkout:{customer_name:'Luis',fulfillment_type:'pickup'}});await sent(s3);const pickup=await commit(cid3,{accept_summary:true,checkout:{payment_method:'cash_prepaid'}});assert.ok(pickup.order_id);assert.equal((await one('select delivery_fee::int from orders where id=$1',[pickup.order_id])).delivery_fee,0);
console.log('PASS pay at store creates a pickup order without inventing a received payment');

const cid4=await chat('+570000000014');const summary4=await commit(cid4,{intent:'quote',quote:cart.quote,checkout:{customer_name:'María',fulfillment_type:'pickup'}});await sent(summary4);
const qr4=await commit(cid4,{accept_summary:true,checkout:{payment_method:'transfer'}});
await inbound(cid4,'Espera, quiero cambiar la compra');
const blockedClaim=await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[qr4.message_ids[0]]);assert.equal(blockedClaim.r.send,false);assert.equal(blockedClaim.r.reason,'commerce_context_changed');
const oldQty=(await one('select available_qty from branch_inventory')).available_qty;
await db.query("update inventory_reservations set expires_at=now()-interval '1 minute' where conversation_id=$1 and status='active'",[cid4]);
await db.query('select expire_bot_commerce_reservations($1)',[cid4]);assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,0);
assert.equal((await one('select available_qty from branch_inventory')).available_qty,oldQty);
console.log('PASS dispatch claim rechecks latest message and expired reservations release only reserved quantity');
// A stock edit without an explicit recount invalidates count freshness.
await db.query('update branch_inventory set available_qty=1');assert.equal((await one('select stock_confirmed_at from branch_inventory')).stock_confirmed_at,null);
await db.query('update branch_inventory set stock_confirmed_at=now()');
const ca=await chat('+570000000015'),cb=await chat('+570000000016');
const qa=await commit(ca,{intent:'quote',quote:cart.quote,checkout:{customer_name:'A',fulfillment_type:'pickup'}});await sent(qa);
const qb=await commit(cb,{intent:'quote',quote:cart.quote,checkout:{customer_name:'B',fulfillment_type:'pickup'}});await sent(qb);
await commit(ca,{accept_summary:true,checkout:{payment_method:'transfer'}});
const loser=await commit(cb,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await body(loser)).message_type,'text');assert.match((await body(loser)).body,/te confirmo la disponibilidad/);assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,1);
console.log('PASS last unit cannot be reserved by two conversations');
// A resolved payment with mere wording or a stale quote never creates an order.
const caState=await state(ca),receiptA=await inbound(ca,'Pago');
await db.query("insert into whatsapp_attachments(conversation_id,message_id,meta_media_id,storage_path,mime_type,size_bytes) values($1,$2,'media-a','a/receipt.png','image/png',20)",[ca,receiptA]);
const ar=await commit(ca,{intent:'handoff',actions:[{type:'propose_human_task',reason:'payment_review'}]},receiptA);const at=ar.task_ids[0];
await db.query("select resolve_human_task($1,'resolved','{\"answer\":\"Pago aprobado\"}')",[at]);
const notApproved=await commit(ca,{},receiptA,at);assert.equal(notApproved.order_id,null);assert.equal((await state(ca)).stage,'review');
const feeBefore=change.task_ids[0];await db.query('update whatsapp_conversations set automation_paused=false where id=$1',[cid2]);
await commit(cid2,{checkout:{delivery_address:'Tercera calle'}});
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"delivery_fee\":12000}')",[feeBefore]);
const staleTask=await commit(cid2,{},null,feeBefore);assert.equal(staleTask.reason,'stale_task');
assert.equal(caState.stage,'payment');
console.log('PASS free text does not approve payment and a stale address quote cannot resume checkout');

assert.equal((await db.query('select * from bot_customer_orders($1)',[cid])).rows[0].id,order.order_id);
assert.equal((await db.query('select * from bot_customer_orders($1)',[cb])).rows.length,0);
assert.equal((await one("select has_function_privilege('authenticated','public.bot_customer_orders(uuid)','execute') ok")).ok,false);
console.log('PASS order lookup is bound to the verified contact and never exposes another client');
const snap=(await one('select snapshot from bot_context_snapshot($1)',[cid])).snapshot;
assert.equal(snap.conversation.id,cid);assert.equal(snap.contacts.length,1);
assert.ok(snap.orders.every(o=>o.id===order.order_id));assert.ok(snap.inventory.every(i=>i.branch_id==='b1'));
assert.equal(snap.allBranches.length,10);assert.equal(snap.messages.some(m=>m.raw_payload?.internal_notification),false);
assert.equal((await one("select has_function_privilege('authenticated','public.bot_context_snapshot(uuid)','execute') ok")).ok,false);
assert.equal((await db.query('select * from bot_context_snapshot($1)',['99999999-0000-4000-8000-000000000001'])).rows.length,0);
console.log('PASS one database snapshot scopes contact, branch, orders and public messages; browser access denied');


for(const r of (await db.query("select id from inventory_reservations where status='active'")).rows)await db.query('select release_chat_inventory($1)',[r.id]);
await db.exec("update branch_inventory set available_qty=2;update branch_inventory set stock_confirmed_at=now();update branch_payment_qrs set mime_type='image/webp';");
const cq=await chat('+570000000019');const qq=await commit(cq,{intent:'quote',quote:cart.quote,checkout:{customer_name:'QR test',fulfillment_type:'pickup'}});await sent(qq);
const unavailable=await commit(cq,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await body(unavailable)).message_type,'text');assert.match((await body(unavailable)).body,/te confirmo el medio de pago/);assert.ok(unavailable.task_ids.length);
console.log('PASS unsupported QR formats request correction instead of sending an invalid image');

const cc=await chat('+570000000020');const qc=await commit(cc,{intent:'quote',quote:cart.quote,checkout:{customer_name:'Crédito test',fulfillment_type:'pickup'}});await sent(qc);
const cr=await commit(cc,{accept_summary:true,checkout:{payment_method:'addi'}});assert.equal(cr.task_ids.length,1);assert.equal(cr.order_id,null);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"approved\":true,\"amount\":250000}')",[cr.task_ids[0]]);
const co=await commit(cc,{},cr.mid,cr.task_ids[0]);assert.ok(co.order_id);assert.equal((await one('select payment_method from orders where id=$1',[co.order_id])).payment_method,'addi');
console.log('PASS credit approval requires the explicit human decision before creating an order');

// A free-text human offer is usable conversational memory, not fictitious stock.
const humanCid=await chat('+570000000030');const askMid=await inbound(humanCid,'¿Tienen disfraces?');
const humanTask=(await one("select (create_human_task($1,'human-offer-test','product_lookup','normal','Disfraces','¿Tienen disfraces?',jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',$2::text),null,'+570000000999',null)).id id",[humanCid,askMid])).id;
await db.query("select resolve_human_task($1,'resolved',$2)",[humanTask,{answer:'Sí, tenemos 2 disfraces, uno de super man unitalla a 50.000 y otro de sharkboy talla s a 100.000'}]);
const selection={source_task_id:humanTask,source_excerpt:'uno de super man unitalla a 50.000',name:'super man',variant:'unitalla',unit_price_cop:50000,quantity:1};
const savedAnswer=(await one('select resolution from human_tasks where id=$1',[humanTask])).resolution;
await db.query("update human_tasks set resolution='{}' where id=$1",[humanTask]);
await assert.rejects(()=>db.query('select bot_confirmed_selection($1,$2)',[humanCid,selection]),/selección no coincide/);
await db.query('update human_tasks set resolution=$2 where id=$1',[humanTask,savedAnswer]);
await assert.rejects(()=>db.query('select bot_confirmed_selection($1,$2)',[cid,selection]),/selección no coincide/);
await assert.rejects(()=>db.query('select bot_confirmed_selection($1,$2)',[humanCid,{...selection,unit_price_cop:100000}]),/Precio o cantidad/);
await assert.rejects(()=>db.query('select bot_confirmed_selection($1,$2)',[humanCid,{...selection,source_excerpt:'super man a 5.000'}]),/selección no coincide/);
const previousProducts=Number((await one('select count(*) n from products')).n);
const chosen=await commit(humanCid,{intent:'checkout',confirmed_item:selection});
assert.equal(chosen.task_ids.length,0);assert.match((await body(chosen)).body,/domicilio.*recoges/);assert.match((await body(chosen)).body,/50\.000/);
assert.equal((await state(humanCid)).pending_selection.source_task_id,humanTask);assert.equal((await state(humanCid)).cart.length,0);
assert.equal(Number((await one('select count(*) n from products')).n),previousProducts);
const fulfillment=await commit(humanCid,{intent:'checkout',checkout:{fulfillment_type:'pickup'}});
assert.match((await body(fulfillment)).body,/nombre/i);assert.equal(fulfillment.task_ids.length,0);
const named=await commit(humanCid,{intent:'checkout',checkout:{customer_name:'Cliente de prueba'}});
assert.equal(named.task_ids.length,1);const stockTask=named.task_ids[0];const stockQuestion=(await one('select question from human_tasks where id=$1',[stockTask])).question;
assert.doesNotMatch(stockQuestion,/product_id|otras sedes/);assert.match(stockQuestion,/ya confirmados/);
await assert.rejects(()=>db.query("select resolve_bot_commerce_task($1,'resolved',$2)",[stockTask,{available_qty:1}]),/Confirma las existencias/);
await assert.rejects(()=>db.query("select resolve_bot_commerce_task($1,'resolved',$2)",[stockTask,{available_qty:0,approved_item:true}]),/Confirma las existencias/);
// Isolated test fixes the stock function's closing guard so the test works at night.
const stockDefinition=(await one("select pg_get_functiondef('public.confirm_bot_stock(text,uuid,integer)'::regprocedure) d")).d;
await db.exec(stockDefinition.replace("if (now() at time zone 'America/Bogota')::time>=time '20:00' then",'if false then'));
await db.query("select resolve_bot_commerce_task($1,'resolved',$2)",[stockTask,{available_qty:1,approved_item:true,answer:'Conteo físico confirmado'}]);
const approvedSelection=await commit(humanCid,{},named.mid,stockTask);
assert.match((await body(approvedSelection)).body,/50\.000/);assert.match((await body(approvedSelection)).body,/Está todo correcto/);
assert.equal((await state(humanCid)).pending_selection,undefined);assert.equal((await state(humanCid)).cart[0].unit_price,50000);
assert.equal(approvedSelection.order_id,null);await sent(approvedSelection);
const completedSelection=await commit(humanCid,{intent:'checkout',accept_summary:true,checkout:{payment_method:'cash_prepaid'}});
assert.ok(completedSelection.order_id);assert.equal(Number((await one('select total from orders where id=$1',[completedSelection.order_id])).total),50000);
console.log('PASS human offer -> exact selection -> checkout fields -> only missing count -> approved inventory -> summary -> actual order');

// Follow the actual delivery conversation through persistence, including the
// former name/recipient mix-up and the phone number that triggered escalation.
const deliveryCid=await chat('+570000000031');const deliveryAsk=await inbound(deliveryCid,'¿Tienen disfraces?');
const deliveryTask=(await one("select (create_human_task($1,'delivery-continuity-test','product_lookup','normal','Disfraces','¿Tienen disfraces?',jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',$2::text),null,'+570000000999',null)).id id",[deliveryCid,deliveryAsk])).id;
await db.query("select resolve_human_task($1,'resolved',$2)",[deliveryTask,savedAnswer]);
let lastDelivery=await commit(deliveryCid,{intent:'checkout',confirmed_item:{...selection,source_task_id:deliveryTask}});await sent(lastDelivery);
const exported=JSON.parse(await readFile(new URL('../n8n/rebuild/attention-core.workflow.json',import.meta.url),'utf8'));
const guardCode=exported.nodes.find(n=>n.name==='Validar propuesta y referencias').parameters.jsCode;
async function deliveryReply(text,modelFields=null){
 const id=await inbound(deliveryCid,text);const snapshot={message:{id,text,kind:'text'},checkout:await state(deliveryCid),history:[{role:'assistant',text:(await body(lastDelivery)).body}]};
 let decision=checkoutReply({snapshot});
 if(!decision&&modelFields){
  const output={intent:'clarification',reply_text:'Perfecto, listo para enviar.',product_ids:[],quote_items:[],qr_asset_id:'',human_reason:'',human_question:'',checkout:modelFields};
  const guarded=new Function('$input','$',guardCode)({first:()=>({json:{output}})},()=>({first:()=>({json:{context:{...snapshot,products:[],expires_at:new Date(Date.now()+60000).toISOString()}}})}))[0].json;
  assert.equal(guarded.http_status,200);decision=guarded.response.decision;
 }
 assert.ok(decision,`Checkout reply not recognized: ${text}`);
 lastDelivery=await commit(deliveryCid,decision,id);await sent(lastDelivery);
 const reply=(await body(lastDelivery)).body;assert.doesNotMatch(reply,/listo para enviar|super man|50\.000/i);return reply;
}
assert.match(await deliveryReply('a domicilio'),/nombre/i);
assert.match(await deliveryReply('A nombre de Samuel porfa'),/dirección/i);
assert.equal((await state(deliveryCid)).customer_name,'Samuel');
assert.match(await deliveryReply('3127378289'),/dirección/i);
assert.equal((await state(deliveryCid)).recipient_phone,'3127378289');assert.equal(lastDelivery.task_ids.length,0);
assert.match(await deliveryReply('Calle 10 # 20-30',{delivery_address:'Calle 10 # 20-30'}),/barrio/i);
assert.match(await deliveryReply('Barrio Robledo',{delivery_zone:'Robledo'}),/nombre de quien recibe/i);
assert.match(await deliveryReply('Recibe Samuel'),/unidades disponibles/);assert.equal(lastDelivery.task_ids.length,1);
assert.equal((await state(deliveryCid)).pending_selection.unit_price_cop,50000);assert.equal(lastDelivery.order_id,null);
console.log('PASS real delivery wording -> persisted buyer name -> phone without escalation -> address -> sector -> recipient -> stock check, without premature shipment promises');

// Batch data from a human-confirmed item uses the same missing-data form as a
// catalogue cart. A repeat of the inbound message must not ask twice or create
// a second inventory task.
const batchCid=await chat('+570000000032'),batchAsk=await inbound(batchCid,'Quiero el artículo confirmado');
const batchTask=(await one("select (create_human_task($1,'batch-delivery-test','product_lookup','normal','Disfraces','Artículo confirmado',jsonb_build_object('pilot_engine','new-whatsapp-v1','inbound_message_id',$2::text),null,'+570000000999',null)).id id",[batchCid,batchAsk])).id;
await db.query("select resolve_human_task($1,'resolved',$2)",[batchTask,savedAnswer]);
await commit(batchCid,{confirmed_item:{...selection,source_task_id:batchTask}});
const batchForm=await commit(batchCid,{checkout:{fulfillment_type:'delivery'}}),batchText=(await body(batchForm)).body;
for(const field of ['Nombre para la compra y de quien recibe','Número de contacto','Dirección completa','Barrio o sector'])assert.ok(batchText.includes('• '+field),field);
assert.match(batchText,/datos juntos/);assert.equal(batchForm.task_ids.length,0);
const batchMid=await inbound(batchCid,'Nombre: Ana Pérez\nTeléfono: 3001234567\nDirección: Calle 10 # 20-30, apto 402\nBarrio: Aures');
const batchDecision=checkoutReply({snapshot:{message:{id:batchMid,kind:'text',text:'Nombre: Ana Pérez\nTeléfono: 3001234567\nDirección: Calle 10 # 20-30, apto 402\nBarrio: Aures'},checkout:await state(batchCid),history:[{role:'assistant',text:batchText}]}});
const batchSaved=await commit(batchCid,batchDecision,batchMid),batchState=await state(batchCid);
assert.equal(batchState.customer_name,'Ana Pérez');assert.equal(batchState.recipient_name,'Ana Pérez');assert.equal(batchState.recipient_phone,'3001234567');
assert.equal(batchState.delivery_address,'Calle 10 # 20-30, apto 402');assert.equal(batchState.delivery_zone,'Aures');
assert.equal(batchSaved.task_ids.length,1);assert.equal(batchSaved.order_id,null);assert.match((await body(batchSaved)).body,/unidades disponibles/);
const batchRepeat=await commit(batchCid,batchDecision,batchMid);assert.equal(batchRepeat.duplicate,true);assert.deepEqual(batchRepeat.message_ids,batchSaved.message_ids);
assert.equal(Number((await one("select count(*) n from human_tasks where conversation_id=$1 and context#>>'{commerce,kind}'='confirmed_item'",[batchCid])).n),1);
assert.equal((await one("select has_function_privilege('authenticated','public.bot_checkout_data_prompt(jsonb,boolean)','execute') ok")).ok,false);
console.log('PASS batch delivery form -> all fields persisted at once -> one stock task -> idempotent duplicate, no early order');

await db.query('update branch_inventory set available_qty=20,stock_confirmed_at=now() where product_id=$1',[pid]);
const partialCid=await chat('+570000000033');
const partialForm=await commit(partialCid,{intent:'quote',quote:cart.quote,checkout:{fulfillment_type:'delivery'}});
assert.match((await body(partialForm)).body,/datos juntos/);
const partial=await commit(partialCid,{checkout:{customer_name:'Juan',recipient_name:'Luisa',recipient_phone:'3001234567'}});
const partialText=(await body(partial)).body;
assert.match(partialText,/Solo me falta:/);assert.match(partialText,/• Dirección completa/);assert.match(partialText,/• Barrio o sector/);
assert.doesNotMatch(partialText,/Nombre|Número de contacto/);assert.equal(partial.task_ids.length,0);
const finalFields=await commit(partialCid,{checkout:{delivery_address:'Calle 12 # 34-56, apto 5',delivery_zone:'Prado'}});
assert.equal(finalFields.task_ids.length,1);assert.equal(finalFields.order_id,null);
const partialSaved=await state(partialCid);assert.equal(partialSaved.customer_name,'Juan');assert.equal(partialSaved.recipient_name,'Luisa');assert.equal(partialSaved.delivery_address,'Calle 12 # 34-56, apto 5');
assert.equal((await one('select task_type from human_tasks where id=$1',[finalFields.task_ids[0]])).task_type,'delivery_quote');
console.log('PASS catalogue delivery batch -> partial data preserved -> only missing fields -> one tariff confirmation, distinct recipient');

// Session reset is driven by the last CUSTOMER message, even with recent outgoing activity.
const resetCid=await chat('+570000000066');const resetCt=(await one('select contact_id from whatsapp_conversations where id=$1',[resetCid])).contact_id;
await db.query("insert into whatsapp_messages(conversation_id,meta_message_id,direction,sender_type,message_type,body,created_at) values($1,'consent-reset','inbound','customer','text','ACEPTO',now()-interval '26 hours')",[resetCid]);
await db.query("insert into privacy_consents(contact_id,conversation_id,policy_version,notice_text,customer_response,granted,meta_message_id) values($1,$2,'v1','test','ACEPTO',true,'consent-reset')",[resetCt,resetCid]);
const resetMsg=await inbound(resetCid,'Old branch');await db.query("update whatsapp_messages set created_at=now()-interval '25 hours' where id=$1",[resetMsg]);
await db.query("update whatsapp_conversations set last_message_at=now(),automation_paused=true where id=$1",[resetCid]);
const ingest=async(phone,id)=> (await one("select ingest_whatsapp_message($1,$2,'Test',$3,'text','Hola',null,'{}','whatsapp',null) r",[phone,phone.slice(1),id])).r;
const nextSession=await ingest('+570000000066','new-session-test');assert.notEqual(nextSession.conversation_id,resetCid);assert.equal(nextSession.branch_id,null);
const freshSession=await one('select * from whatsapp_conversations where id=$1',[nextSession.conversation_id]);assert.equal(freshSession.automation_paused,true);assert.equal(freshSession.consent_status,'granted');assert.deepEqual(freshSession.sales_state,{});assert.equal(freshSession.previous_conversation_id,resetCid);
assert.equal((await one('select session_closed_reason from whatsapp_conversations where id=$1',[resetCid])).session_closed_reason,'inactivity_24h');
assert.equal((await ingest('+570000000066','new-session-test')).conversation_id,nextSession.conversation_id,'duplicate ingress keeps the same session');
assert.equal((await ingest('+570000000066','new-session-second')).conversation_id,nextSession.conversation_id,'active chat does not reset');
assert.ok(await one('select id from whatsapp_messages where id=$1',[resetMsg]),'history retained');
console.log('PASS 24-hour inactivity resets branch/context, preserves consent/manual control and history; duplicate ingress does not fork sessions');

const imageCid=await chat('+570000000067'),imageMid=await inbound(imageCid,'Foto del producto');
const imageAsset=(await one("insert into bot_media_assets(branch_id,product_id,kind,storage_path,original_name,mime_type,size_bytes,caption) values('b1',$1,'product','product/synthetic.jpg','test.jpg','image/jpeg',123,'Vista frontal del producto') returning id",[pid])).id;
const im=await commit(imageCid,{intent:'information',reply_text:'Esta es la foto.',media_ids:[imageAsset]},imageMid);assert.equal(im.message_ids.length,2);assert.equal((await one('select message_type from whatsapp_messages where id=$1',[im.message_ids[1]])).message_type,'image');
assert.deepEqual((await commit(imageCid,{intent:'information',reply_text:'Esta es la foto.',media_ids:[imageAsset]},imageMid)).message_ids,im.message_ids);
assert.equal((await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[im.message_ids[1]])).r.storage_bucket,'bot-images');
const im2=await commit(imageCid,{intent:'information',reply_text:'Otra vista.',media_ids:[imageAsset]});await db.query('update bot_media_assets set active=false where id=$1',[imageAsset]);assert.equal((await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[im2.message_ids[1]])).r.reason,'image_context_changed');
await assert.rejects(()=>commit(imageCid,{intent:'information',reply_text:'No debe salir.',media_ids:[proof]}),/Imagen no autorizada/);
assert.equal((await one("select has_function_privilege('authenticated','queue_bot_images(uuid,uuid,integer,jsonb,text)','execute') ok")).ok,false);
console.log('PASS product photos use trusted storage, atomic idempotent replies and send-time scope; receipt IDs are rejected');

const flyer=(await one("insert into bot_media_assets(kind,storage_path,original_name,mime_type,size_bytes,caption) values('flyer','flyer/test.jpg','test.jpg','image/jpeg',100,'Flyer de prueba') returning id")).id;
const template={name:'synthetic',language:{code:'es'},components:[],preview:'Prueba',footer:''};
const draft=(await one("select prepare_whatsapp_campaign($1,'Prueba',$2,$3,$4,'Formulario autorizado de prueba') r",[uid,flyer,template,['+570000000077','+570000000077','+570000000078']])).r;assert.equal(draft.included,2);assert.equal(draft.status,'draft');assert.equal((await one('select claim_whatsapp_campaign() r')).r,null,'drafts never send');
await db.query("select marketing_opt_out('+570000000078','Cliente pidió baja')");
await db.query('select start_whatsapp_campaign($1,$2)',[draft.id,uid]);await db.query('select start_whatsapp_campaign($1,$2)',[draft.id,uid]);
const batch=(await one('select claim_whatsapp_campaign() r')).r;assert.equal(batch.recipients.length,1);assert.equal(batch.recipients[0].phone_e164,'+570000000077');assert.equal((await one('select claim_whatsapp_campaign() r')).r.recipients.length,0,'sending claims never re-send');
const blocked=(await one("select prepare_whatsapp_campaign($1,'Otra prueba',$2,$3,'[\"+570000000078\"]','Nueva lista de autorización') r",[uid,flyer,template])).r;assert.equal(blocked.included,0,'batch evidence cannot override a personal opt-out');
await db.query("update whatsapp_campaign_recipients set meta_message_id='campaign-test',status='sent' where id=$1",[batch.recipients[0].id]);
await db.query("select record_whatsapp_message_status('campaign-test','read',now(),'{}','campaign-read')");await db.query("select record_whatsapp_message_status('campaign-test','sent',now(),'{}','campaign-sent')");assert.equal((await one("select status from whatsapp_campaign_recipients where meta_message_id='campaign-test'")).status,'read');
assert.equal((await one("select has_function_privilege('authenticated','start_whatsapp_campaign(uuid,uuid)','execute') ok")).ok,false);
console.log('PASS campaigns draft-first, deduplicated recipients, permission required, opt-outs persist, claims not repeated and delivery status monotonic');

// Demo only claims a single, opted-in participant inside their reply window.
const demoPhone='+570000000088',demoCid=await chat(demoPhone),demoId='20000000-0000-4000-8000-000000000088';
const demoClaim=async(id=demoId,phone=demoPhone)=>(await one('select claim_whatsapp_demo($1,$2,$3,$4) r',[uid,id,phone,flyer])).r;
assert.match((await demoClaim()).error,/primero/);
await inbound(demoCid);
assert.equal((await demoClaim()).send,true);assert.equal((await demoClaim()).send,false);
await assert.rejects(()=>demoClaim(demoId,'+570000000089'),/otro envío/);
await db.query("update whatsapp_demo_sends set status='sent',meta_message_id='demo-test' where id=$1",[demoId]);
await db.query("select record_whatsapp_message_status('demo-test','read',now(),'{}','demo-read')");
await db.query("select record_whatsapp_message_status('demo-test','failed',now(),'{}','demo-failed')");
assert.equal((await one('select status from whatsapp_demo_sends where id=$1',[demoId])).status,'read');
await db.query("select marketing_opt_out($1,'Baja demo')",[demoPhone]);
assert.match((await demoClaim('20000000-0000-4000-8000-000000000089')).error,/no recibir/);
assert.equal((await one("select has_function_privilege('authenticated','claim_whatsapp_demo(uuid,uuid,text,uuid)','execute') ok")).ok,false);
assert.equal((await one('select prepare_whatsapp_order_notification($1,$2) r',[order.message_ids[0],'+570000000099'])).r,null,'customer window never authorizes an owner alert');
console.log('PASS demo window, opt-out, idempotency, status ordering, restricted permissions and separate owner window');

// Only eligible new-engine tasks enter public recovery, across customer numbers.
await db.query("update automation_outbox set status='processed'");
const publicCid=await chat('+570000000091');await inbound(publicCid,'Consulta pública');
const publicTask=(await one("select * from create_human_task($1,'public-test','general','normal','Consulta','Pregunta de prueba','{\"pilot_engine\":\"new-whatsapp-v1\"}',null,'+570000000099',null)",[publicCid]));
const publicTid=Array.isArray(publicTask)?publicTask[0].id:publicTask.id;
assert.ok(publicTid);
assert.equal((await one("select next_public_bot_task('+570000000099') r")).r,null,'closed owner window must not starve completed customer replies');
await db.query("select resolve_human_task($1,'resolved','{\"answer\":\"Respuesta pública\"}')",[publicTid]);
assert.equal((await one("select next_public_bot_task('+570000000099') r")).r.id,publicTid);
await db.query('update whatsapp_conversations set automation_paused=true where id=$1',[publicCid]);
assert.equal((await one("select next_public_bot_task('+570000000099') r")).r,null);
console.log('PASS public recovery reaches a different customer and respects manual takeover');

const privateChat=(await one("select ingest_whatsapp_message(null,'CO.TESTPRIVATE123','Prueba privada','private-ingress','text','Hola',null,'{}','whatsapp',null) r")).r;
assert.equal(privateChat.phone_e164,null);assert.equal(privateChat.recipient_id,'CO.TESTPRIVATE123');
const privateNotice=(await one("select queue_outbound_whatsapp_message($1,'privacy-notice:pilot:private-test','system','text','Responde ACEPTO','{}') r",[privateChat.conversation_id])).r;
assert.equal((await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[privateNotice.message_id])).r.to,'CO.TESTPRIVATE123');
console.log('PASS private-identity ingress and real SQL outbound claim preserve recipient without a phone');

// New v1 hours are tested with an isolated clock; production always uses now().
for(const [at,attention,delivery] of [['2026-10-02T13:59:59Z',false,false],['2026-10-02T14:00:00Z',true,true],['2026-10-03T00:00:00Z',true,false],['2026-10-03T01:00:00Z',false,false]]){
 const win=(await one('select bot_service_window($1) r',[at])).r;assert.equal(win.attention_open,attention);assert.equal(win.delivery_open,delivery);
}
for(const fn of ['defer_bot_service_turn(uuid,uuid,integer,text,boolean)','prepare_next_bot_service_reminder()','finish_bot_service_reminder(uuid)'])assert.equal((await one("select has_function_privilege('authenticated',$1,'execute') ok",['public.'+fn])).ok,false);
const pendingCid=await chat('+570000000201');
await db.query("update whatsapp_conversations set consent_status='pending',consented_at=null,consent_version=null where id=$1",[pendingCid]);
const consentMsg=async(cid,body)=>{const id=await inbound(cid,body);await db.query('update whatsapp_messages set meta_message_id=$2 where id=$1',[id,'consent-'+id]);return id;};
const record=async(cid,id,text)=>(await one("select record_whatsapp_consent($1,'2026-10-02','Aviso sintético',$2,$3) r",[cid,text,'consent-'+id])).r;
const beforeNotice=await consentMsg(pendingCid,'sí');assert.equal((await record(pendingCid,beforeNotice,'sí')).recognized,false);
const notice=(await one("select queue_outbound_whatsapp_message($1,'privacy-notice:pilot:test-consent','system','text','Aviso sintético','{}') r",[pendingCid])).r;
await db.query("update whatsapp_messages set delivery_status='sent',sent_at=now()-interval '1 second' where id=$1",[notice.message_id]);
const vague=await consentMsg(pendingCid,'Si tienen domicilios?');assert.equal((await record(pendingCid,vague,'Si tienen domicilios?')).recognized,false);
const yes=await consentMsg(pendingCid,'Sí!');assert.equal((await record(pendingCid,yes,'Sí!')).granted,true);
assert.equal((await one('select customer_response from privacy_consents where conversation_id=$1',[pendingCid])).customer_response,'Sí!');
const ordinaryYes=await consentMsg(pendingCid,'si');assert.equal((await record(pendingCid,ordinaryYes,'si')).recognized,false);
assert.equal((await record(pendingCid,yes,'Sí!')).duplicate,true);
const noCid=await chat('+570000000202');await db.query("update whatsapp_conversations set consent_status='pending',consented_at=null,consent_version=null where id=$1",[noCid]);
const noNotice=(await one("select queue_outbound_whatsapp_message($1,'privacy-notice:pilot:test-no','system','text','Aviso sintético','{}') r",[noCid])).r;
await db.query("update whatsapp_messages set delivery_status='sent',sent_at=now()-interval '1 second' where id=$1",[noNotice.message_id]);
const no=await consentMsg(noCid,'No');assert.equal((await record(noCid,no,'No')).granted,false);assert.equal((await one('select status from whatsapp_conversations where id=$1',[noCid])).status,'closed');
console.log('PASS exact SI/ACEPTO consent after notice; preserves literal evidence, rejects vague/before-notice SI and respects NO');

await db.exec(`alter function public.bot_service_window(timestamptz) rename to bot_service_window_real;
 create function public.bot_service_window(p_at timestamptz default now()) returns jsonb language sql stable as $$select public.bot_service_window_real(coalesce(nullif(current_setting('test.service_clock',true),'')::timestamptz,p_at))$$;`);
const clock=async(at)=>db.query("select set_config('test.service_clock',$1,false)",[at]);
const defer=async(cid,mid,kind='attention',notify=true)=>(await one('select defer_bot_service_turn($1,$2,(select automation_control_version from whatsapp_conversations where id=$1),$3,$4) r',[cid,mid,kind,notify])).r;
await clock('2026-10-03T01:00:00Z');
const waitCid=await chat('+570000000203'),waitMid=await inbound(waitCid,'Consulta fuera de horario');
const wait=await defer(waitCid,waitMid);assert.ok(wait.wait_id);assert.equal(Date.parse(wait.due_at),Date.parse('2026-10-03T14:00:00Z'));
assert.equal((await defer(waitCid,waitMid)).message_id,wait.message_id);
const newerWaitMid=await inbound(waitCid,'Otra consulta durante el cierre');const newerWait=await defer(waitCid,newerWaitMid);assert.equal(newerWait.wait_id,wait.wait_id);assert.equal(newerWait.message_id,wait.message_id);
const ack=(await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[wait.message_id])).r;assert.equal(ack.send,true);
await db.query("update whatsapp_messages set meta_message_id='test-hours-ack',delivery_status='sent' where id=$1",[wait.message_id]);
assert.equal((await one('select prepare_next_bot_service_reminder() r')).r,null);
const afterClosing=await commit(waitCid,{service_hours_enforced:true,intent:'information',reply_text:'No se debe enviar.'},newerWaitMid);assert.equal(afterClosing.reason,'outside_attention_hours');
assert.equal((await one('select count(*)::int n from ai_runs where message_id=$1',[newerWaitMid])).n,0);
await db.query("update bot_service_waits set due_at=now()-interval '1 minute' where id=$1",[wait.wait_id]);
await clock('2026-10-03T14:00:00Z');
const reminder=(await one('select prepare_next_bot_service_reminder() r')).r;assert.equal(reminder.wait_id,wait.wait_id);assert.ok(reminder.message_id);
assert.equal((await one('select prepare_next_bot_service_reminder() r')).r.message_id,reminder.message_id);
const openingClaim=(await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[reminder.message_id])).r;assert.equal(openingClaim.send,true);
await db.query("update whatsapp_messages set meta_message_id='test-hours-opening',delivery_status='sent' where id=$1",[reminder.message_id]);await db.query('select finish_bot_service_reminder($1)',[wait.wait_id]);
assert.equal((await one('select status from bot_service_waits where id=$1',[wait.wait_id])).status,'notified');assert.equal((await one('select prepare_next_bot_service_reminder() r')).r,null);
console.log('PASS outside-hours no AI/order, one notice per burst, one durable opening reminder and confirmed-only completion');

for(const mode of ['manual','new_message','expired','denied','control']){
 await clock('2026-10-03T01:00:00Z');
 const cid=await chat('+570000000'+(210+['manual','new_message','expired','denied','control'].indexOf(mode))),mid=await inbound(cid);const w=await defer(cid,mid);
 await db.query("update bot_service_waits set due_at=now()-interval '1 minute' where id=$1",[w.wait_id]);
 if(mode==='manual')await db.query('update whatsapp_conversations set automation_paused=true where id=$1',[cid]);
 if(mode==='new_message')await inbound(cid);
 if(mode==='expired')await db.query("update whatsapp_messages set created_at=now()-interval '24 hours' where id=$1",[mid]);
 if(mode==='denied')await db.query("update whatsapp_conversations set consent_status='denied' where id=$1",[cid]);
 if(mode==='control')await db.query('update whatsapp_conversations set automation_control_version=automation_control_version+1 where id=$1',[cid]);
 await clock('2026-10-03T14:00:00Z');const result=(await one('select prepare_next_bot_service_reminder() r')).r;
 assert.equal(result.wait_id,w.wait_id);assert.equal(result.message_id,undefined);assert.equal((await one('select status from bot_service_waits where id=$1',[w.wait_id])).status,mode==='expired'?'expired':'cancelled');
}
console.log('PASS opening recovery cancels stale/manual/revoked/control-changed chats and does not send expired free text');
await clock('2026-10-03T00:00:00Z');
await db.query('update branch_inventory set available_qty=20');await db.query('update branch_inventory set stock_confirmed_at=now(),stock_confirmed_by=$1',[uid]);
const cutoffCid=await chat('+570000000220');const cutoff=await commit(cutoffCid,{...cart,service_hours_enforced:true});
assert.equal(cutoff.delivery_deferred,true);assert.equal(cutoff.task_ids.length,0);assert.equal(cutoff.order_id,null);assert.match((await body(cutoff)).body,/7:00 p\. m\./);
assert.equal((await state(cutoffCid)).delivery_address,cart.checkout.delivery_address);assert.equal((await state(cutoffCid)).recipient_phone,cart.checkout.recipient_phone);
const deliveryWait=await defer(cutoffCid,cutoff.mid,'delivery',false);assert.equal(deliveryWait.message_id,null);
const latePickupCid=await chat('+570000000221');const latePickup=await commit(latePickupCid,{...cart,checkout:{customer_name:'Ana',fulfillment_type:'pickup'},service_hours_enforced:true});assert.equal(latePickup.delivery_deferred,false);assert.match((await body(latePickup)).body,/Recogida en sede/);
const infoAt19=await commit(latePickupCid,{intent:'information',reply_text:'Seguimos atendiendo consultas.',service_hours_enforced:true});assert.equal((await body(infoAt19)).body,'Seguimos atendiendo consultas.');
// A pre-closing reply is checked again immediately before its send lease.
await clock('2026-10-03T01:00:00Z');const lateClaim=(await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[infoAt19.message_ids[0]])).r;assert.equal(lateClaim.reason,'outside_attention_hours');assert.equal((await one('select send_started_at from whatsapp_messages where id=$1',[infoAt19.message_ids[0]])).send_started_at,null);
console.log('PASS 19:00 cutoff preserves delivery data, creates no order/tariff/payment, allows pickup/info until 20:00; send-time guard blocks a late reply');

await clock('2026-10-02T23:59:00Z');
const paidLateCid=await chat('+570000000222');const feeLate=await commit(paidLateCid,{...cart,service_hours_enforced:true});await sent(feeLate);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"delivery_fee\":10000}')",[feeLate.task_ids[0]]);
const summaryLate=await commit(paidLateCid,{service_hours_enforced:true},feeLate.mid,feeLate.task_ids[0]);await sent(summaryLate);
const qrLate=await commit(paidLateCid,{accept_summary:true,checkout:{payment_method:'transfer'},service_hours_enforced:true});
await clock('2026-10-03T00:00:00Z');const deliveryClaim=(await one('select claim_outbound_whatsapp_message($1,gen_random_uuid()) r',[qrLate.message_ids[0]])).r;assert.equal(deliveryClaim.reason,'outside_delivery_hours');
await clock('2026-10-02T23:59:00Z');await sent(qrLate);
const paidLateMid=await inbound(paidLateCid,'Comprobante sintético');await db.query("insert into whatsapp_attachments(conversation_id,message_id,meta_media_id,storage_path,mime_type,size_bytes) values($1,$2,'late-proof','test/late-proof.png','image/png',120)",[paidLateCid,paidLateMid]);
const paidLateReview=await commit(paidLateCid,{intent:'handoff',actions:[{type:'propose_human_task',reason:'payment_review'}],service_hours_enforced:true},paidLateMid);await sent(paidLateReview);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"approved\":true,\"amount\":260000}')",[paidLateReview.task_ids[0]]);
await clock('2026-10-03T00:00:00Z');const holdApproved=await commit(paidLateCid,{service_hours_enforced:true},paidLateMid,paidLateReview.task_ids[0]);assert.equal(holdApproved.delivery_deferred,true);assert.equal(holdApproved.order_id,null);assert.equal((await state(paidLateCid)).approved_payment_task_id,paidLateReview.task_ids[0]);assert.match((await body(holdApproved)).body,/no hagas otra transferencia/);
console.log('PASS 19:00 dispatch lease blocks a late QR; late payment approval retains proof and approval without an order or another payment');


}catch(e){console.error(e.message,e.where||'',e.detail||'');process.exitCode=1;}finally{await db.close();}
