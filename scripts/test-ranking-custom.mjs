import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
await build();
const source=await readFile(output,'utf8');

const card=(id,title)=>`<div class="contain_style h_min-content">
  <div data-decoration-video-id="${id}" data-anchor-area="main" data-anchor-page="ranking_custom">
    <div class="pos_relative"><a data-anchor-area="main" data-anchor-page="ranking_custom" href="/watch/${id}"><span>1:23</span></a></div>
    <div class="d_flex flex-d_column"><a data-anchor-area="main" data-anchor-page="ranking_custom" href="/watch/${id}">${title}</a></div>
  </div>
</div>`;
const fixture=`<main aria-label="nicovideo-content"><div id="custom-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
  ${card('sm90000001','タイトル 1')}
  ${card('sm90000002','タイトル 2')}
  ${card('sm90000003','タイトル 3')}
  ${card('sm90000004','タイトル 4')}
  <div class="contain_style h_min-content" id="promotion"><a data-anchor-area="main" data-anchor-page="ranking_custom" href="/watch/sm99999999"><div><p>PR枠</p></div></a></div>
</div></main>`;

const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route('**/*',r=>r.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
  await page.goto('http://nrn.test/ranking/custom');
  await page.setContent(fixture);
  const marker='  var Diagnostics = (function() {';
  await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.testAPI={ListPage}; })();'});
  const state=await page.evaluate(()=>{
    window.p=new testAPI.ListPage(document);
    const style=document.createElement('style');style.textContent=p.css;document.head.appendChild(style);
    window.parsed=p.parse();
    return {
      supported:testAPI.ListPage.is(location),
      autofill:testAPI.ListPage.supportsAutoFill(location),
      ids:parsed.map(r=>r.movie.id),
      titles:parsed.map(r=>r.movie.title),
      promotionParsed:document.getElementById('promotion').classList.contains('nrn-parsed'),
      gridChildren:document.getElementById('custom-grid').children.length
    };
  });
  assert.equal(state.supported,true);
  assert.equal(state.autofill,false);
  assert.deepEqual(state.ids,['sm90000001','sm90000002','sm90000003','sm90000004']);
  assert.deepEqual(state.titles,['タイトル 1','タイトル 2','タイトル 3','タイトル 4']);
  assert.equal(state.promotionParsed,false,'promoted/native slot is not parsed as an ordinary video');
  assert.equal(state.gridChildren,5,'five physical grid slots are preserved');
  const before=await page.evaluate(()=>{
    window.root=new testAPI.ListPage.MovieRoot(parsed[0].rootElem);
    return root.elem.parentElement.getBoundingClientRect().height;
  });
  await page.evaluate(()=>root._hide());
  const hidden=await page.evaluate(()=>{
    const style=getComputedStyle(root.elem);
    return {display:style.display,visibility:style.visibility,height:root.elem.parentElement.getBoundingClientRect().height,
      custom:root.elem.classList.contains('nrn-custom-hide'),gridChildren:document.getElementById('custom-grid').children.length};
  });
  assert.equal(hidden.custom,true);
  assert.notEqual(hidden.display,'none');
  assert.equal(hidden.visibility,'hidden');
  assert.equal(hidden.height,before,'slot wrapper height is preserved while hidden');
  assert.equal(hidden.gridChildren,5);
  await page.evaluate(()=>root._show());
  assert.equal(await page.evaluate(()=>getComputedStyle(root.elem).visibility),'visible');
  assert.deepEqual(errors,[]);
  console.log('Custom ranking PASS: ordinary-only parsing, correct title anchor, promoted slot untouched, no flat AutoFill fetch, five-slot geometry preserved across NG hide/show.');
} finally {
  await browser.close();
}
