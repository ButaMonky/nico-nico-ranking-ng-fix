  // BRUSH-074: one list of every NG rule, written as sentences.
  //
  // Storage stays compatible: a one-condition rule (tag, title, owner, video)
  // is kept in its fast list (ngTags, ngUserIds …) because pre-paint hiding
  // and the NG memory read those lists directly; everything else is a
  // compound rule (advancedNgRulesJson). The list shows both the same way.
  // Pausing a one-condition rule moves it to pausedNgEntriesJson and back.
  var NgRuleList = (function() {
    const KINDS = {
      tag:{label:'タグ', bg:'#e7f0ff', fg:'#0b4fa8'},
      owner:{label:'投稿者', bg:'#fff1e5', fg:'#8a4200'},
      title:{label:'タイトル', bg:'#e3f6f3', fg:'#0b6157'},
      movie:{label:'動画', bg:'#eef0f2', fg:'#3d444d'},
      combo:{label:'組み合わせ', bg:'#f1ecff', fg:'#5232b8'},
    }
    const FILTERS = [['all','すべて'],['tag','タグ'],['owner','投稿者'],['title','タイトル'],['movie','動画'],['combo','組み合わせ']]
    // One-condition rules and how each reads.
    const SIMPLE = {
      ngTags:{kind:'tag', parts:v => ['タグ「', v, '」がある動画を隠す']},
      ngLockedTags:{kind:'tag', parts:v => ['ロックされたタグ「', v, '」がある動画を隠す']},
      ngTitles:{kind:'title', parts:v => ['タイトルに「', v, '」を含む動画を隠す']},
      ngUserIds:{kind:'owner', parts:(v, text) => text ? ['投稿者「', text, '」（ID ' + v + '）の動画を隠す'] : ['ユーザーID「', String(v), '」の動画を隠す']},
      ngChannelIds:{kind:'owner', parts:(v, text) => text ? ['チャンネル「', text, '」（ch' + v + '）の動画を隠す'] : ['チャンネル「', 'ch' + v, '」の動画を隠す']},
      ngUserNames:{kind:'owner', parts:v => ['投稿者名に「', v, '」を含む動画を隠す']},
      ngMovies:{kind:'movie', parts:(v, text) => ['動画「', text || v, '」を隠す']},
    }
    const CSS = `
.nr-wrap{display:flex;flex-direction:column;gap:12px}
.nr-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.nr-summary{margin:0;color:var(--muted);font-size:13px}.nr-summary strong{color:var(--text);font-size:17px}
.nr-add{height:40px;padding:0 18px;border-radius:20px;border:0;background:var(--accent);color:#fff;font-weight:700;font-size:14px;cursor:pointer}
.nr-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.nr-search{height:34px;border:1px solid var(--line);border-radius:17px;padding:0 14px;min-width:240px;font:inherit;background:var(--panel);color:var(--text)}
.nr-chip{height:32px;padding:0 12px;border-radius:16px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit;font-size:12px;cursor:pointer}
.nr-chip[aria-pressed=true]{background:var(--text);color:var(--panel);border-color:var(--text)}
.nr-head{display:flex;gap:10px;font-size:11px;color:var(--muted);padding:0 4px}
.nr-head span:first-child{flex:1}.nr-head .n{width:84px;text-align:right}.nr-head .u{width:52px;text-align:center}.nr-head .a{width:72px}
.nr-list{display:flex;flex-direction:column}
.nr-row{display:flex;align-items:center;gap:10px;padding:9px 4px;border-top:1px solid var(--line)}
.nr-row.paused{opacity:.62}
.nr-kind{flex:0 0 auto;width:76px;text-align:center;padding:3px 0;border-radius:6px;font-size:11px;font-weight:700}
.nr-text{flex:1;min-width:0;margin:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
.nr-text .nr-name{display:block;font-size:11px;color:var(--muted)}
.nr-count{width:84px;text-align:right;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.nr-count.none{font-weight:400;color:var(--muted);font-size:12px}
.nr-switch{width:52px;display:flex;justify-content:center}
.nr-switch button{width:42px;height:24px;border-radius:12px;border:0;position:relative;cursor:pointer;background:#b8c0c9;padding:0}
.nr-switch button[aria-checked=true]{background:var(--accent)}
.nr-switch button span{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:9px;background:#fff;transition:left .12s}
.nr-switch button[aria-checked=true] span{left:21px}
.nr-actions{width:92px;flex:none;display:flex;gap:2px;justify-content:flex-end}
.nr-actions button{height:30px;padding:0 6px;white-space:nowrap;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted);font:inherit;font-size:12px;cursor:pointer}
.nr-actions button:hover{border-color:var(--line);color:var(--text)}
.nr-inline-num{width:56px;height:26px;margin:0 4px;font:inherit;border:1px solid var(--line);border-radius:6px;padding:0 6px;background:var(--panel);color:var(--text)}
.nr-empty{color:var(--muted);font-size:13px;padding:18px 4px}
.nr-panel{border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;background:var(--panel)}
.nr-kinds{display:flex;flex-direction:column;gap:8px}
.nr-kindbtn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-align:left;font:inherit;cursor:pointer}
.nr-kindbtn[aria-pressed=true]{border:2px solid var(--accent);padding:9px 11px}
.nr-kindbtn b{display:block;font-size:13px}.nr-kindbtn small{display:block;font-size:11px;color:var(--muted)}
.nr-form{display:flex;flex-direction:column;gap:12px}
.nr-form label.nr-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted)}
.nr-form input[type=text],.nr-form input[type=number]{height:40px;border:1px solid var(--line);border-radius:8px;padding:0 12px;font:inherit;font-size:15px;background:var(--panel);color:var(--text)}
.nr-suggest{display:flex;flex-wrap:wrap;gap:6px}
.nr-preview{border-radius:10px;background:var(--panel2);padding:10px 12px;font-size:13px}
.nr-preview strong{font-size:16px}
.nr-formbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.nr-will{margin:0;font-size:12px;color:var(--muted)}.nr-will strong{color:var(--text)}
.nr-msg{margin:0;font-size:12px;color:var(--accent);min-height:1em}
@media (max-width:640px){.nr-panel{grid-template-columns:1fr}}
`
    const valueOf = v => v === Object(v) ? v.value : v
    const textOf = v => v === Object(v) ? (v.text || '') : ''
    const upper = s => String(s == null ? '' : s).toUpperCase()

    // Plain-language sentence for a compound expression.
    const condText = function(c) {
      const v = String(c.value == null ? '' : c.value)
      const meta = AdvancedNgRules.FIELD_META[c.field]
      const label = meta ? meta.label.replace(/^🔒\s*/, '') : c.field
      let t
      switch (c.field) {
        case 'tag': t = c.operator === 'contains' ? 'タグ「' + v + '」がある' : c.operator === 'notContains' ? 'タグ「' + v + '」がない' : c.operator === 'exists' ? 'タグがある' : 'タグがない'; break
        case 'lockedTag': t = c.operator === 'contains' ? 'ロックされたタグ「' + v + '」がある' : c.operator === 'notContains' ? 'ロックされたタグ「' + v + '」がない' : c.operator === 'exists' ? 'ロックされたタグがある' : 'ロックされたタグがない'; break
        case 'pageKind': {
          const name = (AdvancedNgRules.PAGE_KINDS.find(k => k[0] === c.value) || [0, v])[1]
          t = '見ている画面が' + name + (c.operator === 'neq' ? 'ではない' : ''); break
        }
        case 'genre': t = 'ジャンルが「' + v + '」' + (c.operator === 'neq' ? 'ではない' : ''); break
        case 'lockedTagCount': case 'tagCount': {
          const what = c.field === 'lockedTagCount' ? 'ロックされたタグ' : 'タグ'
          const ops = {gt:'個より多い', gte:'個以上', lt:'個より少ない', lte:'個以下', eq:'個', neq:'個ではない'}
          t = what + 'が' + v + (ops[c.operator] || ''); break
        }
        default: {
          const ops = {gt:'より大きい', gte:'以上', lt:'より少ない', lte:'以下', eq:'と同じ', neq:'ではない',
            contains:'を含む', notContains:'を含まない', exists:'がある', notExists:'がない', isTrue:'が一致', isFalse:'が一致しない'}
          const isNum = meta && (meta.type === 'number' || meta.type === 'numberOrMissing')
          if (c.operator === 'exists' || c.operator === 'notExists' || c.operator === 'isTrue' || c.operator === 'isFalse') t = label + ops[c.operator]
          else if (isNum) t = label + 'が' + v + (c.operator === 'eq' ? '' : ops[c.operator])
          else t = label + (c.operator === 'contains' || c.operator === 'notContains' ? 'に「' + v + '」' : 'が「' + v + '」') + ops[c.operator]
        }
      }
      return c.not ? '「' + t + '」ではない' : t
    }
    const exprText = function(node, depth) {
      depth = depth || 0
      if (!node) return ''
      if (node.kind === 'condition') return condText(node)
      const kids = (node.children || []).map(n => exprText(n, depth + 1)).filter(Boolean)
      if (!kids.length) return '（条件なし）'
      const joined = kids.join(node.op === 'OR' ? '、または' : '、かつ')
      const wrapped = depth > 0 && kids.length > 1 ? '（' + joined + '）' : joined
      return node.not ? wrapped + 'に当てはまらない' : wrapped
    }

    // Interpret what the user typed for an owner.
    const parseOwner = function(raw) {
      const s = String(raw || '').trim()
      let m = /nicovideo\.jp\/user\/(\d+)/.exec(s)
      if (m) return {store:'ngUserIds', value:m[1], label:'ユーザーID ' + m[1]}
      m = /ch\.nicovideo\.jp\/(?:channel\/)?ch(\d+)/.exec(s) || /^ch(\d+)$/i.exec(s)
      if (m) return {store:'ngChannelIds', value:m[1], label:'チャンネル ch' + m[1]}
      if (/^\d+$/.test(s)) return {store:'ngUserIds', value:s, label:'ユーザーID ' + s}
      if (s) return {store:'ngUserNames', value:s, label:'名前に「' + s + '」を含む投稿者'}
      return null
    }
    const parseMovie = function(raw) {
      const m = /\b((?:sm|so|nm|ss)\d+)\b/.exec(String(raw || ''))
      return m ? m[1] : null
    }

    function mount(dialog) {
      const doc = dialog.doc, config = dialog.config
      const host = doc.getElementById('ngRuleListHost')
      if (!host) return null
      const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style)
      const el = (tag, text, cls) => { const e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e }
      const btn = (text, fn, cls) => { const e = el('button', text, cls); e.type = 'button'; e.addEventListener('click', fn); return e }
      let filter = 'all', query = '', adding = false, addKind = 'tag', message = ''

      const paused = () => { try { const v = JSON.parse(config.pausedNgEntriesJson.value || '[]'); return Array.isArray(v) ? v : [] } catch (e) { return [] } }
      const setPaused = list => { config.pausedNgEntriesJson.value = JSON.stringify(list) }
      const rules = () => AdvancedNgRules.parse(config.advancedNgRulesJson.value)
      const saveRules = list => { config.advancedNgRulesJson.value = JSON.stringify(list); dialog.ruleEditor?.reload?.() }
      const previewMovies = () => typeof config._nrnRulePreviewMovies === 'function' ? config._nrnRulePreviewMovies() : []
      const memCount = (store, value) => typeof NgVerdictCache !== 'undefined' ? NgVerdictCache.countFor(store, value) : null

      const collect = function() {
        const rows = []
        for (const [store, def] of Object.entries(SIMPLE)) {
          for (const entry of config[store].arrayWithText) {
            const v = valueOf(entry)
            rows.push({kind:def.kind, parts:def.parts(v, textOf(entry)), count:memCount(store, v), on:true,
              key:store + ':' + v, toggle:() => pauseSimple(store, entry), remove:() => removeSimple(store, v)})
          }
        }
        for (const p of paused()) {
          const def = SIMPLE[p.store]; if (!def) continue
          rows.push({kind:def.kind, parts:def.parts(p.value, p.text), count:null, on:false, paused:true,
            key:p.store + ':' + p.value, toggle:() => resumeSimple(p), remove:() => setPaused(paused().filter(x => !(x.store === p.store && String(x.value) === String(p.value))))})
        }
        // Locked-tag count (a setting of its own, shown as a rule).
        const n = config.ngLockedTagCountThreshold.value
        rows.push({kind:'combo', lockCount:true, on:Boolean(config.ngLockedTagCountEnabled.value),
          count:typeof NgVerdictCache !== 'undefined' && config.ngLockedTagCountEnabled.value ? (NgVerdictCache.groupSummary().find(g => g.key === 'k:' + n)?.count || 0) : null,
          key:'lockCount', toggle:() => { config.ngLockedTagCountEnabled.value = !config.ngLockedTagCountEnabled.value }, remove:null})
        const master = Boolean(config.advancedNgRulesEnabled.value)
        rules().forEach(rule => {
          const context = AdvancedNgRules.usesContext(rule.expression)
          rows.push({kind:'combo', name:rule.name, sentence:'『' + exprText(rule.expression) + '』に当てはまる動画を隠す',
            count:context ? 'context' : (typeof NgVerdictCache !== 'undefined' && rule.enabled && master ? NgVerdictCache.countForRule(rule.id, config) : null),
            on:rule.enabled && master, key:'rule:' + rule.id, ruleId:rule.id,
            toggle:() => toggleRule(rule.id), remove:() => saveRules(rules().filter(r => r.id !== rule.id)),
            edit:() => { activateTab('filter'); dialog.ruleEditor?.focusRule?.(rule.id) }})
        })
        return rows
      }
      const pauseSimple = async function(store, entry) {
        const v = valueOf(entry)
        setPaused(paused().concat({store, value:v, text:textOf(entry)}))
        await config[store].removeAsync([v])
        render()
      }
      const resumeSimple = async function(p) {
        await config[p.store].addAsync(p.value, p.text || undefined)
        setPaused(paused().filter(x => !(x.store === p.store && String(x.value) === String(p.value))))
        render()
      }
      const removeSimple = async function(store, v) { await config[store].removeAsync([v]); render() }
      const toggleRule = function(id) {
        const list = rules(), rule = list.find(r => r.id === id); if (!rule) return
        const master = Boolean(config.advancedNgRulesEnabled.value)
        const turnOn = !(rule.enabled && master)
        rule.enabled = turnOn
        saveRules(list)
        if (turnOn && !master) config.advancedNgRulesEnabled.value = true
        render()
      }
      const activateTab = name => doc.querySelector('.tabButton[data-tab="' + name + '"]')?.click()

      // ---- add panel ----
      const ADD_KINDS = [
        ['tag', 'タグ', '例：ゲーム実況 が付いた動画'],
        ['owner', '投稿者・チャンネル', 'ID・ページのURL・名前で指定'],
        ['title', 'タイトルの言葉', '例：「ネタバレ」を含むタイトル'],
        ['movie', 'この動画だけ', '動画IDかURLを貼り付け'],
        ['lockCount', 'ロックされたタグの数', '例：11個以上ロックされた動画'],
        ['combo', '条件を組み合わせる', '「〜で、かつ〜」「ランキング以外」など'],
      ]
      const renderAdd = function(box) {
        box.className = 'nr-panel'
        const kinds = el('div', null, 'nr-kinds')
        for (const [k, title, sub] of ADD_KINDS) {
          const b = btn('', () => { if (k === 'combo') { adding = false; render(); activateTab('filter'); dialog.ruleEditor?.addNew?.(0); return } addKind = k; render() }, 'nr-kindbtn')
          b.setAttribute('aria-pressed', String(addKind === k))
          const kind = KINDS[k === 'lockCount' ? 'combo' : k]
          const chip = el('span', null, 'nr-kind'); chip.style.background = kind.bg; chip.style.color = kind.fg; chip.style.width = '64px'; chip.textContent = k === 'lockCount' ? 'ロック数' : kind.label
          const t = el('span'); t.append(el('b', title), el('small', sub))
          b.append(chip, t); kinds.append(b)
        }
        const form = el('div', null, 'nr-form')
        const will = el('p', null, 'nr-will'), preview = el('div', null, 'nr-preview'), msg = el('p', message, 'nr-msg')
        message = ''
        const movies = previewMovies()
        let current = () => null
        const field = (labelText, input) => { const l = el('label', null, 'nr-field'); l.append(el('span', labelText), input); return l }
        const textInput = (placeholder) => { const i = el('input'); i.type = 'text'; i.placeholder = placeholder; return i }
        const showPreview = (matchFn, willText) => {
          will.textContent = ''; will.append('保存される内容：'); will.append(el('strong', willText || '（入力してください）'))
          preview.textContent = ''
          if (!movies.length) { preview.textContent = 'このページの動画で試せます（設定画面をページ上で開いたとき）。'; return }
          const hit = matchFn ? movies.filter(matchFn).length : 0
          preview.append('いま開いているページでは '); preview.append(el('strong', hit + '件')); preview.append(' が隠れます')
        }
        if (addKind === 'tag') {
          const input = textInput('隠したいタグ')
          const lockOnly = el('input'); lockOnly.type = 'checkbox'
          const lockLabel = el('label'); lockLabel.append(lockOnly, ' ロックされたタグのときだけ隠す')
          const freq = new Map()
          for (const m of movies) for (const t of m.tags || []) freq.set(t.name, (freq.get(t.name) || 0) + 1)
          const suggest = el('div', null, 'nr-suggest')
          ;[...freq].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([name]) => suggest.append(btn(name, () => { input.value = name; update() }, 'nr-chip')))
          const update = () => {
            const v = input.value.trim()
            showPreview(v && (m => (m.tags || []).some(t => upper(t.name) === upper(v) && (!lockOnly.checked || t.lock))),
              v ? (lockOnly.checked ? 'ロックされたタグ「' + v + '」がある動画を隠す' : 'タグ「' + v + '」がある動画を隠す') : '')
          }
          input.addEventListener('input', update); lockOnly.addEventListener('change', update)
          current = () => { const v = input.value.trim(); return v ? {store:lockOnly.checked ? 'ngLockedTags' : 'ngTags', value:v} : null }
          form.append(field('タグ', input))
          if (suggest.children.length) { const s = el('div'); s.append(el('p', 'このページにあるタグから選ぶ', 'nr-will'), suggest); form.append(s) }
          form.append(lockLabel); update()
        } else if (addKind === 'owner') {
          const input = textInput('ユーザーID・チャンネルID・ページのURL・名前')
          const update = () => {
            const o = parseOwner(input.value)
            showPreview(o && (m => {
              const c = m.contributor || {}
              if (o.store === 'ngUserNames') return upper(c.name).includes(upper(o.value))
              return String(c.id) === String(o.value) && (o.store === 'ngChannelIds' ? c.type === 'channel' : c.type !== 'channel')
            }), o ? o.label + ' の動画を隠す' : '')
          }
          input.addEventListener('input', update)
          current = () => parseOwner(input.value)
          form.append(field('投稿者', input), el('p', 'URLは https://www.nicovideo.jp/user/… や https://ch.nicovideo.jp/ch… のどちらでも。数字だけならユーザーID、それ以外の文字は名前として扱います。', 'nr-will')); update()
        } else if (addKind === 'title') {
          const input = textInput('タイトルに含まれる言葉')
          const update = () => { const v = input.value.trim(); showPreview(v && (m => upper(m.title).includes(upper(v))), v ? 'タイトルに「' + v + '」を含む動画を隠す' : '') }
          input.addEventListener('input', update)
          current = () => { const v = input.value.trim(); return v ? {store:'ngTitles', value:v} : null }
          form.append(field('言葉', input)); update()
        } else if (addKind === 'movie') {
          const input = textInput('sm12345678 や動画のURL')
          const update = () => { const id = parseMovie(input.value); showPreview(id && (m => m.id === id), id ? '動画「' + id + '」を隠す' : '') }
          input.addEventListener('input', update)
          current = () => { const id = parseMovie(input.value); return id ? {store:'ngMovies', value:id} : null }
          form.append(field('動画', input)); update()
        } else if (addKind === 'lockCount') {
          const input = el('input'); input.type = 'number'; input.min = '1'; input.max = '11'; input.value = String(config.ngLockedTagCountThreshold.value || 11)
          const update = () => { const n = Number(input.value); showPreview(n >= 1 && (m => (m.tags || []).filter(t => t.lock).length >= n), n >= 1 ? 'ロックされたタグが' + n + '個以上ある動画を隠す' : '') }
          input.addEventListener('input', update)
          current = () => { const n = Math.trunc(Number(input.value)); return n >= 1 && n <= 11 ? {lockCount:n} : null }
          form.append(field('ロックされたタグの数（1〜11）', input), el('p', '他の条件と組み合わせたいとき（例：ランキングでは使わない）は「条件を組み合わせる」で作れます。', 'nr-will')); update()
        }
        const bar = el('div', null, 'nr-formbar')
        const buttons = el('div', null, 'nr-tools')
        buttons.append(btn('キャンセル', () => { adding = false; render() }), btn('追加する', async () => {
          const r = current()
          if (!r) { msg.textContent = '入力を確認してください。'; return }
          if (r.lockCount) { config.ngLockedTagCountThreshold.value = r.lockCount; config.ngLockedTagCountEnabled.value = true }
          else if (!(await config[r.store].addAsync(r.value))) { msg.textContent = 'すでに登録されています。'; return }
          adding = false; message = ''; render()
        }, 'primary'))
        bar.append(will, buttons)
        form.append(preview, bar, msg)
        box.append(kinds, form)
      }

      // ---- list ----
      const render = function() {
        host.textContent = ''
        const wrap = el('div', null, 'nr-wrap')
        const rows = collect()
        const top = el('div', null, 'nr-top')
        const summary = el('p', null, 'nr-summary')
        summary.append('NGルール '); summary.append(el('strong', String(rows.length))); summary.append(' 件')
        if (typeof NgVerdictCache !== 'undefined') { summary.append('　·　記憶しているNG動画 '); summary.append(el('strong', NgVerdictCache.size.toLocaleString())); summary.append(' 件') }
        top.append(summary, btn('＋ NGルールを追加', () => { adding = !adding; render() }, 'nr-add'))
        wrap.append(top)
        if (adding) { const box = el('div'); renderAdd(box); wrap.append(box) }
        const tools = el('div', null, 'nr-tools')
        const search = el('input', null, 'nr-search'); search.type = 'search'; search.placeholder = 'ルールを検索（タグ名・投稿者名など）'; search.value = query
        search.addEventListener('input', () => { query = search.value; renderRows() })
        tools.append(search)
        const counts = {all:rows.length}; for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1
        for (const [k, label] of FILTERS) {
          const c = btn(label + ' ' + (counts[k] || 0), () => { filter = k; render() }, 'nr-chip')
          c.setAttribute('aria-pressed', String(filter === k)); tools.append(c)
        }
        wrap.append(tools)
        const head = el('div', null, 'nr-head')
        head.append(el('span', 'ルール（隠した数が多い順）'), el('span', '隠した動画', 'n'), el('span', '使う', 'u'), el('span', '', 'a'))
        wrap.append(head)
        const list = el('div', null, 'nr-list')
        wrap.append(list)
        wrap.append(el('p', '数はNG記憶に残っている動画の数です。見ている画面や検索に左右されるルールは記憶しないため「記憶なし」と表示します。細かい編集や従来の一覧は「詳しいNG設定」タブにあります。', 'hint'))
        host.append(wrap)
        const renderRows = function() {
          list.textContent = ''
          const q = upper(query.trim())
          const visible = rows.filter(r => (filter === 'all' || r.kind === filter) &&
            (!q || upper((r.parts || []).join('') + (r.name || '') + (r.sentence || '')).includes(q)))
            .sort((a, b) => (typeof b.count === 'number' ? b.count : -1) - (typeof a.count === 'number' ? a.count : -1))
          if (!visible.length) { list.append(el('p', rows.length ? '一致するルールがありません。' : 'まだNGルールがありません。「＋ NGルールを追加」から作れます。', 'nr-empty')); return }
          for (const r of visible) {
            const row = el('div', null, 'nr-row' + (r.on ? '' : ' paused'))
            const kind = KINDS[r.kind]
            const chip = el('span', r.lockCount ? 'ロック数' : kind.label, 'nr-kind'); chip.style.background = kind.bg; chip.style.color = kind.fg
            const text = el('p', null, 'nr-text')
            if (r.lockCount) {
              const num = el('input', null, 'nr-inline-num'); num.type = 'number'; num.min = '1'; num.max = '11'; num.value = String(config.ngLockedTagCountThreshold.value)
              num.setAttribute('aria-label', 'ロックされたタグの数')
              num.addEventListener('change', () => { const n = Math.trunc(Number(num.value)); if (n >= 1 && n <= 11) config.ngLockedTagCountThreshold.value = n; render() })
              text.append('ロックされたタグが', num, '個以上ある動画を隠す')
            } else if (r.sentence) {
              if (r.name) text.append(el('span', r.name, 'nr-name'))
              text.append(r.sentence)
            } else {
              r.parts.forEach((p, i) => text.append(i % 2 ? el('strong', String(p)) : String(p)))
            }
            if (r.paused) text.append(el('span', '　一時停止中', 'nr-name'))
            const count = el('span', null, 'nr-count')
            if (r.count === 'context') { count.textContent = '記憶なし'; count.classList.add('none') }
            else if (typeof r.count === 'number') count.textContent = r.count.toLocaleString() + '件'
            else { count.textContent = '—'; count.classList.add('none') }
            const sw = el('span', null, 'nr-switch')
            const toggle = btn('', r.toggle); toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(Boolean(r.on))); toggle.setAttribute('aria-label', 'このルールを使う'); toggle.append(el('span'))
            sw.append(toggle)
            const actions = el('span', null, 'nr-actions')
            if (r.edit) actions.append(btn('編集', r.edit))
            if (r.remove) actions.append(btn('削除', () => { if (doc.defaultView.confirm('このNGルールを削除しますか？')) { Promise.resolve(r.remove()).then(render) } }))
            row.append(chip, text, count, sw, actions)
            list.append(row)
          }
        }
        renderRows()
      }
      // Keep the list current when other parts of the dialog change settings.
      for (const key of ['ngTags','ngLockedTags','ngTitles','ngUserIds','ngChannelIds','ngUserNames','ngMovies',
        'ngLockedTagCountEnabled','ngLockedTagCountThreshold','advancedNgRulesEnabled','advancedNgRulesJson','pausedNgEntriesJson']) {
        config[key]?.on?.('changed', () => { if (!host.contains(doc.activeElement) || doc.activeElement?.type === 'button') render() })
      }
      render()
      return {render, exprText}
    }
    return {mount, exprText, parseOwner, parseMovie, SIMPLE}
  })()
