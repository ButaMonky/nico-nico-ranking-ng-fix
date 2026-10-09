import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
await build();
const source=await readFile(output,'utf8'),marker='  var Diagnostics = (function() {';
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
 await page.goto('http://nrn.test/tag/synthetic');
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.QA={ListPage}; })();'});
 const data=await page.evaluate(()=>{
  const p=new QA.ListPage(document);p.resultLayout={add(){}};
  const item=(id,owner,thumb,count)=>({id,title:'Synthetic title',
   registeredAt:'2026-01-01T00:00:00Z',owner,thumbnail:{listingUrl:thumb},count});
  const options={deferAppend:true,deferActions:true};
  const name='<em data-qa-owner="1">unexpected</em>';
  const thumb='https://img.cdn.nimg.jp/thumb.jpg" data-qa-thumb="1';
  const unknown=p._createInjectedTile(item('sm900001',{name,visibility:'hidden'},thumb,
   {view:'<em data-qa-count="1">x</em>',comment:0}),options);
  const icon='https://secure-dcdn.cdn.nimg.jp/usericon/1.jpg" data-qa-icon="1';
  const known=p._createInjectedTile(item('sm900002',{type:'user',id:'123',name,iconUrl:icon},
   'https://img.cdn.nimg.jp/test.jpg',{view:100,comment:2}),options);
  const plain=p._createInjectedTile(item('sm900003',{type:'user',id:'123',name:'Ordinary owner',
   iconUrl:'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/0/123.jpg'},
   'https://img.cdn.nimg.jp/test.jpg',{view:4,comment:1}),options);
  return {
   ownerHtmlNode:!!unknown.querySelector('[data-qa-owner]')||!!known.querySelector('[data-qa-owner]'),
   imageAttribute:!!unknown.querySelector('[data-qa-thumb]')||!!known.querySelector('[data-qa-icon]'),
   countHtmlNode:!!unknown.querySelector('[data-qa-count]'),
   textPreserved:unknown.querySelector('.nrn-owner-name-fallback')?.textContent===name,
   knownTextPreserved:known.querySelector('p.fw_bold.lc_1')?.textContent===name,
   validThumb:plain.querySelector('img.mx_auto')?.src==='https://img.cdn.nimg.jp/test.jpg',
   validOwnerIcon:plain.querySelector('img.bdr_full')?.src.includes('/nicoaccount/usericon/0/123.jpg'),
   validLinks:plain.querySelectorAll('a[href="https://www.nicovideo.jp/watch/sm900003"]').length===2,
   validOwnerLink:plain.querySelector('a.nrn-autofill-owner-link')?.href==='https://www.nicovideo.jp/user/123'
  };
 });
 assert.deepEqual([data.ownerHtmlNode,data.imageAttribute,data.countHtmlNode],[false,false,false]);
 for(const key of ['textPreserved','knownTextPreserved','validThumb','validOwnerIcon','validLinks','validOwnerLink'])
  assert.equal(data[key],true,key);
 console.log('Injected-card HTML safety PASS: untrusted markup stays text; image URLs, counts and links keep normal behavior.');
} finally {await browser.close();}
