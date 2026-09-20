import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source=(await readFile(output,'utf8')).replace('model = createModel(config)','model = createModel(config); window.testModel = model; window.testPage = page; window.testLegacyCss = SearchPage.prototype.css + CardEnhancements.css; window.testAdd = item => { const root = page._createInjectedTile(item); setup([{type:"main",movie:{id:item.id,title:item.title},rootElem:root}],model,page,ctrl); model.requestThumbInfo(); }');
const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage(),errors=[],messages=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>messages.push(m.text()));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://nrn.test/tag/synthetic');
 await page.setContent(fixture);
 const card=await page.locator('[data-decoration-video-id]').first().evaluate(el=>{
  el.querySelectorAll('a[href*="/user/"]').forEach(e=>e.remove());return el.outerHTML.replace(/sm\d+/g,'sm12345678');
 });
 const install=async(hold=false,nameOnly=false,nativePlaceholder=false)=>{
  await page.setContent('<main aria-label="nicovideo-content"><section><div id="results">'+card+'</div></section></main>');
  // Decorations outside the result cards must not hold initial setup for 15s.
  await page.evaluate(()=>{const decoration=document.createElement('div');decoration.dataset.decorationVideoId='sm999999';document.body.append(decoration);});
  await page.evaluate(({hold,nameOnly,nativePlaceholder})=>{
   const meta=document.createElement('meta');meta.name='server-response';
   meta.content=JSON.stringify({data:{response:{$getSearchVideoV2:{data:{items:[{id:'sm12345678',owner:{ownerType:'hidden',type:'user',visibility:'hidden',id:'55',name:null}}]}}}}});document.head.append(meta);
   if(nativePlaceholder){
    meta.remove();
    const root=document.querySelector('[data-decoration-video-id]'),watch=root.querySelector('a[href*="/watch/"]');
    const owner=document.createElement('a');owner.href='https://www.nicovideo.jp/user/55';owner.dataset.groupIgnore='true';owner.dataset.anchorArea='main';
    owner.innerHTML='<img alt="(投稿者非公開)"><p>(投稿者非公開)</p>';watch.parentElement.append(owner);
   }
   window.detailCalls=0;window.ownerCalls=0;
   window.GM_getValue=(k,d)=>({autoFillEnabled:false,autoFillAdMode:'none',openNewWindow:false,sessionDetailCacheEnabled:true,
    ngTags:nameOnly?'[]':'["unmatched"]',ngUserNames:nameOnly?'[]':'["restored"]'}[k]??d);
   window.GM_setValue=()=>{};
   window.GM_xmlhttpRequest=o=>{
    detailCalls++;const id=o.url.split('/').pop();window.deliverDetail=()=>o.onload({status:200,responseText:'<nicovideo_thumb_response status="ok"><thumb><video_id>'+id+'</video_id><title>synthetic</title><description>synthetic</description><tags><tag lock="1">synthetic</tag></tags></thumb></nicovideo_thumb_response>'});
    const timer=hold?null:setTimeout(deliverDetail,1);
    return {abort(){clearTimeout(timer);o.onabort?.();}};
   };
   window.fetch=async(url,{credentials})=>{
    if(credentials!=='omit')throw Error('unexpected credentials');ownerCalls++;
    const result={ok:true,status:200,url,text:async()=>JSON.stringify({data:{id:'sm12345678',ownerId:55,ownerName:'restored synthetic account',decoration:'none'}})};
    return hold?new Promise(resolve=>{window.deliverOwner=()=>resolve(result);}):result;
   };
  },{hold,nameOnly,nativePlaceholder});
  await page.addScriptTag({content:source});
  if(hold){
   await page.waitForFunction(()=>__nrnDiagnostics.snapshot().current?.phase==='initial-ng');
   await page.evaluate(()=>deliverDetail());await page.waitForFunction(()=>ownerCalls===1);
   assert.equal(await page.evaluate(()=>__nrnDiagnostics.snapshot().current.initialProcessing),null,'initial acceptance waits for name NG');
   assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').metadataSettled),false);
   await page.evaluate(()=>deliverOwner());
  }
  await page.waitForFunction(()=>__nrnDiagnostics.snapshot().current?.initialProcessing,null,{timeout:10000});
 };
 await install(true);
 let state=await page.evaluate(()=>({detail:detailCalls,owner:ownerCalls,ng:testModel.movies.get('sm12345678').ng,name:testModel.movies.get('sm12345678').contributor.name,
  report:__nrnDiagnostics.snapshot()}));
 assert.equal(state.detail,1);assert.equal(state.owner,1);assert.equal(state.ng,true);assert.equal(state.name,'restored synthetic account');
 assert.equal(state.report.current.ownerNameRecovery.nicoad,1);
 assert.ok(state.report.current.initialProcessing.domWaitMs<2500,'non-card decorations do not force the 15 second limit');
 // Unblock without additional fetch, then verify actual name in the card details.
 await page.evaluate(()=>testModel.config.ngUserNames.clear());
 await page.locator('.nrn-compact-owner .nrn-owner-name').filter({hasText:'restored synthetic account'}).waitFor();
 assert.equal(await page.locator('.nrn-compact-owner').isVisible(),true,'missing native owner is visible before expanding details');
 // Use the supplied native visual contract with synthetic names and local CSS.
 // Both rows must inherit the same site utilities, including container sizing.
 const styleComparison=await page.evaluate(()=>{
  const style=document.createElement('style');style.textContent=`
   .d_flex{display:flex}.gap_x0_5{gap:4px}.ai_center{align-items:center}
   .text-layer_mediumEm{color:rgb(80,80,80)}.w_fit-content{width:fit-content}.fs_base{font-size:16px}
   .w_x3{width:32px}.min-w_x3{min-width:32px}.h_x3{height:32px}.bdr_full{border-radius:9999px}
   .fw_bold{font-weight:700}.lc_1{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
   p{margin:0}.style-comparison{container-type:inline-size;width:400px}
   @container (max-width:320px){.${CSS.escape('[@container_(max-width:_320px)]:fs_s')}{font-size:14px}}
  `;document.head.append(style);
  const host=document.createElement('div');host.className='style-comparison';document.body.append(host);
  const native=document.createElement('a');native.href='https://www.nicovideo.jp/user/55';
  native.className='hover:c_action.primaryAzure d_flex gap_x0_5 ai_center text-layer_mediumEm w_fit-content fs_base [@container_(max-width:_320px)]:fs_s';
  native.innerHTML='<img alt="synthetic" class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"><p class="fw_bold lc_1">synthetic</p>';
  const compact=document.querySelector('.nrn-compact-owner');
  const generated=compact.cloneNode(true);host.append(native,generated);
  const read=row=>{const s=getComputedStyle(row),i=getComputedStyle(row.querySelector('img')),n=getComputedStyle(row.querySelector('p,span'));
   return {display:s.display,gap:s.gap,align:s.alignItems,font:s.fontSize,color:s.color,margin:s.marginTop,width:i.width,height:i.height,weight:n.fontWeight,clamp:n.webkitLineClamp};};
   const wide=[read(native),read(generated)];host.style.width='300px';const narrow=[read(native),read(generated)];
   const theme=document.documentElement.dataset.nrnUiTheme;
   document.documentElement.dataset.nrnUiTheme='dark';const dark=[read(native),read(generated)];
   if(theme===undefined)delete document.documentElement.dataset.nrnUiTheme;else document.documentElement.dataset.nrnUiTheme=theme;
  const structure={tag:compact.tagName,children:[...compact.children].map(e=>e.tagName),tracking:compact.hasAttribute('data-anchor-href')};
  host.remove();return {wide,narrow,dark,structure};
 });
 assert.deepEqual(styleComparison.structure,{tag:'A',children:['IMG','P'],tracking:false},'compact row follows native anchor/image/paragraph without fake site tracking');
 assert.deepEqual(styleComparison.wide[1],styleComparison.wide[0],'wide native and recovered row styles match');
 assert.deepEqual(styleComparison.narrow[1],styleComparison.narrow[0],'narrow container styles match');
 assert.deepEqual(styleComparison.dark[1],styleComparison.dark[0],'detail dark setting does not recolor the native-style compact row');
 const legacyStyle=await page.evaluate(()=>{
  const frame=document.createElement('iframe');document.body.append(frame);
  const doc=frame.contentDocument,style=doc.createElement('style');style.textContent=testLegacyCss;doc.head.append(style);
  const row=doc.importNode(document.querySelector('.nrn-compact-owner'),true);doc.body.append(row);
  const read=e=>frame.contentWindow.getComputedStyle(e);
  const result={display:read(row).display,align:read(row).alignItems,width:read(row.querySelector('img')).width,height:read(row.querySelector('img')).height,margin:read(row.querySelector('p')).margin};
  frame.remove();return result;
 });
 assert.deepEqual(legacyStyle,{display:'inline-flex',align:'center',width:'24px',height:'24px',margin:'0px'},'legacy search retains bounded icons and horizontal row without modern utilities');
 await page.locator('.nrn-movie-info-toggle').first().click();
 assert.equal(await page.locator('.nrn-compact-owner').isVisible(),false,'expanded details show one owner row');
 await page.locator('.nrn-movie-info-container .nrn-owner-name').filter({hasText:'restored synthetic account'}).waitFor();
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').ng),false);
 const cachedAt=await page.evaluate(()=>{__nrnSessionDetailCacheService.flush();return __nrnSessionDetailCacheService.get('sm12345678').cachedAt;});
 // Reload the document while preserving only sessionStorage, as a user reload does.
 await page.reload();await install();
 state=await page.evaluate(()=>({detail:detailCalls,owner:ownerCalls,ng:testModel.movies.get('sm12345678').ng,name:testModel.movies.get('sm12345678').contributor.name,
  report:__nrnDiagnostics.snapshot(),cachedAt:__nrnSessionDetailCacheService.get('sm12345678').cachedAt}));
 assert.equal(state.detail,0,'session cache must restore before any individual detail request');
 assert.equal(state.owner,0,'validated supplementary name also survives reload');assert.equal(state.ng,true);
 assert.equal(state.cachedAt,cachedAt,'reading and rewriting cache must not renew metadata age');
 assert.equal(state.report.current.cache.restoredAfterRequestStarted,0);assert.equal(state.report.current.detailPlan.cacheOnly,1);
 // A stale initial meta must not supply an identity to a later SPA route.
 await page.evaluate(html=>{history.pushState({},'','/tag/next');document.getElementById('results').innerHTML=html;},card);
 await page.waitForFunction(()=>__nrnDiagnostics.snapshot().current?.sequence===2);
 await page.waitForFunction(()=>testModel.movies.get('sm12345678')?.thumbInfoDone);
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').metadata.ownerId),'unknown');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').metadata.ownerName),'unknown');
 await page.reload();await page.evaluate(()=>sessionStorage.clear());await install(false,true);
 assert.deepEqual(await page.evaluate(()=>[detailCalls,ownerCalls]),[0,1],'owner-only display needs no detail request');
 await page.evaluate(()=>__nrnSessionDetailCacheService.flush());await page.reload();await install(false,true);
 assert.deepEqual(await page.evaluate(()=>[detailCalls,ownerCalls]),[0,0],'name-only cache survives reload without inventing full details');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').metadata.tags),'unknown');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').contributor.name),'restored synthetic account');
 await page.reload();await page.evaluate(()=>sessionStorage.clear());await install(false,false,true);
 assert.equal(await page.evaluate(()=>ownerCalls),1,'native placeholder must not suppress name recovery');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').contributor.name),'restored synthetic account');
 assert.equal(await page.evaluate(()=>testModel.movies.get('sm12345678').ng),true,'recovered name participates in NG');
 // An injected card owns its compact owner row; recovery must update that row too.
 await page.evaluate(()=>{
  testModel.config.ngUserNames.clear();
  window.fetch=async(url)=>({ok:true,status:200,url,text:async()=>JSON.stringify({data:{id:'sm23456789',ownerId:55,ownerName:'restored synthetic account'}})});
  testAdd({id:'sm23456789',title:'synthetic',owner:{type:'user',id:55,name:null,visibility:'hidden'}});
 });
 await page.waitForFunction(()=>testModel.movies.get('sm23456789')?.contributor.name==='restored synthetic account');
 assert.equal(await page.locator('[data-decoration-video-id="sm23456789"] .nrn-native-owner p').textContent(),'restored synthetic account','compact injected owner row reflects recovered name');
 assert.equal(await page.locator('[data-decoration-video-id="sm23456789"] .nrn-native-owner img').getAttribute('alt'),'','icon must not repeat the obsolete hidden label');
 assert.deepEqual(errors,[]);assert.doesNotMatch(messages.join('\n'),/restored synthetic account|sm12345678/);
 console.log('Offline browser PASS: hidden initial owner identity; native placeholder triggers recovery and name NG; compact injected row updated; cold detail1/owner1; reload detail0/owner0; cache age preserved; stale SPA meta rejected; anonymous logs.');
} finally {await browser.close();}
