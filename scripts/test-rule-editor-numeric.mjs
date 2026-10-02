import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
// BRUSH-037 offline browser check: numeric conditions in the Rule Editor (synthetic page, no network).
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NRN_PLAYWRIGHT||'playwright');
await build();
const source=await readFile(output,'utf8');
const exportsSource=source.slice(0,source.indexOf('  var NicoPage = (function() {'))+'window.api = {ConfigDialog,Config,RuleEditor,AdvancedNgRules}; })()';
const browser=await chromium.launch({headless:true,executablePath:process.env.NRN_BROWSER});
try {
 const page=await browser.newPage({viewport:{width:1100,height:1200}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
 await page.route('**/*',r=>r.fulfill({body:'',contentType:'text/html'}));
 await page.goto('http://nrn.test/settings');
 await page.addScriptTag({content:exportsSource});
 const html=await page.evaluate(()=>api.ConfigDialog.SRCDOC);
 await page.evaluate(html=>{const f=document.createElement('iframe');f.id='settings';f.style='width:100%;height:1100px;border:0';f.srcdoc=html;document.body.append(f)},html);
 const frame=page.frameLocator('#settings');
 await frame.locator('#advancedRuleList').waitFor({state:'attached'});
 await page.evaluate(async()=>{
  window.config=new api.Config((k,d)=>d,()=>{});await config.sync();
  window.dialog=new api.ConfigDialog(config,document.querySelector('#settings').contentDocument,()=>{});
 });
 await frame.locator('#advancedRuleAddButton').click();
 const field=frame.getByLabel('条件の項目',{exact:true}).first();
 const group=await field.evaluate(s=>[...s.querySelectorAll('optgroup')].find(g=>g.label==='再生・反応数')?.querySelectorAll('option').length);
 assert.equal(group,5,'five numeric fields in their own group');
 await field.selectOption('likeCount');
 const value=frame.getByLabel('条件の値',{exact:true}).first();
 assert.equal(await frame.getByLabel('条件の比較方法',{exact:true}).first().inputValue(),'gte');
 assert.equal(await value.inputValue(),'1');
 for(const bad of ['1e3','1.5','-1']){
  await value.fill(bad);await value.press('Tab');
  assert.equal(await frame.getByRole('button',{name:'変更を適用',exact:true}).isDisabled(),true,bad);
  assert.match(await frame.locator('.re-errors').textContent(),/0以上の整数を数字だけ/,bad);
 }
 await value.fill('5');await value.press('Tab');
 assert.equal((await frame.locator('.re-errors').textContent()).trim(),'');
 assert.match(await frame.locator('.re-condition .hint').first().textContent(),/0とみなさず「判定保留」/);
 await frame.getByLabel('条件の比較方法',{exact:true}).first().selectOption('lt');
 // The hand-made test sample: blank = unknown (pending), 0 = known.
 await frame.locator('.re-simulator summary').click();
 assert.match(await frame.locator('.re-test-results').textContent(),/情報不足 → 判定保留/);
 assert.match(await frame.locator('.re-test-results').textContent(),/未取得/);
 const likes=frame.getByLabel('試すいいね数',{exact:true});
 await likes.fill('0');await likes.press('Tab');
 assert.match(await frame.locator('.re-test-results').textContent(),/このルールに一致/);
 await likes.fill('9');await likes.press('Tab');
 assert.match(await frame.locator('.re-test-results').textContent(),/このルールには一致しません/);
 await likes.fill('');await likes.press('Tab');
 assert.match(await frame.locator('.re-test-results').textContent(),/判定保留/);
 // BRUSH-036: outcome badge and wording.
 assert.equal(await frame.locator('.re-outcome').getAttribute('data-outcome'),'unknown');
 assert.match(await frame.locator('.re-test-results').textContent(),/判定保留（未取得）/);
 assert.match(await frame.locator('.re-test-results').textContent(),/保留（未取得） — いいね数/);
 await frame.getByLabel('条件の項目',{exact:true}).first().selectOption('tag');
 await frame.getByLabel('条件の比較方法',{exact:true}).first().selectOption('contains');
 await frame.getByLabel('条件の値',{exact:true}).first().fill('ゲーム');await frame.getByLabel('条件の値',{exact:true}).first().press('Tab');
 await frame.getByLabel('試す詳細情報',{exact:true}).selectOption('failed');
 assert.equal(await frame.locator('.re-outcome').getAttribute('data-outcome'),'failed');
 assert.match(await frame.locator('.re-test-results').textContent(),/判定保留（取得失敗）/);
 await frame.getByLabel('試す詳細情報',{exact:true}).selectOption('ready');
 assert.equal(await frame.locator('.re-outcome').getAttribute('data-outcome'),'match');
 assert.match(await frame.locator('.re-outcome').textContent(),/^一致：/);
 assert.match(await frame.locator('.re-group select').first().textContent(),/すべて一致（AND）/);
 assert.ok(await frame.getByLabel('このまとまりを除外条件にする（NOT・条件を反転）',{exact:true}).count()>=1);
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();await frame.getByRole('button',{name:'元に戻す',exact:true}).click();await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 assert.equal(await frame.getByLabel('条件の項目',{exact:true}).first().inputValue(),'likeCount');
 assert.equal(await frame.getByLabel('条件の値',{exact:true}).first().inputValue(),'5');
 // Apply writes the condition in the existing rule JSON shape.
 await frame.locator('.re-detail').getByLabel('このルールを使う',{exact:true}).check();
 await frame.getByRole('button',{name:'変更を適用',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(config.advancedNgRulesJson.value)[0].expression.children[0]);
 assert.deepEqual(saved,{kind:'condition',field:'likeCount',operator:'lt',value:'5',not:false});
 assert.deepEqual(errors,[]);
 console.log('Rule editor numeric PASS: numeric group, strict integer validation, honest unknown help, blank=unknown sample, match/no-match/pending-unknown/pending-failed outcomes, AND/OR/NOT wording, undo, JSON shape. Offline only.');
} finally {await browser.close();}
