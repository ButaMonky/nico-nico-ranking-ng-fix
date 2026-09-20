import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
test('generated: raw diagnostic values never escape the local console, host console is untouched',async()=>{
 const source=await readFile(output,'utf8');
 const start=source.indexOf('  var nrnConsoleConfig = null'),end=source.indexOf('  var createObject',start);
 const calls=[],host={};
 for(const key of ['log','info','warn','error','table','group','groupCollapsed','groupEnd'])host[key]=(...args)=>calls.push([key,...args]);
 const sandbox={console:host};
 const api=vm.runInNewContext('(function(){'+source.slice(start,end)+';return {console,set:nrnSetConsoleConfig,counts:nrnConsoleCounts}})()',sandbox);
 for(const enabled of [false,true]){
  api.set({developerMode:{value:enabled}});
  Object.keys(host).forEach(key=>api.console[key]('PRIVATE_VALUE',{url:'private'}));
 }
 assert.equal(calls.length,0);assert.equal(api.counts.errors,2);assert.equal(api.counts.warnings,2);
 assert.equal(sandbox.console,host);host.log('other script');assert.deepEqual(calls.at(-1),['log','other script']);
});
async function load(path,extra={}){
 const source=await readFile(path,'utf8'),start='  var Diagnostics = (function() {',end='  var Controller = (function() {';
 assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
 const logs=[],window={open:()=>null};
 const api=vm.runInNewContext(source.slice(source.indexOf(start),source.indexOf(end))+';({Diagnostics,NewTabService})',
 {NRN_VERSION:'160.17',window,location:{href:'https://www.nicovideo.jp/tag/test',origin:'https://www.nicovideo.jp'},URL,
 console:{log:(...a)=>logs.push(['log',...a]),warn:(...a)=>logs.push(['warn',...a]),error:(...a)=>logs.push(['error',...a])},...extra},{timeout:1000});
 return {...api,logs,window};
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: diagnostics retention and snapshots`,async()=>{
  const {Diagnostics:d,logs,window}=await load(path);
  for(let i=0;i<305;i++)d.log('test',String(i));
  assert.equal(d.getHistory().length,300);if(label==='baseline')assert.equal(d.getHistory()[0].message,'5');else assert.equal(d.getHistory()[0].sequence,6);
  const copy=d.getHistory();copy.pop();assert.equal(d.getHistory().length,300);
  assert.equal(d.snapshot().recent.length,30);assert.equal(d.snapshot().version,label==='baseline'?'14.1':'160.17');
  d.warn('x','warning');d.error('x','failure',{id:1});
  if(label==='baseline'){assert.equal(logs.at(-2)[0],'warn');assert.equal(logs.at(-1)[0],'error');}else assert.equal(logs.length,0);
  assert.equal(window.__nrnDiagnostics,d);
 });
 test(`${label}: new-tab API priority and failure handling`,async()=>{
  const calls=[];
  const old=await load(path,{GM_openInTab:(...a)=>calls.push(a),GM:{openInTab:()=>{throw Error('wrong API');}}});
  assert.equal(old.NewTabService.open('https://example.test/'),true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['https://example.test/',{active:true,insert:true,setParent:true}]]);
  const modern=await load(path,{GM:{openInTab:()=>calls.push('modern')}});
  assert.equal(modern.NewTabService.open('x'),true);assert.equal(calls.at(-1),'modern');
  const fallback=await load(path);assert.equal(fallback.NewTabService.open('x'),false);
  fallback.window.open=()=>({});assert.equal(fallback.NewTabService.open('x'),true);
  const failed=await load(path,{GM_openInTab:()=>{throw Error('denied');}});
  assert.equal(failed.NewTabService.open('x'),false);assert.equal(failed.Diagnostics.getHistory().at(-1).level,'error');
 });
 test(`${label}: only handled same-origin watch anchors are decorated`,async()=>{
  const {NewTabService:s}=await load(path);
  const anchor=(href,card=true)=>({href,dataset:{},closest:()=>card?{}:null,removeAttribute(k){delete this[k];}});
  const a=anchor('https://www.nicovideo.jp/watch/sm1'),foreign=anchor('https://example.test/watch/sm1'),outside=anchor('https://www.nicovideo.jp/watch/sm2',false);
  const root={querySelectorAll:()=>[a,foreign,outside]};
  assert.equal(s.decorateWithin(root,true),1);assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');
  assert.equal(foreign.target,undefined);assert.equal(outside.target,undefined);
  s.decorateWithin(root,false);assert.equal(a.target,undefined);assert.equal(a.dataset.nrnOpenNewTab,undefined);
 });
}
