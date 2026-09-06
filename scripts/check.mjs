import { spawnSync } from 'node:child_process';
import { baseline, output } from './build.mjs';

for (const path of [baseline, output]) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${path}`);
}
console.log('Syntax PASS: baseline and dist (neither executed).');
