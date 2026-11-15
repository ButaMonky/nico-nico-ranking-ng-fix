// BRUSH-074: the unified NGルール list (first settings tab). Offline.
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const exportsSource = source.slice(0, source.indexOf('  var NicoPage = (function() {')) + 'window.api = {ConfigDialog,Config,NgVerdictCache,NgRuleList}; })()';
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  const page = await browser.newPage({viewport:{width:1100, height:1300}}), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(5000);
  await page.route('**/*', r => r.fulfill({body:'', contentType:'text/html'}));
  await page.goto('http://nrn.test/tag/x');
  await page.addScriptTag({content:exportsSource});
  const html = await page.evaluate(() => api.ConfigDialog.SRCDOC);
  await page.evaluate(html => { const f = document.createElement('iframe'); f.id = 'settings'; f.style = 'width:100%;height:1250px;border:0'; f.srcdoc = html; document.body.append(f) }, html);
  const frame = page.frameLocator('#settings');
  await frame.locator('#ngRuleListHost').waitFor({state:'attached'});
  await page.evaluate(async () => {
    const rules = [
      {id:'r-scope', name:'淫夢以外での巻き込み防止', enabled:true, expression:{kind:'group', op:'AND', not:false, children:[
        {kind:'condition', field:'lockedTagCount', operator:'gte', value:11, not:false},
        {kind:'condition', field:'tag', operator:'contains', value:'ホモ', not:false},
        {kind:'condition', field:'pageKind', operator:'neq', value:'ranking', not:false}]}},
      {id:'r-title', name:'中国で学ぶ系', enabled:false, expression:{kind:'group', op:'AND', not:false, children:[
        {kind:'group', op:'OR', not:false, children:[{kind:'condition', field:'title', operator:'contains', value:'みる', not:false}, {kind:'condition', field:'title', operator:'contains', value:'学ぶ', not:false}]},
        {kind:'condition', field:'title', operator:'contains', value:'中国', not:false}]}}];
    const saved = new Map([['ngTags', '["ゲーム実況"]'], ['ngUserIds', JSON.stringify([{value:123, text:'投稿者A'}])], ['ngTitles', '["ネタバレ"]'],
      ['ngLockedTagCountEnabled', true], ['ngLockedTagCountThreshold', 11], ['advancedNgRulesEnabled', true], ['advancedNgRulesJson', JSON.stringify(rules)],
      ['ngVerdictCache', JSON.stringify({v:2, b:{'t:ゲーム実況':'sm1 sm2 sm3', 'u:123':'sm4'}})]]);
    const get = (k, d) => saved.has(k) ? saved.get(k) : d, set = (k, v) => saved.set(k, v);
    window.saved = saved;
    window.config = new api.Config(get, set); await config.sync();
    config._nrnRulePreviewMovies = () => [
      {id:'sm10', title:'ゲーム実況 1', tags:[{name:'ゲーム実況', lock:true}, {name:'RTA', lock:false}], contributor:{type:'user', id:5, name:'B'}},
      {id:'sm11', title:'料理', tags:[{name:'料理', lock:false}], contributor:{type:'user', id:6, name:'C'}}];
    await api.NgVerdictCache.attach(config, get, set, document).ready;
    window.dialog = new api.ConfigDialog(config, document.querySelector('#settings').contentDocument, () => {});
  });
  const rows = async () => (await frame.locator('.nr-row .nr-text').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  const texts = await rows();
  assert.equal(texts.length, 6, 'tag + owner + title + lock count + 2 compound rules');
  assert.ok(texts.includes('タグ「ゲーム実況」がある動画を隠す'));
  assert.ok(texts.includes('投稿者「投稿者A」（ID 123）の動画を隠す'));
  assert.ok(texts.includes('ロックされたタグが個以上ある動画を隠す'), 'lock-count row (number is an input)');
  assert.ok(texts.some(t => t.includes('淫夢以外での巻き込み防止') && t.includes('『ロックされたタグが11個以上、かつタグ「ホモ」がある、かつ見ている画面がランキングではない』に当てはまる動画を隠す')), texts.join('\n'));
  assert.ok(texts.some(t => t.includes('『（タイトルに「みる」を含む、またはタイトルに「学ぶ」を含む）、かつタイトルに「中国」を含む』に当てはまる動画を隠す')), texts.join('\n'));
  // Counts: from memory; context rule shows 記憶なし; first row has the most.
  const counts = await frame.locator('.nr-row .nr-count').allTextContents();
  assert.equal(counts[0], '3件', 'sorted by hidden count');
  assert.ok(counts.includes('記憶なし'));
  // Pause a one-condition rule: leaves the fast list, kept as paused; resume returns it.
  const tagRow = frame.locator('.nr-row', {hasText:'タグ「ゲーム実況」がある'});
  await tagRow.getByRole('switch').click();
  await page.waitForFunction(() => !config.ngTags.array.length && JSON.parse(config.pausedNgEntriesJson.value).length === 1);
  await frame.locator('.nr-row.paused', {hasText:'ゲーム実況'}).getByRole('switch').click();
  await page.waitForFunction(() => config.ngTags.array.join() === 'ゲーム実況' && JSON.parse(config.pausedNgEntriesJson.value).length === 0);
  // Compound toggle writes rule.enabled.
  await frame.locator('.nr-row', {hasText:'中国で学ぶ系'}).getByRole('switch').click();
  assert.equal(await page.evaluate(() => JSON.parse(config.advancedNgRulesJson.value).find(r => r.id === 'r-title').enabled), true);
  // Add: owner by URL, with a page-based preview.
  await frame.getByRole('button', {name:'＋ NGルールを追加'}).click();
  await frame.locator('.nr-kindbtn', {hasText:'投稿者・チャンネル'}).click();
  await frame.locator('.nr-form input[type=text]').fill('https://www.nicovideo.jp/user/5');
  assert.match(await frame.locator('.nr-preview').textContent(), /1件/);
  await frame.getByRole('button', {name:'追加する'}).click();
  await page.waitForFunction(() => config.ngUserIds.array.map(String).includes('5'));
  // Add a tag picked from this page's tags.
  await frame.getByRole('button', {name:'＋ NGルールを追加'}).click();
  await frame.locator('.nr-kindbtn', {hasText:'タグ'}).first().click();
  await frame.locator('.nr-suggest .nr-chip', {hasText:'RTA'}).click();
  await frame.getByRole('button', {name:'追加する'}).click();
  await page.waitForFunction(() => config.ngTags.array.includes('RTA'));
  // Filter chips.
  await frame.locator('.nr-chip', {hasText:/^組み合わせ/}).click();
  assert.equal((await rows()).length, 3, 'lock count + 2 compound rules');
  // 編集 opens the compound editor on that rule in the 詳しいNG設定 tab.
  await frame.locator('.nr-row', {hasText:'中国で学ぶ系'}).getByRole('button', {name:'編集'}).click();
  assert.equal(await frame.locator('[data-tab-panel=filter]').evaluate(e => e.classList.contains('active')), true);
  assert.equal(await frame.locator('.re-rule[aria-pressed=true]').textContent(), '使用 · 中国で学ぶ系');
  // New conditions exist in the editor's field list.
  const options = await frame.locator('select[aria-label="条件の項目"]').first().locator('option').allTextContents();
  for (const label of ['ジャンル', '見ている画面', '検索中の言葉・タグ']) assert.ok(options.includes(label), label);
  if (process.env.NRN_SHOT) {
    await frame.locator('.tabButton[data-tab=rules]').click();
    await frame.locator('.nr-chip', {hasText:/^すべて/}).click();
    await page.screenshot({path:process.env.NRN_SHOT, fullPage:false});
  }
  assert.deepEqual(errors, []);
  console.log('NG rule list PASS: sentences for every rule kind, memory counts, pause/resume, compound toggle, add owner by URL and tag from page, filters, edit opens editor, new fields listed.');
} finally { await browser.close(); }
