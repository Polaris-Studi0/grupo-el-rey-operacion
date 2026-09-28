import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {historyQuery,fetchConversationPage,mergeHistory,prepareOperatorRequest} from '../src/lib/chat-history.js';
const cid='20000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000002',rid='20000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://supabase.invalid',SUPABASE_SECRET_KEY:'test',WHATSAPP_ACCESS_TOKEN:'test',WHATSAPP_PHONE_NUMBER_ID:'test',N8N_AUTOMATION_URL:'https://old-n8n.invalid',N8N_WEBHOOK_SECRET:'test'};
const base={conversation_id:cid,request_id:rid,action:'instruction',text:'Confirmar stock con bodega',expected_version:1};
async function request(body,handler=()=>null,path='/api/operator/conversation'){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  url=String(url);const data=options.body?JSON.parse(options.body):null;calls.push({url,data});
  const custom=handler(url,data);if(custom)return custom;
  if(url.endsWith('/auth/v1/user'))return Response.json({id:uid});
  if(url.includes('/profiles?'))return Response.json([{id:uid,role:'admin',branch_id:null}]);
  if(url.endsWith('/apply_whatsapp_operator_action'))return Response.json({ok:true,request_id:rid,instruction_saved:true,automation_paused:true});
  throw Error(`Unexpected network call: ${url}`);
 };
 try{
  const result=await worker.fetch(new Request(`https://intranet.invalid${path}`,{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify(body)}),env,{});
  return {status:result.status,body:await result.json(),calls};
 }finally{globalThis.fetch=original;}
}
test('internal instruction is durable and never wakes old n8n or Meta',async()=>{
 const result=await request({...base,operator_id:'attacker'});
 assert.equal(result.status,200);assert.equal(result.body.instruction_saved,true);
 const rpc=result.calls.find(c=>c.url.endsWith('/apply_whatsapp_operator_action'));
 assert.equal(rpc.data.p_operator_id,uid);assert.equal(rpc.data.p_expected_version,1);
 assert.equal(result.calls.some(c=>/n8n|facebook/.test(c.url)),false);
});
test('database rejects another branch before any delivery',async()=>{
 const result=await request({...base,action:'message'},url=>url.endsWith('/apply_whatsapp_operator_action')?Response.json({code:'42501',message:'No tienes acceso'}, {status:403}):null);
 assert.equal(result.status,403);assert.equal(result.calls.some(c=>/facebook/.test(c.url)),false);
});
test('stale control version produces actionable conflict',async()=>{
 const result=await request(base,url=>url.endsWith('/apply_whatsapp_operator_action')?Response.json({code:'40001',message:'Actualiza la conversación'}, {status:400}):null);
 assert.equal(result.status,409);assert.equal(result.body.code,'40001');
});
test('malformed mode, version, UUID and excessive text never reach mutation',async()=>{
 for(const body of [{...base,action:'takeover',paused:'false'},{...base,expected_version:null},{...base,request_id:'not-a-uuid'},{...base,text:'x'.repeat(4097)}]){
  const result=await request(body);assert.equal(result.status,400);assert.equal(result.calls.some(c=>c.url.includes('/rpc/')),false);
 }
});
test('unauthenticated operator is rejected',async()=>{
 const result=await request(base,url=>url.endsWith('/auth/v1/user')?Response.json({}, {status:401}):null);
 assert.equal(result.status,401);assert.equal(result.calls.length,1);
});
test('uncertain human send does not make a second Meta request',async()=>{
 const result=await request({...base,action:'message'},url=>{
  if(url.endsWith('/apply_whatsapp_operator_action'))return Response.json({ok:true,duplicate:true,message_id:rid});
  if(url.endsWith('/claim_outbound_whatsapp_message'))return Response.json({send:false,state:'blocked_uncertain'});
 });
 assert.equal(result.status,409);assert.match(result.body.error,/No se enviará otra copia/);assert.equal(result.calls.some(c=>c.url.includes('facebook')),false);
});
test('manual task answer does not wake the old assistant while paused',async()=>{
 const result=await request({task_id:rid},url=>{
  if(url.includes('/human_tasks?'))return Response.json([{conversation_id:cid}]);
  if(url.includes('/whatsapp_conversations?'))return Response.json([{id:cid,branch_id:'b1',automation_paused:true}]);
 },'/api/automation/wake');
 assert.equal(result.status,200);assert.equal(result.body.deferred,true);assert.equal(result.calls.some(c=>c.url.includes('n8n')),false);
});
test('media recovery blocks a cashier from a different branch',async()=>{
 const result=await request({message_id:rid},url=>{
  if(url.includes('/profiles?'))return Response.json([{id:uid,role:'cashier',branch_id:'b2'}]);
  if(url.includes('/whatsapp_messages?'))return Response.json([{id:rid,conversation_id:cid,meta_message_id:'meta',media_id:'file'}]);
  if(url.includes('/whatsapp_conversations?'))return Response.json([{id:cid,branch_id:'b1'}]);
 },'/api/operator/media');
 assert.equal(result.status,403);assert.equal(result.calls.some(c=>c.url.includes('facebook')),false);
});
test('retry preserves the original request after refresh observes new version',()=>{
 const first=prepareOperatorRequest(null,{id:cid,automation_control_version:3},'message',{text:'Te atiendo'});
 const retry=prepareOperatorRequest(first,{id:cid,automation_control_version:4},'message',{text:'Te atiendo'});
 assert.deepEqual(retry,first);assert.equal(retry.body.expected_version,3);
 assert.notEqual(prepareOperatorRequest(first,{id:cid},'message',{text:'Otro mensaje'}).body.request_id,first.body.request_id);
});
function clientStub(rows){
 const calls=[];
 const client={from(table){const q={then(resolve){return Promise.resolve({data:table==='whatsapp_messages'?rows:[{id:'attachment',message_id:rows[0].id}]}).then(resolve);}};for(const method of ['select','eq','or','order','limit','in'])q[method]=(...args)=>{calls.push({table,method,args});return q;};return q;}};
 return {client,calls};
}
test('history reads only selected conversation with stable microsecond cursor',()=>{
 const {client,calls}=clientStub([]),cursor={id:rid,created_at:'2026-09-26T15:00:00.123456+00:00'};
 historyQuery(client,cid,{before:cursor});
 assert.ok(calls.some(c=>c.method==='eq'&&c.args[0]==='conversation_id'&&c.args[1]===cid));
 assert.match(calls.find(c=>c.method==='or').args[0],/123456\+00:00/);
 assert.deepEqual(calls.filter(c=>c.method==='order').map(c=>c.args),[['created_at',{ascending:false}],['id',{ascending:false}]]);
 assert.throws(()=>historyQuery(client,cid,{before:{id:rid,created_at:'0),id.neq.any'}}));
});
test('page cursor excludes lookahead and attachment lookup contains exact page IDs',async()=>{
 const rows=Array.from({length:51},(_,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,created_at:'2026-09-26T15:00:00.123456+00:00'}));
 const {client,calls}=clientStub(rows),page=await fetchConversationPage(client,cid);
 assert.equal(page.messages.length,50);assert.equal(page.hasMore,true);assert.equal(page.cursor.id,rows[49].id);
 assert.deepEqual(calls.find(c=>c.table==='whatsapp_attachments'&&c.method==='in').args[1],rows.slice(0,50).map(r=>r.id));
});
test('catchup ordering and merging preserve older history and refresh delivery status',()=>{
 const {client,calls}=clientStub([]);historyQuery(client,cid,{after:{id:rid,created_at:'2026-09-26T15:00:00.000001Z'}});
 assert.ok(calls.filter(c=>c.method==='order').every(c=>c.args[1].ascending));
 const old={id:cid,created_at:'2026-09-25T15:00:00Z'},first={id:uid,created_at:'2026-09-26T15:00:00Z',delivery_status:'queued'},next={id:rid,created_at:first.created_at};
 const merged=mergeHistory([old,first],[next,{...first,delivery_status:'delivered'}]);
 assert.deepEqual(merged.map(m=>m.id),[cid,uid,rid]);assert.equal(merged[1].delivery_status,'delivered');
});
