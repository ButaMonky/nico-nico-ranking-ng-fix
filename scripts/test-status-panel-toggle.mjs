import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {build,root as wt,output} from './build.mjs';

await build();
const source=fs.readFileSync(output,'utf8');
const injected=source.replace(
  'model = createModel(config)',
  'model = createModel(config); window.testModel=model; window.testPage=page'
);
const fixture=fs.readFileSync(path.join(wt,'tests/fixtures/layout-list.html'),'utf8');
const {makeScenario}=await import(pathToFileURL(path.join(wt,'scripts/lib/autofill-fixture.mjs')));
const data=makeScenario('none');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});

try {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  let html='<!doctype html><html><body></body></html>';

  await context.route('**/*',route=>{
    const type=route.request().resourceType();
    route.fulfill({
      contentType:type==='document'?'text/html':'image/svg+xml',
      body:type==='document'?html:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
    });
  });

  html=await page.evaluate(({fixture,items})=>{
    const parser=new DOMParser();
    const doc=parser.parseFromString(
      '<!doctype html><html><head></head><body><main aria-label="nicovideo-content"><section><div class="cq-t_inline-size"><div id="cards" class="d_flex flex-d_column gap_x3"></div></div></section></main><nav data-scope="pagination"><a data-part="item" data-index="1" data-selected href="?page=1">1</a></nav></body></html>',
      'text/html'
    );
    const template=parser.parseFromString(fixture,'text/html').querySelector('[data-decoration-video-id]');
    const list=doc.getElementById('cards');
    for(const item of items.slice(0,36)){
      const node=parser.parseFromString(
        template.outerHTML.replaceAll(template.dataset.decorationVideoId,item.id),
        'text/html'
      ).body.firstElementChild;
      for(const a of node.querySelectorAll('a[href]')){
        if(a.getAttribute('href').startsWith('/watch/')&&!a.querySelector('img')){
          a.textContent=item.title;
          a.title=item.title;
        }
        if(a.href.includes('/user/')){
          a.href='https://www.nicovideo.jp/user/12';
          a.dataset.anchorHref=a.href;
          const name=a.querySelector('p');
          if(name)name.textContent='Fixture owner';
        }
      }
      list.append(node);
    }
    const meta=doc.createElement('meta');
    meta.name='server-response';
    meta.content=JSON.stringify({data:{response:{$getSearchVideoV2:{data:{items:items.slice(0,36),totalCount:36}}}}});
    doc.head.append(meta);
    return '<!doctype html>'+doc.documentElement.outerHTML;
  },{fixture,items:data.items});

  await context.addInitScript(({settings,details})=>{
    const configured={...settings,autoFillEnabled:true,autoFillTargetCount:36,statusPanelMode:'compact',autoFillAdMode:'none'};
    window.GM_getValue=(key,def)=>{
      const value=Object.hasOwn(configured,key)?configured[key]:def;
      return Array.isArray(value)?JSON.stringify(value):value;
    };
    window.GM_setValue=()=>{};
    window.GM_xmlhttpRequest=options=>{
      const id=String(options.url).split('/').pop();
      if(String(options.url).includes('/getthumbinfo/')&&details[id]){
        const timer=setTimeout(()=>options.onload?.({status:200,responseText:details[id]}),1);
        return {abort(){clearTimeout(timer);options.onabort?.();}};
      }
      options.onerror?.({});
      return {abort(){}};
    };
  },{settings:data.settings,details:Object.fromEntries(data.items.map(x=>[x.id,data.xml(x.id)]))});

  await page.goto('http://nrn.test/tag/fixture');
  await page.addScriptTag({content:injected});
  const badge=page.locator('#nrn-status-badge');
  await badge.waitFor();
  await page.waitForFunction(()=>window.testModel?.config?.statusPanelMode?.value==='compact');

  assert.equal(await badge.evaluate(e=>getComputedStyle(e).display!=='none'),true);
  assert.equal((await badge.getAttribute('title')).includes('クリックでコンパクト/詳細を切替'),true);
  assert.equal((await badge.textContent()).includes('Nico Nico Ranking NG / AutoFill'),false);

  await badge.click();
  await page.waitForFunction(()=>testModel.config.statusPanelMode.value==='detailed');
  assert.equal((await badge.textContent()).includes('Nico Nico Ranking NG / AutoFill'),true);

  await badge.click();
  await page.waitForFunction(()=>testModel.config.statusPanelMode.value==='compact');

  await page.evaluate(()=>{
    testModel.config.statusPanelMode.value='detailed';
    const badge=document.getElementById('nrn-status-badge');
    const range=document.createRange();
    range.selectNodeContents(badge);
    const selection=document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    badge.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  });
  assert.equal(await page.evaluate(()=>testModel.config.statusPanelMode.value),'detailed','active badge text selection must suppress mode toggle');
  await page.evaluate(()=>document.getSelection().removeAllRanges());

  await page.evaluate(()=>testModel.config.statusPanelMode.value='compact');
  await badge.dblclick();
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>testModel.config.statusPanelMode.value),'compact','double-click diagnostics must end in the starting visible mode');

  await page.evaluate(()=>testModel.config.statusPanelMode.value='hidden');
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('nrn-status-badge')).display==='none');
  await page.evaluate(()=>document.getElementById('nrn-status-badge').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1})));
  assert.equal(await page.evaluate(()=>testModel.config.statusPanelMode.value),'hidden','hidden mode stays settings-only');

  assert.deepEqual(errors,[]);
  console.log('Status panel toggle PASS: click compact/detailed, text selection preserved, double-click restores mode, hidden remains settings-only.');
  await context.close();
} finally {
  await browser.close();
}
