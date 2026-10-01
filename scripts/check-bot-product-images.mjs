import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';
const secret=JSON.parse(await readFile(homedir()+'/.config/grupo-el-rey/n8n-rebuild-secrets.json')).N8N_REBUILD_WEBHOOK_SECRET;
const imageId='50000000-0000-4000-8000-000000000001';
const results=[];
for(const [name,question,hasImage] of [['foto_producto','¿Me muestras una foto del ramo de rosas?',true],['foto_sin_inventario','¿Me muestras una foto del ramo de rosas? Solo quiero ver cómo se ve, sin comprar todavía.',true],['foto_faltante','¿Me mandas una foto del disfraz de dinosaurio?',false]]){
 const p=attentionFixture('horario');p.snapshot.message.text=question;p.snapshot.product_images=[{id:imageId,product_id:'TEST-RAMO',task_id:null,caption:'Ramo de rosas rojas, vista frontal'}];
 if(name==='foto_sin_inventario')p.snapshot.products=p.snapshot.products.map(x=>({...x,stock_verified:false}));
 const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secret},body:JSON.stringify(p),signal:AbortSignal.timeout(110000)});const b=await r.json();
 const passed=b.status==='decision_ready'&&b.send_allowed===false&&b.mutations_executed?.length===0&&(hasImage?b.decision.media_ids?.includes(imageId):!b.decision.media_ids?.length&&b.decision.intent==='handoff');
 const result={name,status:r.status,decision_status:b.status,passed,decision:b.decision};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(new URL('../n8n/rebuild/product-images-evidence-20260930.json',import.meta.url),JSON.stringify({checked_at:new Date().toISOString(),workflow_version:'f0414e5c-3466-4f57-88fc-4888e1f7c491',scope:'synthetic_published_model_no_customer_messages',results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
