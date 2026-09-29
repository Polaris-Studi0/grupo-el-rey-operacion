import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const secrets=JSON.parse(await readFile(join(homedir(),'.config/grupo-el-rey/n8n-rebuild-secrets.json'),'utf8'));
const results=[];
async function check(name,configure,verify){
 const p=attentionFixture('opciones');configure(p.snapshot);
 const response=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secrets.N8N_REBUILD_WEBHOOK_SECRET},body:JSON.stringify(p),signal:AbortSignal.timeout(115000)});
 const r=await response.json();const passed=response.ok&&r.status==='decision_ready'&&r.send_allowed===false&&verify(r.decision);
 const evidence={name,passed,status:response.status,decision_status:r.status,decision:r.decision};results.push(evidence);console.log(JSON.stringify(evidence));
}
await check('carrito_y_datos_compuestos',s=>{s.message.text='Quiero 2 ramos para domicilio. Me llamo Ana Pérez, la dirección es Calle 10 #20-30, barrio Floresta. Recibe Carlos, teléfono 3001112233.';},d=>d.intent==='quote'&&d.quote?.items[0]?.product_id==='TEST-RAMO'&&d.quote.items[0].quantity===2&&d.checkout.customer_name==='Ana Pérez'&&d.checkout.fulfillment_type==='delivery'&&d.checkout.recipient_name==='Carlos'&&!d.accept_summary);
await check('eleccion_pago_acepta_resumen',s=>{s.cart=[{product_id:'TEST-RAMO',quantity:2}];s.checkout={quote_id:'TEST-QUOTE',stage:'summary',summary_delivered:true,customer_name:'Ana',fulfillment_type:'pickup',subtotal:100000};s.history=[{role:'assistant',text:'Tu compra: 2 ramos, total $100.000, para recoger en sede. ¿Está todo correcto? Puedes elegir transferencia, Addi o Sistecrédito.'}];s.message.text='Sí, por transferencia porfa';},d=>d.intent==='checkout'&&d.accept_summary&&d.checkout.payment_method==='transfer');
await check('correccion_no_acepta_resumen',s=>{s.cart=[{product_id:'TEST-RAMO',quantity:2}];s.checkout={quote_id:'TEST-QUOTE',stage:'summary',summary_delivered:true,fulfillment_type:'delivery',delivery_address:'Calle 10 #20-30'};s.message.text='Mejor a la carrera 8 #15-20, barrio Prado';},d=>d.intent==='checkout'&&!d.accept_summary&&/8/.test(d.checkout.delivery_address));
await check('estado_pedido_espanol',s=>{s.order={id:'TEST-ORDER',status:'dispatched',summary:'Pedido REY-0042. Estado: en camino. Total: 260000 COP. No hay hora de entrega vigente confirmada.'};s.message.text='¿Cómo va mi pedido?';},d=>d.intent==='order_status'&&/camino/.test(d.reply_text)&&!/dispatched/.test(d.reply_text));
await check('pregunta_pago_sin_formulario',s=>{s.information.push({id:'TEST-PAYMENT',topic:'Medios de pago',text:'Transferencia por QR de la sede, Addi y Sistecrédito. Pago en sede solo al recoger. No hay contraentrega.'});s.message.text='¿Cuáles son los medios de pago?';},d=>d.intent==='information'&&/addi/i.test(d.reply_text)&&/sistecr[eé]dito/i.test(d.reply_text)&&!d.accept_summary);
await writeFile(new URL('../n8n/rebuild/commerce-evidence-20260929.json',import.meta.url),JSON.stringify({checked_at:new Date().toISOString(),scope:'published_engine_synthetic_data_no_customer_effects',results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
