import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const source=(await readFile(output,'utf8')).replace('model = createModel(config)','model = createModel(config); window.testModel = model')
 .replace('  var Main =','  window.testTypes={ConfigDialog}; var Main =');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();const errors=[],messages=[];page.setDefaultTimeout(7000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>messages.push(m.text()));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://nrn.test/tag/PRIVATE_QUERY');
 await page.setContent('<main aria-label="nicovideo-content"><section><div id="results">'+fixture+'</div></section></main>');
 const card=await page.locator('[data-decoration-video-id]').first().evaluate(el=>el.outerHTML);
 await page.evaluate(html=>document.getElementById('results').innerHTML=html,card);
 await page.evaluate(()=>{
  window.requests=[];window.writes=0;window.fetchCalls=0;
  window.GM_getValue=(key,fallback)=>({autoFillEnabled:false,openNewWindow:false,developerMode:true,developerDiagnosticMode:'manual'}[key]??fallback);
  window.GM_setValue=()=>{writes++;};
  window.fetch=()=>{fetchCalls++;throw Error('unexpected network');};
  window.GM_xmlhttpRequest=options=>{
   const id=options.url.split('/').pop();
   requests.push({id,deliver:()=>options.onload({status:200,responseText:`<nicovideo_thumb_response status="ok"><thumb><video_id>${id}</video_id><title>PRIVATE_TITLE</title><description>PRIVATE_DESCRIPTION</description><tags><tag lock="1">PRIVATE_TAG</tag></tags><user_id>42</user_id><user_nickname>PRIVATE_OWNER</user_nickname></thumb></nicovideo_thumb_response>`})});
   return {abort(){options.onabort?.();}};
  };
 });
 await page.addScriptTag({content:source});
 await page.waitForFunction(()=>window.__nrnDiagnostics?.snapshot().current?.initialProcessing);
 let s=await page.evaluate(()=>__nrnDiagnostics.snapshot());
 assert.equal(s.version,'160.13');assert.equal(s.current.network.run.detail.attempts,0);
 assert.equal(s.current.detailPlan.readyWithoutRequest,1);assert.equal(s.current.fieldStates.tags.unknown,1);
 for(let i=0;i<10;i++)assert.equal(await page.evaluate(()=>__nrnDiagnostics.snapshot().current.detailPlan.readyWithoutRequest),1);
 await page.locator('.nrn-movie-info-toggle').first().click();
 await page.waitForFunction(()=>requests.length===1);
 s=await page.evaluate(()=>__nrnDiagnostics.snapshot());assert.equal(s.current.network.run.detail.active,1);
 await page.evaluate(()=>requests[0].deliver());
 s=await page.evaluate(()=>__nrnDiagnostics.snapshot());assert.equal(s.current.network.run.detail.ok,1);
 assert.equal(s.current.network.run.detail.attempts,await page.evaluate(()=>requests.length));
 assert.equal(s.current.detailPlan.readyWithoutRequest,0);assert.equal(s.current.fieldStates.tags.known,1);
 // Real settings iframe with the clipboard permission denied; provide a manual-copy fallback.
 await page.evaluate(()=>{
  const frame=document.createElement('iframe');frame.id='test-settings';frame.style='width:100%;height:900px';
  frame.srcdoc=testTypes.ConfigDialog.SRCDOC;document.body.append(frame);
 });
 const frame=page.frameLocator('#test-settings');await frame.locator('#copyAnonymousDiagnostics').waitFor({state:'attached'});
 await page.evaluate(()=>{
  const doc=document.getElementById('test-settings').contentDocument;
  Object.defineProperty(doc.defaultView.navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('denied'))}});
  window.dialog=new testTypes.ConfigDialog(testModel.config,doc,()=>{});
 });
 await frame.locator('[data-tab="developer"]').click();
 const before=await page.evaluate(()=>({requests:requests.length,fetches:fetchCalls,writes}));
 await frame.locator('#copyAnonymousDiagnostics').click();
 await frame.locator('#anonymousDiagnosticStatus').filter({hasText:'Ctrl+C'}).waitFor();
 const report=await frame.locator('#anonymousDiagnosticText').inputValue();
 assert.equal(JSON.parse(report).version,'160.13');assert.doesNotMatch(report,/PRIVATE|sm\d+|https?:|blob:|user_id/);
 assert.deepEqual(await page.evaluate(()=>({requests:requests.length,fetches:fetchCalls,writes})),before);
 await page.evaluate(()=>{
  const nav=document.getElementById('test-settings').contentDocument.defaultView.navigator;
  Object.defineProperty(nav,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});
 });
 await frame.locator('#copyAnonymousDiagnostics').click();
 await frame.locator('#anonymousDiagnosticStatus').filter({hasText:'コピーしました'}).waitFor();
 assert.equal(JSON.parse(await page.evaluate(()=>copied)).format,'NRN-DIAGNOSTICS-1');
 await page.evaluate(()=>document.getElementById('test-settings').remove());
 // The next route uses recent details without counting them as readiness-only skips.
 await page.evaluate(html=>{history.pushState({},'','/tag/PRIVATE_NEXT');document.getElementById('results').innerHTML=html;},card);
 await page.waitForFunction(()=>__nrnDiagnostics.snapshot().current?.sequence===2);
 s=await page.evaluate(()=>__nrnDiagnostics.snapshot());
 assert.equal(s.previous[0].network.run.detail.attempts,1);assert.equal(s.current.network.run.detail.attempts,0);
 assert.equal(s.current.cache.recentRestoredVideos,1);assert.equal(s.current.detailPlan.cacheOnly,1);
 assert.equal(s.current.detailPlan.readyWithoutRequest,0);
 assert.deepEqual(errors,[]);assert.doesNotMatch(messages.join('\n'),/PRIVATE|sm\d+|blob:/);
 assert.ok(messages.some(m=>m.startsWith('NRN_REPORT_BEGIN')));
 const broken=await browser.newPage();const failureMessages=[];
 broken.on('console',m=>failureMessages.push(m.text()));broken.on('pageerror',e=>errors.push(e.message));
 await broken.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
 await broken.goto('http://nrn.test/tag/PRIVATE_FAILURE');
 await broken.evaluate(()=>{window.GM_getValue=async()=>{throw Error('PRIVATE_COOKIE_AND_PATH');};window.GM_setValue=()=>{};});
 await broken.addScriptTag({content:source});
 await broken.waitForFunction(()=>window.__nrnDiagnostics?.snapshot().problemCounts.startup===1);
 assert.ok(failureMessages.some(m=>m.includes('NRN_REPORT_BEGIN')));
 assert.doesNotMatch(failureMessages.join('\n'),/PRIVATE/);assert.deepEqual(errors,[]);
 console.log('Offline browser PASS: transport counts; known-owner zero requests; private strings omitted; copy without network or settings changes; blocked clipboard fallback; SPA cache counters.');
} finally {await browser.close();}
