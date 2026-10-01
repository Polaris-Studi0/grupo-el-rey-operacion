import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
const reset=await readFile(new URL('../scripts/reset-all-business-data-20260930.sql',import.meta.url),'utf8');
{
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
  for(const f of files){if(f.startsWith('20260920'))continue;await db.exec((await readFile(new URL(f,dir),'utf8')).replace(/create extension if not exists pgcrypto;/,''));}
  await db.exec(`
   insert into whatsapp_contacts(id,phone_e164) values('10000000-0000-4000-8000-000000000001','+570000000001');
   insert into whatsapp_conversations(id,contact_id,branch_id) values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','b1');
   insert into whatsapp_messages(conversation_id,direction,sender_type,message_type,body) values('10000000-0000-4000-8000-000000000002','inbound','customer','text','Prueba aislada');
   insert into products(id,name) values('10000000-0000-4000-8000-000000000003','Producto de prueba');
   insert into branch_inventory(branch_id,product_id,price,available_qty,reserved_qty) values('b1','10000000-0000-4000-8000-000000000003',1000,10,2);
   insert into inventory_reservations(conversation_id,branch_id,product_id,quantity,expires_at) values('10000000-0000-4000-8000-000000000002','b1','10000000-0000-4000-8000-000000000003',2,now()+interval '1 hour');
   insert into inventory_movements(branch_id,product_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after) values('b1','10000000-0000-4000-8000-000000000003','import',10,0,10,0,0);
   insert into inventory_movements(branch_id,product_id,conversation_id,movement_type,quantity,available_before,available_after,reserved_before,reserved_after) values('b1','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','reservation',2,10,10,0,2);
   insert into orders(branch_id,fulfillment_type,customer_name,customer_phone,items,payment_method) values('b1','pickup','Cliente de prueba','+570000000001','[{"name":"Producto","qty":1,"unit_price":1000}]','transfer');
   insert into pqrs_cases(type,customer_name,customer_email,subject,description,consultation_token_hash,privacy_accepted_at) values('sugerencia','Cliente de prueba','test@example.invalid','Prueba aislada','Descripción de prueba aislada','synthetic',now());
   insert into storage.objects(bucket_id,name) values('pqrs-files','synthetic-file');
   insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000001','admin@example.invalid'),('20000000-0000-4000-8000-000000000002','cashier@example.invalid');
   update profiles set role='admin' where id='20000000-0000-4000-8000-000000000001';
   update profiles set branch_id='b1' where id='20000000-0000-4000-8000-000000000002';
   insert into staff_members(id,branch_id,full_name) values('20000000-0000-4000-8000-000000000003','b1','Cajero sintético');
   insert into couriers(id,name,plate,phone) values('20000000-0000-4000-8000-000000000004','Domiciliario sintético','TEST00','0000000000');
   update orders set courier_id='20000000-0000-4000-8000-000000000004',handoff_staff_id='20000000-0000-4000-8000-000000000003';
   insert into branch_knowledge(branch_id,category,title,content) values('b1','faq','Pregunta sintética','Respuesta sintética');
   insert into branch_payment_qrs(branch_id,storage_path,original_name,mime_type,size_bytes) values('b1','b1/synthetic.png','synthetic.png','image/png',100);
   insert into bot_media_assets(id,kind,storage_path,original_name,mime_type,size_bytes,caption) values('20000000-0000-4000-8000-000000000005','flyer','synthetic/flyer.png','flyer.png','image/png',100,'Prueba aislada');
   insert into whatsapp_marketing_permissions(phone_e164,status,evidence) values('+570000000001','granted','Prueba sintética aislada');
   insert into whatsapp_campaigns(id,name,asset_id,template,created_by) values('20000000-0000-4000-8000-000000000006','Prueba aislada','20000000-0000-4000-8000-000000000005','{}','20000000-0000-4000-8000-000000000001');
   insert into whatsapp_campaign_recipients(campaign_id,phone_e164) values('20000000-0000-4000-8000-000000000006','+570000000001');
   insert into storage.objects(bucket_id,name) values('payment-qrs','b1/synthetic.png'),('bot-images','synthetic/flyer.png');
   create schema elrey_reset_20260929;
   create table elrey_reset_20260929.untouched(id int);
   insert into elrey_reset_20260929.untouched values(1);
   create table unknown_dependency(id int,conversation_id uuid references whatsapp_conversations(id));
  `);
  const snapshot=async(name)=>(await db.query(name==='order_number_seq'?'select last_value,is_called from order_number_seq':`select to_jsonb(t) r from ${name} t order by to_jsonb(t)::text`)).rows;
  const preserve=['auth.users','profiles','branches','storage.objects','storage.buckets','order_number_seq','elrey_reset_20260929.untouched'];
  const before=await Promise.all(preserve.map(snapshot));
  const assertIntact=async()=>{
   await db.exec('rollback;');
   assert.equal((await db.query('select count(*)::int n from whatsapp_messages')).rows[0].n,1);
   assert.equal((await db.query("select to_regnamespace('elrey_reset_20260930') n")).rows[0].n,null);
  };
  await assert.rejects(()=>db.exec(reset),/Tabla no incluida/);await assertIntact();
  await db.exec('drop table unknown_dependency;create schema external;create table external.dependency(id uuid references public.whatsapp_conversations(id));');
  await assert.rejects(()=>db.exec(reset),/Dependencia no incluida/);await assertIntact();
  await db.exec("drop table external.dependency;insert into whatsapp_webhook_inbox(event_key,event_type,payload,processing_started_at) values('synthetic','test','{}',now());");
  await assert.rejects(()=>db.exec(reset),/Hay procesamiento/);await assertIntact();
  await db.exec("update whatsapp_webhook_inbox set processed_at=now();update whatsapp_campaign_recipients set status='sending';");
  await assert.rejects(()=>db.exec(reset),/Hay procesamiento/);await assertIntact();
  await db.exec("update whatsapp_campaign_recipients set status='pending';");
  // Force a failure AFTER the truncation; everything, including the archive, must roll back.
  await db.exec(`create function reset_test_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic post-truncate failure';end;$$;
    create trigger reset_test_failure after truncate on public.orders for each statement execute function reset_test_failure();`);
  await assert.rejects(()=>db.exec(reset),/synthetic post-truncate failure/);await assertIntact();
  await db.exec('drop trigger reset_test_failure on public.orders;drop function reset_test_failure();');
  const allTables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename);
  const allBefore=await Promise.all(allTables.map(snapshot));
  await db.exec(reset);
  const rows=(await db.query('select * from elrey_reset_20260930.manifest')).rows;
  assert.equal(rows.length,33);assert.equal(rows.filter(r=>r.disposition==='reset').length,31);
  assert.ok(rows.filter(r=>r.disposition==='reset').every(r=>Number(r.rows_after)===0));
  assert.deepEqual(await Promise.all(preserve.map(snapshot)),before);
  for(let i=0;i<allTables.length;i++)assert.deepEqual(await snapshot('elrey_reset_20260930.'+allTables[i]),allBefore[i]);
  assert.equal((await db.query('select count(*)::int n from elrey_reset_20260930.storage_objects_manifest')).rows[0].n,3);
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await db.query(`select has_schema_privilege('${role}','elrey_reset_20260930','usage') p`)).rows[0].p,false);
   for(const table of [...allTables,'manifest','storage_objects_manifest']){
    assert.equal((await db.query(`select has_table_privilege('${role}','elrey_reset_20260930.${table}','select') p`)).rows[0].p,false);
   }
  }
  await db.exec("insert into whatsapp_contacts(phone_e164) values('+570000000002');");
  await assert.rejects(()=>db.exec(reset),/respaldo.*ya existe/);await db.exec('rollback;');
  assert.equal((await db.query('select count(*)::int n from whatsapp_contacts')).rows[0].n,1);
  console.log('PASS: 31 tables reset; exact private backup; users, permissions, branches, files, numbering and old archive preserved; unknown schema/dependencies, in-flight work, post-truncate failure and replay guarded.');
 }finally{await db.close();}
}
