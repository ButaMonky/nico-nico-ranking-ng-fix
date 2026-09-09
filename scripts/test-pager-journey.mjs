import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
const source=await readFile(new URL('../src/ui/pager-journey.js',import.meta.url),'utf8');
const presentation=await readFile(new URL('../src/ui/card-enhancements.js',import.meta.url),'utf8');
const css=presentation.match(/const css = `([\s\S]*?)`/)[1];
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture?page=3');
 await page.setContent('<style>'+css+'</style><nav data-scope="pagination"><a href="?page=2">←</a><a href="?page=3" aria-current="page">3</a><a href="?page=4">→</a></nav>');
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{
  window.config={autoFillPagerMode:{value:'compactSkip'},pagerPreviewCount:{value:2},ngTitles:{set:new Set()}};
  window.routePage={doc:document,_disposed:false};
  window.journey=PagerJourney.create(routePage,config,location.href);
  window.calls=[];
  for(let n=4;n<=8;n++)journey.record(n,[{id:'sm'+n}]);
  journey.update(20,id=>true);
 });
 assert.equal(await page.locator('.nrn-journey-pager').count(),0,'no router means original links stay usable');
 assert.equal(await page.locator('nav a').first().getAttribute('href'),'?page=2');
 await page.evaluate(()=>{
  window.__reactRouterDataRouter={state:{initialized:true},navigate:async href=>{calls.push(href);history.pushState({},'',href)}};
  journey.update(20,()=>true);
 });
 assert.equal(await page.locator('.nrn-journey-pager .nrn-page-consumed').textContent(),'4–8');
 assert.equal(await page.locator('.nrn-journey-pager .nrn-page-consumed').getAttribute('href'),null);
 assert.equal(await page.locator('nav[data-scope=pagination]').isVisible(),false);
 const docMarker=await page.evaluate(()=>window.marker=Math.random());
 await page.locator('.nrn-journey-pager a').filter({hasText:'→'}).click();
 await page.waitForFunction(()=>calls.length===1);
 assert.equal(new URL(await page.url()).searchParams.get('page'),'9');
 assert.equal(await page.evaluate(()=>marker),docMarker,'same document, no reload');
 await page.evaluate(()=>{
  journey.restore();routePage._disposed=true;
  window.routePage={doc:document,_disposed:false};
  journey=PagerJourney.create(routePage,config,location.href);
  for(let n=10;n<=14;n++)journey.record(n,[{id:'sm'+n}]);
  // Page14 includes an unshown candidate; it MUST remain next.
  journey.update(20,id=>id!=='sm14');
 });
 assert.deepEqual(await page.locator('.nrn-journey-pager .nrn-page-consumed').allTextContents(),['4–8','10–13']);
 assert.equal(await page.locator('.nrn-journey-pager a').filter({hasText:'→'}).getAttribute('href'),'http://nrn.test/tag/fixture?page=14');
 assert.equal(await page.locator('.nrn-journey-pager a').filter({hasText:'←'}).getAttribute('href'),'http://nrn.test/tag/fixture?page=3');
 if(process.env.NRN_ARTIFACT_DIR){await mkdir(process.env.NRN_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:process.env.NRN_ARTIFACT_DIR+'/pager-1609.png'});}
 await page.evaluate(()=>{config.ngTitles.set.add('new NG')});
 await page.locator('.nrn-journey-pager a').filter({hasText:'→'}).click();
 assert.equal(await page.evaluate(()=>calls.length),1,'first click after settings change refreshes stale routing without navigating');
 await page.evaluate(()=>{journey.update(20,()=>false)});
 assert.equal(await page.locator('.nrn-page-consumed').count(),0,'changed rules invalidate all previous skipped ranges');
 await page.evaluate(()=>{journey.update(9,()=>true)});
 assert.equal(await page.locator('.nrn-journey-pager > [aria-label="次の未処理ページ"]').getAttribute('aria-disabled'),'true');
 await page.evaluate(()=>{journey.restore();journey=PagerJourney.create(routePage,config,'http://nrn.test/tag/fixture');journey.update(1,()=>false)});
 assert.equal(await page.locator('.nrn-journey-pager > [aria-label="前の未処理ページ"]').getAttribute('href'),null);
 assert.equal(await page.locator('.nrn-journey-pager > [aria-label="前の未処理ページ"]').getAttribute('aria-disabled'),'true');
 await page.evaluate(()=>{journey.restore();journey=PagerJourney.create(routePage,config,location.href);journey.update(20,()=>false);__reactRouterDataRouter.navigate=async()=>{throw Error('router failure')}});
 await page.locator('.nrn-journey-pager a').filter({hasText:'→'}).click();
 await page.waitForFunction(()=>!document.querySelector('.nrn-journey-pager'));
 assert.equal(await page.locator('nav[data-scope=pagination]').isVisible(),true,'failed routing restores native controls');
 assert.deepEqual(errors,[]);
 console.log('Pager Chrome fixture PASS: range history, SPA router call, no reload, unshown-page protection, disabled ends, settings invalidation, capability and error fallback.');
} finally {await browser.close()}
