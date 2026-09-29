import test from 'node:test';import assert from 'node:assert/strict';
import {branchSelection,branchMenu,orderedBranches,stockClosingTime} from '../src/bot-branches.js';
const branches=[{id:'b10',name:'San Antonio de Prado'},{id:'b1',name:'Robledo Aures'},{id:'b2',name:'Robledo Diamante - Calle 80'},{id:'b5',name:'Robledo Diamante - Diagonal 85'},{id:'b6',name:'Floresta'},{id:'b7',name:'La 80'}];
test('branch menus hide database identifiers and sort naturally',()=>{const menu=branchMenu(orderedBranches(branches));assert.doesNotMatch(menu,/\bb\d|código/);assert.match(menu,/1\. Robledo Aures/);assert.ok(menu.indexOf('Floresta')<menu.indexOf('San Antonio'));});
test('natural names, web slugs, ambiguity and delivered list positions',()=>{
 for(const [v,id] of [['Aures','b1'],['quiero la sede de floresta','b6'],['[SEDE:san-antonio-prado]','b10'],['la 80','b7'],['Robledo Diamante - Calle 80','b2']])assert.equal(branchSelection(v,branches).selected?.id,id,v);
 assert.equal(branchSelection('Robledo',branches).selected,undefined);assert.equal(branchSelection('Robledo',branches).choices.length,3);
 assert.equal(branchSelection('2',branches,['b6','b1']).selected.id,'b1');assert.equal(branchSelection('2',branches).selected,undefined);
 assert.equal(branchSelection('[SEDE:general]',branches).selected,undefined);
});
test('stock expires at 20:00 Colombia on its count day, never a rolling day',()=>{
 assert.equal(stockClosingTime('2026-09-29T14:00:00Z'),Date.parse('2026-09-30T01:00:00Z'));
 assert.equal(stockClosingTime('2026-09-30T00:59:00Z'),Date.parse('2026-09-30T01:00:00Z'));assert.equal(stockClosingTime(null),0);
});
