import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../src/diagnostics/site-health.js', import.meta.url), 'utf8');
const ctx = {setTimeout, clearTimeout, console, NRN_VERSION:'test', location:{pathname:'/tag/x'}};
ctx.globalThis = ctx;
vm.runInNewContext(source + ';globalThis.H=SiteHealth', ctx);
const H0 = ctx.H, plain = v => JSON.parse(JSON.stringify(v));
const H = {...H0, evaluate: i => plain(H0.evaluate(i))};
const healthy = {routeKind:'tag', contentRoot:true, watchLinks:64, nativeRoots:32, parsedNative:32, parsedTotal:32, unreadLinks:0,
  initialPageData:{checked:true, items:32}, network:{detail:{ok:30}, page:null}, problemCounts:{startup:0, routeSetup:0}};
const ids = input => H.evaluate(input).map(p => p.id);

test('a healthy page reports nothing', () => { assert.deepEqual(ids(healthy), []); });
test('an empty result page (0 hits) reports nothing', () => {
  assert.deepEqual(ids({...healthy, watchLinks:0, nativeRoots:0, parsedNative:0, parsedTotal:0, initialPageData:{checked:true, items:0}}), []);
});
test('cards present but none parsed -> cards (site change)', () => {
  const p = H.evaluate({...healthy, parsedNative:0, parsedTotal:0});
  assert.deepEqual(p.map(x => x.id), ['cards']); assert.equal(p[0].siteChange, true);
});
test('watch links without any known card markup -> cards', () => {
  assert.deepEqual(ids({...healthy, nativeRoots:0, parsedNative:0, parsedTotal:0, initialPageData:null}), ['cards']);
});
test('under 80% of native cards parsed -> partialCards', () => {
  assert.deepEqual(ids({...healthy, parsedNative:20, parsedTotal:20}), ['partialCards']);
  assert.deepEqual(ids({...healthy, parsedNative:26, parsedTotal:26}), []);
});
test('modern cards without the content landmark -> contentRoot', () => {
  assert.deepEqual(ids({...healthy, contentRoot:false}), ['contentRoot']);
});
test('many watch links outside every card -> unreadLinks', () => {
  assert.deepEqual(ids({...healthy, unreadLinks:5}), ['unreadLinks']);
  assert.deepEqual(ids({...healthy, unreadLinks:4}), []);
});
test('initial search data unreadable while cards exist -> pageData; SPA routes are not checked', () => {
  assert.deepEqual(ids({...healthy, initialPageData:{checked:true, items:0}}), ['pageData']);
  assert.deepEqual(ids({...healthy, initialPageData:null}), []);
});
test('mostly malformed detail / page responses -> detailApi / pageApi, only after enough requests', () => {
  assert.deepEqual(ids({...healthy, network:{detail:{ok:2, invalid:4}}}), ['detailApi']);
  assert.deepEqual(ids({...healthy, network:{detail:{ok:0, invalid:3}}}), [], 'too few requests');
  assert.deepEqual(ids({...healthy, network:{detail:{ok:30}, page:{ok:1, invalid:5}}}), ['pageApi']);
});
test('connection failures are reported as network, not as a site change', () => {
  const p = H.evaluate({...healthy, network:{detail:{ok:2, timeout:3, http:2}}});
  assert.deepEqual(p.map(x => x.id), ['network']); assert.equal(p[0].siteChange, false);
});
test('startup exceptions are reported', () => {
  assert.deepEqual(ids({...healthy, problemCounts:{startup:1, routeSetup:0}}), ['startup']);
});
test('report text has no URLs, video IDs or names', () => {
  const text = H.reportText({...healthy, parsedNative:0, parsedTotal:0}, H.evaluate({...healthy, parsedNative:0, parsedTotal:0}));
  const json = JSON.parse(text);
  assert.equal(json.format, 'NRN-HEALTH-1'); assert.deepEqual(json.problems.map(p => p.id), ['cards']);
  assert.doesNotMatch(text, /https?:|\/watch\/|sm\d{3,}/);
});
