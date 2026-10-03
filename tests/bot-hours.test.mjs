import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceWindow,closedNotice,recoverServiceWaits} from '../src/bot-hours.js';
test('Colombia service and delivery cutoffs include opening, exclude closing, and survive month changes',()=>{
 for(const [utc,attention,delivery,next] of [
 ['2026-10-02T13:59:59Z',false,false,'2026-10-02T14:00:00.000Z'],
 ['2026-10-02T14:00:00Z',true,true,'2026-10-03T14:00:00.000Z'],
 ['2026-10-02T23:59:59Z',true,true,'2026-10-03T14:00:00.000Z'],
 ['2026-10-03T00:00:00Z',true,false,'2026-10-03T14:00:00.000Z'],
 ['2026-10-03T00:59:59Z',true,false,'2026-10-03T14:00:00.000Z'],
 ['2026-10-03T01:00:00Z',false,false,'2026-10-03T14:00:00.000Z'],
 ['2026-11-01T04:00:00Z',false,false,'2026-11-01T14:00:00.000Z'],
 ['2026-11-01T10:00:00Z',false,false,'2026-11-01T14:00:00.000Z']])assert.deepEqual(serviceWindow(utc),{attention_open:attention,delivery_open:delivery,next_opening:next});
 assert.match(closedNotice('2026-10-03T10:00:00Z'),/Hoy/);assert.match(closedNotice('2026-10-03T02:00:00Z'),/Mañana/);
});
test('recovery sends only the queued reminder and confirms it through the database',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-02T14:00:00Z')});
 const calls=[],env={BOT_SERVICE_HOURS_ENABLED:'true'};
 const deps={rpc:async(name)=>{calls.push(name);if(name==='prepare_next_bot_service_reminder')return {wait_id:'w',message_id:'m'};},deliver:async(id)=>calls.push(id)};
 assert.equal(await recoverServiceWaits(env,deps),true);assert.deepEqual(calls,['prepare_next_bot_service_reminder','m','finish_bot_service_reminder']);
 t.mock.timers.setTime(Date.parse('2026-10-03T01:00:00Z'));calls.length=0;assert.equal(await recoverServiceWaits(env,deps),false);assert.deepEqual(calls,[]);
});
