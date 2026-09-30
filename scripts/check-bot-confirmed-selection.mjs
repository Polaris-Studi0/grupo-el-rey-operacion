import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const secrets=JSON.parse(await readFile(join(homedir(),'.config/grupo-el-rey/n8n-rebuild-secrets.json'),'utf8'));
const source='40000000-0000-4000-8000-000000000001';
const answer='Sí, tenemos en la sede 2 disfraces, uno de super man unitalla a 50.000 y otro de sharkboy talla s a 100.000';
const item={source_task_id:source,source_excerpt:'uno de super man unitalla a 50.000',name:'super man',variant:'unitalla',unit_price_cop:50000,quantity:1};
const base=()=>{const p=attentionFixture('horario');Object.assign(p.snapshot,{products:[],last_options:[],cart:[],checkout:{},confirmed_answers:[{id:source,answer}],information:[{id:source,topic:'Información confirmada del operador',text:answer}],history:[{role:'customer',text:'Quiero saber si tienen disfraces para halloween'},{role:'assistant',text:'Tenemos dos opciones: Super Man unitalla a $50.000 y Sharkboy talla S a $100.000.'}]});return p;};
const cases=[
 ['elige_superman',s=>{s.message.text='me darias porfa el de superman';},d=>d.intent==='checkout'&&d.confirmed_item?.source_task_id===source&&d.confirmed_item?.unit_price_cop===50000&&d.confirmed_item?.quantity===1&&d.actions.length===0&&!d.accept_summary],
 ['elige_segunda_opcion',s=>{s.message.text='Prefiero el segundo, porfa';},d=>d.intent==='checkout'&&d.confirmed_item?.unit_price_cop===100000&&/sharkboy/i.test(d.confirmed_item.name)&&d.actions.length===0],
 ['continua_recogida',s=>{s.checkout={pending_selection:item,stage:'collecting'};s.history.push({role:'customer',text:'Quiero el de Superman'},{role:'assistant',text:'Claro, el de Superman unitalla a $50.000. ¿Domicilio o recogida?'});s.message.text='Lo recojo en la sede';},d=>d.intent==='checkout'&&d.checkout.fulfillment_type==='pickup'&&!d.confirmed_item&&d.actions.length===0],
 ['nombre_sin_repetir_producto',s=>{s.checkout={pending_selection:item,stage:'collecting',fulfillment_type:'pickup'};s.history.push({role:'assistant',text:'¿A nombre de quién hacemos la compra?'});s.message.text='A nombre de Ana Pérez';},d=>d.intent==='checkout'&&d.checkout.customer_name==='Ana Pérez'&&!d.confirmed_item&&d.actions.length===0],
 ['consulta_sin_datos_pide_solo_lo_necesario',s=>{s.confirmed_answers=[];s.information=[];s.history=[];s.message.text='¿Tienen disfraces para Halloween?';},d=>d.intent==='handoff'&&d.actions.length===1&&!/product_id|otras sedes|nombre exacto|cantidades en stock/i.test(d.actions[0].question)]
];
const evidencePath=new URL('../n8n/rebuild/confirmed-selection-evidence-20260930.json',import.meta.url);
const only=process.argv[2];
if(only&&!cases.some(([name])=>name===only))throw Error('Caso de prueba desconocido');
const previous=only?JSON.parse(await readFile(evidencePath,'utf8').catch(()=>'{"results":[]}')).results:[];
const results=previous.filter(result=>result.name!==only);
for(const[name,configure,verify]of cases.filter(([name])=>!only||name===only)){const p=base();configure(p.snapshot);const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secrets.N8N_REBUILD_WEBHOOK_SECRET},body:JSON.stringify(p),signal:AbortSignal.timeout(115000)});const d=await r.json();const check={name,checked_at:new Date().toISOString(),workflow_version:process.env.N8N_WORKFLOW_VERSION||null,passed:r.ok&&d.status==='decision_ready'&&verify(d.decision),http:r.status,status:d.status,decision:d.decision,evidence:d.evidence};results.push(check);console.log(JSON.stringify(check));}
await writeFile(evidencePath,JSON.stringify({checked_at:new Date().toISOString(),scope:'published_model_synthetic_data_no_customer_messages',results},null,2)+'\n');if(results.some(r=>!r.passed))process.exitCode=1;
