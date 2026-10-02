import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
// BRUSH-016: numeric metadata NG conditions. 0 is a known value; anything not
// observed stays undecided (null) under every operator, NOT, AND and OR.
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=v=>JSON.parse(JSON.stringify(v));
const cond=(field,operator,value,not=false)=>({kind:'condition',field,operator,value,not});
const group=(op,children,not=false)=>({kind:'group',op,children,not});
const FIELDS=['likeCount','viewCount','commentCount','mylistCount','durationSeconds'];
const OPS=['gt','gte','lt','lte','eq','neq','exists','notExists'];
async function setup(){
 const calls=[],context=vm.createContext({URL,queueMicrotask,console:{log(){}},GM_xmlhttpRequest:o=>{calls.push(o);return {abort(){}};},
  fetch:()=>{throw new Error('no fetch expected');}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfo,ThumbInfoListener,AdvancedNgRules,MetadataReadiness,SourcePlan,SearchItemAdapter}; })()',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
 const movies=new lib.Movies(config),movie=new lib.Movie('sm1','synthetic');movies.setIfAbsent([movie]);
 Object.assign(context,lib,{movies,config,gmXmlHttpRequest:()=>context.GM_xmlhttpRequest});
 const start=source.indexOf('    var recentDetails = new Map()'),end=source.indexOf('    var createModel =',start);
 const request=vm.runInContext(source.slice(start,end)+'; createThumbInfoRequester',context)(movies,{sort:()=>[{movie}]});
 const rules=(...expressions)=>{config.advancedNgRulesEnabled.value=true;config.advancedNgRulesJson.value=JSON.stringify(expressions.map(expression=>({expression})));};
 return {...lib,config,movies,movie,calls,request,rules,search:lib.ThumbInfoListener.forSearch(movies),
  state:node=>lib.AdvancedNgRules.evaluateState(movie,node)};
}
test('numeric NG: fields exist with the shared operator set and are not detail-demand fields',async()=>{
 const h=await setup(),M=h.AdvancedNgRules.FIELD_META;
 assert.deepEqual(FIELDS.map(f=>M[f].label),['いいね数','再生数','コメント数','マイリスト数','動画時間（秒）']);
 for(const f of FIELDS){assert.deepEqual([...M[f].operators].sort(),[...OPS].sort(),f);assert.equal(M[f].type,'number');
  assert.equal(f in h.MetadataReadiness.ruleFields,false,f+' must not be a detail requirement');}
 assert.equal('registeredAtMs' in M,false,'registration time is not part of BRUSH-016');
});
test('numeric NG: known 0 and unknown are distinct under every operator',async()=>{
 for(const f of FIELDS){
  const zero=await setup();zero.movie.observeSearchFields({[f]:0},'search');
  const unknown=await setup();
  const expectZero={gt:false,gte:true,lt:false,lte:true,eq:true,neq:false,exists:true,notExists:false};
  for(const op of OPS){
   assert.equal(zero.state(cond(f,op,'0')),expectZero[op],f+' 0 '+op);
   assert.equal(unknown.state(cond(f,op,'0')),null,f+' unknown '+op);
   assert.equal(unknown.state(cond(f,op,'0',true)),null,f+' unknown NOT '+op);
  }
 }
});
test('numeric NG: 1, large safe integers and comparisons against known values',async()=>{
 const h=await setup(),big=Number.MAX_SAFE_INTEGER;
 h.movie.observeSearchFields({likeCount:1,viewCount:big,commentCount:12,mylistCount:3,durationSeconds:3600},'search');
 assert.equal(h.state(cond('likeCount','eq','1')),true);assert.equal(h.state(cond('likeCount','gt','0')),true);assert.equal(h.state(cond('likeCount','lt','1')),false);
 assert.equal(h.state(cond('viewCount','eq',String(big))),true);assert.equal(h.state(cond('viewCount','gte',big)),true);assert.equal(h.state(cond('viewCount','lt','100')),false);
 assert.equal(h.state(cond('commentCount','neq','12')),false);assert.equal(h.state(cond('mylistCount','lte','3')),true);
 assert.equal(h.state(cond('durationSeconds','gt','600')),true);assert.equal(h.state(cond('durationSeconds','lt','3600')),false);
});
test('numeric NG: null, missing, invalid, negative and fractional observations stay unknown',async()=>{
 for(const value of [null,undefined,'5','0',-1,1.5,NaN,Infinity,2**53,true,{}]){
  const h=await setup();h.movie.observeSearchFields({likeCount:value},'search');
  assert.equal(h.movie.metadata.likeCount,'unknown',String(value));
  for(const op of OPS)assert.equal(h.state(cond('likeCount',op,'0')),null,String(value)+' '+op);
 }
 const h=await setup();h.movie.observeSearchFields({likeCount:4},'search');
 h.movie.likeCount=-3;assert.equal(h.state(cond('likeCount','exists')),null,'a corrupted value is not trusted');
 h.movie.likeCount=4;h.movie.metadata.likeCount='unknown';assert.equal(h.state(cond('likeCount','eq','4')),null,'status, not the raw property, decides');
});
test('numeric NG: thresholds must be plain non-negative integers; others leave the condition undecided',async()=>{
 const h=await setup();h.movie.observeSearchFields({likeCount:1000},'search');
 for(const bad of ['1e3','1.5','-1','Infinity','NaN','','abc','0x10',' ',null,undefined,1.5,-1,NaN,Infinity,String(2**53)]){
  assert.equal(h.state(cond('likeCount','eq',bad)),null,String(bad));
  assert.equal(h.state(cond('likeCount','eq',bad,true)),null,'NOT '+String(bad));
  assert.equal(h.AdvancedNgRules.numericThreshold(bad),null,String(bad));
 }
 assert.equal(h.state(cond('likeCount','eq','1000')),true);assert.equal(h.state(cond('likeCount','eq',1000)),true);
 assert.equal(h.state(cond('likeCount','eq',' 1000 ')),true,'surrounding spaces are not a different number');
 assert.equal(h.state(cond('likeCount','exists','junk')),true,'value-less operators ignore the value');
});
test('numeric NG: AND / OR / NOT / neq / notExists never match on an unknown count',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'s'});
 const u=cond('likeCount','eq','0');
 const cases=[
  [cond('likeCount','neq','0'),null],[cond('likeCount','notExists'),null],[group('AND',[u],true),null],
  [group('AND',[cond('userId','eq',12),u]),null],[group('AND',[cond('userId','eq',99),u]),false],
  [group('OR',[cond('userId','eq',12),u]),true],[group('OR',[cond('userId','eq',99),u]),null],
  [group('OR',[cond('userId','eq',99),u],true),null],[group('AND',[cond('userId','eq',99),u],true),true]];
 for(const [node,expected] of cases)assert.equal(h.state(node),expected,JSON.stringify(node));
 h.rules(cond('likeCount','neq','0'),group('AND',[u],true),cond('viewCount','notExists'));assert.equal(h.movie.ng,false);
 h.movie.observeSearchFields({likeCount:0},'search');assert.equal(h.movie.ng,false,'known 0: neq 0 and NOT (=0) are false, viewCount stays unknown');
 h.movie.observeSearchFields({likeCount:5},'search');assert.equal(h.movie.ng,true,'a newer known count re-evaluates the rule');
});
test('numeric NG: Snapshot gap is unknown, a server-response 0 is a known 0',async()=>{
 const h=await setup(),A=h.SearchItemAdapter;
 assert.equal(A.count(null),null);assert.equal(A.count(undefined),null);assert.strictEqual(A.count(0),0);
 h.movie.observeSearchFields({likeCount:A.count(null),viewCount:A.count(0),durationSeconds:A.count(undefined)},'search');
 assert.equal(h.movie.metadata.likeCount,'unknown');assert.equal(h.movie.metadata.viewCount,'known');assert.strictEqual(h.movie.viewCount,0);
 assert.equal(h.state(cond('likeCount','eq','0')),null);assert.equal(h.state(cond('viewCount','eq','0')),true);
 assert.equal(h.state(cond('durationSeconds','lt','60')),null);
});
test('numeric NG: trace and explain report state, source, actual and result',async()=>{
 const h=await setup();h.search('sm1',{type:'user',id:12,name:'s'});const at=Date.now()-1000;
 h.movie.observeSearchFields({likeCount:0},'search',at);
 const trace=[];h.AdvancedNgRules.evaluateState(h.movie,group('AND',[cond('likeCount','eq','0'),cond('viewCount','gt','10')]),trace,0);
 const [like,view]=plain(trace).filter(t=>t.kind==='condition');
 assert.deepEqual([like.state,like.source,like.actual,like.result],['known','search',0,true]);
 assert.deepEqual([view.state,view.source,view.result],['unknown',null,null]);assert.equal(view.actual.__notReady,true);
 const report=plain(h.AdvancedNgRules.explain(h.movie,JSON.stringify([{id:'a',name:'zero likes',expression:cond('likeCount','eq','0')},
  {id:'b',name:'views',expression:cond('viewCount','gt','10')},{id:'c',name:'bad',expression:cond('likeCount','eq','1.5')}])));
 assert.deepEqual(report.map(r=>[r.id,r.result,r.waitingFor]),[['a',true,[]],['b',null,['viewCount']],['c',null,[]]]);
 assert.deepEqual({...h.AdvancedNgRules.fieldOrigin(h.movie,'likeCount')},{state:'known',source:'search'});
});
test('numeric NG: numeric-only rules add no getthumbinfo, nicoad, Snapshot or advertiser demand',async()=>{
 const numeric=[cond('likeCount','lt','5'),group('AND',[cond('viewCount','gte','100')],true),cond('durationSeconds','notExists'),
  group('OR',[cond('commentCount','eq','0'),cond('mylistCount','neq','2')])];
 for(const counts of [{},{likeCount:0,viewCount:3,commentCount:0,mylistCount:2,durationSeconds:30}]){
  const base=await setup(),withRules=await setup();
  for(const h of [base,withRules]){h.search('sm1',{type:'user',id:12,name:'s'});h.movie.observeSearchFields(counts,'search');}
  withRules.rules(...numeric);
  for(const h of [base,withRules]){h.request();h.request();}
  assert.equal(withRules.calls.length,base.calls.length,JSON.stringify(counts));assert.equal(withRules.calls.length,0);
  const need=withRules.MetadataReadiness.required(withRules.movie,withRules.config);
  // Only the usual owner-row identity (or nothing once a rule already matched).
  assert.ok([...need].every(f=>f==='ownerId'||f==='ownerType'),JSON.stringify([...need]));
  for(const f of FIELDS)assert.equal(need.has(f),false,f);
  assert.deepEqual({...withRules.MetadataReadiness.ownerDemand(withRules.movie,withRules.config)},{id:false,name:false},'no owner supplement (nicoad / Snapshot)');
  assert.equal(withRules.MetadataReadiness.ready(withRules.movie,withRules.config),true,'unknown counts never block settlement');
  assert.equal(withRules.movie.metadataSettled,true);
  const plan=plain(withRules.SourcePlan.planMovie(withRules.movie,withRules.config,{available:['detail']}));
  assert.equal(plan.requests.detail,undefined,'SourcePlan does not choose detail for numeric fields');
 }
 // Advertiser lookups are only for selfAd fields; numeric rules never mention them.
 const h=await setup();h.rules(...numeric);
 assert.equal(/selfAd/.test(h.config.advancedNgRulesJson.value),false);
});
