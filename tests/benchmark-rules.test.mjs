import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const script=fileURLToPath(new URL('../scripts/benchmark-rules.mjs',import.meta.url));
const run=args=>spawnSync(process.execPath,[script,'--iterations','120','--samples','1',...args],{encoding:'utf8',cwd:tmpdir(),timeout:20000});
test('benchmark: published baseline exists in this repository and results carry reproducible evidence',()=>{
 const result=run([]);assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout);assert.equal(data.format,'NRN-RULE-BENCHMARK-2');
 assert.equal(data.baselineCommit,'0d23473200ecb9aeb43ad79bcc8f3e1e90ee4922');
 assert.equal(data.iterations,120);assert.equal(data.sampleCount,1);
 assert.match(data.sourceHashes.before,/^[a-f0-9]{64}$/);assert.match(data.sourceHashes.after,/^[a-f0-9]{64}$/);
 assert.ok(data.scenarios.length>=2);assert.match(data.scope,/CPU only/);
 for(const scenario of data.scenarios){assert.equal(scenario.before.matches,scenario.after.matches);assert.equal(scenario.before.samplesMs.length,1);assert.ok(scenario.after.medianMs>=0);}
});
test('benchmark: missing historical ref fails explicitly, without silently choosing another baseline',()=>{
 const result=run(['--baseline','ffffffffffffffffffffffffffffffffffffffff']);
 assert.notEqual(result.status,0);assert.match(result.stderr,/baseline/i);
});
test('benchmark: invalid or unbounded CLI parameters are rejected',()=>{
 for(const args of [['--iterations','NaN'],['--samples','0'],['--baseline','--all'],['--unknown']]){
  const result=run(args);assert.notEqual(result.status,0,JSON.stringify(args));assert.match(result.stderr,/invalid|unknown/i);
 }
});
