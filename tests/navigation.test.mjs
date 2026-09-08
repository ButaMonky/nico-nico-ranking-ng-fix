import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
async function setup(path){
 const source=await readFile(path,'utf8'),a='    var setupSpaNavigationGuard = function() {',b='    var domContentLoaded = async function() {';
 assert.equal(source.split(a).length,2);assert.equal(source.split(b).length,2);
 const timers=[],intervals=[],events={},reloads=[];
 const location={href:'https://www.nicovideo.jp/tag/first',origin:'https://www.nicovideo.jp',host:'www.nicovideo.jp',reload:()=>reloads.push(location.href)};
 const history={pushState(_s,_t,url){location.href=new URL(url,location.href).href;return 'original';},replaceState(_s,_t,url){location.href=new URL(url,location.href).href;}};
 const results={isConnected:true};
 const window={addEventListener:(k,v)=>events[k]=v};
 const context=vm.createContext({window,location,history,URL,document:{title:'Search',addEventListener:()=>{},querySelector:()=>results},console:{log:()=>{},warn:()=>{}},setTimeout:(f,ms)=>timers.push({f,ms}),setInterval:(f,ms)=>intervals.push({f,ms})});
 const install=vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b))+';setupSpaNavigationGuard',context,{timeout:1000});
 install();return {install,window,history,location,timers,intervals,events,reloads,results,context};
}

test('generated: ZenzaWatch replaceState playback, playlist and restore keep existing results',async()=>{
 const h=await setup(output);h.window.__nrnConfigureSpaNavigationGuard({});
 for(let i=0;i<3;i++){
  h.history.replaceState(null,'','/watch/sm1');h.history.replaceState(null,'','/watch/sm2');
  h.history.replaceState(null,'','/tag/first');h.intervals[0].f();
 }
 assert.equal(h.timers.length,0);assert.equal(h.reloads.length,0);
 h.history.pushState(null,'','/tag/first?page=2');assert.equal(h.timers.length,1);
});
test('generated: polling detects player restoration without reloading',async()=>{
 const h=await setup(output);h.window.__nrnConfigureSpaNavigationGuard({});
 h.location.href='https://www.nicovideo.jp/watch/sm1';h.intervals[0].f();
 h.location.href='https://www.nicovideo.jp/tag/first';h.intervals[0].f();
 assert.equal(h.timers.length,0);
});
test('generated: supplied ZenzaWatch history module opens, restores after 30s and closes without reload',async()=>{
 const h=await setup(output);h.window.__nrnConfigureSpaNavigationGuard({});
 h.window.location=h.location;h.window.document=h.context.document;
 let restore;
 h.context._={debounce(fn,delay){const run=delay?()=>{restore=fn;}:fn;run.cancel=()=>{};return run;}};
 h.context.nicoUtil={isGinzaWatchUrl:()=>false};h.context.PRODUCT='ZenzaWatch';
 const snippet=await readFile(new URL('./fixtures/zenza-watch-history.js',import.meta.url),'utf8');
 const player=vm.runInContext(snippet+';WatchPageHistory',h.context,{timeout:1000});
 const handlers={};player.initialize({on:(name,fn)=>handlers[name]=fn});
 handlers.open();handlers.loadVideoInfo({watchId:'sm1',title:'test',owner:{name:'owner'}});
 assert.equal(h.location.href,'https://www.nicovideo.jp/watch/sm1');
 restore();assert.equal(h.location.href,'https://www.nicovideo.jp/tag/first');
 handlers.loadVideoInfo({watchId:'sm2',title:'next',owner:{name:'owner'}});
 handlers.close();assert.equal(h.location.href,'https://www.nicovideo.jp/tag/first');
 assert.equal(h.timers.length,0);assert.equal(h.reloads.length,0);
});
test('generated: replaced result DOM or a different search still reloads',async()=>{
 for(const changedDom of [true,false]){
  const h=await setup(output);h.window.__nrnConfigureSpaNavigationGuard({});
  h.history.replaceState(null,'','/watch/sm1');
  if(changedDom)h.results.isConnected=false;
  h.history.replaceState(null,'',changedDom?'/tag/first':'/search/other');
  assert.equal(h.timers.length,1);h.timers[0].f();assert.equal(h.reloads.length,1);
 }
});
test('generated: pending reload is cancelled on player URL, original results, or disabled guard',async()=>{
 for(const target of ['/watch/sm1','/tag/first','disabled']){
  const h=await setup(output);h.window.__nrnConfigureSpaNavigationGuard({});
  h.history.pushState(null,'','/search/next');
  if(target==='disabled')h.window.__nrnConfigureSpaNavigationGuard({enabled:false});
  else h.history.replaceState(null,'',target);
  h.timers[0].f();assert.equal(h.reloads.length,0);
  h.window.__nrnConfigureSpaNavigationGuard({enabled:true});
  h.history.pushState(null,'','/search/later');assert.equal(h.timers.length,2);
 }
});
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: navigation guards readiness, hash and disabled setting`,async()=>{
  const h=await setup(path);h.history.pushState(null,'','/tag/before');assert.equal(h.timers.length,0);
  h.window.__nrnConfigureSpaNavigationGuard({enabled:false});h.history.pushState(null,'','/search/off');assert.equal(h.timers.length,0);
  h.window.__nrnConfigureSpaNavigationGuard({enabled:true});h.history.pushState(null,'','#hash');assert.equal(h.timers.length,0);
  h.history.pushState(null,'','/watch/sm1');assert.equal(h.timers.length,0);
  assert.equal(h.history.pushState(null,'','/tag/next'),'original');assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,120);
  h.history.replaceState(null,'','/search/final');assert.equal(h.timers.length,1);h.timers[0].f();
  assert.deepEqual(h.reloads,['https://www.nicovideo.jp/search/final']);
 });
 test(`${label}: popstate, polling and repeated installation`,async()=>{
  const h=await setup(path),wrapped=h.history.pushState;h.install();assert.equal(h.history.pushState,wrapped);assert.equal(h.intervals.length,1);
  h.window.__nrnConfigureSpaNavigationGuard({});h.location.href='https://www.nicovideo.jp/tag/back';h.events.popstate();
  assert.equal(h.timers[0].ms,0);h.timers[0].f();assert.equal(h.timers[1].ms,120);h.timers[1].f();assert.equal(h.reloads.length,1);
  const p=await setup(path);p.window.__nrnConfigureSpaNavigationGuard({});p.location.href='https://www.nicovideo.jp/search/poll';
  assert.equal(p.intervals[0].ms,250);p.intervals[0].f();p.intervals[0].f();assert.equal(p.timers.length,1);
 });
}
