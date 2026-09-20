import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const quiet={log(){},warn(){}};
async function parsePage(items,maxPage=null,responseUrl='',missingMeta=false,playlist=null){
 const metadata={data:{response:{$getSearchVideoV2:{data:{items}},page:{pagination:{maxPage},playlist}}}};
 const doc={querySelector:s=>s==='meta[name="server-response"]'&&!missingMeta?{getAttribute:()=>JSON.stringify(metadata)}:null,querySelectorAll:()=>[]};
 const context={URL,URLSearchParams,AbortController,setTimeout,clearTimeout,location:new URL('https://www.nicovideo.jp/tag/test'),performance,console:quiet,
  DOMParser:class{parseFromString(){return doc;}},fetch:async()=>({ok:true,url:responseUrl,text:async()=>''})};
 const end=source.indexOf('  var Diagnostics = (function() {');
 const ListPage=vm.runInNewContext(source.slice(0,end)+'return ListPage; })()',context);
 return ListPage.prototype.fetchPageItems(4);
}
test('generated: unknown page count stays unknown and explicit empty JSON is terminal',async()=>{
 const full=await parsePage([{id:'sm1'}]);assert.equal(full.maxPage,null);assert.equal(full.hasNextPage,null);
 const empty=await parsePage([],157);assert.equal(empty.hasNextPage,false);assert.equal(empty.maxPage,3);
 await assert.rejects(parsePage([],null,'',true),/解析できません/);
});
test('generated: redirects to an earlier page are not appended as new videos',async()=>{
 const res=await parsePage([{id:'duplicate'}],null,'https://www.nicovideo.jp/tag/test?page=3');
 assert.equal(res.items.length,0);assert.equal(res.maxPage,3);assert.equal(res.hasNextPage,false);
 await assert.rejects(parsePage([],null,'https://www.nicovideo.jp/login'),/転送/);
});
async function poolHarness(responses,last=null){
 const calls=[],updates=[];
 const ctx=vm.createContext({journey:{record(){}},console:quiet,performance,model:{config:{autoFillMaxExtraPages:{value:0},autoFillEnabled:{value:true}}},useSnapshot:false,LOG:'test',candidatePool:[],lastFetchedHadNext:null,nextPageToFetch:2,
 knownLastPage:last,endReachedWithoutRequest:false,endPageDetectionSource:'test',currentPageNumber:()=>1,fetchedPageNumbers:new Set(),fetchedExtraPages:0,totalFetchedItems:0,
 page:{fetchPageItems:async n=>{calls.push(n);const r=responses.shift();if(r instanceof Error)throw r;if(!r)throw Error('unexpected request');return r;}},
 updatePagerUi:r=>updates.push(r),logCandidateTable(){},filterFreshItems:items=>({freshItems:items})});
 const a=source.indexOf('      var fetchMoreCandidates = async function(minNeeded) {');
 const b=source.indexOf('      // -------------------- AdService',a);
 const run=vm.runInContext(source.slice(a,b)+';fetchMoreCandidates',ctx);
 return {run,ctx,calls,updates};
}
test('generated: empty beyond-end page stops future calls, keeps collected candidates and pager boundary',async()=>{
 const h=await poolHarness([{items:[{id:'sm2'}],maxPage:null,hasNextPage:null},{items:[],maxPage:157,hasNextPage:false}]);
 await h.run(48);await h.run(48);
 assert.deepEqual(h.calls,[2,3]);assert.equal(h.ctx.knownLastPage,2);assert.equal(h.ctx.candidatePool.length,1);
 assert.deepEqual([...h.ctx.fetchedPageNumbers],[2]);assert.equal(h.ctx.fetchedExtraPages,1);
});
test('generated: known final page prevents requests and unknown max does not become zero',async()=>{
 const h=await poolHarness([{items:[{id:'sm2'}],maxPage:null,hasNextPage:null},{items:[{id:'sm3'}],maxPage:3,hasNextPage:false}]);
 await h.run(48);assert.deepEqual(h.calls,[2,3]);assert.equal(h.ctx.knownLastPage,3);
 const final=await poolHarness([],1);await final.run(48);assert.deepEqual(final.calls,[]);
});
test('generated: out-of-range HTTP stops gracefully but other failures propagate',async()=>{
 const h=await poolHarness([Object.assign(new Error('404'),{status:404})]);await h.run(48);await h.run(48);
 assert.deepEqual(h.calls,[2]);assert.equal(h.ctx.knownLastPage,1);
 const broken=await poolHarness([Object.assign(new Error('500'),{status:500})]);await assert.rejects(broken.run(48),/500/);
});
test('generated: per-request budget stops both HTML and API prefetch loops',async()=>{
 for(const api of [false,true]){
  const h=await poolHarness([{items:[{id:'sm2'}],maxPage:null,hasNextPage:true}]);
  h.ctx.model.config.autoFillMaxExtraPages.value=1;
  if(api){h.ctx.useSnapshot=true;h.ctx.snapshotValidated=true;h.ctx.snapshotOffset=0;h.ctx.requestedMode='hybrid';h.ctx.snapshotFetchOffset=h.ctx.page.fetchPageItems;}
  await h.run(100);await h.run(100);assert.equal(h.calls.length,1);
  assert.equal(h.ctx.candidatePool.length,1);
 }
});

test('generated: continuous playback retains fetched page context without guessing',async()=>{
 const playlist=Buffer.from(JSON.stringify({type:'search',context:{page:4,tag:'fixture'}})).toString('base64');
 const result=await parsePage([{id:'sm1'}],null,'',false,playlist);
 assert.equal(result.items[0].__nrnPlaylist,playlist);
 assert.equal((await parsePage([{id:'sm1'}])).items[0].__nrnPlaylist,null);
});
