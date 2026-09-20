// Synthetic browser integration: real controller + PreviewData, fake network/media.
// Every browser route is intercepted; no niconico endpoint is contacted.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const sources=await Promise.all(['preview-data.js','hover-preview.js'].map(name=>readFile(new URL('../src/preview/'+name,import.meta.url),'utf8')));
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
const errors=[],external=[];
async function fixture(mode={}) {
 const page=await browser.newPage({viewport:{width:1100,height:700}});page.setDefaultTimeout(5000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).hostname!=='nrn.test')external.push(route.request().url());
  return route.fulfill({body:'<html><body>synthetic navigation</body></html>',contentType:'text/html'});
 });
 await page.goto('http://nrn.test/tag/boundary');
 await page.setContent('<style>.card{display:inline-block;width:320px;height:220px}.nrn-thumb-anchor-wrap{width:320px;height:180px;position:relative}a{display:block;width:100%;height:100%}.spacer{height:2500px}</style>'+['native','a','b'].map((id,i)=>`<div id="${id}" class="card" ${i?'data-nrn-autofill="true"':''} data-decoration-video-id="sm123"><div class="nrn-thumb-anchor-wrap"><a href="/watch/sm123">synthetic link</a></div></div>`).join('')+'<div class="spacer"></div>');
 for(const source of sources)await page.addScriptTag({content:source});
 await page.evaluate(mode=>{
  window.requests=[];window.pending=[];window.destroyed=0;window.mounted=0;window.plays=0;window.pauses=0;window.playbackSeconds=0;window.mode=mode;
  const realTimeout=window.setTimeout;
  if(mode.shortDeadline)window.setTimeout=(callback,delay,...args)=>realTimeout(callback,delay===12000?40:delay,...args);
  HTMLMediaElement.prototype.play=function(){plays++;return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){pauses++};HTMLMediaElement.prototype.load=function(){};
  const emptyNg=()=>({ngScore:{isDisabled:false},owner:[],channel:[],viewer:{revision:0,count:0,items:[]}});
  const fetchSynthetic=async(url,options)=>{
   requests.push({path:new URL(url).pathname,signal:options.signal});
   if(mode.pending&&url.includes('/preview'))await new Promise(resolve=>pending.push(resolve));
   const data=url.includes('/preview')?{meta:{status:200},data:{video:{id:'sm123',duration:mode.duration||60},domand:{accessRightKey:'synthetic',videos:[{id:'video-low',height:360,bitRate:300,isAvailable:true}],audios:[{id:'audio-low',bitRate:64,isAvailable:true}]},comment:{ng:emptyNg(),nvComment:{server:'https://public.nvcomment.nicovideo.jp',threadKey:'synthetic',params:{targets:[{id:'123',fork:'main'}],language:'ja-jp'}}}}}:
    url.includes('/access-rights/')?{meta:{status:201},data:{contentUrl:'https://delivery.domand.nicovideo.jp/hls/synthetic',expireTime:new Date(Date.now()+60000).toISOString()}}:
    mode.invalidComments?{meta:{status:200},data:{threads:'invalid'}}:{meta:{status:200},data:{threads:[]}};
   return {ok:true,status:200,redirected:false,json:async()=>data};
  };
  window.store={value:true,listeners:new Set(),on(n,f){this.listeners.add(f)},off(n,f){this.listeners.delete(f)}};
  window.preview=HoverPreview.create({doc:document,_disposed:false,_sourceUrl:location.href},{hoverPreviewEnabled:store},{
   load:(id,options)=>PreviewData.load(id,{...options,fetch:fetchSynthetic}),
   comments:(data,options)=>PreviewData.comments(data,{...options,fetch:fetchSynthetic}),
   media:(video,{},{onError})=>{mounted++;Object.defineProperty(video,'currentTime',{get:()=>playbackSeconds});if(mode.syncMediaError)onError();return {destroy(){destroyed++}}}
  });
 },mode);
 return page;
}
async function play(page,card='#a') {await page.locator(card).hover();await page.waitForFunction(()=>preview.snapshot().active&&preview.snapshot().playing>0);}
async function close(page){await page.evaluate(()=>preview.dispose());await page.close();}
try {
 // Some adapters report setup errors synchronously, before the return assignment.
 {
  const page=await fixture({syncMediaError:true});await page.locator('#a').hover();
  await page.waitForFunction(()=>document.querySelector('.nrn-preview')?.dataset.phase==='error');
  assert.deepEqual(await page.evaluate(()=>({destroyed,plays,active:preview.snapshot().active})),{destroyed:1,plays:0,active:false});await close(page);
 }
 // Pending removal must abort even when a non-cooperative fetch later resolves.
 {
  const page=await fixture({pending:true});await page.locator('#a').hover();await page.waitForFunction(()=>requests.length===1);
  await page.evaluate(()=>document.querySelector('#a').remove());await page.waitForFunction(()=>requests[0].signal.aborted);
  await page.evaluate(()=>pending.shift()());await page.waitForTimeout(30);
  assert.deepEqual(await page.evaluate(()=>({requests:requests.length,mounted,plays,active:preview.snapshot().active})),{requests:1,mounted:0,plays:0,active:false});
  assert.equal(await page.locator('.nrn-preview').count(),0);await close(page);
 }
 // Playing removal disposes the media once, including observers and timer owners.
 {
  const page=await fixture();await play(page);await page.evaluate(()=>document.querySelector('#a').remove());
  await page.waitForFunction(()=>destroyed===1&&!preview.snapshot().active);
  assert.equal(await page.evaluate(()=>requests.every(r=>r.signal.aborted)),true);
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>destroyed),1);await close(page);
 }
 // A scroll moves the actual DOM rectangle out of the viewport.
 {
  const page=await fixture();await play(page);await page.evaluate(()=>window.scrollTo(0,1500));
  await page.waitForFunction(()=>!preview.snapshot().active&&destroyed===1);
  assert.equal(await page.locator('.nrn-preview').count(),0);assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);await close(page);
 }
 // Accelerate just the production's loading deadline, keeping its real callback.
 {
  const page=await fixture({pending:true,shortDeadline:true});await page.locator('#a').hover();
  await page.waitForFunction(()=>document.querySelector('.nrn-preview')?.dataset.phase==='error');
  assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);
  await page.evaluate(()=>pending.shift()());await page.waitForTimeout(30);
  assert.deepEqual(await page.evaluate(()=>({requests:requests.length,mounted,active:preview.snapshot().active})),{requests:1,mounted:0,active:false});await close(page);
 }
 // The preview duration is min(video duration, 30 seconds), and natural end releases.
 for(const boundary of [{duration:60,time:30},{duration:7,time:7},{duration:60,ended:true}]){
  const page=await fixture(boundary);await play(page);
  await page.evaluate(boundary=>{if(boundary.ended)document.querySelector('video').dispatchEvent(new Event('ended'));else playbackSeconds=boundary.time},boundary);
  await page.waitForFunction(()=>document.querySelector('.nrn-preview')?.dataset.phase==='ended');
  assert.equal(await page.locator('video,canvas').count(),0);assert.equal(await page.evaluate(()=>destroyed),1);await close(page);
 }
 // Same video ID never aliases card-instance lifetime or reuses a stopped session.
 {
  const page=await fixture();await play(page);await page.locator('#b').hover();await page.waitForFunction(()=>mounted===2&&plays===2);
  assert.equal(await page.locator('#a .nrn-preview').count(),0);assert.equal(await page.locator('#b video').count(),1);
  assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);assert.equal(await page.evaluate(()=>destroyed),1);
  await page.locator('#a').hover();await page.waitForFunction(()=>mounted===3&&plays===3);
  assert.equal(await page.locator('#a video').count(),1);assert.equal(await page.locator('#b .nrn-preview').count(),0);
  assert.equal(await page.evaluate(()=>destroyed),2);await close(page);
 }
 // Optional comment failures/empty results do not tear down the playing video.
 for(const invalidComments of [false,true]){
  const page=await fixture({invalidComments});await play(page);await page.waitForFunction(()=>requests.length===3);
  if(invalidComments)await page.waitForFunction(()=>preview.snapshot().commentsUnavailable===1);
  assert.equal(await page.locator('video').count(),1);assert.equal(await page.evaluate(()=>destroyed),0);
  assert.equal(await page.locator('.nrn-preview').getAttribute('data-phase'),'playing');
  assert.equal(await page.evaluate(()=>preview.snapshot().commentsUnavailable),invalidComments?1:0);await close(page);
 }
 // Native links keep ordinary navigation; only synthetic fixture routes are served.
 {
  const page=await fixture();await page.locator('#native a').click();await page.waitForURL('**/watch/sm123');
  assert.equal(new URL(page.url()).pathname,'/watch/sm123');await page.close();
 }
 assert.deepEqual(errors,[],'no page errors');assert.deepEqual(external,[],'no external browser requests');
 console.log('Preview boundaries PASS: pending/playing DOM removal; viewport exit; loading deadline; 30-second/short/natural end; same-ID card lifetimes; empty/invalid comments; native-link navigation. Real PreviewData + controller, synthetic network and media only.');
} finally {await browser.close()}
