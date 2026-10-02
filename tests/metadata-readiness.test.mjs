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
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfo,OwnerEvidence,ThumbInfoListener,AdvancedNgRules,SourcePlan,MetadataReadiness:typeof MetadataReadiness === "undefined" ? null : MetadataReadiness}; })()',context);
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
 assert.equal(M.noteSource(h.movie,'madeUpCount','search',1),false);assert.equal('madeUpCount' in h.movie.metadata,false);
 assert.equal(M.noteSource(h.movie,'likeCount','search',1),false,'a tracked field still is not promoted by a record');assert.equal(h.movie.metadata.likeCount,'unknown');
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

// BRUSH-006: like count is a metadata field; 0 is a count, everything invalid stays unknown.
test('like count: valid counts become known with search provenance',async()=>{
 for(const value of [0,1,Number.MAX_SAFE_INTEGER]){
  const h=await setup(),at=Date.now()-1000;
  assert.equal(h.movie.metadata.likeCount,'unknown');assert.equal(h.movie.likeCount,null);
  assert.equal(h.movie.observeLikeCount(value,'search',at),true);
  assert.strictEqual(h.movie.likeCount,value);assert.equal(h.movie.metadata.likeCount,'known');
  assert.deepEqual({...h.MetadataReadiness.sourceOf(h.movie,'likeCount')},{source:'search',observedAt:at});
 }
});
test('like count: missing, null, strings, negatives, fractions and non-finite stay unknown',async()=>{
 for(const value of [undefined,null,'5','0','',-1,1.5,NaN,Infinity,-Infinity,2**53,true,{}]){
  const h=await setup();assert.equal(h.movie.observeLikeCount(value,'search'),false,String(value));
  assert.equal(h.movie.likeCount,null);assert.equal(h.movie.metadata.likeCount,'unknown');
  assert.equal(h.MetadataReadiness.sourceOf(h.movie,'likeCount'),null);
 }
 const h=await setup();assert.equal(h.movie.observeLikeCount(3,'guess'),false,'unknown source rejected');
 assert.equal(h.movie.metadata.likeCount,'unknown');
});
test('like count: an unknown observation never erases a known count, a newer count replaces it',async()=>{
 const h=await setup();h.movie.observeLikeCount(0,'search',1000);
 for(const value of [null,undefined,'7',-1])h.movie.observeLikeCount(value,'search');
 assert.strictEqual(h.movie.likeCount,0);assert.equal(h.movie.metadata.likeCount,'known');
 h.movie.observeLikeCount(9,'search',2000);assert.strictEqual(h.movie.likeCount,9);
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'likeCount').observedAt,2000);
});
test('like count: detail failures do not mark it failed and NG results do not change',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'x'});h.config.advancedNgRulesEnabled.value=true;
 h.config.advancedNgRulesJson.value=JSON.stringify([{expression:condition('userId','eq',12)}]);
 const before=[h.movie.ng,...evaluateAll(h)];
 h.fail({id:'sm1',error:{type:'NETWORK'}});assert.equal(h.movie.metadata.likeCount,'unknown');assert.equal(h.movie.metadata.tags,'failed');
 h.movie.observeLikeCount(5,'search');assert.deepEqual([h.movie.ng,...evaluateAll(h)],before);
 const other=await setup();other.movie.observeLikeCount(4,'search');other.fail({id:'sm1',error:{type:'TIMEOUT'}});
 assert.equal(other.movie.metadata.likeCount,'known');assert.strictEqual(other.movie.likeCount,4);
 assert.equal(h.MetadataReadiness.required(h.movie,h.config).has('likeCount'),false,'no rule demands like counts yet');
});
test('like count: a cache restore keeps the search value and detail fields separate',async()=>{
 const h=await setup();h.movie.observeLikeCount(0,'search');
 await restoreCache(h,{id:'sm1',cachedAt:Date.now()-60000,metadata:{tags:'known',lockedTags:'known',description:'known',ownerName:'unknown'},
  contributor:{type:'user',id:12,name:''},tags:[],description:''});
 assert.strictEqual(h.movie.likeCount,0);assert.equal(h.MetadataReadiness.sourceOf(h.movie,'likeCount').source,'search');
 assert.equal(h.MetadataReadiness.sourceOf(h.movie,'tags').source,'cache');
});
// BRUSH-007: other search values share the like-count rules.
test('search values: counts, duration and registration time become known per field',async()=>{
 const h=await setup(),at=Date.now()-500,ms=Date.parse('2026-09-19T17:56:13Z');
 const accepted=h.movie.observeSearchFields({viewCount:0,commentCount:12,mylistCount:'3',durationSeconds:-1,registeredAtMs:ms,unknownField:5},'search',at);
 assert.deepEqual([...accepted],['viewCount','commentCount','registeredAtMs']);
 assert.strictEqual(h.movie.viewCount,0);assert.strictEqual(h.movie.commentCount,12);assert.strictEqual(h.movie.registeredAtMs,ms);
 assert.equal(h.movie.mylistCount,null);assert.equal(h.movie.metadata.mylistCount,'unknown');
 assert.equal(h.movie.durationSeconds,null);assert.equal(h.movie.metadata.durationSeconds,'unknown');
 assert.equal('unknownField' in h.movie,false);assert.equal(h.MetadataReadiness.sourceOf(h.movie,'viewCount').source,'search');
 h.movie.observeSearchFields({viewCount:null,commentCount:undefined});assert.strictEqual(h.movie.viewCount,0);assert.strictEqual(h.movie.commentCount,12);
 h.fail({id:'sm1',error:{type:'NETWORK'}});
 for(const f of h.MetadataReadiness.searchFields)assert.notEqual(h.movie.metadata[f],'failed',f);
 assert.deepEqual([...h.MetadataReadiness.detailFields],['ownerId','ownerType','ownerName','ownerVisibility','tags','lockedTags','description']);
});
// BRUSH-013: getthumbinfo is only for fields a detail response alone supplies.
const rulesOn=(h,...expressions)=>{h.config.advancedNgRulesEnabled.value=true;
 h.config.advancedNgRulesJson.value=JSON.stringify(expressions.map(expression=>({expression})));};
test('thumbinfo demand: search-page values never demand a detail request',async()=>{
 const h=await setup(),M=h.MetadataReadiness;
 for(const f of M.searchFields)assert.equal(Object.values(M.ruleFields).includes(f),false,f);
 // Everything that can demand a field is switched on: search fields still are not demanded.
 h.config.ngUserIds.add(1);h.config.ngChannelIds.add(2);h.config.ngUserNames.add('x');h.config.ngTags.add('t');h.config.ngLockedTags.add('l');
 h.config.ngLockedTagCountEnabled.value=true;h.config.selfAdWarningEnabled.value=true;h.config.movieInfoTogglable.value=false;h.config.descriptionTogglable.value=false;
 rulesOn(h,...Object.keys(h.MetadataReadiness.ruleFields).map(f=>condition(f)));h.movie.requestDetails();
 const need=M.required(h.movie,h.config);
 for(const f of M.searchFields)assert.equal(need.has(f),false,f);
 // Known owner, all search values known or unknown: no request either way.
 for(const values of [{},{likeCount:0,viewCount:1,commentCount:2,mylistCount:3,durationSeconds:4,registeredAtMs:Date.parse('2026-01-01T00:00:00Z')}]){
  const g=await setup();g.config.ngUserIds.add(99);g.search('sm1',{type:'user',id:12,name:'synthetic'});
  g.movie.observeSearchFields(values,'search');g.request();g.request();assert.equal(g.calls.length,0,JSON.stringify(values));
 }
});
test('thumbinfo demand: owner, title, movie ID and page-count rules need no request once the owner is known',async()=>{
 const rules=[condition('userId','eq',12),condition('channelId','notExists'),condition('contributorId','exists'),condition('contributorName','contains','syn'),
  condition('title','contains','x'),condition('movieId','eq','sm1'),condition('pageContributorCount','gte',2),
  group('AND',[condition('title','contains','x'),condition('userId','neq',5)],true)];
 for(const rule of rules){
  const h=await setup();rulesOn(h,rule);h.search('sm1',{type:'user',id:12,name:'synthetic'});
  h.request();h.request();assert.equal(h.calls.length,0,JSON.stringify(rule));
 }
});
test('thumbinfo demand: tag, locked tag, locked tag count and description each send exactly one request',async()=>{
 for(const rule of [condition('tag','contains','t'),condition('lockedTag','exists'),condition('lockedTagCount','gte',1),condition('tagCount','lt',3),
  condition('description','contains','d'),group('OR',[condition('title','contains','x'),condition('tag','exists')])]){
  const h=await setup();rulesOn(h,rule);h.search('sm1',{type:'user',id:12,name:'synthetic'});
  h.request();h.request();assert.equal(h.calls.length,1,JSON.stringify(rule));h.request.dispose();
 }
});
test('thumbinfo demand: a recent detail result is reused instead of a second request',async()=>{
 const h=await setup();rulesOn(h,condition('tag','exists'));h.search('sm1',{type:'user',id:12,name:'synthetic'});
 h.request();assert.equal(h.calls.length,1);h.detail(payload('sm1',{type:'user',id:12,name:'synthetic'}));
 h.request();h.request();assert.equal(h.calls.length,1);assert.equal(h.movie.metadata.tags,'known');
});
test('thumbinfo demand: a failed detail is not re-requested by the same requester',async()=>{
 const h=await setup();rulesOn(h,condition('tag','exists'));h.search('sm1',{type:'user',id:12,name:'synthetic'});
 h.request();h.fail({id:'sm1',error:{type:'NETWORK'}});h.request();h.request();
 assert.equal(h.calls.length,1);assert.equal(h.movie.metadata.tags,'failed');
});
// BRUSH-017: every owner source reaches ordinary and advanced NG the same way;
// an unresolved owner stays undecided under NOT / != / notExists.
const ownerSources={
 native:h=>h.search('sm1',h.OwnerEvidence.fromUrl('https://www.nicovideo.jp/user/12')),
 search:h=>h.search('sm1',{type:'user',id:12,name:'s'}),
 detail:h=>h.detail(payload('sm1',{type:'user',id:12,name:'d'})),
 nicoad:h=>{h.detail(payload('sm1',null));assert.equal(h.ThumbInfoListener.forSupplement(h.movies)('sm1',{type:'user',id:'12',name:'n'},'nicoad'),true);},
 snapshot:h=>{h.detail(payload('sm1',null));assert.equal(h.ThumbInfoListener.forSupplement(h.movies)('sm1',{type:'user',id:'12',name:null},'snapshot'),true);},
};
const ownerExpectations=[[condition('userId','eq',12),true],[condition('contributorId','eq',12),true],[condition('userId','neq',99),true],
 [group('AND',[condition('userId','eq',99)],true),true],[group('AND',[condition('userId','eq',12)],true),false],
 [condition('userId','notExists'),false],[condition('channelId','exists'),false],[condition('channelId','eq',12),false],[condition('channelId','notExists'),true]];
test('owner NG: native, search, detail, nicoad and snapshot owners feed ngUserIds and advanced rules alike',async()=>{
 for(const [name,apply] of Object.entries(ownerSources)){
  const h=await setup();apply(h);
  assert.equal(h.movie.contributor.type,'user',name);assert.equal(Number(h.movie.contributor.id),12,name);
  assert.equal(h.movie.metadata.ownerId,'known',name);
  for(const [node,expected] of ownerExpectations)assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,node),expected,name+' '+JSON.stringify(node));
  h.config.ngUserIds.add(12);assert.equal(h.movie.ng,true,name+' ngUserIds');
  const c=await setup();apply(c);c.config.ngChannelIds.add(12);assert.equal(c.movie.ng,false,name+' a user is never matched as channel 12');
  const r=await setup();apply(r);rulesOn(r,group('AND',[condition('userId','eq',99)],true));assert.equal(r.movie.ng,true,name+' NOT userId=99');
 }
});
const undecided=[condition('userId','eq',12),condition('userId','neq',99),group('AND',[condition('userId','eq',99)],true),
 condition('userId','notExists'),condition('channelId','notExists'),condition('contributorId','notExists'),
 group('AND',[condition('contributorId','exists')],true),group('OR',[condition('userId','eq',99),condition('channelId','neq',5)])];
const unresolvedStates={
 unresolved:h=>{},
 'detail answered without owner':h=>h.detail(payload('sm1',null)),
 'conflicting search':h=>{h.search('sm1',{type:'user',id:12,name:'a'});h.search('sm1',{type:'user',id:13,name:'b'});},
 'failed detail':h=>h.fail({id:'sm1',error:{type:'NETWORK'}}),
};
test('owner NG: unresolved, missing, conflicting and failed owners never satisfy NOT / != / notExists',async()=>{
 for(const [name,apply] of Object.entries(unresolvedStates)){
  const h=await setup();apply(h);assert.notEqual(h.movie.metadata.ownerId,'known',name);
  for(const node of undecided)assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,node),false,name+' '+JSON.stringify(node));
  h.config.ngUserIds.add(12);h.config.ngChannelIds.add(12);assert.equal(h.movie.ng,false,name);
  const r=await setup();apply(r);rulesOn(r,...undecided);assert.equal(r.movie.ng,false,name+' via rules');
 }
});
test('owner NG: a supplement that disagrees, names a channel or targets a non-user video is rejected',async()=>{
 const h=await setup(),supplement=h.ThumbInfoListener.forSupplement(h.movies);h.search('sm1',{type:'user',id:12,name:'s'});
 assert.equal(supplement('sm1',{type:'user',id:'13',name:'x'},'nicoad'),false);assert.equal(Number(h.movie.contributor.id),12);
 const c=await setup();c.detail(payload('sm1',null));
 assert.equal(c.ThumbInfoListener.forSupplement(c.movies)('sm1',{type:'channel',id:'12',name:'x'},'snapshot'),false);
 assert.equal(c.movie.metadata.ownerId,'unknown');c.config.ngChannelIds.add(12);assert.equal(c.movie.ng,false);
 assert.equal(c.ThumbInfoListener.forSupplement(c.movies)('sm1',{type:'user',id:'12',name:null},'guess'),false,'unknown source');
 const so=await setup();so.movies.setIfAbsent([new so.Movie('so5','channel video')]);
 assert.equal(so.ThumbInfoListener.forSupplement(so.movies)('so5',{type:'user',id:'12',name:null},'nicoad'),false,'so videos are channel videos');
 for(const bad of ['9007199254740993','0','-1','abc'])
  assert.equal(c.ThumbInfoListener.forSupplement(c.movies)('sm1',{type:'user',id:bad,name:null},'nicoad'),false,bad);
});
test('owner NG: removing an NG user ID releases a supplemented owner',async()=>{
 const h=await setup();ownerSources.nicoad(h);h.config.ngUserIds.add(12);assert.equal(h.movie.ng,true);
 h.config.ngUserIds.remove([12]);assert.equal(h.movie.ng,false);
});
// BRUSH-018: trace entries say how settled a value is and where it came from.
const traceOf=(h,node)=>{const trace=[];const result=h.AdvancedNgRules.evaluateState(h.movie,node,trace,0);return {result,trace:JSON.parse(JSON.stringify(trace))};};
test('NG trace: known values report state and source; existing keys are unchanged',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'s'});
 const {result,trace:[entry]}=traceOf(h,condition('userId','eq',12));
 assert.equal(result,true);
 for(const key of ['depth','kind','field','fieldLabel','operator','operatorLabel','expected','actual','not','result'])assert.ok(key in entry,key);
 assert.equal(entry.state,'known');assert.equal(entry.source,'search');assert.equal(entry.actual,12);assert.equal('failureKind' in entry,false);
 assert.deepEqual([traceOf(h,condition('title','contains','syn')).trace[0].source,traceOf(h,condition('movieId','eq','sm1')).trace[0].source],['page','page']);
 h.detail(payload('sm1',{type:'user',id:12,name:'d'}));
 assert.equal(traceOf(h,condition('tag','notExists')).trace[0].source,'detail');
 assert.equal(traceOf(h,condition('userId','eq',12)).trace[0].source,'detail');
 const n=await setup();ownerSources.nicoad(n);assert.equal(traceOf(n,condition('userId','eq',12)).trace[0].source,'nicoad');
 const s=await setup();ownerSources.snapshot(s);assert.equal(traceOf(s,condition('contributorId','exists')).trace[0].source,'snapshot');
});
test('NG trace: undecided values say whether they are still unknown or failed',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'s'});
 let {result,trace:[entry]}=traceOf(h,group('AND',[condition('tag','contains','x')],true));
 assert.equal(result,null);assert.equal(entry.state,'unknown');assert.equal(entry.source,null);assert.equal(entry.result,null);
 assert.equal(entry.actual.__notReady,true,'the rule editor still recognises a pending value');
 h.fail({id:'sm1',error:{type:'TIMEOUT'}});
 ({result,trace:[entry]}=traceOf(h,condition('tag','notExists')));
 assert.equal(result,null);assert.equal(entry.state,'failed');assert.equal(entry.failureKind,'TIMEOUT');
 assert.equal(traceOf(h,condition('userId','eq',12)).trace[0].state,'known','known owner survives a failed detail');
 const p=await setup();assert.deepEqual({...p.AdvancedNgRules.fieldOrigin(p.movie,'pageContributorCount')},{state:'unknown',source:null});
 assert.equal(p.AdvancedNgRules.fieldOrigin(p.movie,'selfAdIdMatch').state,'unknown');
});
test('NG trace: explain lists matching, non-matching, undecided and disabled rules',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'s'});
 const rules=JSON.stringify([{id:'a',name:'hit',expression:condition('userId','eq',12)},{id:'b',name:'miss',expression:condition('userId','eq',99)},
  {id:'c',name:'wait',expression:group('AND',[condition('userId','eq',12),condition('tag','contains','x')])},
  {id:'d',name:'off',enabled:false,expression:condition('userId','eq',12)}]);
 const report=JSON.parse(JSON.stringify(h.AdvancedNgRules.explain(h.movie,rules)));
 assert.deepEqual(report.map(r=>[r.id,r.enabled,r.result,r.waitingFor]),[['a',true,true,[]],['b',true,false,[]],['c',true,null,['tag']],['d',false,null,[]]]);
 assert.equal(report[2].trace.find(t=>t.field==='tag').state,'unknown');
 assert.deepEqual([...h.AdvancedNgRules.match(h.movie,true,rules).map(r=>r.id)],['a'],'match() is unchanged');
});

// BRUSH-015: resolve cheap, stable branches before asking for missing detail.
test('progressive demand: a stable title NG does not fetch unrelated tags or owner identity',async()=>{
 const h=await setup();h.config.ngTitles.add('synthetic');h.config.ngTags.add('blocked');
 h.request();assert.equal(h.calls.length,0);assert.equal(h.movie.ng,true);assert.equal(h.movie.metadataSettled,true);
 assert.equal(h.movie.metadata.tags,'unknown');h.request.dispose();
});
test('progressive demand: OR true and AND false prune their unknown detail branches',async()=>{
 for(const [op,text,matched] of [['OR','synthetic',true],['AND','absent',false]]){
  const h=await setup();h.search('sm1',{type:'user',id:12,name:'synthetic'});
  h.config.advancedNgRulesEnabled.value=true;h.config.advancedNgRulesJson.value=JSON.stringify([{expression:group(op,[condition('title','contains',text),condition('tag','contains','blocked')])}]);
  h.request();assert.equal(h.calls.length,0,op);assert.equal(h.movie.ng,matched);h.request.dispose();
 }
});
test('progressive demand: only still-relevant unresolved subtrees contribute fields',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'synthetic'});
 h.config.advancedNgRulesEnabled.value=true;h.config.advancedNgRulesJson.value=JSON.stringify([{expression:group('OR',[
  group('AND',[condition('title','contains','absent'),condition('tag','exists')]),condition('description','contains','secret')])}]);
 const need=h.MetadataReadiness.required(h.movie,h.config);assert.equal(need.has('tags'),false);assert.equal(need.has('description'),true);
 h.request();assert.equal(h.calls.length,1);h.request.dispose();
});
test('progressive demand: weak search owner never suppresses a required authoritative detail',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'search'});
 h.config.advancedNgRulesEnabled.value=true;h.config.advancedNgRulesJson.value=JSON.stringify([{expression:group('OR',[condition('userId','eq',12),condition('tag','contains','blocked')])}]);
 h.request();assert.equal(h.calls.length,1);h.detail(payload('sm1',{type:'user',id:13,name:'actual'}));assert.equal(h.movie.ng,false);h.request.dispose();
});
test('progressive demand: removing a stable NG reschedules the now-required details',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'search'});h.config.ngTags.add('blocked');h.config.ngTitles.add('synthetic');
 h.request();assert.equal(h.calls.length,0);h.config.ngTitles.clear();await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.length,1);h.request.dispose();
});
test('progressive demand: explicit detail expansion still fetches on a filtered movie',async()=>{
 const h=await setup();h.config.ngTitles.add('synthetic');h.request();assert.equal(h.calls.length,0);
 h.movie.requestDetails();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);h.request.dispose();
});
test('progressive demand: unresolved NOT never turns into a definite rejection',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'search'});
 h.config.advancedNgRulesEnabled.value=true;h.config.advancedNgRulesJson.value=JSON.stringify([{expression:group('OR',[condition('title','contains','absent'),condition('tag','contains','blocked')],true)}]);
 h.request();assert.equal(h.movie.ng,false);assert.equal(h.calls.length,1);h.request.dispose();
});
test('progressive demand: detail requests consult the pure SourcePlan instead of fetching unsupported fields',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'search'});
 let planned=0;const original=h.SourcePlan.planMovie;h.SourcePlan.planMovie=(...args)=>{planned++;return original(...args);};
 const required=h.MetadataReadiness.required;h.MetadataReadiness.required=()=>new Set(['likeCount']);
 h.request();assert.ok(planned>0);assert.equal(h.calls.length,0);
 h.MetadataReadiness.required=required;h.request.dispose();
});
