import test from 'node:test';
import {readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const network=await readFile(new URL('../src/data/network.js',import.meta.url),'utf8');
const auto=await readAutoFillSource();
const adapter=await readFile(new URL('../src/data/search-item-adapter.js',import.meta.url),'utf8');
const quiet=new Proxy({}, {get:()=>()=>{}});
function loadNetwork(extra={}){return vm.runInNewContext(network+';Network',{AbortController,setTimeout,clearTimeout,...extra});}
test('network diagnostics record actual fetch outcomes including body timeout and caller cancellation',async()=>{
 const events=[];const diagnostics={kind:'page',lane:'diagnostic',run:{begin:(...args)=>{events.push(args);return result=>events.push(result);}}};
 let mode='ok';const n=loadNetwork({fetch:async(_url,{signal})=>{
  if(mode==='network')throw Error('PRIVATE_URL');
  return {ok:mode==='ok',status:mode==='ok'?200:503,text:()=>mode==='held'?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))):Promise.resolve('body')};
 }});
 await n.fetchResponse('PRIVATE',{},100,diagnostics);assert.equal(events.at(-1),'ok');
 mode='http';await n.fetchResponse('PRIVATE',{},100,diagnostics);assert.equal(events.at(-1),'http');
 mode='network';await assert.rejects(n.fetchResponse('PRIVATE',{},100,diagnostics));assert.equal(events.at(-1),'network');
 mode='held';await assert.rejects(n.fetchResponse('PRIVATE',{},5,diagnostics));assert.equal(events.at(-1),'timeout');
 const controller=new AbortController();const pending=n.fetchResponse('PRIVATE',{signal:controller.signal},100,diagnostics);
 await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending);assert.equal(events.at(-1),'aborted');
 assert.equal(events.filter(Array.isArray).length,5);assert.doesNotMatch(JSON.stringify(events),/PRIVATE/);
});

test('queued ad decoration never starts after SPA disposal and next route has its own request key',async()=>{
 const list=await readFile(new URL('../src/nico/list-page.js',import.meta.url),'utf8');
 const begin=list.indexOf('      async _applyAdDecoration('),end=list.indexOf('      unbindUnconnectedMovieRoots',begin);
 const calls=[],counts={old:0,next:0};
 const n=loadNetwork({fetch:(_url,{signal})=>new Promise((resolve,reject)=>{
  calls.push(()=>resolve({ok:true,status:200,text:async()=>'{"data":{"decoration":"none"}}'}));
  signal.addEventListener('abort',()=>reject(Error('aborted')));
 })});
 const apply=vm.runInNewContext('({'+list.slice(begin,end)+'})._applyAdDecoration',{Network:n});
 const make=key=>({_abortController:new AbortController(),_diagnostics:{queueKey:key,begin:()=>{counts[key]++;return ()=>{};}}});
 const old=make('old'),next=make('next'),root=()=>({dataset:{}});
 const pending=Array.from({length:8},(_,i)=>apply.call(old,root(),'sm'+i));
 await new Promise(r=>setImmediate(r));assert.equal(calls.length,4);
 old._disposed=true;old._abortController.abort();
 const newest=apply.call(next,root(),'sm7');await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,5,'queued old-route requests are discarded; new route gets one fresh request');
 calls[4]();await Promise.all([...pending,newest]);assert.deepEqual(counts,{old:4,next:1});
});
test('network: shared requests respect global cap and errors release queue slots',async()=>{
 const queue=loadNetwork().createQueue(2),releases=[];let active=0,peak=0,count=0;
 const work=()=>new Promise((resolve,reject)=>{count++;active++;peak=Math.max(peak,active);releases.push(fail=>{active--;fail?reject(Error('test')):resolve(count);});});
 const a=queue('a',work),duplicate=queue('a',work),b=queue('b',work),c=queue('c',work);
 assert.equal(a,duplicate);const done=Promise.allSettled([a,b,c]);
 await new Promise(r=>setImmediate(r));assert.equal(count,2);
 releases[0](true);await new Promise(r=>setImmediate(r));assert.equal(count,3);assert.equal(peak,2);
 releases[1]();releases[2]();await done;
 assert.equal(await queue('a',()=>42),42);
});
test('network: response timeout includes body download',async()=>{
 let aborted=false;
 const n=loadNetwork({fetch:async(_url,{signal})=>({text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));}))})});
 await assert.rejects(n.fetchResponse('test',{},5),/aborted/);assert.equal(aborted,true);
});
function createSelfAdHarness(){
 let now=1000;
 const DateShim={now:()=>now};
 const ctx=vm.createContext({AbortController,Date:DateShim});
 const sharedStart=auto.indexOf('    var SelfAdSessionCache = (function() {');
 const setupStart=auto.indexOf('    var setupAutoFill = function(',sharedStart);
 const innerStart=auto.indexOf('      var selfAdFailureCooldown = new Map()',setupStart);
 const innerEnd=auto.indexOf('      var findDomRootsForMovieId',innerStart);
 assert.ok(sharedStart>=0&&setupStart>sharedStart&&innerStart>setupStart&&innerEnd>innerStart,'self-ad source boundaries must be present');
 vm.runInContext(auto.slice(sharedStart,setupStart),ctx);
 const networkApi=loadNetwork();
 const makeRoute=(scope,gmRequest)=>{
  Object.assign(ctx,{
   runLifetime:new AbortController(),page:{_disposed:false},requestScope:scope,Network:networkApi,
   model:{diagnostics:{validationFailure(){}}},AdvancedNgRules:{},gmRequest
  });
  const body=auto.slice(innerStart,innerEnd);
  return vm.runInContext(
   '(function(runLifetime,page,requestScope,Network,Date,model,AdvancedNgRules,gmRequest){'+body+
   ';return {fetchSelfAdResult,fetchSelfAdResultUnshared,selfAdFailureCooldown};})'+
   '(runLifetime,page,requestScope,Network,Date,model,AdvancedNgRules,gmRequest)',ctx);
 };
 return {
  makeRoute,
  advance(ms){now+=ms;},
  setNow(value){now=value;},
  sessionCache:ctx.SelfAdSessionCache
 };
}
const selfAdMovie=(id,userId=42,name='user')=>({id,contributor:{type:'user',id:userId,name}});

test('ads: parallel callers share one request; successful sponsors are reused across SPA routes and matches are recomputed',async()=>{
 const h=createSelfAdHarness();let calls=0;
 const route1=h.makeRoute('route-1',async()=>{calls++;return {status:200,responseText:JSON.stringify({data:{sponsors:[{userId:99,advertiserName:'Renamed'}]}})};});
 const movie=selfAdMovie('sm1',42,'user');
 const results=await Promise.all([route1.fetchSelfAdResult(movie),route1.fetchSelfAdResult(movie)]);
 assert.equal(calls,1);assert.equal(results[0].checked,true);assert.equal(results[0].idMatch,false);
 const route2=h.makeRoute('route-2',async()=>{calls++;throw Error('session cache miss');});
 const reused=await route2.fetchSelfAdResult(selfAdMovie('sm1',99,'Renamed'));
 assert.equal(calls,1,'a new SPA route reuses successful sponsor data without another request');
 assert.equal(reused.source,'session-cache');assert.equal(reused.idMatch,true);assert.equal(reused.nameMatch,true);
});

test('ads: 404 is a successful known-empty result and is reused across SPA routes',async()=>{
 const h=createSelfAdHarness();let calls=0;
 const first=h.makeRoute('route-empty-1',async()=>{calls++;return {status:404,responseText:''};});
 const a=await first.fetchSelfAdResult(selfAdMovie('sm404'));
 assert.equal(a.checked,true);assert.equal(a.sponsors.length,0);
 const second=h.makeRoute('route-empty-2',async()=>{calls++;throw Error('known-empty should be cached');});
 const b=await second.fetchSelfAdResult(selfAdMovie('sm404'));
 assert.equal(calls,1);assert.equal(b.checked,true);assert.equal(b.source,'session-cache');assert.equal(b.sponsors.length,0);
});

test('ads: transient failures stay route-local for 30 seconds and never poison the cross-route success cache',async()=>{
 const h=createSelfAdHarness();let calls=0;
 const bad=h.makeRoute('route-fail-1',async()=>{calls++;return {status:200,responseText:JSON.stringify({unexpected:true})};});
 const movie=selfAdMovie('sm-fail');
 const first=await bad.fetchSelfAdResult(movie);
 assert.equal(first.checked,false);assert.equal(first.source,'network-failure');assert.equal(calls,1);
 const cooldown=await bad.fetchSelfAdResult(movie);
 assert.equal(cooldown.checked,false);assert.equal(cooldown.source,'failure-cooldown');assert.equal(calls,1);
 const freshRoute=h.makeRoute('route-fail-2',async()=>{calls++;return {status:200,responseText:JSON.stringify({data:{sponsors:[{userId:42,advertiserName:'user'}]}})};});
 const recovered=await freshRoute.fetchSelfAdResult(movie);
 assert.equal(calls,2,'a different SPA route retries immediately because failures are not session-cached');
 assert.equal(recovered.checked,true);assert.equal(recovered.idMatch,true);
});

test('ads: session success cache expires at five minutes and remains bounded',async()=>{
 const h=createSelfAdHarness();let calls=0;
 const response=()=>({status:200,responseText:JSON.stringify({data:{sponsors:[]}})});
 const first=h.makeRoute('ttl-1',async()=>{calls++;return response();});
 await first.fetchSelfAdResult(selfAdMovie('sm-ttl'));assert.equal(calls,1);
 h.advance(299999);
 const second=h.makeRoute('ttl-2',async()=>{calls++;return response();});
 assert.equal((await second.fetchSelfAdResult(selfAdMovie('sm-ttl'))).source,'session-cache');assert.equal(calls,1);
 h.advance(1);
 const third=h.makeRoute('ttl-3',async()=>{calls++;return response();});
 assert.equal((await third.fetchSelfAdResult(selfAdMovie('sm-ttl'))).source,'network');assert.equal(calls,2,'cache expires exactly at five minutes');
 h.sessionCache.clear();
 for(let i=0;i<1001;i++)h.sessionCache.put('sm-bound-'+i,[]);
 assert.equal(h.sessionCache.diagnostics().size,1000);assert.equal(h.sessionCache.get('sm-bound-0'),null);assert.equal(h.sessionCache.get('sm-bound-1000').length,0);
});

test('ads: a 100-sponsor incomplete response is never promoted into the cross-route success cache',async()=>{
 const h=createSelfAdHarness();let calls=0;
 const full=Array.from({length:100},(_,i)=>({userId:i+1,advertiserName:'u'+i}));
 const first=h.makeRoute('full-1',async()=>{calls++;return {status:200,responseText:JSON.stringify({data:{sponsors:full}})};});
 const incomplete=await first.fetchSelfAdResult(selfAdMovie('sm-full'));
 assert.equal(incomplete.checked,false);assert.equal(calls,1);
 const second=h.makeRoute('full-2',async()=>{calls++;return {status:200,responseText:JSON.stringify({data:{sponsors:[{userId:42,advertiserName:'user'}]}})};});
 const retry=await second.fetchSelfAdResult(selfAdMovie('sm-full'));
 assert.equal(calls,2);assert.equal(retry.checked,true);assert.equal(retry.idMatch,true);
});

test('ads policy: required self-ad NG rules stay blocking while warning-only lookups are fire-and-render-later',()=>{
 assert.match(auto,/await ensureSelfAdChecks\(\[\.\.\.originalMovieIds\], '初期ページ \/ NG条件必須'\)/);
 assert.match(auto,/await ensureSelfAdChecks\(addedIds, '自動追加候補 \/ NG条件必須'\)/);
 assert.doesNotMatch(auto,/await ensureSelfAdChecks\(initialWarningIds/);
 assert.doesNotMatch(auto,/await ensureSelfAdChecks\(warningOnlyIds/);
 assert.match(auto,/startSelfAdWarnings\(initialWarningIds, '初期ページ \/ 表示動画のみ'\)/);
 assert.match(auto,/startSelfAdWarnings\(warningOnlyIds, '自動追加候補 \/ 最終表示動画のみ'\)/);
});

test('Snapshot: bad response triggers fallback path; empty data cannot claim a next page',async()=>{
 let body={data:[],meta:{totalCount:10000}};
 const ctx=vm.createContext({page:{},model:{},URLSearchParams,performance,console:quiet,LOG:'test',SNAPSHOT_ENDPOINT:'https://example.invalid',snapshotDescriptor:{q:'test',isTag:true,order:'desc',sortField:'startTime'},gmRequest:async()=>({status:200,responseText:JSON.stringify(body)})});
 const a=auto.indexOf('      var snapshotFetchOffset = async function(offset,'),b=auto.indexOf('      var requestedMode',a);
 const run=vm.runInContext(adapter+'\n'+auto.slice(a,b)+';snapshotFetchOffset',ctx);
 assert.equal((await run(100)).hasNextPage,false);
 body={data:[{contentId:'sm1'}],meta:{totalCount:null}};assert.equal((await run(0)).totalCount,null);
 body={meta:{status:503}};await assert.rejects(run(0),/応答形式/);
});
test('Snapshot: validation on later pages resumes from the fetched window, small mismatches fallback',async()=>{
 for(const mode of ['hybrid','snapshot'])for(const mismatch of [false,true]){
  const items=Array.from({length:100},(_,i)=>({id:'sm'+i}));
  const ctx=vm.createContext({console:quiet,LOG:'test',useSnapshot:true,snapshotValidated:false,snapshotValidation:null,snapshotValidationOffset:320,snapshotOffset:352,
   snapshotFetchOffset:async()=>({offset:320,items,hasNextPage:true}),page:{_currentPageNumber:11,doc:{querySelectorAll:()=>Array.from({length:3},(_,i)=>({getAttribute:()=>mismatch?'different'+i:'sm'+i}))}},
   setPhase(){},model:{movies:new Map()},requestedMode:mode,filterFreshItems:items=>({freshItems:items.slice(3)}),apiQuickNgReason:()=>'',logCandidateTable(){},
   candidatePool:[],candidatePoolSeen:new Set(),candidateFilter:{clear(){}},sourceLabel:'',fallbackReason:'',totalFetchedItems:0,fetchedExtraPages:0,lastFetchedHadNext:null,totalApiPrefilteredNg:0});
  const a=auto.indexOf('      var validateSnapshotAgainstCurrentDom = async function(signal)'),b=auto.indexOf('      // -------------------- PagerManager',a);
  const run=vm.runInContext(auto.slice(a,b)+';validateSnapshotAgainstCurrentDom',ctx);await run();
  assert.equal(ctx.useSnapshot,!mismatch);
  if(!mismatch){assert.equal(ctx.snapshotOffset,420);assert.equal(ctx.candidatePool.length,97);}
 }
});

test('Diagnostics v2: Snapshot validation reuse contributes fixed API reason buckets',async()=>{
 const helperStart=auto.indexOf('      var apiQuickNgReasonKey = function(reason)'),helperEnd=auto.indexOf('      var getMovieNgReasons',helperStart);
 const helper=vm.runInContext(auto.slice(helperStart,helperEnd)+';apiQuickNgReasonKey',vm.createContext({}));
 const items=[{id:'sm0',quick:'NG動画ID'},{id:'sm1',quick:'NGタグ'},{id:'sm2'}];
 const ctx=vm.createContext({console:quiet,LOG:'test',useSnapshot:true,snapshotValidated:false,snapshotValidation:null,snapshotValidationOffset:0,snapshotOffset:0,
  snapshotFetchOffset:async()=>({offset:0,items,hasNextPage:false}),page:{_currentPageNumber:0,doc:{querySelectorAll:()=>items.map(x=>({getAttribute:()=>x.id}))}},
  setPhase(){},model:{movies:new Map()},requestedMode:'snapshot',filterFreshItems:rows=>({freshItems:rows}),apiQuickNgReason:item=>item.quick||'',apiQuickNgReasonKey:helper,logCandidateTable(){},
  candidatePool:[],candidatePoolSeen:new Set(),candidateFilter:{clear(){}},sourceLabel:'',fallbackReason:'',totalFetchedItems:0,fetchedExtraPages:0,lastFetchedHadNext:null,totalApiPrefilteredNg:0,
  totalApiPrefilterReasons:{movieId:0,title:0,tag:0,userId:0,channelId:0}});
 const a=auto.indexOf('      var validateSnapshotAgainstCurrentDom = async function(signal)'),b=auto.indexOf('      // -------------------- PagerManager',a);
 const run=vm.runInContext(auto.slice(a,b)+';validateSnapshotAgainstCurrentDom',ctx);await run();
 assert.equal(ctx.totalApiPrefilteredNg,2);assert.deepEqual({...ctx.totalApiPrefilterReasons},{movieId:1,title:0,tag:1,userId:0,channelId:0});
 assert.deepEqual(ctx.candidatePool.map(x=>x.id),['sm2']);
});

test('Diagnostics v2: API and cheap prefilter reason counters use fixed buckets in both source modes',async()=>{
 const a=auto.indexOf('      var fetchMoreCandidates = async function(minNeeded, signal)'),b=auto.indexOf('      // -------------------- AdService --------------------',a);
 const source=auto.slice(a,b)+';fetchMoreCandidates';
 const base=()=>({performance:{now:()=>0},console:quiet,LOG:'test',page:{_disposed:false},
  model:{config:{autoFillMaxExtraPages:{value:0},autoFillEnabled:{value:true}}},
  candidatePool:[],lastFetchedHadNext:true,fetchedExtraPages:0,totalFetchedItems:0,totalApiPrefilteredNg:0,
  totalApiPrefilterReasons:{movieId:0,title:0,tag:0,userId:0,channelId:0},totalCheapPrefilteredNg:0,
  totalCheapPrefilterReasons:{movieId:0,title:0,advanced:0},filterFreshItems:items=>({freshItems:items}),
  logCandidateTable(){},snapshotValidated:true});
 const api=base();Object.assign(api,{useSnapshot:true,requestedMode:'snapshot',snapshotOffset:0,
  snapshotFetchOffset:async()=>({offset:0,items:[{id:'a',quick:'NG動画ID'},{id:'b',quick:'NGタグ'},{id:'c'},{id:'d'}],hasNextPage:false}),
  apiQuickNgReason:item=>item.quick||'',candidateFilter:{partition:items=>({passed:items.filter(x=>x.id==='d'),rejected:1,reasons:{movieId:0,title:1,advanced:0}})}});
 const apiRun=vm.runInContext(source,vm.createContext(api));await apiRun(4);
 assert.equal(api.totalApiPrefilteredNg,2);assert.deepEqual({...api.totalApiPrefilterReasons},{movieId:1,title:0,tag:1,userId:0,channelId:0});
 assert.equal(api.totalCheapPrefilteredNg,1);assert.deepEqual({...api.totalCheapPrefilterReasons},{movieId:0,title:1,advanced:0});
 const legacy=base();Object.assign(legacy,{useSnapshot:false,nextPageToFetch:2,knownLastPage:null,endReachedWithoutRequest:false,
  endPageDetectionSource:'unknown',fetchedPageNumbers:new Set(),currentPageNumber:()=>1,updatePagerUi(){},journey:{record(){}},
  candidateFilter:{partition:items=>({passed:items.filter(x=>x.id==='keep'),rejected:1,reasons:{movieId:0,title:0,advanced:1}})}});
 legacy.page.fetchPageItems=async()=>({items:[{id:'drop'},{id:'keep'}],hasNextPage:false,maxPage:2});
 const legacyRun=vm.runInContext(source,vm.createContext(legacy));await legacyRun(2);
 assert.equal(legacy.totalCheapPrefilteredNg,1);assert.deepEqual({...legacy.totalCheapPrefilterReasons},{movieId:0,title:0,advanced:1});
});
test('source context: player URL cannot change search descriptor or page navigation',()=>{
 const sourceHref='https://www.nicovideo.jp/tag/original?sort=registeredAt&order=desc&page=11';
 const ctx=vm.createContext({URL,sourceHref,location:new URL('https://www.nicovideo.jp/watch/sm1')});
 const a=auto.indexOf('      var SNAPSHOT_SORT_MAP'),b=auto.indexOf('      var snapshotDescriptor =',a);
 const descriptor=vm.runInContext(auto.slice(a,b)+';createSnapshotDescriptor()',ctx);
 assert.equal(descriptor.q,'original');assert.equal(descriptor.supported,true);
 const c=auto.indexOf('      var currentPageNumber = function()'),d=auto.indexOf('      var firstUnfetchedPageAfterCurrent',c);
 assert.equal(vm.runInContext(auto.slice(c,d)+';currentPageNumber()',ctx),11);
});

// BRUSH-019: request broker (Network.createQueue) — dedupe, concurrency, cancel-before-start.
const tick=()=>new Promise(r=>setImmediate(r));
function held(){const runs=[];const task=name=>()=>new Promise(resolve=>runs.push({name,resolve}));return {runs,task};}
test('broker: callers sharing a key share one request; the 2-argument form is unchanged',async()=>{
 const q=loadNetwork().createQueue(2),{runs,task}=held();
 const a=q('k',task('first')),b=q('k',task('second'));
 assert.equal(a,b);await tick();assert.deepEqual(runs.map(r=>r.name),['first']);
 runs[0].resolve(7);assert.deepEqual(await Promise.all([a,b]),[7,7]);
 await tick();const c=q('k',task('third'));await tick();assert.equal(runs.length,2,'a finished key can be requested again');runs[1].resolve(8);assert.equal(await c,8);
});
test('broker: never runs more than the limit at once',async()=>{
 const q=loadNetwork().createQueue(2),{runs,task}=held();
 const all=[1,2,3,4,5].map(i=>q('k'+i,task(i)));await tick();
 assert.equal(runs.length,2);assert.deepEqual({...q.stats()},{active:2,queued:3});
 runs[0].resolve();await tick();await tick();assert.equal(runs.length,3);
 for(const r of runs.slice(1))r.resolve();await tick();await tick();runs.slice(3).forEach(r=>r.resolve());await tick();await tick();
 runs.slice(4).forEach(r=>r.resolve());await Promise.all(all);assert.equal(runs.length,5);assert.deepEqual({...q.stats()},{active:0,queued:0});
});
test('broker: a queued request whose caller aborted never starts and frees its key',async()=>{
 const q=loadNetwork().createQueue(1),{runs,task}=held();
 q('busy',task('busy'));const controller=new AbortController();
 const queued=q('k',task('queued'),{signal:controller.signal});await tick();
 controller.abort('spa-dispose');
 await assert.rejects(queued,error=>error.name==='AbortError'&&error.reason==='spa-dispose');
 assert.deepEqual({...q.stats()},{active:1,queued:0});
 const fresh=q('k',task('fresh'));runs[0].resolve();await tick();await tick();
 assert.deepEqual(runs.map(r=>r.name),['busy','fresh'],'the aborted task never ran');runs[1].resolve('ok');assert.equal(await fresh,'ok');
 const pre=new AbortController();pre.abort();await assert.rejects(q('dead',task('dead'),{signal:pre.signal}));
 await tick();assert.equal(runs.some(r=>r.name==='dead'),false,'an already aborted signal never starts a task');
});
test('broker: a shared queued request survives while any caller still wants it',async()=>{
 const q=loadNetwork().createQueue(1),{runs,task}=held();q('busy',task('busy'));
 const first=new AbortController(),second=new AbortController();
 const a=q('k',task('k'),{signal:first.signal}),b=q('k',task('k'),{signal:second.signal}),c=q('j',task('j'),{signal:first.signal}),d=q('j',task('j'));
 first.abort();await tick();assert.deepEqual({...q.stats()},{active:1,queued:2},'second caller of k and the signal-less caller of j keep them');
 second.abort();await assert.rejects(a);await assert.rejects(b);
 runs[0].resolve();await tick();await tick();assert.deepEqual(runs.map(r=>r.name),['busy','j']);runs[1].resolve(1);assert.equal(await c,1);assert.equal(await d,1);
});
test('broker: aborting after start leaves the running task to its own signal',async()=>{
 const q=loadNetwork().createQueue(1),{runs,task}=held(),controller=new AbortController();
 const running=q('k',task('k'),{signal:controller.signal});await tick();controller.abort();
 assert.equal(runs.length,1);runs[0].resolve('done');assert.equal(await running,'done');
});
// BRUSH-022: negative cache primitive.
test('negative cache: entries expire, future stamps are ignored and the size is bounded',()=>{
 const c=loadNetwork().negativeCache(1000,3);
 assert.equal(c.has('a',0),false);c.note('a',0);assert.equal(c.has('a',999),true);assert.equal(c.has('a',1000),false,'expires at the TTL');
 assert.equal(c.size,0,'expired entries are removed');
 c.note('f',5000);assert.equal(c.has('f',100),false,'a stamp from the future is not trusted');
 for(const k of ['1','2','3','4'])c.note(k,10);assert.equal(c.size,3);assert.equal(c.has('1',10),false);assert.equal(c.has('4',10),true);
 c.forget('4');assert.equal(c.has('4',10),false);c.clear();assert.equal(c.size,0);
});