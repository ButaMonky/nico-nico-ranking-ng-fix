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
 const context=vm.createContext({...counters,ThumbInfoListener:h.ThumbInfoListener,model:{config:h.config,movies:h.movies,requestThumbInfo(){}},
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

test('recent raw details cannot block separately cached name evidence; cache timestamp and video must match',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});h.detail(payload('sm1',{type:'unknown',id:-1,name:null}));
 const supplement={id:'sm1',ownerId:12,ownerName:'restored',fetchedAt:Date.now()-1000};
 await restoreCache(h,{id:'sm2',ownerNameSupplement:supplement});assert.equal(h.movie.metadata.ownerName,'unknown');
 await restoreCache(h,{id:'sm1',ownerNameSupplement:{...supplement,fetchedAt:undefined}});assert.equal(h.movie.metadata.ownerName,'unknown');
 await restoreCache(h,{id:'sm1',ownerNameSupplement:supplement});assert.equal(h.movie.contributor.name,'restored');
 assert.equal(h.movie._nrnOwnerNameStatus,'cached');assert.equal(h.calls.length,0);
});

// BRUSH-003: provenance records sit beside the authoritative status strings.
const ruleSet=[condition('userId','eq',12),condition('tag','notExists'),condition('contributorName','exists'),
 group('AND',[condition('userId','eq',12),condition('tag','contains','synthetic')],true),group('OR',[condition('userId','eq',99),condition('description','exists')])];
const evaluateAll=h=>ruleSet.map(node=>h.AdvancedNgRules.evaluateNode(h.movie,node));
test('provenance: status strings keep their values and search owner is attributed',async()=>{
 const h=await setup();assert.deepEqual({...h.movie.metadataSource},{});
 for(const field of h.MetadataReadiness.fields)assert.equal(h.movie.metadata[field],'unknown');
 const before=Date.now();h.search('sm1',{type:'user',id:12,name:null,visibility:'visible'});
 for(const field of ['ownerId','ownerType','ownerVisibility']){
  assert.equal(h.movie.metadata[field],'known');const record=h.MetadataReadiness.sourceOf(h.movie,field);
  assert.equal(record.source,'search');assert.ok(record.observedAt>=before);
 }
 assert.equal(h.movie.metadata.ownerName,'unknown');assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerName'),null);
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'tags'),null);
});
test('provenance: detail, nicoad name and failure kinds are distinguished',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:null});h.fail({id:'sm1',error:{type:'TIMEOUT'}});
 assert.equal(h.movie.metadata.tags,'failed');assert.equal(h.MetadataReadiness.sourceOf(h.movie,'tags').failureKind,'TIMEOUT');
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerId').source,'search','known fields are not overwritten by a failure');
 const at=Date.now()-5000;h.detail({...payload('sm1',{type:'user',id:12,name:null}),fetchedAt:at});
 assert.equal(h.movie.metadata.tags,'known');assert.deepEqual({...h.MetadataReadiness.sourceOf(h.movie,'tags')},{source:'detail',observedAt:at});
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerId').source,'detail');
 const supplementAt=Date.now()-1000;
 assert.equal(h.ThumbInfoListener.forOwnerName(h.movies)('sm1',{id:'sm1',ownerId:12,ownerName:'named'},supplementAt),true);
 assert.deepEqual({...h.MetadataReadiness.sourceOf(h.movie,'ownerName')},{source:'nicoad',observedAt:supplementAt});
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerId').source,'detail');
});
test('provenance: absent records keep legacy behaviour and never change NG results',async()=>{
 const withSource=await setup(),legacy=await setup();
 for(const h of [withSource,legacy]){h.config.advancedNgRulesEnabled.value=true;
  h.config.advancedNgRulesJson.value=JSON.stringify([{expression:condition('userId','eq',12)}]);}
 withSource.search('sm1',{type:'user',id:12,name:'synthetic'});
 delete legacy.movie.metadataSource;legacy.search('sm1',{type:'user',id:12,name:'synthetic'});
 assert.deepEqual(evaluateAll(withSource),evaluateAll(legacy));assert.equal(withSource.movie.ng,legacy.movie.ng);
 const cleared=await setup();cleared.search('sm1',{type:'user',id:12,name:'synthetic'});const expected=evaluateAll(cleared);
 cleared.movie.metadataSource={};assert.deepEqual(evaluateAll(cleared),expected);
 assert.equal(cleared.MetadataReadiness.sourceOf(cleared.movie,'ownerId'),null);
 assert.equal(cleared.MetadataReadiness.ready(cleared.movie,cleared.config),true,'readiness ignores provenance');
});
test('provenance: cache restore keeps statuses and is labelled cache',async()=>{
 const h=await setup(),cachedAt=Date.now()-60000;
 await restoreCache(h,{id:'sm1',cachedAt,metadata:{tags:'known',lockedTags:'known',description:'known',ownerName:'unknown'},
  contributor:{type:'user',id:12,name:''},tags:[],description:''});
 assert.equal(h.movie.metadata.tags,'known');assert.equal(h.movie.metadata.ownerName,'unknown');
 assert.deepEqual({...h.MetadataReadiness.sourceOf(h.movie,'tags')},{source:'cache',observedAt:cachedAt});
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerId').source,'cache');
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'ownerName'),null);
});
test('provenance: records never promote fields and stale records are not reported',async()=>{
 const h=await setup(),M=h.MetadataReadiness;
 assert.equal(M.noteSource(h.movie,'tags','detail',1),false);assert.equal(h.movie.metadata.tags,'unknown');
 assert.equal(M.noteSource(h.movie,'likeCount','search',1),false);assert.equal('likeCount' in h.movie.metadata,false);
 h.search('sm1',{type:'user',id:12,name:'x'});assert.equal(M.noteSource(h.movie,'ownerId','guess',1),false);
 assert.equal(M.noteFailure(h.movie,'ownerId','NETWORK'),false,'known fields cannot be marked failed');
 h.movie.metadataSource.tags={source:'detail',observedAt:1};assert.equal(M.sourceOf(h.movie,'tags'),null);
 h.movie.metadataSource.description={source:'detail',observedAt:null,failureKind:'NETWORK'};h.movie.metadata.description='known';
 assert.equal(M.sourceOf(h.movie,'description'),null);
 h.search('sm1',{type:'user',id:13,name:'conflict'});assert.equal(h.movie.metadata.ownerId,'unknown');
 assert.equal(h.movie.metadataSource.ownerId,undefined,'conflict clears owner records');
});
test('provenance: records are per movie and a new SPA model starts empty',async()=>{
 const first=await setup();first.search('sm1',{type:'user',id:12,name:'x'});
 const second=await setup();assert.deepEqual({...second.movie.metadataSource},{});
 assert.equal(Object.prototype.hasOwnProperty.call(second.Movie.prototype,'metadataSource'),false);
 const other=new first.Movie('sm2','other');assert.notEqual(other.metadataSource,first.movie.metadataSource);
 assert.deepEqual({...other.metadataSource},{});
});
