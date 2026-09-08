import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
test('generated: diagnostic console is quiet until enabled, follows settings, preserves errors and host console',async()=>{
 const source=await readFile(output,'utf8');
 const start=source.indexOf('  var nrnConsoleConfig = null');
 const end=source.indexOf('  var createObject',start);
 assert.ok(start>0 && end>start);
 const calls=[],host={};
 for(const key of ['log','info','warn','error','table','group','groupCollapsed','groupEnd'])host[key]=(...args)=>calls.push([key,...args]);
 const sandbox={console:host};
 const api=vm.runInNewContext('(function(){'+source.slice(start,end)+';return {console,set:nrnSetConsoleConfig}})()',sandbox);
 const keys=Object.keys(host).filter(k=>k!=='error');
 keys.forEach(k=>api.console[k]('startup'));
 assert.equal(calls.length,0);
 const config={developerMode:{value:false}};api.set(config);
 keys.forEach(k=>api.console[k]('off'));assert.equal(calls.length,0);
 api.console.error('failure');assert.deepEqual(calls.pop(),['error','failure']);
 config.developerMode.value=true;
 keys.forEach(k=>api.console[k]('on'));assert.equal(calls.length,keys.length);
 config.developerMode.value=false;api.console.log('off again');assert.equal(calls.length,keys.length);
 assert.equal(sandbox.console,host);host.log('other script');assert.deepEqual(calls.at(-1),['log','other script']);
});
async function load(path,extra={}){
 const source=await readFile(path,'utf8'),start='  var Diagnostics = (function() {',end='  var Controller = (function() {';
 assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
 const logs=[],window={open:()=>null};
 const api=vm.runInNewContext(source.slice(source.indexOf(start),source.indexOf(end))+';({Diagnostics,NewTabService})',
 {window,location:{href:'https://www.nicovideo.jp/tag/test',origin:'https://www.nicovideo.jp'},URL,
 console:{log:(...a)=>logs.push(['log',...a]),warn:(...a)=>logs.push(['warn',...a]),error:(...a)=>logs.push(['error',...a])},...extra},{timeout:1000});
 return {...api,logs,window};
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: diagnostics retention and snapshots`,async()=>{
  const {Diagnostics:d,logs,window}=await load(path);
  for(let i=0;i<305;i++)d.log('test',String(i));
  assert.equal(d.getHistory().length,300);assert.equal(d.getHistory()[0].message,'5');
  const copy=d.getHistory();copy.pop();assert.equal(d.getHistory().length,300);
  assert.equal(d.snapshot().recent.length,30);assert.equal(d.snapshot().version,'14.1');
  d.warn('x','warning');d.error('x','failure',{id:1});
  assert.equal(logs.at(-2)[0],'warn');assert.equal(logs.at(-1)[0],'error');
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
