import test from 'node:test';
import {readAutoFillSource} from '../scripts/lib/autofill-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const auto=await readAutoFillSource();
const adapter=await readFile(new URL('../src/data/search-item-adapter.js',import.meta.url),'utf8');
const quiet=new Proxy({}, {get:()=>()=>{}});
async function fetchItems(data) {
  const calls=[];
  const context=vm.createContext({page:{},model:{},URLSearchParams,performance,console:quiet,LOG:'fixture',
    OwnerEvidence:{normalize:()=>null},
    SNAPSHOT_ENDPOINT:'https://example.invalid/snapshot',
    snapshotDescriptor:{q:'fixture',isTag:true,order:'desc',sortField:'startTime'},
    gmRequest:async request=>{calls.push(request);return {status:200,responseText:JSON.stringify({meta:{status:200,totalCount:data.length},data})};}});
  vm.runInContext(adapter,context);
  const begin=auto.indexOf('      var snapshotFetchOffset = async function(offset,');
  const end=auto.indexOf('      var requestedMode',begin);
  assert.ok(begin>=0 && end>begin,'exercise the production snapshot mapper');
  const run=vm.runInContext(auto.slice(begin,end)+';snapshotFetchOffset',context);
  const result=await run(0);
  assert.equal(calls.length,1,'normalization must not fetch extra metadata');
  return result.items;
}
const numericFields=['viewCounter','commentCounter','mylistCounter','likeCounter','lengthSeconds'];
function row(value) {return {contentId:'sm1',title:'fixture',...Object.fromEntries(numericFields.map(k=>[k,value]))};}
function numbers(item) {return [...Object.values(item.count),item.duration];}
test('snapshot metadata: missing counters and duration remain unknown, never invented zero',async()=>{
  const [item]=await fetchItems([{contentId:'sm1'}]);
  assert.deepEqual(numbers(item),[null,null,null,null,null]);
});
test('snapshot metadata: null remains unknown in every numeric field',async()=>{
  const [item]=await fetchItems([row(null)]);assert.deepEqual(numbers(item),[null,null,null,null,null]);
});
test('snapshot metadata: explicit zero stays a known zero',async()=>{
  const [item]=await fetchItems([row(0)]);assert.deepEqual(numbers(item),[0,0,0,0,0]);
});
test('snapshot metadata: positive and boundary-safe integer counts are preserved exactly',async()=>{
  for (const value of [1,42,Number.MAX_SAFE_INTEGER]) {
    const [item]=await fetchItems([row(value)]);assert.deepEqual(numbers(item),Array(5).fill(value));
  }
});
test('snapshot metadata: coerced strings, booleans, arrays, negatives, fractions and unsafe integers stay unknown',async()=>{
  for (const value of ['5','',false,true,[],{},-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity]) {
    const [item]=await fetchItems([row(value)]);assert.deepEqual(numbers(item),Array(5).fill(null),JSON.stringify(value));
  }
});
test('snapshot metadata: zero sign is canonical and differs from missing data',async()=>{
  const items=await fetchItems([{...row(-0),contentId:'sm1'},{...row(null),contentId:'sm2'}]);
  assert.equal(Object.is(items[0].count.like,-0),false);assert.equal(items[0].count.like,0);assert.equal(items[1].count.like,null);
});
test('snapshot metadata: order, source offset and nonnumeric payload are retained',async()=>{
  const items=await fetchItems([{...row(null),contentId:'sm2',tags:'one two'}, {...row(7),contentId:'sm1',description:'text'}]);
  assert.deepEqual(items.map(x=>x.id).slice().join(','),'sm2,sm1');
  assert.equal(items[0].__nrnSnapshotOffset,0);assert.equal(items[1].__nrnSnapshotOffset,1);
  assert.equal(items[0].snapshotTags.join(','),'one,two');assert.equal(items[1].description,'text');
});

test('snapshot metadata: normalized search payload is attached for the injected-card Movie bridge',async()=>{
  const at='2026-09-20T02:56:13+09:00';
  const [item,missing]=await fetchItems([
    {contentId:'sm7',title:'fixture',viewCounter:12,commentCounter:3,mylistCounter:2,likeCounter:0,lengthSeconds:90,startTime:at},
    {contentId:'sm8',title:'missing'}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(item.__nrnSearchItem)),{
    videoId:'sm7',owner:null,likeCount:0,viewCount:12,commentCount:3,mylistCount:2,
    durationSeconds:90,registeredAtMs:Date.parse(at)
  });
  assert.deepEqual(JSON.parse(JSON.stringify(missing.__nrnSearchItem)),{
    videoId:'sm8',owner:null,likeCount:null,viewCount:null,commentCount:null,mylistCount:null,
    durationSeconds:null,registeredAtMs:null
  });
});

test('snapshot metadata: attached payload survives the injected-card adapter bridge without inventing unknowns',async()=>{
  const [item]=await fetchItems([{contentId:'sm9',viewCounter:0,commentCounter:null,mylistCounter:4,likeCounter:2,lengthSeconds:61}]);
  const context=vm.createContext({OwnerEvidence:{normalize:()=>null}});
  vm.runInContext(adapter,context);
  const A=context.SearchItemAdapter,root={dataset:{decorationVideoId:'sm9'}};
  A.register(root,item.__nrnSearchItem);
  const values=JSON.parse(JSON.stringify(A.valuesFor({movie:{id:'sm9'},rootElem:root},null)));
  assert.deepEqual(values,{likeCount:2,viewCount:0,mylistCount:4,durationSeconds:61});
  assert.equal('commentCount' in values,false,'unknown stays absent when Movie.observeSearchFields consumes the bridge');
  assert.equal('registeredAtMs' in values,false);
});
