import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { baseline, build, expectedHash, verify, sourceParts, root, output, metaOutput } from '../scripts/build.mjs';

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
    const source = Buffer.concat(await Promise.all(sourceParts.map(part => readFile(join(root,part)))));
    assert.deepEqual(first.subarray(0, source.length), source);
    const appendix = first.subarray(source.length).toString('utf8');
    assert.ok(appendix.split(/\r?\n/).every(line => !line || line.startsWith('//')));
    const plainNotices = appendix.replace(/^\/\/ ?/gm, '');
    const notices = JSON.parse(await readFile(join(root, 'vendor/third-party-manifest.json'), 'utf8'));
    for (const path of ['LICENSE', ...notices.map(entry => entry.path)]) {
      const expected = (await readFile(join(root, path), 'utf8')).split(/\r?\n/).map(line => line.trimEnd()).join('\n');
      assert.ok(plainNotices.includes(expected), `Complete license text missing: ${path}`);
    }
    const metadata = bytes => bytes.toString('utf8').match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)[0];
    const unchanged = text => text.split(/\r?\n/).filter(line => !/\/\/ @(?:version|author|contributor|description|license|updateURL|downloadURL|homepageURL|supportURL)\s/.test(line) && !/\/\/ @grant\s+unsafeWindow/.test(line)).join('\n');
    assert.equal(unchanged(metadata(first)), unchanged(metadata(original)));
    assert.match(metadata(first), /@version\s+160\.27/);
    await build(baseline, destination);
    assert.deepEqual(await readFile(destination), first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('stable distribution keeps identity, enables only the project GitHub update channel and includes dependency permissions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nrn-distribution-test-'));
  try {
    const destination = join(dir, 'manual.user.js');
    await build(baseline, destination);
    const text = await readFile(destination, 'utf8');
    const header = text.match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)[0];
    assert.match(header, /^\/\/ @name\s+Nico Nico Ranking NG$/m);
    assert.match(header, /^\/\/ @namespace\s+http:\/\/userscripts.org\/users\/121129$/m);
    assert.match(header, /^\/\/ @author\s+ButaMonky$/m);
    assert.match(header, /^\/\/ @contributor\s+kengo321 \(original\)$/m);
    assert.match(header, /^\/\/ @version\s+160\.27$/m);
    assert.match(header, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/ButaMonky\/nico-nico-ranking-ng-fix\/refs\/heads\/master\/dist\/nico-nico-ranking-ng\.meta\.js$/m);
    assert.match(header, /^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/ButaMonky\/nico-nico-ranking-ng-fix\/refs\/heads\/master\/dist\/nico-nico-ranking-ng\.user\.js$/m);
    assert.doesNotMatch(header, /update\.greasyfork\.org|@require/);
    assert.match(header, /@supportURL\s+https:\/\/github.com\/ButaMonky\/nico-nico-ranking-ng-fix\/issues/);
    assert.match(header, /@homepageURL\s+https:\/\/github.com\/ButaMonky\/nico-nico-ranking-ng-fix\r?$/m);
    // A user installing just this file must receive the dependency terms too.
    assert.ok(text.includes('Redistributions of source code must retain the above copyright notice'));
    assert.ok(text.includes('Copyright (c) 2014 Arnout Kazemier'));
    assert.ok(text.includes('Copyright 2016 Tom Jenkinson'));
    assert.ok(text.includes('Copyright (c) 2020 Jxck'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('default build publishes the fixed user/meta filenames and an identical compatibility userscript', async () => {
  assert.equal(basename(output), 'nico-nico-ranking-ng.user.js');
  assert.equal(basename(metaOutput), 'nico-nico-ranking-ng.meta.js');
  await build();
  const current = await readFile(output);
  const compatibility = await readFile(join(root, 'dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js'));
  const meta = await readFile(metaOutput, 'utf8');
  assert.deepEqual(compatibility, current);
  assert.match(current.toString('utf8'), /@version\s+160\.27/);
  const header = current.toString('utf8').match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)[0];
  assert.equal(meta.trimEnd(), header.trimEnd(), 'meta.js is metadata only and exactly matches the installable script header');
  assert.doesNotMatch(meta, /d3-dsv|NRN_VERSION|\(function/);
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
