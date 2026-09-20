import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source=(await readFile(output,'utf8')).replace('model = createModel(config)','model = createModel(config); window.fixtureModel=model; window.fixturePage=page; window.evidence=OwnerEvidence');
const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture');
 await page.setContent('<main aria-label="nicovideo-content">'+fixture+'</main>');
 await page.evaluate(()=>{
  const all=[...document.querySelectorAll('[data-decoration-video-id]')];
  const cards=all.filter(card=>card.querySelector('a[data-group-ignore]')).slice(0,3);document.querySelector('main').replaceChildren(...cards);
  window.ids=cards.slice(0,3).map(e=>e.dataset.decorationVideoId);
  cards.slice(0,3).forEach((card,i)=>{
   const owner=card.querySelector('a[data-group-ignore]');
   const href='https://www.nicovideo.jp/user/'+(i<2?'12345':'23456');
   owner.href=href;owner.dataset.anchorHref=href;
   owner.querySelector('p').textContent='(投稿者非公開)';owner.querySelector('img').alt='(投稿者非公開)';
  });
  window.requests=0;
  window.GM_getValue=(key,fallback)=>({autoFillEnabled:false,selfAdWarningEnabled:false,ngUserIds:'[12345]'}[key]??fallback);
  window.GM_setValue=()=>{};
  window.GM_xmlhttpRequest=o=>{
   requests++;
   const timer=setTimeout(()=>o.onload({status:200,responseText:'<nicovideo_thumb_response status="ok"><thumb><title>fixture</title><description>fixture</description><tags><tag>test</tag></tags></thumb></nicovideo_thumb_response>'}),10);
   return {abort(){clearTimeout(timer);o.onabort?.()}};
  };
 });
 await page.addScriptTag({content:source});
 await page.waitForFunction(()=>window.fixtureModel && ids.every(id=>fixtureModel.movies.get(id)?.metadataSettled));
 assert.deepEqual(await page.evaluate(()=>ids.map(id=>{const m=fixtureModel.movies.get(id);return [m.contributor.id,m.ng,m._nrnContributorSource]})),[[12345,true,'search'],[12345,true,'search'],[23456,false,'search']]);
 assert.equal(await page.evaluate(()=>requests),0,'known owner-ID conditions need no detail API calls');
 assert.deepEqual(await page.evaluate(()=>ids.map(id=>fixturePage.movieRoots.find(r=>r.movieId===id).elem.classList.contains('nrn-hide'))),[true,true,false]);
 await page.evaluate(()=>fixtureModel.config.ngUserIds.remove([12345]));
 await page.waitForFunction(()=>ids.every(id=>!fixtureModel.movies.get(id).ng));
 // Native owner parsing must reject description links, unrelated card IDs, and conflicting rows.
 const parsed=await page.evaluate(()=>{
  const root=fixturePage.movieRoots.find(r=>r.movieId===ids[0]).elem;
  const make=()=>{const clone=root.cloneNode(true);clone.querySelectorAll('.nrn-movie-info-container').forEach(e=>e.remove());return clone};
  let copy=make();const row=c=>({rootElem:c,movie:{id:ids[0]}});
  const valid=evidence.fromRow(row(copy));
  copy.querySelector('a[data-group-ignore]').remove();
  const desc=document.createElement('div');desc.className='nrn-description';desc.innerHTML='<a href="/watch/'+ids[0]+'">other</a><a data-group-ignore="true" data-anchor-area="main" href="https://www.nicovideo.jp/user/987"><img><p>stranger</p></a>';copy.append(desc);
  const inDescription=evidence.fromRow(row(copy));
  copy=make();copy.dataset.decorationVideoId='sm999';const wrongVideo=evidence.fromRow(row(copy));
  copy=make();const another=copy.querySelector('a[data-group-ignore]').cloneNode(true);another.href='https://www.nicovideo.jp/user/987';another.dataset.anchorHref=another.href;copy.querySelector('a[data-group-ignore]').after(another);
  const conflict=evidence.fromRow(row(copy));
  // Injected metadata comes from the exact item, even without native analytics attributes.
  const injected=document.createElement('div');injected.dataset.decorationVideoId='sm123';
  evidence.register(injected,{id:'sm123',owner:{id:123,type:'user',name:''}});
  const injectedOwner=evidence.fromRow({rootElem:injected,movie:{id:'sm123'}});
  injected.dataset.decorationVideoId='sm456';const recycled=evidence.fromRow({rootElem:injected,movie:{id:'sm456'}});
  return {valid,inDescription,wrongVideo,conflict,injectedOwner,recycled};
 });
 assert.equal(parsed.valid.id,12345);
 for(const key of ['inDescription','wrongVideo','conflict','recycled'])assert.equal(parsed[key],null,key);
 assert.equal(parsed.injectedOwner.id,123);
 await page.evaluate(()=>{
  const item={id:'sm123456789',title:'injected fixture',owner:{type:'user',id:12345,name:''}};
  const root=fixturePage._createInjectedTile(item);
  fixtureModel.createMovies([{movie:{id:item.id,title:item.title},rootElem:root}]);
  fixtureModel.config.ngUserIds.add(12345);
 });
 assert.equal(await page.evaluate(()=>fixtureModel.movies.get('sm123456789').contributor.id),12345,'actual injected card feeds item owner to model');
 assert.equal(await page.evaluate(()=>fixtureModel.movies.get('sm123456789').ng),true);
 // Remove the native row before first parsing on a fresh route/fixture.
 await page.reload();
 await page.setContent('<main aria-label="nicovideo-content">'+fixture+'</main>');
 await page.evaluate(()=>{
  const card=[...document.querySelectorAll('[data-decoration-video-id]')].find(c=>c.querySelector('a[data-group-ignore]'));
  document.querySelector('main').replaceChildren(card);
  window.lateId=card.dataset.decorationVideoId;
  window.lateOwner=card.querySelector('a[data-group-ignore]');window.ownerParent=lateOwner.parentElement;
  lateOwner.href='https://www.nicovideo.jp/user/12345';lateOwner.dataset.anchorHref=lateOwner.href;
  lateOwner.querySelector('p').textContent='';lateOwner.remove();window.requests=0;
  window.GM_getValue=(key,fallback)=>({autoFillEnabled:false,selfAdWarningEnabled:false,ngUserIds:'[12345]'}[key]??fallback);
  window.GM_setValue=()=>{};
  window.GM_xmlhttpRequest=o=>{requests++;const t=setTimeout(()=>o.onload({status:200,responseText:'<nicovideo_thumb_response status="ok"><thumb><title>fixture</title><description/><tags><tag>test</tag></tags></thumb></nicovideo_thumb_response>'}),10);return {abort(){clearTimeout(t)}}};
 });
 await page.addScriptTag({content:source});
 await page.waitForFunction(()=>window.fixtureModel?.movies.get(lateId)?.thumbInfoDone);
 assert.equal(await page.evaluate(()=>fixtureModel.movies.get(lateId).contributor.type),'unknown');
 await page.evaluate(()=>{window.ownerChanges=0;fixtureModel.movies.get(lateId).on('contributorChanged',()=>ownerChanges++);ownerParent.append(lateOwner)});
 await page.waitForFunction(()=>fixtureModel.movies.get(lateId).ng && fixtureModel.movies.get(lateId).contributor.id===12345);
 await page.evaluate(()=>lateOwner.querySelector('p').textContent='late owner');
 await page.waitForFunction(()=>fixtureModel.movies.get(lateId).contributor.name==='late owner');
 await page.waitForFunction(()=>fixturePage.movieRoots[0].movieInfo.elem.querySelector('.nrn-owner-name')?.textContent==='late owner');
 assert.equal(await page.evaluate(()=>requests),1,'late ID and name do not fetch again');
 const stable=await page.evaluate(()=>ownerChanges);
 await page.evaluate(()=>{lateOwner.remove();ownerParent.append(lateOwner);for(let i=0;i<20;i++)lateOwner.querySelector('p').firstChild.data='late owner'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>ownerChanges),stable,'remount/repeated text does not emit another model change');
 // A conflicting native ID retracts the fallback; it is not guessed from the name.
 await page.evaluate(()=>{lateOwner.href='https://www.nicovideo.jp/user/999';lateOwner.dataset.anchorHref=lateOwner.href});
 await page.waitForFunction(()=>fixtureModel.movies.get(lateId).contributor.type==='unknown' && !fixtureModel.movies.get(lateId).ng);
 // A mutation queued before the URL changes must not update an old route's model.
 await page.evaluate(()=>{
  window.staleModel=fixtureModel;window.staleChanges=ownerChanges;
  delete staleModel.movies.get(lateId)._nrnSearchOwnerConflict;
  lateOwner.href='https://www.nicovideo.jp/user/123';lateOwner.dataset.anchorHref=lateOwner.href;
  queueMicrotask(()=>history.replaceState(null,'','/tag/another'));
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>staleModel.movies.get(lateId).contributor.type),'unknown');
 assert.deepEqual(errors,[]);
 console.log('Owner Chrome fixture PASS: same-owner NG with missing API ID, distinct-owner separation, live unblock, no extra requests, strict native row extraction, conflicting/description/other-video rejection, injected item identity, delayed native row/name, idempotent remount, conflicting href, route invalidation.');
} finally {await browser.close()}
