import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';

// Published private engine, synthetic data only. Never print headers or secrets.
const secrets=JSON.parse(await readFile(process.env.ELREY_REBUILD_SECRETS_FILE||join(homedir(),'.config/grupo-el-rey/n8n-rebuild-secrets.json'),'utf8'));
const secret=secrets.N8N_REBUILD_WEBHOOK_SECRET;
if(!secret)throw Error('Falta la clave privada del webhook nuevo.');
const endpoint='https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1';
const results=[];
async function check(name,packet,key,accept){
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(key?{'x-elrey-webhook-secret':key}:{})},body:JSON.stringify(packet),redirect:'error',signal:AbortSignal.timeout(115000)});
  const body=await response.json().catch(()=>null);
  const passed=accept(response.status,body);results.push({name,status:response.status,passed,decision_status:body?.status});
  if(!passed){console.error(JSON.stringify({results}));throw Error(`Falló ${name}`);}
}
const noEffects=body=>body?.send_allowed===false&&Array.isArray(body.mutations_executed)&&body.mutations_executed.length===0;
await check('missing_key_rejected',{},null,status=>[401,403].includes(status));
await check('wrong_key_rejected',{},'invalid-test',status=>[401,403].includes(status));
const blocked=attentionFixture('horario');blocked.mode='production';
await check('automatic_mode_blocked',blocked,secret,(status,body)=>status===503&&body?.status==='integration_not_enabled'&&noEffects(body));
const paused=attentionFixture('horario');paused.snapshot.control.manual_paused=true;
await check('manual_control_blocks_ai',paused,secret,(status,body)=>status===200&&body?.status==='manual_control'&&noEffects(body));
const human=attentionFixture('humano');
await check('human_request_real_model',human,secret,(status,body)=>status===200&&body?.status==='decision_ready'&&body.turn_id===human.turn_id&&body.decision.intent==='handoff'&&body.decision.actions[0]?.reason==='human_request'&&body.decision.actions[0]?.related_message_id===human.snapshot.message.id&&body.decision.reply_text==='Para continuar, una persona del equipo debe atenderte por este chat.'&&noEffects(body));
const preview=attentionFixture('horario');preview.mode='preview';preview.snapshot.source='intranet';preview.context_fingerprint='a'.repeat(64);
await check('preview_contract_real_model_with_synthetic_fixture',preview,secret,(status,body)=>status===200&&body?.status==='decision_ready'&&body.mode==='preview'&&body.source==='intranet'&&body.turn_id===preview.turn_id&&body.expected_context_fingerprint===preview.context_fingerprint&&body.decision.intent==='information'&&/20:00|8\s*p\.?\s*m\.?/i.test(body.decision.reply_text)&&noEffects(body));
const pilot=attentionFixture('horario');pilot.mode='pilot';pilot.snapshot.source='intranet';pilot.context_fingerprint='b'.repeat(64);
await check('pilot_contract_real_model_with_synthetic_fixture',pilot,secret,(status,body)=>status===200&&body?.status==='decision_ready'&&body.mode==='pilot'&&body.source==='intranet'&&body.turn_id===pilot.turn_id&&body.expected_context_fingerprint===pilot.context_fingerprint&&body.decision.intent==='information'&&noEffects(body));
console.log(JSON.stringify({checked_at:new Date().toISOString(),workflow_id:'pGxqUgjYE6NCyiwZ',scope:'published_engine_synthetic_data_no_customer_effects',results},null,2));
