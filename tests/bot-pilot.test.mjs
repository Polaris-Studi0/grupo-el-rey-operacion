import test from 'node:test';
import {snapshotFixture} from './helpers/bot-snapshot.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {partitionPilotWebhook,processPilotWebhook,notifyPilotTask,resumePilotTask} from '../src/bot-pilot.js';
import {checkoutReply,recoveredCheckoutFields} from '../src/bot-checkout.js';

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
    branch_knowledge:[{id:tid,category:'schedule',title:'Horario',content:'Cierra a las 20:00.'}],branch_inventory:[],branch_payment_qrs:[],whatsapp_attachments:[],whatsapp_operator_actions:[],orders:[],inventory_reservations:[],human_tasks:[],ai_runs:[],privacy_consents:[{granted:true}]};
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
    if(u.pathname.endsWith('/rpc/bot_context_snapshot'))return Response.json(snapshotFixture(db));
    const table=u.pathname.endsWith('/rpc/bot_customer_orders')?'orders':u.pathname.split('/').at(-1);assert.ok(table in db,table);
    if(table==='privacy_consents')for(const item of (u.searchParams.get('order')||'').split(',').filter(Boolean))assert.ok(consentColumns.has(item.split('.')[0]),`Unknown privacy_consents column: ${item}`);
    if(init.method==='PATCH'){const body=JSON.parse(init.body);Object.assign(db[table][0],body);trace.push('patch');return Response.json(db[table]);}
    if(table==='whatsapp_messages'&&u.searchParams.get('idempotency_key')?.startsWith('eq.human-task-response:'))return Response.json(options.cachedResolution?[{id:tid,raw_payload:{control_version:1,inbound_message_id:mid}}]:[]);
    if(table==='whatsapp_messages'&&u.searchParams.has('idempotency_key'))return Response.json(options.cached?[{id:tid,delivery_status:'queued'}]:[]);
    if(table==='whatsapp_messages'&&u.searchParams.get('direction')==='eq.outbound')return Response.json(db[table].filter(m=>m.direction==='outbound'&&['sent','delivered','read'].includes(m.delivery_status)&&!m.raw_payload?.internal_notification).slice(0,1));
    if(table==='whatsapp_messages'&&u.searchParams.get('direction')==='eq.inbound')return Response.json(db[table].filter(m=>m.direction==='inbound').slice(0,1));
    return Response.json(db[table]);
  };
  const rpc=async(name,body)=>{
    trace.push(name);events.push({name,body});
    if(name==='ingest_whatsapp_message')return {created:!options.duplicate,conversation_id:cid,message_id:mid};
    if(name==='commit_bot_commerce_turn'){
      assert.equal(body.p_control_version,2);assert.equal(body.p_commerce_version,0);const human=body.p_decision.actions?.find(a=>a.type==='propose_human_task');
      if(human)tasks.push({id:tid,question:human.question,context:{inbound_message_id:mid}});
      return {message_ids:[tid],task_ids:human?[tid]:[],control_version:2,inbound_message_id:mid};
    }
    if(name==='create_human_task'){const t={id:tid,question:body.p_question,context:body.p_context};tasks.push(t);return [t];}
    if(name==='claim_automation_event')return [{id:tid,lease_id:uid}];
    if(name==='prepare_whatsapp_automation_message')return {message_id:uid};
    if(name==='complete_automation_event')return true;
    if(name==='queue_outbound_whatsapp_message')return {message_id:tid};
    if(name==='record_whatsapp_consent')return {recognized:true,granted:false};
    throw Error('Unexpected RPC '+name);
  };
  const dependencies={rpc,persistMedia:async()=>trace.push('media'),deliver:async(id,_env,expected)=>{trace.push('deliver');sent.push({id,expected});if(options.staleDelivery)return Response.json({state:'pilot_context_changed'},{status:409});return Response.json({}, {status:options.deliveryFails?502:200});}};
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
  assert.ok(s.trace.indexOf('commit_bot_commerce_turn')<s.trace.indexOf('deliver'));assert.equal(s.sent.length,1);assert.equal(s.sent[0].expected.inbound_message_id,mid);
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
    await processPilotWebhook(payload(),env,s.dependencies).catch(()=>{});assert.equal(s.trace.includes('commit_bot_commerce_turn'),false);assert.equal(s.sent.length,0);
  });
});
test('missing information creates an exact task and separately notifies the configured owner',async()=>scenario({decision:{intent:'handoff',reply_text:'El equipo debe confirmar ese dato.',actions:[{type:'propose_human_task',reason:'missing_information',question:'Confirmar si venden el producto consultado.'}]}},async s=>{
  await processPilotWebhook(payload(),env,s.dependencies);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].context.inbound_message_id,mid);
  assert.equal(s.events.find(e=>e.name==='commit_bot_commerce_turn').body.p_owner_phone,'+'+env.BOT_PILOT_PHONE);
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

test('branch directory uses real names, numerical order, and no AI or human task',async()=>{
 for(const body of ['muestrame todas las sedes','que sedes son?'])await scenario({setup:db=>db.branches=[{id:'b10',name:'San Antonio de Prado'},{id:'b1',name:'Robledo Aures'}]},async s=>{
  await processPilotWebhook(payload([{id:'wamid.sedes',from:env.BOT_PILOT_PHONE,type:'text',text:{body}}]),env,s.dependencies);
  assert.equal(s.trace.includes('model'),false);assert.equal(s.tasks.length,0);
  const q=s.events.find(e=>e.name==='queue_outbound_whatsapp_message');assert.match(q.body.p_body,/1\. Robledo Aures\n2\. San Antonio de Prado/);assert.doesNotMatch(q.body.p_body,/\bb(?:10|[1-9])\b/);assert.equal(s.sent.length,1);
 });
});
test('customer reply is dispatched before the owner notification',async()=>scenario({modelFails:true},async s=>{
 await processPilotWebhook(payload(),env,s.dependencies);assert.equal(s.sent[0].id,tid);assert.ok(s.sent[0].expected);assert.equal(s.sent[1].id,uid);
}));
test('obsolete committed reply ends without an endless delivery retry',async()=>scenario({staleDelivery:true},async s=>{
 await processPilotWebhook(payload(),env,s.dependencies);assert.equal(s.sent.length,1);assert.equal(s.events.some(e=>e.name==='prepare_whatsapp_automation_message'),false);
}));
test('natural branch correction is stored without asking the model to pretend to switch',async()=>scenario({setup:db=>db.branches.push({id:'b9',name:'Campo Valdez'})},async s=>{
 await processPilotWebhook(payload([{id:'wamid.switch',from:env.BOT_PILOT_PHONE,type:'text',text:{body:'creo que me queda mejor la de campo valdez'}}]),env,s.dependencies);
 assert.equal(s.db.whatsapp_conversations[0].branch_id,'b9');assert.equal(s.trace.includes('model'),false);assert.match(s.events.find(e=>e.name==='queue_outbound_whatsapp_message').body.p_body,/Campo Valdez/);
}));

test('explicit checkout name and phone persist through the pilot without AI or human escalation',async()=>{
 for(const [text,field,value] of [['A nombre de Samuel porfa','customer_name','Samuel'],['3127378289','recipient_phone','3127378289'],['a domicilio','fulfillment_type','delivery']]){
  await scenario({modelFails:true,setup:db=>{
   db.whatsapp_conversations[0].sales_state.pilot_commerce={stage:'collecting',pending_selection:{name:'super man',unit_price_cop:50000,quantity:1}};
   db.whatsapp_messages[0].body=text;
  }},async s=>{
   await processPilotWebhook(payload([{id:'wamid.field',from:env.BOT_PILOT_PHONE,type:'text',text:{body:text}}]),env,s.dependencies);
   const decision=s.events.find(e=>e.name==='commit_bot_commerce_turn').body.p_decision;
   assert.equal(decision.checkout[field],value);assert.equal(decision.intent,'checkout');
   assert.equal(s.trace.includes('model'),false);assert.equal(s.tasks.length,0);assert.equal(s.sent.length,1);
  });
 }
});

test('checkout input recovery uses explicit customer data, never profile names or an older purchase',()=>{
 const snapshot={checkout:{stage:'collecting',pending_selection:{name:'super man'},recipient_name:'Samuel'},message:{id:mid,text:'3127378289',kind:'text'},customer:{name:'Wrong profile'},history:[],checkout_inputs:[{id:tid,text:'A nombre de Samuel porfa',kind:'text'}]};
 assert.deepEqual(checkoutReply({snapshot}).checkout,{customer_name:'Samuel',recipient_phone:'3127378289'});
 assert.deepEqual(recoveredCheckoutFields({snapshot:{...snapshot,message:{id:mid,text:'Calle 10 # 20-30',kind:'text'}}}),{customer_name:'Samuel'},'a compound/model-parsed reply can persist earlier explicit missing fields too');
 const noHistory={...snapshot,checkout_inputs:[]};assert.equal(checkoutReply({snapshot:noHistory}).checkout.customer_name,undefined);
 for(const stage of ['ordered','cancelled','payment','review'])assert.equal(checkoutReply({snapshot:{...snapshot,checkout:{...snapshot.checkout,stage}}}),null);
 for(const text of ['¿Cuánto vale el domicilio?','Quiero hablar con una persona','Cancela la compra','El teléfono no es 3127378289','Hola'])assert.equal(checkoutReply({snapshot:{...snapshot,message:{id:mid,text,kind:'text'},history:[{role:'assistant',text:'¿A nombre de quién hacemos la compra?'}]}}),null);
 const bare=checkoutReply({snapshot:{...snapshot,checkout_inputs:[],message:{id:mid,text:'Samuel',kind:'text'},history:[{role:'assistant',text:'¿A nombre de quién hacemos la compra?'}]}});
 assert.equal(bare.checkout.customer_name,'Samuel');assert.equal(bare.checkout.recipient_name,undefined);
});
