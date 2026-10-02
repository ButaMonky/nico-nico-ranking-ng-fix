import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
const source=await readAutoFillSource();
const pending=Symbol('still pending');
const settled=p=>Promise.race([p,Promise.resolve().then(()=>Promise.resolve()).then(()=>pending)]);
function environment(){
 const jobs=new Map(),frames=new Map(),handlers=new Set(),requests=[],handles=new Set(),outcomes=[];
 let serial=0,aborts=0;
 const movie={metadataSettled:false,on:(name,fn)=>handlers.add(fn),off:(name,fn)=>handlers.delete(fn)};
 const ctx={runLifetime:new AbortController(),AbortController,Promise,LOG:'fixture',Date,
  console:{warn(){}},model:{config:{useGetThumbInfo:{value:true}},movies:{get:()=>movie},diagnostics:{begin:()=>outcome=>outcomes.push(outcome)}},
  page:{_disposed:false,doc:{querySelectorAll:()=>[]}},currentOriginalRootCandidates:()=>[],handles,
  setTimeout:fn=>{const id=++serial;jobs.set(id,fn);return id;},clearTimeout:id=>jobs.delete(id),
  requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  GM_xmlhttpRequest:options=>{requests.push(options);return {abort(){aborts++;}}}};
 return {ctx,jobs,frames,handlers,requests,handles,outcomes,movie,get aborts(){return aborts;}};
}
function load(name,next,h){
 const a=source.indexOf('      var '+name+' ='),b=source.indexOf(next,a);
 assert.ok(a>=0&&b>a,name+' production entry point');
 return vm.runInNewContext(source.slice(a,b)+';'+name,h.ctx);
}
const thumb=h=>load('waitForThumbInfo','      // -------------------- duplicate protection',h);
const initial=h=>load('waitForInitialRoots','      var waitForThumbInfo =',h);
const request=h=>load('gmRequest','      var elapsedText =',h);
test('AutoFill cancellation: metadata waits settle false and release model listeners/timers',async()=>{
 const h=environment(),p=thumb(h)(['sm1'],30000);assert.equal(h.handlers.size,1);
 h.ctx.runLifetime.abort();assert.equal(await settled(p),false);assert.equal(h.handlers.size,0);assert.equal(h.jobs.size,0);
});
test('AutoFill cancellation: a pre-aborted metadata wait creates no resources',async()=>{
 const h=environment();h.ctx.runLifetime.abort();assert.equal(await settled(thumb(h)(['sm1'],30000)),false);
 assert.equal(h.handlers.size,0);assert.equal(h.jobs.size,0);
});
test('AutoFill cancellation: initial DOM wait settles without inventing cards after disposal',async()=>{
 const h=environment(),p=initial(h)(15000);assert.equal(h.jobs.size,1);h.ctx.runLifetime.abort();
 const result=await settled(p);assert.notEqual(result,pending);assert.deepEqual([...result],[]);assert.equal(h.jobs.size,0);
});
test('AutoFill cancellation: finished metadata wait ignores a later route abort',async()=>{
 const h=environment();h.movie.metadataSettled=true;const p=thumb(h)(['sm1'],30000);
 assert.equal(await p,true);h.ctx.runLifetime.abort();assert.equal(await p,true);assert.equal(h.jobs.size,0);
});
test('AutoFill cancellation: GM cancellation settles even when transport abort never calls back',async()=>{
 const h=environment(),p=request(h)({url:'https://example.invalid/data',_nrnKind:'detail'}).catch(e=>e.name);
 h.ctx.runLifetime.abort();assert.equal(await settled(p),'AbortError');assert.equal(h.aborts,1);assert.equal(h.handles.size,0);
 h.requests[0].onload({status:200});assert.deepEqual(h.outcomes,['aborted']);
});
test('AutoFill cancellation: pre-aborted caller makes zero transport requests',async()=>{
 const h=environment(),c=new AbortController();c.abort();
 const p=request(h)({url:'https://example.invalid/data',signal:c.signal}).catch(e=>e.name);
 assert.equal(await settled(p),'AbortError');assert.equal(h.requests.length,0);
});
test('AutoFill cancellation: external signals/private diagnostics options never reach GM transport',async()=>{
 const h=environment(),c=new AbortController(),p=request(h)({url:'https://example.invalid/data',signal:c.signal,_nrnKind:'detail',_nrnLane:'run'});
 assert.equal(h.requests[0].signal,undefined);assert.equal(h.requests[0]._nrnKind,undefined);
 h.requests[0].onload({status:200});assert.equal((await p).status,200);c.abort();assert.equal(h.aborts,0);assert.deepEqual(h.outcomes,['ok']);
});
test('AutoFill cancellation: paint waits release frame callbacks on abort and normally require two frames',async()=>{
 for(const abort of [true,false]){
  const h=environment(),paint=load('waitForPaint','      var waitForInitialRoots =',h),p=paint();
  if(abort)h.ctx.runLifetime.abort();else while(h.frames.size){const [id,fn]=h.frames.entries().next().value;h.frames.delete(id);fn();}
  assert.equal(await settled(p),!abort);assert.equal(h.frames.size,0);
 }
});
