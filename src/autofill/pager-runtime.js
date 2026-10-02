
      // -------------------- PagerManager --------------------
      var pageNumberFromHref = function(href) {
        try {
          var sourceUrl = new URL(sourceHref)
          var u = new URL(href, sourceHref)
          if (u.origin !== sourceUrl.origin || u.pathname !== sourceUrl.pathname) return null
          const criteria = url => JSON.stringify([...url.searchParams].filter(([key]) => !['page','ref','from'].includes(key)).sort())
          if (criteria(u) !== criteria(sourceUrl)) return null
          var p = Number(u.searchParams.get('page') || 1)
          return Number.isFinite(p) && p >= 1 ? Math.trunc(p) : null
        } catch (e) {
          if (page._disposed) return
          return null
        }
      }

      var compactRanges = function(numbers) {
        var arr = [...new Set(numbers)].sort(function(a,b){return a-b})
        if (!arr.length) return []
        var ranges = []
        var start = arr[0]
        var prev = arr[0]
        for (var i = 1; i < arr.length; i++) {
          var n = arr[i]
          if (n === prev + 1) {
            prev = n
            continue
          }
          ranges.push({start:start,end:prev})
          start = prev = n
        }
        ranges.push({start:start,end:prev})
        return ranges
      }

      var currentPageNumber = function() {
        var u = new URL(sourceHref)
        var p = Number(u.searchParams.get('page') || 1)
        return Number.isFinite(p) && p >= 1 ? Math.trunc(p) : 1
      }

      var firstUnfetchedPageAfterCurrent = function() {
        var p = currentPageNumber() + 1
        while (fetchedPageNumbers.has(p)) p++
        if (knownLastPage != null && p > knownLastPage) return null
        return p
      }

      var makePageHref = function(pageNumber, baseHref) {
        var u
        try {
          u = new URL(baseHref || sourceHref, sourceHref)
        } catch (e) {
          if (page._disposed) return
          u = new URL(sourceHref)
        }
        // 検索条件とNicoNicoの rf/rp/ra 等を維持し、pageだけ変更する。
        u.searchParams.set('page', String(pageNumber))
        return u.href
      }

      var pagerPreviewCount = function() {
        return Math.max(0, Math.min(6,
          Math.trunc(Number(model.config.pagerPreviewCount.value)) || 0))
      }

      var pagerOriginalState = new WeakMap()

      var rememberPagerAnchor = function(a) {
        if (pagerOriginalState.has(a)) return
        pagerOriginalState.set(a, {
          // textContentではなくinnerHTMLを保存する。
          // ニコニコの前/次リンクはSVGアイコンなのでtextContent復元するとSVGが消える。
          innerHTML: a.innerHTML,
          textContent: a.textContent,
          href: a.getAttribute('href'),
          title: a.getAttribute('title'),
          display: a.style.display,
          textDecoration: a.style.textDecoration,
          opacity: a.style.opacity,
          pointerEvents: a.style.pointerEvents,
          cursor: a.style.cursor,
          ariaDisabled: a.getAttribute('aria-disabled')
        })
      }

      var restorePagerAnchor = function(a) {
        var s = pagerOriginalState.get(a)
        if (!s) return
        // SVGやspan等の子要素を丸ごと復元する。
        if (a.innerHTML !== s.innerHTML) a.innerHTML = s.innerHTML
        if (s.href == null) a.removeAttribute('href')
        else a.setAttribute('href', s.href)
        if (s.title == null) a.removeAttribute('title')
        else a.setAttribute('title', s.title)
        a.style.display = s.display
        a.style.textDecoration = s.textDecoration
        a.style.opacity = s.opacity
        a.style.pointerEvents = s.pointerEvents
        a.style.cursor = s.cursor
        if (s.ariaDisabled == null) a.removeAttribute('aria-disabled')
        else a.setAttribute('aria-disabled', s.ariaDisabled)
        a.classList.remove('nrn-page-consumed')
        a.removeAttribute('data-nrn-page-range')
        a.removeAttribute('data-nrn-page-range-hidden')
        a.removeAttribute('data-nrn-next-page')
      }

      var isNumericPagerAnchor = function(a) {
        var original = pagerOriginalState.get(a)
        var txt = String(original ? original.textContent : a.textContent || '').trim()
        return /^\d+$/.test(txt)
      }

      var classifyPagerControl = function(a, cur) {
        var p = pageNumberFromHref(a.href)
        if (p == null) return ''
        var txt = String(a.textContent || '').trim().toLowerCase()
        var aria = String(a.getAttribute('aria-label') || '').trim().toLowerCase()
        var rel = String(a.getAttribute('rel') || '').trim().toLowerCase()

        if (rel === 'next'
            || /^(?:次|次へ|next|›|»|→|⇒)$/.test(txt)
            || aria.includes('次') || aria.includes('next')) return 'next'
        if (rel === 'prev' || rel === 'previous'
            || /^(?:前|前へ|prev|previous|‹|«|←|⇐)$/.test(txt)
            || aria.includes('前') || aria.includes('prev')) return 'prev'

        // 現行ニコニコの矢印はSVGだけでtextContentが空の場合がある。
        // 数字ではない同一ページャーリンクなら、遷移先の方向で判定する。
        if (!isNumericPagerAnchor(a)) {
          if (p > cur) return 'next'
          if (p < cur) return 'prev'
        }
        return ''
      }

      var findPagerContext = function() {
        page.doc.querySelectorAll('a[data-nrn-synthetic-page="true"], a[data-nrn-synthetic-next="true"]').forEach(function(a) {
          a.remove()
        })
        var all = Array.from(page.doc.querySelectorAll('a[href]')).filter(function(a) {
          return pageNumberFromHref(a.href) != null
        })
        all.forEach(rememberPagerAnchor)
        // 前回の描画状態を必ず戻してから、新しい取得済み範囲を描画する。
        all.forEach(restorePagerAnchor)

        var cur = currentPageNumber()
        var numeric = all.filter(isNumericPagerAnchor)
        var nextControls = all.filter(function(a) {
          return classifyPagerControl(a, cur) === 'next'
        })
        var prevControls = all.filter(function(a) {
          return classifyPagerControl(a, cur) === 'prev'
        })
        return {
          all: all,
          numeric: numeric,
          nextControls: nextControls,
          prevControls: prevControls
        }
      }

      var createSyntheticNextControl = function(context, nextPage) {
        if (nextPage == null || !context.numeric.length) return null
        var lastNumeric = context.numeric[context.numeric.length - 1]
        var parent = lastNumeric.parentElement
        if (!parent) return null

        var a = page.doc.createElement('a')
        a.href = makePageHref(nextPage)
        a.textContent = '›'
        a.setAttribute('aria-label', '次へ')
        a.style.fontSize = '24px'
        a.style.lineHeight = '1'
        a.style.textDecoration = 'none'
        a.dataset.nrnSyntheticNext = 'true'
        a.dataset.nrnNextPage = String(nextPage)
        a.title = '未取得の直近ページ ' + nextPage + ' を開く'
        a.className = lastNumeric.className
        a.style.marginLeft = '8px'
        parent.appendChild(a)
        console.warn(LOG, '次ページリンクが見つからなかったため補助リンクを生成:', {
          nextPage: nextPage,
          href: a.href
        })
        return a
      }

      var addPagerPreviewLinks = function(context, rangeAnchor, firstPage) {
        var count = pagerPreviewCount()
        if (!count || firstPage == null || !rangeAnchor || !rangeAnchor.parentElement) return []

        var pages = []
        for (var i = 0; i < count; i++) {
          var p = firstPage + i
          if (knownLastPage != null && p >= knownLastPage) break
          if (fetchedPageNumbers.has(p) || p <= currentPageNumber()) continue
          pages.push(p)
        }
        if (!pages.length) return []

        var template = context.numeric.find(function(a) {
          return !a.classList.contains('nrn-page-consumed')
        }) || context.numeric[0]
        var inserted = []
        var anchor = rangeAnchor

        pages.forEach(function(p) {
          var a = page.doc.createElement('a')
          if (template) a.className = template.className
          a.textContent = String(p)
          a.href = makePageHref(p)
          a.dataset.nrnSyntheticPage = 'true'
          a.dataset.nrnPreviewPage = String(p)
          a.title = '未取得ページ ' + p
          a.style.marginLeft = '4px'
          a.style.marginRight = '4px'
          anchor.insertAdjacentElement('afterend', a)
          anchor = a
          inserted.push(a)
        })
        return inserted
      }

      const spaPagerLinks = new Set()
      page._refreshPagerAnnotations = function() {
        if (initialized && model.config.spaNavigationFix.value) updatePagerUi('native pager updated')
      }
      var updatePagerUi = function(reason) {
        if (page._disposed) return
        if (model.config.spaNavigationFix.value) {
          var oldSummary = page.doc.querySelector('.nrn-pager-summary')
          if (model.config.autoFillPagerMode.value === 'off') { restorePagerUi(); return }
          const displayed = new Set(uniqueVisibleRoots(page.movieRoots).map(root => root.movieId))
          const completed = useSnapshot ? [] : journey.update(knownLastPage, function(id) {
            if (candidateFilter.isRejected(id)) return true
            const movie = model.movies.get(id)
            return movie && movie.metadataSettled && movie.error?.type === 'NO_ERROR' && (movie.ng || displayed.has(id))
          })
          if (useSnapshot) journey.restore()
          var scanned = new Set(completed)
          var nativeLinks = Array.from(page.doc.querySelectorAll('a[href]')).filter(a => !a.closest('.nrn-journey-pager')).filter(isNumericPagerAnchor)
            .filter(function(a) { return pageNumberFromHref(a.href) != null })
          nativeLinks.forEach(function(a) {
            spaPagerLinks.add(a)
            const consumed = scanned.has(pageNumberFromHref(a.href))
            if (a.classList.contains('nrn-page-consumed') !== consumed) a.classList.toggle('nrn-page-consumed', consumed)
          })
          for (const link of spaPagerLinks) if (!link.isConnected) spaPagerLinks.delete(link)
          if (nativeLinks.length) {
            var summary = oldSummary || page.doc.createElement('span')
            if (!summary.className) summary.className = 'nrn-pager-summary'
            const text = '表示・NG判定済みページ（斜線）：' + compactRanges([...scanned]).map(function(r) {
              return r.start === r.end ? String(r.start) : r.start + '–' + r.end
            }).join('、') + (scanned.size ? '' : 'なし')
            if (summary.textContent !== text) summary.textContent = text
            if (!summary.isConnected) nativeLinks[0].parentElement.after(summary)
          }
          return
        }
        var mode = model.config.autoFillPagerMode.value
        if (mode === 'off') return

        // React再描画後のページャーから終端情報も最新化。
        refreshKnownLastPage('pager update: ' + reason)
        pagerRenderVersion++
        var cur = currentPageNumber()
        var consumed = [...fetchedPageNumbers]
          .filter(function(p){ return p > cur })
          .sort(function(a,b){return a-b})
        if (!consumed.length) return

        var context = findPagerContext()
        if (!context.all.length) return

        // 重要: 数字リンクだけを取得済み範囲の対象にする。
        // 前へ/次へ矢印は絶対に範囲圧縮・無効化しない。
        var numericAnchors = context.numeric
        var consumedSet = new Set(consumed)
        var ranges = compactRanges(consumed)

        numericAnchors.forEach(function(a) {
          var p = pageNumberFromHref(a.href)
          if (!p || !consumedSet.has(p)) return

          a.classList.add('nrn-page-consumed')
          a.style.textDecoration = 'line-through'
          a.style.opacity = '0.52'
          a.title = 'Nico Nico Ranking NG が自動取得済みのページ ' + p
          if (mode === 'compactSkip') {
            a.style.pointerEvents = 'none'
            a.style.cursor = 'not-allowed'
            a.setAttribute('aria-disabled', 'true')
          }
        })

        if (mode === 'compactSkip') {
          var lastRangeAnchor = null
          ranges.forEach(function(range) {
            var rangeAnchors = numericAnchors.filter(function(a) {
              var p = pageNumberFromHref(a.href)
              return p >= range.start && p <= range.end
            }).sort(function(a,b) {
              return pageNumberFromHref(a.href) - pageNumberFromHref(b.href)
            })
            if (!rangeAnchors.length) return

            var first = rangeAnchors[0]
            lastRangeAnchor = first
            if (range.start !== range.end) {
              first.textContent = range.start + '–' + range.end
              first.setAttribute('data-nrn-page-range', range.start + '-' + range.end)
              for (var i = 1; i < rangeAnchors.length; i++) {
                rangeAnchors[i].style.display = 'none'
                rangeAnchors[i].setAttribute('data-nrn-page-range-hidden', 'true')
              }
            }
          })

          var nextPage = firstUnfetchedPageAfterCurrent()
          var previewLinks = addPagerPreviewLinks(context, lastRangeAnchor, nextPage)
          var nextControls = context.nextControls

          if (nextPage == null) {
            nextControls.forEach(function(a) {
              rememberPagerAnchor(a)
              a.removeAttribute('data-nrn-next-page')
              a.setAttribute('data-nrn-hidden-final-next','true')
              a.setAttribute('aria-hidden','true')
              a.style.display = 'none'
              a.style.pointerEvents = 'none'
              a.title = '最終ページまで取得済み'
            })
          } else {
            if (!nextControls.length) {
              var synthetic = createSyntheticNextControl(context, nextPage)
              if (synthetic) nextControls = [synthetic]
            }

            nextControls.forEach(function(a) {
              rememberPagerAnchor(a)
              // href/titleだけ変更し、SVGを含む中身には一切触れない。
              // 元hrefを基準にすることで rf/rp/ra などのNicoNico側パラメータも維持。
              var nextHref = makePageHref(nextPage, pagerOriginalState.get(a)
                ? pagerOriginalState.get(a).href : a.href)
              a.removeAttribute('data-nrn-hidden-final-next')
              a.removeAttribute('aria-hidden')
              a.style.display = ''
              a.style.pointerEvents = ''
              a.style.opacity = ''
              a.style.textDecoration = ''
              a.style.cursor = 'pointer'
              a.removeAttribute('aria-disabled')
              a.href = nextHref
              a.dataset.nrnNextPage = String(nextPage)
              a.title = '未取得の直近ページ ' + nextPage + ' を開く'
            })
          }
        }

        console.log(LOG, 'ページャー更新:', {
          reason: reason,
          mode: mode,
          currentPage: cur,
          searchedPhysicalPageCount: searchedPhysicalPageCount(),
          fetchedPages: consumed,
          compactRanges: ranges.map(function(r) {
            return r.start === r.end ? String(r.start) : r.start + '-' + r.end
          }),
          nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
          previewCountSetting: pagerPreviewCount(),
          previewPages: Array.from(page.doc.querySelectorAll('a[data-nrn-synthetic-page="true"]')).map(function(a) {
            return Number(a.dataset.nrnPreviewPage)
          }),
          totalPageLinks: context.all.length,
          numericPageLinks: numericAnchors.length,
          nextControls: context.nextControls.length,
          prevControls: context.prevControls.length,
          nextControlDetails: context.nextControls.map(function(a) {
            return {
              href: a.href,
              ariaLabel: a.getAttribute('aria-label') || '',
              rel: a.getAttribute('rel') || '',
              text: String(a.textContent || '').trim(),
              hasSvg: Boolean(a.querySelector('svg')),
              childCount: a.childNodes.length
            }
          }),
          renderVersion: pagerRenderVersion
        })
      }

      var isLiveNextPagerControl = function(a) {
        if (!a || !a.matches || !a.matches('a[href]')) return false
        rememberPagerAnchor(a)
        var cur = currentPageNumber()
        return classifyPagerControl(a, cur) === 'next'
      }

      var correctNextControlHref = function(a, reason) {
        if (page._disposed || model.config.spaNavigationFix.value) return null
        if (model.config.autoFillPagerMode.value !== 'compactSkip') return null
        if (!isLiveNextPagerControl(a)) return null
        var nextPage = firstUnfetchedPageAfterCurrent()
        if (nextPage == null) {
          a.setAttribute('data-nrn-hidden-final-next','true')
          a.setAttribute('aria-hidden','true')
          a.style.display = 'none'
          a.style.pointerEvents = 'none'
          console.log(LOG, '次リンクを非表示（最終ページまで確認済み）:', {
            reason:reason,
            currentPage:currentPageNumber(),
            knownLastPage:knownLastPage
          })
          return null
        }

        var original = pagerOriginalState.get(a)
        var desired = makePageHref(nextPage, original ? original.href : a.href)
        if (a.href !== desired) {
          console.log(LOG, 'React再描画後の次リンクhrefを再補正:', {
            reason: reason,
            before: a.href,
            after: desired,
            nextPage: nextPage
          })
          a.href = desired
        }
        a.dataset.nrnNextPage = String(nextPage)
        a.title = '未取得の直近ページ ' + nextPage + ' を開く'
        return desired
      }

      // hover時に補正するので、ブラウザ左下のリンク表示も正しい値になる。
      ;['pointerover', 'focusin'].forEach(function(eventName) {
        listen(page.doc, eventName, function(e) {
          var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
          if (a) correctNextControlHref(a, eventName)
        }, true)
      })

      var restorePagerUi = function() {
        journey?.restore()
        page.doc.querySelectorAll('.nrn-pager-summary').forEach(function(node) { node.remove() })
        spaPagerLinks.forEach(link => link.classList.remove('nrn-page-consumed')); spaPagerLinks.clear()
        page.doc.querySelectorAll('a[href], a[data-nrn-synthetic-next="true"]').forEach(function(a) {
          if (a.dataset.nrnSyntheticNext === 'true'
              || a.dataset.nrnSyntheticPage === 'true') {
            a.remove()
            return
          }
          restorePagerAnchor(a)
        })
      }
