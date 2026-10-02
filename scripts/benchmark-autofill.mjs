import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {build,root,output} from './build.mjs';
import {makeScenario,scenarioNames} from './lib/autofill-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const ref=option('--ref','working'),selected=option('--scenario','all');
const stopMode=option('--exercise-stop','none');
if(!['none','target','disabled'].includes(stopMode))throw Error('Invalid stop mode');
if(ref!=='working'&&!/^[a-f0-9]{7,40}$/i.test(ref))throw Error('Invalid ref');
const names=selected==='all'?scenarioNames:[selected];for(const name of names)makeScenario(name);
const git=a=>execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:12*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
if(ref==='working')await build();
const source=ref==='working'?readFileSync(output,'utf8'):git(['show',ref+':dist/nico-nico-ranking-ng.user.js']);
const marker='      model.diagnostics?.runtime(function() {';
assert.equal(source.split(marker).length,2,'benchmark hook must be unique');
const instrumented=source.replace('model = createModel(config)','model = createModel(config); window.__nrnBenchModel=model')
 .replace(marker,'      window.__nrnBenchState=()=>({initialized,fetching,gaveUp,phase,visible:visibleTotalCount(),fetchedExtraPages,totalFetchedItems,totalDetailChecked,totalDuplicatesRemoved,lastTiming,cacheHits,cacheMisses,domCards:page.movieRoots.length,injectedCards:connectedInjectedRoots().length,ids:uniqueVisibleRoots([...connectedOriginalRoots(),...connectedInjectedRoots()]).map(r=>r.movieId)});\n'+marker);
const fixture=readFileSync(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
const results=[];
try{
 for(const name of names){
  const data=makeScenario(name),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  let initialHtml='';const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:initialHtml||'<!doctype html><html><body></body></html>'});
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
  });
  await page.goto('http://nrn.test/tag/fixture');
  initialHtml=await page.evaluate(({fixture,items,html})=>{
   const parse=s=>new DOMParser().parseFromString(s,'text/html'),old=parse(fixture),doc=parse(html);
   const template=old.querySelector('[data-decoration-video-id]'),originalId=template.dataset.decorationVideoId;
   const main=doc.createElement('main');main.setAttribute('aria-label','nicovideo-content');main.innerHTML='<section><div id="results" class="cq-t_inline-size"><div class="d_flex flex-d_column gap_x3"></div></div></section>';
   const list=main.querySelector('#results > div');
   for(const item of items){
    const node=parse(template.outerHTML.replaceAll(originalId,item.id)).body.firstElementChild;
    for(const a of node.querySelectorAll('a[href]')){
     if(a.getAttribute('href').startsWith('/watch/')&&!a.querySelector('img')){a.textContent=item.title;a.title=item.title;}
     if(a.href.includes('/user/')){a.href='https://www.nicovideo.jp/user/'+item.owner.id;a.dataset.anchorHref=a.href;const p=a.querySelector('p');if(p)p.textContent=item.owner.name;}
    }
    list.append(node);
   }
   doc.body.prepend(main);return '<!doctype html>'+doc.documentElement.outerHTML;
  },{fixture,items:data.initial,html:data.html(1)});
  await context.addInitScript(({settings,pages,details,holdFirst})=>{
   window.__nrnBenchWire={pageRequests:0,detailRequests:0,otherRequests:0,aborted:0,pageNumbers:[]};
   window.GM_getValue=(key,fallback)=>Object.hasOwn(settings,key)?(Array.isArray(settings[key])?JSON.stringify(settings[key]):settings[key]):fallback;
   window.GM_setValue=()=>{};
   window.GM_xmlhttpRequest=options=>{
    const url=String(options.url),id=url.split('/').pop();let done=false;
    if(!url.includes('/getthumbinfo/')||!details[id]){window.__nrnBenchWire.otherRequests++;throw Error('Unexpected fixture GM request');}
    window.__nrnBenchWire.detailRequests++;
    const timer=setTimeout(()=>{if(done)return;done=true;options.onload?.({status:200,responseText:details[id]});},2);
    return {abort(){if(done)return;done=true;clearTimeout(timer);window.__nrnBenchWire.aborted++;options.onabort?.();}};
   };
   window.fetch=(value,options={})=>new Promise((resolve,reject)=>{
    const url=new URL(String(value),location.href);let done=false;
    if(url.origin!==location.origin||url.pathname!=='/tag/fixture'){window.__nrnBenchWire.otherRequests++;reject(Error('Unexpected fixture fetch'));return;}
    window.__nrnBenchWire.pageRequests++;const n=Number(url.searchParams.get('page')||1);window.__nrnBenchWire.pageNumbers.push(n);
    const abort=()=>{if(done)return;done=true;clearTimeout(timer);window.__nrnBenchWire.aborted++;reject(new DOMException('Aborted','AbortError'));};
    let timer;const respond=()=>{if(done)return;done=true;options.signal?.removeEventListener('abort',abort);resolve(new Response(pages[n]||pages.end,{status:200,headers:{'content-type':'text/html'}}));};
    if(holdFirst){holdFirst=false;window.__nrnHeldPage={page:n,respond};}else timer=setTimeout(respond,2);
    if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
   });
  },{holdFirst:stopMode!=='none',settings:data.settings,pages:{...Object.fromEntries(Array.from({length:data.lastPage},(_,i)=>[i+1,data.html(i+1)])),end:data.html(data.lastPage+1)},details:Object.fromEntries(data.items.map(x=>[x.id,data.xml(x.id)]))});
  const pair=[];
  for(const cache of ['cold','warm']){
   await page.goto('http://nrn.test/tag/fixture');const started=performance.now();
   await page.addScriptTag({content:instrumented});
   let earlyStop=null;
   if(stopMode!=='none'){
    assert.equal(name,'none','early stop uses the deterministic no-NG fixture');
    await page.waitForFunction(()=>window.__nrnHeldPage,{},{timeout:5000});
    await page.evaluate(mode=>{if(mode==='target')window.__nrnBenchModel.config.autoFillTargetCount.value=8;else window.__nrnBenchModel.config.autoFillEnabled.value=false;},stopMode);
    await page.waitForFunction(mode=>{const s=window.__nrnBenchState?.();return s&&!s.fetching&&s.phase===(mode==='target'?'completed':'disabled');},stopMode,{timeout:5000});
    earlyStop=await page.evaluate(()=>({state:window.__nrnBenchState(),wire:window.__nrnBenchWire}));
    assert.equal(earlyStop.state.domCards,8);assert.equal(earlyStop.wire.pageRequests,1);assert.equal(earlyStop.wire.aborted,1);
    await page.evaluate(mode=>{if(mode==='target')window.__nrnBenchModel.config.autoFillTargetCount.value=12;else window.__nrnBenchModel.config.autoFillEnabled.value=true;},stopMode);
   }
   try {await page.waitForFunction(()=>{const s=window.__nrnBenchState?.();return s?.initialized&&!s.fetching&&['completed','stopped','error'].includes(s.phase);},{},{timeout:20000});}
   catch(error){throw Error(name+' '+cache+' benchmark did not settle: '+JSON.stringify({errors,...await page.evaluate(()=>({state:window.__nrnBenchState?.(),wire:window.__nrnBenchWire,rootCount:document.querySelectorAll('[data-decoration-video-id]').length,modelCount:window.__nrnBenchModel?.movies?._idToMovie?.size,badge:document.querySelector('#nrn-status-badge')?.textContent}))}));}
   const result=await page.evaluate(()=>({state:window.__nrnBenchState(),wire:window.__nrnBenchWire,initial:window.__nrnInitialPerformance}));
   result.elapsedMs=performance.now()-started;result.cache=cache;
   if(earlyStop){result.earlyStop=earlyStop;assert.deepEqual(result.wire.pageNumbers,[2,2],'resume must retry the cancelled page, not skip it');}
   assert.equal(result.state.phase,'completed',name+': '+JSON.stringify(result));assert.equal(result.state.visible,data.target,name);
   assert.deepEqual(result.state.ids,data.expectedIds,name+' must retain the original filtered order');assert.equal(result.wire.otherRequests,0,name);
   assert.deepEqual(errors,[],name);
   if(args.includes('--exercise-settings')){
    assert.equal(name,'title90','settings replay fixture is title90 only');
    const allowedIds=Array.from({length:12},(_,i)=>'sm'+(i+1));
    await page.evaluate(()=>window.__nrnBenchModel.config.ngTitles.clear());
    await page.waitForFunction(ids=>{const s=window.__nrnBenchState();return !s.fetching&&s.phase==='completed'&&JSON.stringify(s.ids)===JSON.stringify(ids);},allowedIds,{timeout:10000});
    const restored=await page.evaluate(()=>window.__nrnBenchState().ids);
    await page.evaluate(()=>window.__nrnBenchModel.config.ngTitles.add('DROP'));
    await page.waitForFunction(ids=>{const s=window.__nrnBenchState();return !s.fetching&&s.phase==='completed'&&JSON.stringify(s.ids)===JSON.stringify(ids);},data.expectedIds,{timeout:10000});
    result.settingsReplay={allowedIds:restored,filteredIds:await page.evaluate(()=>window.__nrnBenchState().ids)};
   }
   pair.push(result);await page.evaluate(()=>window.__nrnSessionDetailCacheService?.flush());
  }
  assert.ok(pair[1].wire.detailRequests<=pair[0].wire.detailRequests,name+' warm cache cannot increase requests');
  results.push({name,fixtureHash:createHash('sha256').update(JSON.stringify({items:data.items,settings:data.settings})).digest('hex'),runs:pair});
  await context.close();
 }
 console.log(JSON.stringify({format:'NRN-AUTOFILL-BENCHMARK-1',scope:'Offline synthetic browser; fixed 2ms response delay, no live service calls. Wall time includes startup/rendering; one cold and one warm run per scenario.',
  ref:ref==='working'?git(['rev-parse','HEAD']):git(['rev-parse',ref]),sourceHash:createHash('sha256').update(source).digest('hex'),
  node:process.version,browser:await browser.version(),scenarios:results},null,2));
}finally{await browser.close();}
