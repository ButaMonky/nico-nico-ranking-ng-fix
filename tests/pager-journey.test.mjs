import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context = vm.createContext({URL, Map, Set, Date});
vm.runInContext(await readFile(new URL('../src/ui/pager-journey.js', import.meta.url),'utf8'),context);
const pager = context.PagerJourney;
const normalize = x => JSON.parse(JSON.stringify(x));
test('compact ranges skip whole consumed blocks, keeping visit anchors and both boundaries', () => {
  const used=[4,5,6,7,8];
  let m=normalize(pager.layout(3,used,20,2));
  assert.deepEqual(m,{prev:2,next:9,tokens:[{start:1,end:1,current:false},{start:2,end:2,current:false},{start:3,end:3,current:true},{start:4,end:8,consumed:true},{start:9,end:9,current:false},{start:10,end:10,current:false}]});
  m=normalize(pager.layout(9,[...used,10,11,12,13],20,2));
  assert.equal(m.prev,3); assert.equal(m.next,14);
  assert.deepEqual(m.tokens.filter(x=>x.consumed),[{start:4,end:8,consumed:true},{start:10,end:13,consumed:true}]);
  assert.equal(pager.layout(1,[],1).prev,null); assert.equal(pager.layout(1,[],1).next,null);
  assert.equal(pager.layout(3,used,8).next,null);
  assert.equal(pager.layout(3,[4,5],20).next,6,'partially read page remains next');
});
test('history survives same-query SPA pages, resets for criteria, NG changes, expiry', () => {
  const url='https://www.nicovideo.jp/tag/test?sort=hot&page=3';
  const a=pager.history(url,'ng-A',100); a.pages.set(4,true);
  assert.equal(pager.history(url.replace('page=3','page=9')+'&rf=card','ng-A',200),a);
  assert.equal(pager.history(url.replace('sort=hot','sort=new'),'ng-A',200).pages.size,0);
  assert.equal(pager.history(url,'ng-B',200).pages.size,0);
  pager.history(url,'ng-B',200).pages.set(5,true);
  assert.equal(pager.history(url,'ng-B',200+31*60*1000).pages.size,0);
});
