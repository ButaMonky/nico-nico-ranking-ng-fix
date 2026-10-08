import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const code = await readFile(new URL('../src/data/dic-article-source.js',import.meta.url),'utf8');
const A = vm.runInNewContext(code + '\nDicArticleSource');
const plain = value => JSON.parse(JSON.stringify(value));
const at = Date.parse('2026-10-07T11:00:00+09:00');

test('client batching preserves distinct exact Unicode titles and bounds each batch to ten',()=>{
  const names = ['音楽','演奏してみた','カタカナ','A ',...Array.from({length:22},(_,i)=>'タグ'+i),'音楽','',null,' '];
  const batches = plain(A.batches(names));
  assert.equal(A.batchSize,10);
  assert.deepEqual(batches.map(row=>row.length),[10,10,6]);
  assert.deepEqual(batches.flat(),names.filter((n,i)=>typeof n==='string'&&n.trim()&&names.indexOf(n)===i));
  assert.ok(batches.flat().includes('A '),'do not silently canonicalize request_title');
});

test('matched, omitted, and reordered rows map strictly by request_title',()=>{
  const r = plain(A.normalizeResponse(['B','A','C'],[{request_title:'A',title:'normalized A',url:'https://evil.example/'},{request_title:'B',title:'Normalized B'}],at));
  assert.equal(r.status,'ok');
  assert.deepEqual(r.results.map(x=>x.state),['observed_present','observed_present','observed_absent']);
  assert.deepEqual(r.results.map(x=>x.article),[{title:'Normalized B'},{title:'normalized A'},null]);
  assert.deepEqual(r.results.map(x=>x.observedAt),[at,at,at]);
});

test('successful empty array confirms time-stamped absence; transport failure cannot',()=>{
  const success = plain(A.normalizeResponse(['missing'],[],at));
  assert.equal(success.status,'ok');
  assert.equal(success.results[0].state,'observed_absent');
  assert.equal(success.results[0].observedAt,at);
  for(const kind of ['http','network','timeout','aborted','malformed','unknown','unexpected']) {
    const r = plain(A.failure(['missing'],kind));
    assert.equal(r.status,'error');
    assert.equal(r.results[0].state,'error');
    assert.equal(r.results[0].observedAt,null);
    assert.equal(r.reason,kind==='unexpected'?'unknown':kind);
  }
});
test('bad JSON shape, unrelated and duplicated rows never turn missing into false',()=>{
  const invalid = [null,{},'not json',[],[{request_title:'X',title:'X'}],
    [{request_title:'A'}],[{request_title:'A',title:1}],
    [{request_title:'A',title:'ok'},{request_title:'A',title:'duplicate'}],
    [{request_title:'A',title:'ok'},null]];
  for(const payload of invalid){
    const r = plain(A.normalizeResponse(['A','B'],payload,at));
    if(Array.isArray(payload)&&payload.length===0) {
      assert.equal(r.status,'ok'); continue;
    }
    assert.equal(r.status,'invalid',JSON.stringify(payload));
    assert.deepEqual(r.results.map(x=>x.state),['unknown','unknown']);
    assert.deepEqual(r.results.map(x=>x.observedAt),[null,null]);
  }
});

test('invalid request/timestamp never produces definitive absence',()=>{
  for(const [names,time] of [[[],at],[null,at],[['A'],NaN],[['A'],-1],[['A'],1.5],
    [Array.from({length:11},(_,i)=>'n'+i),at]]) {
    const r=plain(A.normalizeResponse(names,[],time));
    assert.equal(r.status,'invalid');
    assert.ok(r.results.every(x=>x.state==='unknown'));
  }
});

test('the normalizer is pure and has no HTTP / DOM side effects',()=>{
  assert.equal(/\bfetch\s*\(|\bXMLHttpRequest\b|\bGM_xmlhttpRequest\b/.test(code),false);
  const original={request_title:'A',title:'漢字',html:'<script>x</script>'};
  const payload=[original], names=['A'];
  const first=plain(A.normalizeResponse(names,payload,at));
  assert.deepEqual(first.results[0].article,{title:'漢字'});
  assert.deepEqual(original,{request_title:'A',title:'漢字',html:'<script>x</script>'});
  assert.deepEqual(names,['A']);
});
