import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

test('profile lookup chooses the assigned branch when chat adds another relationship',async()=>{
 const directory=path.resolve('node_modules/.cache/elrey-tests');await mkdir(directory,{recursive:true});
 const filename=path.join(directory,`profile-${crypto.randomUUID()}.mjs`);
 const output=await build({entryPoints:['src/lib/api.js'],bundle:true,platform:'node',format:'esm',packages:'external',write:false,define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://auth-test.example.invalid',VITE_SUPABASE_ANON_KEY:'test-key'})}});
 await writeFile(filename,output.outputFiles[0].text);
 const original=globalThis.fetch;let requestSignal;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);assert.equal(u.pathname,'/rest/v1/profiles');
  requestSignal=options.signal;
  // PostgREST rejects the implicit relation after the chat read-marker bridge exists.
  if(u.searchParams.get('select')!=='*,branch:branches!profiles_branch_id_fkey(id,name)')return Response.json({code:'PGRST201',message:'More than one relationship between profiles and branches'},{status:300});
  const id=u.searchParams.get('id').slice(3);
  return Response.json({id,role:id==='admin'?'admin':'cashier',active:true,branch_id:id==='admin'?null:'b1',branch:id==='admin'?null:{id:'b1',name:'Robledo Aures'}});
 };
 try{
  const {getProfile}=await import(pathToFileURL(filename).href);
  const admin=await getProfile('admin');assert.equal(admin.role,'admin');assert.equal(admin.branch,null);
  const controller=new AbortController();const cashier=await getProfile('cashier',controller.signal);assert.equal(cashier.branch.name,'Robledo Aures');assert.equal(cashier.branch_id,'b1');assert.equal(requestSignal,controller.signal);
 }finally{globalThis.fetch=original;await unlink(filename);}
});
