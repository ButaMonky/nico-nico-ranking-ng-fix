import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output,expectedHash} from '../scripts/build.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/ng-v14.1.json',import.meta.url)));
assert.equal(fixture.baselineSha256,expectedHash);
async function load(path){
  const source=await readFile(path,'utf8');
  const boundary='  var MovieViewMode = (function(_super) {';
  assert.equal(source.split(boundary).length,2);
  return vm.runInNewContext(source.slice(0,source.indexOf(boundary))+
    'return {Config,Movie,Movies,ThumbInfoListener,AdvancedNgRules}; })()',{}, {timeout:1000});
}
const condition=(field,operator,value,not=false)=>({kind:'condition',field,operator,value,not});
const group=(op,children,not=false)=>({kind:'group',op,children,not});
for(const [label,path] of [['baseline',baseline],['generated',output]]){
  test(`${label}: NG fixture states and shared contributor propagation`,async()=>{
    const {Config,Movie,Movies,ThumbInfoListener,AdvancedNgRules}=await load(path);
    const config=new Config((k,d)=>d,()=>{});
    await config.sync();
    const movies=new Movies(config);
    const complete=ThumbInfoListener.forCompleted(movies);
    const make=(id,title='普通の動画',count=0,contributor={type:'user',id:42,name:'author'})=>{
      const m=new Movie(id,title);movies.setIfAbsent([m]);
      complete({id,description:'',tags:Array.from({length:count},(_,i)=>({name:`tag${i}`,lock:true})),contributor});
      return m;
    };
    config.ngLockedTagCountThreshold.value=11;config.ngLockedTagCountEnabled.value=true;
    const ten=make('sm10','普通',10),eleven=make('sm11','普通',11);
    assert.deepEqual([ten.ng,eleven.ng],fixture.lock10and11);
    config.ngTitles.add('中国');
    const title=make('smTitle','中国について');
    assert.equal(title.ng,fixture.titleChina);
    const hundred=Array.from({length:100},(_,i)=>make(`smUser${i}`));
    assert.ok(hundred.every(m=>m.contributor===hundred[0].contributor));
    assert.equal(hundred.filter(m=>m.ng).length,fixture.userCounts[0]);
    config.ngUserIds.add('42');
    assert.equal(hundred.filter(m=>m.ng).length,fixture.userCounts[1]);
    config.ngUserIds.remove([42]);
    assert.equal(hundred.filter(m=>m.ng).length,fixture.userCounts[2]);
    const missing=make('smMissing','普通',0,{type:'unknown',id:-1,name:''});
    assert.equal(missing.ng,fixture.missingSimple);
    const pending=new Movie('smPending','中国について');movies.setIfAbsent([pending]);
    const absent=condition('userId','notExists','');
    const negated=condition('userId','exists','',true);
    const evaluate=(m,node)=>AdvancedNgRules.evaluateNode(m,node,[]);
    assert.deepEqual([evaluate(pending,absent),evaluate(missing,absent),evaluate(pending,negated)],fixture.missingStates);
    const failed=new Movie('smFailed','普通');movies.setIfAbsent([failed]);
    ThumbInfoListener.forErrorOccurred(movies)({id:failed.id,error:{type:'TEST_ERROR',message:'fixture'}});
    assert.deepEqual([failed.thumbInfoDone,evaluate(failed,absent)],fixture.failedStates);
    const a=condition('title','contains','中国'),b=condition('lockedTagCount','gte',11);
    const nodes=[group('AND',[a,b]),group('OR',[a,b]),group('AND',[a,group('OR',[b,condition('title','eq','中国について')])]),group('OR',[a,b],true)];
    assert.deepEqual(nodes.map(n=>evaluate(title,n)),fixture.logic);
    const rules=[{id:'locked',name:'locked',enabled:true,expression:b}];
    config.advancedNgRulesJson.value=JSON.stringify(rules);config.advancedNgRulesEnabled.value=true;
    assert.deepEqual(Array.from(eleven.advancedRuleMatches,m=>m.id),fixture.ruleMatches);
    assert.equal(AdvancedNgRules.match(eleven,false,JSON.stringify(rules),true).length,0);
  });
}
