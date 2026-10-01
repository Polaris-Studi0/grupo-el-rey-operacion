import test from 'node:test';import assert from 'node:assert/strict';
import {whatsappIdentity,whatsappContactMatches} from '../src/whatsapp-identity.js';
import {splitPublicWebhook} from '../src/worker.js';
test('private identity batch keeps the matching contact and never matches missing phone fields',()=>{
 const messages=[{from_user_id:'CO.TEST123456'},{from_parent_user_id:'CO.ENT.TEST654321'}];
 const contacts=[{user_id:'CO.TEST123456'},{parent_user_id:'CO.ENT.TEST654321'},{profile:{name:'Unrelated'}}];
 const parts=splitPublicWebhook({entry:[{changes:[{value:{messages,contacts}}]}]});
 assert.deepEqual(parts.map(p=>p.entry[0].changes[0].value.contacts),[[contacts[0]],[contacts[1]]]);
 assert.equal(whatsappContactMatches(contacts[2],messages[0]),false);
 assert.deepEqual(whatsappIdentity({from:'',from_user_id:'CO.TEST123456'}),{phone:null,id:'CO.TEST123456'});
 assert.deepEqual(whatsappIdentity({from:'573000000001',from_user_id:'CO.TEST123456'}),{phone:'573000000001',id:'CO.TEST123456'});
});
