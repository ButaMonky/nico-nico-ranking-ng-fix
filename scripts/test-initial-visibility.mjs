import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root,sourceParts} from './build.mjs';

// Exercise source assembly without writing dist during parallel verification.
const source=(await Promise.all(sourceParts.map(file=>readFile(join(root,file),'utf8')))).join('')
 .replace('model = createModel(config)','model = createModel(config); window.testModel=model; window.testPage=page')
 .replace('      model.diagnostics?.runtime(function() {','      window.countProbe=()=>({originalTracked:originalRoots.length,total:visibleTotalCount(),original:visibleOriginalCount(),injected:visibleInjectedCount()});\n      model.diagnostics?.runtime(function() {');
const fixture=await readFile(join(root,'tests/fixtures/layout-list.html'),'utf8');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const html=await page.evaluate(fixture=>{
  const doc=new DOMParser().parseFromString(fixture,'text/html');
  const template=doc.querySelector('[data-decoration-video-id]');
  const cards=['sm91000001','sm91000002','sm91000003'].map(id=>template.outerHTML.replaceAll(template.dataset.decorationVideoId,id)).join('');
  return '<!doctype html><html><head><style>img{width:160px;height:90px}</style></head><body><main aria-label="nicovideo-content"><section><div id="results">'+cards+'</div></section></main></body></html>';
 },fixture);
 await page.route('**/*',route=>route.fulfill({contentType:route.request().resourceType()==='document'?'text/html':'image/svg+xml',body:route.request().resourceType()==='document'?html:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 await page.addInitScript(()=>{
  window.requests=[];
  window.GM_getValue=(key,fallback)=>({autoFillEnabled:false,selfAdWarningEnabled:false,openNewWindow:false,ngTags:'["blocked"]'}[key]??fallback);
  window.GM_setValue=()=>{};
  window.GM_xmlhttpRequest=options=>{
   const id=options.url.split('/').pop();
   requests.push({id,deliver(tag){options.onload({status:200,responseText:`<nicovideo_thumb_response status="ok"><thumb><video_id>${id}</video_id><title>Fixture</title><description>Fixture</description><tags><tag>${tag}</tag></tags><user_id>42</user_id><user_nickname>Fixture owner</user_nickname></thumb></nicovideo_thumb_response>`});},fail(){options.onerror({});}});
   return {abort(){options.onabort?.();}};
  };
 });
 await page.addInitScript({content:source});
 await page.goto('http://nrn.test/tag/initial');
 const cards=page.locator('#results > [data-decoration-video-id]');
 await page.waitForFunction(()=>window.testPage?.movieRoots.length===3&&window.requests.length===3&&window.countProbe?.().originalTracked===3);
 const visible=()=>page.evaluate(()=>Array.from(document.querySelectorAll('#results > [data-decoration-video-id]')).filter(card=>getComputedStyle(card).visibility!=='hidden'&&card.getClientRects().length>0).map(card=>card.dataset.decorationVideoId));
 assert.deepEqual(await visible(),['sm91000001','sm91000002','sm91000003'],'all initial native cards are visible while detail requests are held');
 assert.equal(await page.evaluate(()=>countProbe().original),3,'display count includes visible pending native cards');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm91000001').metadataSettled),false);
 await page.evaluate(()=>requests.find(r=>r.id==='sm91000001').deliver('allowed'));
 assert.deepEqual(await visible(),['sm91000001','sm91000002','sm91000003'],'a successful non-NG response does not reveal cards one by one');
 await page.evaluate(()=>requests.find(r=>r.id==='sm91000002').deliver('blocked'));
 await page.waitForFunction(()=>testModel.movies.get('sm91000002').ng);
 assert.deepEqual(await visible(),['sm91000001','sm91000003'],'only the confirmed NG card disappears');
 assert.equal(await page.evaluate(()=>countProbe().original),2);
 await page.evaluate(()=>testModel.config.ngMovieVisible.value=true);
 assert.deepEqual(await visible(),['sm91000001','sm91000002','sm91000003'],'explicit show-NG restores the confirmed NG card');
 await page.evaluate(()=>testModel.config.ngMovieVisible.value=false);
 await page.evaluate(()=>requests.find(r=>r.id==='sm91000003').fail());
 await page.waitForFunction(()=>testModel.movies.get('sm91000003').error.type!=='NO_ERROR');
 assert.deepEqual(await visible(),['sm91000001','sm91000003'],'failed metadata does not leave native cards hidden');
 // Route re-entry must use the same show-first policy with fresh held requests.
 await page.evaluate(html=>{
  const next=new DOMParser().parseFromString(html,'text/html').getElementById('results').innerHTML.replaceAll('sm9100000','sm9200000');
  history.pushState({},'','/tag/next');document.getElementById('results').innerHTML=next;
 },html);
 await page.waitForFunction(()=>testModel.movies.get('sm92000001')&&requests.some(r=>r.id==='sm92000001'));
 assert.deepEqual(await visible(),['sm92000001','sm92000002','sm92000003'],'SPA starts with all native cards visible again');
 assert.equal(await cards.count(),3);
 assert.deepEqual(errors,[]);
 console.log('Initial visibility PASS: document-start and SPA show all native cards; confirmed NG disappears; show-NG and request failure preserve expected visibility.');
} finally {await browser.close();}
