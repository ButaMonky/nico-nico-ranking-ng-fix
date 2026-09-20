import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const source=(await Promise.all(['src/preview/hls-prefix.js','vendor/hls.js/hls.min.js','src/preview/hls-suffix.js','src/preview/hover-preview.js'].map(read))).join('\n');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();page.setDefaultTimeout(10000);const calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.hostname==='nrn.test')return r.fulfill({contentType:'text/html',body:'<video muted playsinline></video>'});
  calls.push({host:u.hostname,path:u.pathname});
  assert.ok(['delivery.domand.nicovideo.jp','asset.domand.nicovideo.jp'].includes(u.hostname));
  let body,type='application/vnd.apple.mpegurl';
  if(u.pathname==='/master.m3u8')body='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="synthetic",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=160x90,CODECS="avc1.64000a,mp4a.40.2",AUDIO="audio"\nvideo.m3u8\n';
  else {
   const name=u.pathname.slice(1);assert.match(name,/^(video|audio)(-init\.mp4|-\d+\.m4s|\.m3u8)$/);
   body=await readFile(new URL('tests/fixtures/preview-media/'+name,root));
   if(name.endsWith('.m3u8'))body=body.toString().replace(/(video|audio)(-init\.mp4|-\d+\.m4s)/g,'https://asset.domand.nicovideo.jp/$&');
   else type='video/mp4';
  }
  await r.fulfill({contentType:type,body,headers:{'Access-Control-Allow-Origin':'http://nrn.test','Access-Control-Allow-Credentials':'true'}});
 });
 await page.goto('http://nrn.test/tag/fixture');
 await page.evaluate(()=>{window.Hls={nativeSentinel:true}});
 await page.addScriptTag({content:source});
 assert.equal(await page.evaluate(()=>window.Hls.nativeSentinel),true);
 const identity=await page.evaluate(()=>{
  const Hls=getNnrPreviewHls(),instance=new Hls({enableWorker:false});
  const result={version:Hls.version,cached:Hls===getNnrPreviewHls(),audio:Boolean(instance.audioStreamController)};instance.destroy();return result;
 });
 assert.deepEqual(identity,{version:'1.6.19',cached:true,audio:true});
 await page.evaluate(()=>{
  window.mediaErrors=0;const video=document.querySelector('video');video.muted=true;
  window.adapter=HoverPreview.media(video,{url:'https://delivery.domand.nicovideo.jp/master.m3u8'},{onError:()=>mediaErrors++});
  video.play().catch(()=>{});
 });
 await page.waitForFunction(()=>document.querySelector('video').currentTime>.2);
 assert.ok(calls.some(c=>c.host==='asset.domand.nicovideo.jp'&&c.path.startsWith('/audio-')),'real HLS loads separate synthetic audio');
 assert.ok(calls.some(c=>c.host==='asset.domand.nicovideo.jp'&&c.path.startsWith('/video-')),'real HLS loads synthetic video');
 assert.equal(await page.evaluate(()=>mediaErrors),0);
 await page.evaluate(()=>{document.querySelector('video').pause();adapter.destroy()});
 assert.equal(await page.evaluate(()=>window.Hls.nativeSentinel),true);
 assert.deepEqual(errors,[]);
 console.log('HLS fixture PASS: private lazy full library; actual MSE playback of synthetic separate video/audio; delivery/asset hosts; native global preserved. No live media.');
} finally {await browser.close()}
