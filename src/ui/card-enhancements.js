  var CardEnhancements = (function() {
    const blankIcon = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
    function highlight(node, terms) {
      if (!node) return
      const text = node.textContent, upper = text.toUpperCase()
      terms = [...new Set(terms.filter(Boolean).map(value => String(value).toUpperCase()))]
      const signature = JSON.stringify([text, terms])
      if (node._nrnMarkerSignature === signature) return
      node._nrnMarkerSignature = signature
      const ranges = []
      for (const term of terms) {
        for (let at = upper.indexOf(term); at >= 0; at = upper.indexOf(term, at + term.length)) ranges.push([at, at + term.length])
      }
      ranges.sort((a, b) => a[0] - b[0])
      const merged = []
      for (const range of ranges) {
        const last = merged[merged.length - 1]
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
        else merged.push(range)
      }
      const fragment = node.ownerDocument.createDocumentFragment()
      let position = 0
      for (const [start, end] of merged) {
        fragment.append(node.ownerDocument.createTextNode(text.slice(position, start)))
        const mark = node.ownerDocument.createElement('mark')
        mark.className = 'nrn-reason-mark'; mark.textContent = text.slice(start, end)
        fragment.append(mark); position = end
      }
      fragment.append(node.ownerDocument.createTextNode(text.slice(position)))
      node.replaceChildren(fragment)
    }
    function reasons(movie) {
      const labels = [], fields = new Set(), titleTerms = [], nameTerms = [], tagTerms = []
      if (movie.ngId) labels.push('動画IDがNG登録済み')
      if (movie.ngTitle) { labels.push('タイトル：' + movie.ngTitle); titleTerms.push(movie.ngTitle) }
      const contributor = movie.contributor
      if (contributor?.ngId || (contributor?.type === 'channel' && contributor.ng)) labels.push('投稿者IDがNG登録済み')
      if (contributor?.ngName) { labels.push('投稿者名：' + contributor.ngName); nameTerms.push(contributor.ngName) }
      for (const tag of movie.tags || []) if (tag.ng) { labels.push('タグ：' + tag.name); tagTerms.push(tag.name) }
      if (movie.ngByLockedTagCount) { labels.push('ロックタグ数が ' + movie._lockedTagCountThreshold + ' 個以上'); fields.add('lockedTagCount') }
      if (movie.ngByAdvancedRule) {
        const matches = AdvancedNgRules.match(movie, movie._advancedRulesEnabled, movie._advancedRulesJson, true)
        const rules = AdvancedNgRules.parse(movie._advancedRulesJson)
        for (const match of matches) {
          const rule = rules.find(rule => rule.id === match.id)
          labels.push('複合NG「' + match.name + '」：' + AdvancedNgRules.expressionText(rule?.expression))
          for (const item of match.trace || []) {
            if (item.kind !== 'condition') continue
            fields.add(item.field)
            // Negative/absent conditions have no matching substring to highlight.
            if (item.result !== true || item.not || !['contains', 'eq'].includes(item.operator)) continue
            if (item.field === 'title') titleTerms.push(item.expected)
            if (item.field === 'contributorName') nameTerms.push(item.expected)
            if (['tag', 'lockedTag'].includes(item.field)) tagTerms.push(item.expected)
          }
        }
      }
      return {labels, fields, titleTerms, nameTerms, tagTerms}
    }
    function ownerLink(doc, owner, native) {
      const url = owner?.url || native?.href
      const knownName = owner?.name || native?.querySelector('img')?.alt || native?.textContent?.trim()
      const link = doc.createElement(url ? 'a' : 'span')
      link.className = 'nrn-contributor-link nrn-owner-row'
      if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer' }
      const image = doc.createElement('img')
      image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.width = image.height = 24
      image.src = native?.querySelector('img')?.src || (owner?.type === 'user' && Number(owner.id) > 0
        ? 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/' + Math.floor(owner.id / 10000) + '/' + owner.id + '.jpg' : blankIcon)
      image.addEventListener('error', () => { if (image.src !== blankIcon) image.src = blankIcon }, {once:true})
      const name = doc.createElement('span'); name.className = 'nrn-owner-name'
      name.textContent = knownName || '投稿者情報なし'
      if (!owner || !knownName || /投稿者非公開|削除済み|退会済み/.test(knownName)) link.classList.add('nrn-owner-unavailable')
      link.append(image, name)
      return link
    }
    function attach(root, movie, page) {
      let frame = null, ownerSignature = '', previousSignature = ''
      const doc = page.doc
      let nativeOwner = root.elem.querySelector('a[href*="/user/"]:not(.nrn-contributor-link), a[href*="/channel/"]:not(.nrn-contributor-link)')
      const render = function() {
        frame = null
        if (root._disposed || page._disposed) return
        root.elem.classList.toggle('nrn-is-ng', Boolean(movie.ng))
        const detail = reasons(movie)
        let label = root.movieInfo.elem.querySelector(':scope > .nrn-ng-reasons')
        if (!label && movie.ng) {
          label = doc.createElement('div'); label.className = 'nrn-ng-reasons'
          root.movieInfo.elem.prepend(label)
        }
        root.movieInfo.toggle.title = movie.ng ? detail.labels.join(' / ') : 'タグ・投稿者とNG理由を表示'
        if (label) {
          label.hidden = !movie.ng
          const text = 'NG：' + detail.labels.join(' / ')
          if (label.textContent !== text) label.textContent = text
        }
        // React may replace its owner row. Mark the current native row without moving it.
        const currentOwner = [...root.elem.querySelectorAll('a[href*="/user/"], a[href*="/channel/"]')]
          .find(link => !link.closest('.nrn-movie-info-container'))
        if (currentOwner !== nativeOwner) nativeOwner?.classList.remove('nrn-native-owner')
        nativeOwner = currentOwner || null
        nativeOwner?.classList.add('nrn-native-owner')
        const container = root.movieInfo.elem.querySelector('.nrn-contributor-container')
        const owner = movie.contributor
        const signature = JSON.stringify([owner?.type, owner?.id, owner?.name, owner?.ngName])
        if (container && movie.thumbInfoDone && (ownerSignature !== signature || !container.querySelector('.nrn-owner-row img'))) {
          const existing = container.querySelector('.nrn-contributor-link')
          const link = ownerLink(doc, owner?.type === 'unknown' ? null : owner, nativeOwner)
          if (existing) {
            if (existing.classList.contains('nrn-ng-id-contributor-link')) link.classList.add('nrn-ng-id-contributor-link')
            existing.replaceWith(link)
          } else container.prepend(link)
          ownerSignature = signature
        }
        root.elem.classList.toggle('nrn-owner-detail-ready', Boolean(container?.querySelector('.nrn-owner-row')))
        const summary = JSON.stringify([detail.labels, [...detail.fields], movie.tags.map(t => [t.name, t.lock]), movie.pageContributorCount])
        if (summary === previousSignature && root._nrnPresentationRendered) return
        previousSignature = summary; root._nrnPresentationRendered = true
        highlight(root.movieTitle?.elem || root.titleElem, detail.titleTerms)
        highlight(container?.querySelector('.nrn-owner-name'), detail.nameTerms)
        const count = root.movieInfo.elem.querySelector('.nrn-tag-section .nrn-info-section-title')
        if (count) {
          count.replaceChildren()
          const locked = doc.createElement(detail.fields.has('lockedTagCount') ? 'mark' : 'span')
          locked.className = 'nrn-lock-count'; locked.textContent = '🔒' + movie.tags.filter(t => t.lock).length
          const all = doc.createElement(detail.fields.has('tagCount') ? 'mark' : 'span')
          all.textContent = String(movie.tags.length)
          count.append(locked, doc.createTextNode(' / '), all)
          if (Number.isFinite(movie.pageContributorCount)) {
            const posts = doc.createElement(detail.fields.has('pageContributorCount') ? 'mark' : 'span')
            posts.textContent = '　同じ投稿者：このページに ' + movie.pageContributorCount + ' 件'
            count.append(posts)
          }
        }
        for (const tag of root.movieInfo.elem.querySelectorAll('.nrn-movie-tag-link')) {
          const matched = detail.tagTerms.some(term => String(term).toUpperCase() === tag.textContent.toUpperCase())
          tag.classList.toggle('nrn-reason-tag', matched)
        }
      }
      const schedule = () => { if (frame == null && !page._disposed) frame = requestAnimationFrame(render) }
      movie.on('ngReasonsChanged', schedule); movie.on('thumbInfoDone', schedule)
      root._disposeEnhancements = () => {
        nativeOwner?.classList.remove('nrn-native-owner'); root.elem.classList.remove('nrn-owner-detail-ready')
        cancelAnimationFrame(frame); movie.off('ngReasonsChanged', schedule); movie.off('thumbInfoDone', schedule)
      }
      schedule()
    }
    const css = `
.nrn-is-ng:not(.nrn-hide):not(.nrn-autofill-pending):not(.nrn-autofill-overflow) { outline:2px dashed #cf3441; outline-offset:-2px; }
.nrn-ng-reasons { color:#ad2431; background:#fff0f1; font-size:12px; line-height:1.5; padding:3px 5px; overflow-wrap:anywhere; flex-basis:100%; }
.nrn-ng-reasons[hidden] { display:none !important; }
.nrn-reason-mark, .nrn-movie-info-container .nrn-movie-tag-link.nrn-reason-tag, .nrn-info-section-title mark { background:#ffe29a; color:#612e00; text-decoration:none; }
.nrn-info-expanded.nrn-owner-detail-ready .nrn-native-owner { display:none !important; }
.nrn-owner-row { display:inline-flex; align-items:center; gap:4px; min-width:0; font-weight:bold; }
.nrn-owner-row img { width:24px; height:24px; min-width:24px; border-radius:50%; object-fit:cover; }
.nrn-owner-unavailable { color:#828892 !important; }
.nrn-page-consumed { background:repeating-linear-gradient(135deg,transparent,transparent 5px,#8c929755 5px,#8c929755 6px); text-decoration:line-through; }
.nrn-native-pager-replaced { display:none !important; }
.nrn-journey-pager { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:4px; margin:12px 0; }
.nrn-journey-pager > * { display:inline-flex; align-items:center; justify-content:center; min-width:32px; min-height:32px; padding:2px 6px; border-radius:4px; }
.nrn-journey-pager a { color:inherit; border:1px solid #8893a044; text-decoration:none; }
.nrn-journey-pager a:hover { background:#71829c22; }
.nrn-journey-pager [aria-disabled=true] { color:#828892; cursor:default; }
.nrn-journey-pager [aria-current=page] { color:inherit; font-weight:bold; border:2px solid currentColor; }
.nrn-pager-summary { display:block; font-size:12px; color:#626a75; margin:4px 0; }
a.nrn-parsed[data-anchor-detail="nicoad"] { padding-bottom:28px; }
a.nrn-parsed[data-anchor-detail="nicoad"] > .nrn-movie-info-toggle { background:#fff; box-shadow:0 0 0 1px #aeb5be; }
`
    return {attach, reasons, highlight, ownerLink, css}
  })()
