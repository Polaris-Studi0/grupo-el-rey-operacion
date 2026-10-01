import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/worker.js';
import {snapshotFixture} from './helpers/bot-snapshot.mjs';
const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function run(body,handoff,images=false,publicCustomer=false,bsuid=false){
 const env={BOT_PILOT_ENABLED:'true',BOT_PILOT_PHONE:'573000000001',WHATSAPP_APP_SECRET:'test-signature',WHATSAPP_ACCESS_TOKEN:'test-meta',WHATSAPP_PHONE_NUMBER_ID:'test-business',SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',N8N_REBUILD_WEBHOOK_SECRET:'test-n8n'};
 if(publicCustomer)env.BOT_PUBLIC_ENABLED='true';
 const customer=bsuid?'CO.TEST123456':publicCustomer?'573000000008':env.BOT_PILOT_PHONE;
 const now=new Date().toISOString();const db={whatsapp_conversations:[{id:id(1),contact_id:id(2),branch_id:'b8',status:'open',consent_status:'granted',consented_at:now,consent_version:'v1',automation_paused:false,automation_control_version:0,updated_at:now,last_message_at:now,sales_state:{}}],whatsapp_contacts:[{id:id(2),phone_e164:bsuid?null:'+'+customer,whatsapp_id:customer,preferred_name:'Prueba'}],branches:[{id:'b1',name:'Robledo Aures'},{id:'b8',name:'La Estrella'},{id:'b10',name:'San Antonio de Prado'}],whatsapp_messages:[{id:id(3),conversation_id:id(1),direction:'inbound',sender_type:'customer',body,message_type:'text',created_at:now}],branch_knowledge:[],branch_inventory:[],branch_payment_qrs:[],whatsapp_operator_actions:[],orders:[],human_tasks:[],inventory_reservations:[],whatsapp_attachments:[],ai_runs:[],privacy_consents:[{granted:true}]};
 const original=globalThis.fetch,requests=[],sends=[],queue=new Map(),completions=[],waits=[];let modelCalls=0;
 globalThis.fetch=async(value,init={})=>{
  const u=new URL(String(value));requests.push(u.pathname);assert.ok(requests.length<=50,'whole webhook exceeded its subrequest budget');
  const b=init.body&&!(init.body instanceof FormData)?JSON.parse(init.body):{};
  if(u.pathname.includes('/storage/'))return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});
  if(u.hostname==='graph.facebook.com'&&u.pathname.endsWith('/media'))return Response.json({id:'test-image'});
  if(u.hostname==='intranetelrey.app.n8n.cloud'){
   modelCalls++;return Response.json({contract:'el-rey.bot.decision.v1',status:'decision_ready',mode:'pilot',source:'intranet',turn_id:b.turn_id,conversation_id:b.conversation_id,expected_control_version:0,expected_context_version:b.context_version,expected_context_fingerprint:b.context_fingerprint,expires_at:b.snapshot.expires_at,send_allowed:false,mutations_executed:[],decision:{intent:'handoff',reply_text:'El equipo debe confirmar ese dato.',actions:[{type:'propose_human_task',reason:'missing_information',question:'Confirmar el dato consultado.'}]}});
  }
  if(u.hostname==='graph.facebook.com'){sends.push(b);return Response.json({messages:[{id:'test-meta-'+sends.length}]});}
  const name=u.pathname.split('/').at(-1);
  if(name==='bot_context_snapshot')return Response.json(snapshotFixture(db));
  if(u.pathname.includes('/rpc/')){
   let r={};
   if(name==='claim_whatsapp_event')r=[{lease_id:id(4)}];
   else if(name==='ingest_whatsapp_message')r={created:true,conversation_id:id(1),message_id:id(3)};
   else if(name==='queue_outbound_whatsapp_message'){queue.set(id(5),{text:b.p_body});r={message_id:id(5)};}
   else if(name==='commit_bot_commerce_turn'){queue.set(id(5),{text:b.p_decision.reply_text});const imageIds=images?[id(20),id(21)]:[];for(const iid of imageIds)queue.set(iid,{type:'image',storage_bucket:'bot-images',storage_path:'product/test.jpg',mime_type:'image/jpeg',caption:'Producto de prueba'});r={message_ids:[id(5),...imageIds],task_ids:images?[]:[id(6)],control_version:0,inbound_message_id:id(3)};}
   else if(name==='claim_automation_event')r=[{id:id(7),lease_id:id(8)}];
   else if(name==='prepare_whatsapp_automation_message'){queue.set(id(9),{text:'Aviso privado de prueba'});r={message_id:id(9)};}
   else if(name==='claim_outbound_whatsapp_message')r={send:true,message_id:b.p_message_id,to:b.p_message_id===id(9)?env.BOT_PILOT_PHONE:customer,type:'text',...queue.get(b.p_message_id)};
   else if(name==='complete_whatsapp_event')completions.push(b);
   else if(!['complete_outbound_whatsapp_message','complete_automation_event'].includes(name))throw Error('Unexpected RPC '+name);
   return Response.json(r);
  }
  if(name==='whatsapp_webhook_inbox')return Response.json({});
  if(name==='whatsapp_messages'&&(u.searchParams.has('idempotency_key')||u.searchParams.get('direction')==='eq.outbound'))return Response.json([]);
  assert.ok(name in db,'Unexpected table '+name);return Response.json(db[name]);
 };
 try{
  const payload=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{messages:[{id:'wamid.test',...(bsuid?{from_user_id:customer}:{from:customer}),type:'text',timestamp:String(Math.floor(Date.now()/1000)),text:{body}}]}}]}]});
  const sig=createHmac('sha256',env.WHATSAPP_APP_SECRET).update(payload).digest('hex');
  const response=await worker.fetch(new Request('https://intranet.invalid/api/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256='+sig},body:payload}),env,{waitUntil:p=>waits.push(p)});
  await Promise.all(waits);assert.equal(response.status,200);assert.equal(completions.length,1);assert.equal(completions[0].p_error,null);assert.equal(modelCalls,handoff?1:0);assert.equal(sends.length,images?3:handoff?2:1);
  assert.equal(bsuid?sends[0].recipient:sends[0].to,customer);if(bsuid)assert.equal(sends[0].to,undefined);
  if(images){assert.equal(sends[1].image.id,'test-image');}
  else if(handoff){assert.match(sends[0].text.body,/confirmar ese dato/);assert.match(sends[1].text.body,/Aviso privado/);}
  else{assert.match(sends[0].text.body,/1\. Robledo Aures\n2\. La Estrella\n3\. San Antonio de Prado/);assert.doesNotMatch(sends[0].text.body,/\bb(?:10|[1-9])\b/);}
  assert.ok(requests.length<=(images?50:35),`leave headroom for media/recovery; used ${requests.length}`);
  return requests.length;
 }finally{globalThis.fetch=original;}
}
test('signed Meta branch request reaches the actual outbound sender without AI',async t=>t.diagnostic(`Subrequests: ${await run('muestrame todas las sedes',false)}`));
test('signed Meta unknown query completes client and owner deliveries in one request budget',async t=>t.diagnostic(`Subrequests: ${await run('¿Tienen cargador para carros eléctricos?',true)}`));

test('two product photos fit the signed webhook budget and use stored media',async t=>t.diagnostic(`Subrequests: ${await run('Muéstrame las dos fotos',true,true)}`));

test('public signed message is delivered to a different customer',async t=>t.diagnostic(`Subrequests: ${await run('muestrame todas las sedes',false,false,true)}`));

test('private WhatsApp identity without phone reaches actual sender via recipient',async t=>t.diagnostic(`Subrequests: ${await run('muestrame todas las sedes',false,false,true,true)}`));
