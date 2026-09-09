import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const old = execFileSync('git', ['show','661322f:src/ng/logic-rules.js'], {encoding:'utf8'});
const current = readFileSync(new URL('../src/ng/logic-rules.js',import.meta.url),'utf8');
const load = source => vm.runInNewContext(source + 'AdvancedNgRules');
const versions = {before:load(old), after:load(current)};
const rules = JSON.stringify(Array.from({length:8}, (_,i) => ({id:'rule'+i, name:'Rule '+i, expression:{kind:'group',op:'AND',children:[
 {kind:'condition',field:'title',operator:'contains',value:'word'+i},
 {kind:'condition',field:'title',operator:'notContains',value:'exception'}
]}})));
const movies = Array.from({length:60},(_,i)=>({id:'sm'+i,title:'word'+(i%8)+' title'}));
const run = api => {
 let matches=0; const start=performance.now();
 for(let i=0;i<6000;i++) matches+=api.match(movies[i%movies.length],true,rules,false).length;
 return {ms:performance.now()-start,matches};
};
for(const api of Object.values(versions)) run(api);
const samples={before:[],after:[]};
for(let repeat=0;repeat<5;repeat++) for(const key of repeat%2 ? ['after','before'] : ['before','after']) {
 const result=run(versions[key]);assert.equal(result.matches,6000);samples[key].push(result.ms);
}
const median = a => [...a].sort((a,b)=>a-b)[2];
console.log(JSON.stringify({scenario:'6000 decisions, 8 two-condition rules, 60 titles, 5 samples; CPU only, no network',baselineCommit:'661322f',beforeMs:Math.round(median(samples.before)),afterMs:Math.round(median(samples.after)),speedup:Number((median(samples.before)/median(samples.after)).toFixed(2))},null,2));
