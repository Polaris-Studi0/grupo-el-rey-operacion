import test from 'node:test';import assert from 'node:assert/strict';
import {handleWhatsappDemo} from '../src/whatsapp-demo.js';
import {splitPublicWebhook} from '../src/worker.js';
const id='10000000-0000-4000-8000-000000000001',asset='10000000-0000-4000-8000-000000000002';
const env={WHATSAPP_DEMO_ENABLED:'true',SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fake',WHATSAPP_PHONE_NUMBER_ID:'test',WHATSAPP_ACCESS_TOKEN:'fake'};
const request=()=>new Request('https://intranet.invalid/api/operator/whatsapp-demo',{method:'POST',body:JSON.stringify({request_id:id,asset_id:asset,phone:'3000000001'})});
test('demo is admin-only and disabled flag prevents side effects',async()=>{
 for(const[config,actor,status]of [[{},null,404],[env,null,401],[env,{role:'cashier'},403]]){
 const r=await handleWhatsappDemo(request(),config,{authenticate:async()=>actor,rpc:()=>assert.fail('must not mutate')});assert.equal(r.status,status);
 }
});
test('demo refuses closed messaging window and duplicate claims without uploading or sending',async()=>{
 for(const result of [{error:'Escribe primero al WhatsApp'},{send:false,result:{status:'sent'}}]){
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('must not call Meta');try{
 const r=await handleWhatsappDemo(request(),env,{authenticate:async()=>({id,role:'admin'}),rpc:async()=>result});assert.equal(r.status,result.error?422:200);
 }finally{globalThis.fetch=original;}}
});
test('demo posts one uploaded image and preserves uncertainty without retrying messages',async()=>{
 for(const fail of [false,true]){
 const trace=[];const original=globalThis.fetch;globalThis.fetch=async(url,init={})=>{
 const u=new URL(url);if(u.pathname.includes('/storage/'))return new Response(new Uint8Array([255,216,255]));
 if(u.pathname.endsWith('/media'))return Response.json({id:'image-id'});
 if(u.pathname.endsWith('/messages')){trace.push(JSON.parse(init.body));if(fail)throw Error('Connection interrupted');return Response.json({messages:[{id:'meta-id'}]});}
 trace.push(JSON.parse(init.body));return new Response(null,{status:204});
 };
 try{const r=await handleWhatsappDemo(request(),env,{authenticate:async()=>({id,role:'admin'}),rpc:async(_n,b)=>{assert.equal(b.p_phone,'+573000000001');return {send:true,asset:{storage_path:'demo/test.png',mime_type:'image/png',original_name:'test.png'}};}});
 const data=await r.json();assert.equal(data.result.status,fail?'uncertain':'sent');assert.equal(trace.filter(x=>x.messaging_product).length,1);assert.equal(trace[0].image.id,'image-id');assert.equal(trace[0].to,'573000000001');
 }finally{globalThis.fetch=original;}
 }
});
test('public webhook batches separate customers and statuses for bounded recovery',()=>{
 const parts=splitPublicWebhook({object:'whatsapp_business_account',entry:[{changes:[{value:{messages:[{id:'a',from:'111'},{id:'b',from:'222'}],statuses:[{id:'c',status:'read'}],contacts:[{wa_id:'111'},{wa_id:'222'}]}}]}]});
 assert.equal(parts.length,3);assert.deepEqual(parts[0].entry[0].changes[0].value.contacts,[{wa_id:'111'}]);assert.equal(parts[1].entry[0].changes[0].value.messages[0].id,'b');assert.equal(parts[2].entry[0].changes[0].value.messages.length,0);
});
