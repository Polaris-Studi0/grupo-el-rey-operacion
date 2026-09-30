import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';

// Run the actual exported n8n validators, not a second implementation.
const workflow=JSON.parse(await readFile(new URL('../n8n/rebuild/attention-core.workflow.json',import.meta.url),'utf8'));
const code=name=>workflow.nodes.find(n=>n.name===name).parameters.jsCode;
function validate(body){return new Function('$input',code('Validar turno y contexto'))({all:()=>[{json:{body}}]})[0].json;}
function guard(context,output,tools=[]){
  return new Function('$input','$',code('Validar propuesta y referencias'))(
    {first:()=>({json:{output,intermediateSteps:tools.map(tool=>({action:{tool}}))}})},
    ()=>({first:()=>({json:{context}})})
  )[0].json.response;
}
const decision=(patch={})=>({intent:'clarification',reply_text:'¿Cuál producto te interesa?',product_ids:[],quote_items:[],qr_asset_id:'',human_reason:'',human_question:'',...patch});
function noEffects(response){assert.equal(response.send_allowed,false);assert.deepEqual(response.mutations_executed,[]);}

test('only bound preview and synthetic test packets can reach the model',()=>{
  const packet=attentionFixture('horario');assert.equal(validate(packet).allow_ai,true);
  packet.mode='preview';assert.equal(validate(packet).allow_ai,false);
  packet.snapshot.source='intranet';packet.context_fingerprint='a'.repeat(64);
  const result=validate(packet);assert.equal(result.allow_ai,true);assert.equal(result.context.context_fingerprint,packet.context_fingerprint);
  packet.mode='production';assert.equal(validate(packet).response.status,'integration_not_enabled');
});
test('paused, closed, missing consent and expired turns stop before AI',()=>{
  for(const [patch,status] of [[{manual_paused:true},'manual_control'],[{closed:true},'conversation_closed'],[{consent:'pending'},'consent_required'],[{allow_ai:false},'automation_deferred']]){
    const p=attentionFixture('horario');Object.assign(p.snapshot.control,patch);const r=validate(p);assert.equal(r.allow_ai,false);assert.equal(r.response.status,status);noEffects(r.response);
  }
  const p=attentionFixture('horario');p.snapshot.expires_at='2020-01-01T00:00:00Z';assert.equal(validate(p).response.status,'stale_context');
});
test('foreign stock and unknown conversation option references are rejected',()=>{
  const p=attentionFixture('horario');p.snapshot.products[0].branch_id='OTHER';assert.equal(validate(p).response.status,'invalid_catalog');
  const q=attentionFixture('horario');q.snapshot.last_options=['OTHER'];assert.equal(validate(q).response.status,'invalid_option_reference');
});
test('an image type alone never confirms receipt of a payment attachment',()=>{
  const p=attentionFixture('pago_sin_archivo');p.snapshot.message.kind='image';assert.equal(validate(p).context.message.attachment_received,false);
  p.snapshot.message.attachment={id:'FILE',message_id:'WRONG',persisted:true};assert.equal(validate(p).context.message.attachment_received,false);
  p.snapshot.message.attachment.message_id=p.snapshot.message.id;assert.equal(validate(p).context.message.attachment_received,true);
});
test('quote totals are recomputed and unavailable or excessive quantities fail',()=>{
  const c=validate(attentionFixture('opciones')).context;
  const output=decision({intent:'quote',quote_items:[{product_id:'TEST-RAMO',quantity:2}]});
  const valid=guard(c,output,['cotizar_carrito']);assert.equal(valid.decision.quote.subtotal_cop,100000);assert.equal(valid.decision.quote.reserved,false);assert.equal(valid.decision.quote.order_created,false);noEffects(valid);
  assert.equal(guard(c,output,[]).status,'missing_tool_evidence');
  for(const quantity of [0,-1,1.5,999])assert.notEqual(guard(c,{...output,quote_items:[{product_id:'TEST-RAMO',quantity}]},['cotizar_carrito']).status,'decision_ready');
  for(const productId of ['UNKNOWN','TEST-AGOTADO'])assert.notEqual(guard(c,{...output,quote_items:[{product_id:productId,quantity:1}]},['cotizar_carrito']).status,'decision_ready');
  c.products.find(p=>p.id==='TEST-RAMO').stock_verified=false;assert.equal(guard(c,output,['cotizar_carrito']).status,'stock_requires_check');
});
test('QR requires exactly one verified asset and an enabled quotation',()=>{
  const c=validate(attentionFixture('qr')).context,output=decision({intent:'qr',qr_asset_id:'TEST-QR-SEDE',reply_text:'Ya te envié el QR.'});
  const valid=guard(c,output,['consultar_qr']);assert.equal(valid.status,'decision_ready');assert.equal(valid.decision.actions[0].branch_id,c.branch.id);assert.doesNotMatch(valid.decision.reply_text,/envié/);noEffects(valid);
  c.payment.ready_for_qr=false;assert.equal(guard(c,output,['consultar_qr']).status,'qr_not_authorized');
  c.payment.ready_for_qr=true;c.qr_assets.push({...c.qr_assets[0],id:'OTHER'});assert.equal(guard(c,output,['consultar_qr']).status,'qr_not_authorized');
});
test('human acknowledgements cannot promise notification, payment approval or timing',()=>{
  const c=validate(attentionFixture('humano')).context;
  for(const reason of ['human_request','missing_information','stock_check','payment_review','pqrs']){
    const result=guard(c,decision({intent:'handoff',human_reason:reason,human_question:'Revisar la consulta del cliente.',reply_text:'Ya avisé al equipo; en breve te contactan y el pago está aprobado.'}),['solicitar_equipo']);
    assert.equal(result.status,'decision_ready');assert.doesNotMatch(result.decision.reply_text,/Ya avisé|en breve|está aprobado/);assert.equal(result.decision.actions[0].related_message_id,c.message.id);noEffects(result);
  }
});
test('malformed output, expired context and incompatible actions fail closed',()=>{
  const c=validate(attentionFixture('horario')).context;
  for(const output of ['not-json',{},decision({reply_text:''}),decision({qr_asset_id:'unrequested'}),decision({human_reason:'human_request'})]){
    const r=guard(c,output);assert.notEqual(r.status,'decision_ready');assert.equal(r.decision,null);noEffects(r);
  }
  c.expires_at='2020-01-01T00:00:00Z';assert.equal(guard(c,decision()).status,'stale_context');
});
test('confirmed clarification is grounded as a fact and cannot trigger another action or quote internal text',()=>{
  const p=attentionFixture('horario');
  p.snapshot.human_resolution={task_id:'10000000-0000-4000-8000-000000000004',inbound_message_id:p.snapshot.message.id,question:'¿Hay cargadores?',answer:'No hay cargadores para carros eléctricos.'};
  const c=validate(p).context;assert.equal(c.information[0].text,p.snapshot.human_resolution.answer);
  assert.equal(guard(c,decision({intent:'information',reply_text:'No tenemos cargadores para carros eléctricos.'}),['consultar_informacion']).status,'decision_ready');
  assert.equal(guard(c,decision({intent:'handoff',human_reason:'missing_information',human_question:'Preguntar de nuevo'}),['solicitar_equipo']).status,'invalid_resolution_actions');
  assert.equal(guard(c,decision({intent:'information',reply_text:'El equipo responde: no hay.'}),['consultar_informacion']).status,'internal_attribution');
  p.snapshot.human_resolution.answer='';assert.equal(validate(p).response.status,'invalid_human_resolution');
});

test('human-confirmed selection is grounded in a scoped literal fact and never approves payment',()=>{
 const p=attentionFixture('horario');p.snapshot.products=[];
 const source=crypto.randomUUID();p.snapshot.confirmed_answers=[{id:source,answer:'Tenemos uno de super man unitalla a 50.000 y otro de sharkboy talla s a 100.000'}];
 const c=validate(p).context;const item={source_task_id:source,source_excerpt:'uno de super man unitalla a 50.000',name:'super man',variant:'unitalla',unit_price_cop:50000,quantity:1};
 const d=decision({intent:'checkout',reply_text:'¿Domicilio o recogida?',confirmed_item:item});
 const ok=guard(c,d,['consultar_informacion']);assert.equal(ok.status,'decision_ready');assert.deepEqual(ok.decision.confirmed_item,item);assert.deepEqual(ok.decision.actions,[]);noEffects(ok);
 for(const patch of [{source_task_id:crypto.randomUUID()},{unit_price_cop:100000},{variant:'talla XL'},{source_excerpt:'super man a 5.000'},{quantity:0},{source_excerpt:p.snapshot.confirmed_answers[0].answer}])assert.equal(guard(c,{...d,confirmed_item:{...item,...patch}},['consultar_informacion']).status,'unverified_confirmed_item');
 assert.equal(guard(c,d,[]).status,'unverified_confirmed_item');
 c.checkout={pending_selection:item};
 const continued=guard(c,{...d,reply_text:'Ya está listo para recoger.',checkout:{fulfillment_type:'pickup'}},['consultar_informacion']);
 assert.equal(continued.status,'decision_ready');assert.equal(continued.decision.confirmed_item,null);
 assert.equal(continued.decision.checkout.fulfillment_type,'pickup');assert.doesNotMatch(continued.decision.reply_text,/listo para recoger/i);
 const changed=guard(c,{...d,confirmed_item:{...item,quantity:2}},['consultar_informacion']);
 assert.equal(changed.decision.confirmed_item.quantity,2);
});

test('human questions omit appended catalog checklists while keeping distinct customer questions',()=>{
 const c=validate(attentionFixture('humano')).context;
 const ask=question=>guard(c,decision({intent:'handoff',human_reason:'missing_information',human_question:question}),['solicitar_equipo']).decision.actions[0].question;
 assert.equal(ask('¿Tenemos disfraces de Halloween? Indicar para cada opción: nombre exacto, tallas y precio. Si hay modelos agotados, marcarlo así.'),'¿Tenemos disfraces de Halloween?');
 assert.equal(ask('¿Tenemos disfraces de Halloween? Si es así, indicar tallas, precios y cantidades en stock.'),'¿Tenemos disfraces de Halloween?');
 assert.equal(ask('¿Tenemos disfraces de Halloween? Indique modelos (nombre exacto), tallas y precio por unidad.'),'¿Tenemos disfraces de Halloween?');
 assert.equal(ask('¿Hay tallas infantiles? ¿Qué precio tienen?'),'¿Hay tallas infantiles? ¿Qué precio tienen?');
 assert.equal(ask('Confirmar el horario del domingo.'),'Confirmar el horario del domingo.');
});

test('human task proposals do not require a redundant tool call or bypass factual evidence',()=>{
 const c=validate(attentionFixture('humano')).context;
 const d=decision({intent:'handoff',human_reason:'missing_information',human_question:'¿Tenemos disfraces?',reply_text:'Ya avisé al equipo.'});
 const proposed=guard(c,d,['consultar_informacion']);
 assert.equal(proposed.status,'decision_ready');assert.equal(proposed.requires_commit,true);noEffects(proposed);
 assert.doesNotMatch(proposed.decision.reply_text,/Ya avisé/);
 assert.equal(guard(c,{...d,human_reason:'approve_payment'},[]).status,'invalid_handoff');
 assert.equal(guard(c,decision({intent:'information',reply_text:'Tenemos disfraces.'}),[]).status,'missing_tool_evidence');
});
