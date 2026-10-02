import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,sourceParts} from '../scripts/build.mjs';
import {autofillParts,readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
test('AutoFill source reader follows the actual build order, not a second hand-maintained manifest',async()=>{
 assert.deepEqual(autofillParts,sourceParts.filter(p=>p.startsWith('src/autofill/')));
 assert.ok(autofillParts.length>=8);assert.equal(new Set(autofillParts).size,autofillParts.length);
 const expected=Buffer.concat(await Promise.all(autofillParts.map(p=>readFile(resolve(root,p))))).toString('utf8');
 assert.equal(await readAutoFillSource(),expected);
});
test('AutoFill fragments retain one controller and all subsystem entry points',async()=>{
 const source=await readAutoFillSource();
 for(const marker of ['var setupAutoFill = function','var snapshotFetchOffset = async function','var fetchMoreCandidates = async function','var evaluateCandidateBatch = async function','var maybeFetchMore = async function','var runDeveloperSuite = async function','var initialize = async function']){
  assert.equal(source.split(marker).length,2,marker);
 }
 assert.equal(autofillParts[0],'src/autofill/legacy-controller.js');
 assert.equal(autofillParts.at(-1),'src/autofill/initialize.js');
});
