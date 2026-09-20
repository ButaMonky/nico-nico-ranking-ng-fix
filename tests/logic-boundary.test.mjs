import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const end=source.indexOf('  var MovieViewMode = (function(_super) {');
const {Movie,AdvancedNgRules,Config,Movies,ThumbInfoListener}=vm.runInNewContext(source.slice(0,end)+'return {Movie,AdvancedNgRules,Config,Movies,ThumbInfoListener}; })()');
const condition=(field,operator,value,not=false)=>({kind:'condition',field,operator,value,not});
const group=(op,children,not=false)=>({kind:'group',op,children,not});
test('generated: AND/OR/NOT truth tables retain uncertainty under nested NOT',()=>{
 const movie=new Movie('sm1','yes');
 const nodes=[condition('title','eq','yes'),condition('title','eq','no'),condition('tagCount','eq',0)];
 const tables={AND:[[true,false,null],[false,false,false],[null,false,null]],OR:[[true,true,true],[true,false,null],[true,null,null]]};
 assert.equal(AdvancedNgRules.evaluateNode(movie,group('AND',[group('OR',[])],true)),false);
 for(const op of ['AND','OR'])for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(const not of [false,true]){
  const expected=tables[op][a][b];
  const expr=group(op,[nodes[a],nodes[b]],not);
  assert.equal(AdvancedNgRules.evaluateNode(movie,expr),expected===null?false:not?!expected:expected);
  assert.equal(AdvancedNgRules.evaluateNode(movie,group('AND',[expr],true)),expected===null?false:not?expected:!expected);
 }
});
test('generated: NOT waits for details then updates the live Movie decision',()=>{
 const m=new Movie('sm1','title');
 const rule=group('AND',[condition('tag','contains','allowed')],true);
 m.updateAdvancedRulesConfig(true,[{id:'test',expression:rule}]);assert.equal(m.ng,false);
 m.tags=[{name:'allowed',lock:false,on(){}}];assert.equal(m.ng,false);
 m.setThumbInfoDone();assert.equal(m.ng,false);
 m.tags=[];assert.equal(m.ng,true);
 m.updateAdvancedRulesConfig(false,[]);assert.equal(m.ng,false);
});
test('generated: missing IDs and blank numeric operands are not numeric zero',()=>{
 const m=new Movie('sm1','title');m.setThumbInfoDone();
 for(const op of ['eq','lt','lte','gt','gte','neq'])assert.equal(AdvancedNgRules.evaluateNode(m,condition('userId',op,0)),false);
 assert.equal(AdvancedNgRules.evaluateNode(m,condition('userId','notExists')),false);
 assert.equal(AdvancedNgRules.evaluateNode(m,condition('tagCount','eq','')),false);
});
test('generated: failed metadata is undecided, a later successful response clears the error',async()=>{
 const config=new Config((k,d)=>d,()=>{});await config.sync();
 const movies=new Movies(config),m=new Movie('sm1','title');movies.setIfAbsent([m]);
 const rule=condition('tag','contains','allowed',true);
 m.updateAdvancedRulesConfig(true,[{expression:rule}]);
 ThumbInfoListener.forErrorOccurred(movies)({id:'sm1',error:{type:'NETWORK'}});
 assert.equal(m.ngByAdvancedRule,false);
 ThumbInfoListener.forCompleted(movies)({id:'sm1',description:'',tags:[],contributor:{type:'user',id:1,name:'user'}});
 assert.equal(m.error.type,'NO_ERROR');assert.equal(m.ngByAdvancedRule,true);
});

test('page contributor count stays undecided under NOT until the page is complete',()=>{
 const m=new Movie('sm1','title');
 const rule=condition('pageContributorCount','gte',3);
 assert.equal(AdvancedNgRules.evaluateNode(m,rule),false);
 assert.equal(AdvancedNgRules.evaluateNode(m,group('AND',[rule],true)),false);
 m.updateAdvancedRulesConfig(true,[{expression:rule}]);
 m.setPageContributorCount(3); assert.equal(m.ng,true);
 m.setPageContributorCount(2); assert.equal(m.ng,false);
 m.setPageContributorCount(null); assert.equal(AdvancedNgRules.evaluateNode(m,group('AND',[rule],true)),false);
});

test('cached rules never reuse a decision or expose mutable settings objects',()=>{
 const yes=new Movie('sm1','yes'), no=new Movie('sm2','no');
 const rules=JSON.stringify([{id:'a',expression:condition('title','eq','yes')}]);
 assert.equal(AdvancedNgRules.match(yes,true,rules).length,1);
 const editable=AdvancedNgRules.parse(rules);editable[0].expression.value='no';
 assert.equal(AdvancedNgRules.match(yes,true,rules).length,1);
 assert.equal(AdvancedNgRules.match(no,true,rules).length,0);
 assert.equal(AdvancedNgRules.match(yes,false,rules).length,0);
 const changed=JSON.stringify(editable);
 assert.equal(AdvancedNgRules.match(no,true,changed).length,1);
 assert.equal(AdvancedNgRules.match(yes,true,changed).length,0);
});

const {reasons}=vm.runInNewContext((await readFile(new URL('../src/ui/card-enhancements.js',import.meta.url),'utf8'))+'CardEnhancements',{AdvancedNgRules});
test('NG explanation keeps compound NOT readable without inventing a matching substring',()=>{
 const m=new Movie('sm1','safe');
 m.updateAdvancedRulesConfig(true,[{id:'negated',name:'除外条件',expression:condition('title','contains','blocked',true)}]);
 const r=reasons(m);
 assert.ok(r.labels[0].includes('除外条件'));
 assert.ok(r.labels[0].includes('blocked'));
 assert.equal(r.titleTerms.length,0);
 assert.equal(r.fields.has('title'),true);
});
