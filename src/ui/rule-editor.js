  // Draft editing is isolated from Config until Apply. Uses the runtime evaluator for previews.
  var RuleEditor = (function() {
    const clone = value => JSON.parse(JSON.stringify(value))
    const id = () => 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2,9)
    const condition = (field = 'title', operator = 'contains', value = '') =>
      ({kind:'condition', field, operator, value, not:false})
    const group = (op, children, not = false) => ({kind:'group', op, children, not})
    const templates = [
      ['白紙から作る', () => group('AND', [condition()])],
      ['タイトルとタグの両方で絞る', () => group('AND', [condition('title','contains','実況'), condition('tag','contains','ゲーム')])],
      ['複数の言葉のどれかで絞る', () => group('OR', [condition('title','contains','総集編'), condition('title','contains','切り抜き')])],
      ['好きなタグを除外して絞る', () => group('AND', [condition('title','contains','実況'), condition('tag','notContains','お気に入り')])],
      ['同じ投稿者の連続投稿を絞る', () => group('AND', [condition('pageContributorCount','gte',5), condition('title','contains','実況')])]
    ]
    const fieldGroups = [
      ['内容', ['title','tag','lockedTag','description','movieId']],
      ['個数', ['lockedTagCount','tagCount','pageContributorCount']],
      ['投稿者', ['contributorName','userId','channelId','contributorId']],
      ['広告', ['selfAdIdMatch','selfAdNameMatch']]
    ]
    const validate = rules => {
      const errors = []
      const walk = (node, path, depth) => {
        if (depth > 12) { errors.push(path + '：グループは12段までです。'); return }
        if (node.kind === 'group') {
          if (!node.children.length) errors.push(path + '：条件を1つ以上追加してください。')
          node.children.forEach((child, i) => walk(child, path + ' / ' + (i + 1), depth + 1))
          return
        }
        const meta = AdvancedNgRules.FIELD_META[node.field]
        if (!meta || !meta.operators.includes(node.operator)) { errors.push(path + '：項目または比較方法が不正です。'); return }
        if (!AdvancedNgRules.OP_META[node.operator].needsValue) return
        const value = String(node.value ?? '').trim()
        if (!value) { errors.push(path + '：値を入力してください。'); return }
        if (meta.type === 'number' || meta.type === 'numberOrMissing') {
          const n = Number(value)
          if (!Number.isSafeInteger(n) || n < (meta.type === 'numberOrMissing' || node.field === 'pageContributorCount' ? 1 : 0))
            errors.push(path + '：' + (meta.type === 'numberOrMissing' || node.field === 'pageContributorCount' ? '1以上' : '0以上') + 'の整数を入力してください。')
          if (['tagCount','lockedTagCount'].includes(node.field) && n > 11) errors.push(path + '：タグの個数は0～11です。')
        }
      }
      rules.forEach((rule, i) => walk(rule.expression, 'ルール' + (i + 1) + '「' + rule.name + '」', 0))
      return errors
    }
    const describe = (node, friendly) => {
      if (node.kind === 'condition') {
        const text = AdvancedNgRules.FIELD_META[node.field].label + '：' + friendly(node.field,node.operator)
          + (AdvancedNgRules.OP_META[node.operator].needsValue ? '「' + (node.value ?? '') + '」' : '')
        return node.not ? '【当てはまらない】' + text : text
      }
      const text = '【' + (node.op === 'AND' ? 'すべて' : 'どれか1つ以上') + '】' + node.children.map(n => describe(n, friendly)).join(node.op === 'AND' ? '、かつ ' : '、または ')
      return node.not ? '【次のまとまりには当てはまらない】' + text : text
    }
    function mount(dialog) {
      const doc = dialog.doc, config = dialog.config
      const host = doc.getElementById('advancedRuleList')
      const master = doc.getElementById('advancedNgRulesEnabled')
      const friendly = dialog._friendlyOperatorLabel.bind(dialog)
      let savedRaw = config.advancedNgRulesJson.value, savedEnabled = config.advancedNgRulesEnabled.value
      let draft = AdvancedNgRules.parse(savedRaw), draftEnabled = savedEnabled
      let past = [], future = [], selected = 0, search = ''
      let liveSamples = [], sampleMode = 'manual'
      const sample = {id:'sm12345678', title:'ゲーム実況 第1回', description:'', thumbInfoDone:true,
        error:{type:'NO_ERROR'}, tags:[{name:'ゲーム',lock:true}], contributor:{type:'user',id:12345,name:'投稿者'}, pageContributorCount:1}
      const el = (tag, text, cls) => { const e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e }
      const button = (text, fn, cls) => { const e = el('button',text,cls); e.type='button'; e.addEventListener('click',fn); return e }
      const labeled = (text, input) => { const label=el('label',null,'re-label'); label.append(el('span',text),input); return label }
      const input = (label, value, onChange, type='text') => { const e=el('input'); e.type=type; e.value=value; e.setAttribute('aria-label',label); e.addEventListener('change',()=>onChange(e.value)); return e }
      const select = (label, values, value, onChange) => { const e=el('select'); e.setAttribute('aria-label',label); for (const [v,t] of values) {const o=el('option',t);o.value=v;e.append(o)} e.value=value;e.addEventListener('change',()=>onChange(e.value));return e }
      const snapshot = () => JSON.stringify({draft,draftEnabled})
      let baseline = snapshot()
      const remember = () => { past.push(snapshot()); if(past.length>30)past.shift(); future=[] }
      const change = (fn, redraw=true) => {
        const active=doc.activeElement, label=active?.tagName==='SELECT'?active.getAttribute('aria-label'):null
        const index=label?Array.from(host.querySelectorAll('select')).filter(e=>e.getAttribute('aria-label')===label).indexOf(active):-1
        remember();fn();if(redraw)render();else refresh()
        if(redraw&&index>=0)Array.from(host.querySelectorAll('select')).filter(e=>e.getAttribute('aria-label')===label)[index]?.focus({preventScroll:true})
      }
      const restore = raw => {const data=JSON.parse(raw);draft=data.draft;draftEnabled=data.draftEnabled;selected=Math.min(selected,draft.length-1);render()}
      const undo = () => {if(!past.length)return;future.push(snapshot());restore(past.pop())}
      const redo = () => {if(!future.length)return;past.push(snapshot());restore(future.pop())}
      host.className='re-editor';host.textContent=''
      const style=el('style');style.textContent=CSS;doc.head.append(style)
      const intro=el('p','① 例を選ぶ → ② 条件を編集する → ③ 動画で試す → ④ 適用する。編集途中の条件で動画が消えることはありません。','re-intro')
      const tools=el('div',null,'re-tools re-savebar')
      const undoButton=button('元に戻す',undo), redoButton=button('やり直す',redo)
      const apply=button('変更を適用',()=>{
        if(validate(draft).length)return
        if(config.advancedNgRulesJson.value!==savedRaw || config.advancedNgRulesEnabled.value!==savedEnabled) {
          status.textContent='別の画面で設定が変更されています。「保存済みに戻す」で読み直してください。下書きはまだ残っています。';return
        }
        if (!draftEnabled) config.advancedNgRulesEnabled.value=false
        config.advancedNgRulesJson.value=JSON.stringify(draft)
        if (draftEnabled) config.advancedNgRulesEnabled.value=true
        savedRaw=config.advancedNgRulesJson.value;savedEnabled=config.advancedNgRulesEnabled.value;baseline=snapshot()
        refresh();status.textContent='適用しました。情報が揃った動画から判定します。取得方式に関わる変更は次の検索移動から反映されます。'
      },'primary')
      const revert=button('保存済みに戻す',()=>{remember();savedRaw=config.advancedNgRulesJson.value;savedEnabled=config.advancedNgRulesEnabled.value;draft=AdvancedNgRules.parse(savedRaw);draftEnabled=savedEnabled;baseline=snapshot();render()})
      const status=el('p',null,'re-status');status.setAttribute('role','status')
      const errors=el('div',null,'re-errors');errors.setAttribute('aria-live','polite')
      tools.append(undoButton,redoButton,revert,apply)
      const chooser=el('div',null,'re-tools')
      const templateSelect=select('作成するルールの例',templates.map((t,i)=>[String(i),t[0]]),'0',()=>{})
      const add = templateIndex => change(()=>{draft.push({id:id(),name:templateIndex===0?'新しいルール':templates[templateIndex][0],enabled:false,expression:templates[templateIndex][1]()});selected=draft.length-1;search='';filter.value=''})
      chooser.append(templateSelect,button('この例から作る',()=>add(Number(templateSelect.value))))
      const filter=input('ルールを名前で探す','',v=>{search=v;renderList()});filter.placeholder='ルールを名前で探す';filter.className='re-filter';filter.addEventListener('input',()=>{search=filter.value;renderList()})
      const layout=el('div',null,'re-layout'), list=el('div',null,'re-list'), detail=el('div',null,'re-detail')
      layout.append(list,detail)
      const simulator=el('details',null,'re-simulator');simulator.append(el('summary','③ 動画で判定を試す（設定は変わりません）'))
      const testFields=el('div',null,'re-test-fields'), testResults=el('div',null,'re-test-results')
      const sourceSelect=select('試す動画',[['manual','手入力した動画']],'manual',v=>{sampleMode=v;testFields.hidden=v!=='manual';runPreview()})
      const loadSamples=button('このページの動画を読み込む',()=>{
        liveSamples = typeof config._nrnRulePreviewMovies==='function' ? config._nrnRulePreviewMovies().slice(0,100) : []
        sourceSelect.textContent='';const o=el('option','手入力した動画');o.value='manual';sourceSelect.append(o)
        liveSamples.forEach((m,i)=>{const opt=el('option',m.title+' ('+m.id+')');opt.value=String(i);sourceSelect.append(opt)})
        sampleMode=liveSamples.length?'0':'manual';sourceSelect.value=sampleMode;testFields.hidden=sampleMode!=='manual';runPreview()
        if(!liveSamples.length)testResults.prepend(el('p','現在のページに試せる動画がありません。手入力で試せます。'))
      })
      const titleInput=input('試すタイトル',sample.title,v=>{sample.title=v;runPreview()})
      testFields.append(labeled('タイトル',titleInput))
      const tagsInput=el('textarea');tagsInput.value='ゲーム';tagsInput.setAttribute('aria-label','試すタグ');tagsInput.rows=3;tagsInput.addEventListener('change',()=>{sample.tags=[...new Set(tagsInput.value.split('\n').map(s=>s.trim()).filter(Boolean))].map(name=>({name,lock:false}));lockedInput.value='';runPreview()});testFields.append(labeled('タグ（1行に1個・編集するとロック指定は解除）',tagsInput))
      const lockedInput=input('ロックしたタグ（カンマ区切り）','ゲーム',v=>{const locked=v.split(',').map(s=>s.trim()).filter(Boolean);sample.tags=sample.tags.map(t=>({...t,lock:locked.includes(t.name)}));for(const name of locked)if(!sample.tags.some(t=>t.name===name))sample.tags.push({name,lock:true});tagsInput.value=sample.tags.map(t=>t.name).join('\n');runPreview()})
      testFields.append(labeled('ロックしたタグ（カンマ区切り・上のタグに追加）',lockedInput))
      testFields.append(labeled('投稿者名',input('試す投稿者名',sample.contributor.name,v=>{sample.contributor.name=v;runPreview()})))
      testFields.append(labeled('投稿者の種類',select('試す投稿者の種類',[['user','ユーザー'],['channel','チャンネル'],['unknown','情報なし']],'user',v=>{sample.contributor.type=v;runPreview()})))
      testFields.append(labeled('投稿者ID',input('試す投稿者ID',12345,v=>{sample.contributor.id=v===''?null:Number(v);runPreview()},'number')))
      testFields.append(labeled('元の1ページ内の同じ投稿者の動画数（空欄＝不明）',input('試すページ内動画数',1,v=>{sample.pageContributorCount=v===''?null:Number(v);runPreview()},'number')))
      testFields.append(labeled('詳細情報',select('試す詳細情報',[['ready','取得済み'],['pending','未取得（判定保留を確認）']],'ready',v=>{sample.thumbInfoDone=v==='ready';runPreview()})))
      testFields.append(labeled('動画ID',input('試す動画ID',sample.id,v=>{sample.id=v;runPreview()})))
      testFields.append(labeled('説明文',input('試す説明文','',v=>{sample.description=v;runPreview()})))
      simulator.append(el('p','選択中のルールだけを試します。ルールの休止・全体OFFに関係なく条件を評価します。他のNG設定での非表示や自動取得は再現しません。広告条件は手入力では情報不足になります。','hint'),sourceSelect,loadSamples,testFields,button('判定を更新',()=>runPreview()),testResults)
      host.append(intro,chooser,tools,status,errors,filter,layout,simulator)
      doc.getElementById('advancedRuleAddButton').addEventListener('click',()=>add(0))
      doc.getElementById('advancedRuleSampleButton').addEventListener('click',()=>add(1))
      master.addEventListener('change',()=>change(()=>{draftEnabled=master.checked},false))
      function runPreview() {
        testResults.textContent=''
        const rule=draft[selected];if(!rule)return
        if(validate([rule]).length){testResults.append(el('p','入力を修正してから試してください。'));return}
        const movie=sampleMode==='manual'?sample:liveSamples[Number(sampleMode)]
        if(!movie)return
        const trace=[], result=AdvancedNgRules.evaluateState(movie,rule.expression,trace,0)
        testResults.append(el('strong',result===true?'このルールに一致 → NG対象':result===false?'このルールには一致しません':'情報不足 → 判定保留',result===true?'re-match':''))
        for(const t of trace) {
          const text=t.kind==='condition' ? t.fieldLabel+' '+friendly(t.field,t.operator)+(AdvancedNgRules.OP_META[t.operator].needsValue?'「'+t.expected+'」':'')+' / 実際の値：'+(t.actual?.__notReady?'未取得':t.actual==null?'情報なし':String(t.actual)) : (t.op==='AND'?'すべての条件':'どれかの条件')
          const row=el('div',(t.result===null?'保留':t.result?'一致':'不一致')+' — '+text+(t.not?'（反対にした結果）':''),'re-trace')
          row.style.marginInlineStart=Math.min(t.depth,4)*12+'px';testResults.append(row)
        }
      }
      function refresh() {
        const issues=validate(draft), dirty=snapshot()!==baseline
        master.checked=draftEnabled
        doc.getElementById('advancedRuleCount').textContent=draft.length+'件（使用 '+draft.filter(r=>r.enabled).length+'件）'
        undoButton.disabled=!past.length;redoButton.disabled=!future.length;apply.disabled=!dirty||!!issues.length
        status.textContent=(dirty?'未適用の変更があります。閉じる前に適用してください。':'保存済みの設定です。')+(draftEnabled?'':' 条件を組み合わせるNGは全体OFFです。')
        errors.textContent='';if(issues.length){errors.append(el('strong','入力を確認してください（休止中のルールも対象）'));for(const text of issues.slice(0,8))errors.append(el('div',text))}
        const preview=detail.querySelector('.re-summary');if(preview&&draft[selected])preview.textContent='この動画をNGにする条件：'+describe(draft[selected].expression,friendly)
        if(simulator.open)runPreview()
      }
      function renderList() {
        list.textContent=''
        draft.forEach((rule,i)=>{if(search&&!rule.name.toLowerCase().includes(search.toLowerCase()))return
          const b=button((rule.enabled?'使用':'休止')+' · '+rule.name,()=>{selected=i;render()});b.className='re-rule';b.setAttribute('aria-pressed',String(selected===i));list.append(b)
        })
        if(!list.children.length)list.append(el('p',draft.length?'一致するルールがありません。':'まだルールがありません。上の例から作れます。','hint'))
      }
      function render() {
        selected=Math.max(0,Math.min(selected,draft.length-1));renderList();detail.textContent=''
        const rule=draft[selected]
        if(rule) {
          const name=input('ルール名',rule.name,v=>change(()=>{rule.name=v.trim()||'名前のないルール'},false));name.addEventListener('change',renderList)
          const enabled=el('input');enabled.type='checkbox';enabled.checked=rule.enabled;enabled.addEventListener('change',()=>change(()=>{rule.enabled=enabled.checked}))
          const head=el('div',null,'re-tools');head.append(labeled('このルールを使う',enabled),button('ルールを複製',()=>change(()=>{const copy=clone(rule);copy.id=id();copy.name+=' のコピー';copy.enabled=false;draft.splice(selected+1,0,copy);selected++})),button('ルールを削除',()=>change(()=>{draft.splice(selected,1)}),'danger'))
          detail.append(labeled('ルール名',name),head,el('p','複数のルールは、どれか1つに一致すればNGになります。新しいルールと複製は休止で追加されます。','hint'),el('div',null,'re-summary'))
          detail.append(renderNode(rule.expression,null,0,0))
          detail.append(button('例外を追加（このルールから除く）',()=>change(()=>{rule.expression=group('AND',[rule.expression,group('OR',[condition('tag','contains','')],true)])})))
          detail.append(el('p','例外はこのルールだけに作用します。別ルールや単独NGで一致した動画は表示に戻りません。','hint'))
        }
        refresh()
      }
      function renderNode(node,parent,index,depth) {
        const box=el('div',null,node.kind==='group'?'re-group':'re-condition')
        if(node.kind==='group') {
          const toolbar=el('div',null,'re-tools')
          toolbar.append(select('条件の組み合わせ', [['AND','すべてに当てはまる'],['OR','どれか1つ以上に当てはまる']],node.op,v=>change(()=>{node.op=v})))
          const invert=el('input');invert.type='checkbox';invert.checked=node.not;invert.addEventListener('change',()=>change(()=>{node.not=invert.checked}))
          toolbar.append(labeled('このまとまりを除外条件にする',invert));box.append(toolbar)
          box.append(el('p',node.not?'下の条件に当てはまる動画を、このまとまりでは対象外にします。':node.op==='AND'?'下の条件が全部そろった動画だけが対象です。':'下の条件が1つでも合う動画が対象です。','hint'))
          node.children.forEach((child,i)=>{if(i)box.append(el('div',node.op==='AND'?'かつ':'または','re-join'));box.append(renderNode(child,node,i,depth+1))})
          const addCondition=button('＋ 条件',()=>change(()=>node.children.push(condition())))
          const addGroup=button('＋ 条件のまとまり',()=>change(()=>node.children.push(group('OR',[condition()]))))
          addCondition.disabled=depth>=12;addGroup.disabled=depth>=11
          box.append(addCondition,addGroup)
        } else {
          const fields=el('select');fields.setAttribute('aria-label','条件の項目')
          for(const [label,keys] of fieldGroups){const opt=el('optgroup');opt.label=label;for(const key of keys){const o=el('option',AdvancedNgRules.FIELD_META[key].label);o.value=key;opt.append(o)}fields.append(opt)}
          fields.value=node.field;fields.addEventListener('change',()=>change(()=>{const f=fields.value;node.field=f;node.operator=AdvancedNgRules.FIELD_META[f].operators.includes('gte')?'gte':AdvancedNgRules.FIELD_META[f].operators[0];node.value=f==='lockedTagCount'?11:AdvancedNgRules.FIELD_META[f].type==='number'?1:''}))
          box.append(labeled('何を',fields))
          box.append(labeled('どう比べる',select('条件の比較方法',AdvancedNgRules.FIELD_META[node.field].operators.map(o=>[o,friendly(node.field,o)]),node.operator,v=>change(()=>{node.operator=v}))))
          if(AdvancedNgRules.OP_META[node.operator].needsValue) {
            const numeric=['number','numberOrMissing'].includes(AdvancedNgRules.FIELD_META[node.field].type)
            const value=input('条件の値',node.value??'',v=>change(()=>{node.value=v},false),numeric?'number':'text')
            value.placeholder=numeric?'数を入力':'例：実況';if(numeric){value.step='1';value.min=AdvancedNgRules.FIELD_META[node.field].type==='numberOrMissing'||node.field==='pageContributorCount'?'1':'0'}
            box.append(labeled('値',value))
          }
          const help=dialog._operatorHelpText(node.field,node.operator)+(node.field==='pageContributorCount'?' 広告を除く元の1ページごとに数えます。投稿者不明があるページは保留します。':'')
          box.append(el('p',help,'hint re-wide'))
          const options=el('details',null,'re-wide');options.open=!!node.not;options.append(el('summary','応用：判定を反対にする'))
          const invert=el('input');invert.type='checkbox';invert.checked=node.not;invert.addEventListener('change',()=>change(()=>{node.not=invert.checked}));options.append(labeled('この条件に当てはまらない（情報不足は保留）',invert));box.append(options)
        }
        if(parent) {
          const actions=el('div',null,'re-tools re-wide')
          const up=button('↑ 上へ',()=>change(()=>{[parent.children[index-1],parent.children[index]]=[parent.children[index],parent.children[index-1]]}));up.disabled=index===0
          const down=button('↓ 下へ',()=>change(()=>{[parent.children[index+1],parent.children[index]]=[parent.children[index],parent.children[index+1]]}));down.disabled=index===parent.children.length-1
          actions.append(up,down,button('複製',()=>change(()=>parent.children.splice(index+1,0,clone(node)))),button('削除',()=>change(()=>parent.children.splice(index,1))))
          box.append(actions)
        }
        return box
      }
      simulator.addEventListener('toggle',()=>{if(simulator.open)runPreview()})
      // Warn only when leaving this settings document with unapplied edits.
      doc.defaultView.addEventListener('beforeunload',e=>{if(snapshot()!==baseline){e.preventDefault();e.returnValue=''}})
      render()
      return {validate:()=>validate(draft), canClose:()=>snapshot()===baseline || doc.defaultView.confirm('まだ適用していない変更があります。変更を破棄して閉じますか？')}
    }
    const CSS = `
      .re-editor{min-width:0}.re-editor button:disabled{opacity:.45;cursor:not-allowed}.re-filter{width:100%;padding:9px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text)}.re-intro,.re-summary{padding:12px;background:var(--accent-soft);border-radius:8px;line-height:1.8;overflow-wrap:anywhere}
      .re-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.re-tools select{max-width:100%;min-width:0}
      .re-savebar{position:sticky;top:0;z-index:5;background:var(--panel);padding:8px;border:1px solid var(--line);border-radius:8px}.re-status{line-height:1.7}.re-errors:not(:empty){border-left:3px solid var(--danger);padding:10px;color:var(--danger);margin-bottom:12px}
      .re-layout{display:grid;grid-template-columns:180px minmax(0,1fr);gap:14px;margin-top:14px}.re-list{max-height:620px;overflow:auto}
      .re-rule{display:block;width:100%;white-space:normal;text-align:left;margin-bottom:8px;overflow-wrap:anywhere}.re-rule[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft)}
      .re-label{display:flex;flex-direction:column;gap:5px;min-width:0;font-weight:600}.re-label>input:not([type=checkbox]),.re-label>select,.re-label>textarea{width:100%;min-width:0;max-width:100%;font:inherit;font-weight:400;border:1px solid var(--line);border-radius:6px;padding:8px;background:var(--panel);color:var(--text)}.re-editor .hint{margin:5px 0;padding:8px;font-size:12px;line-height:1.6}.re-editor input[type=checkbox]{align-self:flex-start}
      .re-group{padding:12px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;margin-top:10px;background:var(--panel2);min-width:0}
      .re-group .re-group{padding:8px;margin-left:0}.re-condition{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:12px;background:var(--panel);border:1px solid var(--line);border-radius:6px}
      .re-wide{grid-column:1/-1}.re-join{padding:7px;color:var(--accent);font-weight:700}.re-simulator{margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:8px}
      .re-test-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.re-test-fields[hidden]{display:none}.re-trace{padding:7px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.re-match{color:var(--danger)}
      .re-editor button:focus-visible,.re-editor input:focus-visible,.re-editor select:focus-visible,.re-editor summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
      @media(max-width:720px){.re-layout{grid-template-columns:1fr}.re-list{max-height:180px}.re-condition,.re-test-fields{grid-template-columns:1fr}.re-group{padding:7px}.re-condition{padding:8px}.re-editor button{min-height:36px}}
    `
    return {mount,validate,describe}
  })()
