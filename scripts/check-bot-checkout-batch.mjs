// Published-model checks use only synthetic context. No WhatsApp sends, orders
// or database commits are performed by this decision-only test endpoint.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const secret=JSON.parse(await readFile(homedir()+'/.config/grupo-el-rey/n8n-rebuild-secrets.json','utf8')).N8N_REBUILD_WEBHOOK_SECRET;
const source='40000000-0000-4000-8000-000000000001';
const form='Para coordinar el domicilio, envíame estos datos juntos:\n• Nombre para la compra y de quien recibe (si es la misma persona, basta un nombre)\n• Número de contacto\n• Dirección completa (incluye apartamento o indicaciones, si aplica)\n• Barrio o sector\nPuedes enviarlos en un solo mensaje, como te quede más fácil.';
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const phone=d=>String(d.checkout.recipient_phone||'').replace(/\D/g,'');
const address=d=>/10.*20.*30/.test(d.checkout.delivery_address||'');
const tests=[
 {name:'lista_sin_etiquetas',text:'Ana Pérez\n3001234567\nCalle 10 # 20-30, apto 402\nAures',verify:d=>normal(d.checkout.customer_name)==='ana perez'&&normal(d.checkout.recipient_name)==='ana perez'&&phone(d)==='3001234567'&&address(d)&&/402/.test(d.checkout.delivery_address)&&normal(d.checkout.delivery_zone)==='aures'},
 {name:'frase_comprador_distinto',text:'La compra a nombre de Juan Pérez, recibe Luisa Díaz. El teléfono es 3001234567 y la dirección Calle 10 # 20-30, apartamento 402, barrio Aures.',verify:d=>normal(d.checkout.customer_name)==='juan perez'&&normal(d.checkout.recipient_name)==='luisa diaz'&&phone(d)==='3001234567'&&address(d)&&/402/.test(d.checkout.delivery_address)&&normal(d.checkout.delivery_zone)==='aures'},
 {name:'recibo_yo_con_direccion',state:{customer_name:'Ana Pérez'},text:'Lo recibo yo en Calle 10 # 20-30, apto 402 del barrio Aures, celular 3001234567.',verify:d=>d.checkout.recipient_name==='Ana Pérez'&&phone(d)==='3001234567'&&address(d)&&normal(d.checkout.delivery_zone)==='aures'},
 {name:'respuesta_parcial',state:{customer_name:'Ana Pérez',recipient_name:'Ana Pérez',recipient_phone:'3001234567'},history:'Solo me falta:\n• Dirección completa\n• Barrio o sector',text:'Vivo en Calle 10 # 20-30, apartamento 402',verify:d=>address(d)&&/402/.test(d.checkout.delivery_address)&&!d.checkout.delivery_zone&&(!d.checkout.customer_name||d.checkout.customer_name==='Ana Pérez')&&(!d.checkout.recipient_name||d.checkout.recipient_name==='Ana Pérez')&&(!d.checkout.recipient_phone||phone(d)==='3001234567')},
 {name:'correccion_direccion',state:{customer_name:'Ana Pérez',recipient_name:'Luisa Díaz',recipient_phone:'3001234567',delivery_address:'Calle anterior 5',delivery_zone:'Prado'},text:'Mejor envíalo a Calle 10 # 20-30, apto 402, sigue siendo Prado.',verify:d=>address(d)&&/402/.test(d.checkout.delivery_address)&&(!d.checkout.customer_name||d.checkout.customer_name==='Ana Pérez')&&(!d.checkout.recipient_name||d.checkout.recipient_name==='Luisa Díaz')&&(!d.checkout.recipient_phone||phone(d)==='3001234567')&&(!d.checkout.delivery_zone||normal(d.checkout.delivery_zone)==='prado')},
 {name:'producto_sin_catalogo',purchase:false,text:'¿Tienen medias para mujer?',verify:d=>d.intent==='handoff'&&d.actions.some(a=>a.type==='propose_human_task')&&!/material.*color|color.*cantidad/i.test(d.reply_text)},
 {name:'interes_sin_compra',purchase:false,history:'Tenemos un peluche de prueba a $50.000. ¿Te interesa?',text:'Me gusta me gusta',verify:d=>d.intent==='clarification'&&!d.confirmed_item&&!d.quote?.items?.length&&!d.actions.length},
 {name:'audio_sin_transcripcion',kind:'audio',text:'[audio]',verify:d=>d.intent==='clarification'&&!d.actions.length&&!/transcrib|escuchar|audio.*revisar/i.test(d.reply_text)}
];
const evidenceFile=new URL('../n8n/rebuild/checkout-batch-evidence-20261002.json',import.meta.url);
if(process.argv.includes('--verify-saved')){
 // A complete patch that repeats an identical persisted value is also safe.
 // Recheck the saved synthetic model outputs with the current assertions;
 // retain their original generation time and published version.
 const evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
 if(process.env.N8N_WORKFLOW_VERSION&&evidence.workflow_version!==process.env.N8N_WORKFLOW_VERSION)throw new Error('Saved evidence is for a different published workflow');
 for(const r of evidence.results){const t=tests.find(t=>t.name===r.name),d=r.decision;let valid=false;try{valid=!!d&&t.verify(d);}catch{valid=false;}
  const guards=t.purchase===false||t.kind==='audio'||(d?.intent==='checkout'&&!d.actions?.length&&!d.accept_summary&&!d.cancel_cart);
  r.passed=r.status==='decision_ready'&&valid&&!!guards;
 }
 evidence.assertions_verified_at=new Date().toISOString();
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({scope:'saved_synthetic_model_outputs',results:evidence.results.map(r=>({name:r.name,passed:r.passed}))}));
 process.exit(evidence.results.some(r=>!r.passed)?1:0);
}
const results=[];
for(const t of tests){
 const p=attentionFixture(t.name);p.snapshot.customer={};p.snapshot.products=[];p.snapshot.message.text=t.text;p.snapshot.message.kind=t.kind||'text';
 p.snapshot.checkout=t.purchase===false?{}:{stage:'collecting',fulfillment_type:'delivery',pending_selection:{source_task_id:source,source_excerpt:'peluche de prueba a 50.000',name:'peluche de prueba',variant:'',unit_price_cop:50000,quantity:1},...t.state};
 p.snapshot.confirmed_answers=t.name==='producto_sin_catalogo'?[]:[{id:source,answer:'Tenemos un peluche de prueba a 50.000'}];
 p.snapshot.history=[{role:'assistant',text:t.history||form}];
 const started=Date.now();let response,error;
 try{
  const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secret},body:JSON.stringify(p),signal:AbortSignal.timeout(110000)});
  response=await r.json();
 }catch(e){error=e.message;}
 const d=response?.decision;let verified=false;
 if(d){try{verified=t.verify(d);}catch{verified=false;}}
 const guards=t.purchase===false||t.kind==='audio'||(d?.intent==='checkout'&&!d.actions?.length&&!d.accept_summary&&!d.cancel_cart);
 const result={name:t.name,status:response?.status,error,duration_ms:Date.now()-started,passed:response?.status==='decision_ready'&&verified&&!!guards,decision:d};
 results.push(result);console.log(JSON.stringify(result));
}
await writeFile(evidenceFile,JSON.stringify({checked_at:new Date().toISOString(),workflow_version:process.env.N8N_WORKFLOW_VERSION||null,scope:'published_model_synthetic_decisions_only_no_sends_or_commits',results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
