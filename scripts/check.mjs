import { Script } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { baseline, output } from './build.mjs';

for (const path of [baseline, output]) {
  new Script(await readFile(path,'utf8'), {filename:path});
}
console.log('Syntax PASS: baseline and dist (neither executed).');
