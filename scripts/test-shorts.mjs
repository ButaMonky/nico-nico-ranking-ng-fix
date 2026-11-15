// BRUSH-072: shorts search (/tag_shorts/, /search_shorts/) — same cards as
// search, but links are /shorts/ss… and IDs start with "ss". Synthetic
// fixture derived from the captured search list. Offline.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const list = (await readFile(new URL('../tests/fixtures/layout-list.html', import.meta.url), 'utf8'))
  .replaceAll('sm9', 'ss9').replaceAll('/watch/', '/shorts/').replaceAll('data-anchor-page="tag"', 'data-anchor-page="tag_shorts"');
const page_html = '<main aria-label="nicovideo-content"><section><div>Search results</div><div id="results">' + list + '</div></section></main>';
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  for (const path of ['/tag_shorts/fixture', '/search_shorts/fixture']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html; charset=utf-8', body:'<!doctype html><html><head></head><body>' + page_html + '</body></html>'}));
    await page.addInitScript(() => {
      window.requested = [];
      window.GM_getValue = (k, d) => ({ngTags:'["ng-tag"]', ngMovies:'["ss90000003"]'})[k] ?? d;
      window.GM_setValue = () => {};
      window.GM_xmlhttpRequest = o => {
        const id = o.url.split('/').pop(); requested.push(id);
        const tag = id.endsWith('2') ? 'ng-tag' : 'ok';
        setTimeout(() => o.onload({status:200, responseText:`<nicovideo_thumb_response status="ok"><thumb><video_id>${id}</video_id><title>${id}</title><description>d</description><tags><tag>${tag}</tag></tags><user_id>1</user_id><user_nickname>u</user_nickname></thumb></nicovideo_thumb_response>`}), 5);
        return {abort() {}};
      };
      requestAnimationFrame(() => { window.__firstPaint3 = getComputedStyle(document.querySelector('[data-decoration-video-id="ss90000003"]') || document.body).display; });
    });
    await page.addInitScript({content: source.replace('page._sourceUrl = location.href', 'page._sourceUrl = location.href; window.testPage = page')});
    await page.goto('http://nrn.test' + path);
    // NG-by-ID cards skip details, so wait for the details of the others.
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('.nrn-parsed')].filter(c => c.dataset.decorationVideoId !== 'ss90000003');
      return cards.length > 0 && cards.every(c => c.classList.contains('nrn-thumb-info-done'));
    }, null, {timeout:8000});
    const r = await page.evaluate(() => {
      const natives = [...document.querySelectorAll('[data-decoration-video-id][data-anchor-area="main"]')];
      return {natives: natives.length, parsed: natives.filter(e => e.classList.contains('nrn-parsed')).length,
        hidden: natives.filter(e => e.classList.contains('nrn-hide')).map(e => e.dataset.decorationVideoId),
        requestedSs: requested.length > 0 && requested.every(id => /^ss\d+$/.test(id)), firstPaint3: window.__firstPaint3};
    });
    assert.ok(r.natives >= 8, path);
    assert.equal(r.parsed, r.natives, path + ': every shorts card is read');
    assert.ok(r.requestedSs, path + ': details requested with ss IDs');
    assert.ok(r.hidden.includes('ss90000002'), path + ': detail-based NG tag hides a shorts card');
    assert.ok(r.hidden.includes('ss90000003'), path + ': NG video ID hides a shorts card');
    assert.equal(r.firstPaint3, 'none', path + ': NG shorts ID hidden before first paint');
    // BRUSH-073: a card built by AutoFill for a short has the native shorts shape.
    const tile = await page.evaluate(() => {
      const root = testPage._createInjectedTile({id:'ss91000001', title:'<b>t</b>', registeredAt:'2026-11-01T00:00:00+09:00', duration:19,
        count:{view:1, comment:2}, owner:{type:'user', id:'5', name:'<i>o</i>', iconUrl:'data:,'},
        thumbnail:{listingUrl:'data:,M', shortUrl:'data:,SHORT'}}, {deferAppend:true, deferActions:true});
      return {portrait: !!root.querySelector('.asp_2\\:3'), landscape: !!root.querySelector('.asp_16\\:9'),
        duration: !!root.querySelector('.pos_absolute time'), img: root.querySelector('img.mx_auto').getAttribute('src'),
        href: root.querySelector('a').getAttribute('href'), page: root.dataset.anchorPage,
        title: root.querySelector('.nrn-movie-title').textContent, ownerHtml: root.querySelector('p.fw_bold').innerHTML};
    });
    assert.deepEqual(tile, {portrait:true, landscape:false, duration:false, img:'data:,SHORT', href:'https://www.nicovideo.jp/shorts/ss91000001',
      page: path.startsWith('/tag_shorts/') ? 'tag_shorts' : 'search_shorts', title:'<b>t</b>', ownerHtml:'&lt;i&gt;o&lt;/i&gt;'}, path + ': injected shorts card');
    assert.deepEqual(errors, [], path);
    await page.close();
  }
  console.log('Shorts PASS: /tag_shorts/ and /search_shorts/ cards (ss IDs, /shorts/ links) are read, NG-checked via details, and pre-paint hidden.');
} finally { await browser.close(); }
