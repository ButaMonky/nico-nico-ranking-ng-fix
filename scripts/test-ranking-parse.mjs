// BRUSH-061: genre ranking cards nest the title link deeper than search cards.
// Offline: synthetic fixture with the ranking card structure, stubbed GM APIs.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const fixture = await readFile(new URL('../tests/fixtures/ranking-genre.html', import.meta.url), 'utf8');
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  for (const path of ['/ranking/genre/all', '/ranking/custom']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html', body:'<html><body></body></html>'}));
    await page.goto('http://nrn.test' + path);
    await page.setContent(fixture);
    await page.evaluate(() => {
      // AutoFill ON with a target below the card count: ranking must ignore both.
      window.GM_getValue = (k, d) => ({ngTags:'["ng-tag"]', autoFillEnabled:true, autoFillTargetCount:1})[k] ?? d;
      window.pageFetches = 0;
      window.fetch = () => { pageFetches++; return new Promise(() => {}) };
      window.GM_setValue = () => {};
      window.GM_xmlhttpRequest = o => {
        const id = o.url.split('/').pop(), tag = id.endsWith('2') ? 'ng-tag' : 'ok';
        setTimeout(() => o.onload({status:200, responseText:`<nicovideo_thumb_response status="ok"><thumb><title>${id}</title><description>d</description><tags><tag>${tag}</tag></tags><user_id>1</user_id><user_nickname>u</user_nickname></thumb></nicovideo_thumb_response>`}), 5);
        return {abort() {}};
      };
    });
    await page.addScriptTag({content:source});
    await page.waitForFunction(() => document.querySelectorAll('.nrn-parsed').length === 3
      && [...document.querySelectorAll('.nrn-parsed')].every(c => c.classList.contains('nrn-thumb-info-done')), null, {timeout:5000});
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.nrn-hide')].map(e => e.dataset.decorationVideoId));
    assert.deepEqual(hidden, ['sm91000002'], path);
    await page.waitForTimeout(500);
    const budget = await page.evaluate(() => ({
      overflow: document.querySelectorAll('.nrn-autofill-overflow').length,
      injected: document.querySelectorAll('[data-nrn-autofill="true"]').length,
      pageFetches,
      badge: document.getElementById('nrn-status-badge')?.textContent || '',
    }));
    assert.equal(budget.overflow, 0, path + ': target count must not hide native cards');
    assert.equal(budget.injected, 0, path); assert.equal(budget.pageFetches, 0, path);
    assert.match(budget.badge, /ランキングでは補充なし/, path);
    assert.deepEqual(errors, [], path);
    await page.close();
  }
  console.log('Ranking parse PASS: genre/custom ranking cards are parsed and NG-hidden; no target trimming or AutoFill on ranking.');
} finally { await browser.close(); }
