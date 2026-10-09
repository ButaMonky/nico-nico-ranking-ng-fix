import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';

const bundle = await readFile(output,'utf8');
const boundary = '  var MovieViewMode = (function(_super) {';
assert.equal(bundle.split(boundary).length,2);
const {Movie,Tag} = vm.runInNewContext(
  bundle.slice(0,bundle.indexOf(boundary))+'return {Movie,Tag}; })()',{}, {timeout:3000});
const listeners = tag => tag._eventNameToListeners.get('ngChanged')?.size ?? 0;
const tag = (name='Alpha',lock=false) => new Tag({name,lock});

test('reassigning the same tag 10 times retains only one Movie callback',()=>{
  const m = new Movie('sm1','sample'),t=tag();
  m.tags=[t];
  for (let i=0;i<10;i++) m.tags=[t];
  assert.equal(listeners(t),1,'duplicate listener retained');
  let reasons=0;
  m.on('ngReasonsChanged',()=>reasons++);
  t.updateNg(new Set(['ALPHA']));
  assert.equal(m.ng,true);
  assert.equal(reasons,1,'single tag event must trigger one NG recomputation');
  t.updateNg(new Set());
  assert.equal(m.ng,false);
  assert.equal(reasons,2);
});

test('removed and replaced tags never retain stale Movie subscriptions',()=>{
  const m = new Movie('sm2','sample'),previous=tag('Old'),next=tag('New');
  m.tags=[previous];
  m.tags=[next];
  assert.equal(listeners(previous),0);
  assert.equal(listeners(next),1);
  let reasons=0;
  m.on('ngReasonsChanged',()=>reasons++);
  previous.updateNg(new Set(['OLD']));
  assert.equal(reasons,0,'former tag must not cause recalculation');
  next.updateNg(new Set(['NEW']));
  assert.equal(m.ng,true);
  assert.equal(reasons,1);
  m.tags=[];
  assert.equal(listeners(next),0);
  reasons=0;
  next.updateNg(new Set());
  assert.equal(reasons,0,'cleared tag must not cause recalculation');
});

test('shared and repeated Tag objects have independent one-per-Movie listeners',()=>{
  const shared=tag('Shared',true),a=new Movie('sm3','a'),b=new Movie('sm4','b');
  a.tags=[shared,shared];
  b.tags=[shared];
  assert.equal(a.tags.length,2,'preserve metadata array order and duplicates');
  assert.equal(listeners(shared),2,'one callback per distinct Movie');
  a.tags=[shared];
  assert.equal(listeners(shared),2);
  a.tags=[];
  assert.equal(listeners(shared),1,'other Movie remains subscribed');
  let reasons=0;
  b.on('ngReasonsChanged',()=>reasons++);
  shared.updateNgIfLocked(new Set(['SHARED']));
  assert.equal(b.ng,true);
  assert.equal(reasons,1);
  b.tags=[];
  assert.equal(listeners(shared),0);
});
