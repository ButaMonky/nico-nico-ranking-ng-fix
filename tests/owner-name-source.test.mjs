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
 return {...lib,config,movies,movie,service,calls};
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
 const h=await idSetup();const queued=[];
 const code=await readFile(new URL('../src/data/owner-name-source.js',import.meta.url),'utf8');
 const service=vm.runInContext(code+';OwnerNameSource',vm.createContext({...h,URL,AbortController,setTimeout,clearTimeout,performance,
  Network:h.Network,ThumbInfoListener:h.ThumbInfoListener,MetadataReadiness:h.MetadataReadiness,OwnerEvidence:h.OwnerEvidence,
  fetch:(url,{signal})=>new Promise((resolve,reject)=>{h.pending.push({status:code=>resolve({ok:false,status:code,url,text:async()=>''})});signal.addEventListener('abort',()=>reject(Error('abort')));})}))
  .create(h.movies,undefined,{snapshot:{enqueue:m=>{queued.push(m.id);return true;},dispose(){}}});
 service.request([h.m]);await tick();h.pending.at(-1).status(404);await tick();
 assert.deepEqual(queued,['sm2']);assert.equal(h.m._nrnOwnerIdStatus,'absent');service.dispose();h.service.dispose();
});
