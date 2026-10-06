import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const fixture=await readFile(new URL('../tests/fixtures/layout-list.html',import.meta.url),'utf8');
const source=await readFile(output,'utf8'),marker='  var Diagnostics = (function() {';
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});

try {
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('http://nrn.test/tag/cooperative');
  await page.setContent('<main aria-label="nicovideo-content"><section id="results">'+fixture+'</section></main>');
  await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.CooperativeAPI={ListPage}; })();'});
  const result=await page.evaluate(async()=>{
    const p=new CooperativeAPI.ListPage(document);
    const native=document.querySelector('[data-decoration-video-id][data-anchor-area="main"]');
    const host=native.parentElement,originalInsert=host.insertBefore.bind(host);
    let inserts=0,actions=0,yields=0;
    const detachedCounts=[];
    host.insertBefore=function(node,before){inserts++;return originalInsert(node,before)};
    p._cardActions={attach(){actions++}};
    const items=Array.from({length:6},(_,i)=>({id:'sm'+(810+i),title:'cooperative '+i,count:{view:i,comment:0},duration:60}));
    const roots=await p._createInjectedTilesCooperatively(items,async()=>{
      yields++;detachedCounts.push(document.querySelectorAll('[data-nrn-autofill="true"]').length);
      await Promise.resolve();return true;
    },0,()=>false);
    const ids=Array.from(host.querySelectorAll('[data-nrn-autofill="true"]'),e=>e.dataset.decorationVideoId);
    const beforeCancel=ids.length;
    const cancelled=await p._createInjectedTilesCooperatively(items.slice(0,3),async()=>false,0,()=>false);
    return {inserts,actions,yields,detachedCounts,ids,allConnected:roots.every(r=>r.isConnected),
      cancelled:cancelled.length,afterCancel:document.querySelectorAll('[data-nrn-autofill="true"]').length,beforeCancel};
  });
  assert.equal(result.yields,5,'zero budget yields between six detached card creations');
  assert.deepEqual(result.detachedCounts,[0,0,0,0,0],'partial AutoFill cards stay detached across yields');
  assert.equal(result.inserts,1,'cooperative creation keeps one parent insertion');
  assert.equal(result.actions,6,'actions attach once after the complete batch is inserted');
  assert.deepEqual(result.ids,['sm810','sm811','sm812','sm813','sm814','sm815']);
  assert.equal(result.allConnected,true);
  assert.equal(result.cancelled,0,'cancelled cooperative batch is not inserted');
  assert.equal(result.afterCancel,result.beforeCancel,'cancelled batch leaves no partial DOM');
  console.log('AutoFill cooperative yield PASS: detached work yields safely, inserts once, preserves order, and cancellation is atomic.');
} finally {
  await browser.close();
}
