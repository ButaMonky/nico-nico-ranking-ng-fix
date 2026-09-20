// Saved official behavior, exercised with synthetic cards/media and no external network.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const sources=await Promise.all(['preview-data.js','hover-preview.js'].map(n=>readFile(new URL('../src/preview/'+n,import.meta.url),'utf8')));
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<style>.card{width:320px;height:240px}.nrn-thumb-anchor-wrap{width:320px;height:180px;position:relative;background:#579}a{display:block;width:100%;height:100%}</style><div id="card" class="card" data-nrn-autofill="true" data-decoration-video-id="sm123"><div class="nrn-thumb-anchor-wrap"><a href="/watch/sm123">synthetic thumbnail</a></div><div>synthetic title</div></div>');
 for(const source of sources)await page.addScriptTag({content:source});
 await page.evaluate(()=>{
  const style=document.createElement('style');style.textContent=HoverPreview.css;document.head.append(style);
  localStorage.setItem('@nvweb-packages/video-renderer',JSON.stringify({data:{volume:{data:.72,meta:{}},commentAlpha:{data:'low',meta:{}}}}));
  window.calls=0;window.commentsCalls=0;window.paint=[];window.pendingLoad=null;window.loadSignal=null;
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y){paint.push({text,x,y,color:this.fillStyle,font:this.font});return fill.call(this,text,x,y)};
  HTMLMediaElement.prototype.play=function(){for(const [k,v] of Object.entries({readyState:2,videoWidth:320,videoHeight:180,currentTime:1}))Object.defineProperty(this,k,{configurable:true,get:()=>v});return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  window.preview=HoverPreview.create({doc:document,_sourceUrl:location.href},{hoverPreviewEnabled:{value:true,on(){},off(){}}},{
   load:async(_id,{signal})=>{calls++;loadSignal=signal;if(calls===1)await new Promise(resolve=>pendingLoad=resolve);return {duration:60,expiresAt:Date.now()+60000}},media:()=>({destroy(){}}),
   comments:async()=>{commentsCalls++;return [{vposMs:0,text:'top',commands:['ue','red','big']},{vposMs:0,text:'bottom',commands:['shita','blue','small']},{vposMs:0,text:'default',commands:[]}]}
  });
 });
 await page.mouse.move(20,20);await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>calls),0,'card entry still requires the separate 200ms hover delay');
 // Keep moving for longer than the old unconditional 200ms timer.
 for(let i=0;i<14;i++){await page.mouse.move(20+i*4,30);await page.waitForTimeout(20)}
 assert.equal(await page.evaluate(()=>calls),0,'continuous pointer movement must not start fetching');
 await page.waitForFunction(()=>calls===1);
 await page.mouse.move(100,40);await page.mouse.move(130,60);
 await page.evaluate(()=>document.dispatchEvent(new Event('scroll')));
 assert.equal(await page.evaluate(()=>loadSignal.aborted),false,'moving within the thumbnail or in-view scrolling preserves the active loading request');
 await page.evaluate(()=>pendingLoad());
 await page.waitForFunction(()=>preview.snapshot().playing===1);
 assert.equal(await page.evaluate(()=>calls),1,'loading movement must reuse the same request');
 assert.equal(await page.locator('video').evaluate(v=>v.volume),.72,'saved official volume is used');
 assert.equal(await page.locator('canvas').evaluate(v=>getComputedStyle(v).opacity),'0.6');
 assert.equal(await page.locator('.nrn-preview-progress').evaluate(v=>v.getBoundingClientRect().height),4,'saved noncompact seekbar is four pixels high');
 const button=page.locator('.nrn-preview-mute');
 assert.deepEqual(await button.evaluate(b=>{const r=b.getBoundingClientRect(),h=b.closest('.nrn-thumb-anchor-wrap').getBoundingClientRect();return {width:r.width,height:r.height,right:h.right-r.right,top:r.top-h.top,svg:!!b.querySelector('svg'),text:b.textContent}}),{width:28,height:28,right:4,top:4,svg:true,text:''});
 await button.click();assert.equal(await page.locator('video').evaluate(v=>v.muted),false);
 await page.evaluate(()=>document.dispatchEvent(new Event('scroll')));await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>calls),1,'in-view scroll does not restart a playing preview');
 assert.equal(await page.locator('video').count(),1);
 await page.waitForFunction(()=>paint.some(p=>p.text==='top')&&paint.some(p=>p.text==='bottom'));
 const painted=await page.evaluate(()=>({top:paint.find(p=>p.text==='top'),bottom:paint.find(p=>p.text==='bottom'),normal:paint.find(p=>p.text==='default')}));
 assert.equal(painted.top.color,'#ff0000');assert.equal(painted.bottom.color,'#0000ff');
 assert.ok(painted.top.y<painted.bottom.y,'fixed upper/lower commands occupy different edges');
 assert.notEqual(painted.top.font,painted.bottom.font,'size commands change rendering');
 assert.equal(painted.normal.font,painted.top.font,'preview enlarges unstyled comments to big');
 await page.mouse.move(700,500);await page.waitForFunction(()=>!document.querySelector('video'));
 await page.evaluate(()=>document.dispatchEvent(new Event('scroll')));
 await page.mouse.move(30,30);await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>calls),1,'scroll settling must suppress early preview start');
 await page.waitForFunction(()=>calls===2&&preview.snapshot().playing===2);
 await page.mouse.move(700,500);await page.waitForFunction(()=>!document.querySelector('video'));
 await page.evaluate(()=>localStorage.setItem('@nvweb-packages/video-renderer',JSON.stringify({data:{isCommentVisible:{data:false,meta:{}}}})));
 await page.mouse.move(30,30);await page.waitForFunction(()=>preview.snapshot().playing===3);
 assert.equal(await page.evaluate(()=>commentsCalls),2,'hidden comments require no comment fetch');
 await page.evaluate(()=>preview.dispose());
 assert.equal(await page.locator('video,canvas,.nrn-preview-loading').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Official preview contract PASS: motion/scroll gates, saved preferences, icon position, command drawing, cleanup. Synthetic only.');
} finally {await browser.close()}
