import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source = (await readFile(output, 'utf8')).replace('model = createModel(config)', 'model = createModel(config); window.fixtureModel = model; window.fixturePage = page; window.fixtureEnhancements = CardEnhancements; window.fixtureDialog = ConfigDialog');
const fixtures = {};
for (const name of ['layout-list','ad-card','hover-controls']) fixtures[name] = await readFile(new URL('../tests/fixtures/' + name + '.html', import.meta.url), 'utf8');
const layoutTest = await readFile(new URL('./test-result-layout.mjs', import.meta.url), 'utf8');
const css = layoutTest.match(/const css=`([\s\S]*?)`;/)[1].replaceAll('\\\\', '\\');
const browser = await chromium.launch({headless:true, executablePath:process.env.NRN_BROWSER});
try {
  const page = await browser.newPage({viewport:{width:1280,height:1100}});
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if(m.type() === 'error') {errors.push(m.text()); console.error(m.text());}});
  // ALL traffic intercepted; isolated browser and invented origin, no real account/API.
  await page.route('**/*', r => r.fulfill({contentType:'text/html', body:'<html></html>'}));
  await page.goto('http://nrn.test/tag/fixture');
  await page.setContent('<style>' + css + '</style><main aria-label="nicovideo-content"><div id="results">' + fixtures['layout-list'] + '</div><section id="ad">' + fixtures['ad-card'] + '</section><nav data-scope="pagination"><a href="?page=1">1</a><a href="?page=2">2</a><a href="?page=3">3</a></nav></main>');
  await page.evaluate(() => {
    const ad = document.querySelector('#ad > a');
    ad.querySelectorAll('.nrn-action-pane,.nrn-movie-info-toggle,.nrn-movie-info-container,.nrn-description').forEach(el => el.remove());
    for (const el of [ad, ...ad.querySelectorAll('*')]) {
      for (const c of [...el.classList]) if (c.startsWith('nrn-')) el.classList.remove(c);
      for (const a of [...el.attributes]) if (a.name.startsWith('data-nrn') || a.name === 'id') el.removeAttribute(a.name);
    }
    ad.href = '/watch/sm90001001'; ad.style.width = '420px';
    window.requests = []; window.opened = [];
    window.GM_openInTab = url => { opened.push(url); };
    window.GM_getValue = (key, fallback) => ({autoFillEnabled:false, autoFillTargetCount:1,
      selfAdWarningEnabled:false, openNewWindow:true, ngTitles:JSON.stringify(['運ゲー']), ngUserNames:JSON.stringify(['fixture']), ngTags:JSON.stringify(['blocked']), ngLockedTagCountEnabled:true, ngLockedTagCountThreshold:1}[key] ?? fallback);
    window.GM_setValue = () => {};
    window.GM_xmlhttpRequest = options => {
      const id = options.url.split('/').pop(); requests.push(id);
      const timer = setTimeout(() => options.onload({status:200,responseText:`<nicovideo_thumb_response status="ok"><thumb><title>${id}</title><description>fixture</description><tags><tag lock="1">blocked</tag></tags><user_id>34567</user_id><user_nickname>fixture user</user_nickname></thumb></nicovideo_thumb_response>`}), 5);
      return {abort() {clearTimeout(timer); options.onabort?.();}};
    };
  });
  await page.addScriptTag({content:source});
  await page.waitForFunction(() => document.querySelector('#ad .nrn-thumb-info-done'), null, {timeout:5000});
  await page.evaluate(() => fixtureModel.config.ngMovieVisible.value = true);
  await page.waitForFunction(() => document.querySelector('#ad .nrn-is-ng'));
  const adToggle = page.locator('#ad .nrn-movie-info-toggle');
  await adToggle.click();
  assert.deepEqual(await page.evaluate(() => opened), [], 'outer ad link cannot steal arrow click');
  assert.equal(await page.evaluate(() => fixturePage.movieRoots.find(r => r.elem.closest('#ad'))._movieInfoVisible), true);
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#ad .nrn-movie-info-container').isVisible(),true);
  assert.equal(await adToggle.evaluate(el => {const r=el.getBoundingClientRect();return [[2,2],[r.width-2,r.height-2],[r.width/2,r.height/2]].every(([x,y])=>document.elementFromPoint(r.x+x,r.y+y)===el);}), true, 'whole expanded hit area usable');
  assert.equal(await page.locator('#ad .nrn-is-ng').evaluate(el => getComputedStyle(el).outlineStyle), 'dashed');
  assert.ok((await page.locator('#ad .nrn-ng-reasons').textContent()).includes('タグ：blocked'));
  assert.equal(await page.locator('#ad .nrn-reason-tag').textContent(), 'blocked');
  assert.equal(await page.locator('#ad mark.nrn-lock-count').count(), 1);
  assert.equal(await page.locator('#ad .nrn-owner-name mark').textContent(), 'fixture');
  assert.equal(await page.locator('#ad .nrn-owner-row img').count(), 1);
  assert.equal(await page.locator('.nrn-movie-info-container #nrn-config-bar').count(),0,'global config bar never enters a card detail section');
  assert.equal(await page.locator('#ad .nrn-reason-tag').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 226, 154)');
  if (process.env.NRN_ARTIFACT_DIR) {
    await mkdir(process.env.NRN_ARTIFACT_DIR,{recursive:true});
    await page.locator('#ad .nrn-movie-info-container').screenshot({path:process.env.NRN_ARTIFACT_DIR + '/ad-1607.png'});
  }
  await page.evaluate(() => {window.titleTerm=fixtureModel.movies.get('sm90001001').title.slice(0,2);fixtureModel.config.ngTitles.add(titleTerm);});
  await page.waitForFunction(() => document.querySelector('#ad .nrn-movie-title mark')?.textContent === titleTerm);
  await page.locator('#ad .nrn-owner-row img').dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => opened), ['https://www.nicovideo.jp/user/34567'], 'nested owner icon opens contributor, not outer video');
  await page.evaluate(() => {opened.length=0;fixtureModel.config.ngTitles.remove([titleTerm]);});
  await page.evaluate(() => fixtureModel.config.ngUserNames.clear());
  await page.waitForFunction(() => !document.querySelector('#ad .nrn-owner-name mark'));
  assert.equal(await page.locator('#ad .nrn-owner-row img').count(), 1, 'NG edit preserves owner icon');
  await page.waitForFunction(() => fixturePage.movieRoots.filter(r => r.elem.matches('[data-decoration-video-id][data-anchor-area="main"]:not([data-anchor-detail="nicoad"])')).every(r => Number.isFinite(fixtureModel.movies.get(r.movieId).pageContributorCount)));
  await page.waitForFunction(() => document.querySelector('.nrn-pager-summary'));
  assert.equal(await page.locator('.nrn-pager-summary').count(), 1);
  assert.equal(await page.locator('nav a').first().getAttribute('href'), '?page=1', 'native navigation destination unchanged');
  const counts = await page.evaluate(() => fixturePage.movieRoots.filter(r => r.elem.matches('[data-decoration-video-id][data-anchor-area="main"]:not([data-anchor-detail="nicoad"])')).map(r => fixtureModel.movies.get(r.movieId).pageContributorCount));
  assert.ok(counts.length > 0); assert.ok(counts.every(n => n === counts.length), 'count full physical page before NG, excluding ads');
  await page.evaluate(() => {const nav=document.querySelector('nav');nav.innerHTML='<a href="?page=1">1</a><a href="?page=2">2</a>';document.querySelector('.nrn-pager-summary').remove();});
  await page.waitForFunction(() => document.querySelector('.nrn-pager-summary'));
  await page.evaluate(() => {
    const owner = fixtureEnhancements.ownerLink(document, null, null);
    document.body.append(owner); owner.id = 'missing-owner';
  });
  assert.equal(await page.locator('#missing-owner').textContent(), '投稿者情報なし');
  assert.equal(await page.locator('#missing-owner').getAttribute('href'), null);
  assert.equal(await page.locator('#missing-owner.nrn-owner-unavailable img').count(), 1);
  await page.evaluate(async () => {
    const nativeFetch = window.fetch;
    try {
      const testItems = async items => {
        const meta=document.createElement('meta');meta.name='server-response';
        meta.content=JSON.stringify({data:{response:{$getSearchVideoV2:{data:{items}}}}});
        window.fetch=async()=>({ok:true,status:200,text:async()=>meta.outerHTML});
        return (await fixturePage.fetchPageItems(2)).items.map(item=>item.__nrnPageContributorCount ?? null);
      };
      window.pageCountResults = [
        await testItems([{id:'sm1',owner:{type:'user',id:1}},{id:'sm2',owner:{type:'user',id:1}},{id:'sm1',owner:{type:'user',id:1}},{id:'so3',owner:{id:1,ownerType:'channel'}}]),
        await testItems([{id:'sm1',owner:{type:'user',id:1}},{id:'sm2',owner:{}}])
      ];
    } finally {window.fetch=nativeFetch;}
  });
  assert.deepEqual(await page.evaluate(()=>pageCountResults), [[2,2,2,1],[null,null]], 'source page counts deduplicate videos, separate channel/user IDs, retain unknown');
  // Owner presentation: native row stays in place and only one copy is visible.
  await page.evaluate(() => {
    const root=fixturePage.movieRoots.find(r => r.elem.closest('#ad'));
    const owner=document.createElement('a'); owner.href='/user/34567'; owner.textContent='native owner';
    root.elem.prepend(owner); window.nativeOwnerFixture=owner;
    fixtureModel.movies.get(root.movieId).emit('ngReasonsChanged');
  });
  await page.waitForFunction(() => nativeOwnerFixture.classList.contains('nrn-native-owner'));
  assert.equal(await page.locator('#ad .nrn-native-owner').isVisible(),false);
  assert.equal(await page.locator('#ad .nrn-owner-row').isVisible(),true);
  assert.equal(await page.locator('#ad .nrn-contributor-kind').count(),0);
  assert.equal(await page.locator('#ad .nrn-contributor-section .nrn-info-section-title').count(),0);
  await adToggle.click();
  assert.equal(await page.locator('#ad .nrn-native-owner').isVisible(),true);
  assert.equal(await page.locator('#ad .nrn-owner-row').count(),0);
  await adToggle.click();
  assert.equal(await page.evaluate(()=>nativeOwnerFixture.parentElement === fixturePage.movieRoots.find(r=>r.elem.closest('#ad')).elem),true);
  // Decoration API ownerName must never be presented as sponsorName.
  await page.evaluate(async () => {
    const fetchBefore=window.fetch;
    window.fetch=async()=>({ok:true,text:async()=>JSON.stringify({data:{decoration:'gold',ownerName:'UPLOADER_NOT_ADVERTISER',totalPoint:17800}})});
    try {
      const root=document.createElement('div'); root.innerHTML='<div><div class="nrn-thumb-anchor-wrap"></div></div>'; document.body.append(root);root.id='decoration-fixture';
      await fixturePage._applyAdDecoration(root,'sm999888777');
    } finally {window.fetch=fetchBefore;}
  });
  assert.equal(await page.locator('#decoration-fixture .nrn-ad-decoration').textContent(),'17,800pt');
  assert.equal(await page.evaluate(() => {
    const native=document.createElement('a'); native.href='https://www.nicovideo.jp/user/88';
    native.innerHTML='<img src="https://nrn.test/wrong-owner.png"><p>wrong name</p>';
    const owner=fixtureEnhancements.ownerLink(document,{type:'user',id:77,name:'',url:'https://www.nicovideo.jp/user/77'},native);
    return owner.textContent.includes('wrong') || owner.querySelector('img').src.includes('wrong-owner');
  }),false,'conflicting native identity must not supply the authoritative owner name/icon');
  // Transient hover DOM must retain its original listeners and never be parsed as videos.
  await page.evaluate(html => {
    const host = document.querySelector('#ad > a');
    window.hoverHost = document.createElement('div'); hoverHost.id = 'test-hover'; hoverHost.innerHTML = html; host.append(hoverHost);
    window.buttonClicks = 0; hoverHost.querySelector('button').addEventListener('click', e => {e.preventDefault();buttonClicks++;});
  }, fixtures['hover-controls']);
  const before = await page.locator('.nrn-movie-info-toggle').count();
  await page.locator('#test-hover button').first().dispatchEvent('click');
  assert.equal(await page.evaluate(() => buttonClicks), 1);
  assert.deepEqual(await page.evaluate(() => opened), []);
  await page.evaluate(() => {for(let i=0;i<100;i++){hoverHost.remove();document.querySelector('#ad > a').append(hoverHost);}});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.nrn-movie-info-toggle').count(), before);
  await page.evaluate(() => fixtureModel.config.ngMovieVisible.value = false);
  assert.equal(await page.locator('#ad .nrn-is-ng').evaluate(el => getComputedStyle(el).display), 'none');
  const settings = await browser.newPage({viewport:{width:1050,height:1000}});
  await settings.route('**/*', r => r.fulfill({body:'',contentType:'text/html'}));
  await settings.setContent(await page.evaluate(() => fixtureDialog.SRCDOC));
  await settings.locator('[data-tab="autofill"]').click();
  for (const id of ['autoFillInfoMode','autoFillPagerMode','sessionDetailCacheEnabled','advancedNgRulesEnabled','developerMode']) assert.ok((await settings.locator('#' + id + '-explanation').textContent()).length > 25);
  assert.equal(await settings.locator('#autoFillPagerMode').getAttribute('aria-describedby'), 'autoFillPagerMode-explanation');
  if (process.env.NRN_ARTIFACT_DIR) await settings.screenshot({path:process.env.NRN_ARTIFACT_DIR + '/settings-1607.png'});
  await settings.close();
  assert.deepEqual(errors, []);
  console.log('Card Chrome fixture PASS: supplied outer ad anchor, arrow hit testing, native button click preservation, NG outline/reasons/tag/name/lock markers, owner icon, page count, native pager links, transient DOM.');
} finally {await browser.close();}
