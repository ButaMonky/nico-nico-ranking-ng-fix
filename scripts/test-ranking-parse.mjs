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
  for (const path of ['/ranking', '/ranking/genre/all', '/ranking/custom']) {
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
    await page.waitForFunction(() => document.querySelectorAll('.nrn-parsed').length === 4
      && [...document.querySelectorAll('.nrn-parsed')].every(c => c.classList.contains('nrn-thumb-info-done')), null, {timeout:5000});
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.nrn-hide')].map(e => e.dataset.decorationVideoId || e.getAttribute('href')));
    // Sponsored slot (提供) is NG-checked like a card; 3 cards + 1 sponsored.
    assert.deepEqual(hidden, ['/watch/sm91000012', 'sm91000002'], path);
    await page.waitForTimeout(500);
    const budget = await page.evaluate(() => ({
      overflow: document.querySelectorAll('.nrn-autofill-overflow').length,
      injected: document.querySelectorAll('[data-nrn-autofill="true"]').length,
      pageFetches,
      badge: document.getElementById('nrn-status-badge')?.textContent || '',
    }));
    // BRUSH-066: settings bar lives in the sticky web header; NG count beside the checkbox.
    // BRUSH-067: full bar stays in the content area; only the NG toggle is
    // duplicated into the header slot. Both show the count and stay in sync.
    const bar = await page.evaluate(async () => {
      // BRUSH-073: placed right after the search block, not in the far-right slot.
      const toggle = document.getElementById('nrn-header-ng-toggle');
      const header = toggle && toggle.parentElement.matches('header') && toggle.previousElementSibling?.querySelector('form[role="search"]') ? toggle : null;
      const before = {barInHeader: !!document.querySelector('header #nrn-config-bar'), headerToggle: !!header,
        counts: [document.getElementById('nrn-ng-hidden-count')?.textContent, header?.querySelector('.nrn-ng-hidden-count')?.textContent]};
      header.querySelector('input').click();
      await new Promise(r => setTimeout(r, 50));
      return {...before, synced: document.getElementById('nrn-ng-movie-visible-checkbox').checked && header.querySelector('input').checked,
        shownNg: document.querySelectorAll('.nrn-is-ng:not(.nrn-hide)').length};
    });
    assert.deepEqual(bar, {barInHeader:false, headerToggle:true, counts:['（2件）','（2件）'], synced:true, shownNg:2}, path + ': header NG toggle');
    await page.evaluate(() => document.querySelector('#nrn-header-ng-toggle input').click());
    await page.waitForTimeout(50);
    assert.equal(budget.overflow, 0, path + ': target count must not hide native cards');
    assert.equal(budget.injected, 0, path); assert.equal(budget.pageFetches, 0, path);
    assert.match(budget.badge, /ランキングでは補充なし/, path);
    assert.deepEqual(errors, [], path);
    await page.close();
  }
  // BRUSH-065: custom ranking puts one sponsored card per category in a shared
  // row. Each must get its own root (one ▼, one owner row), read once.
  {
    const custom = await readFile(new URL('../tests/fixtures/ranking-custom.html', import.meta.url), 'utf8');
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html', body:'<html><body></body></html>'}));
    await page.goto('http://nrn.test/ranking/custom');
    await page.setContent(custom);
    await page.evaluate(() => {
      window.GM_getValue = (k, d) => d; window.GM_setValue = () => {};
      window.GM_xmlhttpRequest = o => { setTimeout(() => o.onload({status:200, responseText:'<nicovideo_thumb_response status="ok"><thumb><title>t</title><description>d</description><tags><tag>x</tag></tags><user_id>1</user_id><user_nickname>u</user_nickname></thumb></nicovideo_thumb_response>'}), 5); return {abort() {}} };
    });
    await page.addScriptTag({content:source});
    await page.waitForFunction(() => document.querySelectorAll('.nrn-parsed').length >= 6, null, {timeout:5000});
    // Let our own insertions trigger re-parses, then verify nothing was read twice.
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const ads = [...document.querySelectorAll('a[data-anchor-page="ranking_custom"][href^="/watch/sm92"]')];
      return {parsed: document.querySelectorAll('.nrn-parsed').length,
        perAd: ads.map(a => { const root = a.closest('.nrn-parsed'); return root ? [root === a.parentElement, root.querySelectorAll('.nrn-movie-info-toggle').length, root.querySelectorAll('a[href^="/watch/sm92"]').length] : null })};
    });
    assert.equal(r.parsed, 6, 'custom: 3 cards + 3 sponsored, none twice');
    assert.deepEqual(r.perAd, [[true,1,1],[true,1,1],[true,1,1]], 'custom: each sponsored card has its own wrapper root and one toggle');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Ranking parse PASS: genre/custom ranking cards and sponsored slots (incl. custom ranking rows) are parsed once and NG-hidden (/ranking, genre, custom); no target trimming or AutoFill on ranking.');
} finally { await browser.close(); }
