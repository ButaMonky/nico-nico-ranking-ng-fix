// BRUSH-062: the script loads on a non-target page of the same app (watch)
// and starts only after an in-app move to a supported route. Offline only.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = await readFile(output, 'utf8');
const list = await readFile(new URL('../tests/fixtures/layout-list.html', import.meta.url), 'utf8');
const ranking = await readFile(new URL('../tests/fixtures/ranking-genre.html', import.meta.url), 'utf8');
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  for (const [target, fixture, wrap] of [['/tag/test', list, true], ['/ranking/genre/all', ranking, false]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html', body:'<html><body></body></html>'}));
    await page.goto('http://nrn.test/watch/sm1');
    await page.setContent('<div id="app"><a id="tag" href="' + target + '">tag</a><a id="ext" href="/watch/sm2">other video</a></div>');
    await page.evaluate(() => {
      window.writes = 0;
      window.GM_getValue = (k, d) => ({ngTags:'["ng-tag"]', openNewWindow:true})[k] ?? d;
      window.GM_setValue = () => { writes++ };
      window.GM_xmlhttpRequest = o => {
        const id = o.url.split('/').pop();
        setTimeout(() => o.onload({status:200, responseText:`<nicovideo_thumb_response status="ok"><thumb><title>${id}</title><description>d</description><tags><tag>ok</tag></tags><user_id>1</user_id><user_nickname>u</user_nickname></thumb></nicovideo_thumb_response>`}), 5);
        return {abort() {}};
      };
    });
    await page.addScriptTag({content:source});
    await page.waitForTimeout(300);
    const idle = await page.evaluate(() => ({
      styles: document.querySelectorAll('style').length,
      bar: !!document.getElementById('nrn-config-button'),
      target: document.getElementById('ext').getAttribute('target'),
      writes,
    }));
    assert.deepEqual(idle, {styles:0, bar:false, target:null, writes:0}, 'idle on the watch page');
    // In-app navigation, then the router renders the new route.
    await page.evaluate(({target, fixture, wrap}) => {
      history.pushState({}, '', target);
      document.getElementById('app').innerHTML = wrap
        ? '<main aria-label="nicovideo-content"><section><div>Search results</div><div id="results">' + fixture + '</div></section></main>'
        : fixture;
    }, {target, fixture, wrap});
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('.nrn-parsed')];
      return cards.length > 0 && cards.every(c => c.classList.contains('nrn-thumb-info-done'));
    }, null, {timeout:5000});
    assert.deepEqual(errors, [], target);
    await page.close();
  }
  console.log('SPA activation PASS: idle on watch, starts after in-app move to tag search and ranking.');
} finally { await browser.close(); }
