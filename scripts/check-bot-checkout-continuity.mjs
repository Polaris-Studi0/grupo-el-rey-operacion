import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
import {checkoutReply} from '../src/bot-checkout.js';
const secret=JSON.parse(await readFile(homedir()+'/.config/grupo-el-rey/n8n-rebuild-secrets.json','utf8')).N8N_REBUILD_WEBHOOK_SECRET;
const source='40000000-0000-4000-8000-000000000001';
const cases=[
 ['nombre_explicito','A nombre de Samuel porfa',{},d=>d.checkout.customer_name==='Samuel'],
 ['telefono','3001234567',{customer_name:'Samuel'},d=>d.checkout.recipient_phone==='3001234567'],
 ['direccion_y_barrio','Calle 80 # 95-20, barrio Aures, recibe Ana, teléfono 3001234567',{customer_name:'Samuel'},d=>/80.*95.*20/.test(d.checkout.delivery_address)&&/Aures/i.test(d.checkout.delivery_zone)&&d.checkout.recipient_name==='Ana'&&/3001234567/.test(d.checkout.recipient_phone)],
 ['recibo_yo','Recibo yo',{customer_name:'Samuel',delivery_address:'Calle de prueba 10',delivery_zone:'Aures'},d=>d.checkout.recipient_name==='Samuel'],
 ['pregunta_costo_sin_direccion','¿Cuánto cuesta el domicilio?',{customer_name:'Samuel'},d=>d.intent==='checkout'&&!d.actions.length&&!d.accept_summary]
];
const results=[];
for(const [name,text,state,verify] of cases){
 const p=attentionFixture('horario');p.snapshot.products=[];p.snapshot.message.text=text;
 p.snapshot.checkout={stage:'collecting',fulfillment_type:'delivery',pending_selection:{source_task_id:source,source_excerpt:'super man unitalla a 50.000',name:'super man',variant:'unitalla',unit_price_cop:50000,quantity:1},...state};
 p.snapshot.confirmed_answers=[{id:source,answer:'Tenemos super man unitalla a 50.000'}];
 p.snapshot.history=[{role:'assistant',text:name==='recibo_yo'?'¿Quién recibe el pedido?':'¿Cuál es el siguiente dato de tu compra?'}];
 let decision=checkoutReply(p),route='server',status='decision_ready';
 if(!decision){route='model';const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secret},body:JSON.stringify(p),signal:AbortSignal.timeout(110000)});const response=await r.json();status=response.status;decision=response.decision;}
 const result={name,route,status,passed:status==='decision_ready'&&!!decision&&verify(decision),decision};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(new URL('../n8n/rebuild/checkout-continuity-evidence-20260930.json',import.meta.url),JSON.stringify({checked_at:new Date().toISOString(),workflow_version:process.env.N8N_WORKFLOW_VERSION||null,scope:'synthetic_server_and_published_model_no_sends_or_commits',results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
