import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './build.mjs';

const output=execFileSync(process.execPath,['scripts/benchmark-autofill.mjs','--scenario','all'],{
  cwd:root,encoding:'utf8',timeout:70000,maxBuffer:8*1024*1024
});
const result=JSON.parse(output);
const scenarios=new Map(result.scenarios.map(s=>[s.name,s]));
const expected={
  tag:{dom:14,injected:6,detail:18,page:1},
  lock:{dom:14,injected:6,detail:18,page:1},
  compound:{dom:16,injected:8,detail:18,page:2},
  owner:{dom:18,injected:10,detail:0,page:1}
};
for(const [name,limit] of Object.entries(expected)){
  const scenario=scenarios.get(name);
  assert.ok(scenario,name+' scenario exists');
  for(const run of scenario.runs){
    assert.equal(run.state.domCards,limit.dom,name+' '+run.cache+' pre-DOM staging DOM budget');
    assert.equal(run.state.injectedCards,limit.injected,name+' '+run.cache+' injected DOM budget');
    assert.ok(run.wire.detailRequests<=limit.detail,name+' '+run.cache+' cannot add detail requests');
    assert.ok(run.wire.pageRequests<=limit.page,name+' '+run.cache+' cannot add page requests');
    assert.equal(run.wire.otherRequests,0,name+' '+run.cache+' cannot add other transport');
  }
}
const replayOutput=execFileSync(process.execPath,[
  'scripts/benchmark-autofill.mjs','--scenario','tag','--exercise-settings'
],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
const replay=JSON.parse(replayOutput).scenarios[0];
for(const run of replay.runs){
  assert.deepEqual(run.settingsReplay.allowedIds,Array.from({length:12},(_,i)=>'sm'+(i+1)),
    'tag unblock restores parked candidates in original order');
  assert.equal(run.settingsReplay.detailRequestsAfter,run.settingsReplay.detailRequestsBefore,
    'tag unblock/reblock reuses staged detail without another request');
}
console.log('AutoFill authoritative detail staging PASS: detail/cache NG stays out of DOM; search-owner guard, request budgets and setting replay are preserved. Offline only.');
