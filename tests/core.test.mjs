import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { baseline } from '../scripts/build.mjs';

// Execute the unchanged browser prefix only; never run Main or a DOM/API request.
async function load(path) {
  const text = await readFile(path, 'utf8');
  const marker = '  var ThumbInfo = (function(_super) {';
  assert.equal(text.split(marker).length, 2);
  return vm.runInNewContext(text.slice(0, text.indexOf(marker)) +
    'return {EventEmitter, Listeners, ArrayStore, Store, Config}; })()', {}, { timeout: 1000 });
}
const plain = value => JSON.parse(JSON.stringify(value));
const paths = [baseline];
if (process.env.NRN_TEST_GENERATED) paths.push(new URL('../dist/nico-nico-ranking-ng-v14.1-performance-pager-fix (2).user.js', import.meta.url));

for (const [index, path] of paths.entries()) {
  const label = index ? 'generated' : 'v14.1';
  test(`${label}: Config complete defaults, keys, sync order and transient setting`, async () => {
    const {Config}=await load(path);
    const defaults={visitedMovieViewMode:'reduce',visibleContributorType:'all',openNewWindow:true,
      useGetThumbInfo:true,movieInfoTogglable:true,descriptionTogglable:true,
      visitedMovies:'[]',ngMovies:'[]',ngTitles:'[]',ngTags:'[]',ngLockedTags:'[]',
      ngUserIds:'[]',ngUserNames:'[]',ngChannelIds:'[]',addToNgLockedTags:false,
      unknownContributorMovieVisible:true,ngLockedTagCountEnabled:false,ngLockedTagCountThreshold:5,
      advancedNgRulesEnabled:false,advancedNgRulesJson:'[]',autoFillEnabled:false,autoFillTargetCount:36,
      autoFillMaxExtraPages:5,autoFillInfoMode:'legacy',autoFillAdMode:'visible',selfAdWarningEnabled:false,
      thumbInfoConcurrency:12,developerMode:false,statusPanelMode:'compact',detailUiTheme:'auto',
      autoFillDetailBatchMax:48,spaNavigationFix:true,autoFillPagerMode:'compactSkip',
      sessionDetailCacheEnabled:false,statusAnimationEnabled:true,developerDiagnosticMode:'light',
      pagerPreviewCount:2,sessionDetailCacheTtlMinutes:360,sessionDetailCacheMaxEntries:1500};
    const reads=[], writes=[];
    const config=new Config((k,d)=>{reads.push([k,d]);return d;},(k,v)=>writes.push([k,v]));
    assert.deepEqual(Object.keys(config).sort(),[...Object.keys(defaults),'ngMovieVisible'].sort());
    for(const [key,value] of Object.entries(defaults)) {
      assert.equal(config[key].key,key);
      if ('defaultValue' in config[key]) assert.equal(config[key].value,value);
      else assert.deepEqual(plain(config[key].array),[]);
    }
    assert.deepEqual(Object.keys(defaults).filter(k=>config[k].caseInsensitive),['ngTitles','ngTags','ngLockedTags','ngUserNames']);
    config.ngMovieVisible.value=true;
    await config.sync();
    assert.deepEqual(reads,Object.entries(defaults));
    assert.deepEqual(writes,[]);
    assert.equal(config.ngMovieVisible.value,true);
    assert.equal(new Config(()=>{},()=>{}).ngMovieVisible.value,false);
  });
  test(`${label}: Config restores stored values without writes or change events`, async () => {
    const {Config}=await load(path);
    const saved=new Map([['autoFillTargetCount',60],['autoFillEnabled',true],
      ['ngUserIds','["12.9"]'],['advancedNgRulesJson','[{"conditions":[]}]']]);
    const writes=[], events=[];
    const config=new Config(async(k,d)=>saved.has(k)?saved.get(k):d,(k,v)=>writes.push([k,v]));
    for(const key of Object.keys(config)) config[key].on('changed',()=>events.push(key));
    await config.sync();
    assert.equal(config.autoFillTargetCount.value,60);
    assert.equal(config.autoFillEnabled.value,true);
    assert.deepEqual(plain(config.ngUserIds.array),[12]);
    assert.equal(config.advancedNgRulesJson.value,'[{"conditions":[]}]');
    assert.deepEqual(writes,[]); assert.deepEqual(events,[]);
    const broken=new Config(async(k,d)=>{if(k==='ngMovies')throw new Error('storage unavailable');return d;},()=>{});
    await assert.rejects(broken.sync(),/storage unavailable/);
  });
  test(`${label}: listener order, deduplication, unbind and thrown errors`, async () => {
    const {EventEmitter, Listeners} = await load(path);
    const emitter = new EventEmitter();
    const trace = [];
    const a = value => trace.push(['a', value]);
    const b = value => trace.push(['b', value]);
    assert.equal(emitter.on('x', a).on('x', a), emitter);
    const group = new Listeners({x:b});
    group.bind(emitter);
    emitter.emit('x', 1);
    group.unbind(); group.unbind();
    emitter.emit('x', 2);
    emitter.off('missing', a);
    emitter.off('x', a);
    emitter.emit('x', 3);
    assert.deepEqual(trace, [['a',1],['b',1],['a',2]]);
    emitter.on('fail', () => { throw new Error('listener failure'); });
    emitter.on('fail', () => trace.push('unexpected'));
    assert.throws(() => emitter.emit('fail'), /listener failure/);
    assert.equal(trace.length, 3);
  });
  test(`${label}: Store preserves key, default, write-before-event and silent sync`, async () => {
    const {Store} = await load(path);
    const trace = [];
    const store = new Store(async (key, def) => {trace.push(['read',key,def]); return 7;},
      (key,value) => trace.push(['write',key,value]), 'setting', 3);
    store.on('changed', value => trace.push(['event',value]));
    assert.equal(store.value,3);
    store.value=3; store.value=4;
    await store.sync();
    assert.equal(store.value,7);
    assert.deepEqual(trace,[['write','setting',4],['event',4],['read','setting',3]]);
  });
  test(`${label}: ArrayStore normalizes IDs and text, preserves bulk duplicate behavior`, async () => {
    const {ArrayStore} = await load(path);
    const trace=[];
    const store = new ArrayStore(async () => '["12.9",{"value":"13","text":"name"}]',
      (key,value) => trace.push(['write',key,value]), 'ngUserIds');
    store.on('changed', values => trace.push(['event',[...values]]));
    await store.sync();
    assert.deepEqual(plain(store.array),[12,13]);
    assert.equal(store.add('12'),false);
    assert.equal(store.add('14','fourteen'),true);
    assert.deepEqual(trace.slice(0,2),[['write','ngUserIds','[12,{"value":13,"text":"name"},{"value":14,"text":"fourteen"}]'],['event',[12,13,14]]]);
    assert.equal(store.remove(['13']),true);
    assert.equal(store.remove([999]),false);
    store.clear(); const count=trace.length; store.clear(); assert.equal(trace.length,count);
    const titles=new ArrayStore(async()=> '[]',()=>{},'ngTitles',true);
    titles.add('china'); assert.equal(titles.add('CHINA'),false);
    titles.addAll(['other','other']);
    assert.deepEqual(plain(titles.array),['CHINA','other','other']);
    assert.deepEqual([...titles.set],['CHINA','OTHER']);
  });
  test(`${label}: queued mutations survive rejected read and preserve persistence`, async () => {
    const {ArrayStore} = await load(path);
    let saved='[]', fail=true;
    const writes=[];
    const store=new ArrayStore(async()=>{if(fail){fail=false;throw new Error('read failed');}return saved;},
      (key,value)=>{saved=value; writes.push([key,value]);},'ngUserIds');
    await assert.rejects(store.addAsync(1),/read failed/);
    assert.deepEqual(await Promise.all([store.addAsync('2'),store.addAsync(3),store.removeAsync([2])]),[true,true,true]);
    assert.equal(saved,'[3]');
    assert.equal(writes.length,6); // v14.1 writes both in mutation and async wrapper.
    assert.deepEqual(plain(await store.verifyPersisted('3')),{present:true,storedCount:1,storedValueType:'number'});
    const invalid=new ArrayStore(async()=>'{',()=>{},'ngMovies');
    await assert.rejects(invalid.sync());
  });
  test(`${label}: Config CSV round trip retains seven types, quoting and numeric IDs`, async () => {
    const {Config}=await load(path);
    const values=new Map();
    const config=new Config(async(k,d)=>values.has(k)?values.get(k):d,(k,v)=>values.set(k,v));
    await config.sync();
    config.ngMovies.add('sm1','a,"b"'); config.ngTitles.add('中国'); config.ngTags.add('tag');
    config.ngUserIds.add('12.9','user'); config.ngUserNames.add('name');
    config.ngChannelIds.add('13','channel'); config.visitedMovies.add('sm2');
    const targets={ngMovieId:true,ngTitle:true,ngTag:true,ngUserId:true,ngUserName:true,ngChannelId:true,visitedMovieId:true};
    const csv=await config.toCSV(targets);
    assert.equal(csv,'ngMovieId,sm1,"a,""b"""\nngTitle,中国,\nngTag,TAG,\nngUserId,12,user\nngUserName,NAME,\nngChannelId,13,channel\nvisitedMovieId,sm2,');
    const restoredValues=new Map();
    const restored=new Config(async(k,d)=>restoredValues.has(k)?restoredValues.get(k):d,(k,v)=>restoredValues.set(k,v));
    await restored.addFromCSV(csv);
    assert.equal(await restored.toCSV(targets),csv);
  });
}
