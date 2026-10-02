import test from 'node:test';import assert from 'node:assert/strict';import worker from '../src/worker.js';
test('old legal links remain available through permanent public redirects without auth',async()=>{
 for(const path of ['/privacidad','/privacidad/','/eliminacion-de-datos','/eliminacion-de-datos/'])for(const method of ['GET','HEAD']){
  const r=await worker.fetch(new Request('https://intranet.almaceneselrey.co'+path,{method}),{},{});
  assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://almaceneselrey.co'+path.replace(/\/$/,''));
 }
});
