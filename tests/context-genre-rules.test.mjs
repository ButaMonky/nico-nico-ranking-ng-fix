// BRUSH-074: page-context conditions (screen kind, current search) and genre.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';
const source = await readFile(output, 'utf8');
const end = source.indexOf('  var MovieViewMode = (function(_super) {');
const ctx = {location:{pathname:'/tag/%E6%B7%AB%E5%A4%A2', search:''}};
const {AdvancedNgRules} = vm.runInNewContext(source.slice(0, end) + 'return {AdvancedNgRules}; })()', ctx);
const cond = (field, operator, value, not = false) => ({kind:'condition', field, operator, value, not});
const group = (op, children, not = false) => ({kind:'group', op, children, not});
const plain = v => JSON.parse(JSON.stringify(v));
const video = o => ({id:'sm1', title:'中国で学ぶ', thumbInfoDone:true, error:{type:'NO_ERROR'}, tags:[{name:'ホモ', lock:true}], contributor:{type:'user', id:1, name:'x'}, ...o});

test('page context is read from the URL for every supported screen', () => {
  const pc = loc => plain(AdvancedNgRules.pageContext(loc));
  assert.deepEqual(pc({pathname:'/search/%E5%AE%9F%E6%B3%81'}), {kind:'search', text:'実況'});
  assert.deepEqual(pc({pathname:'/tag/abc'}), {kind:'tag', text:'abc'});
  assert.deepEqual(pc({pathname:'/tag_shorts/x'}), {kind:'shorts', text:'x'});
  assert.deepEqual(pc({pathname:'/search_shorts/y'}), {kind:'shorts', text:'y'});
  assert.deepEqual(pc({pathname:'/ranking/genre/4eet3ca4', search:'?term=hour&tag=%E3%81%9A'}), {kind:'ranking', text:'ず'});
  assert.deepEqual(pc({pathname:'/ranking', search:'?tag=all'}), {kind:'ranking', text:''});
  assert.deepEqual(pc({pathname:'/watch/sm9'}), {kind:'other', text:''});
});

test('"not on ranking" and "only while searching this tag" limit a rule', () => {
  const rule = group('AND', [cond('lockedTagCount','gte',1), cond('tag','contains','ホモ'), cond('pageKind','neq','ranking')]);
  assert.equal(AdvancedNgRules.evaluateNode(video({pageContext:{kind:'tag', text:'淫夢'}}), rule), true);
  assert.equal(AdvancedNgRules.evaluateNode(video({pageContext:{kind:'ranking', text:''}}), rule), false);
  const scoped = group('AND', [cond('tag','contains','ホモ'), cond('searchText','eq','淫夢')]);
  assert.equal(AdvancedNgRules.evaluateNode(video({}), scoped), true, 'falls back to the current location');
  assert.equal(AdvancedNgRules.evaluateNode(video({pageContext:{kind:'tag', text:'料理'}}), scoped), false);
});

test('user example: title has (みる OR 学ぶ) AND 中国', () => {
  const rule = group('AND', [group('OR', [cond('title','contains','みる'), cond('title','contains','学ぶ')]), cond('title','contains','中国')]);
  assert.equal(AdvancedNgRules.evaluateNode(video({title:'中国で学ぶ料理'}), rule), true);
  assert.equal(AdvancedNgRules.evaluateNode(video({title:'中国をみる'}), rule), true);
  assert.equal(AdvancedNgRules.evaluateNode(video({title:'日本で学ぶ'}), rule), false);
});

test('genre: 16 genres + 未設定; undecided until the detail supplied it', () => {
  assert.equal(AdvancedNgRules.GENRES.length, 17);
  assert.ok(AdvancedNgRules.GENRES.includes('未設定') && AdvancedNgRules.GENRES.includes('音楽・サウンド'));
  const isGame = cond('genre','eq','ゲーム');
  assert.equal(AdvancedNgRules.evaluateState(video({genre:'ゲーム'}), isGame), true);
  assert.equal(AdvancedNgRules.evaluateState(video({genre:'料理'}), isGame), false);
  assert.equal(AdvancedNgRules.evaluateState(video({}), isGame), null, 'no genre yet: undecided, so NOT cannot match');
  assert.equal(AdvancedNgRules.evaluateState(video({}), cond('genre','eq','ゲーム', true)), null);
  assert.equal(AdvancedNgRules.evaluateState(video({genre:'未設定'}), cond('genre','neq','未設定')), false);
});

test('context use is detected (such rules are never remembered)', () => {
  assert.equal(AdvancedNgRules.usesContext(group('AND', [cond('tag','contains','a'), group('OR', [cond('pageKind','eq','ranking')])])), true);
  assert.equal(AdvancedNgRules.usesContext(group('AND', [cond('tag','contains','a'), cond('genre','eq','ゲーム')])), false);
  const parsed = plain(AdvancedNgRules.parse(JSON.stringify([{id:'r', name:'n', expression:group('AND', [cond('pageKind','eq','search'), cond('genre','neq','未設定')])}])));
  assert.equal(parsed[0].expression.children[0].field, 'pageKind', 'new fields survive parse');
  assert.equal(parsed[0].expression.children[1].field, 'genre');
});
