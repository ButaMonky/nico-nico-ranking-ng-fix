  // BRUSH-060: NG判定結果の記憶（高速非表示）。
  //
  // タグ・投稿者・ロックタグ数・複合NGでNGと確定した動画IDを、NGになった理由の
  // 「NG設定ごと」にまとめて端末へ保存する。次回以降は詳細取得（getthumbinfo）を
  // 待たずに、カードがDOMへ入った直後（描画前のMutationObserver）に仮非表示にし、
  // AutoFill候補は通信前に落とす。手動の「NG動画ID」一覧とは別に保存する。
  //
  // 設定ごとのグループ（キー）:
  //   u:<id>    NG投稿者ID/チャンネルID
  //   n:<NAME>  NG投稿者名の語
  //   t:<TAG>   NGタグ
  //   l:<TAG>   NGロックタグ
  //   k:<n>     ロックタグ数NG（有効かつ同じしきい値）
  //   r:<hash>  複合NGの各ルール（ルールIDと条件式から作る。1件の編集はそのルールだけ）
  //   i:<TERM>  NGタイトルの語（即判定できるが、設定ごとの件数表示のために記録）
  // 動画IDNGは記録しない（一覧そのものが動画ID）。
  //
  // 消える条件（日時では消さない）:
  //   - そのNG設定を削除・変更したとき、グループごと削除（設定読み込み後に確定）
  //   - 通常の判定でNGでなくなった動画（タグ変更など）は、その1件を削除
  //   - 合計が上限を超えたとき、いちばん大きいグループの古い順に削除
  // 保存形式: {"v":2,"b":{"t:FOO":"sm1 sm2 so3", ...}}（IDだけを空白区切り）。
  var NgVerdictCache = (function() {
    const KEY = 'ngVerdictCache'
    const ENABLED_KEY = 'ngVerdictCacheEnabled'
    const MAX_ENTRIES = 200000   // 約2MB。1件あたり動画ID＋空白の約10バイト
    const VIDEO_ID = /^(sm|so|nm|ss)[0-9]+$/
    const PREHIDE_ATTR = 'data-nrn-prehide'
    const SAFETY_RELEASE_MS = 20000
    const CSS = '[' + PREHIDE_ATTR + '] { display: none !important; }'

    const hash = function(text) {
      let h = 2166136261
      for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0 }
      return h.toString(36)
    }
    const upperSet = values => new Set(values.filter(v => typeof v === 'string').map(v => v.toUpperCase()))
    const idSet = values => new Set(values.map(v => String(v)))
    const valueOf = v => v === Object(v) ? v.value : v

    // Enabled advanced rules -> per-rule key. Editing one rule's condition
    // (or disabling it) changes only that rule's key.
    const ruleKeys = function(enabled, json) {
      const map = new Map()
      if (!enabled || typeof AdvancedNgRules === 'undefined') return map
      for (const rule of AdvancedNgRules.parse(json)) {
        if (rule.enabled) map.set(rule.id, 'r:' + hash(rule.id + '\u0000' + JSON.stringify(rule.expression)))
      }
      return map
    }

    // Which group keys the current settings allow. Built from Config in the
    // normal path and from raw GM values at document-start.
    const index = function(lists) {
      const rules = ruleKeys(lists.rulesEnabled, lists.rulesJson)
      return {
        ownerIds: idSet([...lists.userIds, ...lists.channelIds]),
        ownerNames: upperSet(lists.userNames),
        tags: upperSet(lists.tags),
        lockedTags: upperSet(lists.lockedTags),
        titles: upperSet(lists.titles || []),
        lockCount: lists.lockCountEnabled ? String(lists.lockCountThreshold) : null,
        ruleIdToKey: rules,
        ruleKeys: new Set(rules.values()),
      }
    }
    const indexFromConfig = function(config) {
      return index({
        userIds: config.ngUserIds.array, channelIds: config.ngChannelIds.array,
        userNames: config.ngUserNames.array, tags: config.ngTags.array,
        lockedTags: config.ngLockedTags.array, titles: config.ngTitles?.array || [],
        lockCountEnabled: config.ngLockedTagCountEnabled.value,
        lockCountThreshold: config.ngLockedTagCountThreshold.value,
        rulesEnabled: config.advancedNgRulesEnabled.value,
        rulesJson: config.advancedNgRulesJson.value,
      })
    }
    const indexFromRaw = function(read) {
      const list = key => { try { const v = JSON.parse(read(key, '[]')); return Array.isArray(v) ? v.map(valueOf) : [] } catch (e) { return [] } }
      return index({
        userIds: list('ngUserIds'), channelIds: list('ngChannelIds'),
        userNames: list('ngUserNames'), tags: list('ngTags'), lockedTags: list('ngLockedTags'), titles: list('ngTitles'),
        lockCountEnabled: read('ngLockedTagCountEnabled', false) === true,
        lockCountThreshold: read('ngLockedTagCountThreshold', 5),
        rulesEnabled: read('advancedNgRulesEnabled', false) === true,
        rulesJson: read('advancedNgRulesJson', '[]'),
      })
    }
    const valid = function(key, idx) {
      if (typeof key !== 'string' || key.length < 3 || key[1] !== ':') return false
      const v = key.slice(2)
      switch (key[0]) {
        case 'u': return idx.ownerIds.has(v)
        case 'n': return idx.ownerNames.has(v)
        case 't': return idx.tags.has(v)
        case 'l': return idx.lockedTags.has(v)
        case 'i': return idx.titles.has(v)
        case 'k': return idx.lockCount !== null && idx.lockCount === v
        case 'r': return idx.ruleKeys.has(key)
        default: return false
      }
    }

    // The group a settled movie belongs to, or null when nothing cacheable
    // applies (not NG, or NG only by video ID/title which are already instant).
    const reasonOf = function(movie, idx) {
      if (!movie || !movie.ng) return null
      const c = movie.contributor
      if (c && c.ngId && c.id != null && c.id !== '') return 'u:' + String(c.id)
      if (c && c.ngName) return 'n:' + String(c.ngName).toUpperCase()
      for (const tag of movie.tags || []) {
        if (tag.ngByNormal) return 't:' + String(tag.name).toUpperCase()
        if (tag.ngByLock) return 'l:' + String(tag.name).toUpperCase()
      }
      if (movie.ngByLockedTagCount && idx.lockCount !== null) return 'k:' + idx.lockCount
      if (movie.ngTitle) return 'i:' + String(movie.ngTitle).toUpperCase()
      if (movie.ngByAdvancedRule) {
        for (const m of movie.advancedRuleMatches || []) {
          const key = idx.ruleIdToKey.get(m.id)
          if (key) return key
        }
      }
      return null
    }

    // ---- persisted form <-> memory ----
    const parse = function(raw) {
      const buckets = new Map()
      let obj
      try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return buckets }
      if (!obj || obj.v !== 2 || !obj.b || typeof obj.b !== 'object') return buckets
      for (const [key, ids] of Object.entries(obj.b)) {
        if (typeof key !== 'string' || key[1] !== ':' || typeof ids !== 'string') continue
        const list = ids.split(' ').filter(id => VIDEO_ID.test(id))
        if (list.length) buckets.set(key, list)
      }
      return buckets
    }
    const serialize = function(buckets) {
      const b = {}
      for (const [key, ids] of buckets) if (ids.length) b[key] = ids.join(' ')
      return JSON.stringify({v:2, b})
    }
    const total = buckets => { let n = 0; for (const ids of buckets.values()) n += ids.length; return n }
    // Over the cap: drop the oldest IDs of the largest group first.
    const enforceCap = function(buckets, max = MAX_ENTRIES) {
      let over = total(buckets) - max
      while (over > 0) {
        let largestKey = null, largest = 0
        for (const [key, ids] of buckets) if (ids.length > largest) { largest = ids.length; largestKey = key }
        if (!largestKey) break
        const ids = buckets.get(largestKey)
        const cut = Math.min(over, Math.max(1, ids.length - Math.floor(max / Math.max(1, buckets.size))))
        ids.splice(0, cut)
        if (!ids.length) buckets.delete(largestKey)
        over -= cut
      }
      return buckets
    }

    // ---- state shared by the early hider and the normal pipeline ----
    let buckets = new Map()     // key -> [id, ...] (oldest first)
    let byId = new Map()        // id -> key
    let early = null            // {observer, hidden:Set, doc}
    const stats = {loaded:0, prehidden:0, confirmed:0, cleared:0, learned:0, released:0, prefiltered:0, droppedGroups:0}
    const removedIds = new Set()     // to apply when merging with other tabs
    const droppedGroups = new Set()
    let store = null, saveTimer = null
    let configIndex = null

    const rebuildIndex = function() {
      byId = new Map()
      for (const [key, ids] of buckets) for (const id of ids) byId.set(id, key)
    }
    const removeId = function(id) {
      const key = byId.get(id)
      if (!key) return false
      byId.delete(id)
      const ids = buckets.get(key)
      if (ids) {
        const at = ids.indexOf(id)
        if (at >= 0) ids.splice(at, 1)
        if (!ids.length) buckets.delete(key)
      }
      return true
    }
    const addId = function(id, key) {
      const prev = byId.get(id)
      if (prev === key) return false
      if (prev) removeId(id)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(id)
      byId.set(id, key)
      return true
    }
    const currentValid = function(idx) {
      const ids = new Set()
      for (const [key, list] of buckets) if (valid(key, idx)) for (const id of list) ids.add(id)
      return ids
    }
    const supportedPath = () => /^\/(search|tag|search_shorts|tag_shorts)\/./.test(location.pathname) || /^\/ranking(\/?$|\/(genre|custom))/.test(location.pathname)
    // BRUSH-068: besides remembered verdicts, a card's own markup already
    // carries its video ID, owner link and title when it is inserted, so
    // NG video IDs, NG user/channel IDs and NG title words hide it before the
    // first paint too, with no detail request and no memory needed.
    const OWNER_ID = /\/user\/(\d+)|ch\.nicovideo\.jp\/ch(\d+)/
    const domMatch = function(el, id, rules) {
      if (!rules) return false
      if (rules.movies.has(id)) return true
      if (rules.owners.size) {
        for (const a of el.querySelectorAll('a[href*="/user/"], a[href*="ch.nicovideo.jp/ch"]')) {
          const m = OWNER_ID.exec(a.getAttribute('href') || '')
          if (m && rules.owners.has(m[1] || m[2])) return true
        }
      }
      if (rules.titles.length) {
        for (const a of el.querySelectorAll('a:is([href^="/watch/"],[href^="/shorts/"])')) {
          const thumb = a.closest('.pos_relative')
          if (thumb && el.contains(thumb)) continue
          const text = a.textContent.trim().toUpperCase()
          if (text) return rules.titles.some(t => text.includes(t))
        }
      }
      return false
    }
    const mark = function(node, hidden, rules) {
      if (node.nodeType !== 1) return
      const apply = el => {
        if (el.dataset.nrnAutofill === 'true' || el.hasAttribute(PREHIDE_ATTR)) return
        const id = el.getAttribute('data-decoration-video-id')
        if (id && (hidden.has(id) || domMatch(el, id, rules))) { el.setAttribute(PREHIDE_ATTR, ''); stats.prehidden++; ensureStyleFn?.() }
      }
      if (node.hasAttribute('data-decoration-video-id')) apply(node)
      else {
        // A late part of a card (e.g. the owner row) re-checks that card.
        const card = node.parentElement?.closest('[data-decoration-video-id]')
        if (card) apply(card)
      }
      if (node.firstElementChild) node.querySelectorAll('[data-decoration-video-id]').forEach(apply)
    }
    const domRulesFromRaw = function(read) {
      const list = key => { try { const v = JSON.parse(read(key, '[]')); return Array.isArray(v) ? v.map(valueOf) : [] } catch (e) { return [] } }
      return {
        movies: new Set(list('ngMovies').map(String)),
        owners: new Set([...list('ngUserIds'), ...list('ngChannelIds')].map(String)),
        titles: list('ngTitles').filter(v => typeof v === 'string' && v).map(v => v.toUpperCase()),
      }
    }
    const domRulesFromConfig = function(config) {
      return {
        movies: new Set(config.ngMovies.array.map(String)),
        owners: new Set([...config.ngUserIds.array, ...config.ngChannelIds.array].map(String)),
        titles: config.ngTitles.array.filter(v => typeof v === 'string' && v).map(v => v.toUpperCase()),
      }
    }
    const hasRules = r => Boolean(r && (r.movies.size || r.owners.size || r.titles.length))
    // Set by installEarly: adds the hiding style the first time a card is
    // hidden, so pages where nothing is hidden (e.g. watch) stay untouched.
    let ensureStyleFn = null

    // Called at document-start with synchronous GM_getValue. Hides cached NG
    // cards as React/SSR inserts them, before their first paint. Never
    // deletes anything: settings read here are not yet authoritative.
    const installEarly = function(rawRead, doc) {
      // Only a synchronous getter can act before paint. A manager whose
      // GM_getValue returns a promise is skipped (its rejection is swallowed);
      // the normal pipeline still loads the store after settings sync.
      let async = false
      const read = function(key, fallback) {
        const value = rawRead(key, fallback)
        if (value && typeof value.then === 'function') { async = true; value.then(null, () => {}); return fallback }
        return value
      }
      try {
        if (read(ENABLED_KEY, true) === false || async) return false
        if (read('useGetThumbInfo', true) === false) return false
        buckets = parse(read(KEY, ''))
        rebuildIndex()
        stats.loaded = byId.size
        const hidden = byId.size ? currentValid(indexFromRaw(read)) : new Set()
        const rules = domRulesFromRaw(read)
        // BRUSH-070: install even when nothing is known yet, so verdicts
        // learned later in this tab hide cards on the next page at once.
        // At document-start <html> may not exist yet: observe the document
        // itself and add the style as soon as there is somewhere to put it.
        const style = doc.createElement('style')
        style.id = 'nrn-verdict-cache-style'
        style.textContent = CSS
        const ensureStyle = function() {
          if (style.isConnected) return
          const host = doc.head || doc.documentElement
          if (host) host.appendChild(style)
        }
        ensureStyleFn = ensureStyle
        const observer = new MutationObserver(function(records) {
          if (!supportedPath()) return
          for (const r of records) for (const n of r.addedNodes) mark(n, early.hidden, early.rules)
        })
        observer.observe(doc, {childList:true, subtree:true})
        early = {observer, hidden, rules, doc}
        if (doc.body) mark(doc.body, hidden, rules)
        return true
      } catch (e) {
        console.warn('[NicoNicoRankingNG verdictCache] 早期非表示を開始できません', e)
        return false
      }
    }

    const releaseId = function(doc, id) {
      for (const el of doc.querySelectorAll('[' + PREHIDE_ATTR + '][data-decoration-video-id="' + id + '"]')) {
        el.removeAttribute(PREHIDE_ATTR); stats.released++
      }
    }
    const releaseAll = function(doc) {
      for (const el of doc.querySelectorAll('[' + PREHIDE_ATTR + ']')) { el.removeAttribute(PREHIDE_ATTR); stats.released++ }
    }
    const stopEarly = function() {
      if (!early) return
      early.observer.disconnect()
      releaseAll(early.doc)
      early = null
    }

    const persist = async function() {
      saveTimer = null
      if (!store) return
      try {
        // Merge what other tabs saved meanwhile (union per group), minus IDs
        // this tab confirmed as not NG and groups whose setting was removed.
        const stored = parse(await store.get(KEY, ''))
        for (const [key, ids] of stored) {
          if (droppedGroups.has(key)) continue
          for (const id of ids) if (!removedIds.has(id) && !byId.has(id)) addId(id, key)
        }
        removedIds.clear(); droppedGroups.clear()
        enforceCap(buckets); rebuildIndex()
        await store.set(KEY, serialize(buckets))
      } catch (e) {
        console.warn('[NicoNicoRankingNG verdictCache] 保存に失敗', e)
      }
    }
    const schedulePersist = function() {
      if (saveTimer === null) saveTimer = setTimeout(persist, 1500)
    }

    // Delete every group whose NG setting no longer exists or changed.
    const dropInvalidGroups = function(idx) {
      let dropped = 0
      for (const key of [...buckets.keys()]) {
        if (valid(key, idx)) continue
        for (const id of buckets.get(key)) byId.delete(id)
        buckets.delete(key); droppedGroups.add(key); dropped++
      }
      if (dropped) { stats.droppedGroups += dropped; schedulePersist() }
      return dropped
    }
    const indexFor = config => configIndex || (configIndex = indexFromConfig(config))

    // Normal pipeline: Config is synced, so settings are authoritative here.
    const attach = function(config, get, set, doc) {
      store = {get: (k, d) => Promise.resolve(get(k, d)), set: (k, v) => Promise.resolve(set(k, v))}
      const enabled = () => config.ngVerdictCacheEnabled.value && config.useGetThumbInfo.value
      const settingsChanged = function() {
        configIndex = null
        const idx = indexFor(config)
        dropInvalidGroups(idx)
        if (!early) return
        if (!enabled() || config.ngMovieVisible.value) { stopEarly(); return }
        const next = currentValid(idx)
        early.rules = domRulesFromConfig(config)
        for (const el of early.doc.querySelectorAll('[' + PREHIDE_ATTR + ']')) {
          const id = el.getAttribute('data-decoration-video-id')
          if (!next.has(id) && !domMatch(el, id, early.rules)) { el.removeAttribute(PREHIDE_ATTR); stats.released++ }
        }
        early.hidden = next
      }
      // Without the early path (async-only GM, or nothing to hide), load now.
      const ready = early ? Promise.resolve() : store.get(KEY, '').then(raw => {
        for (const [key, ids] of parse(raw)) for (const id of ids) if (!byId.has(id)) addId(id, key)
        stats.loaded = byId.size
      }).catch(() => {})
      for (const key of ['ngMovies','ngUserIds','ngChannelIds','ngUserNames','ngTags','ngLockedTags','ngTitles',
        'ngLockedTagCountEnabled','ngLockedTagCountThreshold','advancedNgRulesEnabled','advancedNgRulesJson',
        'ngMovieVisible','ngVerdictCacheEnabled','useGetThumbInfo']) {
        config[key]?.on?.('changed', settingsChanged)
      }
      ready.then(settingsChanged)
      return {enabled, ready}
    }

    // One call per new Movie. Learns on settle, forgets when it is not NG.
    const track = function(movie, config, doc) {
      let timer = setTimeout(function() { timer = null; releaseId(doc, movie.id) }, SAFETY_RELEASE_MS)
      const check = function() {
        // An NG verdict is final as soon as it exists (the script may skip
        // further lookups for NG videos, so they need not "settle"); a
        // not-NG verdict waits until the metadata has settled.
        if (!movie.metadataSettled && !movie.ng) return
        if (timer !== null) { clearTimeout(timer); timer = null }
        const wasHidden = Boolean(early && early.hidden.has(movie.id))
        if (config.ngVerdictCacheEnabled.value) {
          const key = reasonOf(movie, indexFor(config))
          if (key) {
            const isNew = !byId.has(movie.id)
            if (addId(movie.id, key)) {
              removedIds.delete(movie.id)
              if (early) early.hidden.add(movie.id)
              if (isNew) stats.learned++
              schedulePersist()
            }
            if (wasHidden) stats.confirmed++
          } else if (!movie.ng && removeId(movie.id)) {
            removedIds.add(movie.id)
            if (early) early.hidden.delete(movie.id)
            stats.cleared++
            schedulePersist()
          }
        }
        // The normal view mode (nrn-hide) takes over from here.
        releaseId(doc, movie.id)
      }
      movie.on('metadataChanged', check)
      movie.on('ngChanged', check)
      check()
      return function dispose() {
        if (timer !== null) clearTimeout(timer)
        movie.off('metadataChanged', check); movie.off('ngChanged', check)
      }
    }

    // AutoFill: a candidate in a still-valid group needs no detail request.
    const candidateReason = function(id, config) {
      if (!config?.ngVerdictCacheEnabled?.value || !config.useGetThumbInfo?.value) return null
      const key = byId.get(id)
      if (!key || !valid(key, indexFor(config))) return null
      stats.prefiltered++
      return 'verdictCache'
    }

    const clear = async function() {
      for (const key of buckets.keys()) droppedGroups.add(key)
      buckets = new Map(); byId = new Map()
      if (early) { early.hidden.clear(); releaseAll(early.doc) }
      if (store) await store.set(KEY, serialize(buckets))
      droppedGroups.clear(); removedIds.clear()
    }

    // Number of remembered videos NG'd by one setting entry (primary reason).
    const PREFIX = {ngTags:'t:', ngLockedTags:'l:', ngUserIds:'u:', ngChannelIds:'u:', ngUserNames:'n:', ngTitles:'i:'}
    const countFor = function(storeName, value) {
      const prefix = PREFIX[storeName]
      if (!prefix || value == null) return null
      const v = value === Object(value) ? value.value : value
      const key = prefix + (prefix === 'u:' ? String(v) : String(v).toUpperCase())
      return buckets.get(key)?.length || 0
    }
    const countForRule = function(ruleId, config) {
      const key = indexFor(config).ruleIdToKey.get(ruleId)
      return key ? (buckets.get(key)?.length || 0) : 0
    }
    // BRUSH-071: every remembered ID with its reason, newest first, for the
    // settings list; and removal of chosen IDs from the memory.
    const REASON_LABEL = {u:'投稿者ID', n:'投稿者名', t:'タグ', l:'ロックタグ', k:'ロックタグ数', r:'複合NG', i:'タイトル'}
    const reasonLabel = function(key) {
      const kind = REASON_LABEL[key[0]] || '?'
      if (key[0] === 'r') return kind
      if (key[0] === 'k') return kind + key.slice(2) + '以上'
      return kind + '「' + key.slice(2) + '」'
    }
    const entries = function(limit) {
      const rows = []
      for (const [key, ids] of buckets) for (let i = ids.length - 1; i >= 0; i--) rows.push([ids[i], key, i])
      // Newest within each group first; groups interleaved by recency index.
      rows.sort((a, b) => b[2] - a[2])
      return (limit ? rows.slice(0, limit) : rows).map(r => ({id: r[0], key: r[1], label: reasonLabel(r[1])}))
    }
    const forget = function(ids) {
      let n = 0
      for (const id of ids) if (removeId(id)) {
        removedIds.add(id); n++
        if (early) { early.hidden.delete(id); releaseId(early.doc, id) }
      }
      if (n) schedulePersist()
      return n
    }
    const groupSummary = function() {
      return [...buckets].map(([key, ids]) => ({key, count: ids.length})).sort((a, b) => b.count - a.count)
    }

    return {
      KEY, ENABLED_KEY, PREHIDE_ATTR, CSS, MAX_ENTRIES,
      installEarly, attach, track, candidateReason, clear, stopEarly, groupSummary, countFor, countForRule, entries, forget, reasonLabel,
      reasonOf, valid, indexFromConfig, indexFromRaw, parse, serialize, enforceCap, hash,
      get size() { return byId.size },
      get stats() { return Object.assign({size: byId.size, groups: buckets.size, earlyActive: Boolean(early)}, stats) },
      _reset() { buckets = new Map(); byId = new Map(); early = null; store = null; configIndex = null; removedIds.clear(); droppedGroups.clear(); for (const k in stats) stats[k] = 0 },
    }
  })()
