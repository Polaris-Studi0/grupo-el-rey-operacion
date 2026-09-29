import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=new URL('../supabase/migrations/',import.meta.url);
const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
const reset=await readFile(new URL('../scripts/reset-operational-data-20260929.sql',import.meta.url),'utf8');
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
  for(const f of files){if(!withV2&&f.startsWith('20260920'))continue;await db.exec((await readFile(new URL(f,dir),'utf8')).replace(/create extension if not exists pgcrypto;/,''));}
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
   create table unknown_dependency(id int,conversation_id uuid references whatsapp_conversations(id));
  `);
  await assert.rejects(()=>db.exec(reset),/Dependencia no incluida/);await db.exec('rollback;');
  assert.equal((await db.query("select count(*)::int n from whatsapp_messages")).rows[0].n,1);
  assert.equal((await db.query("select to_regnamespace('elrey_reset_20260929') n")).rows[0].n,null);
  await db.exec('drop table unknown_dependency;');
  await db.exec(reset);
  const rows=(await db.query('select * from elrey_reset_20260929.manifest')).rows;
  assert.ok(rows.filter(r=>r.disposition==='reset'&&r.table_name!=='inventory_movements').every(r=>Number(r.rows_after)===0));
  assert.equal((await db.query('select count(*)::int n from elrey_reset_20260929.whatsapp_messages')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from inventory_movements')).rows[0].n,1);
  assert.deepEqual((await db.query('select available_qty,reserved_qty,price from branch_inventory')).rows[0],{available_qty:10,reserved_qty:0,price:1000});
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
  assert.equal((await db.query("select has_schema_privilege('authenticated','elrey_reset_20260929','usage') p")).rows[0].p,false);
  assert.equal((await db.query("select has_table_privilege('service_role','elrey_reset_20260929.whatsapp_messages','select') p")).rows[0].p,false);
  await assert.rejects(()=>db.exec(reset),/respaldo.*ya existe/);await db.exec('rollback;');
  console.log(`PASS atomic reset, verified private backup, rollback on unknown dependency, preservation and replay guard (${withV2?'with v2':'without v2'})`);
 }finally{await db.close();}
}
