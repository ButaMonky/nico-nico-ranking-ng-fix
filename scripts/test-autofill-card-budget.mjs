import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {build,root as wt,output} from './build.mjs';
await build();
const source=fs.readFileSync(output,'utf8');
const injected=source.replace('model = createModel(config)','model = createModel(config); window.testModel=model; window.testPage=page')
 .replace('      model.diagnostics?.runtime(function() {','      window.rebalanceForTest=rebalanceOverflow; window.countProbe=()=>({initialized,fetching,phase,total:visibleTotalCount(),original:visibleOriginalCount(),injected:visibleInjectedCount(),originalTracked:originalRoots.length,tracked:page.movieRoots.length});\n      model.diagnostics?.runtime(function() {');
const fixture=fs.readFileSync(path.join(wt,'tests/fixtures/layout-list.html'),'utf8');
const {makeScenario}=await import(pathToFileURL(path.join(wt,'scripts/lib/autofill-fixture.mjs')));
const data=makeScenario('none');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
const records=[];
try{
 for(const mode of ['duplicate-ads','late-ads','unique-ads','refill-duplicate-ads','refill-unique-ads','refill-reveal-ng']){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  let html='<!doctype html><html><body></body></html>';const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>r.fulfill({contentType:r.request().resourceType()==='document'?'text/html':'image/svg+xml',body:r.request().resourceType()==='document'?html:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'}));
  await page.goto('http://nrn.test/tag/fixture');
  html=await page.evaluate(({fixture,items,mode})=>{
   const parser=new DOMParser(),doc=parser.parseFromString('<!doctype html><html><head></head><body><main aria-label="nicovideo-content"><section><div id="results" class="cq-t_inline-size"><div id="cards" class="d_flex flex-d_column gap_x3"></div></div></section></main><nav data-scope="pagination"><a data-part="item" data-index="1" data-selected href="?page=1">1</a><a data-part="item" data-index="4" href="?page=4">4</a></nav></body></html>','text/html');
   const template=parser.parseFromString(fixture,'text/html').querySelector('[data-decoration-video-id]');
   const list=doc.getElementById('cards'),initial=items.slice(0,mode.startsWith('refill-')?8:36);
   for(const item of initial){
    const node=parser.parseFromString(template.outerHTML.replaceAll(template.dataset.decorationVideoId,item.id),'text/html').body.firstElementChild;
    for(const a of node.querySelectorAll('a[href]')){
     if(a.getAttribute('href').startsWith('/watch/')&&!a.querySelector('img')){a.textContent=item.title;a.title=item.title;}
     if(a.href.includes('/user/')){a.href='https://www.nicovideo.jp/user/12';a.dataset.anchorHref=a.href;const p=a.querySelector('p');if(p)p.textContent='Fixture owner';}
    }list.append(node);
   }
   const adIds=mode.includes('duplicate')?initial.slice(0,5).map(x=>x.id):items.slice(120,125).map(x=>x.id);
   if(mode!=='late-ads')for(const id of adIds){const a=doc.createElement('a');a.href='/watch/'+id;a.dataset.anchorArea='main';a.dataset.anchorDetail='nicoad';a.className='probe-ad';a.style.cssText='display:block;width:320px;min-height:100px';a.innerHTML='<div><img src="https://example.invalid/ad.svg"><p>Ad fixture</p></div>';list.prepend(a);}
   const meta=doc.createElement('meta');meta.name='server-response';meta.content=JSON.stringify({data:{response:{$getSearchVideoV2:{data:{items:initial,totalCount:128}}}}});doc.head.append(meta);
   return '<!doctype html>'+doc.documentElement.outerHTML;
  },{fixture,items:data.items,mode});
  await context.addInitScript(({settings,details,pages})=>{
   window.wire={page:0,detail:0,other:0};
   window.GM_getValue=(k,d)=>Object.hasOwn(settings,k)?(Array.isArray(settings[k])?JSON.stringify(settings[k]):settings[k]):d;
   window.GM_setValue=()=>{};
   window.GM_xmlhttpRequest=o=>{const id=String(o.url).split('/').pop();if(!String(o.url).includes('/getthumbinfo/')||!details[id]){wire.other++;o.onerror?.({});return {abort(){}};}
    wire.detail++;const timer=setTimeout(()=>o.onload?.({status:200,responseText:details[id]}),1);return {abort(){clearTimeout(timer);o.onabort?.();}};};
   window.fetch=async value=>{const u=new URL(value,location.href);if(u.origin!==location.origin||u.pathname!=='/tag/fixture'){wire.other++;throw Error('Unexpected network');}wire.page++;return new Response(pages[Number(u.searchParams.get('page')||1)]||pages.end,{status:200});};
  },{settings:{...data.settings,autoFillTargetCount:36,autoFillAdMode:'none',...(mode==='refill-reveal-ng'?{ngMovies:['sm10','sm11','sm12']}:{})},details:Object.fromEntries(data.items.map(x=>[x.id,data.xml(x.id)])),pages:Object.fromEntries([1,2,3,4,5,6,7,8,9].map(i=>[i,data.html(i)]).concat([['end',data.html(20)]]))});
  await page.goto('http://nrn.test/tag/fixture');await page.addScriptTag({content:injected});
  await page.waitForFunction(()=>window.countProbe?.().initialized&&!countProbe().fetching,{},{timeout:20000});
  if(mode==='late-ads'){
   await page.evaluate(()=>{for(let i=121;i<=125;i++){const a=document.createElement('a');a.href='/watch/sm'+i;a.dataset.anchorArea='main';a.dataset.anchorDetail='nicoad';a.className='probe-ad';a.style.cssText='display:block;width:320px;min-height:100px';a.innerHTML='<div><img src="https://example.invalid/ad.svg"><p>Ad fixture</p></div>';document.getElementById('cards').prepend(a);}});
   await page.waitForFunction(()=>testPage.movieRoots.length>=41,{},{timeout:10000});
  }
  await page.waitForTimeout(700);
  const result=await page.evaluate(()=>({state:countProbe(),wire,displayedCards:testPage.movieRoots.filter(r=>r.elem.isConnected&&r.elem.getClientRects().length&&getComputedStyle(r.elem).visibility!=='hidden').length,displayedAds:[...document.querySelectorAll('.probe-ad')].filter(e=>e.getClientRects().length).length}));
  records.push({mode,...result,errors});
  assert.deepEqual(errors,[],mode);
  assert.equal(result.wire.other,0,'no unplanned metadata transport');
  // BRUSH-063: the target is only a loading goal. Native cards (36 ordinary +
  // 5 ad slots) are never hidden to trim the page down to it.
  const expectedVisible=mode.startsWith('refill-')?36:41;
  assert.equal(result.displayedCards,expectedVisible,mode+': visible cards include ads, not unique IDs');
  assert.equal(result.state.total,expectedVisible,mode+': reported count agrees with screen');
  assert.equal(result.displayedAds,5,mode+': five first-position ad slots count toward target');
  if(mode==='refill-reveal-ng'){
   // BRUSH-075: remembered NG IDs are skipped before loading. "NG動画を表示"
   // adds them as NG cards, in source order, and the target is unchanged.
   const onPage=()=>page.evaluate(()=>['sm10','sm11','sm12'].map(id=>testPage.movieRoots.filter(r=>r.movieId===id&&r.elem.isConnected&&r.elem.getClientRects().length).length));
   assert.deepEqual(await onPage(),[0,0,0],'skipped before loading');
   const excludedBefore=await page.evaluate(()=>testPage._autoFillNgExcluded());
   assert.ok(excludedBefore>=3,'counted as NG');
   const detailBefore=await page.evaluate(()=>wire.page);
   await page.evaluate(()=>testModel.config.ngMovieVisible.value=true);
   await page.waitForFunction(()=>['sm10','sm11','sm12'].every(id=>testPage.movieRoots.some(r=>r.movieId===id&&r.elem.isConnected&&r.elem.getClientRects().length)),{},{timeout:10000});
   assert.deepEqual(await onPage(),[1,1,1],'each shown once');
   assert.equal(await page.evaluate(()=>wire.page),detailBefore,'no page refetch');
   const ord=await page.evaluate(()=>[...document.querySelectorAll('[data-decoration-video-id]')].map(e=>e.dataset.decorationVideoId).filter(id=>['sm9','sm10','sm11','sm12','sm13'].includes(id)));
   assert.deepEqual(ord,['sm9','sm10','sm11','sm12','sm13'],'source order');
   assert.equal(await page.evaluate(()=>countProbe().total),36,'NG cards never count toward the target');
   assert.equal(await page.evaluate(()=>testPage._autoFillNgExcluded()),excludedBefore-3,'not counted twice');
   await page.evaluate(()=>testModel.config.ngMovieVisible.value=false);
   await page.waitForFunction(()=>['sm10','sm11','sm12'].every(id=>testPage.movieRoots.filter(r=>r.movieId===id).every(r=>!r.elem.getClientRects().length)),{},{timeout:10000});
   assert.equal(await page.evaluate(()=>countProbe().total),36);
   console.log(mode+' PASS');await context.close();continue;
  }
  if(mode.startsWith('refill-')){
   assert.equal(result.state.original,13,'8 ordinary + 5 ad slots');
   assert.equal(result.state.injected,23,'fill 23 rather than 28');
   assert.equal(result.wire.page,2,'bounded real fixture page fetches');
   assert.equal(result.wire.detail,mode.includes('duplicate')?0:5,'per-video details are shared, not per card');
   console.log(mode+' PASS');await context.close();continue;
  }
  const order=await page.evaluate(()=>{const roots=[...testPage.movieRoots].sort((a,b)=>a.elem.compareDocumentPosition(b.elem)&4?-1:1);return {all:roots.map(r=>r.movieId),visible:roots.filter(r=>r.elem.getClientRects().length).map(r=>r.movieId)};});
  assert.deepEqual(order.visible,order.all,mode+': every native card stays visible in document order');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.nrn-autofill-overflow').length),0,mode+': no native overflow');
  const requestsBefore=await page.evaluate(()=>wire.page);
  await page.evaluate(()=>testModel.config.ngMovies.add('sm1'));
  const afterNg=mode==='duplicate-ads'?39:40; // sm1 is also one of the duplicate ad slots
  await page.waitForFunction(n=>countProbe().total===n&&!countProbe().fetching&&testPage.movieRoots.filter(r=>r.movieId==='sm1').every(r=>!r.elem.getClientRects().length),afterNg,{timeout:10000});
  assert.equal(await page.evaluate(()=>wire.page),requestsBefore,'still above target: no fetch');
  // BRUSH-069: showing NG videos neither counts them toward the target nor
  // lets the target hide any card.
  await page.evaluate(()=>testModel.config.ngMovieVisible.value=true);
  await page.waitForTimeout(200);
  const shown=await page.evaluate(()=>({total:countProbe().total,
    ngVisible:testPage.movieRoots.filter(r=>r.movieId==='sm1').every(r=>r.elem.getClientRects().length>0),
    overflow:document.querySelectorAll('.nrn-autofill-overflow').length}));
  assert.deepEqual(shown,{total:afterNg,ngVisible:true,overflow:0},mode+': NG shown: count unchanged, NG visible, nothing trimmed');
  await page.evaluate(()=>testModel.config.ngMovieVisible.value=false);
  await page.evaluate(()=>testModel.config.ngMovies.clear());
  await page.waitForFunction(()=>countProbe().total===41&&!countProbe().fetching,{},{timeout:10000});
  const writes=await page.evaluate(()=>{
   const observer=new MutationObserver(()=>{});
   observer.observe(document.getElementById('cards'),{subtree:true,attributes:true,attributeFilter:['class']});
   for(let i=0;i<10;i++)rebalanceForTest();
   const count=observer.takeRecords().length;observer.disconnect();return count;
  });
  assert.equal(writes,0,'a stable rebalance must not remove/re-add overflow classes');
  await page.evaluate(()=>testModel.config.autoFillTargetCount.value=20);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>testPage.movieRoots.filter(r=>r.elem.isConnected&&r.elem.getClientRects().length).length),41,'a lower target never hides native cards');
  await page.evaluate(()=>testModel.config.autoFillTargetCount.value=36);
  await page.waitForFunction(()=>countProbe().total===41&&!countProbe().fetching,{},{timeout:10000});
  await page.evaluate(()=>testModel.config.autoFillEnabled.value=false);
  await page.waitForFunction(()=>testPage.movieRoots.every(r=>!r.elem.classList.contains('nrn-autofill-overflow')),{},{timeout:10000});
  assert.equal(await page.evaluate(()=>testPage.movieRoots.filter(r=>r.elem.isConnected&&r.elem.getClientRects().length).length),41,'OFF restores, never deletes');
  console.log(mode+' PASS');
  await context.close();
 }
 console.log('Card budget PASS: physical slots include duplicate/late/native ads; native cards are never trimmed to the target; refill fills to the target; synthetic only.');
}finally{await browser.close();}
