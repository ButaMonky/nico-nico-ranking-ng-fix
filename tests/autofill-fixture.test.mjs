import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario,scenarioNames} from '../scripts/lib/autofill-fixture.mjs';
test('AutoFill benchmark fixtures have deterministic disjoint pages and explicit zero values',()=>{
 for(const name of scenarioNames){
  const a=makeScenario(name),b=makeScenario(name);assert.deepEqual(a.items,b.items);
  assert.equal(a.items.length,128);assert.equal(new Set(a.items.map(x=>x.id)).size,128);
  assert.equal(a.initial.length,8);assert.equal(a.target,12);
  const paged=Array.from({length:a.lastPage-1},(_,i)=>a.page(i+2)).flat();
  assert.deepEqual([...a.initial,...paged].map(x=>x.id),a.items.map(x=>x.id));
  assert.equal(a.items[0].count.like,0);assert.equal(a.page(a.lastPage+1).length,0);
 }
});
test('AutoFill benchmark expected order is independent of production decisions',()=>{
 const a=makeScenario('title90');assert.deepEqual(a.expectedIds,Array.from({length:12},(_,i)=>'sm'+((i+1)*10)));
 const b=makeScenario('none');assert.deepEqual(b.expectedIds,Array.from({length:12},(_,i)=>'sm'+(i+1)));
 assert.deepEqual(makeScenario('numeric90').expectedIds,Array.from({length:12},(_,i)=>'sm'+(i+116)));
 assert.equal(makeScenario('compound').expectedIds[0],'sm3');
});
test('AutoFill benchmark distinguishes tag/lock data and rejects unsupported scenarios',()=>{
 assert.throws(()=>makeScenario('untrusted'),/scenario/i);
 const a=makeScenario('tag'),b=makeScenario('lock');assert.match(a.xml('sm3'),/tag-block/);assert.match(b.xml('sm3'),/lock="1"/);
 assert.match(a.html(2),/server-response/);assert.match(a.html(2),/last page/);
 assert.throws(()=>a.xml('sm999'),/fixture/i);
});
