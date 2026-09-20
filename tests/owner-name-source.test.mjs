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
