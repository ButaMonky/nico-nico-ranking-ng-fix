import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
for(const [label,path] of [['baseline',baseline],['generated',output]]){
 test(`${label}: controller binds input handlers and changes only matching setting`,async()=>{
  const source=await readFile(path,'utf8'),start='  var Controller = (function() {',end='  var Main = (function() {';
  assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
  const Controller=vm.runInNewContext(source.slice(source.indexOf(start),source.indexOf(end))+';Controller',{}, {timeout:1000});
  const config={visitedMovieViewMode:{value:'reduce'},visibleContributorType:{value:'all'},ngMovieVisible:{value:false}};
  const c=new Controller(config,{}),handlers={};c.addListenersTo({addEventListener:(k,v)=>handlers[k]=v});
  assert.deepEqual(Object.keys(handlers),['change','click']);
  handlers.change({target:{id:'nrn-visited-movie-view-mode-select',value:'hide'}});
  handlers.change({target:{id:'nrn-visible-contributor-type-select',value:'user'}});
  handlers.change({target:{id:'nrn-ng-movie-visible-checkbox',checked:true}});
  handlers.change({target:{id:'unrelated',value:'wrong'}});
  assert.deepEqual(config,{visitedMovieViewMode:{value:'hide'},visibleContributorType:{value:'user'},ngMovieVisible:{value:true}});
 });
}
