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
 assert.equal(AdvancedNgRules.evaluateNode(m,condition('userId','notExists')),true);
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
