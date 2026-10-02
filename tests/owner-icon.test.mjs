import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
// BRUSH-012B: OwnerIcon picks one display candidate at a time. Every src
// assignment is an image GET, so tests count assignments as requests.
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(){
 const context=vm.createContext({URL,queueMicrotask,console:{log(){},warn(){},error(){}},GM_xmlhttpRequest(){throw new Error('no requests');},fetch(){throw new Error('no requests');}});
 return vm.runInContext(source.slice(0,boundary)+'return {OwnerIcon:typeof OwnerIcon==="undefined"?null:OwnerIcon,OwnerEvidence,OwnerResolver}; })()',context);
}
class FakeImage{
 constructor(){this.dataset={};this.style={};this.isConnected=true;this.requests=[];this._src='';this.onload=null;this.onerror=null;}
 get src(){return this._src;}
 set src(value){this._src=value;this.requests.push(value);}
 removeAttribute(name){if(name==='src')this._src='';}
 fail(){this.onerror?.();}
 load(){this.onload?.();}
}
const CDN='https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/';
const NATIVE='https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1234/12345678.jpg?1700000000';
const API='https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg?1712345678';
const user=id=>({type:'user',id,name:'n'});
const sources=list=>plain(list).map(c=>c.source);
test('owner icon: a native page icon comes first and loads with one request',()=>{
 const {OwnerIcon:I}=setup();assert.ok(I,'OwnerIcon is built into the userscript');
 const list=I.candidates({native:NATIVE,api:API,owner:user('12345678')});
 assert.deepEqual(sources(list),['native','api','cdn','default']);
 assert.equal(list[0].url,NATIVE,'the native query string is kept');
 const image=new FakeImage();I.apply(image,list);image.load();
 assert.deepEqual(image.requests,[NATIVE]);
 assert.equal(image.dataset.nrnIconSource,'native');assert.equal(image.dataset.nrnIconState,'loaded');
});
test('owner icon: an API ownerIcon is used when there is no native icon; query strings are kept',()=>{
 const {OwnerIcon:I}=setup();
 const list=I.candidates({api:API,owner:user('12345678')});
 assert.deepEqual(sources(list),['api','cdn','default']);
 assert.equal(list[0].url,API);
 const image=new FakeImage();I.apply(image,list);image.load();
 assert.deepEqual(image.requests,[API]);assert.equal(image.dataset.nrnIconSource,'api');
});
test('owner icon: without an API ownerIcon the CDN URL is built from the canonical user ID',()=>{
 const {OwnerIcon:I}=setup();
 const list=I.candidates({owner:user('12345678')});
 assert.deepEqual(plain(list),[{url:CDN+'1234/12345678.jpg',source:'cdn'},{url:I.blank,source:'default'}]);
 for(const [id,url] of [['1','0/1.jpg'],['9999','0/9999.jpg'],['10000','1/10000.jpg'],[12345678,'1234/12345678.jpg'],['000123','0/123.jpg']])
  assert.equal(I.cdn(user(id)),CDN+url,String(id));
 // Default images in native/API data do not stop a real CDN attempt.
 assert.deepEqual(sources(I.candidates({native:I.blank,api:'https://img.nicoprofile.nimg.jp/usericon/defaults/blank.jpg',owner:user('5')})),['cdn','default']);
});
test('owner icon: CDN success stops the chain; CDN failure falls back to the default image',()=>{
 const {OwnerIcon:I}=setup();
 const ok=new FakeImage();I.apply(ok,I.candidates({owner:user('12345678')}));ok.load();
 assert.deepEqual(ok.requests,[CDN+'1234/12345678.jpg']);assert.equal(ok.dataset.nrnIconSource,'cdn');assert.equal(ok.dataset.nrnIconState,'loaded');
 const bad=new FakeImage();I.apply(bad,I.candidates({owner:user('87654321')}));bad.fail();
 assert.deepEqual(bad.requests,[CDN+'8765/87654321.jpg',I.blank]);
 assert.equal(bad.dataset.nrnIconSource,'default');
 bad.load();assert.equal(bad.dataset.nrnIconState,'loaded');
});
test('owner icon: when the default image also fails the local fallback makes no request',()=>{
 const {OwnerIcon:I}=setup();
 const image=new FakeImage();I.apply(image,I.candidates({native:NATIVE,api:API,owner:user('12345678')}));
 for(let i=0;i<10;i++)image.fail();
 assert.deepEqual(image.requests,[NATIVE,API,CDN+'1234/12345678.jpg',I.blank],'each candidate is tried once, in order');
 assert.equal(image.src,'');assert.equal(image.onerror,null);
 assert.equal(image.style.visibility,'hidden');
 assert.equal(image.dataset.nrnIconSource,'local');assert.equal(image.dataset.nrnIconState,'local-fallback');
});
test('owner icon: large user IDs keep every digit in the CDN bucket and file name',()=>{
 const {OwnerIcon:I}=setup();
 assert.equal(I.cdn(user('9007199254740991')),CDN+'900719925474/9007199254740991.jpg');
 assert.equal(I.cdn(user('9007199254740992')),CDN+'900719925474/9007199254740992.jpg');
 assert.equal(I.cdn(user('9007199254740993')),CDN+'900719925474/9007199254740993.jpg');
 assert.notEqual(I.cdn(user('9007199254740992')),I.cdn(user('9007199254740993')));
 assert.equal(I.cdn(user('123456789012345678901234567890')),CDN+'12345678901234567890123456/123456789012345678901234567890.jpg');
});
test('owner icon: channels and invalid IDs never get a user CDN URL',()=>{
 const {OwnerIcon:I}=setup();
 assert.equal(I.cdn({type:'channel',id:'2632720'}),null);
 assert.deepEqual(sources(I.candidates({owner:{type:'channel',id:'2632720'}})),['default']);
 for(const id of ['0','-1','1.5','1e20','abc','',null,undefined,2**53,NaN])assert.equal(I.cdn(user(id)),null,String(id));
 assert.equal(I.cdn({type:'unknown',id:'5'}),null);assert.equal(I.cdn(null),null);
 // Only https nimg.jp images; http is upgraded; anything else is dropped.
 assert.equal(I.valid('http://secure-dcdn.cdn.nimg.jp/a.jpg?x=1'),'https://secure-dcdn.cdn.nimg.jp/a.jpg?x=1');
 for(const bad of ['https://example.com/a.jpg','https://nimg.jp.evil.example/a.jpg','javascript:alert(1)','data:image/png;base64,AA','/relative.jpg','https://u:p@secure-dcdn.cdn.nimg.jp/a.jpg','https://secure-dcdn.cdn.nimg.jp:8443/a.jpg','',null,42])
  assert.equal(I.valid(bad),null,String(bad));
 assert.deepEqual(sources(I.candidates({native:'https://example.com/x.jpg',api:'javascript:1',owner:user('5')})),['cdn','default']);
});
test('owner icon: the same owner on several cards does not re-request a URL that just failed',()=>{
 const {OwnerIcon:I}=setup();let now=1000;const clock=()=>now;
 const first=new FakeImage();I.apply(first,I.candidates({owner:user('12345678')}),clock);first.fail();
 const second=new FakeImage();I.apply(second,I.candidates({owner:user('12345678')}),clock);
 assert.deepEqual(second.requests,[I.blank],'the broken CDN URL is skipped inside the TTL');
 const ok=new FakeImage();I.apply(ok,I.candidates({owner:user('12345679')}),clock);
 assert.deepEqual(ok.requests,[CDN+'1234/12345679.jpg'],'a different owner is not affected');
 // Same working URL on many cards: one src per card; the browser cache shares the bytes.
 const cards=[1,2,3].map(()=>{const image=new FakeImage();I.apply(image,I.candidates({api:API,owner:user('12345678')}),clock);image.load();return image;});
 assert.deepEqual(cards.map(c=>c.requests),[[API],[API],[API]]);
});
test('owner icon: the failure cache expires so a CDN icon can be tried again later',()=>{
 const {OwnerIcon:I}=setup();let now=0;const clock=()=>now;
 const first=new FakeImage();I.apply(first,I.candidates({owner:user('12345678')}),clock);first.fail();
 now=I.failureTtl-1;
 const early=new FakeImage();I.apply(early,I.candidates({owner:user('12345678')}),clock);
 assert.deepEqual(early.requests,[I.blank]);
 now=I.failureTtl+1;
 const later=new FakeImage();I.apply(later,I.candidates({owner:user('12345678')}),clock);
 assert.deepEqual(later.requests,[CDN+'1234/12345678.jpg'],'not a permanent negative cache');
 assert.equal(I._failures.has(CDN+'1234/12345678.jpg'),false);
});
test('owner icon: the failure cache is bounded',()=>{
 const {OwnerIcon:I}=setup();
 for(let id=1;id<=600;id++){const image=new FakeImage();I.apply(image,[{url:CDN+'0/'+id+'.jpg',source:'cdn'}],()=>0);image.fail();}
 assert.ok(I._failures.size<=512,'size '+I._failures.size);
});
test('owner icon: a card removed by SPA navigation stops the chain',()=>{
 const {OwnerIcon:I}=setup();
 const image=new FakeImage();I.apply(image,I.candidates({native:NATIVE,api:API,owner:user('12345678')}));
 image.isConnected=false;image.fail();image.fail();
 assert.deepEqual(image.requests,[NATIVE],'no further image requests after dispose');
 assert.equal(image.onerror,null);
});
test('owner icon: a broken image list is retried at most once per candidate',()=>{
 const {OwnerIcon:I}=setup();
 const list=[{url:API,source:'api'},{url:API,source:'api'},{url:I.blank,source:'default'}];
 const deduped=I.candidates({native:API,api:API,owner:null});
 assert.deepEqual(sources(deduped),['native','default'],'duplicate URLs are collapsed');
 const image=new FakeImage();I.apply(image,list);for(let i=0;i<20;i++)image.fail();
 assert.deepEqual(image.requests,[API,I.blank],'a URL that failed is not requested again');
 assert.equal(image.dataset.nrnIconState,'local-fallback');
});
test('owner icon: owner evidence and resolver carry the API ownerIcon only for the same owner',()=>{
 const {OwnerEvidence:E,OwnerResolver:R}=setup();
 assert.equal(E.normalize({type:'user',id:'5',name:'a',iconUrl:API}).iconUrl,API);
 assert.equal('iconUrl' in plain(E.normalize({type:'user',id:'5',name:'a',iconUrl:''})),false);
 const detail=E.normalize({type:'user',id:'5',name:'a'});
 assert.equal(R.select({videoId:'sm9',detail,search:E.normalize({type:'user',id:'5',name:'a',iconUrl:API})}).owner.iconUrl,API);
 assert.equal(R.select({videoId:'sm9',detail,search:E.normalize({type:'user',id:'6',name:'b',iconUrl:API})}).owner.iconUrl,undefined);
 const supplement={source:'nicoad',owner:E.normalize({type:'user',id:'5',name:null,iconUrl:API})};
 assert.equal(R.select({videoId:'sm9',detail,supplement}).owner.iconUrl,API);
 assert.equal(R.select({videoId:'sm9',detail,supplement:{source:'nicoad',owner:E.normalize({type:'user',id:'7',name:null,iconUrl:API})}}).owner.iconUrl,undefined);
});
