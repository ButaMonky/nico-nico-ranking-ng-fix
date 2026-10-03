export const scenarioNames=['none','title30','title90','numeric90','owner','tag','lock','compound','details'];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const condition=(field,operator,value)=>({kind:'condition',field,operator,value});
export function makeScenario(name){
 if(!scenarioNames.includes(name))throw Error('Unknown benchmark scenario');
 const total=128,initialSize=8,pageSize=16,target=12,lastPage=1+Math.ceil((total-initialSize)/pageSize);
 const titleBlocked=n=>name==='title90'?n%10!==0:['title30','compound'].includes(name)&&n%10<3;
 const numericBlocked=n=>name==='numeric90'&&(n-1)<115;
 const tagBlocked=n=>name==='tag'?n%3===0:name==='compound'&&n%4===0;
 const blocked=n=>titleBlocked(n)||numericBlocked(n)||tagBlocked(n)||(name==='owner'&&n%3===0)||(name==='lock'&&n%3===0);
 const items=Array.from({length:total},(_,i)=>{const n=i+1;return {
  id:'sm'+n,title:titleBlocked(n)?'DROP synthetic '+n:'KEEP synthetic '+n,
  owner:{type:'user',id:name==='owner'&&n%3===0?99:12,name:'Fixture owner',iconUrl:'https://example.invalid/icon.png'},
  description:'Fixture description',count:{like:i,view:i,comment:0,mylist:0},duration:60,
  registeredAt:'2026-01-01T00:00:00Z',thumbnail:{listingUrl:'https://example.invalid/thumbnail.png'}
 };});
 const page=n=>n===1?items.slice(0,initialSize):items.slice(initialSize+(n-2)*pageSize,initialSize+(n-1)*pageSize);
 const settings={autoFillEnabled:true,autoFillTargetCount:target,autoFillMaxExtraPages:20,autoFillDetailBatchMax:48,
  autoFillInfoMode:'legacy',autoFillAdMode:'off',selfAdWarningEnabled:false,developerMode:false,statusPanelMode:'hidden',
  developerDiagnosticMode:'manual',sessionDetailCacheEnabled:true,openNewWindow:false,
  movieInfoTogglable:name!=='details',descriptionTogglable:name!=='details',ngTitles:name.startsWith('title')?['DROP']:[],
  ngUserIds:name==='owner'?[99]:[],ngTags:name==='tag'?['tag-block']:name.startsWith('title')?['never-blocked']:[],
  ngLockedTagCountEnabled:name==='lock',ngLockedTagCountThreshold:1,advancedNgRulesEnabled:['compound','numeric90'].includes(name),
  advancedNgRulesJson:JSON.stringify([{id:'fixture-rule',expression:name==='numeric90'
    ? condition('likeCount','lt',115)
    : {kind:'group',op:'OR',children:[condition('title','contains','DROP'),condition('tag','contains','tag-block')]}}])};
 function xml(id){
  const n=Number(id.slice(2)),item=items[n-1];if(!item||item.id!==id)throw Error('Unknown fixture video');
  return '<nicovideo_thumb_response status="ok"><thumb><video_id>'+id+'</video_id><title>'+esc(item.title)+'</title><description>Fixture description</description><user_id>'+item.owner.id+'</user_id><user_nickname>Fixture owner</user_nickname><tags><tag'+(name==='lock'&&n%3===0?' lock="1"':'')+'>'+(tagBlocked(n)?'tag-block':'other')+'</tag></tags></thumb></nicovideo_thumb_response>';
 }
 function html(n){
  const payload={data:{response:{$getSearchVideoV2:{data:{items:page(n),totalCount:total}}}}};
  const nav='<nav data-scope="pagination"><a data-part="item" data-index="'+n+'" data-selected aria-label="page '+n+'" href="?page='+n+'">'+n+'</a><a data-part="item" data-index="'+lastPage+'" aria-label="last page" href="?page='+lastPage+'">'+lastPage+'</a><a data-part="next-trigger" '+(n>=lastPage?'data-disabled':'href="?page='+(n+1)+'"')+'>next</a></nav>';
  return '<!doctype html><html><head><meta name="server-response" content="'+esc(JSON.stringify(payload))+'"></head><body>'+nav+'</body></html>';
 }
 return {name,items,initial:page(1),target,lastPage,page,settings,xml,html,
  expectedIds:items.filter((_,i)=>!blocked(i+1)).slice(0,target).map(x=>x.id)};
}
