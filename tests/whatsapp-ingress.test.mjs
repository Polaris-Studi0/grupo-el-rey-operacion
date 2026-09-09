import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../src/worker.js';
const normalizer=new Function('$input',await readFile(new URL('../n8n/inbound/normalize-meta.js.txt',import.meta.url),'utf8'));
const filter=new Function('$json',await readFile(new URL('../n8n/inbound/filter-new.js.txt',import.meta.url),'utf8'));
test('Meta batch matches every sender to their own contact',()=>{
 const value={contacts:[{wa_id:'57000000001',profile:{name:'Uno'}},{wa_id:'57000000002',profile:{name:'Dos'}}],messages:[{id:'m2',from:'57000000002',type:'text',text:{body:'Hola'}},{id:'m1',from:'57000000001',type:'text',text:{body:'Hola'}}]};
 const result=normalizer({first:()=>({json:{body:{entry:[{changes:[{value}]}]}}})});
 assert.deepEqual(result[0].json.messages.map(m=>m.display_name),['Dos','Uno']);
});
test('completed message is dropped; unfinished retry can resume',()=>{
 assert.equal(filter({kind:'message',result:{created:false,message_id:'m',retry_ready:false}}),null);
 assert.equal(filter({kind:'message',result:{created:false,message_id:'m',retry_ready:true,consent_status:'granted'}}).json.ready_for_next_step,true);
});
async function receive(value){
 const original=globalThis.fetch,calls=[],waiting=[];
 const env={WHATSAPP_APP_SECRET:'local-test',SUPABASE_URL:'https://local.invalid',SUPABASE_SECRET_KEY:'local-only',N8N_WEBHOOK_URL:'https://n8n.invalid/webhook',N8N_WEBHOOK_SECRET:'local-only'};
 globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),body:JSON.parse(options.body)});
  const result=String(url).endsWith('/claim_whatsapp_event')?[{lease_id:'local-lease'}]:{};
  return Response.json(result);
 };
 try {
  const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value}]}]});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');
  const response=await worker.fetch(new Request('https://local.invalid/api/whatsapp/webhook',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+signature}}),env,{waitUntil:p=>waiting.push(p)});
  await Promise.all(waiting);assert.equal(response.status,200);return calls;
 } finally {globalThis.fetch=original;}
}
test('mixed Meta event persists status and forwards the customer message once',async()=>{
 const calls=await receive({statuses:[{id:'out1',status:'read',timestamp:'1780000000'}],messages:[{id:'in1',from:'57000000001',type:'text',text:{body:'Quiero comprar'}}]});
 assert.equal(calls.filter(c=>c.url.endsWith('/record_whatsapp_message_status')).length,1);
 const forwarded=calls.filter(c=>c.url.includes('n8n.invalid'));
 assert.equal(forwarded.length,1);assert.equal(forwarded[0].body.entry[0].changes[0].value.messages.length,1);assert.deepEqual(forwarded[0].body.entry[0].changes[0].value.statuses,[]);
});
test('delivery statuses do not consume an n8n execution',async()=>{
 const calls=await receive({statuses:[{id:'out1',status:'delivered',timestamp:'1780000000'}]});assert.equal(calls.filter(c=>c.url.includes('n8n.invalid')).length,0);
});
test('unsupported Meta notifications do not invoke the assistant',async()=>{
 const calls=await receive({event:'unrelated'});assert.equal(calls.filter(c=>c.url.includes('n8n.invalid')).length,0);
});
