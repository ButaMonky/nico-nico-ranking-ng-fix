  // BRUSH-060: NG判定結果の記憶（高速非表示）。
  //
  // 一度タグ・投稿者・ロックタグ数・複合NGでNGと確定した動画IDを、理由つきで
  // 端末に保存する。次回以降は詳細取得（getthumbinfo）を待たずに、カードが
  // DOMへ入った直後（描画前のMutationObserver）に仮非表示にし、AutoFill候補は
  // 通信前に落とす。手動の「NG動画ID」一覧とは別に保存するため、利用者の一覧を
  // 汚さず、NG設定の削除・変更で自動的に無効になる。
  //
  // 記録する理由（どれか1つ）と有効条件:
  //   u:<id>    投稿者ID/チャンネルIDがNG一覧に残っている
  //   n:<NAME>  NG投稿者名の語が一覧に残っている
  //   t:<TAG>   NGタグが一覧に残っている
  //   l:<TAG>   NGロックタグが一覧に残っている
  //   k:<n>     ロックタグ数NGが有効で、しきい値が同じ
  //   r:<hash>  複合NGが有効で、ルールJSONが同じ
  // 動画IDNG・タイトルNGは最初からDOMだけで即判定できるため記録しない。
  //
  // 仮非表示は確定ではない。通常の判定が終わってNGでなければ記録を消して
  // 表示に戻す（タグ変更などで結果が変わった動画を取り違えない）。
  var NgVerdictCache = (function() {
    const KEY = 'ngVerdictCache'
    const ENABLED_KEY = 'ngVerdictCacheEnabled'
    const MAX_ENTRIES = 10000
    const TTL_MS = 30 * 24 * 60 * 60 * 1000
    const VIDEO_ID = /^(sm|so|nm)[0-9]+$/
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

    // Reasons are validated against the current settings. Both the early
    // (document-start, raw GM values) and the normal (Config) paths build this.
    const index = function(lists) {
      return {
        ownerIds: idSet([...lists.userIds, ...lists.channelIds]),
        ownerNames: upperSet(lists.userNames),
        tags: upperSet(lists.tags),
        lockedTags: upperSet(lists.lockedTags),
        lockCount: lists.lockCountEnabled ? String(lists.lockCountThreshold) : null,
        rules: lists.rulesEnabled ? hash(lists.rulesJson) : null,
      }
    }
    const indexFromConfig = function(config) {
      return index({
        userIds: config.ngUserIds.array, channelIds: config.ngChannelIds.array,
        userNames: config.ngUserNames.array, tags: config.ngTags.array,
        lockedTags: config.ngLockedTags.array,
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
        userNames: list('ngUserNames'), tags: list('ngTags'), lockedTags: list('ngLockedTags'),
        lockCountEnabled: read('ngLockedTagCountEnabled', false) === true,
        lockCountThreshold: read('ngLockedTagCountThreshold', 5),
        rulesEnabled: read('advancedNgRulesEnabled', false) === true,
        rulesJson: read('advancedNgRulesJson', '[]'),
      })
    }
    const valid = function(reason, idx) {
      if (typeof reason !== 'string' || reason.length < 3 || reason[1] !== ':') return false
      const v = reason.slice(2)
      switch (reason[0]) {
        case 'u': return idx.ownerIds.has(v)
        case 'n': return idx.ownerNames.has(v)
        case 't': return idx.tags.has(v)
        case 'l': return idx.lockedTags.has(v)
        case 'k': return idx.lockCount !== null && idx.lockCount === v
        case 'r': return idx.rules !== null && idx.rules === v
        default: return false
      }
    }

    // The primary reason a settled movie is NG, or null when nothing cacheable
    // applies (not NG, or NG only by video ID/title which are already instant).
    const reasonOf = function(movie, config) {
      if (!movie || !movie.ng) return null
      const c = movie.contributor
      if (c && c.ngId && c.id != null && c.id !== '') return 'u:' + String(c.id)
      if (c && c.ngName) return 'n:' + String(c.ngName).toUpperCase()
      for (const tag of movie.tags || []) {
        if (tag.ngByNormal) return 't:' + String(tag.name).toUpperCase()
        if (tag.ngByLock) return 'l:' + String(tag.name).toUpperCase()
      }
      if (movie.ngByLockedTagCount) return 'k:' + String(config.ngLockedTagCountThreshold.value)
      if (movie.ngByAdvancedRule) return 'r:' + hash(config.advancedNgRulesJson.value)
      return null
    }

    const parse = function(raw) {
      const map = new Map()
      let obj
      try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return map }
      if (!obj || typeof obj !== 'object') return map
      for (const [id, v] of Object.entries(obj)) {
        if (VIDEO_ID.test(id) && Array.isArray(v) && typeof v[0] === 'string' && Number.isFinite(v[1])) map.set(id, [v[0], v[1]])
      }
      return map
    }
    const prune = function(map, now) {
      for (const [id, v] of map) if (now - v[1] > TTL_MS) map.delete(id)
      if (map.size <= MAX_ENTRIES) return map
      const sorted = [...map].sort((a, b) => b[1][1] - a[1][1]).slice(0, MAX_ENTRIES)
      return new Map(sorted)
    }

    // ---- state shared by the early hider and the normal pipeline ----
    let entries = new Map()
    let early = null            // {observer, hidden:Set}
    const stats = {loaded:0, prehidden:0, confirmed:0, cleared:0, learned:0, released:0, prefiltered:0}
    const removed = new Set()   // deletions to apply when merging with other tabs
    let store = null, saveTimer = null
    let configIndex = null      // rebuilt lazily after any NG setting change
    const indexFor = config => configIndex || (configIndex = indexFromConfig(config))

    const currentValid = function(idx) {
      const ids = new Set()
      for (const [id, v] of entries) if (valid(v[0], idx)) ids.add(id)
      return ids
    }
    const supportedPath = () => /^\/(search|tag)\/./.test(location.pathname) || location.pathname.startsWith('/ranking/genre')
    const mark = function(node, hidden) {
      if (node.nodeType !== 1) return
      const apply = el => {
        if (el.dataset.nrnAutofill === 'true' || el.hasAttribute(PREHIDE_ATTR)) return
        const id = el.getAttribute('data-decoration-video-id')
        if (id && hidden.has(id)) { el.setAttribute(PREHIDE_ATTR, ''); stats.prehidden++ }
      }
      if (node.hasAttribute('data-decoration-video-id')) apply(node)
      if (node.firstElementChild) node.querySelectorAll('[data-decoration-video-id]').forEach(apply)
    }

    // Called at document-start with synchronous GM_getValue. Hides cached NG
    // cards as React/SSR inserts them, before their first paint.
    const installEarly = function(read, doc) {
      try {
        if (read(ENABLED_KEY, true) === false) return false
        if (read('useGetThumbInfo', true) === false) return false
        entries = prune(parse(read(KEY, '{}')), Date.now())
        stats.loaded = entries.size
        if (!entries.size) return false
        const hidden = currentValid(indexFromRaw(read))
        if (!hidden.size) return false
        const style = doc.createElement('style')
        style.id = 'nrn-verdict-cache-style'
        style.textContent = CSS
        ;(doc.head || doc.documentElement).appendChild(style)
        const observer = new MutationObserver(function(records) {
          if (!supportedPath()) return
          for (const r of records) for (const n of r.addedNodes) mark(n, hidden)
        })
        observer.observe(doc.documentElement, {childList:true, subtree:true})
        if (doc.body) mark(doc.body, hidden)
        early = {observer, hidden, doc}
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
        // Merge with what other tabs saved meanwhile: newest timestamp wins,
        // and IDs this tab confirmed as not-NG are removed.
        const stored = parse(await store.get(KEY, '{}'))
        for (const [id, v] of stored) {
          if (removed.has(id)) continue
          const mine = entries.get(id)
          if (!mine || mine[1] < v[1]) entries.set(id, v)
        }
        for (const id of removed) entries.delete(id)
        removed.clear()
        entries = prune(entries, Date.now())
        await store.set(KEY, JSON.stringify(Object.fromEntries(entries)))
      } catch (e) {
        console.warn('[NicoNicoRankingNG verdictCache] 保存に失敗', e)
      }
    }
    const schedulePersist = function() {
      if (saveTimer === null) saveTimer = setTimeout(persist, 1500)
    }

    // Normal pipeline: config is synced. Keeps the early hidden set in step
    // with settings changes, and learns/forgets as movies settle.
    const attach = function(config, get, set, doc) {
      store = {get: (k, d) => Promise.resolve(get(k, d)), set: (k, v) => Promise.resolve(set(k, v))}
      const enabled = () => config.ngVerdictCacheEnabled.value && config.useGetThumbInfo.value
      const refreshHidden = function() {
        configIndex = null
        if (!early) return
        if (!enabled() || config.ngMovieVisible.value) { stopEarly(); return }
        const next = currentValid(indexFor(config))
        for (const id of early.hidden) if (!next.has(id)) releaseId(early.doc, id)
        early.hidden = next
      }
      for (const key of ['ngUserIds','ngChannelIds','ngUserNames','ngTags','ngLockedTags',
        'ngLockedTagCountEnabled','ngLockedTagCountThreshold','advancedNgRulesEnabled','advancedNgRulesJson',
        'ngMovieVisible','ngVerdictCacheEnabled','useGetThumbInfo']) {
        config[key]?.on?.('changed', refreshHidden)
      }
      refreshHidden()
      return {enabled}
    }

    // One call per new Movie. Learns on settle, forgets when it is not NG.
    const track = function(movie, config, doc) {
      let timer = setTimeout(function() { timer = null; releaseId(doc, movie.id) }, SAFETY_RELEASE_MS)
      const check = function() {
        if (!movie.metadataSettled) return
        if (timer !== null) { clearTimeout(timer); timer = null }
        const wasHidden = Boolean(early && early.hidden.has(movie.id))
        if (config.ngVerdictCacheEnabled.value) {
          const reason = reasonOf(movie, config)
          if (reason) {
            const prev = entries.get(movie.id)
            if (!prev || prev[0] !== reason || Date.now() - prev[1] > 86400000) {
              entries.set(movie.id, [reason, Date.now()]); removed.delete(movie.id)
              if (!prev) stats.learned++
              schedulePersist()
            }
            if (wasHidden) stats.confirmed++
          } else if (!movie.ng && entries.has(movie.id)) {
            entries.delete(movie.id); removed.add(movie.id)
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

    // AutoFill: a candidate whose cached reason is still valid needs no
    // detail request. Returns a reason label or null.
    const candidateReason = function(id, config) {
      if (!config?.ngVerdictCacheEnabled?.value || !config.useGetThumbInfo?.value) return null
      const v = entries.get(id)
      if (!v || Date.now() - v[1] > TTL_MS) return null
      if (!valid(v[0], indexFor(config))) return null
      stats.prefiltered++
      return 'verdictCache'
    }

    const clear = async function() {
      for (const id of entries.keys()) removed.add(id)
      entries.clear()
      if (early) { early.hidden.clear(); releaseAll(early.doc) }
      if (store) await store.set(KEY, '{}')
      removed.clear()
    }

    return {
      KEY, ENABLED_KEY, PREHIDE_ATTR, CSS, MAX_ENTRIES, TTL_MS,
      installEarly, attach, track, candidateReason, clear, stopEarly,
      reasonOf, valid, indexFromConfig, indexFromRaw, parse, prune, hash,
      get size() { return entries.size },
      get stats() { return Object.assign({size: entries.size, earlyActive: Boolean(early)}, stats) },
      _reset() { entries = new Map(); early = null; store = null; configIndex = null; removed.clear(); for (const k in stats) stats[k] = 0 },
    }
  })()
