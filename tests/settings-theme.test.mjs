import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
async function load(path){
 const source=await readFile(path,'utf8'),marker='  var NicoPage = (function() {';
 assert.equal(source.split(marker).length,2);
 return vm.runInNewContext(source.slice(0,source.indexOf(marker))+'return {ConfigDialog,DetailUiTheme,Config}; })()',
 {window:{},console:{log:()=>{}}},{timeout:1000});
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: theme background priority, media fallback and explicit setting`,async()=>{
  const {DetailUiTheme:t}=await load(path);
  const body={dataset:{},color:'rgb(0, 0, 0)'},html={dataset:{},color:'rgb(255, 255, 255)'};
  const doc={body,documentElement:html,querySelector:()=>null,defaultView:{getComputedStyle:e=>({backgroundColor:e.color}),matchMedia:()=>({matches:true})}};
  assert.equal(t.detect(doc).theme,'dark');assert.equal(t.detect(doc).source,'body-background');
  body.color='transparent';assert.equal(t.detect(doc).theme,'light');assert.equal(t.detect(doc).source,'html-background');
  html.color='transparent';assert.equal(t.detect(doc).source,'prefers-color-scheme');assert.equal(t.detect(doc).theme,'dark');
  const config={detailUiTheme:{value:'light'}};t.apply(config,doc);
  assert.equal(body.dataset.nrnUiTheme,'light');assert.equal(html.dataset.nrnUiTheme,'light');
  assert.equal(t.resolve(config,doc).source,'setting');
 });
 test(`${label}: dialog close is once-only and buttons follow selection`,async()=>{
  const {ConfigDialog}=await load(path),nodes={list:{selectedIndex:-1,length:0},removeButton:{},openButton:{},removeAllButton:{}};
  const dialog=Object.create(ConfigDialog.prototype);dialog.doc={getElementById:id=>nodes[id]};
  const events=[];dialog.emit=e=>events.push(e);dialog._close();dialog._close();assert.deepEqual(events,['closed']);
  dialog._updateButtonsDisabled();assert.equal(nodes.removeButton.disabled,true);assert.equal(nodes.removeAllButton.disabled,true);
  nodes.list.selectedIndex=0;nodes.list.length=1;dialog._updateButtonsDisabled();
  assert.equal(nodes.removeButton.disabled,false);assert.equal(nodes.openButton.disabled,false);assert.equal(nodes.removeAllButton.disabled,false);
 });
 test(`${label}: dialog saves rule JSON before requesting redraw`,async()=>{
  const {ConfigDialog,Config}=await load(path),writes=[];
  const config=new Config((k,d)=>d,(k,v)=>writes.push([k,v]));
  const dialog=Object.create(ConfigDialog.prototype);dialog.config=config;
  dialog._renderAdvancedNgRules=()=>writes.push(['render',config.advancedNgRulesJson.value]);
  dialog._saveAdvancedRules([]);
  assert.deepEqual(writes,[['render','[]']]);
  const rules=[{id:'x',expression:{kind:'group',op:'AND',children:[]}}];dialog._saveAdvancedRules(rules);
  assert.deepEqual(writes.slice(1),[['advancedNgRulesJson',JSON.stringify(rules)],['render',JSON.stringify(rules)]]);
 });
}
