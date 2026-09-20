import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const ref=process.argv[2]||'HEAD';
if(ref.startsWith('-'))throw new Error('Expected a revision, not an option');
const git=(args,input)=>execFileSync('git',args,{cwd,input,maxBuffer:256*1024*1024});
const rows=git(['rev-list','--objects',ref]).toString().trim().split('\n');
const names=new Map(rows.map(line=>{const i=line.indexOf(' ');return i<0?[line,'[commit/tree]']:[line.slice(0,i),line.slice(i+1)]}));
const packed=git(['cat-file','--batch'],[...names.keys()].join('\n')+'\n');
const checks=[
 ['personal-home-path',/(?<![a-z0-9:/.])(?:[A-Z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)[a-z0-9_.-]+/i],
 ['blob-origin',/blob:https?:\/\/[^\s"'<>]+/i],
 ['credential',/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|Bearer\s+[A-Za-z0-9._-]{24,}|user_session(?:_secure)?[=:]\s*[A-Za-z0-9_-]{12,})/],
 ['personal-email',/[a-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|icloud)\.[a-z.]+/i],
 ['captured-media-key',/https?:\/\/[^\s"<>]+[?&]key=[a-f0-9]{24,}/i],
];
const privateTerms=(process.env.NRN_PRIVATE_TERMS||'').split('\n').filter(Boolean);
const failures=[];let offset=0,commits=0,blobs=0;
while(offset<packed.length){
 const end=packed.indexOf(10,offset);const [id,type,size]=packed.subarray(offset,end).toString().split(' ');
 const length=Number(size);if(!Number.isFinite(length))throw new Error('Invalid Git object');
 const text=packed.subarray(end+1,end+1+length).toString('utf8');offset=end+length+2;
 if(type!=='blob'&&type!=='commit'&&type!=='tag')continue;
 const path=names.get(id);if(type==='blob')blobs++;if(type==='commit')commits++;
 for(const [kind,re] of checks)if(re.test(text))failures.push({path,kind});
 if(privateTerms.some(term=>text.toLowerCase().includes(term.toLowerCase())))failures.push({path,kind:'private-term'});
 if(type==='commit'&&[...text.matchAll(/^(?:author|committer) .*?<([^>]+)>/gm)].some(m=>!m[1].endsWith('@users.noreply.github.com')))failures.push({path,kind:'commit-email-not-private'});
 if(type==='blob'&&/\.(?:har|chlz|zip|log)$/i.test(path))failures.push({path,kind:'raw-artifact'});
 if(type==='blob'&&path.startsWith('tests/fixtures/')&&/https?:\/\/[^\s"'<>]*(?:\.nimg\.jp|nicovideo\.jp\/watch\/)\S*/i.test(text))failures.push({path,kind:'captured-fixture-resource'});
}
for(const item of failures)console.error(item.path+': '+item.kind);
if(failures.length)process.exitCode=1;
else console.log(`History privacy PASS: ${commits} commits and ${blobs} blob versions scanned. Pattern checks complement manual fixture/document review.`);
