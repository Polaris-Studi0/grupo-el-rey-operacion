// Synthetic proposals only: no WhatsApp sends or database mutations.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const secret=JSON.parse(await readFile(homedir()+'/.config/grupo-el-rey/n8n-rebuild-secrets.json','utf8'));
const source='40000000-0000-4000-8000-000000000001',discount='40000000-0000-4000-8000-000000000002';
const answer='Si, tenemos disfraces de la mujer maravilla en tall m, s. A 50.000';
function base(){
 const p=attentionFixture('horario');
 Object.assign(p.snapshot,{products:[],qr_assets:[],cart:[],last_options:[],checkout:{},confirmed_answers:[{id:discount,answer:'No'},{id:source,answer}],information:[{id:source,topic:'Consulta de producto',text:answer},{id:discount,topic:'¿Se puede dar descuento para este disfraz?',text:'No se puede aplicar descuento a este producto.'}],history:[{role:'customer',text:'¿Venden disfraces de mujer maravilla?'},{role:'assistant',text:'Tenemos Mujer Maravilla en tallas S y M a $50.000.'},{role:'customer',text:'¿No me puedes hacer un descuento?'},{role:'assistant',text:'Para este disfraz no tenemos descuento.'}]});return p;
}
const noActions=d=>d.actions?.length===0&&!d.accept_summary&&!d.cancel_cart;
const cases=[
 ['retoma_sin_talla',p=>{p.snapshot.message.text='bueno, entonces dame ese igualmente';},d=>d.intent==='clarification'&&/talla/i.test(d.reply_text)&&/\bS\b/i.test(d.reply_text)&&/\bM\b/i.test(d.reply_text)&&!d.confirmed_item&&noActions(d)],
 ['elige_s',p=>{p.snapshot.history.push({role:'customer',text:'bueno, entonces dame ese igualmente'},{role:'assistant',text:'Claro, ¿lo quieres en talla S o M?'});p.snapshot.message.text='la S porfa';},d=>d.intent==='checkout'&&d.confirmed_item?.variant?.toLowerCase()==='s'&&d.confirmed_item?.unit_price_cop===50000&&d.confirmed_item?.source_task_id===source&&noActions(d)],
 ['descuento_ya_negado',p=>{p.snapshot.message.text='¿Y de verdad no puedes hacerme descuento?';},d=>d.intent==='information'&&/no|precio/i.test(d.reply_text)&&noActions(d)],
 ['descuento_sin_politica',p=>{p.snapshot.confirmed_answers=[{id:source,answer}];p.snapshot.information=p.snapshot.information.slice(0,1);p.snapshot.history=p.snapshot.history.slice(0,2);p.snapshot.message.text='¿Me puedes hacer un descuento?';},d=>d.intent==='handoff'&&d.actions?.[0]?.reason==='missing_information'&&d.reply_text==='Dame un momento y te confirmo.'],
 ['talla_m_con_domicilio',p=>{p.snapshot.message.text='dame el de talla M, a domicilio porfa';},d=>d.intent==='checkout'&&d.confirmed_item?.variant?.toLowerCase()==='m'&&d.confirmed_item?.unit_price_cop===50000&&d.checkout?.fulfillment_type==='delivery'&&!d.checkout.customer_name&&noActions(d)]
];
const results=[];
for(const[name,configure,verify]of cases.filter(([name])=>!process.env.ONLY_CASE||name===process.env.ONLY_CASE)){
 const p=base();configure(p);
 const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secret.N8N_REBUILD_WEBHOOK_SECRET},body:JSON.stringify(p),signal:AbortSignal.timeout(110000)});
 const b=await r.json();const result={name,checked_at:new Date().toISOString(),http:r.status,status:b.status,decision:b.decision,evidence:b.evidence,passed:r.ok&&b.status==='decision_ready'&&b.send_allowed===false&&b.mutations_executed?.length===0&&verify(b.decision)};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(new URL('../n8n/rebuild/size-discount-evidence-20261001.json',import.meta.url),JSON.stringify({workflow_version:process.env.N8N_WORKFLOW_VERSION||null,synthetic:true,whatsapp_sends:0,results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
