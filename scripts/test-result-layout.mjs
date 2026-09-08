import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const playwright=require(process.env.NRN_PLAYWRIGHT || '<local-path>');
await build();
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 await page.route('**/*',r=>r.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
 await page.goto('https://www.nicovideo.jp/tag/test');
 const fixtures={};
 for(const mode of ['list','tile']) fixtures[mode]=await readFile(new URL(`../tests/fixtures/layout-${mode}.html`,import.meta.url),'utf8');
 // Captured markup has no stylesheet: model only the site's relevant utility rules.
 const css=`body{font:16px sans-serif;margin:20px} *{box-sizing:border-box} a{color:inherit;text-decoration:none}
 .d_flex{display:flex}.flex-d_column{flex-direction:column}.d_grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px 16px}
 .gap_base{gap:16px}.gap_x3{gap:24px}.w_100\\%{width:100%}.min-w_100\\%{min-width:100%}
 .max-w_thumbnail\\.max{max-width:640px}.min-w_thumbnail\\.min{min-width:160px}
 .w_thumbnail\\.l,.min-w_thumbnail\\.l{width:320px;min-width:320px}
 .asp_16\\:9{aspect-ratio:16/9}.pos_relative{position:relative}.pos_absolute{position:absolute}
 .cq-t_inline-size{container-type:inline-size}.ov_hidden{overflow:hidden}
 img.mx_auto{width:100%;height:100%;object-fit:contain}img.bdr_full{width:24px;height:24px}svg{width:16px;height:16px}
 .bottom_x0_5{bottom:4px}.right_x0_5{right:4px}.nrn-card-body>div>time{font-size:12px}`;
 await page.setContent('<style>'+css+'</style><main id="fixture">'+fixtures.list+'</main>');
 const source=await readFile(output,'utf8');
 const marker='  var Diagnostics = (function() {';
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.testAPI={ListPage,ResultLayout}; })();'});
 await page.evaluate(()=>{
  window.p=new testAPI.ListPage(document);
  const style=document.createElement('style');style.textContent=p.css;document.head.appendChild(style);
  window.parsed=p.parse();
  window.native=parsed[0].rootElem;
  window.root=new testAPI.ListPage.MovieRoot(native);root.movieId=parsed[0].movie.id;p.movieRoots.push(root);
  // Bind a real title node, toggle, and detail panel, then preserve their identities.
  window.title=root.titleElem;
  root.elem.append(root.movieInfo.elem,root.movieInfo.toggle);
  window.toggle=root.movieInfo.toggle;
  native.classList.add('nrn-hide','nrn-thumb-info-done');
  window.extra=p._createInjectedTile({id:'sm99999999',title:'追加動画',description:'説明文',duration:120,thumbnail:{url:''},owner:{id:1,name:'テスト投稿者'}});
  extra.classList.remove('nrn-autofill-pending');
  window.hiddenExtra=p._createInjectedTile({id:'sm99999998',title:'NG動画',owner:{id:1,name:'投稿者'}});
  hiddenExtra.classList.remove('nrn-autofill-pending');hiddenExtra.classList.add('nrn-hide');
  window.pendingExtra=p._createInjectedTile({id:'sm99999997',title:'処理中動画',owner:{id:1,name:'投稿者'}});
  window.calls=0;p.observeMutation(rows=>{calls++;rows.forEach(r=>r.rootElem.classList.add('nrn-parsed'));});
  // Mark remaining cards as already processed to isolate display-only notifications.
  parsed.slice(1).forEach(r=>r.rootElem.classList.add('nrn-parsed'));
 });
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>extra.querySelector('.nrn-thumb-anchor-wrap').getBoundingClientRect().width),320);
 assert.equal(await page.evaluate(()=>extra.querySelector('.nrn-thumb-anchor-wrap').getBoundingClientRect().height),180);
 assert.equal(await page.evaluate(()=>extra.querySelector('.nrn-movie-title').getBoundingClientRect().left-extra.querySelector('.nrn-thumb-anchor-wrap').getBoundingClientRect().right),16);
 assert.equal(await page.evaluate(()=>getComputedStyle(native).display),'none');
 assert.equal(await page.evaluate(()=>parsed.filter(r=>r.type==='main').every(r=>r.rootElem.hasAttribute('data-decoration-video-id'))),true);
 for(const mode of ['tile','list','tile','list']) {
  await page.evaluate(html=>document.getElementById('fixture').innerHTML=html,fixtures[mode]);
  // Unprocessed other fixture cards may legitimately call parse; mark them before observer delivery.
  // Only the first card above is bound in this focused test.
  await page.waitForTimeout(70);
  await page.evaluate(()=>document.querySelectorAll('[data-decoration-video-id]:not([data-nrn-autofill])').forEach(e=>e.classList.add('nrn-parsed')));
  await page.waitForTimeout(50);
  const state=await page.evaluate(()=>({connected:extra.isConnected,mode:extra.dataset.nrnResultLayout,rootConnected:root.elem.isConnected,hidden:getComputedStyle(root.elem).display,title:root.titleElem===title,toggle:root.movieInfo.toggle===toggle,toggleConnected:toggle.isConnected,count:document.querySelectorAll('[data-nrn-autofill="true"]').length,width:extra.querySelector('.nrn-thumb-anchor-wrap').getBoundingClientRect().width}));
  assert.equal(state.mode,mode);assert.equal(state.connected,true);assert.equal(state.rootConnected,true);
  assert.equal(state.hidden,'none');assert.equal(state.title,true);assert.equal(state.toggle,true);assert.equal(state.toggleConnected,true);assert.equal(state.count,3);
  assert.equal(await page.evaluate(()=>hiddenExtra.isConnected && pendingExtra.isConnected && getComputedStyle(hiddenExtra).display==='none' && getComputedStyle(pendingExtra).display==='none'),true);
  assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-nrn-autofill="true"]'),e=>e.getAttribute('data-decoration-video-id'))),['sm99999999','sm99999998','sm99999997']);
  if(mode==='list')assert.equal(state.width,320);else assert.ok(state.width<320);
 }
 // The other React update strategy: retain root, replace its children/classes.
 await page.evaluate(html=>{
   const doc=new DOMParser().parseFromString(html,'text/html');
   const fresh=doc.querySelector('[data-decoration-video-id]');
   root.elem.innerHTML=fresh.innerHTML;
   root.elem.className=fresh.className;
 },fixtures.list);
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>root.titleElem===title && toggle.isConnected && root.elem.classList.contains('nrn-hide')),true);
 // Class-only switch: React can retain the container and all children.
 await page.evaluate(()=>{const host=extra.parentElement;host.className='d_grid';});
 await page.waitForTimeout(70);
 assert.equal(await page.evaluate(()=>extra.dataset.nrnResultLayout),'tile');
 const before=await page.evaluate(()=>calls);
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>calls),before,'observer settles without self-triggering parse loop');
 // A display-only mutation must not call setup/request through the observer callback.
 await page.evaluate(()=>{window.calls=0;extra.parentElement.className='d_flex flex-d_column gap_x3';});
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>calls),0,'no model setup or metadata request on mode switch');
 await page.evaluate(()=>{history.pushState({},'', '/tag/other');extra.remove();});
 await page.waitForTimeout(70);
 assert.equal(await page.evaluate(()=>extra.isConnected),false,'never restore old results into another route');
 console.log('Result layout PASS: captured list/tile markup, 320px list thumbnails, four replacements, content/class-only updates, node/state preservation, no duplicate injection, no setup on mode switch, observer settles, route isolation.');
} finally {await browser.close();}
