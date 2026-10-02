import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const context=vm.createContext({URL,queueMicrotask,console:{log(){}},GM_xmlhttpRequest(){throw new Error('no requests');},fetch(){throw new Error('no requests');}});
const {SearchItemAdapter:A,OwnerEvidence}=vm.runInContext(source.slice(0,boundary)+'return {SearchItemAdapter:typeof SearchItemAdapter === "undefined" ? null : SearchItemAdapter,OwnerEvidence}; })()',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const doc=content=>({querySelector:s=>s==='meta[name="server-response"]'&&content!==undefined?{getAttribute:()=>content}:null});
const response=items=>JSON.stringify({data:{response:{$getSearchVideoV2:{data:{items}}}}});
test('search item adapter: normal item keeps only confirmed fields',()=>{
 assert.ok(A,'SearchItemAdapter is built into the userscript');
 const item={id:'sm9',title:'synthetic',owner:{type:'user',id:12,name:' synthetic-owner ',visibility:'visible'},
  count:{like:5,view:100,comment:3,mylist:1},duration:60,registeredAt:'2026-01-01T00:00:00+09:00',unknownField:{nested:true}};
 const result=plain(A.normalize(item));
 assert.deepEqual(result,{videoId:'sm9',owner:{type:'user',id:12,name:'synthetic-owner',visibility:'visible'},likeCount:5});
 assert.deepEqual(Object.keys(result).sort(),['likeCount','owner','videoId'],'unconfirmed and unknown fields are not copied');
 assert.equal(item.count.like,5,'input is not mutated');
});
test('search item adapter: missing or contradictory owners are null, likes are still read',()=>{
 assert.equal(A.normalize({id:'sm1',count:{like:7}}).owner,null);
 assert.equal(A.normalize({id:'sm1',count:{like:7}}).likeCount,7);
 for(const owner of [null,{},{type:'channel',ownerType:'user',id:12},{type:'other',id:12},{type:'user',id:'ch12'},{type:'user',id:0},{type:'user',id:-3},{type:'user',id:'12x'}])
  assert.equal(A.normalize({id:'sm1',owner}).owner,null,JSON.stringify(owner));
 assert.deepEqual(plain(A.normalize({id:'so2',owner:{type:'channel',id:'ch34'}}).owner),{type:'channel',id:34,name:null,visibility:null});
 assert.deepEqual(plain(A.normalize({id:'sm3',owner:{ownerType:'hidden',type:'user',id:77,name:null}}).owner),{type:'user',id:77,name:null,visibility:'hidden'});
});
test('search item adapter: invalid video IDs are rejected',()=>{
 for(const id of [undefined,null,'',123,'bad','sm','sm12x','lv1','so-1',' sm1','sm1 '])
  assert.equal(A.normalize({id,count:{like:1}}),null,String(id));
 for(const item of [null,undefined,'sm1',42,[]]) assert.equal(A.normalize(item),null);
});
test('search item adapter: zero is a known count and never confused with unknown',()=>{
 const zero=A.normalize({id:'sm1',count:{like:0}}),absent=A.normalize({id:'sm2',count:{}});
 assert.strictEqual(zero.likeCount,0);assert.strictEqual(absent.likeCount,null);assert.notStrictEqual(zero.likeCount,absent.likeCount);
 for(const item of [{id:'sm1'},{id:'sm1',count:null},{id:'sm1',count:{like:null}},{id:'sm1',count:{like:undefined}},{id:'sm1',count:'5'}])
  assert.strictEqual(A.normalize(item).likeCount,null,JSON.stringify(item));
});
test('search item adapter: strings, negatives, fractions and non-finite values stay unknown',()=>{
 for(const like of ['5','0','',' 3 ','1e3',-1,-0.5,1.5,NaN,Infinity,-Infinity,2**53,true,false,{},[]])
  assert.strictEqual(A.normalize({id:'sm1',count:{like}}).likeCount,null,String(like));
 assert.strictEqual(A.count(Number.MAX_SAFE_INTEGER),Number.MAX_SAFE_INTEGER);
 assert.strictEqual(A.count(-0),0,'negative zero is a JSON-valid zero count');
});
test('search item adapter: document reading reports missing, invalid and ok responses',()=>{
 assert.deepEqual(plain(A.readDocument(doc(undefined))),{status:'missing',items:[]});
 assert.deepEqual(plain(A.readDocument(null)),{status:'missing',items:[]});
 assert.deepEqual(plain(A.readDocument(doc('{not json'))),{status:'invalid',items:[]});
 assert.deepEqual(plain(A.readDocument(doc(JSON.stringify({data:{response:{}}})))),{status:'missing',items:[]});
 const items=[{id:'sm1',owner:{type:'user',id:1},count:{like:0}},{id:'bad',count:{like:9}},
  {id:'sm2',count:{}},{id:'sm1',owner:{type:'user',id:2},count:{like:4}},null];
 const read=plain(A.readDocument(doc(response(items))));
 assert.equal(read.status,'ok');
 assert.deepEqual(read.items.map(i=>[i.videoId,i.likeCount,i.owner?.id??null]),[['sm1',0,1],['sm2',null,null],['sm1',4,2]],'page order and duplicates are kept for the caller');
});
test('owner evidence initial document reads owners through the adapter with unchanged identity rules',()=>{
 const items=[{id:'sm1',owner:{type:'user',id:55,name:null},count:{like:0}},{id:'sm1',owner:{type:'user',id:55,name:'later'}},
  {id:'sm2',owner:{type:'user',id:66}},{id:'sm2',owner:{type:'user',id:67}},{id:'sm2',owner:{type:'user',id:66}},
  {id:'so3',owner:{type:'channel',id:'ch9'}},{id:'bad',owner:{type:'user',id:1}},{id:'sm4'}];
 const owners=OwnerEvidence.initialDocument(doc(response(items)));
 assert.deepEqual(plain([...owners.keys()]),['sm1','so3'],'conflicting sm2 stays excluded even if a later row repeats the first owner');
 assert.equal(owners.get('sm1').name,'later');assert.equal(owners.get('so3').type,'channel');
 for(const content of [undefined,'{broken','null',JSON.stringify({data:{}})]) assert.equal(OwnerEvidence.initialDocument(doc(content)).size,0);
});
test('search item adapter: one broken item does not discard the rest',()=>{
 const raw=[{id:'sm1',count:{like:1}},{id:'sm2',get owner(){throw new Error('broken');}},{id:'sm3',count:{like:2}}];
 const response={data:{response:{$getSearchVideoV2:{data:{items:raw}}}}};
 assert.equal(A.itemsOf(response),raw);assert.equal(A.itemsOf({}),null);
 const fake={querySelector:()=>({getAttribute:()=>'{}'})};assert.equal(A.readDocument(fake).status,'missing');
 const parsed=[];for(const item of raw){try{const n=A.normalize(item);if(n)parsed.push(n.videoId);}catch(_){parsed.push('threw');}}
 assert.deepEqual(parsed,['sm1','threw','sm3'],'normalize surfaces the error; readDocument isolates it');
 const realmJSON=vm.runInContext('JSON',context),original=realmJSON.parse;let read;
 try{realmJSON.parse=()=>response;read=A.readDocument(doc('{}'));}finally{realmJSON.parse=original;}
 assert.equal(read.status,'ok');assert.deepEqual(plain(read.items.map(i=>i.videoId)),['sm1','sm3']);
});
// BRUSH-005b: fetched result pages go through the same adapter.
async function fetchPage(items,missingMeta=false){
 const metadata={data:{response:{$getSearchVideoV2:{data:{items}},page:{pagination:{maxPage:3},playlist:'pl'}}}};
 const page={querySelector:s=>s==='meta[name="server-response"]'&&!missingMeta?{getAttribute:()=>JSON.stringify(metadata)}:null,querySelectorAll:()=>[]};
 const ctx={URL,URLSearchParams,AbortController,setTimeout,clearTimeout,location:new URL('https://www.nicovideo.jp/tag/test'),performance,console:{log(){},warn(){}},
  DOMParser:class{parseFromString(){return page;}},fetch:async()=>({ok:true,url:'',text:async()=>''})};
 const end=source.indexOf('  var Diagnostics = (function() {');
 const ListPage=vm.runInNewContext(source.slice(0,end)+'return ListPage; })()',ctx);
 return ListPage.prototype.fetchPageItems(2);
}
test('fetched pages: server-response items carry normalized likes without losing raw fields',async()=>{
 const result=await fetchPage([{id:'sm1',title:'t1',count:{like:0,view:5},owner:{type:'user',id:12}},{id:'sm2',title:'t2',count:{}},
  {id:'sm3',count:{like:'7'}},{id:'bad',count:{like:9}}]);
 const rows=plain(result.items);
 assert.deepEqual(rows.map(r=>r.__nrnSearchItem&&r.__nrnSearchItem.likeCount),[0,null,null,null]);
 assert.equal(rows[3].__nrnSearchItem,null,'invalid IDs stay raw-only, as before');
 assert.equal(rows[0].title,'t1');assert.equal(rows[0].count.view,5);assert.equal(rows[0].__nrnPlaylist,'pl');
 assert.deepEqual(rows[0].__nrnSearchItem.owner,{type:'user',id:12,name:null,visibility:null});
 assert.equal(rows.length,4,'page item count is unchanged');
});
test('fetched pages: injected roots only return the item of the same video',()=>{
 const root={dataset:{decorationVideoId:'sm1'}},other={dataset:{decorationVideoId:'sm2'}};
 const item=A.normalize({id:'sm1',count:{like:3}});
 A.register(root,item);A.register(other,item);A.register(root,null);
 assert.equal(A.fromRoot(root,'sm1').likeCount,3);assert.equal(A.fromRoot(other,'sm1'),null,'mismatched card is never registered');
 assert.equal(A.fromRoot(root,'sm2'),null);root.dataset.decorationVideoId='sm9';assert.equal(A.fromRoot(root,'sm1'),null,'card reused for another video');
 assert.equal(A.tryNormalize({id:'sm1',get owner(){throw new Error('broken');}}),null);
});
// BRUSH-006: like counts per video and per card row.
test('like counts: known values per video, conflicts and nulls stay unknown',()=>{
 const items=[{id:'sm1',count:{like:0}},{id:'sm1',count:{like:0}},{id:'sm2',count:{like:5}},{id:'sm2',count:{like:6}},
  {id:'sm2',count:{like:5}},{id:'sm3'},{id:'sm4',count:{like:null}},{id:'sm4',count:{like:8}},{id:'sm5',count:{like:'9'}}].map(A.normalize);
 assert.deepEqual(plain([...A.likeCounts(items)]),[['sm1',0],['sm4',8]]);
 assert.equal(A.likeCounts(null).size,0);
});
test('like counts: a card row uses its own injected item, then the initial document for the same video',()=>{
 const initial=new Map([['sm1',0],['sm2',4]]);
 const injectedRoot={dataset:{decorationVideoId:'sm2'}};A.register(injectedRoot,A.normalize({id:'sm2',count:{}}));
 assert.strictEqual(A.likeFor({movie:{id:'sm1'},rootElem:{dataset:{decorationVideoId:'sm1'}}},initial),0);
 assert.strictEqual(A.likeFor({movie:{id:'sm2'},rootElem:injectedRoot},initial),null,'injected item without likes is not filled from another source');
 assert.strictEqual(A.likeFor({movie:{id:'sm1'},rootElem:{dataset:{decorationVideoId:'sm9'}}},initial),null,'mismatched card');
 assert.strictEqual(A.likeFor({movie:{id:'sm3'},rootElem:{dataset:{decorationVideoId:'sm3'}}},initial),null);
 assert.strictEqual(A.likeFor({movie:{id:'sm1'},rootElem:{dataset:{decorationVideoId:'sm1'}}},null),null,'SPA route without initial data');
});
