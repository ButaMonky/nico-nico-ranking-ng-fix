import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
async function setup(extra={}){
 const source=await readFile(output,'utf8'),calls=[];
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,performance,
  fetch:(url,{signal,credentials})=>new Promise((resolve,reject)=>{
   assert.equal(credentials,'omit');calls.push({url,reply:data=>resolve({ok:true,status:200,url,text:async()=>JSON.stringify({data})})});
   signal.addEventListener('abort',()=>reject(Error('abort')));
  }),...extra});
 const end=source.indexOf('  var MovieViewMode =');
 const lib=vm.runInContext(source.slice(0,end)+'return {Movie,Movies,Config,ThumbInfoListener,Network,OwnerEvidence,MetadataReadiness};})()',context);
 Object.assign(context,lib);
 const code=await readFile(new URL('../src/data/owner-name-source.js',import.meta.url),'utf8');
 const OwnerNameSource=vm.runInContext(code+';OwnerNameSource',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();const movies=new lib.Movies(config);
 const movie=new lib.Movie('sm1','synthetic');movies.setIfAbsent([movie]);
 lib.ThumbInfoListener.forSearch(movies)('sm1',{type:'user',id:55,name:null,visibility:'hidden'});
 const service=OwnerNameSource.create(movies);
 return {...lib,config,movies,movie,service,calls,OwnerNameSourceModule:OwnerNameSource};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('missing account name is fetched once, gates settlement and immediately re-evaluates name NG',async()=>{
 const h=await setup();h.movie.setThumbInfoDone();h.config.ngUserNames.add('restored');
 h.service.request([h.movie]);h.service.request([h.movie]);assert.equal(h.movie.metadataSettled,false);await tick();
 assert.equal(h.calls.length,1);h.calls[0].reply({id:'sm1',ownerId:55,ownerName:'restored account'});await tick();
 assert.equal(h.movie.contributor.name,'restored account');assert.equal(h.movie.ng,true);assert.equal(h.movie.metadataSettled,true);
 await h.service.getData('sm1');assert.equal(h.calls.length,1,'decoration reuses the same endpoint response');h.service.dispose();
});
test('mismatch and malformed responses stay unknown; failure is not retried on every model event',async()=>{
 const h=await setup();h.movie.setThumbInfoDone();h.service.request([h.movie]);await tick();
 h.calls[0].reply({id:'sm2',ownerId:55,ownerName:'wrong video'});await tick();
 assert.equal(h.movie.metadata.ownerName,'unknown');assert.equal(h.movie.metadataSettled,true);
 for(let i=0;i<20;i++)h.service.request([h.movie]);await tick();assert.equal(h.calls.length,1);h.service.dispose();
});
test('disposal cancels queued owner name requests and ignores replies for old models',async()=>{
 const h=await setup();h.movie.setThumbInfoDone();h.service.request([h.movie]);await tick();h.service.dispose();
 h.calls[0].reply({id:'sm1',ownerId:55,ownerName:'late'});await tick();assert.equal(h.movie.metadata.ownerName,'unknown');
});
test('known names and independently NG-hidden cards need no supplementary request',async()=>{
 const h=await setup();h.config.ngUserIds.add(55);h.movie.setThumbInfoDone();h.service.request([h.movie]);await tick();assert.equal(h.calls.length,0);
 h.config.ngUserIds.clear();h.ThumbInfoListener.forSearch(h.movies)('sm1',{type:'user',id:55,name:'known'});
 h.service.request([h.movie]);await tick();assert.equal(h.calls.length,0);h.service.dispose();
});

test('queue wait is inside the deadline; slow supplemental metadata cannot hold a whole page indefinitely',async()=>{
 const timers=new Map();let next=0;
 const h=await setup({setTimeout:(fn,ms)=>{assert.ok(ms<=8000);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
 const all=Array.from({length:20},(_,i)=>new h.Movie('sm'+(i+20),'synthetic'));h.movies.setIfAbsent(all);
 const search=h.ThumbInfoListener.forSearch(h.movies);
 for(const m of all){search(m.id,{type:'user',id:55,name:null});m.setThumbInfoDone();}
 h.service.request(all);await tick();assert.equal(h.calls.length,4);assert.ok(all.every(m=>!m.metadataSettled));
 for(const fn of [...timers.values()])fn();await tick();await tick();
 assert.ok(all.every(m=>m.metadataSettled));assert.ok(all.every(m=>m.metadata.ownerName==='unknown'));
 assert.equal(h.calls.length,4,'expired queued work never starts a new transport');h.service.dispose();
});

// BRUSH-009: nicoad ownerId supplement for videos whose detail answer had no owner.
async function idSetup(videoId='sm2'){
 const pending=[];
 const fetch=(url,{signal,credentials})=>new Promise((resolve,reject)=>{
  assert.equal(credentials,'omit');
  const respond=(status,data)=>resolve({ok:status>=200&&status<300,status,url,text:async()=>JSON.stringify({meta:{status},data})});
  pending.push({url,reply:data=>respond(200,data),status:code=>respond(code,null),fail:()=>reject(Error('network'))});
  signal.addEventListener('abort',()=>reject(Error('abort')));
 });
 const h=await setup({fetch});const movie=new h.Movie(videoId,'missing-owner');h.movies.setIfAbsent([movie]);
 h.config.ngUserIds.add(1);// BRUSH-011: an owner ID demand is required for any supplement lookup
 h.ThumbInfoListener.forCompleted(h.movies)({id:videoId,contributor:null,description:'',tags:[]});
 return {...h,m:movie,pending};
}
test('owner ID supplement: missing owner is filled from nicoad ownerId and feeds ID NG',async()=>{
 const h=await idSetup();h.config.ngUserIds.add(77);assert.equal(h.m.ownerResolution.status,'missing');
 h.service.request([h.m]);h.service.request([h.m]);assert.equal(h.m.metadataSettled,false);await tick();
 assert.equal(h.pending.length,1);assert.match(h.pending[0].url,/\/v1\/contents\/video\/sm2$/);
 h.pending[0].reply({id:'sm2',ownerId:77,ownerName:'kept name'});await tick();
 assert.equal(h.m.contributor.id,77);assert.equal(h.m.contributor.type,'user');assert.equal(h.m.ng,true);
 assert.equal(h.m.ownerResolution.status,'supplemented');assert.equal(h.m.ownerResolution.source,'nicoad');
 assert.equal(h.m._nrnOwnerNameSource,'nicoad');assert.equal(h.m._nrnOwnerIdStatus,'accepted');assert.equal(h.m.metadataSettled,true);
 assert.equal(h.MetadataReadiness.sourceOf(h.m,'ownerId').source,'nicoad');h.service.dispose();
});
test('owner ID supplement: video ID mismatch, missing ownerId and invalid IDs are rejected',async()=>{
 for(const data of [{id:'sm9',ownerId:77},{id:'sm2'},{id:'sm2',ownerId:0},{id:'sm2',ownerId:'ch77'},{id:'sm2',ownerId:'12x'}]){
  const h=await idSetup();h.service.request([h.m]);await tick();h.pending[0].reply(data);await tick();
  assert.equal(h.m.contributor.type,'unknown',JSON.stringify(data));assert.equal(h.m.ownerResolution.status,'missing');
  assert.equal(h.AdvancedNgRules?h.AdvancedNgRules.evaluateNode(h.m,{kind:'condition',field:'userId',operator:'notExists'}):false,false);
  h.service.dispose();
 }
});
test('owner ID supplement: 404 and failures keep the owner unknown and are distinguished',async()=>{
 const a=await idSetup();a.service.request([a.m]);await tick();a.pending[0].status(404);await tick();
 assert.equal(a.m._nrnOwnerIdStatus,'absent');assert.equal(a.m.ownerResolution.status,'missing');assert.equal(a.m.metadataSettled,true);
 const b=await idSetup();b.service.request([b.m]);await tick();b.pending[0].status(503);await tick();assert.equal(b.m._nrnOwnerIdStatus,'failed');
 const c=await idSetup();c.service.request([c.m]);await tick();c.pending[0].fail();await tick();assert.equal(c.m._nrnOwnerIdStatus,'failed');
 for(const h of [a,b,c]){assert.equal(h.m.metadata.ownerId,'unknown');h.service.request([h.m]);await tick();assert.equal(h.pending.length,1,'not retried in the same scope');h.service.dispose();}
});
test('owner ID supplement: only sm/nm videos whose detail answer had no owner are looked up',async()=>{
 const so=await idSetup('so5');so.service.request([so.m]);await tick();assert.equal(so.pending.length,0,'channel-style IDs are skipped');
 const h=await idSetup();const known=h.movie;h.service.request([known]);await tick();
 assert.equal(known._nrnOwnerIdStatus,undefined,'search-known owner is not looked up by ID (a name lookup may still run)');
 const fresh=new h.Movie('sm3','not yet answered');h.movies.setIfAbsent([fresh]);h.service.request([fresh]);await tick();
 assert.equal(h.pending.filter(p=>/sm3$/.test(p.url)).length,0,'unanswered or failed detail does not trigger an ID lookup');
 h.ThumbInfoListener.forErrorOccurred(h.movies)({id:'sm3',error:{type:'NETWORK'}});h.service.request([fresh]);await tick();
 assert.equal(h.pending.filter(p=>/sm3$/.test(p.url)).length,0);h.service.dispose();so.service.dispose();
});
test('owner ID supplement: dispose aborts and late answers are ignored',async()=>{
 const h=await idSetup();h.service.request([h.m]);await tick();assert.equal(h.pending.length,1);
 h.service.dispose();h.pending[0].reply({id:'sm2',ownerId:77});await tick();
 assert.equal(h.m.contributor.type,'unknown');assert.equal(h.m._nrnOwnerIdPending,false);
});
test('owner ID supplement: videos nicoad cannot resolve are handed to the snapshot batch',async()=>{
 const h=await idSetup();const queued=[];h.config.ngUserNames.add('synthetic');// name demand -> nicoad first
 const code=await readFile(new URL('../src/data/owner-name-source.js',import.meta.url),'utf8');
 const service=vm.runInContext(code+';OwnerNameSource',vm.createContext({...h,URL,AbortController,setTimeout,clearTimeout,performance,
  Network:h.Network,ThumbInfoListener:h.ThumbInfoListener,MetadataReadiness:h.MetadataReadiness,OwnerEvidence:h.OwnerEvidence,
  fetch:(url,{signal})=>new Promise((resolve,reject)=>{h.pending.push({status:code=>resolve({ok:false,status:code,url,text:async()=>''})});signal.addEventListener('abort',()=>reject(Error('abort')));})}))
  .create(h.movies,undefined,{snapshot:{enqueue:m=>{queued.push(m.id);return true;},dispose(){}}});
 service.request([h.m]);await tick();h.pending.at(-1).status(404);await tick();
 assert.deepEqual(queued,['sm2']);assert.equal(h.m._nrnOwnerIdStatus,'absent');service.dispose();h.service.dispose();
});
// BRUSH-011: owner supplement only when something needs the owner.
async function demandSetup(count=1,known=0){
 const h=await idSetup();h.config.ngUserIds.clear();h.service.dispose();
 const extra=[];for(let i=0;i<count;i++){const m=new h.Movie('sm'+(100+i),'x');h.movies.setIfAbsent([m]);extra.push(m);
  if(i<known)h.ThumbInfoListener.forSearch(h.movies)(m.id,{type:'user',id:500+i,name:'page'});
  else h.ThumbInfoListener.forCompleted(h.movies)({id:m.id,contributor:null,description:'',tags:[]});}
 const snap={queued:[],callbacks:new Map(),enqueue(m,cb){if(m.ownerResolution.status!=='missing')return false;this.queued.push(m.id);if(cb)this.callbacks.set(m.id,cb);return true;},dispose(){}};
 const code=await readFile(new URL('../src/data/owner-name-source.js',import.meta.url),'utf8');
 const ctx=vm.createContext({URL,AbortController,setTimeout,clearTimeout,performance,Network:h.Network,ThumbInfoListener:h.ThumbInfoListener,
  MetadataReadiness:h.MetadataReadiness,OwnerEvidence:h.OwnerEvidence,fetch:(url,{signal})=>new Promise((resolve,reject)=>{
   h.pending.push({url,
    reply:data=>resolve({ok:true,status:200,url,text:async()=>JSON.stringify({meta:{status:200},data})}),
    status:code=>resolve({ok:false,status:code,url,text:async()=>''})});signal.addEventListener('abort',()=>reject(Error('abort')));})});
 const service=vm.runInContext(code+';OwnerNameSource',ctx).create(h.movies,undefined,{snapshot:snap});
 return {...h,list:extra,snap,service,before:h.pending.length};
}
test('owner display recovery: a visible card with no owner still tries nicoad once even without NG demand',async()=>{
 const h=await demandSetup(3);assert.deepEqual({...h.MetadataReadiness.ownerDemand(h.list[0],h.config)},{id:false,name:false},'NG/readiness demand stays off');
 h.service.request(h.list);await tick();
 assert.equal(h.pending.length,h.before+3,'display recovery uses one nicoad lookup per missing visible owner');
 assert.deepEqual(h.snap.queued,[],'display-name recovery does not waste a Snapshot lookup that cannot provide a name');
 for(const [i,m] of h.list.entries()){
  assert.equal(m._nrnOwnerIdStatus,'pending');
  h.pending[h.before+i].reply?.({id:m.id,ownerId:500+i,ownerName:'restored '+i,ownerIcon:'https://example.invalid/'+i+'.jpg'});
 }
 await tick();
 for(const [i,m] of h.list.entries()){
  assert.equal(m.contributor.type,'user');assert.equal(m.contributor.name,'restored '+i);assert.equal(m._nrnOwnerNameSource,'nicoad');
 }
 h.service.request(h.list);await tick();assert.equal(h.pending.length,h.before+3,'recovered cards are not requested twice');
 h.service.dispose();
});
test('owner display recovery: per-route nicoad work stays bounded',async()=>{
 const h=await demandSetup(70);h.service.request(h.list);await tick();
 assert.equal(h.list.filter(m=>m._nrnOwnerIdStatus==='pending').length,64,'only the bounded set is admitted to nicoad work');
 assert.equal(h.list.filter(m=>m._nrnOwnerIdStatus==='budget').length,6,'overflow stays unresolved instead of starting unbounded work');
 assert.ok(h.pending.length-h.before<=4,'the shared broker still enforces its transport concurrency cap');
 h.service.dispose();
});
test('owner demand: ID-only demand batches the unresolved videos and skips known owners',async()=>{
 const h=await demandSetup(48,32);h.config.ngUserIds.add(9);h.service.request(h.list);await tick();
 assert.equal(h.snap.queued.length,16,'only the 16 unresolved of 48 candidates');assert.equal(h.pending.length,h.before,'no per-video nicoad request');
 const [first,second,third]=h.snap.queued.map(id=>h.movies.get(id));
 h.snap.callbacks.get(first.id)('accepted');h.snap.callbacks.get(second.id)('channel');await tick();
 assert.equal(h.pending.length,h.before,'resolved or channel results need no fallback');
 h.snap.callbacks.get(third.id)('absent');await tick();
 assert.equal(h.pending.length,h.before+1);assert.match(h.pending.at(-1).url,new RegExp(third.id+'$'),'nicoad only for what the batch missed');
 h.pending.at(-1).status(404);await tick();assert.equal(h.snap.queued.length,16,'no second snapshot round');h.service.dispose();
});
test('owner demand: readiness reports what the owner is needed for',async()=>{
 const h=await demandSetup(1);const m=h.list[0],D=()=>({...h.MetadataReadiness.ownerDemand(m,h.config)});
 assert.deepEqual(D(),{id:false,name:false});
 h.config.ngChannelIds.add(3);assert.deepEqual(D(),{id:true,name:false});h.config.ngChannelIds.clear();
 h.config.visibleContributorType.value='user';assert.deepEqual(D(),{id:true,name:false});h.config.visibleContributorType.value='all';
 h.config.unknownContributorMovieVisible.value=false;assert.deepEqual(D(),{id:true,name:false});h.config.unknownContributorMovieVisible.value=true;
 h.config.advancedNgRulesEnabled.value=true;h.config.advancedNgRulesJson.value=JSON.stringify([{expression:{kind:'condition',field:'userId',operator:'eq',value:1}}]);
 assert.deepEqual(D(),{id:true,name:false});
 h.config.advancedNgRulesJson.value=JSON.stringify([{expression:{kind:'condition',field:'contributorName',operator:'contains',value:'x'}}]);
 assert.deepEqual(D(),{id:true,name:true});h.config.advancedNgRulesEnabled.value=false;
 m.requestDetails();assert.deepEqual(D(),{id:true,name:true},'opening details shows the owner');h.service.dispose();
});
// BRUSH-019: the broker drops queued nicoad lookups of a disposed route; one
// video's owner ID, owner name and decoration share a single request.
test('broker: SPA dispose removes queued lookups before they start; one request per video',async()=>{
 const h=await setup();
 const lookups=[1,2,3,4,5,6].map(i=>h.service.getData('sm'+i).catch(()=>null));
 assert.equal(h.service.getData('sm1'),h.service.getData('sm1'),'id, name and decoration lookups share one promise');
 await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.length,4);assert.deepEqual({...h.Network.ads.stats()},{active:4,queued:2});
 h.service.dispose();await Promise.all(lookups);await new Promise(r=>setImmediate(r));
 assert.equal(h.Network.ads.stats().queued,0,'queued lookups are gone, not waiting for a slot');
 assert.equal(h.calls.length,4,'no queued lookup started after dispose');
 const next=await setup(),fresh=next.service.getData('sm1').catch(()=>null);await new Promise(r=>setImmediate(r));
 assert.equal(next.calls.length,1,'a new route gets its own request');
 next.service.dispose();await fresh;
});
// BRUSH-022: nicoad 404 (no record) is remembered for a short time; failures never.
test('negative cache: nicoad 404 is remembered across routes, 503 and network errors are not',async()=>{
 const a=await idSetup();a.service.request([a.m]);await tick();a.pending[0].status(404);await tick();
 assert.equal(a.m._nrnOwnerIdStatus,'absent');a.service.dispose();
 // Same page (same module instance), new SPA route: no new request, same 'absent' outcome.
 const OwnerNameSource=a.OwnerNameSourceModule;
 const route2=OwnerNameSource.create(a.movies);route2.request([a.m]);await tick();
 assert.equal(a.pending.length,1,'no second nicoad request');assert.equal(a.m._nrnOwnerIdStatus,'absent');
 await assert.rejects(route2.getData('sm2'),e=>e.status===404&&e.remembered===true);
 OwnerNameSource._absent.note('sm2',Date.now()-OwnerNameSource._absent.ttlMs);
 const route3=OwnerNameSource.create(a.movies);route3.request([a.m]);await tick();
 assert.equal(a.pending.length,2,'after the TTL the lookup may run again');route2.dispose();route3.dispose();
 for(const fail of [h=>h.pending[0].status(503),h=>h.pending[0].status(500),h=>h.pending[0].fail()]){
  const h=await idSetup();h.service.request([h.m]);await tick();fail(h);await tick();
  assert.equal(h.OwnerNameSourceModule._absent.has('sm2'),false);
  const again=h.OwnerNameSourceModule.create(h.movies);again.request([h.m]);await tick();
  assert.equal(h.pending.length,2,'a failure is retried by the next route');again.dispose();h.service.dispose();
 }
});
