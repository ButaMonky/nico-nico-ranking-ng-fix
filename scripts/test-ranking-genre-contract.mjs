import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build,output} from './build.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
await build();
const source=await readFile(output,'utf8');
const marker='  var Diagnostics = (function() {';
assert.ok(source.includes(marker));
const mkItem=(id,title)=>({id,title,registeredAt:'2026-01-01T00:00:00+09:00',
 duration:90,owner:{id:1,type:'user',name:'Synthetic'},count:{view:5,comment:2,like:0,mylist:1}});
const mkHtml=payload=>'<html><head><meta name="server-response" content="'+
 JSON.stringify(payload).replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></head><body></body></html>';
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('http://nrn.test/ranking/genre/all');
 await page.addScriptTag({content:source.slice(0,source.indexOf(marker))+'window.QA={ListPage,Network}; })();'});
 const cases=[
  {url:'/ranking/genre/all',kind:'genre',hasNext:true,items:[mkItem('sm900001','AAA'),mkItem('sm900002','BBB')],maxPage:3},
  {url:'/ranking/genre/all',kind:'both',hasNext:true,items:[mkItem('sm900003','genre-wins')],maxPage:4},
  {url:'/ranking/genre/all',kind:'genre',hasNext:false,items:[mkItem('sm900004','last')],maxPage:null},
  {url:'/ranking/genre/all',kind:'genre',hasNext:false,items:[],maxPage:2},
  {url:'/ranking/genre/all',kind:'genre',hasNext:true,items:[mkItem('sm900007','repeated')],
   maxPage:null,servedPage:1,expectedIds:[]},
  {url:'/tag/example',kind:'search',items:[mkItem('sm900005','search')],maxPage:5},
  {url:'/search/example',kind:'search',items:[mkItem('sm900006','search2')],maxPage:7}
 ];
 for(const [i,c] of cases.entries()){
  const data=c.kind==='search'?{'$getSearchVideoV2':{data:{items:c.items}}}:
   {'$getTeibanRanking':{data:{items:c.items,hasNext:c.hasNext}}};
  if(c.kind==='both')data['$getSearchVideoV2']={data:{items:[mkItem('sm999999','wrong-source')]}};
  data.page={pagination:{page:c.servedPage||2,pageSize:100,totalCount:300,maxPage:c.maxPage}};
  const result=await page.evaluate(async ({url,html})=>{
   history.replaceState({},'',url);
   const p=new QA.ListPage(document);
   QA.Network.fetchResponse=async()=>({ok:true,status:200,url:location.origin+url+'?page=2',text:async()=>html});
   const r=await p.fetchPageItems(2,{scope:'QA',requestId:'safe-fixture'});
   return {ids:r.items.map(v=>v.id),maxPage:r.maxPage,hasNextPage:r.hasNextPage,
    metadataKeys:Object.keys(r.items[0]?.__nrnSearchItem||{})};
  },{url:c.url,html:mkHtml({data:{response:data}})});
  assert.deepEqual(result.ids,c.expectedIds||c.items.map(v=>v.id),'case '+i+' preserves correct listing');
  if(c.hasNext!==undefined)assert.equal(result.hasNextPage,
   c.items.length&&!c.servedPage?c.hasNext:false,'case '+i+' preserves hasNext');
  if(c.servedPage)assert.equal(result.maxPage,c.servedPage);
  else if(Number.isInteger(c.maxPage)&&c.items.length)assert.equal(result.maxPage,c.maxPage);
  console.log('Ranking-contract case '+(i+1)+'/'+cases.length+' PASS');
 }
 console.log('Ranking genre/search official-response contract PASS, offline synthetic.');
}finally{await browser.close();}
