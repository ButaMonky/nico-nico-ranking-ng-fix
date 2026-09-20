import {readdir,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {root} from './build.mjs';
const ignored=new Set(['.git','node_modules','work','outputs']);
const checks=[
 ['personal-home-path', /(?<![a-z0-9:/.])(?:[A-Z]:[\\/]Users[\\/]|\/Users\/|\/home\/)[a-z0-9_.-]+/i],
 ['blob-origin', /blob:https?:\/\/[^\s"'<>]+/i],
 ['credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|Bearer\s+[A-Za-z0-9._-]{24,})/],
 ['personal-email', /[a-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|icloud)\.[a-z.]+/i],
 ['captured-media-key', /https?:\/\/[^\s"<>]+[?&]key=[a-f0-9]{24,}/i]
];
const failures=[];
async function scan(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(ignored.has(entry.name))continue;
  const path=join(dir,entry.name),name=relative(root,path).replaceAll('\\','/');
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){await scan(path);continue;}
  if(/\.(?:har|chlz|zip|log)$/i.test(entry.name)){failures.push([name,'private-artifact']);continue;}
  const text=await readFile(path,'utf8');
  for(const [kind,re] of checks)if(re.test(text))failures.push([name,kind]);
 }
}
await scan(root);
if(failures.length){
 for(const [path,kind] of failures)console.error(path+': '+kind); // Never echo the matching private content.
 process.exitCode=1;
}else console.log('Privacy PASS: no home paths, blob origins, common personal emails, credentials or captured-media keys in the deliverable tree.');
