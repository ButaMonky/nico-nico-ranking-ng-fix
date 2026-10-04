import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
// BRUSH-054A offline browser check: ListPage.observeMutation re-parses only for result-related DOM.
// Synthetic parent-document UI stands in for player overlays; this is not ZenzaWatch and not a live site.
const require=createRequire(import.meta.url);
const playwright=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
const failures=[];
const check=(name,fn)=>{try{fn()}catch(e){failures.push(name+': '+e.message)}};
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/test');
 const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
 await page.setContent('<main id="fixture" aria-label="nicovideo-content">'+fixture+'</main><nav data-scope="pagination" id="pager"><a data-part="item" href="?page=1">1</a></nav>');
 const source=await readFile(output,'utf8');
 const marker='  var Diagnostics = (function() {';
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.testAPI={ListPage}; })();'});
 await page.evaluate(()=>{
  window.template=document.querySelector('[data-decoration-video-id]').cloneNode(true);
  window.p=new testAPI.ListPage(document);
  window.stats={parse:0,callbacks:[],owners:[],roots:0,pager:0};
  const parse=p.parse;p.parse=function(...a){stats.parse++;return parse.apply(this,a)};
  p._onAutoFillRootsChanged=()=>stats.roots++;p._refreshPagerAnnotations=()=>stats.pager++;
  for(const r of p.parse())r.rootElem.classList.add('nrn-parsed');
  window.bar={elem:Object.assign(document.createElement('div'),{id:'nrn-config-bar-test'})};p.addConfigBar(bar);
  window.host=document.querySelector('[data-decoration-video-id]').parentElement;
  window.cloneCard=id=>{const c=template.cloneNode(true);const old=c.getAttribute('data-decoration-video-id');
   c.setAttribute('data-decoration-video-id',id);for(const n of [c,...c.querySelectorAll('*')]){for(const cls of [...n.classList])if(cls.startsWith('nrn-'))n.classList.remove(cls)}
   for(const a of c.querySelectorAll('a[href]'))a.setAttribute('href',a.getAttribute('href').replace(old,id));return c};
  p.observeMutation(rows=>{stats.callbacks.push(rows.map(r=>r.type+':'+r.movie.id));rows.forEach(r=>r.rootElem.classList.add('nrn-parsed'))},rows=>stats.owners.push(rows.map(r=>r.movie.id)));
 });
 const settle=()=>page.waitForTimeout(80);
 const snap=()=>page.evaluate(()=>JSON.parse(JSON.stringify(stats)));
 await settle();let base=await snap();
 // F. Stable page: no observer-driven parse.
 await page.waitForTimeout(300);let s=await snap();
 check('F stable',()=>assert.equal(s.parse-base.parse,0));
 // A/G. Unrelated parent-document UI updated every frame, then opened/closed like an overlay.
 base=s;
 await page.evaluate(async()=>{
  const ui=document.createElement('aside');ui.id='synthetic-player-ui';ui.innerHTML='<div id="c"></div><div id="k"></div>';document.body.append(ui);
  for(let i=0;i<30;i++){await new Promise(r=>requestAnimationFrame(r));
   const d=document.createElement('div');d.textContent='tick '+i;ui.querySelector('#k').replaceChildren(d);ui.classList.toggle('open');ui.querySelector('#c').style.transform='translateX('+i+'px)';}
  ui.remove();
 });
 await settle();s=await snap();
 check('A/G unrelated UI and overlay open/close',()=>assert.equal(s.parse-base.parse,0,'parse calls '+(s.parse-base.parse)));
 // G (continued) + B. After the overlay is gone, a new result card is still detected.
 base=s;
 await page.evaluate(()=>host.append(cloneCard('sm90000001')));
 await settle();s=await snap();
 check('B new card after overlay',()=>assert.ok(s.callbacks.slice(base.callbacks.length).flat().includes('main:sm90000001'),JSON.stringify(s.callbacks)));
 // D. Late owner row inside a parsed card: owner refresh only.
 base=s;
 await page.evaluate(()=>{const card=document.querySelector('[data-decoration-video-id="sm90000001"]');
  card.querySelectorAll('a[data-group-ignore="true"][data-anchor-area="main"]').forEach(a=>a.remove());});
 await settle();base=await snap();
 await page.evaluate(()=>{const card=document.querySelector('[data-decoration-video-id="sm90000001"]');const a=document.createElement('a');
  a.setAttribute('data-group-ignore','true');a.setAttribute('data-anchor-area','main');a.href='https://www.nicovideo.jp/user/7';a.textContent='late owner';card.append(a);});
 await settle();s=await snap();
 check('D late owner refresh',()=>assert.ok(s.owners.slice(base.owners.length).flat().includes('sm90000001'),JSON.stringify(s.owners)));
 check('D late owner no full parse',()=>assert.equal(s.parse-base.parse,0,'parse calls '+(s.parse-base.parse)));
 // E. Late ad card: parsed and reported to the physical card budget.
 base=s;
 await page.evaluate(()=>{const ad=document.createElement('a');ad.setAttribute('data-anchor-area','main');ad.setAttribute('href','/watch/sm90000002');
  ad.innerHTML='<div><p>広告 sm90000002</p></div>';host.append(ad);});
 await settle();s=await snap();
 check('E late ad parsed',()=>assert.ok(s.callbacks.slice(base.callbacks.length).flat().includes('ads:sm90000002'),JSON.stringify(s.callbacks)));
 check('E card budget notified',()=>assert.ok(s.roots>base.roots));
 // Card removal still reaches the card budget.
 base=s;
 await page.evaluate(()=>document.querySelector('[data-decoration-video-id="sm90000001"]').remove());
 await settle();s=await snap();
 check('removal notifies budget',()=>assert.ok(s.roots>base.roots));
 // Pagination re-render.
 base=s;
 await page.evaluate(()=>{const n=document.createElement('nav');n.setAttribute('data-scope','pagination');n.innerHTML='<a data-part="item" href="?page=2">2</a>';document.getElementById('pager').replaceWith(n)});
 await settle();s=await snap();
 check('pagination refresh',()=>assert.ok(s.pager>base.pager));
 // Removed config bar is restored.
 await page.evaluate(()=>bar.elem.remove());
 await settle();
 const barBack=await page.evaluate(()=>bar.elem.isConnected);
 check('config bar restored',()=>assert.equal(barBack,true));
 // Native list/tile switch on the results host still reaches the layout sync (via parse).
 base=await snap();
 await page.evaluate(()=>{host.className=host.className.includes('d_grid')?'d_flex flex-d_column gap_x3':'d_grid'});
 await settle();s=await snap();
 check('host class switch',()=>assert.ok(s.parse>base.parse));
 // C. Whole results container replaced (SPA-style) with fresh cards.
 base=await snap();
 await page.evaluate(()=>{const fresh=document.createElement('div');fresh.className=host.className;fresh.append(cloneCard('sm90000003'),cloneCard('sm90000004'));
  const wrap=document.createElement('section');wrap.append(fresh);document.getElementById('fixture').replaceChildren(wrap);});
 await settle();s=await snap();
 check('C container replacement',()=>{const ids=s.callbacks.slice(base.callbacks.length).flat();assert.ok(ids.includes('main:sm90000003')&&ids.includes('main:sm90000004'),JSON.stringify(ids))});
 // Zero results, then results again.
 await page.evaluate(()=>document.getElementById('fixture').replaceChildren(Object.assign(document.createElement('p'),{textContent:'該当なし'})));
 await settle();base=await snap();
 await page.evaluate(()=>{const d=document.createElement('div');d.className='d_flex flex-d_column';d.append(cloneCard('sm90000005'));document.getElementById('fixture').replaceChildren(d)});
 await settle();s=await snap();
 check('empty then results',()=>assert.ok(s.callbacks.slice(base.callbacks.length).flat().includes('main:sm90000005')));
 // Unrelated UI again after all of the above: still no parse.
 base=s;
 await page.evaluate(async()=>{const ui=document.createElement('div');document.body.append(ui);for(let i=0;i<10;i++){await new Promise(r=>requestAnimationFrame(r));ui.textContent='x'+i;ui.className='c'+i}ui.remove()});
 await settle();s=await snap();
 check('A again',()=>assert.equal(s.parse-base.parse,0,'parse calls '+(s.parse-base.parse)));
 check('no page errors',()=>assert.deepEqual(errors,[]));
 if(failures.length){console.error('Observer boundary FAIL:\n - '+failures.join('\n - '));process.exitCode=1}
 else console.log('Observer boundary PASS: stable 0 parse, unrelated UI/overlay open-close 0 parse, new card, late owner (owner refresh only), late ad + card budget, removal, pagination, config bar, container replacement, empty->results. Offline synthetic only.');
} finally {await browser.close();}
