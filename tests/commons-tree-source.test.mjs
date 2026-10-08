import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/data/commons-tree-source.js',import.meta.url),'utf8');
const T=vm.runInNewContext(code+'\nCommonsTreeSource');
const plain=value=>JSON.parse(JSON.stringify(value));
const at=Date.parse('2026-10-08T11:35:00+09:00');
const req=(direction='combined',offset=0,limit=2)=>({direction,offset,limit,globalId:'sm9'});
const item=(id,extra={})=>({globalId:id,contentKind:'video',visibleStatus:'visible',...extra});
const wrap=(p,c,meta={status:200})=>({meta,data:{parents:p,children:c}});
const page=(total,contents)=>({total,contents});

test('combined limit is per direction, not a shared total',()=>{
 const out=plain(T.normalizeResponse(req(),wrap(page(1,[item('sm1')]),page(571,[item('sm2'),item('sm3')])),at));
 assert.equal(out.status,'ok');
 assert.deepEqual([out.pages.parents.returned,out.pages.children.returned],[1,2]);
 assert.equal(out.pages.children.total,571);
 assert.equal(out.pages.children.nextOffset,2);
 assert.equal(out.pages.children.observedLastWindow,false);
});

test('directional wrapper must be data.children, not data.contents',()=>{
 const input={meta:{status:200},data:{children:page(571,[item('sm5'),item('sm6')])}};
 const out=plain(T.normalizeResponse(req('children',2),input,at));
 assert.equal(out.status,'ok');
 assert.deepEqual(out.pages.children.contents.map(v=>v.globalId),['sm5','sm6']);
 assert.equal(out.pages.parents,undefined);
 assert.equal(T.normalizeResponse(req('children',2),{meta:{status:200},data:{contents:input.data.children}},at).status,'invalid');
});
test('short nonterminal page is sparse, not an invented EOF',()=>{
 const r=plain(T.normalizeResponse(req('children',2,20),{data:{children:page(100,[item('sm5')])}},at));
 assert.equal(r.status,'ok');
 assert.equal(r.pages.children.sparse,true);
 assert.equal(r.pages.children.empty,false);
 assert.equal(r.pages.children.observedLastWindow,false);
 assert.equal(r.pages.children.nextOffset,22);
});

test('empty page and reported final window are observations, not proof all earlier IDs exist',()=>{
 const empty=plain(T.normalizeResponse(req('parents',20),{data:{parents:page(40,[])}},at));
 assert.equal(empty.pages.parents.empty,true);
 assert.equal(empty.pages.parents.sparse,true);
 const final=plain(T.normalizeResponse(req('children',40),{data:{children:page(41,[item('sm99')])}},at));
 assert.equal(final.pages.children.observedLastWindow,true);
 assert.equal(final.pages.children.sparse,false);
});

test('metadata-hydration omissions preserve authoritative global ID and availability',()=>{
 const rows=[item('sm1',{title:'安全なテキスト',watchURL:'javascript:alert(1)',description:'<script>x</script>'}),
  item('sm2',{contentKind:'live',visibleStatus:'hidden'})];
 const r=plain(T.normalizeResponse(req('children'),{data:{children:page(2,rows)}},at));
 assert.equal(r.status,'ok');
 assert.deepEqual(r.pages.children.contents.map(v=>v.globalId),['sm1','sm2']);
 assert.equal(r.pages.children.contents[0].title,'安全なテキスト');
 assert.equal(Object.hasOwn(r.pages.children.contents[0],'watchURL'),false);
 assert.deepEqual([r.pages.children.contents[1].contentKind,r.pages.children.contents[1].visibleStatus],['live','hidden']);
});

test('malformed, duplicate, and oversized rows invalidate the whole page',()=>{
 const bad=[{},null,{data:{}},{meta:{status:403},data:{children:page(0,[])}},
   {data:{children:page(-1,[])}},{data:{children:page(5,[item('sm1'),item('sm1')])}},
   {data:{children:page(5,[item('sm1'),item('sm2'),item('sm3')])}},
   {data:{children:page(5,[{globalId:'javascript:alert(1)'}])}}];
 for(const payload of bad) {
  const r=plain(T.normalizeResponse(req('children'),payload,at));
  assert.equal(r.status,'invalid',JSON.stringify(payload));
  assert.equal(r.pages,null);
 }
});
test('bad request and invalid timestamps do not advance paging',()=>{
 const badRequests=[req('unknown'),req('children',-1),req('children',0,0),req('children',0,301),
   {...req(),globalId:'../private'},req('children',Number.MAX_SAFE_INTEGER,2)];
 for(const request of badRequests) assert.equal(T.normalizeResponse(request,{},at).status,'invalid');
 assert.equal(T.observedLimitCeiling,300);
 assert.equal(T.normalizeResponse(req('children'),{},NaN).status,'invalid');
 assert.equal(T.normalizeResponse(req('children'),{},-1).status,'invalid');
});

test('HTTP and transport failures are errors, not empty-tree evidence',()=>{
 for(const kind of ['http','network','timeout','aborted','malformed','unexpected']){
  const r=plain(T.failure(kind));
  assert.equal(r.status,'error');
  assert.equal(r.pages,null);
  assert.equal(r.observedAt,null);
  assert.equal(r.reason,kind==='unexpected'?'unknown':kind);
 }
});

test('parse is side-effect free and has no HTTP/DOM calls',()=>{
 assert.equal(/\bfetch\s*\(|\bXMLHttpRequest\b|\bGM_xmlhttpRequest\b/.test(code),false);
 const src=wrap(page(1,[item('sm1')]),page(2,[item('sm2',{title:'<b>plain string</b>'})]));
 const before=JSON.stringify(src);
 const r=plain(T.normalizeResponse(req(),src,at));
 assert.equal(r.pages.children.contents[0].title,'<b>plain string</b>');
 assert.equal(JSON.stringify(src),before);
});


test('incoherent returned count versus declared total invalidates a page',()=>{
 const cases=[
  [req('children',0,2),page(0,[item('sm1')])],
  [req('children',10,2),page(10,[item('sm1')])],
  [req('children',9,2),page(10,[item('sm1'),item('sm2')])]
 ];
 for(const [request,side] of cases){
  const result=plain(T.normalizeResponse(request,{data:{children:side}},at));
  assert.equal(result.status,'invalid',JSON.stringify({request,side}));
  assert.equal(result.pages,null);
 }
});

test('coherent final and sparse page boundaries keep independent flags',()=>{
 const final=plain(T.normalizeResponse(req('children',9,2),{data:{children:page(10,[item('sm1')])}},at));
 assert.equal(final.status,'ok');
 assert.deepEqual([final.pages.children.sparse,final.pages.children.observedLastWindow],[false,true]);
 const sparseFinal=plain(T.normalizeResponse(req('children',9,2),{data:{children:page(10,[])}},at));
 assert.equal(sparseFinal.status,'ok');
 assert.deepEqual([sparseFinal.pages.children.sparse,sparseFinal.pages.children.observedLastWindow],[true,true]);
 const sparseOpen=plain(T.normalizeResponse(req('children',2,2),{data:{children:page(10,[item('sm1')])}},at));
 assert.equal(sparseOpen.status,'ok');
 assert.deepEqual([sparseOpen.pages.children.sparse,sparseOpen.pages.children.observedLastWindow],[true,false]);
});
