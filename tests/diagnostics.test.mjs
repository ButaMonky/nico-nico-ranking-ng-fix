import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
function load(extra={}){
 const messages=[];let now=100;
 const context=vm.createContext({URL,performance:{now:()=>now},console:{log:(...a)=>messages.push(a),warn:(...a)=>messages.push(a),error:(...a)=>messages.push(a)},window:{},...extra});
 const end=source.indexOf('  var MovieViewMode =');
 const lib=vm.runInContext(source.slice(0,end)+'return {Config,Movies,Movie,ThumbInfo,ThumbInfoListener,MetadataReadiness,console,nrnSetConsoleConfig,nrnNativeConsole,nrnConsoleCounts}; })()',context);
 Object.assign(context,lib,{NRN_VERSION:'160.19'});
 const begin=source.indexOf('  var Diagnostics ='),stop=source.indexOf('  var NewTabService =',begin);
 const Diagnostics=vm.runInContext(source.slice(begin,stop)+'; Diagnostics',context);
 return {...lib,Diagnostics,messages,advance:ms=>now+=ms};
}
async function setup(){
 const h=load();h.config=new h.Config((k,d)=>d,()=>{});await h.config.sync();h.nrnSetConsoleConfig(h.config);
 h.movies=new h.Movies(h.config);h.movie=new h.Movie('sm888881','SECRET_TITLE');h.movies.setIfAbsent([h.movie]);
 h.run=h.Diagnostics.start(h.config,'/tag/SECRET_QUERY');h.run.bind(h.movies);
 return h;
}
test('preview diagnostics allow counters only and never expose player payloads',async()=>{
 const h=await setup();
 h.run.bindPreview(()=>({started:2,preview:2,rights:1,comments:1,active:true,url:'SECRET_URL',threadKey:'SECRET_KEY',text:'SECRET_COMMENT',error:'PRIVATE_ERROR'}));
 const s=h.Diagnostics.snapshot();assert.equal(s.current.preview.started,2);assert.equal(s.current.preview.active,true);
 assert.equal(s.current.preview.enabled,false);assert.equal(s.current.preview.controlRequestsOnly,true);
 assert.doesNotMatch(JSON.stringify(s),/SECRET|PRIVATE/);
 h.run.close();assert.equal(h.Diagnostics.snapshot().previous[0].preview.started,2);
});
test('diagnostic report omits personal strings, IDs, raw errors and URLs even in developer mode',async()=>{
 const h=await setup();h.config.developerMode.value=true;
 h.ThumbInfoListener.forSearch(h.movies)('sm888881',{type:'user',id:987654321,name:'SECRET_OWNER'});
 h.config.ngTitles.add('SECRET_FILTER');
 for(const fn of ['log','warn','error','table'])h.console[fn]('SECRET_MESSAGE',{url:'https://private.invalid/SECRET_URL',id:987654321});
 h.Diagnostics.error('SECRET_MODULE','SECRET_ERROR',{cookie:'SECRET_COOKIE'});
 h.Diagnostics.problem('SECRET_STAGE');h.Diagnostics.problem('startup');
 const text=h.Diagnostics.publish('SECRET_REASON');
 const all=JSON.stringify(h.messages)+text+JSON.stringify(h.Diagnostics.getHistory());
 assert.doesNotMatch(all,/SECRET|987654321|sm888881|private\.invalid/);
 assert.equal(JSON.parse(text).version,'160.19');
 assert.equal(JSON.parse(text).current.detailPlan.readyWithoutRequest,1);
 assert.equal(JSON.parse(text).problemCounts.startup,1);
});
test('name recovery diagnostics explain unknown hidden names and independent NG skips without names',async()=>{
 const h=await setup();h.ThumbInfoListener.forSearch(h.movies)(h.movie.id,{type:'user',id:55,name:null,visibility:'hidden'});
 h.config.ngUserNames.add('PRIVATE_NAME');h.config.ngUserIds.add(55);
 let report=h.Diagnostics.snapshot().current;
 assert.equal(report.ownerNameRecovery.hiddenUnknown,1);
 assert.equal(report.ownerNameRecovery.skippedNg,1);
 assert.equal(report.ownerNameRecovery.awaitingDetails,1);
 h.movie.requestDetails();
 assert.equal(h.Diagnostics.snapshot().current.ownerNameRecovery.skippedNg,0,'expanded NG cards are eligible for recovery');
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE_NAME|sm888881/);
});
test('unique skipped cards are gauges, cache hits and completed requests are distinct',async()=>{
 const h=await setup();h.ThumbInfoListener.forSearch(h.movies)('sm888881',{type:'user',id:12,name:'fixture'});
 for(let i=0;i<100;i++)assert.equal(h.Diagnostics.snapshot().current.detailPlan.readyWithoutRequest,1);
 assert.equal(h.Diagnostics.snapshot().current.network.run.detail.attempts,0);
 h.run.cache('sm888881','session');
 h.ThumbInfoListener.forCompleted(h.movies)({id:'sm888881',description:'',tags:[],contributor:{type:'user',id:12,name:'fixture'}});
 const snap=h.Diagnostics.snapshot();assert.equal(snap.current.detailPlan.cacheOnly,1);
 assert.equal(snap.current.cache.sessionRestoredVideos,1);assert.equal(snap.current.detailPlan.readyWithoutRequest,0);
});
test('wire calls, retries, failures, timings and diagnostic traffic are separate',async()=>{
 const h=await setup();const first=h.run.begin('detail','run','sm888881');h.advance(12);first('timeout');first('ok');
 const retry=h.run.begin('detail','run','sm888881',true);h.advance(7);retry('ok');
 h.run.begin('snapshot','diagnostic')('http');
 const s=h.Diagnostics.snapshot().current;
 assert.equal(s.network.run.detail.attempts,2);assert.equal(s.network.run.detail.uniqueVideos,1);
 assert.equal(s.network.run.detail.retries,1);assert.equal(s.network.run.detail.timeout,1);
 assert.equal(s.network.run.detail.ok,1);assert.equal(s.network.run.detail.durationSumMs,19);
 assert.equal(s.network.run.snapshot.attempts,0);assert.equal(s.network.diagnostic.snapshot.attempts,1);
});
test('SPA closes previous counters and ignores late completions without retaining models',async()=>{
 const h=await setup();const late=h.run.begin('detail','run','sm888881');h.run.close();
 h.Diagnostics.start(h.config,'/search/PRIVATE_SEARCH');late('ok');
 const s=h.Diagnostics.snapshot();assert.equal(s.current.sequence,2);assert.equal(s.previous[0].network.run.detail.aborted,1);
 assert.equal(s.current.network.run.detail.attempts,0);assert.equal(s.previous[0].network.run.detail.ok,0);
});
test('required unknown fields survive failures in the report',async()=>{
 const h=await setup();h.config.ngTags.add('private tag');h.config.ngLockedTagCountEnabled.value=true;
 let s=h.Diagnostics.snapshot().current;assert.equal(s.missingRequired.tags,1);assert.equal(s.missingRequired.lockedTags,1);
 h.ThumbInfoListener.forErrorOccurred(h.movies)({id:'sm888881',error:{type:'TIMEOUT'}});
 s=h.Diagnostics.snapshot().current;assert.equal(s.detailPlan.terminalUnresolved,1);assert.equal(s.fieldStates.tags.failed,1);
});
test('summary contains snapshots, not mutable references, and no copy operation sends requests',async()=>{
 const h=await setup();const s=h.Diagnostics.snapshot();s.current.network.run.detail.attempts=123;
 assert.equal(h.Diagnostics.snapshot().current.network.run.detail.attempts,0);
 for(let i=0;i<3;i++)h.Diagnostics.publish('manual');
 assert.equal(h.messages.filter(row=>row[0].startsWith('NRN_REPORT_BEGIN')).length,3);
 assert.equal(h.Diagnostics.snapshot().current.network.run.detail.attempts,0);
 assert.ok(h.messages.every(row=>row.every(x=>typeof x==='string')),'console output is printable text, never collapsed objects');
});

test('real detail transport instrumentation counts deduplication, retry, HTTP errors and concurrency',async()=>{
 const h=await setup(),calls=[];
 const service=new h.ThumbInfo(o=>{calls.push(o);return {abort(){o.onabort();}}},1,h.run);
 h.run.bind(h.movies,service);service.request(['sm888881','sm888881','sm888882']);
 calls[0].ontimeout();calls[0].onerror();
 assert.equal(calls.length,2);
 calls[1].onload({status:503,statusText:'SECRET_HTTP'});
 assert.equal(calls.length,3);calls[2].onerror();
 const n=h.Diagnostics.snapshot().current.network.run.detail;
 assert.equal(n.attempts,calls.length);assert.equal(n.uniqueVideos,2);assert.equal(n.retries,1);
 assert.equal(n.timeout,1);assert.equal(n.http,1);assert.equal(n.network,1);assert.equal(n.peakActive,1);assert.equal(n.active,0);
 service.request(['sm888883']);service.dispose();h.run.close();calls[3].onload({status:200});
 assert.equal(h.Diagnostics.snapshot().previous[0].network.run.detail.aborted,1);
});

test('safe audit, timings and comparison are copied without private payloads',async()=>{
 const h=await setup();h.run.initial({totalInitMs:25,raw:'SECRET'});
 h.run.audit({duplicateCards:1,ownerNgMismatches:2,private:'SECRET'});
 h.run.comparison({legacy:{ok:true,candidateCount:3,elapsedMs:10,rows:['SECRET']}});
 h.advance(40);h.run.phase('completed');h.advance(10);
 const s=h.Diagnostics.snapshot();s.current.initialProcessing.totalInitMs=999;s.current.audit.duplicateCards=99;
 s.current.sourceComparison.legacy.candidates=999;
 const next=h.Diagnostics.snapshot();assert.equal(next.current.initialProcessing.totalInitMs,25);
 assert.equal(next.current.audit.duplicateCards,1);assert.equal(next.current.sourceComparison.legacy.candidates,3);
 assert.equal(next.current.terminalElapsedMs,40);assert.equal(next.current.elapsedSinceRouteStartMs,50);
 assert.equal(next.current.sourceComparison.sameWorkload,false);assert.doesNotMatch(JSON.stringify(next),/SECRET/);
});

test('payload validation failures are explicit, bounded categories and separate from transport results',async()=>{
 const h=await setup();h.run.begin('snapshot','diagnostic')('ok');
 h.run.validationFailure('snapshot','diagnostic','invalid');h.run.validationFailure('adsThanks','run','incomplete');
 h.run.validationFailure('PRIVATE','run','invalid');h.run.validationFailure('snapshot','run','PRIVATE');
 const s=h.Diagnostics.snapshot();assert.equal(s.current.network.diagnostic.snapshot.ok,1);
 assert.equal(s.current.payloadFailures.diagnostic.snapshot.invalid,1);
 assert.equal(s.current.payloadFailures.run.adsThanks.incomplete,1);
 assert.doesNotMatch(JSON.stringify(s),/PRIVATE|lockedTagThreshold/);
});
