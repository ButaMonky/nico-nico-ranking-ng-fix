import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
const source=await readAutoFillSource(),a=source.indexOf('      var maybeFetchMore ='),b=source.indexOf('      // -------------------- Developer diagnostics',a);
function harness(action){
 const events={fetch:0,evaluate:0,scheduled:0,phase:''};let visible=1;
 const c={page:{_disposed:false,_currentPageNumber:1},runLifetime:new AbortController(),AbortController,
  initialized:true,fetching:false,gaveUp:false,completionReported:false,refillController:null,
  model:{config:{autoFillEnabled:{value:true},autoFillMaxExtraPages:{value:0}}},
  candidatePool:[],candidatePoolSeen:new Set(),lastFetchedHadNext:true,fetchedExtraPages:0,noProgressStreak:0,useSnapshot:false,LOG:'fixture',
  performance,console:new Proxy({}, {get:()=>()=>{}}),rebalanceOverflow(){},updateStatus(){},updatePagerUi(){},logSnapshot(){},
  visibleTotalCount:()=>visible,targetCount:()=>2,hasEarlierCandidate:()=>false,chooseDetailBatchSize:()=>1,
  setPhase:p=>{events.phase=p;},setTimeout:()=>events.scheduled++,
  fetchMoreCandidates:async(_n,signal)=>{events.fetch++;c.candidatePool.push({id:'sm2'});await action?.(c,()=>{visible=2;},signal);return 0;},
  evaluateCandidateBatch:async()=>{events.evaluate++;throw Error('unexpected batch after demand ended');}};
 const context=vm.createContext(c),run=vm.runInContext(source.slice(a,b)+';maybeFetchMore',context);
 return {c:context,events,run};
}
test('early stop: target reached during page fetch leaves candidates unconsumed and creates no cards',async()=>{
 const h=harness(async(_c,reach)=>reach());await h.run();
 assert.equal(h.events.evaluate,0);assert.equal(h.c.candidatePool.length,1);assert.equal(h.events.phase,'completed');assert.equal(h.c.gaveUp,false);
});
test('early stop: disabling AutoFill during fetch preserves candidates and does not start details',async()=>{
 const h=harness(async c=>{c.model.config.autoFillEnabled.value=false;});await h.run();
 assert.equal(h.events.evaluate,0);assert.equal(h.c.candidatePool.length,1);assert.equal(h.events.phase,'disabled');assert.equal(h.c.gaveUp,false);
});
test('early stop: refill cancellation is normal completion, not an API failure or source fallback',async()=>{
 const h=harness(async(c,reach,signal)=>{
  reach();assert.ok(signal,'the refill has its own signal');c.refillController.abort();
  throw Object.assign(Error('cancelled'),{name:'AbortError'});
 });await h.run();assert.equal(h.c.gaveUp,false);assert.equal(h.events.evaluate,0);assert.equal(h.c.refillController,null);
 assert.equal(h.events.phase,'completed');
});
test('early stop: route cancellation settles the refill without reporting an error or discarding the pool',async()=>{
 const h=harness(async(c,_reach,signal)=>{
  assert.ok(signal);c.page._disposed=true;c.runLifetime.abort();assert.equal(signal.aborted,true);
  throw Object.assign(Error('cancelled'),{name:'AbortError'});
 });await h.run();assert.equal(h.c.gaveUp,false);assert.equal(h.events.evaluate,0);assert.equal(h.c.candidatePool.length,1);
});

// BRUSH-027b: rejecting newly scanned videos is meaningful source progress.
test('refill progress: unique NG-only windows do not trigger the empty-pool stop',async()=>{
 const h=harness(async c=>{c.candidatePool.length=0;c.candidatePoolSeen.add('sm'+(c.candidatePoolSeen.size+1));});
 h.c.noProgressStreak=4;
 for(let i=0;i<7;i++){await h.run();assert.equal(h.c.gaveUp,false);assert.equal(h.c.noProgressStreak,0);}
 assert.equal(h.events.fetch,7);assert.equal(h.events.evaluate,0);assert.equal(h.c.lastFetchedHadNext,true);
});
test('refill progress: duplicate-only windows still stop at the explicit no-progress budget',async()=>{
 const h=harness(async c=>{c.candidatePool.length=0;});h.c.noProgressStreak=4;await h.run();
 assert.equal(h.c.noProgressStreak,5);assert.equal(h.c.gaveUp,true);assert.equal(h.events.phase,'stopped');
 assert.equal(h.c.lastFetchedHadNext,true,'client budget must not claim the source has ended');
});
