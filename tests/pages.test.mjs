import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
async function load(path){
 const source=await readFile(path,'utf8'),marker='  var Diagnostics = (function() {';
 assert.equal(source.split(marker).length,2);
 return vm.runInNewContext(source.slice(0,source.indexOf(marker))+'return {NicoPage,ListPage,SearchPage}; })()',{}, {timeout:1000});
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: existing page URL predicates`,async()=>{
  const {ListPage,SearchPage}=await load(path);
  const cases=[['/ranking/genre/all',true,false],['/ranking',false,false],['/search/test',false,true],['/tag/test',false,true],['/tag',false,false],['/watch/sm1',false,false]];
  for(const [pathname,list,search] of cases){assert.equal(ListPage.is({pathname}),list);assert.equal(SearchPage.is({pathname}),search);}
 });
 test(`${label}: base page toggle mapping and ad visibility transition`,async()=>{
  const {NicoPage,SearchPage}=await load(path),page=new NicoPage({});
  const root={movieInfo:{toggle:{}},description:{openButton:{},closeButton:{}}};
  page.mapToggleTo(root);assert.equal(page._toggleToMovieRoot.size,3);
  assert.equal(page._toggleToMovieRoot.get(root.description.openButton),root);
  page.unmapToggleFrom(root);assert.equal(page._toggleToMovieRoot.size,0);
  assert.equal(SearchPage._isGettingAdDone({attributeName:'style',oldValue:'visibility: hidden;',target:{getAttribute:()=> 'visibility: visible;'}}),true);
  assert.equal(SearchPage._isGettingAdDone({attributeName:'class'}),false);
 });
}
