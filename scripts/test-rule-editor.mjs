import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build, output} from './build.mjs';
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
 // Use a real settings iframe, like the product, while the parent owns Config.
 await page.evaluate(html=>{const f=document.createElement('iframe');f.id='settings';f.style='width:100%;height:1100px;border:0';f.srcdoc=html;document.body.append(f)},html);
 const frame=page.frameLocator('#settings');
 await frame.locator('#advancedRuleList').waitFor({state:'attached'});
 await page.evaluate(async()=>{
  window.writes=[];window.config=new api.Config((k,d)=>d,(k,v)=>writes.push([k,v]));await config.sync();
  config._nrnRulePreviewMovies=()=>[{id:'sm42',title:'ゲーム実況',thumbInfoDone:false,tags:[],contributor:{type:'unknown',id:-1},error:{type:'NO_ERROR'}}];
  window.dialog=new api.ConfigDialog(config,document.querySelector('#settings').contentDocument,()=>{});
 });
 await frame.locator('#advancedRuleSampleButton').click();
 assert.equal(await page.evaluate(()=>config.advancedNgRulesJson.value),'[]','template stays draft');
 await frame.locator('.re-detail').getByLabel('このルールを使う',{exact:true}).check();
 await frame.locator('#advancedNgRulesEnabled').check();
 assert.equal(await page.evaluate(()=>config.advancedNgRulesEnabled.value),false,'master switch stays draft');
 await frame.locator('.re-simulator summary').click();
 await frame.getByRole('button',{name:'判定を更新',exact:true}).click();
 assert.match(await frame.locator('.re-test-results').textContent(),/このルールに一致/);
 await frame.getByRole('button',{name:'変更を適用',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(config.advancedNgRulesJson.value).length),1);
 assert.equal(await page.evaluate(()=>config.advancedNgRulesEnabled.value),true);
 // Empty numeric input cannot silently become zero or overwrite the live rules.
 await frame.getByLabel('条件の項目',{exact:true}).first().selectOption('lockedTagCount');
 await frame.getByLabel('条件の値',{exact:true}).first().fill('');
 await frame.getByLabel('条件の値',{exact:true}).first().press('Tab');
 assert.equal(await frame.getByRole('button',{name:'変更を適用',exact:true}).isDisabled(),true);
 assert.match(await frame.locator('.re-errors').textContent(),/値を入力/);
 assert.equal(await page.evaluate(()=>JSON.parse(config.advancedNgRulesJson.value)[0].expression.children[0].field),'title');
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 assert.equal(await frame.getByLabel('条件の項目',{exact:true}).first().inputValue(),'title');
 await frame.getByRole('button',{name:'やり直す',exact:true}).click();
 assert.equal(await frame.getByLabel('条件の項目',{exact:true}).first().inputValue(),'lockedTagCount');
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 // Exception wraps existing expression without changing it. It only affects this rule.
 await frame.getByRole('button',{name:'例外を追加（このルールから除く）',exact:true}).click();
 await frame.getByLabel('条件の値',{exact:true}).last().fill('お気に入り');
 await frame.getByLabel('条件の値',{exact:true}).last().press('Tab');
 await frame.getByLabel('試すタグ',{exact:true}).fill('ゲーム\nお気に入り');
 await frame.getByLabel('試すタグ',{exact:true}).press('Tab');
 assert.match(await frame.locator('.re-test-results').textContent(),/このルールには一致しません/);
 await frame.getByRole('button',{name:'このページの動画を読み込む',exact:true}).click();
 assert.match(await frame.locator('.re-test-results').textContent(),/情報不足 → 判定保留/);
 await frame.getByRole('button',{name:'ルールを複製',exact:true}).click();
 assert.equal(await frame.locator('.re-rule').count(),2);
 assert.equal(await frame.locator('.re-detail').getByLabel('このルールを使う',{exact:true}).isChecked(),false);
 await frame.getByRole('button',{name:'ルールを削除',exact:true}).click();
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 assert.equal(await frame.locator('.re-rule').count(),2);
 // Foreign edits are not overwritten by this draft.
 await page.evaluate(()=>config.advancedNgRulesEnabled.value=false);
 await frame.getByRole('button',{name:'変更を適用',exact:true}).click();
 assert.match(await frame.locator('.re-status').textContent(),/別の画面/);
 await frame.getByRole('button',{name:'保存済みに戻す',exact:true}).click();
 assert.equal(await frame.locator('.re-rule').count(),1);
 assert.equal(await frame.locator('#advancedNgRulesEnabled').isChecked(),false);
 // Unsafe-looking input remains text. Reorder and nested groups are keyboard-accessible buttons.
 await frame.getByLabel('ルール名',{exact:true}).fill('<img src=x onerror=alert(1)>');
 await frame.getByLabel('ルール名',{exact:true}).press('Tab');
 assert.equal(await frame.locator('.re-list img').count(),0);
 await frame.getByRole('button',{name:'↑ 上へ',exact:true}).last().click();
 assert.equal(await frame.getByLabel('条件の項目',{exact:true}).first().inputValue(),'tag');
 await frame.getByRole('button',{name:'元に戻す',exact:true}).click();
 assert.equal(await frame.getByLabel('条件の項目',{exact:true}).first().inputValue(),'title');
 // Close cancellation preserves the draft.
 page.once('dialog',d=>d.dismiss());
 await frame.locator('#closeButton').click();
 assert.equal(await page.evaluate(()=>Boolean(dialog._closed)),false);
 await frame.getByRole('button',{name:'保存済みに戻す',exact:true}).click();
 await frame.locator('.re-simulator summary').click();
 if(process.env.NRN_ARTIFACT_DIR){await mkdir(process.env.NRN_ARTIFACT_DIR,{recursive:true});await frame.locator('.re-intro').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:process.env.NRN_ARTIFACT_DIR+'/rules-desktop.png'});}
 await page.setViewportSize({width:430,height:1100});
 const overflow=await frame.locator('.re-editor').evaluate(e=>e.scrollWidth>e.clientWidth+2);
 assert.equal(overflow,false,'editor fits narrow settings window');
 if(process.env.NRN_ARTIFACT_DIR){await frame.locator('.re-intro').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:process.env.NRN_ARTIFACT_DIR+'/rules-mobile.png'});}
 assert.deepEqual(errors,[]);
 console.log('Rule editor Chrome PASS: drafts, apply, numeric validation, undo/redo, exceptions, runtime preview uncertainty, clone/delete/reorder, conflict, close protection, narrow layout.');
} finally {await browser.close();}
