import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
// BRUSH-037: Rule Editor validation, description and JSON compatibility for numeric conditions.
const source=await readFile(output,'utf8');
const end=source.indexOf('  var NicoPage = (function() {');
function load(){
 const context=vm.createContext({URL,queueMicrotask,console:{log(){},warn(){}},setTimeout,clearTimeout});
 return vm.runInContext(source.slice(0,end)+'return {RuleEditor,AdvancedNgRules,ConfigDialog}; })()',context);
}
const cond=(field,operator,value,not=false)=>({kind:'condition',field,operator,value,not});
const rule=(expression,extra={})=>({id:'r1',name:'n',enabled:true,expression,...extra});
const FIELDS=['viewCount','likeCount','commentCount','mylistCount','durationSeconds'];
test('rule editor: numeric thresholds accept plain non-negative integers only',()=>{
 const {RuleEditor:R}=load();
 for(const f of FIELDS){
  for(const ok of ['0','1','00012',' 7 ',String(Number.MAX_SAFE_INTEGER),0,42])assert.deepEqual([...R.validate([rule(cond(f,'gte',ok))])],[],f+' '+ok);
  for(const bad of ['1e3','1.5','-1','Infinity','NaN','abc','0x10','+3',String(2**53),1.5,-1,Infinity])
   assert.equal(R.validate([rule(cond(f,'gte',bad))]).length,1,f+' '+bad);
  assert.equal(R.validate([rule(cond(f,'eq',''))]).length,1,'empty value');
  assert.deepEqual([...R.validate([rule(cond(f,'exists',''))])],[],'exists needs no value');
  assert.deepEqual([...R.validate([rule(cond(f,'notExists',undefined))])],[]);
 }
 // Existing numeric fields keep their own rules (unchanged behaviour).
 assert.equal(R.validate([rule(cond('lockedTagCount','gte','12'))]).length,1);
 assert.deepEqual([...R.validate([rule(cond('pageContributorCount','gte','2'))])],[]);
});
test('rule editor: new fields live in one group and describe like other conditions',()=>{
 const {RuleEditor:R,AdvancedNgRules:A}=load();
 const friendly=(field,op)=>A.OP_META[op].label;
 assert.equal(R.describe(cond('likeCount','lt','10'),friendly),'いいね数：未満（<）「10」');
 assert.equal(R.describe(cond('durationSeconds','gte','600',true),friendly),'【当てはまらない】動画時間（秒）：以上（≥）「600」');
 for(const f of FIELDS)assert.ok(A.FIELD_META[f].label);
});
test('rule editor: saved JSON keeps its shape; old rules load and save unchanged',()=>{
 const {AdvancedNgRules:A}=load();
 const old=[{id:'a',name:'old',enabled:true,expression:{kind:'group',op:'AND',not:false,children:[cond('title','contains','実況'),cond('lockedTagCount','gte',11)]}},
  {id:'b',name:'legacy v11',enabled:false,conditions:[{type:'titleContains',value:'x'}]}];
 const once=JSON.stringify(A.parse(JSON.stringify(old)));assert.equal(JSON.stringify(A.parse(once)),once,'load -> save -> load is stable');
 const mixed=[{id:'c',name:'numeric',enabled:true,expression:{kind:'group',op:'OR',not:true,children:[cond('likeCount','lt','5'),cond('viewCount','exists','')]}}];
 assert.deepEqual(JSON.parse(JSON.stringify(A.parse(JSON.stringify(mixed)))),mixed,'numeric conditions round-trip exactly');
 const parsedOld=JSON.parse(once);assert.equal(parsedOld[0].expression.children[1].value,11);assert.equal(parsedOld[1].expression.children[0].field,'title');
});
test('rule editor: the hand-made test sample treats blank numbers as unknown, not 0',()=>{
 const {AdvancedNgRules:A}=load();
 const sample={id:'sm1',title:'t',thumbInfoDone:true,error:{type:'NO_ERROR'},tags:[],contributor:{type:'user',id:1,name:'n'},likeCount:null,viewCount:0};
 assert.equal(A.evaluateState(sample,cond('likeCount','eq','0')),null);
 assert.equal(A.evaluateState(sample,cond('likeCount','eq','0',true)),null);
 assert.equal(A.evaluateState(sample,cond('viewCount','eq','0')),true);
 assert.deepEqual({...A.fieldOrigin(sample,'viewCount')},{state:'known',source:null});
 assert.deepEqual({...A.fieldOrigin(sample,'likeCount')},{state:'unknown',source:null});
 sample.likeCount=-1;assert.equal(A.evaluateState(sample,cond('likeCount','exists')),null);
});
// BRUSH-036: the test panel tells match, no match, pending (not fetched) and pending (failed) apart.
test('rule editor: verdict separates match, no match, pending-unknown and pending-failed',()=>{
 const {RuleEditor:R}=load();
 const base={id:'sm1',title:'ゲーム実況',description:'',thumbInfoDone:true,error:{type:'NO_ERROR'},tags:[{name:'ゲーム',lock:false}],contributor:{type:'user',id:1,name:'n'}};
 const tag=cond('tag','contains','ゲーム'),likes=cond('likeCount','gte','10');
 assert.equal(R.verdict({...base},tag).outcome,'match');
 assert.equal(R.verdict({...base},cond('tag','contains','x')).outcome,'noMatch');
 assert.equal(R.verdict({...base,thumbInfoDone:false},tag).outcome,'unknown');
 assert.equal(R.verdict({...base,error:{type:'NETWORK'}},tag).outcome,'failed');
 assert.equal(R.verdict({...base,likeCount:null},likes).outcome,'unknown');
 assert.equal(R.verdict({...base,error:{type:'NETWORK'},likeCount:null},{kind:'group',op:'AND',not:false,children:[tag,likes]}).outcome,'failed','any failed input makes the pending reason "failed"');
 assert.equal(R.verdict({...base,error:{type:'NETWORK'}},{kind:'group',op:'OR',not:false,children:[cond('title','contains','実況'),tag]}).outcome,'match','a decided OR is not pending');
 assert.deepEqual({...R.outcomeText},{match:'一致',noMatch:'不一致',unknown:'判定保留（未取得）',failed:'判定保留（取得失敗）'});
});
