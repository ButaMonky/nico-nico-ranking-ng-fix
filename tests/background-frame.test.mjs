import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/core/events.js',import.meta.url),'utf8');
const load=(document,raf)=>{
 const frames=[];
 const ctx={document,MessageChannel,setTimeout,clearTimeout,
  requestAnimationFrame:raf?fn=>{frames.push(fn);return frames.length}:undefined,
  cancelAnimationFrame:id=>{frames[id-1]=null}};
 ctx.globalThis=ctx;
 vm.runInNewContext(source+';globalThis.api={nrnRequestFrame,nrnCancelFrame}',ctx);
 return {...ctx.api,frames};
};
const tick=()=>new Promise(r=>setTimeout(r,20));
test('hidden tab: callback runs without any animation frame',async()=>{
 const {nrnRequestFrame,frames}=load({hidden:true},true);let ran=0;
 nrnRequestFrame(()=>ran++);nrnRequestFrame(()=>ran++);
 await tick();assert.equal(ran,2);assert.equal(frames.length,0);
});
test('hidden tab: cancel before the task prevents the callback',async()=>{
 const {nrnRequestFrame,nrnCancelFrame}=load({hidden:true},true);let ran=0;
 nrnCancelFrame(nrnRequestFrame(()=>ran++));await tick();assert.equal(ran,0);
});
test('visible tab: uses the animation frame once and ignores the fallback timer',async()=>{
 const doc={hidden:false};const {nrnRequestFrame,frames}=load(doc,true);let ran=0;
 nrnRequestFrame(()=>ran++);assert.equal(frames.length,1);
 const f=frames[0];f();f();await new Promise(r=>setTimeout(r,250));assert.equal(ran,1);
});
test('tab hidden after scheduling: fallback timer runs the stalled frame',async()=>{
 const doc={hidden:false};const {nrnRequestFrame}=load(doc,true);let ran=0;
 nrnRequestFrame(()=>ran++);doc.hidden=true;await new Promise(r=>setTimeout(r,260));assert.equal(ran,1);
});
