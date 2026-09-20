// Saved official hover debounce (200ms), media presence exit (medium = 300ms).
// A synthetic clock/media makes boundary and identity assertions deterministic.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const source=await readFile(new URL('../src/preview/hover-preview.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage({viewport:{width:1200,height:700}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<style>.card{width:320px;height:220px;display:inline-block}.nrn-thumb-anchor-wrap{width:320px;height:180px;position:relative}.nrn-hide{display:none}</style>'+['a','b'].map((id,index)=>`<div id="${id}" class="card" data-nrn-autofill="true" data-decoration-video-id="sm${index+1}"><div class="nrn-thumb-anchor-wrap">synthetic</div></div>`).join('')+'<div id="outside">outside</div><div id="portal" data-nrn-preview-card-ref="b"><button>synthetic associated menu</button></div>');
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.clock.pauseAt(new Date('2026-01-01T00:00:10Z'));
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{
  const style=document.createElement('style');style.textContent=HoverPreview.css;document.head.append(style);
  window.loads=[];window.serial=0;window.destroyed=[];window.pointer=document.querySelector('#outside');
  HTMLMediaElement.prototype.play=function(){if(!this._serial){this._serial=++serial;this._started=Date.now();Object.defineProperties(this,{readyState:{get:()=>2},videoWidth:{get:()=>320},videoHeight:{get:()=>180},currentTime:{get:()=>Math.max(0,(Date.now()-this._started)/1000)}})}this._paused=false;return window.holdPlay?new Promise(resolve=>window.resumePlay=resolve):Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){this._paused=true};HTMLMediaElement.prototype.load=function(){};
  window.move=selector=>{const next=document.querySelector(selector);pointer.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:next}));next.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:pointer}));pointer=next};
  window.makePreview=()=>HoverPreview.create({doc:document,_sourceUrl:location.href},{hoverPreviewEnabled:{value:true,on(){},off(){}}},{
   load:async(id,{signal})=>{loads.push({id,signal});return {duration:60,expiresAt:Date.now()+60000}},comments:async()=>[],media:video=>({destroy(){destroyed.push(video._serial)}})
  });window.preview=makePreview();
 });
 const move=selector=>page.evaluate(selector=>move(selector),selector);
 const tick=ms=>page.clock.runFor(ms);
 const state=selector=>page.locator(selector).evaluate(root=>{const video=root.querySelector('video'),layer=root.querySelector('.nrn-preview');return {serial:video?._serial||null,time:video?.currentTime||0,paused:video?._paused,closing:layer?.dataset.closing==='true'}});
 await move('#a');await tick(250);const first=await state('#a');assert.ok(first.serial);
 await move('#outside');await tick(199);
 assert.equal((await state('#a')).serial,first.serial,'official leave debounce keeps the exact media for 200ms');
 await tick(1);assert.equal((await state('#a')).closing,true);
 assert.deepEqual(await page.locator('#a').evaluate(root=>({media:getComputedStyle(root.querySelector('.nrn-preview')).animationDuration,controls:getComputedStyle(root.querySelector('.nrn-preview-controls')).animationDuration})),{media:'0.3s',controls:'0.5s'});
 await tick(150);const halfway=await state('#a');
 assert.equal(halfway.serial,first.serial);assert.equal(halfway.paused,false);assert.ok(halfway.time>first.time,'the actual player continues during fade, not a screenshot');
 await tick(150);assert.equal((await state('#a')).serial,null,'media unmounts after the 300ms exit animation');
 assert.equal(await page.evaluate(()=>loads[0].signal.aborted),true);
 assert.equal(await page.locator('#a .nrn-preview-controls').count(),1,'official controls remain for their longer 500ms fade');
 await tick(200);assert.equal(await page.locator('#a .nrn-preview-controls').count(),0);
 // Returning during leave debounce preserves playback without a new request.
 await move('#a');await tick(250);const second=await state('#a');
 await move('#outside');await tick(100);await move('#a');await tick(600);
 assert.equal((await state('#a')).serial,second.serial);
 assert.equal(await page.evaluate(()=>loads.length),2);
 // Returning early enough during fade revives the same mounted player after 200ms.
 await move('#outside');await tick(200);await move('#a');await tick(199);
 assert.equal((await state('#a')).closing,true);
 await tick(1);assert.equal((await state('#a')).closing,false);assert.equal((await state('#a')).serial,second.serial);
 // Returning too late lets the old presence unmount before the new hover commits.
 await move('#outside');await tick(400);await move('#a');await tick(100);
 assert.equal((await state('#a')).serial,null);
 await tick(100);assert.notEqual((await state('#a')).serial,second.serial);
 const third=(await state('#a')).serial;
 // Different cards have independent presence: outgoing media fades while new media starts.
 await move('#b');await tick(199);assert.equal((await state('#a')).serial,third);assert.equal((await state('#b')).serial,null);
 await tick(1);assert.ok((await state('#b')).serial);assert.equal((await state('#a')).closing,true);
 await tick(150);assert.equal(await page.locator('video').count(),2);
 await tick(150);assert.equal((await state('#a')).serial,null);const fourth=(await state('#b')).serial;
 await move('#portal button');await tick(600);
 assert.equal((await state('#b')).serial,fourth,'the associated portaled control retains its own card hover');
 await page.evaluate(()=>document.querySelector('#portal').dataset.nrnPreviewCardRef='a');
 await move('#outside');await tick(500);await move('#portal button');await tick(600);
 assert.equal(await page.locator('video').count(),0,'a portal never starts a preview that was not already active');
 await move('#a');await tick(250);await move('#b');await tick(200);
 assert.equal(await page.locator('video').count(),2);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await page.locator('video').count(),0,'hidden tab bypasses grace/fades for all players');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
 await move('#outside');await move('#a');await tick(250);
 await page.evaluate(()=>document.querySelector('#a').classList.add('nrn-hide'));
 assert.equal(await page.locator('video').count(),0,'NG hiding bypasses grace/fades');
 await page.evaluate(()=>document.querySelector('#a').classList.remove('nrn-hide'));
 await move('#outside');await move('#b');await tick(250);await move('#outside');await tick(200);
 await page.evaluate(()=>preview.dispose());
 assert.equal(await page.locator('video,.nrn-preview,.nrn-preview-controls,.nrn-preview-loading').count(),0,'dispose immediately cancels every active/fading session');
 await tick(1000);assert.equal(await page.locator('video').count(),0);
 // A deliberately slow theme duration exposes any jump from an unfinished
 // inner fade-in to an outer fade-out. Force the loading style to be painted
 // before allowing play, as happens with real asynchronous media readiness.
 await page.evaluate(()=>{document.documentElement.style.setProperty('--durations-medium','3s');holdPlay=true;preview=makePreview()});
 await move('#a');await tick(250);
 await page.locator('#a video').evaluate(video=>{for(let node=video;node;node=node.parentElement)getComputedStyle(node).opacity});
 await page.evaluate(()=>{holdPlay=false;resumePlay()});
 assert.equal(await page.locator('#a .nrn-preview').getAttribute('data-phase'),'playing');
 await page.locator('#a video').evaluate(video=>{for(let node=video;node;node=node.parentElement)getComputedStyle(node).opacity});
 await move('#outside');await tick(200);
 const effectiveOpacity=await page.locator('#a video').evaluate(video=>{let opacity=1;for(let node=video;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return opacity});
 assert.ok(effectiveOpacity<.5,'early exit must preserve the still-transparent inner fade-in instead of flashing to opaque');
 await page.evaluate(()=>preview.dispose());
 assert.deepEqual(errors,[]);
 console.log('Preview hover exit PASS: 200ms leave/reentry, live 300ms fade, independent cards, portal scope, NG/hidden/dispose cleanup. Synthetic only.');
} finally {await browser.close()}
