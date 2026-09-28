import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(migrationDir)).filter(f=>f.endsWith('.sql')).sort();
const admin='10000000-0000-4000-8000-000000000001',cashier='10000000-0000-4000-8000-000000000002',disabled='10000000-0000-4000-8000-000000000003';
for(const withV2 of [false,true]){
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
   create publication supabase_realtime;`);
  for(const filename of files){
   if(!withV2&&filename.startsWith('20260920'))continue;
   await db.exec((await readFile(new URL(filename,migrationDir),'utf8')).replace(/create extension if not exists pgcrypto;/,''));
  }
  await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,cashier,disabled]);
  await db.query("insert into profiles(id,role,branch_id,active) values($1,'admin',null,true),($2,'cashier','b2',true),($3,'admin',null,false) on conflict(id) do update set role=excluded.role,branch_id=excluded.branch_id,active=excluded.active",[admin,cashier,disabled]);
  const query=async(sql,values=[])=>(await db.query(sql,values)).rows;
  let serial=0;
  const fixture=async()=>{
   const contact=(await query("insert into whatsapp_contacts(phone_e164) values($1) returning id",['+5700000000'+(++serial)]))[0];
   return (await query("insert into whatsapp_conversations(contact_id,branch_id,consent_status,consent_version,consented_at) values($1,'b1','granted','test',now()) returning id",[contact.id]))[0].id;
  };
  const c=await fixture(),other=await fixture();
  const act=async(action,{id=crypto.randomUUID(),operator=admin,conversation=c,text=null,paused=null,version=0}={})=>(await query('select apply_whatsapp_operator_action($1,$2,$3,$4,$5,$6,$7) r',[conversation,operator,id,action,text,paused,version]))[0].r;
  const queue=async(key,sender='assistant')=>(await query("select queue_outbound_whatsapp_message($1,$2,$3,'text','Prueba','{}') r",[c,key,sender]))[0].r.message_id;
  const claim=async(id)=>(await query('select claim_outbound_whatsapp_message($1,$2) r',[id,crypto.randomUUID()]))[0].r;
  const waiting=await queue('before-takeover'),sending=await queue('already-sending');
  assert.equal((await claim(sending)).send,true);
  const request=crypto.randomUUID();
  const takeover=await act('takeover',{id:request,paused:true});
  assert.equal(takeover.cancelled_messages,1);assert.equal(takeover.inflight_messages,1);assert.equal(takeover.automation_control_version,1);
  assert.equal((await claim(waiting)).send,false);assert.equal((await claim(sending)).state,'blocked_uncertain');
  assert.equal((await act('takeover',{id:request,paused:true})).duplicate,true);
  await assert.rejects(()=>act('takeover',{id:request,paused:false}),/otra acción/);
  await assert.rejects(()=>act('takeover',{id:request,conversation:other,paused:true}),/otra acción/);
  await assert.rejects(()=>act('takeover',{paused:false,version:0}),/otra sesión/);
  await assert.rejects(()=>act('instruction',{operator:cashier,text:'Cruzar sede',version:1}),/acceso/);
  await assert.rejects(()=>act('instruction',{operator:disabled,text:'Inactivo',version:1}),/acceso/);
  await assert.rejects(()=>act('instruction',{operator:null,text:'Sin identidad',version:1}),/acceso/);
  const noteId=crypto.randomUUID(),note=await act('instruction',{id:noteId,text:'Consultar disponibilidad con bodega',version:1});
  assert.equal(note.instruction_saved,true);assert.equal(note.automation_paused,true);assert.equal(note.automation_control_version,2);
  assert.equal((await query('select status from whatsapp_operator_actions where request_id=$1',[noteId]))[0].status,'pending_bot');
  assert.equal((await query("select count(*)::int n from whatsapp_messages where body like '%bodega%'"))[0].n,0);
  assert.equal((await act('instruction',{id:noteId,text:'Consultar disponibilidad con bodega',version:1})).duplicate,true);
  const during=await queue('during-takeover');assert.equal((await claim(during)).send,false);
  const sendId=crypto.randomUUID(),sent=await act('message',{id:sendId,text:'Te atiendo personalmente',version:2});
  assert.equal(sent.automation_paused,true);assert.ok(sent.message_id);assert.equal((await claim(sent.message_id)).send,true);
  assert.equal((await act('message',{id:sendId,text:'Te atiendo personalmente',version:2})).message_id,sent.message_id);
  assert.equal((await claim(sent.message_id)).state,'blocked_uncertain');
  const release=await act('takeover',{paused:false,version:3});assert.equal(release.automation_paused,false);
  assert.equal((await claim(during)).send,false);assert.equal((await claim(waiting)).send,false);
  const after=await queue('after-release');assert.equal((await claim(after)).send,true);
  // An old retry cannot restore an older mode after another successful action.
  await act('takeover',{id:request,paused:true});assert.equal((await query('select automation_paused from whatsapp_conversations where id=$1',[c]))[0].automation_paused,false);
  const versionBefore=(await query('select automation_control_version v from whatsapp_conversations where id=$1',[other]))[0].v;
  await db.query("update whatsapp_conversations set consent_status='pending',consented_at=null where id=$1",[other]);
  await assert.rejects(()=>act('message',{conversation:other,text:'No autorizado',version:versionBefore}),/autorización/);
  assert.equal((await query('select automation_control_version v from whatsapp_conversations where id=$1',[other]))[0].v,versionBefore);
  // Service-only mutation grants; a browser cannot forge an operator id.
  const permissions=(await query("select has_function_privilege('authenticated','public.apply_whatsapp_operator_action(uuid,uuid,uuid,text,text,boolean,integer)','execute') browser,has_function_privilege('service_role','public.apply_whatsapp_operator_action(uuid,uuid,uuid,text,text,boolean,integer)','execute') worker"))[0];
  assert.deepEqual(permissions,{browser:false,worker:true});
  console.log('CONTROL_FUNCTION_HASHES',JSON.stringify((await query("select md5(pg_get_functiondef('public.apply_whatsapp_operator_action(uuid,uuid,uuid,text,text,boolean,integer)'::regprocedure)) action_hash,md5(pg_get_functiondef('public.claim_outbound_whatsapp_message(uuid,uuid)'::regprocedure)) claim_hash"))[0]));
  console.log(`PASS manual-control invariants (${withV2?'all local migrations':'production schema without v2'})`);
 }finally{await db.close();}
}
