import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = (await readFile(output, 'utf8')).replace('model = createModel(config)', 'model = createModel(config); window.testModel = model');
const fixture = await readFile(new URL('../tests/fixtures/layout-list.html', import.meta.url), 'utf8');
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Entirely offline: no real NicoNico page, account, browser profile or API is used.
  await page.route('**/*', route => route.fulfill({contentType:'text/html', body:'<html><body></body></html>'}));
  await page.goto('http://nrn.test/tag/first');
  await page.setContent('<main aria-label="nicovideo-content"><section><div>Search results</div><div id="results">' + fixture + '</div></section></main><a id="next" href="/tag/first?page=2">Next</a>');
  await page.evaluate(() => {
    window.documentIdentity = {};
    window.savedIdentity = window.documentIdentity;
    window.requests = []; window.hold = false; window.aborts = 0; window.storageWrites = 0;
    window.GM_getValue = (key, fallback) => ({autoFillEnabled:true, autoFillTargetCount:36,
      autoFillMaxExtraPages:1, selfAdWarningEnabled:false, openNewWindow:false, ngTags:'["require-details"]'}[key] ?? fallback);
    window.fetches = []; window.fetchAborts = 0;
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      fetches.push({url, deliver:() => resolve({ok:true, status:200, url,
        text:async () => '<meta name="server-response" content="{}">'})});
      options.signal.addEventListener('abort', () => { fetchAborts++; reject(new DOMException('route ended', 'AbortError')); });
    });
    window.GM_setValue = () => { storageWrites++; };
    window.GM_xmlhttpRequest = options => {
      const id = options.url.split('/').pop();
      const deliver = () => options.onload({status:200, responseText:`<nicovideo_thumb_response status="ok"><thumb><title>${id}</title><description>fixture</description><tags><tag>test</tag></tags><user_id>1</user_id><user_nickname>fixture</user_nickname></thumb></nicovideo_thumb_response>`});
      const request = {id, deliver, route:location.pathname + location.search}; requests.push(request);
      const timer = hold ? null : setTimeout(deliver, 5);
      return {abort() { clearTimeout(timer); aborts++; options.onabort?.(); }};
    };
    // Simulated site router, deliberately installed before the userscript.
    document.addEventListener('click', e => {
      const a = e.target.closest('#next');
      if (!a || e.defaultPrevented) return;
      e.preventDefault(); history.pushState({}, '', a.href);
    });
  });
  await page.addScriptTag({content:source});
  const ready = () => page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('.nrn-parsed'));
    return cards.length > 0 && cards.every(card => card.classList.contains('nrn-thumb-info-done'));
  }, null, {timeout:5000});
  await ready();
  const initial = await page.locator('.nrn-movie-info-toggle').count();
  assert.ok(initial > 0);
  const render = async (url, id, beforeHistory = false) => {
    await page.evaluate(({url, id, fixture, beforeHistory}) => {
      const html = fixture.replace(/sm\d+/g, id);
      if (beforeHistory) document.getElementById('results').innerHTML = html;
      history.pushState({}, '', url);
      if (!beforeHistory) document.getElementById('results').innerHTML = html;
    }, {url, id, fixture, beforeHistory});
    await ready();
  };
  await page.locator('#next').click();
  assert.equal(new URL(page.url()).search, '?page=2', 'native link event reaches router');
  await page.evaluate(fixture => document.getElementById('results').innerHTML = fixture, fixture);
  await ready();
  for (let i = 0; i < 5; i++) {
    await render('/search/query' + i + '?sort=registeredAt&order=desc', 'sm90000' + i, i % 2 === 0);
    assert.equal(await page.locator('#nrn-config-bar').count(), 1);
    assert.equal(await page.locator('.nrn-movie-info-toggle').count(), initial, 'no duplicate controls after route change');
  }
  // Opening and closing an overlay must preserve the actual toggle node/model.
  await page.evaluate(() => { window.savedToggle = document.querySelector('.nrn-movie-info-toggle'); history.replaceState({}, '', '/watch/sm1'); });
  await page.evaluate(() => history.replaceState({}, '', '/search/query4?sort=registeredAt&order=desc'));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => savedToggle === document.querySelector('.nrn-movie-info-toggle')), true);
  // A repeated result on a new route reuses successful metadata, not its NG decision.
  const requestCount = await page.evaluate(() => requests.length);
  await render('/tag/cached', 'sm900004');
  assert.equal(await page.evaluate(() => requests.length), requestCount, 'recent metadata avoids duplicate requests on SPA');
  await page.evaluate(() => testModel.config.ngMovies.add('sm900004'));
  assert.equal(await page.evaluate(() => testModel.movies.get('sm900004').ng), true, 'cached metadata uses current NG settings');
  // Leave with requests still in flight; deliver them late despite abort.
  await page.evaluate(() => { hold = true; });
  await page.evaluate(({fixture}) => {
    history.pushState({}, '', '/tag/slow');
    document.getElementById('results').innerHTML = fixture.replace(/sm\d+/g, 'sm99999991');
  }, {fixture});
  await page.waitForFunction(() => requests.some(r => r.route === '/tag/slow'));
  await page.evaluate(() => { hold = false; });
  await render('/tag/final', 'sm99999992');
  await page.evaluate(() => requests.filter(r => r.route === '/tag/slow').forEach(r => r.deliver()));
  assert.ok(await page.evaluate(() => aborts > 0));
  assert.equal(await page.locator('[data-nrn-movie-id="sm99999991"]').count(), 0, 'late details cannot decorate new results');
  // Suspend outside results, then return using the same document.
  await page.evaluate(() => { history.pushState({}, '', '/my'); document.getElementById('results').innerHTML = '<p>Other page</p>'; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#nrn-config-bar').count(), 0);
  await render('/tag/returned', 'sm99999993');
  // React can retain the card nodes while updating title text for a new query.
  await page.evaluate(() => {
    const title = document.querySelector('.nrn-movie-title');
    window.reusedTitleHost = title.parentElement;
    history.pushState({}, '', '/tag/reused');
    reusedTitleHost.lastChild.nodeValue = 'Reused native card title';
  });
  await ready();
  assert.equal(await page.evaluate(() => reusedTitleHost.textContent), 'Reused native card title');
  assert.equal(await page.locator('.nrn-movie-info-toggle').count(), initial);
  // Empty results terminate without appending videos from the previous query.
  await page.evaluate(() => {
    history.pushState({}, '', '/tag/empty');
    document.getElementById('results').innerHTML = '<p>No results</p>';
  });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.nrn-movie-info-toggle').count(), 0);
  await render('/tag/after-empty', 'sm99999994');
  await page.waitForFunction(() => fetches.some(r => r.url.includes('/tag/after-empty?')));
  await render('/tag/after-fetch', 'sm99999995');
  await page.evaluate(() => fetches.filter(r => r.url.includes('/tag/after-empty?')).forEach(r => r.deliver()));
  assert.ok(await page.evaluate(() => fetchAborts > 0), 'route disposal aborts AutoFill fetch');
  assert.equal(await page.evaluate(() => savedIdentity === documentIdentity), true);
  assert.equal(await page.evaluate(() => storageWrites), 1, 'only the explicit fixture NG edit writes settings; routing never does');
  assert.deepEqual(errors, []);
  console.log('SPA Chrome fixture PASS: native links, queries, pre/post history commits, overlay, cancellation, reused/empty results, leave/return, no reload or duplicate controls.');
} finally { await browser.close(); }
