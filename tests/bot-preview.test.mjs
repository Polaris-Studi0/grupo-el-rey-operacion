import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {loadPreviewContext} from '../src/bot-preview.js';

const cid='10000000-0000-4000-8000-000000000001',uid='10000000-0000-4000-8000-000000000002',mid='10000000-0000-4000-8000-000000000003',pid='10000000-0000-4000-8000-000000000004';
const env={SUPABASE_URL:'https://supabase.invalid',SUPABASE_SECRET_KEY:'private-db-test',N8N_REBUILD_WEBHOOK_SECRET:'private-new-webhook'};
const operator={id:uid,role:'admin',active:true,branch_id:null};
function database(){
  return {
    whatsapp_conversations:[{id:cid,contact_id:uid,branch_id:'b1',automation_paused:false,automation_control_version:2,consent_status:'granted',consented_at:'2026-09-01T12:00:00Z',consent_version:'v1',status:'open',updated_at:'2026-09-28T12:00:00Z',last_message_at:'2026-09-28T12:00:00Z'}],
    branches:[{id:'b1',name:'Sede de prueba'}],whatsapp_contacts:[{preferred_name:'Ana'}],
    whatsapp_messages:[{id:mid,conversation_id:cid,direction:'inbound',sender_type:'customer',message_type:'text',body:'¿A qué hora cierran?',created_at:'2026-09-28T12:00:00Z',delivery_status:'received'}],
    branch_knowledge:[{id:pid,title:'Horario',category:'schedule',content:'Cierre a las 20:00',active:true}],
    branch_inventory:[{branch_id:'b1',product_id:pid,price:90000,promotional_price:50000,promotion_from:'2026-09-01T00:00:00Z',promotion_until:'2026-10-01T00:00:00Z',available_qty:5,reserved_qty:2,active:true,updated_at:new Date().toISOString(),product:{id:pid,name:'Producto de prueba',active:true,seasonal:true}}],
    branch_payment_qrs:[{branch_id:'b1',storage_path:'b1/private-qr.png',mime_type:'image/png',updated_at:'2026-09-01T00:00:00Z'}],
    whatsapp_operator_actions:[{request_id:pid,payload:{text:'Pregunta interna para el equipo'}}],whatsapp_attachments:[],orders:[],inventory_reservations:[],human_tasks:[]
  };
}
async function harness(options={},run){
  const original=globalThis.fetch,db=database(),calls=[];options.setup?.(db);let authReads=0;
  globalThis.fetch=async(value,init={})=>{
    const url=new URL(String(value));calls.push({url,init});
    if(url.pathname==='/auth/v1/user'){authReads++;return Response.json(options.unauthenticated||options.revokeAfterModel&&authReads>1?{}:{id:uid});}
    if(url.pathname.endsWith('/profiles'))return Response.json([{...operator,...options.profile}]);
    if(url.hostname==='intranetelrey.app.n8n.cloud'){
      const packet=JSON.parse(init.body);options.inspectPacket?.(packet,init);
      if(options.mutateDuringModel)options.mutateDuringModel(db);
      if(options.upstreamStatus)return new Response('',{status:options.upstreamStatus,headers:{location:'https://attacker.invalid'}});
      return Response.json({contract:'el-rey.bot.decision.v1',status:'decision_ready',mode:'preview',source:'intranet',turn_id:packet.turn_id,conversation_id:cid,
        expected_control_version:2,expected_context_version:packet.context_version,expected_context_fingerprint:packet.context_fingerprint,expires_at:packet.snapshot.expires_at,
        send_allowed:false,mutations_executed:[],decision:{intent:'information',reply_text:'Cerramos a las 20:00.'},...options.modelOverrides});
    }
    if(url.hostname==='supabase.invalid'&&url.pathname.startsWith('/rest/v1/')){
      assert.equal(init.method||'GET','GET','preview must not mutate Supabase');
      const table=url.pathname.endsWith('/rpc/bot_customer_orders')?'orders':url.pathname.split('/').at(-1);if(!(table in db))throw Error('Unexpected table '+table);
      if(options.unavailableTable===table)return Response.json({}, {status:503});
      return Response.json(db[table]);
    }
    throw Error('Unexpected request '+url);
  };
  try{return await run({db,calls});}finally{globalThis.fetch=original;}
}
async function request(options={}){
  return harness(options,async({calls})=>{
    const response=await worker.fetch(new Request('https://intranet.invalid/api/operator/bot-preview',{method:'POST',headers:{authorization:'Bearer operator-test'},body:JSON.stringify({conversation_id:cid,expected_version:2,...options.body})}),env,{});
    return {status:response.status,body:await response.json(),calls};
  });
}
test('preview uses verified context, new credential and read-only calls; never sends WhatsApp',async()=>{
  const result=await request({inspectPacket(packet,init){
    assert.equal(packet.mode,'preview');assert.equal(packet.snapshot.source,'intranet');assert.match(packet.context_fingerprint,/^[a-f0-9]{64}$/);
    assert.equal(packet.snapshot.customer.name,'Ana');assert.equal(packet.snapshot.message.id,mid);
    assert.equal(packet.snapshot.products[0].stock_verified,false,'generic updated_at is not a stock count');
    assert.equal(packet.snapshot.payment.ready_for_qr,false);assert.equal(JSON.stringify(packet).includes('private-qr'),false);
    assert.deepEqual(init.headers,{'content-type':'application/json','x-elrey-webhook-secret':env.N8N_REBUILD_WEBHOOK_SECRET});
    assert.equal(init.redirect,'manual');
  }});
  assert.equal(result.status,200);assert.equal(result.body.sent,false);assert.match(result.body.reply_text,/20:00/);
  assert.equal(result.calls.filter(c=>c.url.hostname.includes('n8n')).length,1);
  assert.equal(result.calls.some(c=>c.url.hostname.includes('facebook')),false);
});
test('unauthenticated and wrong-branch users cannot load a client history or invoke AI',async()=>{
  for(const options of [{unauthenticated:true},{profile:{role:'cashier',branch_id:'b2'}}]){
    const result=await request(options);assert.ok([401,403].includes(result.status));
    assert.equal(result.calls.some(c=>c.url.pathname.endsWith('/whatsapp_messages')||c.url.hostname.includes('n8n')),false);
  }
});
test('consent, manual control, closed state and stale version block before reading history',async()=>{
  for(const patch of [{consent_status:'pending'},{consented_at:null},{automation_paused:true},{status:'closed'},{automation_control_version:3}]){
    const result=await request({setup:db=>Object.assign(db.whatsapp_conversations[0],patch)});
    assert.equal(result.status,409);assert.equal(result.calls.some(c=>c.url.pathname.endsWith('/whatsapp_messages')||c.url.hostname.includes('n8n')),false);
  }
});
test('bad identifiers and missing versions never query conversations',async()=>{
  for(const body of [{conversation_id:'x),id.neq.null'},{expected_version:null},{expected_version:-1}]){
    const result=await request({body});assert.equal(result.status,400);assert.equal(result.calls.some(c=>c.url.pathname.endsWith('/whatsapp_conversations')),false);
  }
});
test('scope is enforced in database queries and messages not delivered are omitted',async()=>{
  await harness({setup:db=>db.whatsapp_messages.unshift({id:pid,direction:'outbound',sender_type:'assistant',body:'UNSENT',delivery_status:'queued'})},async({calls})=>{
    const result=await loadPreviewContext(env,operator,cid,2);
    assert.equal(JSON.stringify(result.snapshot.history).includes('UNSENT'),false);
    for(const table of ['whatsapp_messages','whatsapp_operator_actions','whatsapp_attachments'])assert.equal(calls.find(c=>c.url.pathname.endsWith('/'+table)).url.searchParams.get('conversation_id'),'eq.'+cid);
    assert.equal(calls.find(c=>c.url.pathname.endsWith('/branch_inventory')).url.searchParams.get('branch_id'),'eq.b1');
  });
});
test('effective price, reserved quantity and explicit stock freshness are calculated by server',async()=>{
  await harness({setup:db=>db.branch_inventory[0].stock_confirmed_at='2026-09-28T12:00:00Z'},async()=>{
    const fresh=await loadPreviewContext({...env,BOT_STOCK_MAX_AGE_MINUTES:'60'},operator,cid,2,Date.parse('2026-09-28T12:30:00Z'));
    assert.equal(fresh.snapshot.products[0].price_cop,50000);assert.equal(fresh.snapshot.products[0].available_quantity,3);assert.equal(fresh.snapshot.products[0].stock_verified,true);
    const expired=await loadPreviewContext({...env,BOT_STOCK_MAX_AGE_MINUTES:'60'},operator,cid,2,Date.parse('2026-10-02T12:30:00Z'));
    assert.equal(expired.snapshot.products[0].price_cop,90000);assert.equal(expired.snapshot.products[0].stock_verified,false);
  });
});
test('attachment is bound to the exact inbound message; it is never treated as payment approval',async()=>{
  await harness({setup:db=>db.whatsapp_attachments=[{id:pid,message_id:'other-message',storage_path:'private.png'}]},async()=>{
    const result=await loadPreviewContext(env,operator,cid,2);assert.equal(result.snapshot.message.attachment,undefined);assert.equal(result.snapshot.payment.ready_for_qr,false);
  });
});
test('new message, new knowledge, control takeover and revoked login discard the result',async()=>{
  const mutations=[db=>db.whatsapp_messages[0].body='Nueva pregunta',db=>db.branch_knowledge[0].content='Nuevo horario',db=>db.whatsapp_conversations[0].automation_paused=true];
  for(const mutateDuringModel of mutations){const result=await request({mutateDuringModel});assert.equal(result.status,409);assert.equal(result.body.reply_text,undefined);}
  const revoked=await request({revokeAfterModel:true});assert.equal(revoked.status,401);assert.equal(revoked.body.reply_text,undefined);
});
test('cross-conversation, unverified output, mutation claims and redirects fail closed',async()=>{
  for(const modelOverrides of [{conversation_id:pid},{turn_id:pid},{expected_context_fingerprint:'bad'},{send_allowed:true},{mutations_executed:['sent']},{mode:'test'},{expires_at:'2020-01-01T00:00:00Z'}]){
    const result=await request({modelOverrides});assert.ok([409,503].includes(result.status));assert.equal(result.body.reply_text,undefined);
  }
  const redirect=await request({upstreamStatus:302});assert.equal(redirect.status,503);assert.equal(redirect.calls.some(c=>c.url.hostname==='attacker.invalid'),false);
});
test('a failed database read is not an empty catalogue',async()=>{
  const result=await request({unavailableTable:'branch_inventory'});assert.equal(result.status,503);assert.equal(result.calls.some(c=>c.url.hostname.includes('n8n')),false);
});
