import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCampaignPhones,templateDetails,buildCampaignTemplate,isMarketingOptOut,withoutMarketingOptOuts,handleCampaigns,recoverCampaigns} from '../src/whatsapp-campaigns.js';
test('campaign phones deduplicate Colombian formats and reject invalid destinations',()=>{
 assert.deepEqual(normalizeCampaignPhones(['300 111 2233','+57 (300) 111-2233']),['+573001112233']);assert.throws(()=>normalizeCampaignPhones(['abc123']));assert.throws(()=>normalizeCampaignPhones(Array(1001).fill('3001112233')));
});
test('flyer templates require approved marketing/image and supported variables',()=>{
 const t={name:'flyer',language:'es',status:'APPROVED',category:'MARKETING',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Conoce {{1}}'},{type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Dejar de recibir'}]}]};
 const d=templateDetails(t);assert.equal(d.variables,1);const payload=buildCampaignTemplate(d,['Halloween']);assert.equal(payload.preview,'Conoce Halloween');assert.equal(payload.components[1].parameters[0].payload,'STOP_PUBLICIDAD');
 assert.equal(templateDetails({...t,status:'PENDING'}),null);assert.equal(templateDetails({...t,category:'UTILITY'}),null);assert.throws(()=>buildCampaignTemplate(d,[]));
 assert.equal(templateDetails({...t,components:[t.components[0],{type:'BODY',text:'Hola {{name}}'}]}),null);
});
test('opt-outs bypass shopping and preserve unrelated messages in the same batch',()=>{
 const m={from:'573001112233',type:'text',text:{body:'No más publicidad'}};assert.equal(isMarketingOptOut(m),true);assert.equal(isMarketingOptOut({button:{payload:'STOP_PUBLICIDAD'}}),true);assert.equal(isMarketingOptOut({text:{body:'Quiero promociones'}}),false);
 const p={entry:[{changes:[{value:{messages:[m,{id:'keep',text:{body:'Quiero comprar'}}]}}]}]};assert.equal(withoutMarketingOptOuts(p).entry[0].changes[0].value.messages[0].id,'keep');
});
test('campaign management requires an authenticated administrator',async()=>{
 for(const role of [null,'cashier']){let called=false;const r=await handleCampaigns(new Request('https://example.invalid/api/operator/campaigns'),{WHATSAPP_CAMPAIGNS_ENABLED:'true'}, {authenticate:async()=>role?{role}:null,rpc:async()=>{called=true;}});assert.equal(r.status,role?403:401);assert.equal(called,false);}
});

test('campaign dispatch verifies templates and permission, uploads the flyer, and never retries an uncertain send',async()=>{
 const source={name:'flyer',language:'es',status:'APPROVED',category:'MARKETING',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Novedades. Responde BAJA para dejar de recibir publicidad.'}]};
 const saved=buildCampaignTemplate(templateDetails(source),[]);
 // Supabase JSONB returns object keys in a different order.
 const template=Object.fromEntries(Object.entries(saved).reverse());
 const env={WHATSAPP_CAMPAIGNS_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'synthetic',WHATSAPP_PHONE_NUMBER_ID:'phone',SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_synthetic'};
 for(const networkFailure of [false,true]){
  const updates=[],sends=[];const original=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
   const u=new URL(String(url));
   if(u.hostname==='db.invalid'){
    if(init.method==='PATCH'){updates.push(JSON.parse(init.body));return new Response(null,{status:204});}
    if(u.pathname.includes('/storage/'))return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});
    if(u.pathname.includes('marketing_permissions'))return Response.json([{status:u.searchParams.get('phone_e164').endsWith('2')?'revoked':'granted'}]);
    return Response.json([{status:'queued'}]);
   }
   if(u.pathname.endsWith('/message_templates'))return Response.json({data:[source]});
   if(u.pathname.endsWith('/media'))return Response.json({id:'meta-image'});
   if(u.pathname.endsWith('/messages')){sends.push(JSON.parse(init.body));if(networkFailure)throw Error('Connection lost');return Response.json({messages:[{id:'wamid-campaign'}]});}
   throw Error('Unexpected request');
  };
  try{await recoverCampaigns(env,{rpc:async()=>({campaign:{id:'test',template},asset:{kind:'flyer',storage_path:'flyer/test.jpg',mime_type:'image/jpeg',original_name:'test.jpg'},recipients:[{id:'r1',phone_e164:'+573001110001'},{id:'r2',phone_e164:'+573001110002'}]})});assert.equal(sends.length,1);assert.equal(sends[0].template.components[0].parameters[0].image.id,'meta-image');assert.ok(updates.some(u=>u.status==='skipped'));assert.ok(updates.some(u=>u.status===(networkFailure?'uncertain':'sent')));}
  finally{globalThis.fetch=original;}
 }
});

test('deferred advertising cannot start or dispatch a campaign',async()=>{let called=false;const rpc=async()=>{called=true;};assert.equal(await recoverCampaigns({WHATSAPP_ACCESS_TOKEN:'x',WHATSAPP_PHONE_NUMBER_ID:'x'},{rpc}),false);const r=await handleCampaigns(new Request('https://example.invalid/api/operator/campaigns'),{}, {authenticate:async()=>({role:'admin'}),rpc});assert.equal(r.status,404);assert.equal(called,false);});
