import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {partitionPilotWebhook,processPilotWebhook,notifyPilotTask,resumePilotTask} from '../src/bot-pilot.js';

const cid='10000000-0000-4000-8000-000000000001',uid='10000000-0000-4000-8000-000000000002',mid='10000000-0000-4000-8000-000000000003',tid='10000000-0000-4000-8000-000000000004';
const env={BOT_PILOT_ENABLED:'true',BOT_PILOT_PHONE:'573127378289',SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',N8N_REBUILD_WEBHOOK_SECRET:'test-new-key'};
// Ground the REST test double in the actual SQL table, including its timestamp.
const consentTable=readFileSync(new URL('../supabase/migrations/202609050003_whatsapp_commerce.sql',import.meta.url),'utf8').match(/create table public\.privacy_consents \(([\s\S]*?)\n\);/)[1];
const consentColumns=new Set([...consentTable.matchAll(/^\s+(\w+)\s+/gm)].map(match=>match[1]));
const payload=(messages=[{id:'wamid.test',from:env.BOT_PILOT_PHONE,type:'text',text:{body:'¿A qué hora cierran?'}}])=>({object:'whatsapp_business_account',entry:[{changes:[{value:{messages,contacts:[{wa_id:env.BOT_PILOT_PHONE,profile:{name:'Ana'}}]}}]}]});
async function scenario(options={},run){
  const now=new Date().toISOString(),trace=[],sent=[],events=[],tasks=[];
  const db={whatsapp_conversations:[{id:cid,contact_id:uid,branch_id:'b1',status:'open',consent_status:'granted',consented_at:now,consent_version:'v1',automation_paused:false,automation_control_version:2,updated_at:now,last_message_at:now,sales_state:{legacy:'preserved'}}],
    whatsapp_contacts:[{id:uid,phone_e164:'+'+env.BOT_PILOT_PHONE,preferred_name:'Ana'}],branches:[{id:'b1',name:'Sede real de prueba'}],whatsapp_messages:[{id:mid,direction:'inbound',sender_type:'customer',message_type:'text',body:'¿A qué hora cierran?',created_at:now}],
    branch_knowledge:[{id:tid,category:'schedule',title:'Horario',content:'Cierra a las 20:00.'}],branch_inventory:[],branch_payment_qrs:[],whatsapp_attachments:[],whatsapp_operator_actions:[],orders:[],human_tasks:[],ai_runs:[],privacy_consents:[{granted:true}]};
  options.setup?.(db);const original=globalThis.fetch;
  globalThis.fetch=async (url,init={})=>{
    const u=new URL(String(url));
    if(u.hostname==='intranetelrey.app.n8n.cloud'){
      trace.push('model');const p=JSON.parse(init.body);assert.equal(p.mode,'pilot');assert.equal(p.turn_id,p.snapshot.human_resolution?tid:mid);assert.ok(!JSON.stringify(p.snapshot.history).includes('PRIVATE-NOTICE'));
      if(options.modelFails)throw Error('Model unavailable');
      options.duringModel?.(db);
      return Response.json({contract:'el-rey.bot.decision.v1',status:'decision_ready',mode:'pilot',source:'intranet',turn_id:p.turn_id,conversation_id:cid,expected_control_version:2,expected_context_version:p.context_version,expected_context_fingerprint:p.context_fingerprint,expires_at:p.snapshot.expires_at,send_allowed:false,mutations_executed:[],decision:options.decision||{intent:'information',reply_text:p.snapshot.human_resolution?'En esta sede no tenemos cargadores para carros eléctricos.':'Cerramos a las 20:00.',actions:[]}});
    }
    assert.equal(u.hostname,'db.invalid');assert.equal(init.headers.authorization,undefined,'modern secret must not be used as a bearer JWT');
    const table=u.pathname.split('/').at(-1);assert.ok(table in db,table);
    if(table==='privacy_consents')for(const item of (u.searchParams.get('order')||'').split(',').filter(Boolean))assert.ok(consentColumns.has(item.split('.')[0]),`Unknown privacy_consents column: ${item}`);
    if(init.method==='PATCH'){const body=JSON.parse(init.body);Object.assign(db[table][0],body);trace.push('patch');return Response.json(db[table]);}
    if(table==='whatsapp_messages'&&u.searchParams.get('idempotency_key')?.startsWith('eq.human-task-response:'))return Response.json(options.cachedResolution?[{id:tid,raw_payload:{control_version:1,inbound_message_id:mid}}]:[]);
    if(table==='whatsapp_messages'&&u.searchParams.has('idempotency_key'))return Response.json(options.cached?[{id:tid,delivery_status:'queued'}]:[]);
    if(table==='whatsapp_messages'&&u.searchParams.get('direction')==='eq.inbound')return Response.json(db[table].filter(m=>m.direction==='inbound').slice(0,1));
    return Response.json(db[table]);
  };
  const rpc=async(name,body)=>{
    trace.push(name);events.push({name,body});
    if(name==='ingest_whatsapp_message')return {created:!options.duplicate,conversation_id:cid,message_id:mid};
    if(name==='persist_whatsapp_commercial_response'){assert.equal(body.p_proposed_output.action,'reply');assert.equal(body.p_proposed_output.send_qr,false);assert.deepEqual(body.p_proposed_output.sales_state,{legacy:'preserved'});return {outbound_message_id:tid,ai_output:body.p_proposed_output};}
    if(name==='create_human_task'){const t={id:tid,question:body.p_question,context:body.p_context};tasks.push(t);return [t];}
    if(name==='claim_automation_event')return [{id:tid,lease_id:uid}];
    if(name==='prepare_whatsapp_automation_message')return {message_id:uid};
    if(name==='complete_automation_event')return true;
    if(name==='queue_outbound_whatsapp_message')return {message_id:tid};
    if(name==='record_whatsapp_consent')return {recognized:true,granted:false};
    throw Error('Unexpected RPC '+name);
  };
  const dependencies={rpc,persistMedia:async()=>trace.push('media'),deliver:async(id,_env,expected)=>{trace.push('deliver');sent.push({id,expected});return Response.json({}, {status:options.deliveryFails?502:200});}};
  try{return await run({db,trace,sent,events,tasks,dependencies});}finally{globalThis.fetch=original;}
}

test('mixed webhook batches route only the allowlisted phone to the new engine',()=>{
  const p=payload([{id:'a',from:env.BOT_PILOT_PHONE},{id:'b',from:'573000000000'}]);
  const parts=partitionPilotWebhook(p,env);
  assert.deepEqual(parts.pilot.entry[0].changes[0].value.messages.map(m=>m.id),['a']);
  assert.deepEqual(parts.legacy.entry[0].changes[0].value.messages.map(m=>m.id),['b']);
  assert.equal(partitionPilotWebhook(p,{...env,BOT_PILOT_ENABLED:'false'}).pilot.entry.length,0);
  assert.equal(partitionPilotWebhook(p,{...env,BOT_PILOT_STARTED_AT:new Date().toISOString()}).pilot.entry.length,0,'historical/missing-timestamp events never enter the new pilot');
});
test('pilot persists inbound and media first, checks context and uses durable reply queue',async()=>scenario({},async s=>{
  await processPilotWebhook(payload(),env,s.dependencies);assert.ok(s.trace.indexOf('ingest_whatsapp_message')<s.trace.indexOf('media'));assert.ok(s.trace.indexOf('media')<s.trace.indexOf('model'));
  assert.ok(s.trace.indexOf('persist_whatsapp_commercial_response')<s.trace.indexOf('deliver'));assert.equal(s.sent.length,1);assert.equal(s.sent[0].expected.inbound_message_id,mid);
}));
test('manual takeover blocks AI and an ordinary message cannot release it',async()=>scenario({setup:db=>db.whatsapp_conversations[0].automation_paused=true},async s=>{
  await processPilotWebhook(payload(),env,s.dependencies);assert.equal(s.trace.includes('model'),false);assert.equal(s.sent.length,0);assert.equal(s.trace.includes('patch'),false);
}));
test('explicit owner start releases only this test chat; a retry cannot release it again',async()=>{
  for(const duplicate of [false,true])await scenario({duplicate,setup:db=>db.whatsapp_conversations[0].automation_paused=true},async s=>{
    await processPilotWebhook(payload([{id:'wamid.start',from:env.BOT_PILOT_PHONE,type:'text',text:{body:'PROBAR BOT'}}]),env,s.dependencies);
    assert.equal(s.trace.includes('patch'),!duplicate);assert.equal(s.trace.includes('model'),false);
  });
});
test('manual control or a new customer message during generation prevents commit',async()=>{
  for(const duringModel of [db=>db.whatsapp_conversations[0].automation_paused=true,db=>db.whatsapp_messages[0].body='Nueva pregunta'])await scenario({duringModel},async s=>{
    await processPilotWebhook(payload(),env,s.dependencies).catch(()=>{});assert.equal(s.trace.includes('persist_whatsapp_commercial_response'),false);assert.equal(s.sent.length,0);
  });
});
test('missing information creates an exact task and separately notifies the configured owner',async()=>scenario({decision:{intent:'handoff',reply_text:'El equipo debe confirmar ese dato.',actions:[{type:'propose_human_task',reason:'missing_information',question:'Confirmar si venden el producto consultado.'}]}},async s=>{
  await processPilotWebhook(payload(),env,s.dependencies);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].context.inbound_message_id,mid);
  assert.equal(s.events.find(e=>e.name==='create_human_task').body.p_assigned_to_phone,'+'+env.BOT_PILOT_PHONE);
  assert.equal(s.events.find(e=>e.name==='prepare_whatsapp_automation_message').body.p_admin_phone,'+'+env.BOT_PILOT_PHONE);
  assert.equal(s.sent.length,2);assert.equal(s.events.find(e=>e.name==='complete_automation_event').body.p_error,null);
}));
test('internal notifications are excluded from model history',async()=>scenario({setup:db=>db.whatsapp_messages.unshift({id:tid,direction:'outbound',sender_type:'system',delivery_status:'sent',body:'PRIVATE-NOTICE',raw_payload:{internal_notification:true}})},async s=>{
  await processPilotWebhook(payload(),env,s.dependencies);assert.ok(s.trace.includes('model'));
}));
test('failed notification remains recoverable and is not marked delivered',async()=>scenario({deliveryFails:true},async s=>{
  await notifyPilotTask(tid,env,s.dependencies);assert.ok(s.events.find(e=>e.name==='complete_automation_event').body.p_error);
}));
test('explicit consent withdrawal stops before the model even after earlier acceptance',async()=>scenario({},async s=>{
  await processPilotWebhook(payload([{id:'wamid.revoke',from:env.BOT_PILOT_PHONE,type:'text',text:{body:'NO ACEPTO'}}]),env,s.dependencies);
  assert.ok(s.trace.includes('record_whatsapp_consent'));assert.equal(s.trace.includes('model'),false);assert.equal(s.sent.length,0);
}));
const resolved=db=>db.human_tasks=[{id:tid,conversation_id:cid,branch_id:'b1',status:'resolved',question:'¿Hay cargadores? Indicar puestos y conectores.',resolution:{answer:'no hay cargadores para carros eléctricos'},context:{pilot_engine:'new-whatsapp-v1',inbound_message_id:mid}}];
test('resolved task uses grounded natural wording without the internal question or attribution',async()=>scenario({setup:resolved},async s=>{
  const r=await resumePilotTask(tid,env,s.dependencies);assert.equal(r.ok,true);const q=s.events.find(e=>e.name==='queue_outbound_whatsapp_message');assert.equal(q.body.p_body,'En esta sede no tenemos cargadores para carros eléctricos.');assert.equal(q.body.p_idempotency_key,'human-task-response:'+tid);assert.equal(q.body.p_payload.answer_style,'contextual');assert.equal(s.trace.includes('model'),true);
}));
test('wording failure falls back to the confirmed fact without exposing the internal question',async()=>scenario({setup:resolved,modelFails:true},async s=>{
  assert.equal((await resumePilotTask(tid,env,s.dependencies)).ok,true);const q=s.events.find(e=>e.name==='queue_outbound_whatsapp_message');assert.equal(q.body.p_body,'No hay cargadores para carros eléctricos');assert.equal(q.body.p_payload.answer_style,'direct_fallback');
}));
test('resolution retry reuses its queued message and original delivery guard without generating again',async()=>scenario({setup:resolved,cachedResolution:true},async s=>{
  await resumePilotTask(tid,env,s.dependencies);assert.equal(s.trace.includes('model'),false);assert.equal(s.trace.includes('queue_outbound_whatsapp_message'),false);assert.equal(s.sent[0].expected.control_version,1);
}));
test('operator changes or a revised clarification during wording prevent queueing',async()=>{
  for(const duringModel of [db=>db.whatsapp_conversations[0].automation_paused=true,db=>db.human_tasks[0]={...db.human_tasks[0],resolution:{answer:'Otra respuesta'}},db=>db.whatsapp_messages[0].body='Nueva consulta'])await scenario({setup:resolved,duringModel},async s=>{
    const r=await resumePilotTask(tid,env,s.dependencies);assert.equal(r.ok,false);assert.equal(s.trace.includes('queue_outbound_whatsapp_message'),false);assert.equal(s.sent.length,0);
  });
});
test('a clarification belonging to a different branch cannot be sent',async()=>scenario({setup:db=>{resolved(db);db.human_tasks[0].branch_id='b2';}},async s=>{
  assert.equal((await resumePilotTask(tid,env,s.dependencies)).reason,'branch_changed');assert.equal(s.sent.length,0);assert.equal(s.trace.includes('model'),false);
}));
