import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
const source=await readAutoFillSource(),a=source.indexOf('      var chooseDetailBatchSize ='),b=source.indexOf('      var cacheKeyForMovie =',a);
function policy({rate=null,visible=4,rows=Array.from({length:4},(_,i)=>({id:'sm'+i,title:'KEEP'})),max=48}={}){
 const context={lastAcceptanceRate:rate,originalMovieIds:new Set(rows.map(x=>x.id)),visibleOriginalCount:()=>visible,
  CandidateFilter:{reason:item=>item.title==='DROP'?'title':null},model:{movies:new Map(rows.map(x=>[x.id,x])),config:{autoFillDetailBatchMax:{value:max}}}};
 return vm.runInNewContext(source.slice(a,b)+';chooseDetailBatchSize',context);
}
test('adaptive batch: no shortage makes no work; invalid shortage is not coerced',()=>{
 const choose=policy();for(const n of [0,-1,NaN,Infinity,'3',null])assert.equal(choose(n),0,String(n));
});
test('adaptive batch: fully accepted candidates use exactly the shortage, without fixed surplus',()=>{
 const choose=policy({rate:1});for(const n of [1,2,4,12,40])assert.equal(choose(n),n);
});
test('adaptive batch: known rejection rate affects size but respects the configured cap',()=>{
 assert.equal(policy({rate:.5})(4),8);assert.equal(policy({rate:.1})(4),40);
 assert.equal(policy({rate:0,max:16})(12),16);assert.equal(policy({rate:.5,max:8})(12),8);
});
test('adaptive batch: initial cheap rejects do not penalize acceptance of the remaining candidates twice',()=>{
 const rows=Array.from({length:8},(_,i)=>({id:'sm'+i,title:i<2?'DROP':'KEEP'}));
 assert.equal(policy({rows,visible:6})(6),6);
 assert.equal(policy({rows:rows.map(x=>({...x,title:'DROP'})),visible:0})(12),12);
});
test('adaptive batch: unknown rates have a bounded fallback and positive shortages always make progress',()=>{
 const choose=policy({rows:[],visible:0,max:24});assert.ok(choose(2)>=2);assert.ok(choose(2)<=24);
 for(const rate of [null,0,.01,.3,1,2,NaN])for(const n of [1,4,100]){
  const value=policy({rate,max:16})(n);assert.ok(Number.isSafeInteger(value)&&value>=1&&value<=16);
 }
});
