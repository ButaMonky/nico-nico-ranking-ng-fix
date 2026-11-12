import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source=await readFile(output,'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('https://www.nicovideo.jp/tag/fixture');
 const layoutFixture=await readFile(new URL('./test-result-layout.mjs',import.meta.url),'utf8');
 const css=layoutFixture.match(/const css=`([\s\S]*?)`;/)[1].replaceAll('\\\\','\\');
 await page.setContent('<style>'+css+'.nrn-movie-title{display:block;margin:12px 0;height:40px} .nrn-card-body>div:has(>time[datetime]){margin-bottom:16px} </style><main><div class="d_grid"><div data-decoration-video-id="sm100" data-anchor-area="main"></div></div></main>');
 const marker='  var Diagnostics = (function() {';
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.testAPI={ListPage};})();'});
 await page.evaluate(()=>{
  window.p=new testAPI.ListPage(document);
  const style=document.createElement('style');style.textContent=p.css;document.head.append(style);
  window.card=p._createInjectedTile({id:'sm123',title:'fixture',registeredAt:'2026-11-11T11:00:00Z',duration:60,owner:{type:'user',id:42,name:'owner'}});
  card.classList.remove('nrn-autofill-pending');
 });
 // A consumer can resolve a stats click without knowing the injecting script.
 const expected='/watch/sm123';
 assert.equal(await page.evaluate(()=>card.querySelector('time[datetime]').closest('[data-anchor-href]')?.getAttribute('data-anchor-href')),expected);
 assert.equal(await page.evaluate(()=>card.getAttribute('data-group')),'true');
 assert.equal(await page.evaluate(()=>card.querySelector('a[href*="/user/"]').getAttribute('data-group-ignore')),'true');
 assert.equal(await page.evaluate(()=>card.querySelector('a[href*="/user/"]').getAttribute('href')),'https://www.nicovideo.jp/user/42');
 // The card metadata must not rewrite video/owner links or install broad cancellation.
 assert.deepEqual(await page.evaluate(()=>[...card.querySelectorAll('a[href*="/watch/"]')].map(a=>new URL(a.href).pathname)),[expected,expected]);
 // Optional cross-project check against a locally built Zenza distribution.
 if(process.env.ZENZA_REPO) {
  const cwd=process.cwd();let consumer;
  try {
   process.chdir(process.env.ZENZA_REPO);
   const {beginSection,extract}=require(process.cwd()+'/test/helpers/extractSource.js');
   consumer=beginSection('packages/lib/src/nico/nicoUtil.js')+'\n'+extract('dist/ZenzaWatch-dev.user.js','HoverMenu');
  } finally {process.chdir(cwd);}
  await page.addScriptTag({content:consumer+';window.consumer=Object.create(HoverMenu.prototype);'});
 }
 for(const mode of ['list','tile']) {
  await page.evaluate(mode=>{card.parentElement.className=mode==='tile'?'d_grid':'d_flex flex-d_column gap_x3';p.resultLayout.add(card);},mode);
  assert.equal(await page.evaluate(()=>card.getAttribute('data-anchor-href')),expected);
  if(process.env.ZENZA_REPO) {
   const decisions=await page.evaluate(()=>{
    const result={};
    const toggle=document.createElement('span');toggle.textContent='details';card.append(toggle);
    const button=document.createElement('button');button.textContent='menu';card.append(button);
    const nodes={image:card.querySelector('img'),title:card.querySelector('.nrn-movie-title'),date:card.querySelector('time[datetime]'),count:card.querySelector('time[datetime]').nextElementSibling,owner:card.querySelector('a[href*="/user/"]'),toggle,button};
    for(const [key,node] of Object.entries(nodes)){
     node.addEventListener('click',e=>{result[key]=!!consumer._resolveWatchClick(e);e.preventDefault();},{once:true});
     node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,composed:true,button:0}));
    }
    toggle.remove();button.remove();return result;
   });
   assert.deepEqual(decisions,{image:true,title:true,date:true,count:true,owner:false,toggle:false,button:false},mode+' generated consumer');
   // Real hit testing on the injected DOM, including its actual layout wrapper.
   const gap=await page.evaluate(()=>{
    const title=card.querySelector('.nrn-movie-title').getBoundingClientRect();
    const stats=card.querySelector('time[datetime]').parentElement.getBoundingClientRect();
    return {x:(Math.max(title.left,stats.left)+Math.min(title.right,stats.right))/2,y:(title.bottom+stats.top)/2,height:stats.top-title.bottom};
   });
   assert.ok(gap.height>0,mode+' has a title/stats gap');
   await page.evaluate(()=>{window.gapDecision=null;document.addEventListener('click',e=>{gapDecision=!!consumer._resolveWatchClick(e);e.preventDefault();},{once:true,capture:true});});
   await page.mouse.click(gap.x,gap.y);
   assert.equal(await page.evaluate(()=>gapDecision),true,mode+' injected title/stats whitespace');
  }
 }
 console.log('Injected card routing PASS: route metadata, owner exclusion, unchanged links, list/tile.');
} finally {await browser.close();}
