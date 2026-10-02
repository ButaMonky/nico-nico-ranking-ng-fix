import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=(ms=80)=>new Promise(r=>setTimeout(r,ms));
async function setup(ids=['sm1']){
 const context=vm.createContext({URL,URLSearchParams,queueMicrotask,setTimeout,clearTimeout,console:{log(){}},
  GM_xmlhttpRequest(){throw new Error('unexpected');},fetch(){throw new Error('unexpected');}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfoListener,MetadataReadiness,SnapshotOwnerSource:typeof SnapshotOwnerSource==="undefined"?null:SnapshotOwnerSource}; })()',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
 const movies=new lib.Movies(config);const list=ids.map(id=>new lib.Movie(id,'synthetic'));movies.setIfAbsent(list);
 const detail=lib.ThumbInfoListener.forCompleted(movies);for(const id of ids)detail({id,contributor:null,description:'',tags:[]});
 const requests=[],measured=[];
 const http=options=>{const r={options,aborted:false,abort(){r.aborted=true;}};requests.push(r);return r;};
 const service=lib.SnapshotOwnerSource.create(movies,http,{begin:(kind,lane)=>outcome=>measured.push([kind,lane,outcome])});
 return {...lib,config,movies,list,requests,measured,service};
}
const reply=(r,data,status=200,metaStatus=200)=>r.options.onload({status,responseText:JSON.stringify({meta:{status:metaStatus,totalCount:data.length},data})});
const idsOf=url=>[...new URL(url).searchParams].filter(([k])=>k.startsWith('filters[contentId]')).map(([,v])=>v);
test('snapshot owners: one GET per 100 IDs with the confirmed query shape',async()=>{
 const ids=Array.from({length:150},(_,i)=>'sm'+(i+1));const h=await setup(ids);
 assert.ok(h.SnapshotOwnerSource);assert.equal(h.SnapshotOwnerSource.batchSize,100);
 for(const m of h.list)assert.equal(h.service.enqueue(m),true);
 await tick();assert.equal(h.requests.length,2);
 const u=new URL(h.requests[0].options.url);
 assert.equal(u.origin+u.pathname,'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search');
 assert.equal(u.searchParams.get('fields'),'contentId,userId,channelId');assert.equal(u.searchParams.get('_limit'),'100');
 assert.equal(u.searchParams.get('_offset'),'0');assert.equal(u.searchParams.get('targets'),'title');
 assert.deepEqual(idsOf(h.requests[0].options.url),ids.slice(0,100));assert.deepEqual(idsOf(h.requests[1].options.url),ids.slice(100));
 assert.equal(new URL(h.requests[1].options.url).searchParams.get('_limit'),'50');
 assert.equal(h.requests[0].options.method,'GET');
});
test('snapshot owners: rows are matched by contentId, users only, channels and gaps stay unknown',async()=>{
 const h=await setup(['sm1','sm2','sm3','sm4','sm5','nm6']);h.config.ngUserIds.add(11);
 for(const m of h.list)h.service.enqueue(m);await tick();
 reply(h.requests[0],[{contentId:'nm6',userId:66,channelId:null},{contentId:'sm3',userId:null,channelId:33},
  {contentId:'sm1',userId:11,channelId:null},{contentId:'sm9',userId:99},{contentId:'sm4',userId:44,channelId:44},
  {contentId:'sm5',userId:'55',channelId:null},{contentId:'sm5',userId:56,channelId:null}]);
 const [m1,m2,m3,m4,m5,m6]=h.list;
 assert.equal(m1.contributor.id,11);assert.equal(m1.ng,true);assert.equal(m1.ownerResolution.source,'snapshot');
 assert.equal(h.MetadataReadiness.sourceOf(m1,'ownerId').source,'snapshot');assert.equal(m1.metadata.ownerName,'unknown');
 assert.equal(m6.contributor.id,66,'response order does not matter');
 assert.deepEqual([m2,m3,m4,m5].map(m=>[m._nrnOwnerSnapshotStatus,m.metadata.ownerId]),[['absent','unknown'],['channel','unknown'],['absent','unknown'],['conflict','unknown']]);
 assert.equal(h.movies.get('sm9'),undefined,'an unrequested row is ignored');
 for(const m of h.list)assert.equal(m._nrnOwnerIdPending,false);
 assert.deepEqual(plain(h.measured),[['snapshot','run','ok']]);
});
test('snapshot owners: failures, invalid bodies and HTTP errors keep every owner unknown',async()=>{
 for(const act of [r=>r.options.onerror(),r=>r.options.ontimeout(),r=>reply(r,[],400),r=>r.options.onload({status:200,responseText:'{bad'}),r=>reply(r,[{contentId:'sm1',userId:1}],200,500)]){
  const h=await setup(['sm1']);h.service.enqueue(h.list[0]);await tick();act(h.requests[0]);
  assert.equal(h.list[0].metadata.ownerId,'unknown');assert.equal(h.list[0]._nrnOwnerSnapshotStatus,'failed');
  assert.equal(h.list[0].ownerResolution.status,'missing');assert.equal(h.service.enqueue(h.list[0]),false,'not retried');
 }
});
test('snapshot owners: only missing sm/nm owners are queued; dispose aborts and ignores late rows',async()=>{
 const h=await setup(['sm1','so2']);assert.equal(h.service.enqueue(h.list[1]),false);
 const fresh=new h.Movie('sm3','unanswered');h.movies.setIfAbsent([fresh]);assert.equal(h.service.enqueue(fresh),false);
 h.ThumbInfoListener.forSearch(h.movies)('sm1',{type:'user',id:5,name:'page'});assert.equal(h.service.enqueue(h.list[0]),false,'known owner');
 const g=await setup(['sm1']);g.service.enqueue(g.list[0]);await tick();g.service.dispose();
 assert.equal(g.requests[0].aborted,true);reply(g.requests[0],[{contentId:'sm1',userId:7}]);
 assert.equal(g.list[0].metadata.ownerId,'unknown');assert.equal(g.list[0]._nrnOwnerIdPending,false);
 const q=await setup(['sm1']);q.service.enqueue(q.list[0]);q.service.dispose();await tick();assert.equal(q.requests.length,0,'queued IDs are dropped on dispose');
});
test('snapshot owners: parse is pure and keeps user and channel IDs apart',async()=>{
 const {SnapshotOwnerSource:S}=await setup();
 const r=S.parse(JSON.stringify({meta:{status:200},data:[{contentId:'sm1',userId:0},{contentId:'sm2',userId:-4},{contentId:'sm3',userId:'12x'},{contentId:'sm4',channelId:8}]}),['sm1','sm2','sm3','sm4','sm5']);
 assert.equal(r.status,'ok');assert.deepEqual(plain([...r.owners]),[['sm4',{type:'channel',id:8}]]);assert.deepEqual(plain(r.missing),['sm5']);
 assert.equal(S.parse('null',['sm1']).status,'invalid');assert.equal(S.parse(JSON.stringify({meta:{status:200},data:null}),['sm1']).status,'invalid');
});
