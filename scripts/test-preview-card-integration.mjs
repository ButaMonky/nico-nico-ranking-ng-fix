// Real injected-card builder, NG action pane, layout CSS and preview together.
// Media/network are synthetic; no site/account or saved-page scripts are used.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
await build();
const source=await readFile(output,'utf8');
const layoutTest=await readFile(new URL('./test-result-layout.mjs',import.meta.url),'utf8');
const css=layoutTest.match(/const css=`([\s\S]*?)`;/)[1].replaceAll('\\\\','\\');
const previewSources=await Promise.all(['preview-data.js','hover-preview.js'].map(n=>readFile(new URL('../src/preview/'+n,import.meta.url),'utf8')));
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage({viewport:{width:1000,height:750}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<style>'+css+'body{margin:80px 30px}.d_grid{grid-template-columns:repeat(2,320px)}:root{--colors-text-on-layer-accent-lust:#ff3333}.text-layer_lowEm{color:#888}</style><main><div class="d_grid"><div data-decoration-video-id="sm100" data-anchor-area="main" data-anchor="1"><a href="/watch/sm100">native fixture</a></div></div></main>');
 await page.addScriptTag({content:source.slice(0,source.indexOf('  var Diagnostics = (function() {'))+'window.api={ListPage,NicoPage};})();'});
 for(const s of previewSources)await page.addScriptTag({content:s});
 await page.evaluate(()=>{
  window.p=new api.ListPage(document);
  const style=document.createElement('style');style.textContent=p.css+HoverPreview.css;document.head.append(style);
  window.extra=p._createInjectedTile({id:'sm123',title:'synthetic card',registeredAt:new Date(Date.now()-18*3600000).toISOString(),duration:90,owner:{id:1,name:'fixture'}});
  extra.classList.remove('nrn-autofill-pending');
  const root=new api.ListPage.MovieRoot(extra);root.actionPane=new api.NicoPage.ActionPane(document,{id:'sm123',title:'synthetic card'});
  window.paint=[];window.time=1;
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y){paint.push({x,y,text});return fill.call(this,text,x,y)};
  HTMLMediaElement.prototype.play=function(){for(const [k,v] of Object.entries({readyState:2,videoWidth:320,videoHeight:180}))Object.defineProperty(this,k,{configurable:true,get:()=>v});Object.defineProperty(this,'currentTime',{configurable:true,get:()=>window.time});return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  window.preview=HoverPreview.create({doc:document,_sourceUrl:location.href},{hoverPreviewEnabled:{value:true,on(){},off(){}}},{load:async()=>({duration:90,expiresAt:Date.now()+60000}),media:()=>({destroy(){}}),comments:async()=>[{vposMs:0,text:'moving comment',commands:[]}]});
 });
 await page.locator('[data-nrn-autofill="true"] .nrn-thumb-anchor-wrap').hover();
 await page.waitForFunction(()=>preview.snapshot().playing===1&&paint.length>0);
 const issues=[];
 const hit=await page.locator('.nrn-preview-mute').evaluate(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b}});
 if(!hit.hit)issues.push('NG action pane covers mute button');
 const registered=await page.locator('[data-nrn-autofill="true"] .nrn-card-body > div > time').evaluate(t=>({text:t.textContent,color:getComputedStyle(t).color,datetime:t.dateTime,title:t.title}));
 if(registered.color!=='rgb(255, 51, 51)')issues.push('recent upload lacks official accent color');
 if(!registered.datetime||!registered.title)issues.push('upload date/time attributes absent');
 assert.equal(registered.text,'18時間前');
 await page.evaluate(()=>window.time=2);
 await page.waitForFunction(()=>paint.length>1&&paint.at(-1).x<paint[0].x);
 assert.deepEqual(issues,[]);
 await page.locator('.nrn-preview-mute').click();assert.equal(await page.locator('video').evaluate(v=>v.muted),false);
 assert.equal(new URL(page.url()).pathname,'/tag/fixture');
 // The NG bar can wrap on narrow cards, but every line stays above the image.
 for(const width of [208,160]) {
  await page.evaluate(width=>extra.style.width=width+'px',width);
  await page.locator('[data-nrn-autofill="true"] .nrn-thumb-anchor-wrap').hover();
  await page.waitForFunction(()=>document.querySelector('.nrn-preview[data-phase="playing"]'));
  assert.equal(await page.evaluate(()=>{
   const b=document.querySelector('.nrn-preview-mute'),r=b.getBoundingClientRect(),pane=extra.querySelector('.nrn-action-pane').getBoundingClientRect(),host=extra.querySelector('.nrn-thumb-anchor-wrap').getBoundingClientRect();
   return pane.bottom<=host.top&&[[2,2],[26,2],[2,26],[26,26],[14,14]].every(([x,y])=>document.elementFromPoint(r.x+x,r.y+y)?.closest('button')===b);
  }),true,'wrapped NG actions cannot cover any part of the mute button');
 }
 const dates=await page.evaluate(()=>{
  const now=Date.now();Date.now=()=>now;
  return [0,23.99,24,48].map((hours,index)=>{
   const el=p._createInjectedTile({id:'sm'+(200+index),title:'date boundary',registeredAt:new Date(now-hours*3600000).toISOString()});
   const t=el.querySelector('.nrn-registered-at');return {color:getComputedStyle(t).color,datetime:t.dateTime,title:t.title};
  });
 });
 assert.deepEqual(dates.map(t=>t.color),['rgb(255, 51, 51)','rgb(255, 51, 51)','rgb(136, 136, 136)','rgb(136, 136, 136)']);
 assert.ok(dates.every(t=>Number.isFinite(Date.parse(t.datetime))&&/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(t.title)));
 await page.evaluate(()=>preview.dispose());
 assert.equal(await page.locator('video,canvas,.nrn-preview').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Preview/card integration PASS: unobscured mute, recent-time color, moving comment and cleanup.');
}finally{await browser.close()}
