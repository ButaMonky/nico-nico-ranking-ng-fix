import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const network=await readFile(new URL('../src/data/network.js',import.meta.url),'utf8');
const auto=await readFile(new URL('../src/autofill/legacy-controller.js',import.meta.url),'utf8');
const quiet=new Proxy({}, {get:()=>()=>{}});
function loadNetwork(extra={}){return vm.runInNewContext(network+';Network',{AbortController,setTimeout,clearTimeout,...extra});}
test('network: shared requests respect global cap and errors release queue slots',async()=>{
 const queue=loadNetwork().createQueue(2),releases=[];let active=0,peak=0,count=0;
 const work=()=>new Promise((resolve,reject)=>{count++;active++;peak=Math.max(peak,active);releases.push(fail=>{active--;fail?reject(Error('test')):resolve(count);});});
 const a=queue('a',work),duplicate=queue('a',work),b=queue('b',work),c=queue('c',work);
 assert.equal(a,duplicate);const done=Promise.allSettled([a,b,c]);
 await new Promise(r=>setImmediate(r));assert.equal(count,2);
 releases[0](true);await new Promise(r=>setImmediate(r));assert.equal(count,3);assert.equal(peak,2);
 releases[1]();releases[2]();await done;
 assert.equal(await queue('a',()=>42),42);
});
test('network: response timeout includes body download',async()=>{
 let aborted=false;
 const n=loadNetwork({fetch:async(_url,{signal})=>({text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));}))})});
 await assert.rejects(n.fetchResponse('test',{},5),/aborted/);assert.equal(aborted,true);
});
test('ads: parallel callers share one request; malformed response is not a negative match; cooldown expires',async()=>{
 let calls=0,now=1000,body={data:{sponsors:[]}};
 const ctx=vm.createContext({Network:loadNetwork(),Date:{now:()=>now},model:{},AdvancedNgRules:{},gmRequest:async()=>{calls++;return {status:200,responseText:JSON.stringify(body)};}});
 const a=auto.indexOf('      var selfAdCache = new Map()'),b=auto.indexOf('      var findDomRootsForMovieId',a);
 const run=vm.runInContext(auto.slice(a,b)+';fetchSelfAdResult',ctx);
 const movie={id:'sm1',contributor:{type:'user',id:42,name:'user'}};
 const results=await Promise.all([run(movie),run(movie)]);assert.equal(calls,1);assert.equal(results[0].checked,true);
 body={unexpected:true};const other={...movie,id:'sm2'};
 assert.equal((await run(other)).checked,false);await new Promise(r=>setImmediate(r));
 await run(other);assert.equal(calls,2);
 now+=30001;body={data:{sponsors:[{userId:42,advertiserName:'user'}]}};
 await new Promise(r=>setImmediate(r));const result=await run(other);assert.equal(calls,3);assert.equal(result.idMatch,true);
 body={data:{sponsors:Array.from({length:100},()=>({userId:3}))}};
 assert.equal((await run({...movie,id:'sm3'})).checked,false);
});
test('Snapshot: bad response triggers fallback path; empty data cannot claim a next page',async()=>{
 let body={data:[],meta:{totalCount:10000}};
 const ctx=vm.createContext({URLSearchParams,performance,console:quiet,LOG:'test',SNAPSHOT_ENDPOINT:'https://example.invalid',snapshotDescriptor:{q:'test',isTag:true,order:'desc',sortField:'startTime'},gmRequest:async()=>({status:200,responseText:JSON.stringify(body)})});
 const a=auto.indexOf('      var snapshotFetchOffset = async function(offset)'),b=auto.indexOf('      var requestedMode',a);
 const run=vm.runInContext(auto.slice(a,b)+';snapshotFetchOffset',ctx);
 assert.equal((await run(100)).hasNextPage,false);
 body={data:[{contentId:'sm1'}],meta:{totalCount:null}};assert.equal((await run(0)).totalCount,null);
 body={meta:{status:503}};await assert.rejects(run(0),/応答形式/);
});
test('Snapshot: validation on later pages resumes from the fetched window, small mismatches fallback',async()=>{
 for(const mode of ['hybrid','snapshot'])for(const mismatch of [false,true]){
  const items=Array.from({length:100},(_,i)=>({id:'sm'+i}));
  const ctx=vm.createContext({console:quiet,LOG:'test',useSnapshot:true,snapshotValidated:false,snapshotValidation:null,snapshotValidationOffset:320,snapshotOffset:352,
   snapshotFetchOffset:async()=>({offset:320,items,hasNextPage:true}),page:{_currentPageNumber:11,doc:{querySelectorAll:()=>Array.from({length:3},(_,i)=>({getAttribute:()=>mismatch?'different'+i:'sm'+i}))}},
   setPhase(){},model:{movies:new Map()},requestedMode:mode,filterFreshItems:items=>({freshItems:items.slice(3)}),apiQuickNgReason:()=>'',logCandidateTable(){},
   candidatePool:[],candidatePoolSeen:new Set(),sourceLabel:'',fallbackReason:'',totalFetchedItems:0,fetchedExtraPages:0,lastFetchedHadNext:null,totalApiPrefilteredNg:0});
  const a=auto.indexOf('      var validateSnapshotAgainstCurrentDom = async function()'),b=auto.indexOf('      // -------------------- PagerManager',a);
  const run=vm.runInContext(auto.slice(a,b)+';validateSnapshotAgainstCurrentDom',ctx);await run();
  assert.equal(ctx.useSnapshot,!mismatch);
  if(!mismatch){assert.equal(ctx.snapshotOffset,420);assert.equal(ctx.candidatePool.length,97);}
 }
});

test('source context: player URL cannot change search descriptor or page navigation',()=>{
 const sourceHref='https://www.nicovideo.jp/tag/original?sort=registeredAt&order=desc&page=11';
 const ctx=vm.createContext({URL,sourceHref,location:new URL('https://www.nicovideo.jp/watch/sm1')});
 const a=auto.indexOf('      var SNAPSHOT_SORT_MAP'),b=auto.indexOf('      var snapshotDescriptor =',a);
 const descriptor=vm.runInContext(auto.slice(a,b)+';createSnapshotDescriptor()',ctx);
 assert.equal(descriptor.q,'original');assert.equal(descriptor.supported,true);
 const c=auto.indexOf('      var currentPageNumber = function()'),d=auto.indexOf('      var firstUnfetchedPageAfterCurrent',c);
 assert.equal(vm.runInContext(auto.slice(c,d)+';currentPageNumber()',ctx),11);
});
