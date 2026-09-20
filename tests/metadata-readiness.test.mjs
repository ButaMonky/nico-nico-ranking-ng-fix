import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const condition=(field,operator='exists',value)=>({kind:'condition',field,operator,value});
const group=(op,children,not=false)=>({kind:'group',op,children,not});
const payload=(id,contributor)=>({id,contributor,description:'',tags:[]});
async function setup(){
 const calls=[],context=vm.createContext({URL,queueMicrotask,console:{log(){}},GM_xmlhttpRequest:o=>{calls.push(o);return {abort(){}};}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfo,OwnerEvidence,ThumbInfoListener,AdvancedNgRules,MetadataReadiness:typeof MetadataReadiness === "undefined" ? null : MetadataReadiness}; })()',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
 const movies=new lib.Movies(config),movie=new lib.Movie('sm1','synthetic');movies.setIfAbsent([movie]);
 Object.assign(context,lib,{movies,config,gmXmlHttpRequest:()=>context.GM_xmlhttpRequest});
 const start=source.indexOf('    var recentDetails = new Map()'),end=source.indexOf('    var createModel =',start);
 const make=vm.runInContext(source.slice(start,end)+'; createThumbInfoRequester',context);
 const request=make(movies,{sort:()=>[{movie}]});
 return {...lib,config,movies,movie,calls,request,search:lib.ThumbInfoListener.forSearch(movies),detail:lib.ThumbInfoListener.forCompleted(movies),fail:lib.ThumbInfoListener.forErrorOccurred(movies)};
}
test('typed hidden owner retains identity and visibility without inventing a name',async()=>{
 const h=await setup();
 h.search('sm1',{ownerType:'hidden',type:'user',visibility:'hidden',id:'12',name:null});
 assert.equal(h.movie.contributor.id,12);assert.equal(h.movie.owner.visibility,'hidden');
 assert.equal(h.movie.metadata.ownerId,'known');assert.equal(h.movie.metadata.ownerName,'unknown');
 assert.equal(h.movie.metadata.tags,'unknown');assert.equal(h.movie.thumbInfoDone,false);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('userId','eq',12)),true);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('contributorName','notExists')),false);
});
test('unknown/conflicting types, invalid IDs and mismatched cards are rejected',async()=>{
 const {OwnerEvidence:O}=await setup();
 for(const owner of [{id:12},{ownerType:'hidden',id:12},{ownerType:'user',type:'hidden',id:12},{ownerType:'user',type:'channel',id:12},{type:'other',id:12},{type:'user',id:'ch12'},...[0,-1,'12x','1e3',Infinity,9007199254740992].map(id=>({type:'user',id}))]) assert.equal(O.normalize(owner),null,JSON.stringify(owner));
 assert.equal(O.normalize({type:'channel',id:'ch12'}).id,12);
 const root={dataset:{decorationVideoId:'sm2'},querySelectorAll:()=>[]};
 O.register(root,{id:'sm1',owner:{type:'user',id:12}});
 assert.equal(O.fromRow({rootElem:root,movie:{id:'sm1'}}),null);
});
test('null name can become confirmed empty without turning tags into empty',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});h.search('sm1',{type:'user',id:12,name:''});
 assert.equal(h.movie.metadata.ownerName,'known');
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('contributorName','notExists')),true);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('tag','notExists')),false);
});
test('planning many cards parses unchanged rule requirements once and changes invalidate them',async()=>{
 const h=await setup();h.config.advancedNgRulesEnabled.value=true;
 const parse=h.AdvancedNgRules.parse;let parses=0;
 h.AdvancedNgRules.parse=(raw)=>{parses++;return parse(raw);};
 h.config.advancedNgRulesJson.value=JSON.stringify([{expression:condition('description','contains','unique-fixture')}]);
 for(let i=0;i<100;i++)assert.ok(h.MetadataReadiness.required(h.movie,h.config).has('description'));
 assert.equal(parses,1);
 h.config.advancedNgRulesJson.value=JSON.stringify([{expression:condition('lockedTag','exists')}]);
 assert.ok(h.MetadataReadiness.required(h.movie,h.config).has('lockedTags'));assert.equal(parses,2);
});
test('owner-only rules make zero requests; tags remain unknown under nested logic',async()=>{
 const h=await setup();h.config.ngUserIds.add(99);h.search('sm1',{type:'user',id:12,name:'synthetic'});
 h.request();h.request();assert.equal(h.calls.length,0);
 const unknown=condition('tag','notExists'),yes=condition('userId','eq',12),no=condition('userId','eq',99);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,unknown),false);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,group('AND',[yes,unknown],true)),false);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,group('OR',[no,unknown],true)),false);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,group('OR',[yes,unknown])),true);
});
test('rule change requests unknown tags once and completion confirms empty tags',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'synthetic'});h.request();assert.equal(h.calls.length,0);
 h.config.advancedNgRulesEnabled.value=true;
 h.config.advancedNgRulesJson.value=JSON.stringify([{expression:condition('tag','notExists')}]);
 await new Promise(r=>setImmediate(r));h.request();assert.equal(h.calls.length,1);
 h.detail(payload('sm1',{type:'user',id:12,name:'synthetic'}));
 assert.equal(h.movie.metadata.tags,'known');assert.equal(h.movie.ng,true);assert.equal(h.movie.metadata.lockedTags,'known');
});
test('basic tag/locked tag/name and expanded display each demand missing data',async()=>{
 for(const key of ['ngTags','ngLockedTags','ngUserNames','ngLockedTagCountEnabled','movieInfoTogglable','descriptionTogglable']){
  const h=await setup();h.search('sm1',{type:'user',id:12,name:null});
  if(key.startsWith('ng')&&key!=='ngLockedTagCountEnabled')h.config[key].add('synthetic');
  else h.config[key].value=key==='ngLockedTagCountEnabled';
  h.request();assert.equal(h.calls.length,1,key);h.request();assert.equal(h.calls.length,1);h.request.dispose();
 }
});
test('basic locked-tag threshold also waits for field knowledge',async()=>{
 const h=await setup();h.config.ngLockedTagCountThreshold.value=0;h.config.ngLockedTagCountEnabled.value=true;
 assert.equal(h.movie.ng,false,'unknown locked tags are not a confirmed zero');
 h.detail(payload('sm1',{type:'user',id:12,name:'synthetic'}));assert.equal(h.movie.ng,true);
});
test('opening deferred details triggers one individual request',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'synthetic'});h.request();assert.equal(h.calls.length,0);
 h.movie.requestDetails();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);
 h.movie.requestDetails();h.request();assert.equal(h.calls.length,1);
});
test('failure retains known ID and leaves unknown tags undecided, not empty',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});h.fail({id:'sm1',error:{type:'NETWORK'}});
 assert.equal(h.movie.metadata.tags,'failed');assert.equal(h.movie.metadata.ownerId,'known');
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('userId','eq',12)),true);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('tag','notExists')),false);
 h.detail(payload('sm1',null));assert.equal(h.movie.metadata.tags,'known');assert.equal(h.movie.contributor.id,12);
});
test('missing detail owner never proves notExists; user/channel namespace is known separately',async()=>{
 const h=await setup();h.detail(payload('sm1',null));
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('userId','notExists')),false);
 h.search('sm1',{type:'channel',id:12,name:'channel'});
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('userId','notExists')),true);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('channelId','eq',12)),true);
});
test('cache detail priority and search conflicts retain field accuracy',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'search'});h.search('sm1',{type:'user',id:13,name:'conflict'});
 assert.equal(h.movie.metadata.ownerId,'unknown');
 h.detail(payload('sm1',{type:'user',id:20,name:null}));
 assert.equal(h.movie.contributor.id,20);assert.equal(h.movie.metadata.ownerName,'unknown');
 h.detail(payload('sm1',{type:'user',id:20,name:'detail'}));assert.equal(h.movie.contributor.name,'detail');
 h.detail(payload('sm1',null));assert.equal(h.movie.contributor.name,'detail');
});
test('disposed SPA requester ignores queued settings changes and late response',async()=>{
 const h=await setup();h.config.ngTags.add('synthetic');h.request();assert.equal(h.calls.length,1);
 h.request.dispose();h.calls[0].onerror();h.calls[0].onload({status:200,responseText:'stale'});
 h.config.ngLockedTags.add('another');await new Promise(r=>setImmediate(r));h.request();
 assert.equal(h.calls.length,1);assert.equal(h.movie.thumbInfoDone,false);
});
test('self-ad name stays unknown until named owner arrives, then reuses sponsors',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});
 h.movie.setNicoadSelfAdResult({checked:true,idMatch:false,nameMatch:false,sponsors:[{userId:99,advertiserName:'synthetic-owner'}]});
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('selfAdNameMatch','isFalse')),false);
 h.detail(payload('sm1',{type:'user',id:12,name:'synthetic-owner'}));
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('selfAdNameMatch','isTrue')),true);
 assert.equal(h.calls.length,0,'already fetched sponsors are re-evaluated without communication');
});
async function restoreCache(h,cached) {
 h.config.sessionDetailCacheEnabled.value=true;
 const counters={cacheHits:0,cacheMisses:0,cacheRestores:0,cacheRestoreFailures:0};
 const context=vm.createContext({...counters,ThumbInfoListener:h.ThumbInfoListener,model:{config:h.config,movies:h.movies},
  page:{_disposed:false},LOG:'fixture',detailCache:{get:()=>cached,configure(){},diagnostics(){return{};}},
  console:{log(){},table(){},groupCollapsed(){},groupEnd(){},warn(){}}});
 const begin=source.indexOf('      var cacheKeyForMovie = function(id)'),end=source.indexOf('      var cacheMovieAfterCheck = function(id)',begin);
 const restore=vm.runInContext(source.slice(begin,end)+';restoreCachedMovieDetails',context);
 return restore(['sm1'],'fixture');
}
test('persistent cache rejects mismatched IDs and incomplete field records',async()=>{
 for(const cached of [{id:'sm1',tags:[],description:'',contributor:{type:'user',id:12,name:''}},
  {id:'sm2',metadata:{tags:'known',lockedTags:'known',description:'known'},tags:[],description:''},
  {id:'sm1',metadata:{tags:'known',lockedTags:'known',description:'known'},description:''}]){
  const h=await setup();await restoreCache(h,cached);assert.equal(h.movie.thumbInfoDone,false);
  assert.equal(h.movie.metadata.tags,'unknown');
 }
});
test('persistent cache preserves missing owner name and confirmed empty tags',async()=>{
 const h=await setup();await restoreCache(h,{id:'sm1',metadata:{tags:'known',lockedTags:'known',description:'known',ownerName:'unknown'},
  contributor:{type:'user',id:12,name:''},tags:[],description:''});
 assert.equal(h.movie.metadata.ownerId,'known');assert.equal(h.movie.metadata.ownerName,'unknown');
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('contributorName','notExists')),false);
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('tag','notExists')),true);
});
