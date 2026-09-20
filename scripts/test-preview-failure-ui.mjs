// Real controller/CSS/data layer; synthetic DOM, transport and media only.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const sources=await Promise.all(['preview-data.js','hover-preview.js'].map(n=>readFile(new URL('../src/preview/'+n,import.meta.url),'utf8')));
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
const errors=[];
try {
 for(const mode of ['pending','http400','mediaPending','playing']) {
  const page=await browser.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
  await page.goto('http://nrn.test/tag/fixture');
  await page.setContent('<style>.card{width:320px;height:200px}.nrn-thumb-anchor-wrap{width:320px;height:180px;background:rgb(80,160,220)}a{display:block;width:100%;height:100%}</style><div class="card" data-nrn-autofill="true" data-decoration-video-id="sm123"><div class="nrn-thumb-anchor-wrap"><a href="/watch/sm123">synthetic thumbnail</a></div></div>');
  for(const source of sources)await page.addScriptTag({content:source});
  await page.evaluate(mode=>{
   const style=document.createElement('style');style.textContent=HoverPreview.css;document.head.append(style);
   window.calls=0;window.destroyed=0;window.mediaReady=false;
   HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
   HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
   window.setting={value:true,on(){},off(){}};
   window.preview=HoverPreview.create({doc:document,_sourceUrl:location.href},{hoverPreviewEnabled:setting},{
    load:mode==='http400'?((id,opts)=>PreviewData.load(id,{...opts,fetch:async()=>{calls++;return {ok:false,status:400}}})):
      async()=>{calls++;if(mode==='pending')await new Promise(r=>window.resolvePending=r);return {url:'https://delivery.domand.nicovideo.jp/hls/synthetic',duration:60,expiresAt:Date.now()+60000}},
    comments:async()=>[],
    media:video=>{Object.defineProperty(video,'readyState',{get:()=>mediaReady?2:0});Object.defineProperty(video,'videoWidth',{get:()=>mediaReady?320:0});Object.defineProperty(video,'videoHeight',{get:()=>mediaReady?180:0});return {destroy(){destroyed++}}}
   });
  },mode);
  await page.locator('.card').hover();await page.waitForFunction(()=>calls===1);
  if(mode==='http400') {
   await page.waitForFunction(()=>preview.snapshot().unavailable===1);
   assert.equal(await page.locator('.nrn-preview').count(),0,'failed HTTP must restore the thumbnail, not leave a black layer');
   assert.equal(await page.evaluate(()=>calls),1,'HTTP failure must not retry itself');
   await page.locator('a').click();await page.waitForURL('**/watch/sm123');
  } else {
   if(mode!=='pending')await page.waitForFunction(()=>document.querySelector('video'));
   assert.equal(await page.locator('.nrn-preview').evaluate(el=>getComputedStyle(el).visibility),'hidden','until a usable frame, thumbnail remains unobscured');
   if(mode==='playing') {
    await page.evaluate(()=>{mediaReady=true;document.querySelector('video').dispatchEvent(new Event('loadeddata'))});
    await page.waitForFunction(()=>preview.snapshot().playing===1);
    assert.equal(await page.locator('.nrn-preview').evaluate(el=>getComputedStyle(el).visibility),'visible');
    await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('error')));
    await page.waitForFunction(()=>preview.snapshot().error===1);
    assert.equal(await page.locator('.nrn-preview').count(),0,'media failure removes the shown overlay');
    assert.equal(await page.evaluate(()=>destroyed),1);
   }
   await page.mouse.move(700,500);await page.waitForFunction(()=>!document.querySelector('.nrn-preview'));
   if(mode==='pending') {await page.evaluate(()=>resolvePending());await page.waitForTimeout(30);assert.equal(await page.locator('video').count(),0)}
   await page.evaluate(()=>preview.dispose());
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Preview failure UI PASS: loading and first-frame wait preserve thumbnail; HTTP400/media error remove overlay; original link works; late response is ignored. Synthetic only.');
} finally {await browser.close()}
