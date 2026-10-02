import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const defaults={baseline:'0d23473200ecb9aeb43ad79bcc8f3e1e90ee4922',iterations:6000,samples:5};
function options(argv){
 const result={...defaults};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i].replace(/^--/,'');
  if(!Object.hasOwn(defaults,key)||argv[i]!=='--'+key)throw Error('Unknown benchmark option');
  const value=argv[i+1];
  if(key==='baseline'){
   if(!/^[a-f0-9]{7,40}$/i.test(value||''))throw Error('Invalid baseline commit');
   result.baseline=value;
  }else{
   const n=Number(value),max=key==='samples'?15:100000;
   if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('Invalid '+key);
   result[key]=n;
  }
 }
 return result;
}
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
function sources(ref){
 const files=['src/core/owner-id.js','src/data/metadata-readiness.js','src/ng/logic-rules.js'];
 const available=ref?new Set(git(['ls-tree','-r','--name-only',ref,'--','src']).split('\n')):null;
 return files.map(file=>{
  if(file==='src/core/owner-id.js' && (ref?!available.has(file):!existsSync(path.join(root,file))))return '';
  return ref?git(['show',ref+':'+file]):readFileSync(path.join(root,file),'utf8');
 }).join('\n');
}
const condition=(field,operator,value)=>({kind:'condition',field,operator,value});
const group=(op,children)=>({kind:'group',op,children});
const scenarios=[{
 name:'title-8-rules',
 rules:JSON.stringify(Array.from({length:8},(_,i)=>({id:'r'+i,name:'Rule '+i,expression:group('AND',[
  condition('title','contains','word'+i),condition('title','notContains','exception')])}))),
 movies:Array.from({length:60},(_,i)=>({id:'sm'+(i+1),title:'word'+(i%8)+' title'})),
 expected:()=>true
},{
 name:'mixed-known-unknown',
 rules:JSON.stringify([{id:'mixed',expression:group('OR',[condition('title','contains','banned'),group('AND',[
  condition('tag','contains','blocked'),condition('userId','eq',12)])])}]),
 movies:Array.from({length:60},(_,i)=>({id:'sm'+(i+1),title:i%5===0?'banned':'ordinary',
  contributor:{type:'user',id:12,name:'synthetic'},tags:[{name:i%3===0?'blocked':'other',lock:false}],
  metadata:{tags:i%4===0?'unknown':'known',ownerId:'known',ownerType:'known'}})),
 expected:i=>i%5===0 || (i%3===0 && i%4!==0)
}];
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
try{
 const o=options(process.argv.slice(2));let baseline;
 try{baseline=git(['rev-parse','--verify',o.baseline+'^{commit}']);}catch{throw Error('Baseline commit is unavailable; choose an existing published commit explicitly.');}
 const source={before:sources(baseline),after:sources(null)};
 const versions=Object.fromEntries(Object.entries(source).map(([name,text])=>[name,vm.runInNewContext(text+';AdvancedNgRules',{console:{warn(){}}})]));
 const measured=[];
 for(const scenario of scenarios){
  const run=api=>{
   let matches=0;const start=performance.now();
   for(let i=0;i<o.iterations;i++)matches+=api.match(scenario.movies[i%60],true,scenario.rules,false).length;
   return {ms:performance.now()-start,matches};
  };
  const expected=Array.from({length:o.iterations},(_,i)=>Number(scenario.expected(i%60))).reduce((a,b)=>a+b,0);
  for(const api of Object.values(versions))assert.equal(run(api).matches,expected,scenario.name);
  const samples={before:[],after:[]};
  for(let repeat=0;repeat<o.samples;repeat++)for(const name of repeat%2?['after','before']:['before','after']){
   const result=run(versions[name]);assert.equal(result.matches,expected,scenario.name);samples[name].push(result.ms);
  }
  measured.push({name:scenario.name,...Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{matches:expected,medianMs:median(values),samplesMs:values}]))});
 }
 console.log(JSON.stringify({format:'NRN-RULE-BENCHMARK-2',scope:'CPU only; synthetic decisions, not live network or page performance',
  baselineCommit:baseline,currentCommit:git(['rev-parse','HEAD']),node:process.version,iterations:o.iterations,sampleCount:o.samples,
  sourceHashes:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),scenarios:measured},null,2));
}catch(error){console.error('Benchmark failed: '+error.message);process.exitCode=1;}
