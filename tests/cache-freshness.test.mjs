import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,sourceParts} from '../scripts/build.mjs';

// Assemble in memory so these boundary tests exercise the edited source.
const source=(await Promise.all(sourceParts.map(p=>readFile(resolve(root,p),'utf8')))).join('');
const end=source.indexOf('  var MovieViewMode = (function(_super) {');
const lib=vm.runInNewContext(source.slice(0,end)+'return {Movie,Movies,Config,ThumbInfoListener,MetadataReadiness}; })()',{URL});
async function setup() {
  const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
  config.sessionDetailCacheEnabled.value=true;
  const movies=new lib.Movies(config);movies.setIfAbsent([new lib.Movie('sm1','synthetic')]);
  const movie=movies.get('sm1'),stored=new Map();
  const context=vm.createContext({...lib,model:{config,movies,requestThumbInfo(){}},
    page:{_disposed:false},LOG:'fixture',cacheHits:0,cacheMisses:0,cacheRestores:0,cacheRestoreFailures:0,cacheWrites:0,
    getMovieNgReasons:()=>['obsolete NG result'],
    detailCache:{get:id=>stored.get(id),set:(id,data)=>stored.set(id,data),configure(){},diagnostics(){return {}; }},
    console:{log(){},table(){},groupCollapsed(){},groupEnd(){},warn(){}}});
  const begin=source.indexOf('      var cacheKeyForMovie = function(id)'),stop=source.indexOf('      var logCacheCandidateAudit',begin);
  const {restore,save}=vm.runInContext(source.slice(begin,stop)+';({restore:restoreCachedMovieDetails,save:cacheMovieAfterCheck})',context);
  return {config,movies,movie,stored,restore,save,detail:lib.ThumbInfoListener.forCompleted(movies)};
}
const entry=(cachedAt=Date.now()-1000)=>({id:'sm1',cachedAt,
  metadata:{tags:'known',lockedTags:'known',description:'known',ownerName:'unknown'},
  tags:[{name:'synthetic',lock:false}],description:'cached description',contributor:{type:'user',id:12,name:null}});

test('cache restore rejects missing/coerced/nonpositive/future acquisition times before mutating fields',async()=>{
  for(const at of [undefined,null,'1000000',0,-1,NaN,Infinity,Date.now()+30000]) {
    const h=await setup();h.stored.set('sm1',entry(at));
    if(at===undefined)delete h.stored.get('sm1').cachedAt;
    const result=h.restore(['sm1'],'fixture');
    assert.equal(h.movie.thumbInfoDone,false,`timestamp ${String(at)}`);
    assert.equal(h.movie.metadata.description,'unknown');
    assert.equal(h.movie.metadata.tags,'unknown');assert.equal(result.restored,0);
  }
});

test('cache rejects malformed tag names and lock flags atomically instead of making a false NG match',async()=>{
  for(const tags of [[null],[{name:null,lock:false}],[{name:'synthetic',lock:'false'}],[{name:'synthetic'}]]) {
    const h=await setup();h.config.ngLockedTags.add('synthetic');
    h.stored.set('sm1',{...entry(),tags});h.restore(['sm1'],'fixture');
    assert.equal(h.movie.thumbInfoDone,false,JSON.stringify(tags));
    assert.equal(h.movie.metadata.description,'unknown','no partial restore');
    assert.equal(h.movie.ng,false);assert.equal(h.movie.metadata.lockedTags,'unknown');
  }
});

test('repeated restore/save retains acquisition time and never persists NG decisions',async()=>{
  const at=Date.now()-50000,first=await setup();first.stored.set('sm1',entry(at));
  first.config.ngTags.add('synthetic');first.restore(['sm1'],'fixture');
  assert.equal(first.movie.ng,true);first.save('sm1');
  const saved=first.stored.get('sm1');assert.equal(saved.cachedAt,at);
  assert.equal(Object.hasOwn(saved,'ng'),false);assert.equal(Object.hasOwn(saved,'ngReasons'),false);
  const second=await setup();second.stored.set('sm1',saved);second.restore(['sm1'],'fixture');second.save('sm1');
  assert.equal(second.movie.ng,false,'current settings decide NG');
  assert.equal(second.stored.get('sm1').cachedAt,at);
  assert.deepEqual({...lib.MetadataReadiness.sourceOf(second.movie,'tags')},{source:'cache',observedAt:at});
});

test('metadata without a verified acquisition time is not saved as freshly fetched',async()=>{
  const h=await setup();h.detail({...entry(),fetchedAt:Date.now()-1000});
  delete h.movie._nrnDetailFetchedAt;h.save('sm1');assert.equal(h.stored.size,0);
});

test('name-only cache updates discard old stored NG decisions without refreshing detail time',async()=>{
  const h=await setup(),at=Date.now()-50000;
  h.stored.set('sm1',{...entry(at),ng:true,ngReasons:['obsolete']});
  h.movie._nrnOwnerNameSupplement={id:'sm1',ownerId:12,ownerName:'recovered',fetchedAt:Date.now()-1000};
  h.save('sm1');const saved=h.stored.get('sm1');
  assert.equal(saved.cachedAt,at);assert.equal(saved.ownerNameSupplement.ownerName,'recovered');
  assert.equal(Object.hasOwn(saved,'ng'),false);assert.equal(Object.hasOwn(saved,'ngReasons'),false);
});

test('short recent cache preserves original time, reports cache provenance and rejects clock rollback',async()=>{
  let now=1000000;
  const clock=class extends Date {static now(){return now;}};
  const listeners={};
  class Transport {on(name,fn){listeners[name]=fn;return this;} request(){} dispose(){} }
  const applied=[];
  const config={useGetThumbInfo:{value:true},thumbInfoConcurrency:{value:1,on(){},off(){}}};
  const movie={id:'sm1',thumbInfoDone:false,on(){return this;},off(){}};
  const context=vm.createContext({Date:clock,ThumbInfo:Transport,gmXmlHttpRequest:()=>()=>{},
    ThumbInfoListener:{forCompleted:()=>data=>{applied.push(data);movie.thumbInfoDone=true;},forErrorOccurred:()=>()=>{}},
    MetadataReadiness:{settings:[]},SourcePlan:{planMovie:()=>({requests:{detail:['tags']}})},queueMicrotask,console});
  const begin=source.indexOf('    var recentDetails = new Map()'),stop=source.indexOf('    var createModel =',begin);
  const make=vm.runInContext(source.slice(begin,stop)+';createThumbInfoRequester',context);
  const movies={config,get:()=>movie},modes={sort:()=>[{movie}]};
  const request=make(movies,modes);
  listeners.completed({id:'sm1',tags:[],description:''});assert.equal(applied.length,1);
  movie.thumbInfoDone=false;now+=50000;request();assert.equal(applied.length,2);
  assert.equal(applied[1].fetchedAt,1000000);assert.equal(applied[1].source,'cache');
  assert.deepEqual({...applied[1].ownerFetchedAt},{identity:1000000,name:1000000,visibility:1000000});
  movie.thumbInfoDone=false;now=999999;request();assert.equal(applied.length,2,'clock rollback invalidates cache');
  request.dispose();
});
