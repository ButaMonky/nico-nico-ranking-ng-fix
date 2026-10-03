import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './build.mjs';

const output=execFileSync(process.execPath,
  ['scripts/benchmark-autofill.mjs','--scenario','numeric90'],
  {cwd:root,encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024});
const result=JSON.parse(output),runs=result.scenarios[0].runs;
const expected=Array.from({length:12},(_,i)=>'sm'+(i+116));
for(const run of runs){
  assert.deepEqual(run.state.ids,expected,'numeric prefilter must retain source order');
  assert.equal(run.wire.detailRequests,0,'search numeric rules must add no detail traffic');
  assert.equal(run.wire.otherRequests,0);
  assert.ok(run.state.domCards<=21,'known numeric NG candidates should be settled before DOM creation');
  assert.equal(run.state.visible,12);
}
console.log('AutoFill numeric prefilter PASS: search-known numeric NG settles before DOM with zero detail traffic and stable order. Offline only.');
