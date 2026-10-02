import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './build.mjs';
const output=execFileSync(process.execPath,['scripts/benchmark-autofill.mjs','--scenario','title90','--exercise-settings'],{cwd:root,encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024});
const result=JSON.parse(output),runs=result.scenarios[0].runs;
for(const run of runs){
 assert.ok(run.state.domCards<=20,'definite title-NG candidates must not create DOM cards');
 assert.ok(run.wire.detailRequests<=12,'stable NG, including initial cards, must not get unrelated details');
 assert.ok(run.settingsReplay,'setting change replay was exercised');
 assert.deepEqual(run.settingsReplay.allowedIds,Array.from({length:12},(_,i)=>'sm'+(i+1)));
 assert.deepEqual(run.settingsReplay.filteredIds,Array.from({length:12},(_,i)=>'sm'+((i+1)*10)));
}
console.log('AutoFill prefilter PASS: bounded DOM and details, original order, NG removal/reapply recovery, cold/warm cache. Offline only.');
