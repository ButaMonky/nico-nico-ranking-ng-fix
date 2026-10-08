// BRUSH-038/039 Phase C: registered OFFLINE client-contract tests; no real GET.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const sourcePath = new URL('../src/data/dic-article-source.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const clientSource = await readFile(new URL('../src/data/dic-article-client.js',import.meta.url),'utf8');
const {A,C} = vm.runInNewContext(source + '\n' + clientSource + '\n({A:DicArticleSource,C:DicArticleClient})', {TextEncoder,URLSearchParams,URL,AbortController,setTimeout,clearTimeout});
const createDicTransport = C.create;
const plain = x => JSON.parse(JSON.stringify(x));
const good = (rows, url) => ({ok:true, url, json:async()=>rows});

test('import and construction are fully lazy; explicit action uses safe Unicode query and omits credentials', async () => {
  const calls = [];
  const client = createDicTransport(A,async (url,options) => {
    calls.push({url,options});
    return good([{request_title:'音楽',title:'百科'}],url);
  },{now:()=>12345});
  assert.equal(calls.length,0,'nothing eager on construction');
  const result = plain(await client.lookup(['音楽','未掲載','音楽']));
  assert.equal(calls.length,1);
  assert.deepEqual(new URL(calls[0].url).searchParams.getAll('titles[]'),['音楽','未掲載']);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.credentials,'omit');
  assert.equal(calls[0].options.redirect,'error');

  assert.equal(result.status,'ok');
  assert.deepEqual(result.results.map(r=>r.state),['observed_present','observed_absent']);
  assert.deepEqual(result.results.map(r=>r.observedAt),[12345,12345]);
  client.dispose();
});

test('validated empty 200 means time-stamped absent; malformed payload remains unknown', async () => {
  const empty = createDicTransport(A,async url=>good([],url),{now:()=>42});
  const noResult = plain(await empty.lookup(['未登録']));
  assert.equal(noResult.status,'ok');
  assert.equal(noResult.results[0].state,'observed_absent');
  assert.equal(noResult.results[0].observedAt,42);
  empty.dispose();
  const malformed = createDicTransport(A,async url=>good([{request_title:'別名',title:'X'}],url));
  const bad = plain(await malformed.lookup(['未登録']));
  assert.equal(bad.status,'error');
  assert.equal(bad.results[0].state,'unknown');
  assert.equal(bad.results[0].observedAt,null);
  malformed.dispose();
});

test('concurrent identical action shares pending GET but not result ownership', async () => {
  let count = 0, release;
  const client = createDicTransport(A,(url) => {
    count++;
    return new Promise(resolve=> {release=()=>resolve(good([],url));});
  });
  const a = client.lookup(['タグ']);
  const b = client.lookup(['タグ']);
  assert.equal(count,1);
  release();
  const both = plain(await Promise.all([a,b]));
  assert.deepEqual(both.map(r=>r.status),['ok','ok']);
  assert.equal(count,1);
  client.dispose();
});

test('dispose discards response even if injected request ignores abort', async () => {
  let release, calls = 0;
  const client = createDicTransport(A,url=>{
    calls++;
    return new Promise(resolve=>{release=()=>resolve(good([],url));});
  });
  const pending = client.lookup(['タグ']);
  client.dispose();
  release();
  const result=plain(await pending);
  assert.equal(calls,1);
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  assert.equal(client.disposed,true);
});

test('bounded action/URL budgets never issue oversized GETs', async () => {
  let calls=0;
  const client=createDicTransport(A,async url=>{calls++;return good([],url);});
  const overTitles=plain(await client.lookup(Array.from({length:31},(_,i)=>'タグ'+i)));
  assert.equal(overTitles.status,'invalid');
  assert.equal(overTitles.reason,'action_budget');
  assert.equal(calls,0);
  const overUrl=plain(await client.lookup(['長'.repeat(900)]));
  assert.equal(overUrl.status,'error');
  assert.equal(overUrl.results[0].state,'error');
  assert.equal(overUrl.results[0].observedAt,null);
  assert.equal(calls,0);
  client.dispose();
});

test('HTTP and failed transport are errors, never observed_absent', async () => {
  for (const fail of [async()=>({ok:false,status:429}),async()=>{throw new Error('offline');}]) {
    const client=createDicTransport(A,fail);
    const r=plain(await client.lookup(['未掲載']));
    assert.equal(r.status,'error');
    assert.equal(r.results[0].state,'error');
    assert.equal(r.results[0].observedAt,null);
    client.dispose();
  }
});

test('11 titles create two sequential 10+1 batches, never eager', async () => {
  const counts=[], urls=[];
  const client=createDicTransport(A,async url=>{
    const names=new URL(url).searchParams.getAll('titles[]');
    counts.push(names.length); urls.push(url);
    return good([],url);
  },{now:()=>77});
  assert.equal(counts.length,0);
  const result=plain(await client.lookup(Array.from({length:11},(_,i)=>'タグ'+i)));
  assert.deepEqual(counts,[10,1]);
  assert.equal(result.status,'ok');
  assert.equal(result.results.length,11);
  assert.ok(result.results.every(x=>x.state==='observed_absent' && x.observedAt===77));
  client.dispose();
});

test('already aborted route prevents even first network call', async () => {
  const signal=new AbortController();signal.abort();
  let calls=0;
  const client=createDicTransport(A,async url=>{calls++;return good([],url);},{signal:signal.signal});
  const result=plain(await client.lookup(['タグ']));
  assert.equal(calls,0);
  assert.equal(client.disposed,true);
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
});

test('route abort between batches prevents launch of second GET', async () => {
  const route=new AbortController();
  let calls=0;
  const client=createDicTransport(A,async url=>{
    calls++;
    if(calls===1) route.abort();
    return good([],url);
  },{signal:route.signal});
  const result=plain(await client.lookup(Array.from({length:11},(_,i)=>'タ'+i)));
  assert.equal(calls,1);
  assert.equal(client.disposed,true);
  assert.equal(result.status,'error');
  assert.equal(result.results.length,11);
  assert.ok(result.results.every(x=>x.state==='error'));
});

test('one failed batch cannot mark its titles absent while other batch succeeds', async () => {
  let calls=0;
  const client=createDicTransport(A,async url=>{
    calls++;
    return calls===1 ? good([],url):{ok:false,status:503};
  });
  const result=plain(await client.lookup(Array.from({length:11},(_,i)=>'タ'+i)));
  assert.equal(calls,2);
  assert.equal(result.status,'partial');
  assert.deepEqual(result.results.map(r=>r.state).slice(9),['observed_absent','error']);
  client.dispose();
});

test('invalid JSON body remains unresolved rather than observed_absent',async()=>{
  const client=createDicTransport(A,async url=>({
    ok:true,url,json:async()=>{throw new SyntaxError('invalid JSON');}
  }));
  const result=plain(await client.lookup(['タグ']));
  assert.equal(result.status,'error');
  assert.equal(result.reason,'unresolved');
  // The UI-facing aggregate only exposes 'unresolved', not per-batch error provenance.
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  client.dispose();
});

test('hung injected transport is bounded by per-batch timeout, never absent',async()=>{
  let requestOptions;
  const client=createDicTransport(A,async(_url,options)=>{
    requestOptions=options;
    return new Promise(()=>{});
  },{timeoutMs:100});
  const start=Date.now();
  const result=plain(await client.lookup(['タグ']));
  const elapsed=Date.now()-start;
  assert.ok(elapsed>=80 && elapsed<3000,'bounded timeout '+elapsed+'ms');
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  assert.equal(requestOptions.signal.aborted,true);
  client.dispose();
});

test('dispose resolves a hung batch promptly and leaves no missing=false',async()=>{
  let seenSignal;
  const client=createDicTransport(A,async(_url,options)=>{
    seenSignal=options.signal;
    return new Promise(()=>{});
  },{timeoutMs:1000});
  const pending=client.lookup(['タグ']);
  assert.ok(seenSignal);
  const started=Date.now();
  client.dispose();
  const result=plain(await pending);
  assert.ok(Date.now()-started<500,'dispose should not await timeout');
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  assert.equal(seenSignal.aborted,true);
});

test('failed request can be retried explicitly without negative cache',async()=>{
  let calls=0;
  const client=createDicTransport(A,async url=>{
    calls++;
    return calls===1?{ok:false,status:503}:good([],url);
  },{now:()=>95});
  const a=plain(await client.lookup(['未掲載']));
  const b=plain(await client.lookup(['未掲載']));
  assert.equal(calls,2);
  assert.equal(a.status,'error');
  assert.equal(a.results[0].state,'error');
  assert.equal(b.status,'ok');
  assert.equal(b.results[0].state,'observed_absent');
  assert.equal(b.results[0].observedAt,95);
  client.dispose();
});

// Follow-up independent OFFLINE gates: completion must be bounded after headers too.
test('hung response JSON body is interrupted by the batch timeout', async () => {
  let seenSignal;
  const client = createDicTransport(A,async (_url, options) => {
    seenSignal=options.signal;
    return {ok:true,json:()=>new Promise(()=>{})};
  },{timeoutMs:100});
  const started=Date.now();
  const result=plain(await client.lookup(['タグ']));
  assert.ok(Date.now()-started>=80 && Date.now()-started<3000);
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  assert.equal(seenSignal.aborted,true);
  client.dispose();
});

test('mismatched final response URL cannot prove a title absent', async () => {
  const client=createDicTransport(A,async ()=>good([], 'https://invalid.example/no'));
  const result=plain(await client.lookup(['未掲載']));
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  client.dispose();
});

test('dictionary request encodes reserved tag characters as query DATA', async () => {
  const names=['#コンパス','A?B','A/B','%25','A&B=1','空 白'];
  let seen;
  const client=createDicTransport(A,async url=>{
    seen=new URL(url);
    return good([],url);
  },{now:()=>10});
  const result=plain(await client.lookup(names));
  assert.equal(result.status,'ok');
  assert.deepEqual(seen.searchParams.getAll('titles[]'),names);
  assert.equal(seen.hash,'');
  assert.equal(seen.pathname,'/v1/articles/article');
  assert.equal(result.results.length,names.length);
  client.dispose();
});

test('unpaired UTF-16 title cannot acquire a definitive absent observation',async()=>{
  const invalidTitle='bad'+String.fromCharCode(0xD800)+'tag';
  let requests=0;
  const client=createDicTransport(A,async url=>{
    requests++;
    return good([],url);
  });
  const result=plain(await client.lookup([invalidTitle]));
  assert.equal(requests,0,'must not silently transmit U+FFFD in place of title');
  assert.equal(result.status,'error');
  assert.equal(result.results[0].state,'error');
  assert.equal(result.results[0].observedAt,null);
  client.dispose();
});

test('valid supplementary-plane Unicode pairs remain fully round-trip safe',async()=>{
  const title='ぶた🐷音楽';
  let seen;
  const client=createDicTransport(A,async url=>{
    seen=new URL(url).searchParams.getAll('titles[]');
    return good([],url);
  });
  const result=plain(await client.lookup([title]));
  assert.deepEqual(seen,[title]);
  assert.equal(result.status,'ok');
  assert.equal(result.results[0].state,'observed_absent');
  client.dispose();
});

test('route abort after a successful earlier batch invalidates the entire stale action',async()=>{
  const route=new AbortController();
  let calls=0;
  const client=createDicTransport(A,async url=>{
    calls++;
    if(calls===2) route.abort();
    return good([],url);
  },{signal:route.signal,now:()=>96});
  const result=plain(await client.lookup(Array.from({length:11},(_,i)=>'タグ'+i)));
  assert.equal(calls,2);
  assert.equal(client.disposed,true);
  assert.equal(result.status,'error');
  assert.ok(result.results.every(row=>row.state==='error' && row.observedAt===null));
});
