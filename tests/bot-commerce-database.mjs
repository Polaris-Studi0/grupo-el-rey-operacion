import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
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
const loser=await commit(cb,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await body(loser)).message_type,'text');assert.match((await body(loser)).body,/confirmar las existencias/);assert.equal((await one('select reserved_qty from branch_inventory')).reserved_qty,1);
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

for(const r of (await db.query("select id from inventory_reservations where status='active'")).rows)await db.query('select release_chat_inventory($1)',[r.id]);
await db.exec("update branch_inventory set available_qty=2;update branch_inventory set stock_confirmed_at=now();update branch_payment_qrs set mime_type='image/webp';");
const cq=await chat('+570000000019');const qq=await commit(cq,{intent:'quote',quote:cart.quote,checkout:{customer_name:'QR test',fulfillment_type:'pickup'}});await sent(qq);
const unavailable=await commit(cq,{accept_summary:true,checkout:{payment_method:'transfer'}});assert.equal((await body(unavailable)).message_type,'text');assert.match((await body(unavailable)).body,/QR.*revisión/);assert.ok(unavailable.task_ids.length);
console.log('PASS unsupported QR formats request correction instead of sending an invalid image');

const cc=await chat('+570000000020');const qc=await commit(cc,{intent:'quote',quote:cart.quote,checkout:{customer_name:'Crédito test',fulfillment_type:'pickup'}});await sent(qc);
const cr=await commit(cc,{accept_summary:true,checkout:{payment_method:'addi'}});assert.equal(cr.task_ids.length,1);assert.equal(cr.order_id,null);
await db.query("select resolve_bot_commerce_task($1,'resolved','{\"approved\":true,\"amount\":250000}')",[cr.task_ids[0]]);
const co=await commit(cc,{},cr.mid,cr.task_ids[0]);assert.ok(co.order_id);assert.equal((await one('select payment_method from orders where id=$1',[co.order_id])).payment_method,'addi');
console.log('PASS credit approval requires the explicit human decision before creating an order');

}catch(e){console.error(e.message,e.where||'',e.detail||'');process.exitCode=1;}finally{await db.close();}
