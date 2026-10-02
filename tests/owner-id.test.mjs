import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=value=>JSON.parse(JSON.stringify(value));
const condition=(field,operator,value)=>({kind:'condition',field,operator,value});
async function setup(stored={}){
 const saved={...stored};
 const context=vm.createContext({URL,queueMicrotask,console:{log(){},warn(){},error(){}},GM_xmlhttpRequest(){throw new Error('no requests');},fetch(){throw new Error('no requests');}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {OwnerId:typeof OwnerId==="undefined"?null:OwnerId,Config,Movie,Movies,ThumbInfoListener,OwnerEvidence,AdvancedNgRules,ArrayStore}; })()',context);
 const config=new lib.Config((k,d)=>k in saved?saved[k]:d,(k,v)=>{saved[k]=v;});await config.sync();
 const movies=new lib.Movies(config);
 return {...lib,config,movies,saved,context};
}
const MAX='9007199254740991',P1='9007199254740992',P2='9007199254740993',LONG='123456789012345678901234567890';
test('owner ID: canonical decimal strings never pass through Number',async()=>{
 const {OwnerId:O}=await setup();assert.ok(O,'OwnerId is built into the userscript');
 const cases=[['1','1',1],['9999','9999',9999],['10000','10000',10000],['12345678','12345678',12345678],[MAX,MAX,Number(MAX)],
  [P1,P1,null],[P2,P2,null],[LONG,LONG,null],['000123','123',123],[' 77 ','77',77],[12345678,'12345678',12345678],[2**53,null,null]];
 for(const [input,canonical,safe] of cases){assert.equal(O.canonical(input),canonical,String(input));assert.equal(O.safe(input),safe,String(input));}
 for(const bad of ['0','000','-1','1.5','1e20','abc','',null,undefined,'1 2','+3','0x10',-1,0,1.5,NaN,Infinity,{},[]])
  {assert.equal(O.canonical(bad),null,String(bad));assert.equal(O.safe(bad),null,String(bad));}
});
test('owner ID: 9007199254740992 and 9007199254740993 are never the same ID',async()=>{
 const {OwnerId:O}=await setup();
 assert.notEqual(O.canonical(P1),O.canonical(P2));assert.equal(O.same(P1,P2),false);assert.equal(O.same(P2,P2),true);
 assert.equal(O.same('000123',123),true);assert.equal(O.same(null,null),false);
 assert.equal(Number(P1)===Number(P2),true,'this is exactly the rounding that must not be used');
});
test('owner ID: icon CDN bucket is computed on digits',async()=>{
 const {OwnerId:O}=await setup();
 assert.deepEqual([O.bucket('1'),O.bucket('9999'),O.bucket('10000'),O.bucket('12345678'),O.bucket(8174142),O.bucket(P2),O.bucket('000123456')],
  ['0','0','1','1234','817','900719925474','12']);
 assert.equal(O.bucket('abc'),null);assert.equal(O.bucket('0'),null);
});
test('owner ID: owner parsing keeps safe IDs and leaves larger IDs unknown, never rounded',async()=>{
 const {OwnerEvidence:E}=await setup();
 assert.equal(E.normalize({type:'user',id:MAX}).id,Number(MAX));assert.equal(E.normalize({type:'user',id:'000123'}).id,123);
 for(const id of [P1,P2,LONG,'1.5','1e20','0',-1,'']) assert.equal(E.normalize({type:'user',id}),null,String(id));
 assert.equal(E.fromUrl('https://www.nicovideo.jp/user/'+P2),null);assert.equal(E.fromUrl('https://www.nicovideo.jp/user/12345678').id,12345678);
});
test('owner ID: NG user IDs match as before and large IDs stay exact and distinct',async()=>{
 const h=await setup({ngUserIds:JSON.stringify([12345678,'777',{value:'000999',text:'old'},P1,P2])});
 const set=h.config.ngUserIds.set;
 assert.ok(set.has(12345678)&&set.has(777)&&set.has(999),'safe IDs keep their numeric form');
 assert.ok(set.has(P1)&&set.has(P2),'large IDs are kept as exact strings');assert.equal(set.size,5,'no two IDs collapsed into one');
 const m=new h.Movie('sm1','x');h.movies.setIfAbsent([m]);
 h.ThumbInfoListener.forSearch(h.movies)('sm1',{type:'user',id:'12345678',name:'n'});assert.equal(m.ng,true);
 const other=new h.Movie('sm2','x');h.movies.setIfAbsent([other]);
 h.ThumbInfoListener.forSearch(h.movies)('sm2',{type:'user',id:MAX,name:'n'});assert.equal(other.ng,false,'max safe ID is not matched by rounded large entries');
});
test('owner ID: advanced NG userId and contributorId compare exact safe IDs only',async()=>{
 const h=await setup();const m=new h.Movie('sm1','x');h.movies.setIfAbsent([m]);
 h.ThumbInfoListener.forSearch(h.movies)('sm1',{type:'user',id:MAX,name:'n'});
 const R=h.AdvancedNgRules;
 assert.equal(R.evaluateNode(m,condition('userId','eq',Number(MAX))),true);
 assert.equal(R.evaluateNode(m,condition('contributorId','eq',Number(MAX))),true);
 assert.equal(R.evaluateNode(m,condition('userId','eq',Number(P2))),false,'a rounded large rule value never hits a safe owner');
 assert.equal(R.evaluateNode(m,condition('userId','eq',12345678)),false);
});
test('owner ID: CSV import accepts only positive safe decimal IDs and round-trips them',async()=>{
 const h=await setup();
 await h.config.addFromCSV(['ngUserId,000123,a','ngUserId,12345678,b','ngUserId,1.5,c','ngUserId,1e3,d','ngUserId,0,e','ngUserId,-1,f',
  'ngUserId,abc,g','ngUserId,'+P2+',h','ngChannelId,'+MAX+',i','ngChannelId,ch5,j'].join('\n'));
 assert.deepEqual(plain(h.config.ngUserIds.array),[123,12345678]);assert.deepEqual(plain(h.config.ngChannelIds.array),[Number(MAX)]);
 const csv=await h.config.toCSV({ngUserId:true,ngChannelId:true});
 assert.equal(csv,'ngUserId,123,a\nngUserId,12345678,b\nngChannelId,'+MAX+',i');
 const restored=await setup();await restored.config.addFromCSV(csv);assert.equal(await restored.config.toCSV({ngUserId:true,ngChannelId:true}),csv);
});
test('owner ID: persisted NG IDs survive save and reload unchanged',async()=>{
 const h=await setup();await h.config.ngUserIds.addAsync(12345678,'a');await h.config.ngUserIds.addAsync(Number(MAX));
 const reloaded=await setup(h.saved);
 assert.deepEqual(plain(reloaded.config.ngUserIds.array),[12345678,Number(MAX)]);
 assert.equal(JSON.parse(h.saved.ngUserIds)[1],Number(MAX),'stored format for safe IDs is still a JSON number');
 const legacy=await setup({ngUserIds:JSON.stringify([12.9])});assert.deepEqual(plain(legacy.config.ngUserIds.array),[12],'v14.1 legacy truncation kept');
});
