import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
async function setup(path){
 const source=await readFile(path,'utf8'),a='    var setupSpaNavigationGuard = function() {',b='    var domContentLoaded = async function() {';
 assert.equal(source.split(a).length,2);assert.equal(source.split(b).length,2);
 const timers=[],intervals=[],events={},reloads=[];
 const location={href:'https://www.nicovideo.jp/tag/first',origin:'https://www.nicovideo.jp',reload:()=>reloads.push(location.href)};
 const history={pushState(_s,_t,url){location.href=new URL(url,location.href).href;return 'original';},replaceState(_s,_t,url){location.href=new URL(url,location.href).href;}};
 const window={addEventListener:(k,v)=>events[k]=v};
 const install=vm.runInNewContext(source.slice(source.indexOf(a),source.indexOf(b))+';setupSpaNavigationGuard',
 {window,location,history,URL,document:{addEventListener:()=>{}},console:{log:()=>{},warn:()=>{}},setTimeout:(f,ms)=>timers.push({f,ms}),setInterval:(f,ms)=>intervals.push({f,ms})},{timeout:1000});
 install();return {install,window,history,location,timers,intervals,events,reloads};
}
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
