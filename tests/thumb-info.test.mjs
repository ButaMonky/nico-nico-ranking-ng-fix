import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {baseline,output} from '../scripts/build.mjs';

// This adapter supplies parser output, not an XML parser. Browser XML parsing is untested.
class ParserDouble {
  parseFromString(text,type){
    assert.equal(type,'application/xml');
    const data=JSON.parse(text);
    return {documentElement:{
      getAttribute:k=>k==='status'?data.status:null,
      querySelector:k=>data.fields?.[k]===undefined?null:{textContent:data.fields[k]},
      querySelectorAll:()=> (data.tags||[]).map(t=>({textContent:t.name,getAttribute:()=>t.lock?'1':'0'}))
    }};
  }
}
async function setup(path,limit=2){
  const source=await readFile(path,'utf8'),marker='  var Tag = (function(_super) {';
  assert.equal(source.split(marker).length,2);
  const ThumbInfo=vm.runInNewContext(source.slice(0,source.indexOf(marker))+'return ThumbInfo; })()',
    {DOMParser:ParserDouble},{timeout:1000});
  const calls=[],trace=[];
  const service=new ThumbInfo(options=>{calls.push(options);trace.push(['request',options.url.split('/').at(-1)]);},limit);
  service.on('completed',v=>trace.push(['completed',JSON.parse(JSON.stringify(v))]));
  service.on('errorOccurred',v=>trace.push(['error',JSON.parse(JSON.stringify(v))]));
  return {service,calls,trace};
}
for(const [label,path] of [['baseline',baseline],['generated',output]]){
  test(`${label}: request deduplication, priority and next-request-before-error`,async()=>{
    const {service,calls,trace}=await setup(path);
    service.request(['sm1','sm1','sm2','sm3']);service.request(['sm2','sm4'],true);
    assert.equal(calls.length,2);
    assert.equal(calls[0].method,'GET');assert.equal(calls[0].timeout,5000);
    assert.equal(calls[0].url,'https://ext.nicovideo.jp/api/getthumbinfo/sm1');
    calls[0].onerror();
    assert.deepEqual(trace.slice(2),[['request','sm4'],['error',{id:'sm1',error:{type:'ERROR',message:'エラー'}}]]);
    calls[1].onload({status:503,statusText:'Unavailable'});
    assert.equal(calls[3].url.split('/').at(-1),'sm3');
    assert.equal(trace.at(-1)[1].error.type,'HTTP_STATUS');
    calls[2].onerror();calls[3].onerror();
    service.request(['sm1','sm2','sm3','sm4']);assert.equal(calls.length,4);
    assert.equal(service._requestCount,0);
  });
  test(`${label}: one timeout retry then terminal error releases next request`,async()=>{
    const {service,calls,trace}=await setup(path,1);service.request(['sm1','sm2']);
    calls[0].ontimeout();assert.equal(calls.length,2);
    assert.equal(calls[1].url,calls[0].url);assert.equal(service._requestCount,1);
    calls[1].ontimeout();assert.equal(calls.length,3);
    assert.deepEqual(trace.at(-1),['error',{id:'sm1',error:{type:'TIMEOUT',message:'タイムアウト'}}]);
    calls[2].onerror();assert.equal(service._requestCount,0);
  });
  test(`${label}: changing concurrency preserves pending order and clamps values`,async()=>{
    const {service,calls}=await setup(path,1);service.request(['a','b','c']);
    service.setConcurrent(2);assert.equal(calls.length,2);
    service.setConcurrent(1);assert.equal(calls.length,2);
    calls[0].onerror();assert.equal(calls.length,3); // Existing behavior: replaces a finished slot even after lowering limit.
    assert.equal(service._requestCount,2);
    service.setConcurrent(99);assert.equal(service.concurrent,20);
    service.setConcurrent(-1);assert.equal(service.concurrent,1);
    service.setConcurrent(0);assert.equal(service.concurrent,5);
  });
  test(`${label}: success data, API failure and parser failure notifications`,async()=>{
    const {service,calls,trace}=await setup(path,1);service.request(['ok','deleted','bad']);
    calls[0].onload({status:200,responseText:JSON.stringify({status:'ok',fields:{
      'thumb > title':'Title','thumb > description':'Description','thumb > user_id':'42','thumb > user_nickname':'Author'
    },tags:[{name:'locked',lock:true},{name:'normal',lock:false}]})});
    assert.deepEqual(trace[2],['completed',{description:'Description',tags:[{name:'locked',lock:true},{name:'normal',lock:false}],
      contributor:{type:'user',id:42,name:'Author'},title:'Title',error:{type:'NO_ERROR',message:'no error'},id:'ok'}]);
    calls[1].onload({status:200,responseText:JSON.stringify({status:'fail',fields:{'error > code':'DELETED'}})});
    assert.equal(trace.at(-1)[1].error.type,'DELETED');
    calls[2].onload({status:200,responseText:'not parser data'});
    assert.equal(trace.at(-1)[1].error.type,'PARSING');assert.equal(service._requestCount,0);
  });
}
