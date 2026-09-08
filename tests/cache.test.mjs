import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
const key='NicoNicoRankingNG:detailCache:v2';
const config=(ttl=1,max=100)=>({sessionDetailCacheTtlMinutes:{value:ttl},sessionDetailCacheMaxEntries:{value:max}});
async function harness(path,raw=null,failWrite=false){
 const source=await readFile(path,'utf8'),start='    var getNnrSessionDetailCache = function(config) {',end='    var setupAutoFill = function(model, page, controller) {';
 assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
 let now=1000000;const warnings=[],writes=[];
 const storage={getItem:k=>{assert.equal(k,key);return raw;},setItem:(k,v)=>{assert.equal(k,key);if(failWrite)throw Error('quota');raw=v;writes.push(v);}};
 const timers=new Map(),events={};let seq=0;
 const context={window:{addEventListener:(name,f)=>events[name]=f},setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id),Date:{now:()=>now},sessionStorage:storage,console:{warn:(...a)=>warnings.push(a)}};
 const factory=vm.runInNewContext(source.slice(source.indexOf(start),source.indexOf(end))+';getNnrSessionDetailCache',context,{timeout:1000});
 return {factory,warnings,writes,events,timers,raw:()=>raw,now:()=>now,advance:ms=>now+=ms};
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: cache persistence, singleton reconfiguration and reload`,async()=>{
  const h=await harness(path),c=h.factory(config());c.set(42,{cachedAt:h.now(),title:'test'});
  assert.equal(c.get('42').title,'test');c.flush?.();assert.equal(JSON.parse(h.raw()).schema,2);
  assert.equal(h.factory(config(2,200)),c);assert.equal(c.diagnostics().ttlMinutes,2);
  const fresh=await harness(path,h.raw()),restored=fresh.factory(config());
  assert.equal(restored.get(42).title,'test');assert.equal(restored.diagnostics().stats.loads,1);
  assert.equal(restored.delete(42),true);assert.equal(restored.delete(42),false);
  restored.set('a',{cachedAt:fresh.now()});restored.clear();assert.equal(restored.size,0);
  assert.deepEqual(JSON.parse(fresh.raw()).entries,[]);
 });
 test(`${label}: TTL boundary and oldest-entry eviction`,async()=>{
  const h=await harness(path),c=h.factory(config());c.set('a',{cachedAt:h.now()});
  h.advance(60000);assert.equal(c.has('a'),true);h.advance(1);assert.equal(c.has('a'),false);
  assert.equal(c.diagnostics().stats.expired,1);c.flush?.();assert.deepEqual(JSON.parse(h.raw()).entries,[]);
  for(let i=0;i<101;i++){h.advance(1);c.set(String(i),{cachedAt:h.now()});}
  assert.equal(c.size,100);assert.equal(c.has('0'),false);assert.equal(c.has('100'),true);
  assert.equal(c.diagnostics().stats.evicted,1);
 });
 test(`${label}: corrupt data, unsupported schema and failed writes remain usable`,async()=>{
  const broken=await harness(path,'{');assert.equal(broken.factory(config()).diagnostics().stats.parseErrors,1);assert.equal(broken.warnings.length,1);
  const wrong=await harness(path,JSON.stringify({schema:1,entries:[['a',{cachedAt:1000000}]]}));assert.equal(wrong.factory(config()).size,0);
  const h=await harness(path,null,true),c=h.factory(config());assert.doesNotThrow(()=>c.set('a',{cachedAt:h.now()}));
  c.flush?.();assert.equal(c.has('a'),true);assert.equal(c.diagnostics().stats.saves,0);assert.equal(h.warnings.length,1);
  c.configure(config(-1,1));assert.equal(c.diagnostics().ttlMinutes,1);assert.equal(c.diagnostics().maxEntries,100);
  c.configure(config(9999,9999));assert.equal(c.diagnostics().ttlMinutes,1440);assert.equal(c.diagnostics().maxEntries,4000);
 });
}
test('generated: cache batches writes and flushes on pagehide without losing in-memory data',async()=>{
 const h=await harness(output),c=h.factory(config());
 for(let i=0;i<50;i++)c.set(i,{cachedAt:h.now()});
 assert.equal(c.size,50);assert.equal(h.writes.length,0);assert.equal(h.timers.size,1);
 h.events.pagehide();assert.equal(h.writes.length,1);assert.equal(h.timers.size,0);
 assert.equal(JSON.parse(h.raw()).entries.length,50);
});
