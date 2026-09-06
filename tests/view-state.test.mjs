import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';
async function setup(path){
  const source=await readFile(path,'utf8'),marker='  var ConfigDialog = (function(_super) {';
  assert.equal(source.split(marker).length,2);
  const api=vm.runInNewContext(source.slice(0,source.indexOf(marker))+'return {Config,Movie,Contributor,MovieViewMode,MovieViewModes}; })()',{}, {timeout:1000});
  const config=new api.Config((k,d)=>d,()=>{});await config.sync();
  return {...api,config};
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
  test(`${label}: hidden overrides reduced, settings and changes are propagated`,async()=>{
    const {Movie,MovieViewMode,config}=await setup(path);
    const m=new Movie('sm1','title'),v=new MovieViewMode(m,config).addListener(),trace=[];
    v.on('changed',x=>trace.push(x));assert.equal(v.value,'doNothing');
    m.updateVisited(new Set(['sm1']));assert.equal(v.value,'reduce');
    m.updateNgId(new Set(['sm1']));assert.equal(v.value,'hide');
    config.ngMovieVisible.value=true;assert.equal(v.value,'reduce');
    config.visitedMovieViewMode.value='hide';assert.equal(v.value,'hide');
    config.visitedMovieViewMode.value='doNothing';assert.equal(v.value,'doNothing');
    m.error={type:'DELETED'};assert.equal(v.value,'hide');
    m.error={type:'ERROR'};assert.equal(v.value,'doNothing');
    v.update();v.update();
    assert.deepEqual(trace,['reduce','hide','reduce','hide','doNothing','hide','doNothing']);
  });
  test(`${label}: unknown contributor waits for detail completion, type filters apply`,async()=>{
    const {Movie,Contributor,MovieViewMode,config}=await setup(path);
    config.unknownContributorMovieVisible.value=false;
    const m=new Movie('sm1','title'),v=new MovieViewMode(m,config).addListener();
    assert.equal(v.value,'doNothing');m.setThumbInfoDone();assert.equal(v.value,'hide');
    config.unknownContributorMovieVisible.value=true;assert.equal(v.value,'doNothing');
    m.contributor=Contributor.new('user',1,'user');config.visibleContributorType.value='channel';assert.equal(v.value,'hide');
    m.contributor=Contributor.new('channel',1,'channel');assert.equal(v.value,'doNothing');
    config.visibleContributorType.value='user';assert.equal(v.value,'hide');
    config.visibleContributorType.value='all';assert.equal(v.value,'doNothing');
  });
  test(`${label}: view cache uses object identity and stable hidden-last order`,async()=>{
    const {Movie,MovieViewModes,config}=await setup(path);
    const collection=new MovieViewModes(config),a=new Movie('a','a'),b=new Movie('b','b'),c=new Movie('c','c');
    const av=collection.get(a);collection.get(b);collection.get(c);
    assert.equal(collection.get(a),av);
    const trace=[];collection.on('movieViewModeChanged',v=>trace.push(v));
    a.updateNgId(new Set(['a']));c.updateVisited(new Set(['c']));
    assert.deepEqual(Array.from(collection.sort(),v=>v.movie.id),['b','c','a']);
    b.updateNgId(new Set(['b']));assert.deepEqual(Array.from(collection.sort(),v=>v.movie.id),['c','a','b']);
    a.updateNgId(new Set());assert.deepEqual(Array.from(collection.sort(),v=>v.movie.id),['a','c','b']);
    assert.deepEqual(trace,['hide','reduce','hide','doNothing']);
    assert.notEqual(collection.get(new Movie('a','same ID')),av);
  });
}
