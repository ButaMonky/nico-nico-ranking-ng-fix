import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source=await readFile(output,'utf8');
const end=source.indexOf('  var MovieViewMode = (function(_super) {');
const {Movie,Config,Movies,ThumbInfoListener,OwnerEvidence,AdvancedNgRules}=vm.runInNewContext(source.slice(0,end)+'return {Movie,Config,Movies,ThumbInfoListener,OwnerEvidence,AdvancedNgRules}; })()',{URL});
async function setup(){
 const config=new Config((key,fallback)=>fallback,()=>{}); await config.sync();
 const movies=new Movies(config);movies.setIfAbsent([new Movie('sm1','first'),new Movie('sm2','second')]);
 return {config,movies,search:ThumbInfoListener.forSearch(movies),detail:ThumbInfoListener.forCompleted(movies)};
}
const info=(id,contributor={type:'unknown',id:-1,name:''})=>({id,contributor,tags:[],description:''});
test('search-only ID participates in ordinary and compound NG; unknown detail cannot erase it',async()=>{
 const {config,movies,search,detail}=await setup();config.ngUserIds.add(12345);
 search('sm1',{type:'user',id:'12345',name:'(投稿者非公開)'});
 const m=movies.get('sm1');assert.equal(m.ng,true);assert.equal(m.thumbInfoDone,false);
 const raw=info('sm1');detail(raw);
 assert.equal(m.contributor.id,12345);assert.equal(m._nrnContributorSource,'search');assert.equal(m.thumbInfoDone,true);
 assert.equal(raw.contributor.type,'unknown','cached raw API payload stays untouched');
 assert.equal(AdvancedNgRules.evaluateNode(m,{kind:'condition',field:'userId',operator:'eq',value:12345}),true);
 assert.equal(movies.get('sm2').contributor.type,'unknown','other videos do not inherit evidence');
 config.ngUserIds.remove([12345]);assert.equal(m.ng,false);
 config.ngUserIds.add(12345);assert.equal(m.ng,true,'live store updates still propagate');
});
test('actual detail ID takes priority; conflicting search rows are undecided',async()=>{
 const {movies,search,detail}=await setup();
 search('sm1',{type:'user',id:10,name:'first'});search('sm1',{type:'user',id:20,name:'other'});
 assert.equal(movies.get('sm1').contributor.type,'unknown');
 search('sm1',{type:'user',id:10,name:'retry'});assert.equal(movies.get('sm1').contributor.type,'unknown');
 detail(info('sm1',{type:'user',id:30,name:'confirmed'}));assert.equal(movies.get('sm1').contributor.id,30);
 detail(info('sm1'));assert.equal(movies.get('sm1').contributor.id,30,'known ID is not overwritten by missing metadata');
 search('sm2',{type:'user',id:40,name:''});detail(info('sm2',{type:'user',id:40,name:'confirmed name'}));
 assert.equal(movies.get('sm2').contributor.name,'confirmed name','early blank name does not poison contributor cache');
});
test('missing IDs and untrusted profile URLs never become identities; channel/user stay separate',async()=>{
 for(const id of ['',0,-1,'abc','1e3','12.5','9007199254740993']) assert.equal(OwnerEvidence.normalize({id}),null);
 for(const url of ['https://evil.test/user/12','javascript:alert(1)','https://www.nicovideo.jp/user/12/videos','https://user:pass@www.nicovideo.jp/user/12']) assert.equal(OwnerEvidence.fromUrl(url),null);
 assert.equal(OwnerEvidence.fromUrl('https://www.nicovideo.jp/user/12').type,'user');
 assert.equal(OwnerEvidence.fromUrl('https://ch.nicovideo.jp/channel/ch12').type,'channel');
 const {config,movies,search}=await setup();config.ngUserIds.add(12);
 search('sm1',{type:'channel',id:'ch12',name:'channel'});assert.equal(movies.get('sm1').ng,false);
 config.ngChannelIds.add(12);assert.equal(movies.get('sm1').ng,true);
});
test('same cached unknown payload uses only current route evidence',async()=>{
 const first=await setup(),second=await setup();const cached=info('sm1');
 first.search('sm1',{type:'user',id:55,name:'owner'});first.detail(cached);second.detail(cached);
 assert.equal(first.movies.get('sm1').contributor.id,55);assert.equal(second.movies.get('sm1').contributor.type,'unknown');
});

test('persistent detail cache does not promote search evidence into authoritative metadata',async()=>{
 const {movies,config,search,detail}=await setup();config.sessionDetailCacheEnabled.value=true;
 search('sm1',{type:'user',id:55,name:'search owner'});detail(info('sm1'));
 const written=[];const ctx=vm.createContext({model:{movies,config},cacheKeyForMovie:id=>id,getMovieNgReasons:()=>[],detailCache:{set:(key,payload)=>written.push(payload)},cacheWrites:0});
 const begin=source.indexOf('      var cacheMovieAfterCheck = function(id) {'),end=source.indexOf('      var logCacheCandidateAudit',begin);
 const save=vm.runInContext(source.slice(begin,end)+';cacheMovieAfterCheck',ctx);
 save('sm1');assert.equal(written[0].contributor,null);
 detail(info('sm1',{type:'user',id:66,name:'API owner'}));save('sm1');assert.equal(written[1].contributor.id,66);
});

test('repeated search evidence is idempotent and a late name can fill an empty one',async()=>{
 const {movies,search,detail}=await setup();const movie=movies.get('sm1');let changes=0;
 movie.on('contributorChanged',()=>changes++);
 detail(info('sm1'));
 search('sm1',{type:'user',id:55,name:''});const afterFirst=changes;
 for(let i=0;i<100;i++)search('sm1',{type:'user',id:55,name:''});
 assert.equal(changes,afterFirst);
 search('sm1',{type:'user',id:55,name:'late name'});
 assert.equal(movie.contributor.name,'late name');assert.equal(changes,afterFirst+1);
 search('sm1',{type:'user',id:55,name:'late name'});assert.equal(changes,afterFirst+1);
});
