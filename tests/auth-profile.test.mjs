import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAuthProfile} from '../src/lib/auth-profile.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const user={id:'test-admin'};
const profile={id:user.id,role:'admin',active:true};
function fixture(loadProfile,options={}){
 let callback,insideAuth=false,unsubscribed=false;
 const states=[];
 const auth={
  onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};},
  getSession:()=>Promise.resolve({data:{session:null}})
 };
 const observer=observeAuthProfile({auth,loadProfile:(...args)=>loadProfile({insideAuth},...args),onState:state=>states.push(state),...options});
 return {observer,states,get unsubscribed(){return unsubscribed;},emit(session,event='SIGNED_IN'){insideAuth=true;try{return callback(event,session);}finally{insideAuth=false;}}};
}
test('auth callback returns immediately and profile lookup runs after auth releases control',async()=>{
 const f=fixture(async({insideAuth})=>{assert.equal(insideAuth,false);return profile;});
 assert.equal(f.emit({user}),undefined);
 await pause(15);
 assert.equal(f.states.at(-1).profile,profile);
 f.observer.stop();assert.equal(f.unsubscribed,true);
});
test('profile failure is visible and can retry without another password request',async()=>{
 let fail=true;
 const f=fixture(async()=>{if(fail)throw new Error('Conexión interrumpida');return profile;});
 f.emit({user});await pause(15);
 assert.match(f.states.at(-1).error,/Conexión interrumpida/);assert.equal(f.states.at(-1).loading,false);
 fail=false;f.observer.retry();await pause(15);assert.equal(f.states.at(-1).profile,profile);assert.equal(f.states.at(-1).error,'');f.observer.stop();
});
test('stalled lookup stops the spinner and aborts its network request',async()=>{
 let signal;
 const f=fixture((_context,_id,s)=>{signal=s;return new Promise(()=>{});},{timeoutMs:10});
 f.emit({user});await pause(30);assert.equal(signal.aborted,true);assert.equal(f.states.at(-1).loading,false);assert.match(f.states.at(-1).error,/tardó demasiado/);f.observer.stop();
});
test('logout cancels profile lookup and a late result cannot restore the account',async()=>{
 let resolve,signal;
 const f=fixture((_context,_id,s)=>{signal=s;return new Promise(r=>{resolve=r;});});
 f.emit({user});await pause(5);f.emit(null,'SIGNED_OUT');assert.equal(signal.aborted,true);resolve(profile);await pause(5);assert.equal(f.states.at(-1).user,null);assert.equal(f.states.at(-1).profile,null);f.observer.stop();
});
test('inactive users cannot open the operation',async()=>{
 const f=fixture(async()=>({...profile,active:false}));f.emit({user});await pause(15);assert.equal(f.states.at(-1).profile,null);assert.match(f.states.at(-1).error,/no está activo/);f.observer.stop();
});
test('session restoration errors are surfaced and no work continues after unmount',async()=>{
 const states=[];let callback;let stopped=false;
 const observer=observeAuthProfile({auth:{onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){stopped=true;}}}};},getSession:()=>Promise.reject(new Error('offline'))},loadProfile:()=>assert.fail('must not run'),onState:s=>states.push(s)});
 await pause(5);assert.match(states.at(-1).error,/recuperar tu sesión/);observer.stop();callback('SIGNED_IN',{user});await pause(5);assert.equal(states.length,1);assert.equal(stopped,true);
});
