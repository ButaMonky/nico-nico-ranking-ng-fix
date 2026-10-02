import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=value=>JSON.parse(JSON.stringify(value));
const ALL=['search','cache','nicoad','snapshot','detail'];
async function setup(){
 const calls=[],context=vm.createContext({URL,queueMicrotask,console:{log(){}},
  GM_xmlhttpRequest:o=>{calls.push(o);return {abort(){}};},fetch:(...args)=>{calls.push(args);return new Promise(()=>{});}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfoListener,MetadataReadiness,SourcePlan:typeof SourcePlan === "undefined" ? null : SourcePlan}; })()',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
 const movies=new lib.Movies(config),movie=new lib.Movie('sm1','synthetic');movies.setIfAbsent([movie]);
 return {...lib,config,movies,movie,calls,search:lib.ThumbInfoListener.forSearch(movies),detail:lib.ThumbInfoListener.forCompleted(movies),fail:lib.ThumbInfoListener.forErrorOccurred(movies)};
}
const OWNER=['ownerId','ownerType'];
test('source plan: known fields need no request and report their provenance',async()=>{
 const h=await setup();assert.ok(h.SourcePlan,'SourcePlan is built into the userscript');
 h.search('sm1',{type:'user',id:12,name:'x'});
 const p=plain(h.SourcePlan.plan(h.movie,OWNER,{available:ALL}));
 assert.equal(p.complete,true);assert.deepEqual(p.requests,{});
 assert.equal(p.fields.ownerId.source,'search');assert.equal(p.fields.ownerId.next,null);
});
test('source plan: fields that need a request share one request kind',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});
 const p=plain(h.SourcePlan.plan(h.movie,[...OWNER,'ownerName','tags','lockedTags'],{available:['nicoad','snapshot','detail']}));
 assert.deepEqual(p.requests,{detail:['ownerName','tags','lockedTags']},'detail already needed for tags also covers the name');
 assert.equal(p.complete,false);
 const nameOnly=plain(h.SourcePlan.plan(h.movie,['ownerName'],{available:['nicoad','detail']}));
 assert.deepEqual(nameOnly.requests,{nicoad:['ownerName']},'cheaper single source when nothing else is needed');
});
test('source plan: free sources first, exhausted sources are skipped',async()=>{
 const h=await setup();
 let p=plain(h.SourcePlan.plan(h.movie,['tags','ownerId'],{available:ALL}));
 assert.equal(p.fields.tags.next,'cache');assert.equal(p.fields.ownerId.next,'search');
 p=plain(h.SourcePlan.plan(h.movie,['tags','ownerId'],{available:ALL,exhausted:{tags:['cache'],ownerId:['search','cache']}}));
 assert.deepEqual(p.requests,{detail:['tags','ownerId']});
 p=plain(h.SourcePlan.plan(h.movie,['ownerId'],{available:ALL,exhausted:{ownerId:['search','cache']}}));
 assert.deepEqual(p.requests,{nicoad:['ownerId']});
});
test('source plan: failed detail is not repeated and unknown is never reported as complete',async()=>{
 const h=await setup();h.fail({id:'sm1',error:{type:'NETWORK'}});
 let p=plain(h.SourcePlan.plan(h.movie,['tags'],{available:ALL}));
 assert.equal(p.fields.tags.status,'failed');assert.equal(p.fields.tags.next,'cache');assert.equal(p.complete,false);
 p=plain(h.SourcePlan.plan(h.movie,['tags'],{available:['detail','snapshot','nicoad','search']}));
 assert.equal(p.fields.tags.next,null);assert.equal(p.fields.tags.reason,'no-available-source');
 assert.deepEqual(p.requests,{});assert.equal(p.complete,false);assert.equal(h.movie.metadata.tags,'failed');
});
test('source plan: lock state, owner type and like count only come from sources that carry them',async()=>{
 const h=await setup();
 let p=plain(h.SourcePlan.plan(h.movie,['lockedTags','ownerType','ownerId'],{available:['search','nicoad','snapshot']}));
 assert.equal(p.fields.lockedTags.next,null,'no lock state from snapshot, nicoad or page data');
 assert.equal(p.fields.ownerType.next,'search');
 p=plain(h.SourcePlan.plan(h.movie,['ownerType','ownerId'],{available:['nicoad']}));
 assert.equal(p.fields.ownerType.next,null,'nicoad ownerId alone does not establish the type');assert.equal(p.fields.ownerId.next,'nicoad');
 p=plain(h.SourcePlan.plan(h.movie,['likeCount'],{available:['detail','snapshot','nicoad']}));
 assert.equal(p.fields.likeCount.next,null);
 p=plain(h.SourcePlan.plan(h.movie,['likeCount','madeUp'],{available:ALL}));
 assert.equal(p.fields.likeCount.next,'search');assert.equal(p.fields.madeUp.reason,'unsupported-field');
 assert.equal('madeUp' in h.movie.metadata,false,'planning never adds metadata fields');
 assert.equal(h.movie.metadata.likeCount,'unknown','planning never marks a field known');
});
test('source plan: pure — no movie mutation, no requests',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});
 const before=plain({metadata:h.movie.metadata,source:h.movie.metadataSource});
 h.SourcePlan.plan(h.movie,['ownerName','tags','lockedTags','description'],{available:ALL});
 h.SourcePlan.planMovie(h.movie,h.config,{available:ALL});
 assert.deepEqual(plain({metadata:h.movie.metadata,source:h.movie.metadataSource}),before);
 assert.equal(h.calls.length,0);
});
test('source plan: planMovie follows readiness demand and group batches IDs per source',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'x'});
 assert.deepEqual(plain(h.SourcePlan.planMovie(h.movie,h.config,{available:ALL}).requests),{});
 h.config.ngTags.add('synthetic');
 assert.deepEqual(plain(h.SourcePlan.planMovie(h.movie,h.config,{available:['detail']}).requests),{detail:['tags']});
 const other=new h.Movie('sm2','other');h.movies.setIfAbsent([other]);
 const plans=[{id:'sm1',plan:h.SourcePlan.planMovie(h.movie,h.config,{available:['detail']})},
  {id:'sm2',plan:h.SourcePlan.plan(other,['ownerId','ownerType'],{available:['snapshot','detail']})},
  {id:'sm2',plan:h.SourcePlan.plan(other,['ownerId'],{available:['snapshot']})}];
 assert.deepEqual(plain(h.SourcePlan.group(plans)),{detail:['sm1'],snapshot:['sm2']});
});
