// BRUSH-064: the spec-change notice. A normal page shows nothing; a page whose
// card markup changed names the failing part. Offline, synthetic fixtures.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const ranking = await readFile(new URL('../tests/fixtures/ranking-genre.html', import.meta.url), 'utf8');
// Simulated site change: cards lose the attributes the script reads.
const changed = ranking.replaceAll('data-decoration-video-id', 'data-video-card').replaceAll('data-anchor-area="main"', 'data-area="main"');
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
const run = async (fixture, settings = {}) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.fulfill({contentType:'text/html', body:'<html><body></body></html>'}));
  await page.goto('http://nrn.test/ranking/genre/all');
  await page.setContent(fixture);
  await page.evaluate(settings => {
    window.GM_getValue = (k, d) => settings[k] ?? d;
    window.GM_setValue = () => {};
    window.GM_xmlhttpRequest = o => { setTimeout(() => o.onload({status:200, responseText:'<nicovideo_thumb_response status="ok"><thumb><title>t</title><description>d</description><tags><tag>ok</tag></tags><user_id>1</user_id><user_nickname>u</user_nickname></thumb></nicovideo_thumb_response>'}), 5); return {abort() {}} };
  }, settings);
  await page.addScriptTag({content:source});
  await page.waitForTimeout(6800);
  const notice = await page.evaluate(() => {
    const box = document.getElementById('nrn-health-notice');
    return box ? {ids:[...box.querySelectorAll('li')].map(li => li.dataset.healthId), title:box.querySelector('.nrn-health-title').textContent} : null;
  });
  return {page, notice, errors};
};
try {
  const ok = await run(ranking);
  assert.equal(ok.notice, null, 'healthy page: no notice'); assert.deepEqual(ok.errors, []);
  await ok.page.close();
  const bad = await run(changed);
  assert.ok(bad.notice, 'changed markup: notice shown');
  assert.deepEqual(bad.notice.ids, ['cards']);
  assert.match(bad.notice.title, /仕様が変わった可能性/);
  // Close hides it for this tab session.
  await bad.page.evaluate(() => [...document.querySelectorAll('#nrn-health-notice button')].find(b => b.textContent === '閉じる').click());
  assert.equal(await bad.page.evaluate(() => !!document.getElementById('nrn-health-notice')), false);
  await bad.page.close();
  const off = await run(changed, {siteHealthNoticeEnabled:false});
  assert.equal(off.notice, null, 'setting OFF: no notice');
  await off.page.close();
  console.log('Site health PASS: healthy page silent; changed card markup names "cards"; close and OFF respected.');
} finally { await browser.close(); }
