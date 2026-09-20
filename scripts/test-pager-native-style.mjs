// Synthetic contract fixture based on saved official Pagination component.
// No captured user HTML/CSS or real page URLs are stored here.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
const source=await readFile(new URL('../src/ui/pager-journey.js',import.meta.url),'utf8');
const presentation=await readFile(new URL('../src/ui/card-enhancements.js',import.meta.url),'utf8');
const css=presentation.match(/const css = `([\s\S]*?)`/)[1];
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 await page.route('**/*',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/fixture?page=3');
 await page.setContent(`<style>.native-root{display:flex;gap:4px}.native-item{display:flex;align-items:center;justify-content:center;border-radius:9999px;min-width:32px;height:32px;padding:4px;font-size:16px;color:rgb(40,40,40);border:0}.native-item:hover,.native-item[data-selected]{background:rgb(220,220,220)}.native-gap{width:32px;height:32px}</style><style>${css}</style><nav id="original" data-scope="pagination" data-part="root" class="native-root"><a id="prev" class="native-item" data-scope="pagination" data-part="prev-trigger" href="?page=2"><svg viewBox="0 0 24 24"><path d="M14 5L7 12L14 19"/></svg></a><a class="native-item" data-part="item" href="?page=2" data-index="2">2</a><a id="selected" class="native-item" data-part="item" href="?page=3" data-index="3" data-selected="" aria-current="page">3</a><span class="native-gap" data-part="ellipsis">…</span><a id="next" class="native-item" data-scope="pagination" data-part="next-trigger" href="?page=4"><svg viewBox="0 0 24 24"><path d="M10 5L17 12L10 19"/></svg></a></nav>`);
 await page.addScriptTag({content:source});
 const result=await page.evaluate(()=>{
  window.calls=[];window.__reactRouterDataRouter={state:{initialized:true},navigate:async url=>calls.push(url)};
  window.config={autoFillPagerMode:{value:'compactSkip'},pagerPreviewCount:{value:2},ngTitles:{set:new Set()}};
  window.journey=PagerJourney.create({doc:document},config,location.href);
  for(let n=4;n<=8;n++)journey.record(n,[{id:'synthetic-'+n}]);
  journey.update(20,()=>true);
  const original=document.querySelector('#selected'),current=document.querySelector('.nrn-journey-pager [aria-current=page]');
  const style=el=>Object.fromEntries(['borderRadius','fontSize','height','padding','borderWidth','backgroundColor'].map(k=>[k,getComputedStyle(el)[k]]));
  return {native:style(original),replacement:style(current)};
 });
 assert.deepEqual(result.replacement,result.native,'selected page must inherit the native shape, spacing, typography and selection');
 assert.equal(await page.locator('.nrn-journey-pager').evaluate(el=>getComputedStyle(el).gap),'4px');
 assert.equal(await page.locator('.nrn-journey-pager [data-part=next-trigger] svg').evaluate(el=>el.outerHTML),await page.locator('#next svg').evaluate(el=>el.outerHTML));
 assert.equal(await page.locator('.nrn-journey-pager [id]').count(),0,'no duplicate native IDs');
 assert.equal(await page.locator('.nrn-page-consumed').textContent(),'4–8');
 assert.equal(await page.locator('.nrn-page-consumed').getAttribute('href'),null);
 const next=page.locator('.nrn-journey-pager [data-part=next-trigger]');
 assert.equal(await next.getAttribute('href'),'http://nrn.test/tag/fixture?page=9');
 assert.equal(await next.evaluate(el=>{const event=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});el.dispatchEvent(event);return event.defaultPrevented}),false,'modified link retains browser default');
 assert.equal(await page.evaluate(()=>calls.length),0);
 await next.click();assert.equal(await page.evaluate(()=>calls.length),1);
 // Autofill decorates the retained native links after each journey update.
 await page.evaluate(()=>{
  document.querySelector('#next').classList.add('nrn-page-consumed');
  document.querySelector('#original [data-part=item]:not([data-selected])').classList.add('nrn-page-consumed');
  journey.update(20,()=>true);
 });
 assert.deepEqual(await page.locator('.nrn-journey-pager .nrn-page-consumed').allTextContents(),['4–8'],'native consumed classes must not contaminate new target pages or arrows');
 await page.evaluate(()=>{document.querySelector('#original').style.marginTop='17px';journey.update(20,()=>true)});
 assert.equal(await page.locator('.nrn-journey-pager').evaluate(el=>getComputedStyle(el).marginTop),'17px','native layout updates propagate without changing the range model');
 await page.evaluate(()=>{journey.restore();document.querySelector('#next').removeAttribute('data-part');journey.update(20,()=>true)});
 assert.equal(await page.locator('.nrn-journey-pager').count(),0,'unsupported native structure keeps original navigation');
 assert.equal(await page.locator('#original').isVisible(),true);
 console.log('Native pager style PASS: native shape/spacing/selection/SVG retained; range has no link; Ctrl-click untouched; router navigation; unsupported DOM fallback. Synthetic contract fixture only.');
} finally {await browser.close()}
