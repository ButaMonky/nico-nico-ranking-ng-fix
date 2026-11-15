import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const source = await readFile(new URL('../src/ng/verdict-cache.js', import.meta.url), 'utf8');
const load = (extra = {}) => {
  const ctx = {setTimeout, clearTimeout, console, location:{pathname:'/tag/x'}, ...extra};
  ctx.globalThis = ctx;
  vm.runInNewContext(source + ';globalThis.C=NgVerdictCache', ctx);
  return ctx.C;
};
// Minimal stand-ins for the Store/ArrayStore/EventEmitter contracts used.
const emitter = () => { const m = new Map(); return {on(n,f){(m.get(n)||m.set(n,new Set()).get(n)).add(f);return this}, off(n,f){m.get(n)?.delete(f)}, emit(n){for(const f of m.get(n)||[])f()}}; };
const store = value => Object.assign(emitter(), {value, set(v){this.value=v;this.emit('changed')}});
const list = (...values) => Object.assign(emitter(), {array:values, set(v){this.array=v;this.emit('changed')}});
const config = (o = {}) => ({
  ngUserIds:list(...(o.userIds||[])), ngChannelIds:list(), ngUserNames:list(), ngTags:list(...(o.tags||[])),
  ngLockedTags:list(), ngLockedTagCountEnabled:store(false), ngLockedTagCountThreshold:store(5),
  advancedNgRulesEnabled:store(false), advancedNgRulesJson:store('[]'), ngMovieVisible:store(false),
  ngVerdictCacheEnabled:store(o.enabled ?? true), useGetThumbInfo:store(true),
});
const movie = (id, o = {}) => Object.assign(emitter(), {id, ng:false, metadataSettled:false, tags:[], contributor:{}, ...o});
const memoryGM = (init = {}) => { const m = new Map(Object.entries(init)); return {m, get:(k,d)=>m.has(k)?m.get(k):d, set:(k,v)=>m.set(k,v)}; };
const fakeDoc = () => ({querySelectorAll:()=>[]});

test('reason picks owner, name, tag, locked tag, lock count and rule; skips id/title-only NG', () => {
  const C = load(), cfg = config();
  assert.equal(C.reasonOf(movie('sm1',{ng:true,contributor:{ngId:true,id:123}}),cfg),'u:123');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,contributor:{ngName:'abc'}}),cfg),'n:ABC');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,tags:[{name:'x',ngByNormal:false},{name:'Foo',ngByNormal:true}]}),cfg),'t:FOO');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,tags:[{name:'Bar',ngByLock:true}]}),cfg),'l:BAR');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,ngByLockedTagCount:true}),cfg),'k:5');
  assert.match(C.reasonOf(movie('sm1',{ng:true,ngByAdvancedRule:true}),cfg),/^r:/);
  assert.equal(C.reasonOf(movie('sm1',{ng:true,ngId:true}),cfg),null);
  assert.equal(C.reasonOf(movie('sm1',{ng:false,contributor:{ngId:true,id:1}}),cfg),null);
});

test('reasons are valid only while the setting that produced them remains', () => {
  const C = load();
  const idx = C.indexFromConfig(config({userIds:[123], tags:['FOO']}));
  assert.equal(C.valid('u:123',idx),true);
  assert.equal(C.valid('u:124',idx),false);
  assert.equal(C.valid('t:FOO',idx),true);
  assert.equal(C.valid('t:BAR',idx),false);
  assert.equal(C.valid('k:5',idx),false, 'lock count disabled');
  assert.equal(C.valid('x:1',idx),false);
  assert.equal(C.valid('garbage',idx),false);
  const raw = C.indexFromRaw((k,d)=>({ngTags:'["foo",{"value":"Bar","text":"x"}]', ngUserIds:'[123]'})[k] ?? d);
  assert.equal(C.valid('t:FOO',raw),true); assert.equal(C.valid('t:BAR',raw),true); assert.equal(C.valid('u:123',raw),true);
});

test('parse drops malformed rows; prune enforces TTL and size', () => {
  const C = load(), now = Date.now();
  const m = C.parse(JSON.stringify({sm1:['t:A',now], bad:['t:A',now], sm2:['t:A','x'], sm3:[1,now]}));
  assert.deepEqual([...m.keys()],['sm1']);
  assert.equal(C.parse('{not json').size,0);
  const old = new Map([['sm1',['t:A',now - C.TTL_MS - 1]],['sm2',['t:A',now]]]);
  assert.deepEqual([...C.prune(old,now).keys()],['sm2']);
  const big = new Map(Array.from({length:C.MAX_ENTRIES+5},(_,i)=>['sm'+i,['t:A',now-i]]));
  const pruned = C.prune(big,now);
  assert.equal(pruned.size,C.MAX_ENTRIES); assert.ok(pruned.has('sm0')); assert.ok(!pruned.has('sm'+(C.MAX_ENTRIES+4)));
});

test('track learns a settled NG, persists it, and the AutoFill prefilter then uses it', async () => {
  const C = load(), cfg = config({tags:['FOO']}), gm = memoryGM();
  C.attach(cfg, gm.get, gm.set, fakeDoc());
  const m = movie('sm10');
  C.track(m, cfg, fakeDoc());
  assert.equal(C.size,0);
  Object.assign(m,{ng:true, metadataSettled:true, tags:[{name:'foo',ngByNormal:true}]}); m.emit('metadataChanged');
  assert.equal(C.size,1);
  assert.equal(C.candidateReason('sm10',cfg),'verdictCache');
  await new Promise(r=>setTimeout(r,1700));
  assert.deepEqual(Object.keys(JSON.parse(gm.m.get('ngVerdictCache'))),['sm10']);
  // Removing the NG tag invalidates the cached reason immediately.
  cfg.ngTags.set([]);
  assert.equal(C.candidateReason('sm10',cfg),null);
  cfg.ngVerdictCacheEnabled.value = false;
  assert.equal(C.candidateReason('sm10',cfg),null);
});

test('track forgets an entry when the confirmed verdict is not NG', async () => {
  const now = Date.now(), gm = memoryGM({ngVerdictCache:JSON.stringify({sm20:['t:FOO',now]})});
  const C = load(), cfg = config({tags:['FOO']});
  C.attach(cfg, gm.get, gm.set, fakeDoc());
  // Seed the in-memory entries as the early path would.
  C.installEarly(gm.get, {createElement:()=>({}), documentElement:{appendChild(){}}, head:null, body:null});
  assert.equal(C.size,1);
  const m = movie('sm20', {metadataSettled:true, ng:false});
  C.track(m, cfg, fakeDoc());
  assert.equal(C.size,0);
  await new Promise(r=>setTimeout(r,1700));
  assert.deepEqual(JSON.parse(gm.m.get('ngVerdictCache')),{});
});

test('persist merges entries saved by other tabs instead of overwriting them', async () => {
  const now = Date.now(), gm = memoryGM();
  const C = load(), cfg = config({tags:['FOO']});
  C.attach(cfg, gm.get, gm.set, fakeDoc());
  const m = movie('sm30',{ng:true,metadataSettled:true,tags:[{name:'foo',ngByNormal:true}]});
  C.track(m, cfg, fakeDoc());
  gm.set('ngVerdictCache', JSON.stringify({sm31:['t:FOO',now]})); // another tab
  await new Promise(r=>setTimeout(r,1700));
  assert.deepEqual(Object.keys(JSON.parse(gm.m.get('ngVerdictCache'))).sort(),['sm30','sm31']);
});

const jsdom = (() => { try { return createRequire(import.meta.url)(process.env.NRN_JSDOM || 'jsdom') } catch { return null } })();
test('early hider marks cached NG cards before paint and releases them on settle/disable', {skip: !jsdom && 'jsdom not installed (set NRN_JSDOM)'}, async () => {
  const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'https://www.nicovideo.jp/tag/x'});
  const {window} = dom, doc = window.document, now = Date.now();
  const gm = memoryGM({ngVerdictCache:JSON.stringify({sm1:['t:FOO',now], sm2:['t:GONE',now]}), ngTags:'["foo"]'});
  const C = load({MutationObserver:window.MutationObserver, location:window.location});
  assert.equal(C.installEarly(gm.get, doc), true);
  doc.body.innerHTML = '<div data-decoration-video-id="sm1" data-anchor-area="main"><a>x</a></div>'
    + '<div data-decoration-video-id="sm2" data-anchor-area="main"></div><div data-decoration-video-id="sm3"></div>';
  await new Promise(r=>setTimeout(r,0));
  const attr = id => doc.querySelector(`[data-decoration-video-id="${id}"]`).hasAttribute('data-nrn-prehide');
  assert.equal(attr('sm1'),true, 'valid cached reason is hidden');
  assert.equal(attr('sm2'),false, 'reason no longer in settings is not hidden');
  assert.equal(attr('sm3'),false);
  assert.ok(doc.getElementById('nrn-verdict-cache-style'));
  const cfg = config({tags:['FOO']});
  C.attach(cfg, gm.get, gm.set, doc);
  // Confirmed NG: prehide released, normal nrn-hide takes over.
  const m = movie('sm1',{ng:true,metadataSettled:true,tags:[{name:'foo',ngByNormal:true}]});
  C.track(m, cfg, doc);
  assert.equal(attr('sm1'),false);
  // Showing NG movies stops the early hider for later inserts.
  doc.body.insertAdjacentHTML('beforeend','<div data-decoration-video-id="sm1" id="again"></div>');
  await new Promise(r=>setTimeout(r,0));
  assert.equal(doc.getElementById('again').hasAttribute('data-nrn-prehide'),true);
  cfg.ngMovieVisible.set(true);
  assert.equal(doc.getElementById('again').hasAttribute('data-nrn-prehide'),false);
  assert.equal(C.stats.earlyActive,false);
});
