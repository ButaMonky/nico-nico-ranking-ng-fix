import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
async function setup(){
 const source=await readFile(output,'utf8');
 const a=source.indexOf('    var setupSpaNavigationGuard = function() {'),b=source.indexOf('    var domContentLoaded = async function() {');
 const timers=new Map(), intervals=[],events={},starts=[],stops=[];
 let id=0,observe;
 const location=new URL('https://www.nicovideo.jp/tag/first');
 const history={pushState(_s,_t,url){location.href=new URL(url,location).href;return 'native';},replaceState(_s,_t,url){location.href=new URL(url,location).href;}};
 const card=n=>({isConnected:true,contains:()=>true,getAttribute:()=>n,querySelector:()=>({getAttribute:()=>'/watch/'+n})});
 let results=[card('sm1')];
 const window={addEventListener:(k,v)=>events[k]=v};
 const document={title:'test',querySelectorAll:()=>results};
 const context=vm.createContext({window,location,history,URL,document,
  ListPage:{is:l=>l.pathname.startsWith('/ranking/genre')},SearchPage:{is:l=>/^\/(tag|search)\//.test(l.pathname)},
  MutationObserver:class{constructor(fn){observe=fn;}observe(){}},
  setTimeout:(f)=>{timers.set(++id,f);return id;},clearTimeout:n=>timers.delete(n),setInterval:f=>intervals.push(f)});
 vm.runInContext(source.slice(a,b)+';setupSpaNavigationGuard()',context);
 window.__nrnConfigureSpaNavigationGuard({start:()=>starts.push(location.href),stop:()=>stops.push(location.href)});
 return {window,history,location,starts,stops,intervals,events,context,timers,
  flush(){const fs=[...timers.values()];timers.clear();fs.forEach(f=>f());},
  commit(ids=['sm2']){results.forEach(n=>n.isConnected=false);results=ids.map(card);observe([]);},
  mutate(){observe([{type:'characterData',target:{nodeType:1,closest:()=>null,contains:()=>true}}]);}};
}
test('SPA: native history return value, delayed DOM and no document reload',async()=>{
 const h=await setup();assert.equal(h.history.pushState(null,'','/search/second'),'native');
 h.flush();assert.equal(h.starts.length,0);assert.equal(h.stops.length,1);
 h.commit();h.flush();assert.deepEqual(h.starts,['https://www.nicovideo.jp/search/second']);
});
test('SPA: rapid queries discard stale scheduled startup',async()=>{
 const h=await setup();h.history.pushState(null,'','/tag/second');h.commit();
 h.history.pushState(null,'','/tag/final?sort=registeredAt&page=2');h.commit(['sm3']);h.flush();
 assert.deepEqual(h.starts,['https://www.nicovideo.jp/tag/final?sort=registeredAt&page=2']);
});
test('SPA: back to still-mounted results before the next query commits restarts their checks',async()=>{
 const h=await setup();h.history.pushState(null,'','/search/pending');
 h.history.replaceState(null,'','/tag/first');h.flush();
 assert.deepEqual(h.starts,['https://www.nicovideo.jp/tag/first']);
});
test('SPA: same cards, zero results, unsupported page and return',async()=>{
 const h=await setup();h.history.pushState(null,'','/tag/same');h.mutate();h.flush();assert.equal(h.starts.length,1);
 h.history.pushState(null,'','/tag/empty');h.commit([]);h.flush();assert.equal(h.starts.length,2);
 h.history.pushState(null,'','/my');h.commit([]);h.flush();assert.equal(h.starts.length,2);
 h.history.pushState(null,'','/ranking/genre/all');h.commit(['sm4']);h.flush();assert.equal(h.starts.length,3);
});
test('SPA: hash is ignored; popstate and polling start new routes',async()=>{
 const h=await setup();h.history.pushState(null,'','#details');h.flush();assert.equal(h.stops.length,0);
 h.location.href='https://www.nicovideo.jp/tag/back';h.events.popstate();h.commit();h.flush();assert.equal(h.starts.length,1);
 h.location.href='https://www.nicovideo.jp/tag/poll';h.intervals[0]();h.commit();h.flush();assert.equal(h.starts.length,2);
});
test('SPA: disabled setting clears scheduled start and re-enabling catches up',async()=>{
 const h=await setup();h.history.pushState(null,'','/search/new');h.commit();
 h.window.__nrnConfigureSpaNavigationGuard({enabled:false});h.flush();assert.equal(h.starts.length,0);
 h.window.__nrnConfigureSpaNavigationGuard({enabled:true});h.flush();assert.equal(h.starts.length,1);
});
test('SPA: retained ZenzaWatch results survive playback, playlist and close',async()=>{
 const h=await setup();h.window.location=h.location;h.window.document=h.context.document;let restore;
 h.context._={debounce(fn,delay){const run=delay?()=>{restore=fn;}:fn;run.cancel=()=>{};return run;}};
 h.context.nicoUtil={isGinzaWatchUrl:()=>false};h.context.PRODUCT='ZenzaWatch';
 const snippet=await readFile(new URL('./fixtures/zenza-watch-history.js',import.meta.url),'utf8');
 const player=vm.runInContext(snippet+';WatchPageHistory',h.context);const handlers={};
 player.initialize({on:(name,fn)=>handlers[name]=fn});handlers.open();handlers.loadVideoInfo({watchId:'sm1',title:'test',owner:{name:'owner'}});
 restore();handlers.loadVideoInfo({watchId:'sm2',title:'next',owner:{name:'owner'}});handlers.close();h.flush();
 assert.equal(h.stops.length,0);assert.equal(h.starts.length,0);
});
test('SPA: real watch navigation unmounts results and cleans up',async()=>{
 const h=await setup();h.history.pushState(null,'','/watch/sm2');h.commit([]);h.flush();
 assert.equal(h.stops.length,1);assert.equal(h.starts.length,0);
 h.history.pushState(null,'','/tag/first');h.commit();h.flush();assert.equal(h.starts.length,1);
});
