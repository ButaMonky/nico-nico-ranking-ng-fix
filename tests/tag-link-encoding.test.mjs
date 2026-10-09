import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {output} from '../scripts/build.mjs';

function makeDocument() {
  const doc = {createElement(name) { return makeElement(name); }};
  function makeElement(name) {
    const e = {name, className:'', children:[], textContent:'', dataset:{}, ownerDocument:doc,
      setAttribute() {},
      appendChild(child) { this.children.push(child); return child; },
      querySelector(selector) {
        const wanted = selector.slice(1), queue = [...this.children];
        while (queue.length) {
          const child = queue.shift();
          if (child.className.split(/\s+/).includes(wanted)) return child;
          queue.push(...child.children);
        }
        return null;
      }};
    const tokens = () => new Set(e.className.split(/\s+/).filter(Boolean));
    e.classList = {contains: c => tokens().has(c),
      add(c) {const s=tokens();s.add(c);e.className=[...s].join(' ');},
      remove(c) {const s=tokens();s.delete(c);e.className=[...s].join(' ');}};
    return e;
  }
  return doc;
}

const source = await readFile(output, 'utf8');
const marker = '  var Diagnostics = (function() {';
assert.equal(source.split(marker).length,2);
const {NicoPage,Tag} = vm.runInNewContext(
  source.slice(0,source.indexOf(marker))+'return {NicoPage,Tag}; })()',{}, {timeout:3000});

test('TagView encodes one literal path segment while preserving tag label and NG dataset',()=>{
  const doc = makeDocument();
  for (const name of ['#コンパス','A?B','A/B','100%','%23','音楽','A&B','😺']) {
    const tag = new Tag({name,lock:false});
    const view = new NicoPage.TagView(doc,tag).bindToTag(tag);
    const anchor = view.elem.querySelector('.nrn-movie-tag-link');
    const button = view.elem.querySelector('.nrn-tag-ng-button');
    assert.ok(anchor && button, `missing tag nodes: ${name}`);
    const href = new URL(anchor.href);
    assert.equal(href.origin,'https://www.nicovideo.jp');
    assert.equal(href.pathname,'/tag/'+encodeURIComponent(name),name);
    assert.equal(href.search,'',name);
    assert.equal(href.hash,'',name);
    assert.equal(anchor.textContent,name);
    assert.equal(button.dataset.tagName,name);
    view.unbind();
  }
});

test('malformed UTF-16 tag keeps visible label but never builds a corrupted link',()=>{
  const name='\uD800';
  const tag=new Tag({name,lock:false});
  const view=new NicoPage.TagView(makeDocument(),tag).bindToTag(tag);
  const anchor=view.elem.querySelector('.nrn-movie-tag-link');
  const button=view.elem.querySelector('.nrn-tag-ng-button');
  assert.equal(anchor.href,undefined);
  assert.equal(anchor.textContent,name);
  assert.equal(button.dataset.tagName,name);
  view.unbind();
});
