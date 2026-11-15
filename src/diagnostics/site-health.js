  // BRUSH-064: ニコニコの仕様変更を知らせる「健康診断」。
  //
  // 対象画面で起動してしばらく後に、スクリプトが頼っている箇所を点検する。
  // 想定と違えば、右下に「どこが合わなくなったか」を名指しで表示し、
  // 個人情報を含まない診断文をコピーできるようにする。誤報を避けるため、
  // 結果が0件の画面（検索0件など）や通信量が少ないうちは判定しない。
  //
  // 点検項目（id は診断文・テストで使う固定名）:
  //   contentRoot   ページ本体の目印 [aria-label="nicovideo-content"] がない
  //   cards         動画リンクはあるのに、動画カードを1件も読めない
  //   partialCards  ページ本来のカードの2割以上を読めない
  //   unreadLinks   どのカードにも属さない動画リンクが多い（新しい種類の枠）
  //   pageData      初回HTMLの検索データ（server-response）が読めない
  //   detailApi     動画情報API（getthumbinfo）の応答が想定外の形
  //   pageApi       追加ページの取得結果が想定外の形（自動継ぎ足し）
  //   network       動画情報・追加ページの通信失敗が続いている
  //   startup / routeSetup  起動処理で例外
  var SiteHealth = (function() {
    const LABELS = {
      contentRoot: 'ページ本体の目印が見つかりません',
      cards: '動画カードを読み取れません',
      partialCards: '一部の動画カードを読み取れません',
      unreadLinks: '読み取れない動画の枠があります',
      pageData: 'ページ内の検索データを読み取れません',
      detailApi: '動画情報（getthumbinfo）の形が想定と違います',
      pageApi: '追加ページの形が想定と違います（自動継ぎ足し）',
      network: '動画情報・追加ページの通信失敗が続いています',
      startup: '起動処理でエラーが発生しました',
      routeSetup: '画面の準備でエラーが発生しました',
    }
    // Problems that point at a site change rather than the connection.
    const SITE_CHANGE = new Set(['contentRoot','cards','partialCards','unreadLinks','pageData','detailApi','pageApi'])
    const CHECK_AFTER_MS = 6000
    const MIN_REQUESTS = 6
    const NOTICE_ID = 'nrn-health-notice'

    const ratio = (part, whole) => whole > 0 ? part / whole : 0
    const sum = (o, keys) => keys.reduce((n, k) => n + (Number(o?.[k]) || 0), 0)

    // Pure decision from collected numbers, so it is unit-testable.
    // input: {routeKind, contentRoot, watchLinks, nativeRoots, parsedNative,
    //   parsedTotal, unreadLinks, initialPageData:{checked, items}|null,
    //   network:{detail:{...outcomes}, page:{...}}, problemCounts:{startup,routeSetup}}
    const evaluate = function(input) {
      const problems = []
      const add = (id, metrics) => problems.push({id, label: LABELS[id], siteChange: SITE_CHANGE.has(id), metrics})
      const i = input || {}
      if (!i.contentRoot && i.nativeRoots > 0) add('contentRoot', {nativeRoots: i.nativeRoots})
      if (i.watchLinks >= 3 && i.parsedTotal === 0) add('cards', {watchLinks: i.watchLinks, nativeRoots: i.nativeRoots})
      else if (i.nativeRoots >= 5 && i.parsedNative < i.nativeRoots * 0.8) add('partialCards', {nativeRoots: i.nativeRoots, parsedNative: i.parsedNative})
      if (i.parsedTotal > 0 && i.unreadLinks >= 5) add('unreadLinks', {unreadLinks: i.unreadLinks})
      const pd = i.initialPageData
      if (pd && pd.checked && i.nativeRoots >= 5 && !(pd.items > 0)) add('pageData', {items: pd.items ?? null})
      for (const [kind, id] of [['detail', 'detailApi'], ['page', 'pageApi']]) {
        const n = i.network?.[kind]
        const finished = sum(n, ['ok','http','network','timeout','invalid','apiFailure'])
        if (finished < MIN_REQUESTS) continue
        const malformed = sum(n, ['invalid','apiFailure'])
        if (ratio(malformed, finished) >= 0.5) add(id, {finished, malformed})
      }
      const transport = ['detail', 'page'].map(kind => i.network?.[kind])
      const finishedAll = transport.reduce((n, o) => n + sum(o, ['ok','http','network','timeout','invalid','apiFailure']), 0)
      const failedAll = transport.reduce((n, o) => n + sum(o, ['http','network','timeout']), 0)
      if (finishedAll >= MIN_REQUESTS && ratio(failedAll, finishedAll) >= 0.5) add('network', {finished: finishedAll, failed: failedAll})
      for (const code of ['startup', 'routeSetup']) if (Number(i.problemCounts?.[code]) > 0) add(code, {count: Number(i.problemCounts[code])})
      return problems
    }

    // Reads the page and the run's counters. Never collects URLs, IDs or text.
    const collect = function(doc, page, extra = {}) {
      const content = doc.querySelector('[aria-label="nicovideo-content"]')
      const scope = content || doc.body
      const watchLinks = scope ? scope.querySelectorAll('a:is([href^="/watch/"],[href^="/shorts/"])').length : 0
      const nativeRootElems = Array.from(doc.querySelectorAll('[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])'))
        .filter(e => !e.closest('[data-scope="presence"],[data-scope="tooltip"],[data-scope="menu"]'))
      const parsedRoots = (page?.movieRoots || []).filter(r => r.elem && r.elem.isConnected)
      const parsedElems = new Set(parsedRoots.map(r => r.elem))
      const isParsed = el => { for (const p of parsedElems) if (p === el || p.contains(el) || el.contains(p)) return true; return false }
      const parsedNative = nativeRootElems.filter(isParsed).length
      let unreadLinks = 0
      if (scope) for (const a of scope.querySelectorAll('a:is([href^="/watch/"],[href^="/shorts/"])')) {
        if (a.closest('[data-decoration-video-id]') || a.closest('.nrn-parsed') || a.closest('[id^="nrn-"]')) continue
        unreadLinks++
      }
      const snap = typeof Diagnostics === 'object' ? Diagnostics.snapshot() : null
      const run = snap?.current?.network?.run || {}
      return {
        routeKind: /^\/tag(_shorts)?\//.test(location.pathname) ? 'tag' : /^\/search(_shorts)?\//.test(location.pathname) ? 'search' : /^\/ranking/.test(location.pathname) ? 'ranking' : 'other',
        contentRoot: Boolean(content), watchLinks, nativeRoots: nativeRootElems.length, parsedNative,
        parsedTotal: parsedRoots.length, unreadLinks,
        initialPageData: extra.initialPageData || null,
        network: {detail: run.detail || null, page: run.page || null},
        problemCounts: snap?.problemCounts || {},
      }
    }

    const reportText = function(input, problems) {
      return JSON.stringify({
        format: 'NRN-HEALTH-1',
        version: typeof NRN_VERSION === 'string' ? NRN_VERSION : 'unknown',
        privacy: {urls: false, videoIds: false, names: false},
        routeKind: input.routeKind,
        page: {contentRoot: input.contentRoot, watchLinks: input.watchLinks, nativeRoots: input.nativeRoots,
          parsedNative: input.parsedNative, parsedTotal: input.parsedTotal, unreadLinks: input.unreadLinks,
          initialPageData: input.initialPageData},
        network: input.network,
        problems: problems.map(p => ({id: p.id, metrics: p.metrics})),
      }, null, 2)
    }

    const dismissKey = problems => 'nrnHealthDismissed:' + (typeof NRN_VERSION === 'string' ? NRN_VERSION : '') + ':' + problems.map(p => p.id).sort().join(',')
    const dismissed = function(problems) {
      try { return sessionStorage.getItem(dismissKey(problems)) === '1' } catch (e) { return false }
    }

    const clearNotice = function(doc) { doc.getElementById(NOTICE_ID)?.remove() }

    const showNotice = function(doc, input, problems) {
      clearNotice(doc)
      if (!problems.length || dismissed(problems)) return null
      const box = doc.createElement('div')
      box.id = NOTICE_ID
      box.setAttribute('role', 'status')
      box.className = 'nrn-health-notice'
      const siteChange = problems.some(p => p.siteChange)
      const title = doc.createElement('div')
      title.className = 'nrn-health-title'
      title.textContent = siteChange ? '⚠ NGスクリプト：ニコニコの仕様が変わった可能性' : '⚠ NGスクリプト：問題が発生しています'
      const list = doc.createElement('ul')
      for (const p of problems) { const li = doc.createElement('li'); li.textContent = p.label; li.dataset.healthId = p.id; list.append(li) }
      const help = doc.createElement('div')
      help.className = 'nrn-health-help'
      help.textContent = '「診断をコピー」で、開発者に渡す内容（URL・動画ID・名前は含みません）をコピーします。'
      const actions = doc.createElement('div')
      actions.className = 'nrn-health-actions'
      const copy = doc.createElement('button'); copy.type = 'button'; copy.textContent = '診断をコピー'
      const close = doc.createElement('button'); close.type = 'button'; close.textContent = '閉じる'
      const text = reportText(input, problems)
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); copy.textContent = 'コピーしました' }
        catch (e) {
          const area = doc.createElement('textarea'); area.value = text; area.readOnly = true; area.className = 'nrn-health-text'
          box.append(area); area.select(); copy.textContent = '下の文章をコピーしてください'
        }
      })
      close.addEventListener('click', () => {
        try { sessionStorage.setItem(dismissKey(problems), '1') } catch (e) {}
        box.remove()
      })
      actions.append(copy, close)
      box.append(title, list, help, actions)
      doc.body.append(box)
      return box
    }

    const CSS = `
.nrn-health-notice { position: fixed; right: 8px; bottom: 120px; z-index: 2147483000; max-width: 360px;
  padding: 10px 12px; border-radius: 8px; background: #3a2a00; color: #fff3cd; border: 1px solid #c99a00;
  font: 13px/1.5 sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
.nrn-health-title { font-weight: bold; margin-bottom: 4px; }
.nrn-health-notice ul { margin: 0 0 6px 18px; padding: 0; }
.nrn-health-help { font-size: 12px; opacity: .85; margin-bottom: 6px; }
.nrn-health-actions { display: flex; gap: 6px; justify-content: flex-end; }
.nrn-health-actions button { font: inherit; padding: 2px 10px; border-radius: 4px; border: 1px solid #c99a00; background: #fff3cd; color: #3a2a00; cursor: pointer; }
.nrn-health-text { width: 100%; height: 120px; margin-top: 6px; font: 11px monospace; }
`

    // One check per route, after the page has had time to render and the
    // first detail requests to finish. Returns a cancel function.
    const schedule = function(doc, page, options = {}) {
      const enabled = options.enabled || (() => true)
      const timer = setTimeout(function() {
        if (page._disposed || !enabled()) return
        const input = collect(doc, page, options)
        const problems = evaluate(input)
        if (problems.length) {
          console.warn('[NicoNicoRankingNG health] 想定と違う箇所:', problems.map(p => p.id).join(', '), input)
          showNotice(doc, input, problems)
        }
        options.onResult?.(input, problems)
      }, options.delayMs ?? CHECK_AFTER_MS)
      return function cancel() { clearTimeout(timer); clearNotice(doc) }
    }

    return {LABELS, SITE_CHANGE, CSS, NOTICE_ID, evaluate, collect, reportText, showNotice, clearNotice, schedule}
  })()
