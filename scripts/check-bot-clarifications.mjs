import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {attentionFixture} from '../n8n/rebuild/attention-fixtures.mjs';

// Real published model, synthetic conversations, no WhatsApp or database writes.
const secrets=JSON.parse(await readFile(join(homedir(),'.config/grupo-el-rey/n8n-rebuild-secrets.json'),'utf8'));
const cases=[
  {name:'negative_fact',question:'¿Hay cargadores para carros eléctricos?',internal:'Indicar puestos, conectores y horarios.',answer:'no hay cargadores para carros eléctricos',accept:text=>/no (?:tenemos|hay|contamos|disponemos)/i.test(text)&&/cargador/i.test(text)&&!/(?:CCS|CHAdeMO|tipo 2|puestos|conector)/i.test(text)},
  {name:'conditional_fact',question:'¿Me pueden envolver el regalo hoy?',answer:'solo de lunes a viernes, cuesta $5.000 por paquete; no incluye caja',accept:text=>/lunes.*viernes/i.test(text)&&/5[.,]?000/.test(text)&&/no incluye (?:la )?caja|sin caja/i.test(text)},
  {name:'uncertainty_preserved',question:'¿Hay parqueadero gratis?',answer:'no está confirmado que sea gratis; no prometerlo',accept:text=>/no.*confirm|sin confirmar|pendiente.*confirm/i.test(text)&&!/es gratis|es gratuito|sin costo/i.test(text)}
];
const results=[];
for(const c of cases){
  const p=attentionFixture('horario');p.mode='pilot';p.snapshot.source='intranet';p.context_fingerprint='d'.repeat(64);
  p.snapshot.branch.name='Sede de prueba';p.snapshot.message.text=c.question;
  p.snapshot.human_resolution={task_id:crypto.randomUUID(),inbound_message_id:p.snapshot.message.id,question:c.question+(c.internal?' '+c.internal:''),answer:c.answer};
  const r=await fetch('https://intranetelrey.app.n8n.cloud/webhook/el-rey-assistant-turn-v1',{method:'POST',headers:{'content-type':'application/json','x-elrey-webhook-secret':secrets.N8N_REBUILD_WEBHOOK_SECRET},body:JSON.stringify(p),signal:AbortSignal.timeout(115000)});
  const b=await r.json();const text=b.decision?.reply_text||'';
  const passed=r.ok&&b.status==='decision_ready'&&b.decision.intent==='information'&&b.decision.actions.length===0&&b.send_allowed===false&&b.mutations_executed.length===0&&!/el equipo responde|según (?:el administrador|la intranet)|sobre tu consulta|indicar puestos|nuestro horario|horario de la sede|9:00|20:00|si quieres|si hoy|puedo pedir|lo prepare/i.test(text)&&c.accept(text);
  results.push({name:c.name,status:r.status,decision_status:b.status,passed,reply:text,evidence:b.evidence});
}
const report={checked_at:new Date().toISOString(),scope:'published_n8n_synthetic_clarifications_no_customer_effects',results};
await writeFile(new URL('../n8n/rebuild/clarification-evidence-20260929.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
assert.ok(results.every(r=>r.passed),'A clarification changed a fact or failed the response contract');
