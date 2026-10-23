import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [filter,loader,snapshot]=await Promise.all(['src/ng/candidate-filter.js','src/autofill/candidate-loader.js','src/autofill/snapshot-source.js'].map(read));
const quick=snapshot.slice(snapshot.indexOf('      var apiQuickNgReason ='),snapshot.indexOf('      var getMovieNgReasons ='));
const initialize=await read('src/autofill/initialize.js');
const restore=initialize.slice(initialize.indexOf('      var restorePrefilteredCandidates ='),initialize.indexOf('      model.movieViewModes.on'));
const validation=snapshot.slice(snapshot.indexOf('      var validateSnapshotAgainstCurrentDom ='));
function harness(initial=false,capacity=8){
 const config={ngMovies:{set:new Set()},ngTitles:{set:new Set()},ngTags:{set:new Set(['BLOCK'])},ngUserIds:{set:new Set([12])},ngChannelIds:{set:new Set()},
  autoFillMaxExtraPages:{value:0},autoFillEnabled:{value:true},advancedNgRulesEnabled:{value:false}};
 const rows=[{id:'sm1',title:'one',snapshotTags:['BLOCK']},{id:'sm2',title:'two'},{id:'sm3',title:'three',owner:{id:12}}].map(x=>({...x,__nrnSnapshot:true}));
 const result={items:initial?[{id:'sm10',title:'native'},...rows]:rows,offset:0,hasNextPage:false};
 const c={model:{config,movies:new Map()},page:{_disposed:false,_currentPageNumber:1,doc:{querySelectorAll:()=>[{getAttribute:()=>'sm10'}]}},
  performance,console:new Proxy({}, {get:()=>()=>{}}),LOG:'fixture',useSnapshot:true,requestedMode:'snapshot',snapshotValidated:!initial,
  snapshotOffset:0,snapshotValidationOffset:0,candidatePool:[],candidatePoolSeen:new Set(),lastFetchedHadNext:true,
  fetchedExtraPages:0,totalFetchedItems:0,totalApiPrefilteredNg:0,totalCheapPrefilteredNg:0,logCandidateTable(){},setPhase(){},
  snapshotFetchOffset:async()=>result,
  filterFreshItems(items){return {freshItems:items.filter(x=>{if(x.id==='sm10'||c.candidatePoolSeen.has(x.id))return false;c.candidatePoolSeen.add(x.id);return true;})};}};
 const context=vm.createContext(c);
 vm.runInContext(filter+';var candidateFilter=CandidateFilter.create(model.config,'+capacity+');'+quick+validation+loader,context);
 const listeners=new Map();
 for(const [key,setting] of Object.entries(config))setting.on=(_event,fn)=>listeners.set(key,fn);
 config.advancedNgRulesJson={on:(_event,fn)=>listeners.set('advancedNgRulesJson',fn)};
 Object.assign(context,{initialized:false,isMovieAlreadyOnPage:()=>false});
 vm.runInContext(restore,context);
 return {listeners,c:context,rows,config,run:()=>initial?context.validateSnapshotAgainstCurrentDom():context.fetchMoreCandidates(1)};
}
for(const initial of [false,true]) test('Snapshot NG release restores source order from '+(initial?'validation reuse':'later fetch'),async()=>{
 const h=harness(initial);await h.run();
 assert.deepEqual(Array.from(h.c.candidatePool,x=>x.id),['sm2']);
 assert.equal(h.c.candidateFilter.snapshot().retained,2,'quick NG candidates must remain available for re-evaluation');
 h.config.ngTags.set.clear();h.config.ngUserIds.set.clear();
 assert.deepEqual(Array.from(h.c.candidateFilter.sort([...h.c.candidatePool,...h.c.candidateFilter.release()]),x=>x.id),['sm1','sm2','sm3']);
 assert.equal(h.c.candidatePoolSeen.size,3,'release does not require another source fetch');
});
test('Snapshot retention capacity falls back to evaluation instead of losing candidates',async()=>{
 const h=harness(false,1);await h.run();
 assert.deepEqual(Array.from(h.c.candidatePool,x=>x.id),['sm2','sm3']);
 assert.equal(h.c.candidateFilter.snapshot().retained,1);
});


test('Snapshot NG settings notify candidate restoration while disposed routes ignore changes',async()=>{
 const h=harness();await h.run();
 for(const key of ['ngTags','ngUserIds','ngChannelIds']) assert.equal(typeof h.listeners.get(key),'function',key);
 h.config.ngTags.set.clear();h.listeners.get('ngTags')();
 assert.deepEqual(Array.from(h.c.candidatePool,x=>x.id),['sm1','sm2']);
 h.c.page._disposed=true;h.config.ngUserIds.set.clear();h.listeners.get('ngUserIds')();
 assert.deepEqual(Array.from(h.c.candidatePool,x=>x.id),['sm1','sm2'],'disposed route is not revived');
});
