import assert from 'node:assert/strict';
// Runs against the isolated PostgreSQL instance bootstrapped by whatsapp-database.
export async function runV2Scenarios(db) {
 const at='2026-09-20T15:00:00Z';let serial=0;
 const call=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 async function fixture({body='Hola',consent='pending',time=at}={}) {
  const n=++serial;
  const contact=(await db.query("insert into whatsapp_contacts(phone_e164) values($1) returning id",['+57009000'+String(n).padStart(4,'0')])).rows[0].id;
  const c=(await db.query("insert into whatsapp_conversations(contact_id,consent_status,consent_version,consented_at) values($1,$2,'v2-test',now()) returning id",[contact,consent])).rows[0].id;
  return {c,contact,m:await message(c,body,time)};
 }
 async function message(c,body,time=at) {return (await db.query("insert into whatsapp_messages(conversation_id,direction,sender_type,message_type,body,meta_message_id,created_at) values($1,'inbound','customer','text',$2,$3,$4) returning id",[c,body,'v2-test-'+(++serial),time])).rows[0].id;}
 const state=async c=>(await db.query('select * from whatsapp_conversations where id=$1',[c])).rows[0];
 const run=async(m,time=at)=>call('prepare_whatsapp_v2_turn',[m,time]);
 const jobs=async time=>(await db.query('select * from claim_whatsapp_v2_jobs($1,20)',[time])).rows;
 const web=await fixture({body:'Hola, quiero consultar un regalo [ORIGEN:WEB] [SEDE:san-antonio-prado] [METODO_SELECCION:MANUAL]'});
 assert.equal((await run(web.m)).route,'maintenance');
 await db.exec('update whatsapp_bot_runtime set enabled=true');
 const privacy=await run(web.m);assert.equal(privacy.consent_required,true);assert.equal((await run(web.m)).message_id,privacy.message_id);
 assert.equal((await state(web.c)).branch_id,'b10');assert.match((await state(web.c)).landing_context.initial_message,/regalo/);
 const accept=await message(web.c,'Acepto');const name=await run(accept);
 assert.match((await db.query('select body from whatsapp_messages where id=$1',[name.message_id])).rows[0].body,/cómo te llamas/i);
 assert.equal((await state(web.c)).consent_status,'granted');
 const input=await message(web.c,'Soy María');assert.equal((await run(input)).phase,'name');
 assert.equal((await state(web.c)).branch_id,'b10');
 const denied=await fixture();await run(denied.m);await run(await message(denied.c,'No acepto'));
 assert.equal((await state(denied.c)).status,'closed');
 const unrecognized=await fixture();await run(unrecognized.m);
 assert.equal((await run(await message(unrecognized.c,'quiero información'))).consent_required,true);
 assert.equal((await state(unrecognized.c)).consent_status,'pending');
 console.log('PASS v2 disabled by default, consent before AI, web selection preserved, refusal and unknown consent');
 const overnight=await fixture({time:'2026-09-21T02:00:00Z'});
 await run(overnight.m,'2026-09-21T02:00:00Z');
 const accepted=await message(overnight.c,'Acepto','2026-09-21T02:01:00Z');
 const notice=await run(accepted,'2026-09-21T02:01:00Z');
 assert.match((await db.query('select body from whatsapp_messages where id=$1',[notice.message_id])).rows[0].body,/9:00/);
 assert.equal(new Date((await state(overnight.c)).resume_due_at).toISOString(),'2026-09-21T14:00:00.000Z');
 assert.equal((await jobs('2026-09-21T13:59:00Z')).length,0);
 const opening=(await jobs('2026-09-21T14:00:00Z')).find(j=>j.conversation_id===overnight.c);
 assert.ok(opening);assert.equal((await jobs('2026-09-21T14:00:01Z')).filter(j=>j.id===opening.id).length,0);
 const resumed=await call('prepare_whatsapp_v2_job',[opening.id,opening.lease_id,'2026-09-21T14:00:00Z']);
 assert.equal(resumed.route,'agent');assert.equal((await call('prepare_whatsapp_v2_job',[opening.id,opening.lease_id,'2026-09-21T14:00:00Z'])).inbound_message_id,resumed.inbound_message_id);
 assert.equal(await call('complete_whatsapp_v2_job',[opening.id,'00000000-0000-4000-8000-000000000000']),false);
 assert.equal(await call('complete_whatsapp_v2_job',[opening.id,opening.lease_id]),true);
 assert.equal((await state(overnight.c)).resume_due_at,null);
 console.log('PASS v2 opening queue, service hours, exclusive lease and idempotent resumption');
 async function waiting(overrides='') {const f=await fixture({consent:'granted'});await db.query("update whatsapp_conversations set bot_version='v2',status='waiting_customer',waiting_for='customer',awaiting_since=$2,awaiting_message_id=$3 "+overrides+' where id=$1',[f.c,at,f.m]);return f;}
 const reminder=await waiting(), paused=await waiting(',automation_paused=true'), team=await waiting();
 await db.query("update whatsapp_conversations set waiting_for='team' where id=$1",[team.c]);
 assert.equal((await jobs('2026-09-20T15:29:59Z')).filter(j=>j.conversation_id===reminder.c).length,0);
 let job=(await jobs('2026-09-20T15:30:00Z')).find(j=>j.conversation_id===reminder.c);assert.ok(job);
 assert.equal((await db.query('select id from whatsapp_bot_jobs where conversation_id=any($1::uuid[])',[[paused.c,team.c]])).rows.length,0);
 const queued=await call('prepare_whatsapp_v2_job',[job.id,job.lease_id,'2026-09-20T15:30:00Z']);assert.equal(queued.route,'send');
 job=(await jobs('2026-09-20T15:33:00Z')).find(j=>j.id===job.id);
 assert.equal((await call('prepare_whatsapp_v2_job',[job.id,job.lease_id,'2026-09-20T15:33:00Z'])).message_id,queued.message_id);
 await call('complete_whatsapp_v2_job',[job.id,job.lease_id]);
 assert.equal((await jobs('2026-09-20T16:10:00Z')).filter(j=>j.conversation_id===reminder.c).length,0);
 const race=await waiting();const raceJob=(await jobs('2026-09-20T15:30:00Z')).find(j=>j.conversation_id===race.c);
 await message(race.c,'Ya volví','2026-09-20T15:30:01Z');
 assert.equal((await call('prepare_whatsapp_v2_job',[raceJob.id,raceJob.lease_id,'2026-09-20T15:30:02Z'])).route,'silent');
 assert.equal((await db.query("select count(*)::int as n from whatsapp_messages where idempotency_key=$1",['v2-reminder:'+race.c])).rows[0].n,0);
 await db.exec('update whatsapp_bot_runtime set enabled=false');
 console.log('PASS v2 single reminder after 30min, no manual/team interruption, retry without duplicates, late-reply race');
}
