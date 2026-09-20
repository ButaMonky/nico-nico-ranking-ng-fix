import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
let fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const source=(await readFile(output,'utf8')).replace('model = createModel(config)','model = createModel(config); window.testModel = model')
 .replace('  var Main =','  window.testTypes={NicoPage,Movie}; var Main =');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://nrn.test/tag/metadata');
 await page.setContent('<main aria-label="nicovideo-content"><section><div id="results">'+fixture+'</div></section></main>');
 // This scenario deliberately uses a card with validated owner evidence. Mixed/unknown cards must still fetch.
 fixture=await page.locator('[data-decoration-video-id]').first().evaluate(el=>el.outerHTML);
 await page.evaluate(html=>{document.getElementById('results').innerHTML=html;},fixture);
 await page.evaluate(()=>{
  window.requests=[];window.aborts=0;
  window.GM_getValue=(key,fallback)=>({autoFillEnabled:false,openNewWindow:false}[key]??fallback);
  window.GM_setValue=()=>{};
  window.GM_xmlhttpRequest=options=>{
   const id=options.url.split('/').pop();
   const deliver=()=>options.onload({status:200,responseText:`<nicovideo_thumb_response status="ok"><thumb><video_id>${id}</video_id><title>synthetic</title><description>synthetic description</description><tags><tag lock="1">synthetic-tag</tag></tags><user_id>42</user_id><user_nickname>synthetic-owner</user_nickname></thumb></nicovideo_thumb_response>`});
   requests.push({id,deliver});return {abort(){aborts++;options.onabort?.();}};
  };
 });
 await page.addScriptTag({content:source});
 await page.waitForFunction(()=>window.testModel && document.querySelector('.nrn-metadata-settled'));
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>requests.length),0,'owner-only initial cards need zero individual requests');
 assert.equal(await page.evaluate(()=>[...testModel.movies._idToMovie.values()].some(m=>m.thumbInfoDone)),false);
 const toggle=page.locator('.nrn-movie-info-toggle').first();
 assert.ok(await toggle.count());await toggle.click();
 await page.waitForFunction(()=>requests.length===1);
 await page.evaluate(()=>requests[0].deliver());
 await page.waitForFunction(()=>document.querySelector('.nrn-movie-info-container')?.textContent.includes('synthetic-tag'));
 assert.equal(await page.evaluate(()=>requests.length),1,'opening one card details requests that card once');
 await page.evaluate(()=>testModel.config.ngTags.add('synthetic-tag'));
 await page.waitForFunction(()=>[...testModel.movies._idToMovie.values()].every(m=>m.thumbInfoDone || requests.some(r=>r.id===m.id)));
 await page.evaluate(()=>requests.forEach(r=>r.deliver()));
 assert.equal(await page.evaluate(()=>[...testModel.movies._idToMovie.values()].every(m=>m.ng)),true);
 const description=await page.evaluate(()=>{
  const host=document.createElement('div');host.innerHTML='<div class="itemData"></div><p class="itemDescription">summary</p>';document.body.append(host);
  const m=new testTypes.Movie('sm88888881','synthetic'),root=new testTypes.NicoPage.MovieRoot(host);root.bindToMovie(m);
  root.toggleDescription();m.description='late description sm123';
  const shown=root._descriptionExpanded,text=root.description.elem.querySelector('.nrn-description-text').textContent;
  root.toggleDescription();root.toggleDescription();
  const reopened=root.description.elem.querySelector('.nrn-description-text').textContent;
  root.unbind();host.remove();return {shown,text,reopened};
 });
 assert.deepEqual(description,{shown:true,text:'late description sm123',reopened:'late description sm123'});
 // One held request belongs to the outgoing generation, including the same ID on return.
 await page.evaluate(fixture=>{
  history.pushState({},'','/tag/held');
  document.getElementById('results').innerHTML=fixture.replace(/sm\d+/g,'sm99999981');
 },fixture);
 await page.waitForFunction(()=>requests.some(r=>r.id==='sm99999981'));
 await page.evaluate(fixture=>{
  history.pushState({},'','/tag/replacement');
  document.getElementById('results').innerHTML=fixture.replace(/sm\d+/g,'sm99999982');
 },fixture);
 await page.waitForFunction(()=>testModel.movies.get('sm99999982'));
 await page.evaluate(()=>requests.filter(r=>r.id==='sm99999981').forEach(r=>r.deliver()));
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm99999982').thumbInfoDone),false);
 assert.ok(await page.evaluate(()=>aborts>0));
 await page.evaluate(()=>requests.filter(r=>r.id==='sm99999982').forEach(r=>r.deliver()));
 await page.waitForFunction(()=>testModel.movies.get('sm99999982').thumbInfoDone);
 assert.deepEqual(errors,[]);
 console.log('Offline browser PASS: owner-only 0 requests; opening one card 1; rule change fetches missing tags; old SPA response ignored.');
} finally {await browser.close();}
