// Model decisions only, with synthetic data: no sends, orders or database writes.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const version=process.env.N8N_WORKFLOW_VERSION||'b2801dd4-1753-4315-8fe7-ba45a9c1f21e';
const task='40000000-0000-4000-8000-000000000001';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const tests=[
 {name:'consulta_antes_de_elegir_sede',text:'7',setup:s=>s.onboarding_request='¿Cuánto cuesta el peluche de prueba?',verify:d=>/300[.,]?000/.test(d.reply_text)&&!d.actions.length&&!/reserv|separ|apart|(?:quieres|deseas) que (?:consulte|busque|verifique)/.test(norm(d.reply_text))},
 {name:'precio_ya_pendiente',text:'¿Y el precio?',setup:s=>{s.products=[];s.pending_tasks=[{id:task,status:'pending',question:'Confirmar disponibilidad y precio del inflador de prueba'}];s.history=[{role:'customer',text:'¿Tienen inflador de prueba?'},{role:'assistant',text:'Dame un momento, voy a consultar disponibilidad y precio.'}];},verify:d=>!d.actions.length&&/confirm|consult|pendiente|verific/.test(norm(d.reply_text))},
 {name:'producto_no_registrado',text:'¿Tienen inflador de prueba? Necesito dos, ¿qué precio tienen?',setup:s=>s.products=[],verify:d=>d.intent==='handoff'&&d.actions.length===1&&/inflador/.test(norm(d.actions[0].question))&&/precio/.test(norm(d.actions[0].question))&&!/quieres que|deseas que/i.test(d.reply_text)},
 {name:'foto_con_contexto',text:'De estos que brillan',setup:s=>{s.products=[];s.message.kind='image';s.message.attachment={id:task,message_id:s.message.id,persisted:true};s.history=[{role:'customer',text:'Necesito luces de Navidad, ¿tienen?'},{role:'assistant',text:'¿Tienes una referencia del producto?'}];},verify:d=>d.intent==='handoff'&&d.actions.length===1&&/luces|navidad/.test(norm(d.actions[0].question))&&/adjunt|foto|imagen/.test(norm(d.actions[0].question))&&!/no (?:adjunto|envio).*imagen|cantidad solicitada:? 1/.test(norm(d.actions[0].question))&&!/veo en la|en la imagen se|he revisado la foto/i.test(d.reply_text)},
 {name:'precio_humano_completo',text:'¿Cuánto cuesta el artículo de prueba?',setup:s=>{s.products=[];s.human_resolution={task_id:task,inbound_message_id:s.message.id,question:s.message.text,answer:'El artículo de prueba cuesta 72.000 pesos.'};},verify:d=>/72[.,]?000/.test(d.reply_text)&&!d.actions.length&&!/[?¿]|\bSi\s*$/i.test(d.reply_text)},
 {name:'pregunta_explicita_del_equipo',text:'Quiero el artículo de prueba',setup:s=>{s.products=[];s.human_resolution={task_id:task,inbound_message_id:s.message.id,question:s.message.text,answer:'Sí, está disponible a 72.000 pesos. ¿Lo necesitas a domicilio o para recoger en la sede?'};},verify:d=>/72[.,]?000/.test(d.reply_text)&&/domicilio/.test(d.reply_text)&&/recog|sede/.test(d.reply_text)&&d.reply_text.endsWith('?')&&!d.actions.length},
 {name:'visita_sin_reserva_inventada',text:'Listo, ya voy para allá, gracias',setup:s=>s.history=[{role:'customer',text:'¿Tienen el peluche de prueba?'},{role:'assistant',text:'Sí, tenemos el peluche de prueba a $300.000 en la sede de prueba.'}],verify:d=>!d.actions.length&&!d.quote?.items?.length&&!d.confirmed_item&&!/reserv|apart|pedido.*registr/.test(norm(d.reply_text))},
 {name:'domicilio_datos_en_un_mensaje',text:'La compra a nombre de Ana, recibe Ana. Celular 3001234567. Calle 10 # 20-30, apto 402, barrio Prado.',setup:s=>{s.products=[];s.confirmed_answers=[{id:task,answer:'Peluche de prueba a 50.000 pesos'}];s.checkout={stage:'collecting',fulfillment_type:'delivery',pending_selection:{source_task_id:task,source_excerpt:'Peluche de prueba a 50.000 pesos',name:'Peluche de prueba',variant:'',quantity:1,unit_price_cop:50000}};s.history=[{role:'assistant',text:'Envíame nombre para la compra y de quien recibe, teléfono, dirección y barrio juntos.'}];},verify:d=>d.intent==='checkout'&&d.checkout.customer_name==='Ana'&&d.checkout.recipient_name==='Ana'&&String(d.checkout.recipient_phone).replace(/\D/g,'')==='3001234567'&&/10.*20.*30/.test(d.checkout.delivery_address)&&/402/.test(d.checkout.delivery_address)&&norm(d.checkout.delivery_zone)==='prado'&&!d.actions.length}
];
const file=new URL('../n8n/rebuild/conversation-review-evidence-20261009.json',import.meta.url);
const verify=(t,r)=>{try{return r.status==='decision_ready'&&!!t.verify(r.decision)&&!r.decision.accept_summary&&!r.decision.cancel_cart;}catch{return false;}};
if(process.argv.includes('--verify-saved')){
 const data=JSON.parse(await readFile(file,'utf8'));
 if(data.workflow_version!==version)throw Error('Different workflow version');
 for(const t of tests){const r=data.results.find(r=>r.name===t.name);if(!r||!verify(t,r))throw Error('Failed saved assertion: '+t.name);}
 console.log('PASS '+tests.length+' saved synthetic model decisions');process.exit(0);
}
const secret=JSON.parse(await readFile(homedir()+'/.config/grupo-el-rey/n8n-rebuild-secrets.json','utf8')).N8N_REBUILD_WEBHOOK_SECRET;
const results=[];
for(const t of tests){
 const p=attentionFixture(t.name);p.snapshot.customer={};p.snapshot.message.text=t.text;t.setup(p.snapshot);
 let r,attempts=0,error;const start=Date.now();
 do{
  attempts++;
  try{const res=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secret},body:JSON.stringify(p),signal:AbortSignal.timeout(110000)});const raw=await res.text();try{r=JSON.parse(raw);}catch{r={message:raw.slice(0,200)};}error=res.ok?undefined:'HTTP '+res.status+': '+String(r.message||'No decision returned');}catch(e){error=e.message;}
 }while(attempts<2&&(error||r?.status==='agent_unavailable'));
 const result={name:t.name,status:r?.status,error,attempts,duration_ms:Date.now()-start,decision:r?.decision};result.passed=verify(t,result);results.push(result);
 console.log(JSON.stringify(result));
 if(error)break;
}
if(results.length===tests.length&&results.every(r=>r.passed))await writeFile(file,JSON.stringify({checked_at:new Date().toISOString(),workflow_version:version,scope:'published_model_synthetic_decisions_only_no_sends_or_commits',results},null,2)+'\n');
else process.exitCode=1;
