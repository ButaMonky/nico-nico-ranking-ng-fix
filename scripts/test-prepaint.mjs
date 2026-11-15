// BRUSH-068: NG cards are hidden before the first paint from markup alone
// (video ID / owner link / title), with the script injected at document-start
// (where <html> may not exist yet) and no detail response at all. Offline.
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.fulfill({contentType:'text/html; charset=utf-8', body:'<!doctype html><html><head></head><body>' + fixture + '</body></html>'}));
  await page.addInitScript(() => {
    // NG: video sm91000001, user 2 (owns sm91000002), title word "動画3".
    window.GM_getValue = (k, d) => ({ngMovies:'["sm91000001"]', ngUserIds:'[2]', ngTitles:'["動画3"]'})[k] ?? d;
    window.GM_setValue = () => {};
    window.GM_xmlhttpRequest = () => ({abort() {}});   // details never arrive
    requestAnimationFrame(() => {
      window.__firstPaint = [...document.querySelectorAll('[data-decoration-video-id]')]
        .map(c => [c.dataset.decorationVideoId, getComputedStyle(c).display]);
    });
  });
  await page.addInitScript({content: source});
  await page.goto('http://nrn.test/ranking/genre/all');
  await page.waitForFunction(() => window.__firstPaint);
  const first = Object.fromEntries(await page.evaluate(() => window.__firstPaint));
  assert.deepEqual(first, {sm91000001:'none', sm91000002:'none', sm91000003:'none'}, 'all three NG cards hidden at first paint');
  assert.deepEqual(errors, []);
  console.log('Pre-paint PASS: NG video ID / owner link / title hide cards before the first paint at document-start, with no detail response.');
} finally { await browser.close(); }
