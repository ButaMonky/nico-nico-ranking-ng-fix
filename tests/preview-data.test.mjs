import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const source = await readFile(new URL('../src/preview/preview-data.js', import.meta.url), 'utf8').catch(() => 'var PreviewData = {}');
const api = () => vm.runInNewContext(source + ';PreviewData', {URL, AbortController, crypto:webcrypto});
const plain = value => JSON.parse(JSON.stringify(value));
const ng = () => ({ngScore:{isDisabled:false}, owner:[], channel:[], viewer:{revision:0,count:0,items:[]}});
const config = () => ({ng:ng(), nvComment:{server:'https://public.nvcomment.nicovideo.jp', threadKey:'synthetic-comment-key',params:{targets:[{id:'123',fork:'main'}],language:'ja-jp'}}});
const preview = () => ({meta:{status:200},data:{video:{id:'sm123',duration:120},domand:{accessRightKey:'synthetic-right-key',videos:[{id:'video-high',height:720,bitRate:1000,isAvailable:true},{id:'video-low',height:360,bitRate:300,isAvailable:true}],audios:[{id:'audio-high',bitRate:128,isAvailable:true},{id:'audio-low',bitRate:64,isAvailable:true}]},comment:config()}});
const rights = () => ({meta:{status:201},data:{contentUrl:'https://delivery.domand.nicovideo.jp/hls/synthetic.m3u8',expireTime:'2030-01-01T00:00:00Z'}});
const response = (body, extra={}) => ({ok:true,status:200,redirected:false,json:async()=>body,...extra});
const comment = (extra={}) => ({vposMs:0,body:'synthetic text',commands:['white'],score:0,isMyPost:false,userId:'synthetic-user',...extra});
const threads = comments => ({meta:{status:200},data:{threads:[{id:'123',fork:'main',comments}]}});

test('preview selects one available low-bandwidth pair and uses ordinary bounded requests', async () => {
 const calls=[],reports=[];
 const result=await api().load('sm123',{now:()=>0,report:(...args)=>reports.push(args),fetch:async(url,options)=>{calls.push({url,options});return response(calls.length===1?preview():rights());}});
 assert.equal(result.duration,120);assert.equal(result.expiresAt,1893456000000);
 assert.equal(result.url,'https://delivery.domand.nicovideo.jp/hls/synthetic.m3u8');
 assert.equal(calls.length,2);
 assert.equal(new URL(calls[0].url).pathname,'/v1/watch/sm123/preview');
 assert.equal(new URL(calls[1].url).pathname,'/v1/watch/sm123/access-rights/hls');
 assert.equal(new URL(calls[0].url).searchParams.get('actionTrackId'),new URL(calls[1].url).searchParams.get('actionTrackId'));
 assert.deepEqual(JSON.parse(calls[1].options.body),{outputs:[['video-low','audio-low']]});
 for(const {options} of calls){assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Origin,undefined);assert.equal(options.headers.Referer,undefined);}
 assert.equal(calls[1].options.headers['X-Access-Right-Key'],'synthetic-right-key');
 assert.deepEqual(reports,[['preview','started'],['preview','ok'],['rights','started'],['rights','ok']]);
});

test('preview invalid identifiers cause zero fetches', async()=>{
 for(const id of ['','sm1/path','https://example.org','SM123','sm123?x','123']){
  let count=0; await assert.rejects(api().load(id,{fetch:async()=>{count++;return response(preview());}}));assert.equal(count,0);
 }
});

test('preview rejects unavailable, mismatched, malformed and HTTP failures before requesting rights',async()=>{
 const bad=[];
 for(const change of [p=>p.meta.status=403,p=>p.data.video.id='sm456',p=>p.data.video.duration=-1,p=>p.data.domand.accessRightKey='',p=>p.data.domand.videos.forEach(v=>v.isAvailable=false)]){const p=preview();change(p);bad.push(response(p));}
 bad.push(response(preview(),{ok:false,status:403}),response(preview(),{redirected:true}),response(preview(),{json:async()=>{throw Error('PRIVATE_BODY');}}));
 for(const reply of bad){let count=0;await assert.rejects(api().load('sm123',{fetch:async()=>{count++;return reply;}}),err=>!err.message.includes('PRIVATE'));assert.equal(count,1);}
});

test('rights rejects expired credentials and untrusted content URLs',async()=>{
 for(const url of ['http://delivery.domand.nicovideo.jp/a','https://delivery.domand.nicovideo.jp.evil.test/a','https://evil.test/a','https://user@delivery.domand.nicovideo.jp/a','https://delivery.domand.nicovideo.jp:8443/a']){
  const r=rights();r.data.contentUrl=url;let count=0;await assert.rejects(api().load('sm123',{now:()=>0,fetch:async()=>response(++count===1?preview():r)}));assert.equal(count,2);
 }
 let count=0;await assert.rejects(api().load('sm123',{now:()=>1893456000000,fetch:async()=>response(++count===1?preview():rights())}));
});

test('abort after delayed preview or JSON resolution prevents rights and leaks no error detail',async()=>{
 for(const stage of ['fetch','body']){
  const ac=new AbortController();let release,count=0;const reports=[];
  const wait=new Promise(resolve=>release=resolve);
  const pending=api().load('sm123',{signal:ac.signal,report:(...a)=>reports.push(a),fetch:async()=>{count++;if(stage==='fetch'){await wait;return response(preview());}return response(null,{json:async()=>{await wait;return preview();}});}});
  ac.abort();release();await assert.rejects(pending,{name:'AbortError'});assert.equal(count,1);assert.equal(reports.at(-1)[1],'aborted');
 }
 const reports=[];await assert.rejects(api().load('sm123',{report:(...a)=>reports.push(a),fetch:async()=>{throw Error('PRIVATE_KEY');}}),e=>!e.message.includes('PRIVATE'));assert.deepEqual(reports,[['preview','started'],['preview','network']]);
});

test('comments use validated server, omit credentials, exact targets, no history or retry',async()=>{
 const calls=[];const data={comment:config(),ng:ng()};
 const result=await api().comments(data,{fetch:async(url,options)=>{calls.push({url,options});return response(threads([comment()]));}});
 assert.deepEqual(plain(result),[{vposMs:0,text:'synthetic text',commands:['white']}]);assert.equal(calls.length,1);
 assert.equal(new URL(calls[0].url).hostname,'public.nvcomment.nicovideo.jp');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers['Content-Type'],'text/plain;charset=UTF-8');
 assert.deepEqual(JSON.parse(calls[0].options.body),{params:{targets:[{id:'123',fork:'main'}],language:'ja-jp'},threadKey:'synthetic-comment-key',additionals:{}});
});

test('unsupported NG rules and untrusted comment server suppress comments before fetch',async()=>{
 for(const change of [c=>c.ng.viewer.items.push({type:'word',source:'blocked'}),c=>c.ng.owner.push({}),c=>c.ng.viewer.count=1,c=>c.ng.extra=true,c=>delete c.ng,c=>c.nvComment.server='https://evil.test',c=>c.nvComment.params.targets[0].fork='unknown']){
  const c=config();change(c);let count=0;await assert.rejects(api().comments({comment:c,ng:c.ng},{fetch:async()=>{count++;return response(threads([]));}}));assert.equal(count,0);
 }
});

test('normalization enforces target, timing, text, AI and negative-score boundaries',()=>{
 const data=threads([comment({vposMs:-1}),comment({vposMs:30000}),comment({vposMs:NaN}),comment({score:-1}),comment({isAI:true}),comment({commands:['ai']}),comment({vposMs:29999,body:'<b>'+ 'x'.repeat(250),commands:['ue','red','javascript:bad','big']})]);
 data.data.threads.push({id:'999',fork:'main',comments:[comment()]},{id:'123',fork:'owner',comments:[comment()]});
 const out=plain(api().normalizeComments(data,[{id:'123',fork:'main'}],ng()));
 assert.equal(out.length,1);assert.equal(out[0].vposMs,29999);assert.equal(out[0].text.length,200);assert.ok(out[0].text.startsWith('<b>'));assert.deepEqual(out[0].commands,['ue','red','big']);
});

test('normalization caps output at 300 and processing at 5000 received comments',()=>{
 assert.equal(api().normalizeComments(threads(Array.from({length:700},()=>comment())),[{id:'123',fork:'main'}],ng()).length,300);
 const list=Array.from({length:5000},()=>comment({vposMs:40000}));list.push(comment());
 assert.equal(api().normalizeComments(threads(list),[{id:'123',fork:'main'}],ng()).length,0);
});

test('selection falls back to available higher resolutions and never includes unavailable audio',()=>{
 const domand=preview().data.domand;domand.videos[1].isAvailable=false;domand.audios[1].isAvailable=false;
 assert.deepEqual(plain(api().selectOutputs(domand)),[['video-high','audio-high']]);
 domand.audios[0].isAvailable=false;assert.throws(()=>api().selectOutputs(domand));
});

test('optional rights video identifiers must match the requested video',async()=>{
 for(const field of ['videoId','watchId']){
  const r=rights();r.data[field]='sm456';let count=0;
  await assert.rejects(api().load('sm123',{now:()=>0,fetch:async()=>response(++count===1?preview():r)}));
 }
});

test('comments HTTP failure is not retried and already aborted calls perform zero requests',async()=>{
 let count=0;const reports=[];
 await assert.rejects(api().comments({comment:config()},{report:(...a)=>reports.push(a),fetch:async()=>{count++;return response(null,{ok:false,status:429});}}));
 assert.equal(count,1);assert.deepEqual(reports,[['comments','started'],['comments','http']]);
 const ac=new AbortController();ac.abort();
 for(const run of [p=>p.load('sm123',{signal:ac.signal,fetch:async()=>{count++;}}),p=>p.comments({comment:config()},{signal:ac.signal,fetch:async()=>{count++;}})])await assert.rejects(run(api()),{name:'AbortError'});
 assert.equal(count,1);
});
