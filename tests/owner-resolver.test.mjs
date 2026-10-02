import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const boundary=source.indexOf('  var MovieViewMode = (function(_super) {');
const plain=value=>JSON.parse(JSON.stringify(value));
const condition=(field,operator='exists',value)=>({kind:'condition',field,operator,value});
async function setup(id='sm1'){
 const calls=[],context=vm.createContext({URL,queueMicrotask,console:{log(){}},GM_xmlhttpRequest:o=>{calls.push(o);return {abort(){}};},fetch:(...a)=>{calls.push(a);return new Promise(()=>{});}});
 const lib=vm.runInContext(source.slice(0,boundary)+'return {Movie,Movies,Config,ThumbInfoListener,OwnerEvidence,AdvancedNgRules,MetadataReadiness,OwnerResolver:typeof OwnerResolver==="undefined"?null:OwnerResolver}; })()',context);
 const config=new lib.Config((k,d)=>d,()=>{});await config.sync();
 const movies=new lib.Movies(config),movie=new lib.Movie(id,'synthetic');movies.setIfAbsent([movie]);
 const L=lib.ThumbInfoListener;
 return {...lib,config,movies,movie,calls,search:L.forSearch(movies),detail:L.forCompleted(movies),fail:L.forErrorOccurred(movies),supplement:L.forSupplement(movies),name:L.forOwnerName(movies)};
}
const user=(id,name=null,visibility=null)=>({type:'user',id,name,visibility});
test('owner resolver: priority is stated in one place, detail over search over supplement',async()=>{
 const {OwnerResolver:R}=await setup();assert.ok(R,'OwnerResolver is built into the userscript');
 assert.deepEqual(plain(R.priority),['detail','search','supplement']);
 let r=plain(R.select({videoId:'sm1',detail:user(1,null),search:user(1,'s','visible')}));
 assert.deepEqual([r.owner.id,r.owner.name,r.owner.visibility,r.identity,r.name,r.visibility,r.status],[1,'s','visible','detail','search','search','known']);
 r=plain(R.select({videoId:'sm1',detail:user(1,'d'),search:user(2,'s')}));
 assert.deepEqual([r.owner.id,r.owner.name,r.name],[1,'d','detail'],'a different search identity never mixes into detail');
 r=plain(R.select({videoId:'sm1',search:user(3,null),nameSupplement:user(3,'n')}));
 assert.deepEqual([r.owner.name,r.name,r.status],['n','nicoad','known']);
});
test('owner resolver: supplements only fill, never replace or contradict',async()=>{
 const {OwnerResolver:R}=await setup();
 let r=plain(R.select({videoId:'sm1',supplement:{owner:user(9,'x'),source:'nicoad',at:1}}));
 assert.deepEqual([r.owner.id,r.identity,r.name,r.status,r.conflict],[9,'nicoad','nicoad','supplemented',false]);
 r=plain(R.select({videoId:'sm1',search:user(5),supplement:{owner:user(6),source:'snapshot',at:1}}));
 assert.deepEqual([r.owner.id,r.identity,r.status,r.conflict],[5,'search','known',true]);
 r=plain(R.select({videoId:'sm1',search:user(5,null),supplement:{owner:user(5,'filled'),source:'snapshot',at:1}}));
 assert.deepEqual([r.owner.name,r.name,r.identity],['filled','snapshot','search']);
 for(const [videoId,owner,src] of [['so1',user(9),'nicoad'],['sm1',{type:'channel',id:9,name:null,visibility:null},'nicoad'],['sm1',user(9),'guess'],['lv1',user(9),'snapshot']])
  assert.equal(R.select({videoId,supplement:{owner,source:src,at:1}}).status,'unresolved',videoId+src);
});
test('owner resolver: missing only after a successful detail without owner; failures stay unresolved',async()=>{
 const h=await setup();assert.equal(h.movie.ownerResolution.status,'unresolved');
 h.fail({id:'sm1',error:{type:'NETWORK'}});assert.equal(h.movie.ownerResolution.status,'unresolved');
 const g=await setup();g.detail({id:'sm1',contributor:null,description:'',tags:[]});
 assert.equal(g.movie.ownerResolution.status,'missing');assert.equal(g.movie.metadata.ownerId,'unknown');
 assert.equal(g.AdvancedNgRules.evaluateNode(g.movie,condition('userId','notExists')),false,'missing owner is not proof of absence');
});
test('owner supplement entry: fills an unresolved user owner and feeds ID NG',async()=>{
 const h=await setup();h.config.ngUserIds.add(12);const at=Date.now()-1000;
 assert.equal(h.supplement('sm1',{type:'user',id:'12'},'nicoad',at),true);
 assert.equal(h.movie.contributor.id,12);assert.equal(h.movie.ng,true);assert.equal(h.movie.metadata.ownerId,'known');
 assert.deepEqual(plain(h.movie.ownerResolution),{status:'supplemented',source:'nicoad',conflict:false});
 assert.deepEqual({...h.MetadataReadiness.sourceOf(h.movie,'ownerId')},{source:'nicoad',observedAt:at});
 assert.equal(h.movie.metadata.ownerName,'unknown','an ID-only supplement does not invent a name');
 assert.equal(h.AdvancedNgRules.evaluateNode(h.movie,condition('userId','eq',12)),true);
 assert.equal(h.calls.length,0,'the entry point never communicates');
});
test('owner supplement entry: rejects channel, non sm/nm, future, conflicting and replacing inputs',async()=>{
 const h=await setup();
 assert.equal(h.supplement('sm1',{type:'channel',id:'ch5'},'nicoad'),false);
 assert.equal(h.supplement('sm1',{type:'user',id:5},'unknown-source'),false);
 assert.equal(h.supplement('sm1',{type:'user',id:5},'nicoad',Date.now()+60000),false);
 assert.equal(h.supplement('sm1',{type:'user',id:'0'},'nicoad'),false);
 const so=await setup('so1');assert.equal(so.supplement('so1',{type:'user',id:5},'nicoad'),false);
 h.search('sm1',user(7,'page'));assert.equal(h.supplement('sm1',{type:'user',id:8},'snapshot'),false,'contradicts page owner');
 assert.equal(h.movie.contributor.id,7);
 const s=await setup();s.supplement('sm1',{type:'user',id:5},'nicoad');
 assert.equal(s.supplement('sm1',{type:'user',id:6},'snapshot'),false,'a second different supplement is refused');
 s.search('sm1',user(4,'page'));assert.equal(s.movie.contributor.id,4,'page evidence outranks an earlier supplement');
 assert.equal(s.movie.ownerResolution.status,'known');assert.equal(s.movie.ownerResolution.conflict,true);
});
test('owner resolver: existing detail/search/nicoad-name behaviour is unchanged',async()=>{
 const h=await setup();h.search('sm1',user(12,null));
 assert.equal(h.name('sm1',{id:'sm1',ownerId:12,ownerName:' recovered '},Date.now()-1000),true);
 assert.equal(h.movie.contributor.name,'recovered');assert.equal(h.movie._nrnOwnerNameSource,'nicoad');assert.equal(h.movie._nrnContributorSource,'search');
 h.detail({id:'sm1',contributor:{type:'user',id:12,name:'detail'},description:'',tags:[]});
 assert.equal(h.movie.contributor.name,'detail');assert.equal(h.movie._nrnContributorSource,'detail');assert.equal(h.movie.ownerResolution.status,'known');
});
