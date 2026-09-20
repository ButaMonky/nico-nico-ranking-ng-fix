// Saved official DOM contract; synthetic media and fully intercepted networking.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const sources=await Promise.all(['preview-audio.js','hover-preview.js'].map(async name=>{
 try{return await readFile(new URL('../src/preview/'+name,import.meta.url),'utf8')}catch(error){if(name==='preview-audio.js'&&error.code==='ENOENT')return '';throw error}
}));
// The two public SVGs in the supplied static Icon asset, not private React state.
const paths={
 muted:'m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm12.3 4.12 2.52-2.52a.96.96 0 0 1 1.36 0l.24.24c.37.38.37.99 0 1.36L20.2 12l2.52 2.52c.37.37.37.98 0 1.36l-.24.24a.96.96 0 0 1-1.36 0L18.6 13.6l-2.52 2.52a.96.96 0 0 1-1.36 0l-.24-.24a.96.96 0 0 1 0-1.36L17 12l-2.52-2.52a.96.96 0 0 1 0-1.36l.24-.24a.96.96 0 0 1 1.36 0z',
 sound:'m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm11.3-2.05.13-.15.31-.32a.9.9 0 0 1 1.2-.04 11 11 0 0 1 0 16.56.9.9 0 0 1-1.2-.04l-.2-.2-.12-.12a.9.9 0 0 1 .05-1.29 9 9 0 0 0 1.85-2.23l.04-.07.07-.13.02-.03.02-.04a9 9 0 0 0 .97-3.1v-.05q.06-.48.06-.98c0-2.32-.9-4.44-2.38-6.01l-.02-.03-.02-.01-.19-.2-.03-.04-.03-.02-.42-.4-.13-.18h-.01V5.1l-.02-.04a.9.9 0 0 1 .04-.8zm-2.92 2.9q.12-.14.24-.25a.9.9 0 0 1 1.16-.07q.3.23.56.49a6.6 6.6 0 0 1-.6 9.91l-.01.01q-.21.15-.47.15h-.01a1 1 0 0 1-.63-.25l-.2-.2-.12-.12-.14-.2h-.01l-.01-.03a.9.9 0 0 1 .24-1.09 4.38 4.38 0 0 0 0-6.97.87.87 0 0 1-.08-1.3l.04-.05z'
};
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage({viewport:{width:1200,height:700}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<style>.card{width:320px;height:220px;display:inline-block}.nrn-thumb-anchor-wrap{width:320px;height:180px}#native-slot{position:absolute;left:800px;top:0}</style><div id="native-slot"></div><div id="added" class="card" data-nrn-autofill="true" data-decoration-video-id="sm123"><div class="nrn-thumb-anchor-wrap">synthetic thumbnail</div></div><div id="unrelated"><video muted></video><button aria-label="プレビュー再生のミュート切り替え">unrelated</button></div>');
 for(const source of sources)if(source)await page.addScriptTag({content:source});
 await page.evaluate(paths=>{
  window.nativeMuted=false;window.nativeClicks=0;window.nativeDelay=0;window.unrelatedClicks=0;
  document.querySelector('#unrelated button').onclick=()=>unrelatedClicks++;
  HTMLMediaElement.prototype.play=function(){for(const [key,value] of Object.entries({readyState:2,videoWidth:320,videoHeight:180}))Object.defineProperty(this,key,{configurable:true,get:()=>value});return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  window.renderNative=()=>{for(const card of document.querySelectorAll('.native')){card.querySelector('path').setAttribute('d',nativeMuted?paths.muted:paths.sound);card.querySelector('video').muted=nativeMuted}};
  window.mountNative=(id='sm456')=>{
   const card=document.createElement('div');card.className='native';card.dataset.decorationVideoId=id;card.dataset.anchorArea='main';
   card.innerHTML='<video></video><button aria-label="プレビュー再生のミュート切り替え"><svg viewBox="0 0 24 24"><path></path></svg></button>';
   card.querySelector('button').onclick=()=>{if(card._pressUntil>Date.now())return;card._pressUntil=Date.now()+200;nativeClicks++;nativeMuted=!nativeMuted;if(nativeDelay)setTimeout(renderNative,nativeDelay);else renderNative()};
   document.querySelector('#native-slot').append(card);renderNative();return card;
  };
  window.createPreview=()=>HoverPreview.create({doc:document,_sourceUrl:location.href},{hoverPreviewEnabled:{value:true,on(){},off(){}}},{load:async()=>({duration:60,expiresAt:Date.now()+60000}),comments:async()=>[],media:()=>({destroy(){}})});
  mountNative();window.preview=createPreview();
  const style=document.createElement('style');style.textContent=HoverPreview.css;document.head.append(style);
 },paths);
 const added=()=>page.locator('#added video');
 const toggle=()=>page.evaluate(()=>document.querySelector('#added .nrn-preview-mute').click());
 await page.locator('#added').hover();await page.waitForFunction(()=>preview.snapshot().playing===1);
 assert.equal(await added().evaluate(v=>v.muted),false,'an already unmuted native preview supplies the initial injected sound state');
 await toggle();await page.waitForFunction(()=>nativeMuted===true);
 assert.equal(await added().evaluate(v=>v.muted),true,'injected toggle updates both preview types');
 await page.waitForTimeout(210);
 await page.evaluate(()=>document.querySelector('.native button').click());
 await page.waitForFunction(()=>document.querySelector('#added video').muted===false);
 assert.equal(await page.locator('#added .nrn-preview-mute').getAttribute('aria-pressed'),'true','native toggle updates the injected button');
 await page.waitForTimeout(210);
 await toggle();await toggle();
 assert.equal(await added().evaluate(v=>v.muted),true,'injected mute uses the same 200ms onPress throttle as native buttons');
 await page.waitForTimeout(210);await toggle();await page.waitForTimeout(210);
 // Async native rendering must not cause an observer feedback loop or lose the newest intent.
 await page.evaluate(()=>{nativeDelay=40;nativeClicks=0;const shared=PreviewAudio.forDocument(document);shared.setMuted(true);shared.setMuted(false)});
 await page.waitForFunction(()=>nativeMuted===false&&nativeClicks===2);
 await page.waitForTimeout(80);
 assert.equal(await added().evaluate(v=>v.muted),false);
 assert.equal(await page.evaluate(()=>nativeClicks),2,'one real native toggle per required change, without retry loops');
 // A real native click can overtake our update before its delayed DOM render.
 await page.waitForTimeout(210);
 await page.evaluate(()=>mountNative('sm987'));
 await page.evaluate(()=>{document.querySelector('#added .nrn-preview-mute').click();document.querySelectorAll('.native button')[1].click()});
 await page.waitForTimeout(100);
 assert.equal(await added().evaluate(v=>v.muted),false,'a newer native click wins even when its resulting icon equals the old rendered icon');
 await page.waitForTimeout(110);
 // No native button exists during most injected hovers: retain intent until lazy mount.
 await page.evaluate(()=>{document.querySelector('#native-slot').replaceChildren();nativeDelay=0});await toggle();
 assert.equal(await added().evaluate(v=>v.muted),true);
 await page.evaluate(()=>{preview.dispose();history.pushState({},'', '/tag/next');window.preview=createPreview();mountNative()});
 await page.waitForFunction(()=>nativeMuted===true);
 await page.mouse.move(1000,650);await page.locator('#added').hover();await page.waitForFunction(()=>preview.snapshot().playing===1);
 assert.equal(await added().evaluate(v=>v.muted),true,'sound choice survives controller disposal and SPA route replacement');
 // Change a later native card while the first card is temporarily stale.
 await page.evaluate(paths=>{const newer=mountNative('sm789');nativeMuted=false;newer.querySelector('path').setAttribute('d',paths.sound)},paths);
 await page.waitForFunction(()=>document.querySelector('#added video').muted===false);
 assert.equal(await page.evaluate(()=>unrelatedClicks),0);
 assert.equal(await page.locator('#unrelated video').evaluate(v=>v.muted),true,'unrelated/watch media remains untouched');
 // Disposing removes the injected subscriber; pagehide suspends bridge DOM activity.
 await page.evaluate(()=>{preview.dispose();window.dispatchEvent(new Event('pagehide'));nativeClicks=0;document.querySelector('#native-slot').replaceChildren();mountNative()});
 await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>nativeClicks),0);
 assert.equal(await page.locator('#added video').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'mute sharing is memory only');
 assert.deepEqual(errors,[]);
 console.log('Preview audio PASS: native/injected sharing, delayed toggles, lazy mount, SPA lifetime, stale controls, media isolation, disposal. Synthetic only.');
} finally {await browser.close()}
