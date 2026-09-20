import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/data/card-action-data.js',import.meta.url),'utf8').catch(()=> 'var CardActionData = {}');
const api=()=>vm.runInNewContext(source+';CardActionData',{URLSearchParams,location:{origin:'https://www.nicovideo.jp'}});
const plain=v=>JSON.parse(JSON.stringify(v));
const response=(body={},status=200,extra={})=>({ok:status>=200&&status<300,status,redirected:false,json:async()=>body,...extra});
const fail=code=>e=>e.code===code&&e.message==='Card action unavailable'&&!e.cause;

test('watch later uses the saved official form request and included session',async()=>{
 const calls=[];const result=await api().watchLater('sm123',{fetch:async(url,options)=>{calls.push({url,options});return response({meta:{status:201},data:{}} ,201);}});
 assert.deepEqual(plain(result),{status:'success',alreadyAdded:false});assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://nvapi.nicovideo.jp/v1/users/me/watch-later');
 const o=calls[0].options;assert.equal(o.method,'POST');assert.equal(String(o.body),'watchId=sm123&memo=');
 assert.deepEqual(plain(o.headers),{'X-Frontend-Id':'6','X-Frontend-Version':'0','X-Niconico-Language':'ja-jp',Accept:'application/json;charset=utf-8','Content-Type':'application/x-www-form-urlencoded','X-Request-With':'https://www.nicovideo.jp'});
 assert.equal(o.credentials,'include');assert.equal(o.mode,'cors');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
});

test('watch later only treats the official conflict error as already added',async()=>{
 const result=await api().watchLater('so123',{fetch:async()=>response({meta:{status:409,errorCode:'CONFLICT'}},409)});
 assert.deepEqual(plain(result),{status:'success',alreadyAdded:true});
 await assert.rejects(api().watchLater('sm123',{fetch:async()=>response({meta:{status:409,errorCode:'PRIVATE'}},409)}),fail('http'));
});

test('user and channel mute use separate numeric owner paths and bodyless mutations',async()=>{
 for(const [owner,muted,url,method] of [[{type:'user',id:123},true,'https://mute-api.nicovideo.jp/v1/users/123','POST'],[{type:'channel',id:'456'},false,'https://mute-api.nicovideo.jp/v1/channels/456','DELETE']]){
  const calls=[];const result=await api().setOwnerMuted(owner,muted,{fetch:async(u,o)=>{calls.push({u,o});return response({});}});
  assert.deepEqual(plain(result),{status:'success',isMuted:muted});assert.equal(calls.length,1);assert.equal(calls[0].u,url);
  const o=calls[0].o;assert.equal(o.method,method);assert.equal(o.body,undefined);assert.equal(o.credentials,'include');
  assert.deepEqual(plain(o.headers),{'X-Frontend-Id':'6','X-Frontend-Version':'0',Accept:'application/json','X-Requested-With':'https://www.nicovideo.jp'});
 }
});

test('mute read treats successful JSON as muted and only HTTP 404 as unmuted',async()=>{
 for(const [owner,status,want,path] of [[{type:'user',id:123},200,true,'users/123'],[{type:'channel',id:456},404,false,'channels/456']]){
  const calls=[];const result=await api().getOwnerMuted(owner,{fetch:async(u,o)=>{calls.push({u,o});return response({},status);}});
  assert.deepEqual(plain(result),{status:'success',isMuted:want});assert.equal(calls.length,1);
  assert.equal(calls[0].u,'https://mute-api.nicovideo.jp/v1/'+path);assert.equal(calls[0].o.method,'GET');
  assert.deepEqual(plain(calls[0].o.headers),{'X-Frontend-Id':'6','X-Frontend-Version':'0',Accept:'application/json'});
 }
 await assert.rejects(api().getOwnerMuted({type:'user',id:123},{fetch:async()=>response({},500)}),fail('http'));
 await assert.rejects(api().setOwnerMuted({type:'user',id:123},false,{fetch:async()=>response({},404)}),fail('http'));
});

test('official authentication, account limits and maintenance become safe fixed errors',async()=>{
 const cases=[['watchLater',{meta:{errorCode:'NEED_LOGIN'}},400,'unauthorized'],['watchLater',{meta:{errorCode:'UNAUTHORIZED'}},401,'unauthorized'],['watchLater',{meta:{errorCode:'MAINTENANCE'}},503,'maintenance'],['setOwnerMuted',{code:'noUserSession'},400,'unauthorized'],['setOwnerMuted',{code:'regularAccountLimit'},400,'limit'],['setOwnerMuted',{code:'premiumAccountLimit'},400,'limit'],['setOwnerMuted',{code:'maintenance'},503,'maintenance']];
 for(const [method,body,status,code] of cases){let calls=0;const opts={fetch:async()=>{calls++;return response(body,status);}};
  await assert.rejects(method==='watchLater'?api()[method]('sm123',opts):api()[method]({type:'user',id:123},true,opts),fail(code));assert.equal(calls,1);
 }
});

test('invalid identities never trigger account requests',async()=>{
 let calls=0;const opts={fetch:async()=>{calls++;return response();}};
 for(const id of ['',null,'sm0','sm123/path','https://example.test','SM123','123', 'sm'+'1'.repeat(40)]) await assert.rejects(api().watchLater(id,opts),fail('invalid_input'));
 for(const owner of [null,{}, {type:'user',id:0},{type:'user',id:-1},{type:'user',id:1.5},{type:'user',id:'12x'},{type:'channel',id:'ch123'},{type:'channel',id:'123/path'},{type:'community',id:123},{type:'user',id:Number.MAX_SAFE_INTEGER+1}]) await assert.rejects(api().getOwnerMuted(owner,opts),fail('invalid_input'));
 await assert.rejects(api().setOwnerMuted({type:'user',id:1},'true',opts),fail('invalid_input'));assert.equal(calls,0);
});

test('malformed JSON, redirects, and network errors expose no response details or retries',async()=>{
 for(const reply of [response(null),response([]),response({},200,{redirected:true}),response({},200,{json:async()=>{throw Error('PRIVATE_BODY');}})]){
  let calls=0;await assert.rejects(api().watchLater('sm123',{fetch:async()=>{calls++;return reply;}}),fail('malformed'));assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(api().setOwnerMuted({type:'user',id:123},true,{fetch:async()=>{calls++;throw Error('PRIVATE_URL');}}),fail('network'));assert.equal(calls,1);
});

test('already aborted requests perform zero fetches and use sanitized AbortError',async()=>{
 const ac=new AbortController();ac.abort();let calls=0;
 await assert.rejects(api().watchLater('sm123',{signal:ac.signal,fetch:async()=>{calls++;return response();}}),e=>fail('aborted')(e)&&e.name==='AbortError');assert.equal(calls,0);
});

test('abort during fetch or JSON suppresses late mutation success',async()=>{
 for(const stage of ['fetch','json']){
  const ac=new AbortController();let release,ready,calls=0;const wait=new Promise(r=>release=r);const started=new Promise(r=>ready=r);
  const pending=api().watchLater('sm123',{signal:ac.signal,fetch:async(_url,o)=>{calls++;assert.equal(o.signal,ac.signal);if(stage==='fetch'){ready();await wait;}return response({},200,{json:async()=>{if(stage==='json'){ready();await wait;}return {};}});}});
  await started;ac.abort();release();await assert.rejects(pending,e=>fail('aborted')(e)&&e.name==='AbortError');assert.equal(calls,1);
 }
});
