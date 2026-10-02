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
