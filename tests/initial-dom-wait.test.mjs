import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/autofill/legacy-controller.js',import.meta.url),'utf8');
const start=source.indexOf('      var waitForInitialRoots ='),end=source.indexOf('      var waitForThumbInfo =',start);
const element=id=>({dataset:{decorationVideoId:id},contains(other){return this===other},closest(){return null}});
async function run({raw,expected,candidates}){
 let time=100;const jobs=[];
 const wait=vm.runInNewContext(source.slice(start,end)+';waitForInitialRoots',{
  Date:{now:()=>time},setTimeout:(fn,ms)=>jobs.push(()=>{time+=ms;fn()}),
  page:{doc:{querySelectorAll:selector=>selector.includes('[data-anchor-area="main"]')?expected:raw}},
  currentOriginalRootCandidates:()=>candidates
 });
 const result=wait(1500);while(jobs.length)jobs.shift()();
 return {roots:await result,elapsed:time-100};
}
test('non-card decoration elements do not force initial DOM timeout',async()=>{
 const card=element('sm1'),decoration=element('sm2');
 const result=await run({raw:[card,decoration],expected:[card],candidates:[{movieId:'sm1',elem:card}]});
 assert.equal(result.elapsed,300);assert.equal(result.roots.length,1);
});
test('an unbound real card still waits; aggregate counts cannot hide its absence',async()=>{
 const first=element('sm1'),second=element('sm2'),unrelated=element('sm3');
 const result=await run({raw:[first,second],expected:[first,second],candidates:[{movieId:'sm1',elem:first},{movieId:'sm3',elem:unrelated}]});
 assert.equal(result.elapsed,1500);
});
test('wrong video identity on the same element is not ready',async()=>{
 const card=element('sm1');
 const result=await run({raw:[card],expected:[card],candidates:[{movieId:'sm2',elem:card}]});
 assert.equal(result.elapsed,1500);
});
