import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const source = await readFile(new URL('../src/ng/verdict-cache.js', import.meta.url), 'utf8');
// Rule parsing stand-in with the AdvancedNgRules.parse contract (id, enabled, expression).
const AdvancedNgRules = {parse: json => JSON.parse(json || '[]').map((r, i) => ({id: r.id || 'rule-' + (i + 1), enabled: r.enabled !== false, expression: r.expression || null}))};
const load = (extra = {}) => {
  const ctx = {setTimeout, clearTimeout, console, AdvancedNgRules, location:{pathname:'/tag/x'}, ...extra};
  ctx.globalThis = ctx;
  vm.runInNewContext(source + ';globalThis.C=NgVerdictCache', ctx);
  return ctx.C;
};
const emitter = () => { const m = new Map(); return {on(n,f){(m.get(n)||m.set(n,new Set()).get(n)).add(f);return this}, off(n,f){m.get(n)?.delete(f)}, emit(n){for(const f of m.get(n)||[])f()}}; };
const store = value => Object.assign(emitter(), {value, set(v){this.value=v;this.emit('changed')}});
const list = (...values) => Object.assign(emitter(), {array:values, set(v){this.array=v;this.emit('changed')}});
const config = (o = {}) => ({
  ngMovies:list(...(o.movies||[])), ngTitles:list(...(o.titles||[])),
  ngUserIds:list(...(o.userIds||[])), ngChannelIds:list(), ngUserNames:list(), ngTags:list(...(o.tags||[])),
  ngLockedTags:list(), ngLockedTagCountEnabled:store(false), ngLockedTagCountThreshold:store(5),
  advancedNgRulesEnabled:store(Boolean(o.rules)), advancedNgRulesJson:store(o.rules || '[]'), ngMovieVisible:store(false),
  ngVerdictCacheEnabled:store(o.enabled ?? true), useGetThumbInfo:store(true),
});
const movie = (id, o = {}) => Object.assign(emitter(), {id, ng:false, metadataSettled:false, tags:[], contributor:{}, ...o});
const memoryGM = (init = {}) => { const m = new Map(Object.entries(init)); return {m, get:(k,d)=>m.has(k)?m.get(k):d, set:(k,v)=>m.set(k,v)}; };
const fakeDoc = () => ({querySelectorAll:()=>[]});
const stored = gm => JSON.parse(gm.m.get('ngVerdictCache')).b;
const settle = () => new Promise(r => setTimeout(r, 1700));
const v2 = b => JSON.stringify({v:2, b});

test('group key: owner, name, tag, locked tag, lock count, per-rule; id/title-only NG not stored', () => {
  const C = load();
  const rules = JSON.stringify([{id:'a', expression:{x:1}}, {id:'b', expression:{x:2}}]);
  const idx = C.indexFromConfig(config({rules}));
  assert.equal(C.reasonOf(movie('sm1',{ng:true,contributor:{ngId:true,id:123}}),idx),'u:123');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,contributor:{ngName:'abc'}}),idx),'n:ABC');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,tags:[{name:'x'},{name:'Foo',ngByNormal:true}]}),idx),'t:FOO');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,tags:[{name:'Bar',ngByLock:true}]}),idx),'l:BAR');
  assert.equal(C.reasonOf(movie('sm1',{ng:true,ngByLockedTagCount:true}),idx),null, 'lock count disabled');
  const ra = C.reasonOf(movie('sm1',{ng:true,ngByAdvancedRule:true,advancedRuleMatches:[{id:'a'}]}),idx);
  const rb = C.reasonOf(movie('sm1',{ng:true,ngByAdvancedRule:true,advancedRuleMatches:[{id:'b'}]}),idx);
  assert.match(ra,/^r:/); assert.notEqual(ra,rb);
  assert.equal(C.reasonOf(movie('sm1',{ng:true,ngId:true}),idx),null);
  assert.equal(C.reasonOf(movie('sm1',{ng:false,contributor:{ngId:true,id:1}}),idx),null);
});

test('groups are valid only while their setting remains; editing one rule leaves the other', () => {
  const C = load();
  const r1 = JSON.stringify([{id:'a', expression:{x:1}}, {id:'b', expression:{x:2}}]);
  const r2 = JSON.stringify([{id:'a', expression:{x:9}}, {id:'b', expression:{x:2}}]);
  const before = C.indexFromConfig(config({userIds:[123], tags:['FOO'], rules:r1}));
  const after = C.indexFromConfig(config({userIds:[123], tags:['FOO'], rules:r2}));
  const keyA = before.ruleIdToKey.get('a'), keyB = before.ruleIdToKey.get('b');
  assert.equal(C.valid('u:123',before),true); assert.equal(C.valid('u:124',before),false);
  assert.equal(C.valid('t:FOO',before),true); assert.equal(C.valid('t:BAR',before),false);
  assert.equal(C.valid(keyA,after),false, 'edited rule invalidated');
  assert.equal(C.valid(keyB,after),true, 'untouched rule kept');
  assert.equal(C.valid('garbage',before),false);
  const raw = C.indexFromRaw((k,d)=>({ngTags:'["foo",{"value":"Bar","text":"x"}]', ngUserIds:'[123]'})[k] ?? d);
  assert.equal(C.valid('t:FOO',raw),true); assert.equal(C.valid('t:BAR',raw),true); assert.equal(C.valid('u:123',raw),true);
});

test('storage is IDs only, grouped per setting; malformed input is ignored; cap trims the largest group oldest-first', () => {
  const C = load();
  const m = C.parse(v2({'t:A':'sm1 bad sm2', 'x':'sm3', 'u:1':5}));
  assert.deepEqual([...m.entries()].map(([k,v])=>[k,[...v]]),[['t:A',['sm1','sm2']]]);
  assert.equal(C.parse('{not json').size,0);
  assert.equal(C.parse(JSON.stringify({sm1:['t:A',1]})).size,0, 'old v1 format is not read');
  assert.equal(C.serialize(m),'{"v":2,"b":{"t:A":"sm1 sm2"}}');
  const big = new Map([['t:A',Array.from({length:8},(_,i)=>'sm'+i)],['t:B',['so1','so2']]]);
  C.enforceCap(big,6);
  assert.deepEqual([...big.get('t:A')],['sm4','sm5','sm6','sm7']); assert.deepEqual([...big.get('t:B')],['so1','so2']);
  assert.equal(C.MAX_ENTRIES,200000);
});

test('learns a settled NG into its group, persists it, and AutoFill uses it', async () => {
  const C = load(), cfg = config({tags:['FOO']}), gm = memoryGM();
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  const m = movie('sm10');
  C.track(m, cfg, fakeDoc());
  assert.equal(C.size,0);
  Object.assign(m,{ng:true, metadataSettled:true, tags:[{name:'foo',ngByNormal:true}]}); m.emit('metadataChanged');
  assert.equal(C.size,1);
  assert.equal(C.candidateReason('sm10',cfg),'verdictCache');
  await settle();
  assert.deepEqual(stored(gm),{'t:FOO':'sm10'});
  cfg.ngVerdictCacheEnabled.value = false;
  assert.equal(C.candidateReason('sm10',cfg),null);
});

test('removing an NG setting deletes that whole group from storage, other groups stay', async () => {
  const gm = memoryGM({ngVerdictCache:v2({'t:FOO':'sm1 sm2', 't:BAR':'sm3'})});
  const C = load(), cfg = config({tags:['FOO','BAR']});
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  assert.equal(C.size,3);
  cfg.ngTags.set(['BAR']);
  assert.equal(C.size,1);
  assert.equal(C.candidateReason('sm1',cfg),null);
  await settle();
  assert.deepEqual(stored(gm),{'t:BAR':'sm3'});
});

test('groups whose setting disappeared while away are deleted when settings load', async () => {
  const gm = memoryGM({ngVerdictCache:v2({'t:GONE':'sm1', 't:FOO':'sm2'})});
  const C = load(), cfg = config({tags:['FOO']});
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  assert.equal(C.size,1);
  await settle();
  assert.deepEqual(stored(gm),{'t:FOO':'sm2'});
});

test('a movie confirmed as not NG is removed from its group', async () => {
  const gm = memoryGM({ngVerdictCache:v2({'t:FOO':'sm20 sm21'})});
  const C = load(), cfg = config({tags:['FOO']});
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  C.track(movie('sm20',{metadataSettled:true, ng:false}), cfg, fakeDoc());
  assert.equal(C.size,1);
  await settle();
  assert.deepEqual(stored(gm),{'t:FOO':'sm21'});
});

test('persist merges other tabs per group instead of overwriting', async () => {
  const gm = memoryGM();
  const C = load(), cfg = config({tags:['FOO','BAR']});
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  C.track(movie('sm30',{ng:true,metadataSettled:true,tags:[{name:'foo',ngByNormal:true}]}), cfg, fakeDoc());
  gm.set('ngVerdictCache', v2({'t:FOO':'sm31', 't:BAR':'sm32'})); // another tab
  await settle();
  const b = stored(gm);
  assert.deepEqual(b['t:FOO'].split(' ').sort(),['sm30','sm31']); assert.equal(b['t:BAR'],'sm32');
});

const jsdom = (() => { try { return createRequire(import.meta.url)(process.env.NRN_JSDOM || 'jsdom') } catch { return null } })();
test('early hider marks cached NG cards before paint and releases them on settle / show-NG', {skip: !jsdom && 'jsdom not installed (set NRN_JSDOM)'}, async () => {
  const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'https://www.nicovideo.jp/ranking/genre/all'});
  const {window} = dom, doc = window.document;
  const gm = memoryGM({ngVerdictCache:v2({'t:FOO':'sm1', 't:GONE':'sm2'}), ngTags:'["foo"]'});
  const C = load({MutationObserver:window.MutationObserver, location:window.location});
  assert.equal(C.installEarly(gm.get, doc), true);
  doc.body.innerHTML = '<div data-decoration-video-id="sm1" data-anchor-area="main"><a>x</a></div>'
    + '<div data-decoration-video-id="sm2" data-anchor-area="main"></div><div data-decoration-video-id="sm3"></div>';
  await new Promise(r=>setTimeout(r,0));
  const attr = id => doc.querySelector(`[data-decoration-video-id="${id}"]`).hasAttribute('data-nrn-prehide');
  assert.equal(attr('sm1'),true, 'valid group is hidden');
  assert.equal(attr('sm2'),false, 'group whose setting is gone is not hidden');
  assert.equal(attr('sm3'),false);
  const cfg = config({tags:['FOO']});
  await C.attach(cfg, gm.get, gm.set, doc).ready;
  C.track(movie('sm1',{ng:true,metadataSettled:true,tags:[{name:'foo',ngByNormal:true}]}), cfg, doc);
  assert.equal(attr('sm1'),false, 'confirmed: normal nrn-hide takes over');
  doc.body.insertAdjacentHTML('beforeend','<div data-decoration-video-id="sm1" id="again"></div>');
  await new Promise(r=>setTimeout(r,0));
  assert.equal(doc.getElementById('again').hasAttribute('data-nrn-prehide'),true);
  cfg.ngMovieVisible.set(true);
  assert.equal(doc.getElementById('again').hasAttribute('data-nrn-prehide'),false);
  assert.equal(C.stats.earlyActive,false);
});

test('NG is learned as soon as the movie is NG, without waiting to settle', async () => {
  const C = load(), cfg = config({tags:['FOO']}), gm = memoryGM();
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  const m = movie('sm40');
  C.track(m, cfg, fakeDoc());
  Object.assign(m, {ng:true, metadataSettled:false, tags:[{name:'foo', ngByNormal:true}]}); m.emit('ngChanged');
  assert.equal(C.size, 1);
});

test('early hider hides by NG video ID, owner link and title from markup alone (no memory)', {skip: !jsdom && 'jsdom not installed (set NRN_JSDOM)'}, async () => {
  const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'https://www.nicovideo.jp/tag/x'});
  const {window} = dom, doc = window.document;
  const gm = memoryGM({ngMovies:'["sm1"]', ngUserIds:'[777]', ngChannelIds:'[55]', ngTitles:'["ネタバレ"]'});
  const C = load({MutationObserver:window.MutationObserver, location:window.location});
  assert.equal(C.installEarly(gm.get, doc), true, 'installs with rules even when memory is empty');
  const card = (id, inner) => `<div data-decoration-video-id="${id}" data-anchor-area="main"><div class="pos_relative"><a href="/watch/${id}">thumb</a></div>${inner}</div>`;
  doc.body.innerHTML = card('sm1','<a href="/watch/sm1">t</a>') + card('sm2','<a href="/watch/sm2">t</a><a href="https://www.nicovideo.jp/user/777">u</a>')
    + card('sm3','<a href="/watch/sm3">t</a><a href="https://ch.nicovideo.jp/ch55">c</a>') + card('sm4','<a href="/watch/sm4">最新話ネタバレ注意</a>')
    + card('sm5','<a href="/watch/sm5">ok</a><a href="https://www.nicovideo.jp/user/1">u</a>') + card('sm6','<a href="/watch/sm6">late owner</a>');
  await new Promise(r => setTimeout(r, 0));
  const hidden = () => [...doc.querySelectorAll('[data-nrn-prehide]')].map(e => e.dataset.decorationVideoId);
  assert.deepEqual(hidden(), ['sm1','sm2','sm3','sm4']);
  // The owner row arrives after the card: the card is re-checked.
  doc.querySelector('[data-decoration-video-id="sm6"]').insertAdjacentHTML('beforeend','<a href="https://www.nicovideo.jp/user/777">u</a>');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(hidden(), ['sm1','sm2','sm3','sm4','sm6']);
});

test('settings listing: every remembered ID with its reason; forget removes from memory', async () => {
  const gm = memoryGM({ngVerdictCache:v2({'t:FOO':'sm1 sm2', 'u:9':'sm3'})});
  const C = load(), cfg = config({tags:['FOO'], userIds:[9]});
  await C.attach(cfg, gm.get, gm.set, fakeDoc()).ready;
  const rows = JSON.parse(JSON.stringify(C.entries()));
  assert.deepEqual(rows.map(r => r.id).sort(), ['sm1','sm2','sm3']);
  assert.equal(rows.find(r => r.id === 'sm3').label, '投稿者ID「9」');
  assert.equal(rows.find(r => r.id === 'sm1').label, 'タグ「FOO」');
  assert.equal(C.forget(['sm1', 'nope']), 1);
  assert.equal(C.size, 2);
  await settle();
  assert.deepEqual(stored(gm), {'t:FOO':'sm2', 'u:9':'sm3'});
});

test('early hider is installed with nothing known; IDs learned in this tab hide on the next page at once', {skip: !jsdom && 'jsdom not installed (set NRN_JSDOM)'}, async () => {
  const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'https://www.nicovideo.jp/tag/x'});
  const {window} = dom, doc = window.document;
  const gm = memoryGM({ngTags:'["foo"]'});
  const C = load({MutationObserver:window.MutationObserver, location:window.location});
  assert.equal(C.installEarly(gm.get, doc), true, 'installed even with empty memory and no markup rules');
  const cfg = config({tags:['FOO']});
  await C.attach(cfg, gm.get, gm.set, doc).ready;
  C.track(movie('sm50', {ng:true, metadataSettled:true, tags:[{name:'foo', ngByNormal:true}]}), cfg, doc);
  // Next page (SPA): the same video's card appears again.
  doc.body.innerHTML = '<div data-decoration-video-id="sm50" data-anchor-area="main"></div>';
  await new Promise(r => setTimeout(r, 0));
  assert.equal(doc.querySelector('[data-decoration-video-id="sm50"]').hasAttribute('data-nrn-prehide'), true);
});

test('a rule that depends on the current page or search is never remembered', () => {
  const ctxRules = {parse: AdvancedNgRules.parse, usesContext: e => JSON.stringify(e).includes('pageKind')};
  const C = load({AdvancedNgRules: ctxRules});
  const rules = JSON.stringify([{id:'scoped', expression:{kind:'group', children:[{field:'pageKind'}]}}, {id:'plain', expression:{x:1}}]);
  const idx = C.indexFromConfig(config({rules}));
  assert.equal(C.reasonOf(movie('sm1', {ng:true, ngByAdvancedRule:true, advancedRuleMatches:[{id:'scoped'}]}), idx), null);
  assert.match(C.reasonOf(movie('sm1', {ng:true, ngByAdvancedRule:true, advancedRuleMatches:[{id:'plain'}]}), idx), /^r:/);
});
