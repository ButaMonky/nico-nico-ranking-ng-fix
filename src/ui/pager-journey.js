  // One document only: no video data, user IDs or NG decisions are persisted here.
  var PagerJourney = (function() {
    const histories = new Map(), ttl = 30 * 60 * 1000
    function searchKey(href) {
      const u = new URL(href)
      for (const k of ['page', 'rf', 'rp', 'ra', 'ref', 'from']) u.searchParams.delete(k)
      u.searchParams.sort(); return u.origin + u.pathname + '?' + u.searchParams.toString()
    }
    function settingsKey(config) {
      return JSON.stringify(Object.keys(config).filter(k => /^(ng|advancedNg|useGetThumbInfo|unknownContributor|visibleContributor)/.test(k) && k !== 'ngMovieVisible').sort()
        .map(k => [k, config[k]?.set ? [...config[k].set] : config[k]?.value]))
    }
    function history(href, signature, now = Date.now()) {
      const key = searchKey(href)
      for (const [k, entry] of histories) if (now - entry.created > ttl) histories.delete(k)
      let entry = histories.get(key)
      if (!entry || entry.signature !== signature) entry = {signature, created:now, pages:new Map(), starts:new Set()}
      entry.time = now; histories.delete(key); histories.set(key, entry)
      while (histories.size > 8) histories.delete(histories.keys().next().value)
      return entry
    }
    function ranges(numbers) {
      const result = []
      for (const n of [...new Set(numbers)].sort((a,b) => a-b)) {
        const last = result[result.length-1]
        if (last && last.end + 1 === n) last.end = n
        else result.push({start:n, end:n})
      }
      return result
    }
    function layout(current, consumed, last, preview = 2) {
      const used = new Set(consumed); used.delete(current)
      const next = (from, step) => { let n = from + step; while (used.has(n)) n += step; return n < 1 || (last != null && n > last) ? null : n }
      const selected = new Set([current]); const grouped = ranges(used)
      for (const step of [-1, 1]) {
        let n = current
        for (let i=0; i<Math.max(0,Math.min(6,Math.trunc(preview) || 0)); i++) { n = next(n, step); if (n == null) break; selected.add(n) }
      }
      const min = Math.min(...selected), max = Math.max(...selected)
      const tokens = [...selected].map(n => ({start:n,end:n,current:n===current}))
      for (const group of grouped) if (group.end >= min && group.start <= max || group.start === max+1 || group.end === min-1) tokens.push({...group, consumed:true})
      tokens.sort((a,b)=>a.start-b.start)
      return {tokens, prev:next(current,-1), next:next(current,1)}
    }
    function router(doc) {
      try {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : doc.defaultView
        const r = win.__reactRouterDataRouter
        return r && typeof r.navigate === 'function' && r.state?.initialized ? r : null
      } catch (_) { return null }
    }
    function create(page, config, href) {
      const parsedPage = Number(new URL(href).searchParams.get('page') || 1)
      const current = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
      const fetched = new Map(), views = new Map()
      let pending = false
      function restore() {
        for (const [native, view] of views) { native.classList.remove('nrn-native-pager-replaced'); view.remove() }
        views.clear()
      }
      function record(number, items) {
        if (items.length && items.every(item => item.id)) fetched.set(number, [...new Set(items.map(item=>item.id))])
        while (fetched.size > 256) fetched.delete(fetched.keys().next().value)
      }
      function update(last, isSettled) {
        const state = history(href, settingsKey(config))
        state.starts.add(current)
        for (const [number, ids] of fetched) {
          if (ids.every(isSettled)) state.pages.set(number, true)
          else state.pages.delete(number)
        }
        for (const number of state.starts) state.pages.delete(number)
        while (state.pages.size > 256) state.pages.delete(state.pages.keys().next().value)
        while (state.starts.size > 128) state.starts.delete(state.starts.values().next().value)
        const consumed = [...state.pages.keys()].filter(n => last == null || n <= last)
        if (config.autoFillPagerMode.value !== 'compactSkip' || !router(page.doc)) { restore(); return consumed }
        const nativePagers = [...page.doc.querySelectorAll('nav[data-scope="pagination"]')]
          .filter(nav => !nav.id.startsWith('nrn-') && [...nav.querySelectorAll('a[href]')].some(a => {
            try { return searchKey(a.href) === searchKey(href) } catch (_) { return false }
          }))
        for (const [native, view] of views) if (!native.isConnected) { view.remove(); views.delete(native) }
        const model = layout(current, consumed, last, Number(config.pagerPreviewCount.value))
        for (const native of nativePagers) {
          let view = views.get(native)
          if (!view) { view = page.doc.createElement('nav'); view.id = 'nrn-pager-' + views.size; view.className = 'nrn-journey-pager'; view.setAttribute('aria-label','検索結果のページ'); views.set(native,view); native.after(view) }
          native.classList.add('nrn-native-pager-replaced')
          const renderedSettings = state.signature
          const signature = JSON.stringify([model, renderedSettings])
          if (view.dataset.signature === signature) continue
          view.dataset.signature = signature; view.replaceChildren()
          const add = (text, number, label, disabled, selected, consumedRange) => {
            const el = page.doc.createElement(number != null && !disabled ? 'a' : 'span')
            el.textContent = text; el.setAttribute('aria-label',label)
            if (selected) el.setAttribute('aria-current','page')
            if (disabled) el.setAttribute('aria-disabled','true')
            if (consumedRange) el.className = 'nrn-page-consumed'
            if (number != null && !disabled) {
              const target = new URL(href); target.searchParams.set('page',String(number)); el.href = target.href
              el.addEventListener('click', event => {
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
                event.preventDefault(); event.stopPropagation()
                if (pending || page._disposed) return
                if (settingsKey(config) !== renderedSettings) { update(last,isSettled); return }
                const r = router(page.doc)
                if (!r) { restore(); return }
                pending = true; view.setAttribute('aria-busy','true')
                // Use the site's router. pushState alone would leave stale React results.
                Promise.resolve().then(() => r.navigate(target.pathname + target.search + target.hash)).catch(() => {
                  restore() // Keep native navigation available; never force a document reload.
                }).finally(() => { pending = false; view.removeAttribute('aria-busy') })
              })
            }
            view.append(el)
          }
          add('←',model.prev,'前の未処理ページ',model.prev == null)
          let previous = 0
          for (const token of model.tokens) {
            if (token.start > previous+1) { const gap=page.doc.createElement('span'); gap.textContent='…'; view.append(gap) }
            const text = token.start === token.end ? String(token.start) : token.start + '–' + token.end
            add(text,token.start,token.consumed ? text + 'ページは表示・NG判定済み' : text + 'ページ',token.consumed || token.current,token.current,token.consumed)
            previous = token.end
          }
          if (last != null && previous < last) {
            if (previous+1 < last) { const gap=page.doc.createElement('span'); gap.textContent='…'; view.append(gap) }
            add(String(last),last,'最終ページ ' + last,consumed.includes(last),false,consumed.includes(last))
          }
          add('→',model.next,'次の未処理ページ',model.next == null)
        }
        return consumed
      }
      return {record,update,restore}
    }
    return {create,layout,ranges,history,searchKey,settingsKey}
  })()
