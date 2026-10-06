import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const pieces=await Promise.all(['src/core/owner-id.js','src/data/metadata-readiness.js','src/ng/logic-rules.js','src/ng/candidate-filter.js'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
const C=vm.runInNewContext(pieces.join('\n')+';CandidateFilter',{console:{warn(){}}});
const field=(field,operator,value,not=false)=>({kind:'condition',field,operator,value,not});
const group=(op,children,not=false)=>({kind:'group',op,children,not});
function config(expression){return {ngMovies:{set:new Set()},ngTitles:{set:new Set()},advancedNgRulesEnabled:{value:!!expression},advancedNgRulesJson:{value:JSON.stringify(expression?[{expression}]:[])}};}
const item=(n,title='KEEP')=>({id:'sm'+n,title});
test('candidate filter: only a proven movie ID or title match is rejected without metadata',()=>{
 const c=config();c.ngMovies.set.add('sm1');c.ngTitles.set.add('DROP');
 assert.equal(C.reason(item(1),c),'movieId');assert.equal(C.reason(item(2,'drop'),c),'title');
 assert.equal(C.reason(item(3),c),null);assert.equal(C.reason({id:'bad',title:'DROP'},c),null);
 assert.equal(C.reason({id:'sm5'},c),null);
});
test('candidate filter: three-valued AND/OR/NOT are preserved; absent owner or tags are never negative evidence',()=>{
 const yes=field('title','contains','DROP'),missing=field('tag','contains','x');
 assert.equal(C.reason(item(1,'DROP'),config(group('OR',[yes,missing]))),'advanced');
 assert.equal(C.reason(item(1,'DROP'),config(group('AND',[yes,missing]))),null);
 for(const e of [field('userId','neq',12),field('userId','notExists'),group('AND',[missing],true)])
  assert.equal(C.reason(item(1),config(e)),null);
});
test('candidate filter: weak search owner and partial counts cannot trigger pre-DOM rejection',()=>{
 const i={...item(1),owner:{type:'user',id:12,name:'name'},snapshotTags:['x'],count:{like:0}};
 assert.equal(C.reason(i,config(field('userId','eq',12))),null);
 assert.equal(C.reason(i,config(field('tag','contains','x'))),null);
});
test('candidate filter: parked entries return in source order after an NG change, without mutating items',()=>{
 const c=config();c.ngTitles.set.add('DROP');const q=C.create(c,8),a=item(1,'DROP'),b=item(2),d=item(3,'DROP');
 const original=JSON.stringify([a,b,d]);const r=q.partition([a,b,d]);
 assert.deepEqual([...r.passed].map(x=>x.id),['sm2']);assert.equal(r.rejected,2);assert.deepEqual({...r.reasons},{movieId:0,title:2,advanced:0});assert.equal(q.isRejected('sm1'),true);
 c.ngTitles.set.clear();assert.equal(q.isRejected('sm1'),false);
 const replay=q.release();assert.deepEqual([...replay].map(x=>x.id),['sm1','sm3']);
 assert.deepEqual([...q.sort([b,...replay])].map(x=>x.id),['sm1','sm2','sm3']);
 assert.equal(q.release().length,0);assert.equal(JSON.stringify([a,b,d]),original);
});
test('candidate filter: capacity exhaustion falls back to normal processing, never loses a candidate',()=>{
 const c=config();c.ngTitles.set.add('DROP');const q=C.create(c,2),rows=Array.from({length:4},(_,i)=>item(i+1,'DROP'));
 const r=q.partition(rows);assert.equal(r.rejected,2);assert.deepEqual([...r.passed].map(x=>x.id),['sm3','sm4']);
 assert.deepEqual({...r.reasons},{movieId:0,title:2,advanced:0},'capacity fallback is not counted as a rejected reason');
 assert.equal(q.snapshot().retained,2);assert.equal(q.snapshot().capacityFallback,2);c.ngTitles.set.clear();assert.equal(q.release().length,2);
});
test('candidate filter: repeated pending identities are bounded and source reset discards parked-only state',()=>{
 const c=config();c.ngTitles.set.add('DROP');const q=C.create(c,4),a=item(1,'DROP');
 q.partition([a]);q.partition([a]);assert.equal(q.snapshot().retained,1);
 const ordinal=q.order(a);q.clear();assert.equal(q.snapshot().retained,0);assert.equal(q.order(a),ordinal);
 assert.equal(q.release().length,0);
});
test('candidate filter: disabled rules and nested uncertainty are not rejected',()=>{
 const c=config(group('OR',[field('title','contains','DROP'),field('tag','exists')]));c.advancedNgRulesEnabled.value=false;
 assert.equal(C.reason(item(1,'DROP'),c),null);c.advancedNgRulesEnabled.value=true;
 assert.equal(C.reason(item(1,'KEEP'),c),null);
 const r=C.create(c).partition([item(1,'DROP'),item(2)]);assert.equal(r.rejected,1);
});

test('candidate scheduling: normalized numeric search metadata can settle NG before DOM without reordering',()=>{
 const expr=group('OR',[field('likeCount','eq','0'),field('viewCount','gte','100')]);
 const c=config(expr),q=C.create(c,8);
 const rows=[
  {...item(1),__nrnSearchItem:{videoId:'sm1',likeCount:0,viewCount:1}},
  {...item(2),__nrnSearchItem:{videoId:'sm2',likeCount:1,viewCount:99}},
  {...item(3),__nrnSearchItem:{videoId:'sm3',likeCount:2,viewCount:100}}
 ];
 const r=q.partition(rows);
 assert.deepEqual([...r.passed].map(x=>x.id),['sm2']);
 assert.equal(r.rejected,2);
 c.advancedNgRulesEnabled.value=false;
 assert.deepEqual([...q.release()].map(x=>x.id),['sm1','sm3'],'release keeps source order');
});
test('candidate scheduling: unknown, mismatched and nonnumeric search values stay undecided under NOT and neq',()=>{
 for(const payload of [
  null,
  {videoId:'sm9',likeCount:0},
  {videoId:'sm1',likeCount:null},
  {videoId:'sm1',likeCount:'0'},
  {videoId:'sm1',likeCount:-1},
  {videoId:'sm1',likeCount:1.5}
 ]){
  const row={...item(1),__nrnSearchItem:payload};
  for(const expr of [field('likeCount','neq','5'),field('likeCount','notExists'),group('AND',[field('likeCount','eq','0')],true)])
   assert.equal(C.reason(row,config(expr)),null,JSON.stringify(payload)+' '+JSON.stringify(expr));
 }
});
test('candidate scheduling: numeric truth never promotes unknown owner or tag siblings',()=>{
 const row={...item(1),__nrnSearchItem:{videoId:'sm1',likeCount:0,viewCount:10}};
 assert.equal(C.reason(row,config(group('AND',[field('likeCount','eq','0'),field('tag','exists')]))),null);
 assert.equal(C.reason(row,config(group('AND',[field('likeCount','eq','0'),field('userId','neq',99)]))),null);
 assert.equal(C.reason(row,config(group('OR',[field('likeCount','eq','0'),field('tag','exists')]))),'advanced');
});
