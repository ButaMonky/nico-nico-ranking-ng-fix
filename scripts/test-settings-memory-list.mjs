// BRUSH-071: the NG動画ID list in settings also shows every remembered NG
// video with its reason; removing a remembered entry removes it from memory
// only, and the counts appear on list entries. Offline.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const exportsSource = source.slice(0, source.indexOf('  var NicoPage = (function() {')) + 'window.api = {ConfigDialog,Config,NgVerdictCache}; })()';
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  const page = await browser.newPage({viewport:{width:1100, height:1200}}), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(5000);
  await page.route('**/*', r => r.fulfill({body:'', contentType:'text/html'}));
  await page.goto('http://nrn.test/settings');
  await page.addScriptTag({content:exportsSource});
  const html = await page.evaluate(() => api.ConfigDialog.SRCDOC);
  await page.evaluate(html => { const f = document.createElement('iframe'); f.id = 'settings'; f.style = 'width:100%;height:1100px;border:0'; f.srcdoc = html; document.body.append(f) }, html);
  const frame = page.frameLocator('#settings');
  await frame.locator('#target').waitFor({state:'attached'});
  await page.evaluate(async () => {
    const saved = new Map([['ngTags', '["FOO"]'], ['ngMovies', '["sm900"]'], ['ngTitles', '["BAR"]'],
      ['ngVerdictCache', JSON.stringify({v:2, b:{'t:FOO':'sm1 sm2', 'i:BAR':'sm3'}})]]);
    const get = (k, d) => saved.has(k) ? saved.get(k) : d, set = (k, v) => saved.set(k, v);
    window.saved = saved;
    window.config = new api.Config(get, set); await config.sync();
    await api.NgVerdictCache.attach(config, get, set, document).ready;
    window.dialog = new api.ConfigDialog(config, document.querySelector('#settings').contentDocument, () => {});
  });
 // BRUSH-074: the old NG list and the compound editor live in the 詳しいNG設定 tab.
 await frame.locator('.tabButton[data-tab=filter]').click();
  await frame.locator('#target').selectOption('ng-movie-id');
  const texts = await frame.locator('#list option').allTextContents();
  assert.equal(texts[0], 'sm900', 'manual NG video IDs first');
  assert.match(texts[1], /自動で記憶したNG動画 3 件/);
  assert.deepEqual(texts.slice(2).sort(), ['sm1　［タグ「FOO」］', 'sm2　［タグ「FOO」］', 'sm3　［タイトル「BAR」］'].sort());
  await frame.locator('#list').selectOption('mem:sm1');
  await frame.locator('#removeButton').click();
  assert.equal(await page.evaluate(() => api.NgVerdictCache.size), 2, 'removed from memory');
  assert.equal(await page.evaluate(() => config.ngMovies.array.join(',')), 'sm900', 'manual list untouched');
  assert.equal(await frame.locator('#list option[value="mem:sm1"]').count(), 0);
  await frame.locator('#target').selectOption('ng-tag');
  assert.deepEqual(await frame.locator('#list option').allTextContents(), ['FOO　（1件）'], 'per-entry count');
  assert.deepEqual(errors, []);
  console.log('Settings memory list PASS: remembered NG IDs listed with reasons under NG動画ID; removal hits memory only; per-entry counts.');
} finally { await browser.close(); }
