import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseline, build, expectedHash, verify, sourceParts, root } from '../scripts/build.mjs';

test('frozen baseline matches the approved fingerprint and manifest', async () => {
  const bytes = await readFile(baseline);
  assert.equal(verify(bytes), expectedHash);
  const manifest = JSON.parse(await readFile(new URL('../baseline/manifest.json', import.meta.url)));
  assert.equal(manifest.sha256, expectedHash);
  assert.equal(manifest.bytes, bytes.length);
});

test('build assembles approved source order and produces repeatable output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nrn-build-test-'));
  try {
    const destination = join(dir, 'result.user.js');
    const original = await readFile(baseline);
    await build(baseline, destination);
    const first = await readFile(destination);
    assert.deepEqual(first, Buffer.concat(await Promise.all(sourceParts.map(part => readFile(join(root,part))))));
    const metadata = bytes => bytes.toString('utf8').match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)[0];
    assert.equal(metadata(first).replace(/\/\/ @grant        unsafeWindow[\r\n]+/, '').replace(/@version[^\r\n]+/, '@version'), metadata(original).replace(/@version[^\r\n]+/, '@version'));
    assert.match(metadata(first), /@version\s+160\.16/);
    await build(baseline, destination);
    assert.deepEqual(await readFile(destination), first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('modified input is rejected before an existing output is overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nrn-negative-test-'));
  try {
    const altered = Buffer.from(await readFile(baseline));
    altered[altered.length - 1] ^= 1;
    const source = join(dir, 'altered.user.js');
    const destination = join(dir, 'result.user.js');
    await writeFile(source, altered);
    await writeFile(destination, 'sentinel');
    await assert.rejects(build(source, destination), /Baseline mismatch/);
    assert.equal(await readFile(destination, 'utf8'), 'sentinel');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
