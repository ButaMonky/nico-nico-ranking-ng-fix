import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const source=await readFile(new URL('../src/preview/hover-preview.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<style>.card{width:320px;height:220px;display:inline-block}.nrn-thumb-anchor-wrap{width:320px;height:180px;position:relative}.nrn-hide{display:none}</style>'+['native','a','b'].map((id,i)=>`<div id="${id}" class="card" ${i?'data-nrn-autofill="true"':''} data-decoration-video-id="sm${i+1}"><div class="nrn-thumb-anchor-wrap"><a href="/watch/sm${i+1}">synthetic</a></div></div>`).join(''));
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{
  window.requests=[];window.destroyed=0;window.plays=0;window.commentsCalls=0;window.hold=false;window.pending=[];
  HTMLMediaElement.prototype.play=function(){plays++;return window.rejectPlay?Promise.reject(new DOMException('blocked','NotAllowedError')):Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  window.store={value:false,listeners:new Set(),on(n,f){this.listeners.add(f)},off(n,f){this.listeners.delete(f)}};
  window.route={doc:document,_disposed:false,_sourceUrl:location.href};
  window.preview=HoverPreview.create(route,{hoverPreviewEnabled:store},{
   load:async(id,{signal})=>{requests.push({id,signal});if(hold)await new Promise(r=>pending.push(r));return {url:'https://delivery.domand.nicovideo.jp/hls/synthetic',duration:40,expiresAt:Date.now()+60000}},
   comments:async()=>{commentsCalls++;return [{vposMs:0,text:'<b>synthetic</b>',commands:[]}]},
   media:()=>({destroy(){destroyed++}})
  });
 });
 await page.locator('#a').hover();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>requests.length),0,'disabled means zero fetches');
 await page.evaluate(()=>{store.value=true;for(const f of store.listeners)f(true)});
 await page.locator('#native').hover();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>requests.length),0,'native card gets no controller requests');
 await page.locator('#a').hover();await page.locator('#native').hover();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>requests.length),0,'short hover cancels before fetch');
 await page.locator('#a').hover();await page.waitForFunction(()=>requests.length===1&&plays===1);
 assert.equal(await page.locator('#a .nrn-preview video').count(),1);
 assert.equal(await page.locator('#native .nrn-preview').count(),0);
 assert.equal(await page.locator('#a video').evaluate(v=>v.muted),true);
 await page.locator('#a .nrn-preview-mute').click();
 assert.equal(await page.locator('#a video').evaluate(v=>v.muted),false,'explicit button unmutes');
 assert.equal(new URL(page.url()).pathname,'/tag/fixture','button does not navigate');
 await page.locator('#b').hover();await page.waitForFunction(()=>requests.length===2&&plays>=3);
 assert.equal(await page.locator('.nrn-preview video').count(),1,'one active video');
 assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);
 await page.evaluate(()=>document.querySelector('#b').classList.add('nrn-hide'));
 await page.waitForFunction(()=>!document.querySelector('.nrn-preview video'));
 assert.equal(await page.evaluate(()=>requests[1].signal.aborted),true,'NG hide aborts');
 await page.evaluate(()=>{document.querySelector('#b').classList.remove('nrn-hide');hold=true});
 await page.locator('#native').hover();await page.locator('#a').hover();await page.waitForFunction(()=>requests.length===3);
 await page.locator('#native').hover();await page.evaluate(()=>pending.shift()());await page.waitForTimeout(40);
 assert.equal(await page.locator('.nrn-preview video').count(),0,'late fetch cannot mount after leave');
 assert.equal(await page.evaluate(()=>commentsCalls),2,'stale result does not fetch comments');
 await page.locator('#a').hover();await page.waitForFunction(()=>requests.length===4);
 await page.evaluate(()=>{document.querySelector('#a').dataset.decorationVideoId='sm99';pending.shift()()});await page.waitForTimeout(40);
 assert.equal(await page.locator('.nrn-preview video').count(),0,'reused card ID invalidates session');
 await page.evaluate(()=>{hold=false;rejectPlay=true});
 await page.locator('#native').hover();await page.locator('#a').hover();await page.waitForFunction(()=>document.querySelector('.nrn-preview')?.dataset.phase==='blocked');
 assert.equal(await page.locator('.nrn-preview video').count(),0,'play rejection releases media');
 await page.locator('#native').hover();await page.evaluate(()=>{rejectPlay=false});
 await page.locator('#a').hover();await page.waitForFunction(()=>document.querySelector('.nrn-preview video'));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await page.locator('.nrn-preview video').count(),0,'background tab stops');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(250);assert.equal(await page.locator('.nrn-preview video').count(),0,'visibility restoration does not auto restart');
 await page.locator('#native').hover();await page.locator('#a').hover();await page.waitForFunction(()=>document.querySelector('.nrn-preview video'));
 await page.evaluate(()=>{store.value=false;for(const f of store.listeners)f(false)});
 assert.equal(await page.locator('.nrn-preview').count(),0,'setting OFF tears down');
 await page.evaluate(()=>{store.value=true;for(const f of store.listeners)f(true)});
 await page.locator('#native').hover();await page.locator('#a').hover();await page.waitForFunction(()=>document.querySelector('.nrn-preview video'));
 await page.evaluate(()=>preview.dispose());
 assert.equal(await page.locator('.nrn-preview').count(),0,'route dispose tears down');
 const count=await page.evaluate(()=>requests.length);
 await page.locator('#b').hover();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>requests.length),count,'no listeners after dispose');
 assert.deepEqual(errors,[]);
 console.log('Preview fixture PASS: OFF/native/transient hover zero requests; one media; mute; NG hide; stale result; ID reuse; play refusal; hidden; setting OFF; route disposal.');
} finally {await browser.close()}
