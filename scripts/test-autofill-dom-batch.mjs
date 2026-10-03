import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const source=await readFile(output,'utf8'),marker='  var Diagnostics = (function() {';
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://nrn.test/tag/batch');await page.setContent('<main aria-label="nicovideo-content"><section id="results">'+fixture+'</section></main>');
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.BatchAPI={ListPage}; })();'});
 const result=await page.evaluate(()=>{
   const p=new BatchAPI.ListPage(document),native=document.querySelector('[data-decoration-video-id][data-anchor-area="main"]');
   const host=native.parentElement,originalInsert=host.insertBefore.bind(host);let inserts=0,actions=0;
   host.insertBefore=function(node,before){inserts++;return originalInsert(node,before)};
   p._cardActions={attach(){actions++}};
   const items=Array.from({length:6},(_,i)=>({id:'sm'+(700+i),title:'batch '+i,count:{view:i,comment:0},duration:60}));
   const roots=p._createInjectedTiles(items);
   const ids=Array.from(host.querySelectorAll('[data-nrn-autofill="true"]'),e=>e.dataset.decorationVideoId);
   const allConnected=roots.every(r=>r.isConnected);
   const modes=roots.map(r=>r.dataset.nrnResultLayout);
   const beforeSingle=inserts;const single=p._createInjectedTile({id:'sm799',title:'single',count:{view:0,comment:0},duration:60});
   return {hasBatch:typeof p._createInjectedTiles==='function',inserts,batchInserts:beforeSingle,actions,ids,allConnected,modes,singleConnected:single.isConnected};
 });
 assert.equal(result.hasBatch,true);
 assert.equal(result.batchInserts,1,'one AutoFill batch must make one parent insertion');
 assert.equal(result.inserts,2,'legacy single-card API still performs one immediate insertion');
 assert.equal(result.actions,7,'card actions attach once per card');
 assert.deepEqual(result.ids,['sm700','sm701','sm702','sm703','sm704','sm705']);
 assert.equal(result.allConnected,true);assert.equal(result.singleConnected,true);
 assert.ok(result.modes.every(mode=>mode==='list'));
 console.log('AutoFill DOM batch PASS: six ordered cards use one parent insertion; single-card API remains immediate.');
}finally{await browser.close()}
