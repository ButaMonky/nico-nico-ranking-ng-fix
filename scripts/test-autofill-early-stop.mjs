import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './build.mjs';
for(const mode of ['target','disabled']){
 const text=execFileSync(process.execPath,['scripts/benchmark-autofill.mjs','--scenario','none','--exercise-stop',mode],{cwd:root,encoding:'utf8',timeout:19000,maxBuffer:4*1024*1024});
 const data=JSON.parse(text);
 for(const run of data.scenarios[0].runs){
  assert.equal(run.earlyStop.state.domCards,8,'no new cards after stopping');
  assert.equal(run.earlyStop.wire.aborted,1,'pending page transport is actually cancelled');
  assert.equal(run.earlyStop.wire.detailRequests,0);
  assert.deepEqual(run.wire.pageNumbers,[2,2],'resuming retries the same physical page');
  assert.deepEqual(run.state.ids,Array.from({length:12},(_,i)=>'sm'+(i+1)));
 }
}
console.log('AutoFill early-stop PASS: target reduction and disable cancel pending source work, preserve cursors, resume in order; cold/warm offline browser.');
