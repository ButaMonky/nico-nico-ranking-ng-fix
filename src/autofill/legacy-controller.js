    var setupAutoFill = function(model, page, controller) {
      // Resources belong to one result route. No timer/listener survives disposal.
      var timers = new Set(), intervals = new Set(), frames = new Set(), handles = new Set()
      var listeners = []
      var setTimeout = function(fn, delay) {
        var id = globalThis.setTimeout(function() { timers.delete(id); if (!page._disposed) fn() }, delay)
        timers.add(id); return id
      }
      var setInterval = function(fn, delay) {
        var id = globalThis.setInterval(function() { if (!page._disposed) fn() }, delay)
        intervals.add(id); return id
      }
      var requestAnimationFrame = function(fn) {
        var id = globalThis.requestAnimationFrame(function() { frames.delete(id); if (!page._disposed) fn() })
        frames.add(id); return id
      }
      var listen = function(target, name, fn, capture) {
        target.addEventListener(name, fn, capture)
        listeners.push(function() { target.removeEventListener(name, fn, capture) })
      }
      page._disposeAutoFill = function() {
        page._disposed = true
        timers.forEach(globalThis.clearTimeout); intervals.forEach(globalThis.clearInterval)
        frames.forEach(globalThis.cancelAnimationFrame)
        for (var handle of handles) { try { handle.abort?.() } catch (e) {} }
        handles.clear(); listeners.forEach(function(remove) { remove() })
        delete model.config._nrnDiagnosticHook
        delete page._refreshPagerAnnotations
        if (typeof restorePagerUi === 'function') restorePagerUi()
      }
      var LOG = '[NicoNicoRankingNG autoFill v14.1]'

      if (typeof page.fetchPageItems !== 'function') {
        console.warn(LOG, 'このページでは自動継ぎ足し用のページ取得処理が利用できません')
        return
      }

      // -------------------- utility --------------------
      var sourceHref = page._sourceUrl || location.href
      var journey = PagerJourney.create(page, model.config, sourceHref)
      var requestScope = setupAutoFill.sequence = (setupAutoFill.sequence || 0) + 1
      var gmRequest = function(options) {
        return new Promise(function(resolve, reject) {
          var request = typeof GM_xmlhttpRequest === 'undefined'
            ? GM.xmlHttpRequest : GM_xmlhttpRequest
          if (page._disposed) { resolve(null); return }
          var settled = false
          var finish = function(fn) { return function(value) {
            if (settled) return
            settled = true; handles.delete(handle); fn(value)
          } }
          var handle = request(Object.assign({}, options, {
            onload: finish(resolve),
            onerror: finish(reject),
            onabort: finish(function() { reject(new Error('request aborted')) }),
            ontimeout: finish(function() { reject(new Error('timeout')) })
          }))
          if (handle && !settled) handles.add(handle)
          if (handle && typeof handle.catch === 'function') handle.catch(finish(reject))
        })
      }

      var elapsedText = function(ms) {
        if (!Number.isFinite(ms)) return '-'
        if (ms < 1000) return Math.round(ms) + 'ms'
        return (ms / 1000).toFixed(1) + '秒'
      }

      var arrayCount = function(store) {
        return store && Array.isArray(store.array) ? store.array.length : 0
      }

      // -------------------- SelfAdService --------------------
      var selfAdCache = new Map()
      var normalizeAdName = function(v) {
        return String(v == null ? '' : v).normalize('NFKC').trim()
          .replace(/\s+/g, ' ').toUpperCase()
      }
      var advancedRulesUseField = function(field) {
        if (!model.config.advancedNgRulesEnabled.value) return false
        var visit = function(node) {
          if (!node) return false
          if (node.kind === 'condition') return node.field === field
          return Array.isArray(node.children) && node.children.some(visit)
        }
        return AdvancedNgRules.parse(model.config.advancedNgRulesJson.value)
          .some(function(rule) { return rule.enabled && visit(rule.expression) })
      }
      var selfAdRuleRequired = function() {
        return Boolean(
          advancedRulesUseField('selfAdIdMatch')
          || advancedRulesUseField('selfAdNameMatch')
        )
      }
      var selfAdCheckRequired = function() {
        return Boolean(model.config.selfAdWarningEnabled.value || selfAdRuleRequired())
      }
      var visibleNonNgIds = function(ids) {
        return [...new Set(ids)].filter(function(id) {
          var movie = model.movies.get(id)
          return movie && movie.thumbInfoDone && !movie.ng
        })
      }
      var fetchSelfAdResult = function(movie) {
        if (!movie) return Promise.resolve(null)
        return Network.ads(requestScope + ':thanks:' + movie.id, function() { return fetchSelfAdResultUnshared(movie) })
      }
      var fetchSelfAdResultUnshared = async function(movie) {
        if (page._disposed) return
        if (!movie) return null
        if (movie.nicoadSelfAdChecked) return {
          checked:true,
          idMatch:Boolean(movie.nicoadSelfAdIdMatch),
          nameMatch:Boolean(movie.nicoadSelfAdNameMatch),
          sponsors:movie.nicoadSelfAdSponsors || [],
          uploaderId:movie.contributor && movie.contributor.type === 'user'
            ? Number(movie.contributor.id) : null,
          uploaderName:movie.contributor ? movie.contributor.name || '' : ''
        }
        if (selfAdCache.has(movie.id)) {
          var cached = selfAdCache.get(movie.id)
          if (cached.checked || Date.now() - cached.failedAt < 30000) return cached
          selfAdCache.delete(movie.id)
        }

        var contributor = movie.contributor
        var uploaderId = contributor && contributor.type === 'user'
          ? Number(contributor.id) : null
        var uploaderName = contributor ? String(contributor.name || '') : ''
        var uploaderNameNorm = normalizeAdName(uploaderName)
        var result = {
          checked:false, idMatch:false, nameMatch:false, sponsors:[],
          uploaderId:Number.isFinite(uploaderId) ? uploaderId : null,
          uploaderName:uploaderName, error:null
        }
        try {
          var response = await gmRequest({
            method:'GET',
            url:'https://api.nicoad.nicovideo.jp/v1/contents/video/'
              + encodeURIComponent(movie.id) + '/thanks?limit=100',
            timeout:10000,
            headers:{'Accept':'application/json'}
          })
          if (page._disposed) return
          if (Number(response.status) === 404) {
            result.checked = true
            selfAdCache.set(movie.id, result)
            return result
          }
          if (Number(response.status) < 200 || Number(response.status) >= 300) {
            throw new Error('HTTP ' + response.status)
          }
          var json = JSON.parse(response.responseText || response.response || '{}')
          if (!json || !json.data || !Array.isArray(json.data.sponsors)) {
            throw new Error('広告者一覧の応答形式が不正です')
          }
          var sponsors = json.data.sponsors
          if (sponsors.length >= 100) throw new Error('広告者一覧が取得上限100件に到達したため、一致・不一致の判定を保留します')
          result.sponsors = sponsors.map(function(s) {
            return {
              userId:s && s.userId != null ? Number(s.userId) : null,
              advertiserName:s ? String(s.advertiserName || '') : '',
              contribution:s && s.contribution != null ? Number(s.contribution) : null
            }
          })
          result.idMatch = Boolean(Number.isFinite(uploaderId)
            && result.sponsors.some(function(s) {
              return Number.isFinite(s.userId) && s.userId === uploaderId
            }))
          result.nameMatch = Boolean(uploaderNameNorm
            && result.sponsors.some(function(s) {
              return normalizeAdName(s.advertiserName) === uploaderNameNorm
            }))
          result.checked = true
        } catch (e) {
          if (page._disposed) return
          result.error = String(e && e.message ? e.message : e)
          result.failedAt = Date.now()
        }
        selfAdCache.set(movie.id, result)
        return result
      }
      var findDomRootsForMovieId = function(movieId) {
        var esc = (window.CSS && CSS.escape) ? CSS.escape(movieId) : String(movieId).replace(/"/g, '\\"')
        var nodes = Array.from(page.doc.querySelectorAll(
          '[data-decoration-video-id="' + esc + '"]'
        ))
        var roots = []
        var seen = new Set()
        nodes.forEach(function(node) {
          var root = node.classList && node.classList.contains('nrn-parsed')
            ? node : node.closest('.nrn-parsed')
          if (!root) root = node
          if (root && root.isConnected && !seen.has(root)) {
            seen.add(root)
            roots.push(root)
          }
        })
        return roots
      }

      var renderSelfAdWarning = function(movie, result) {
        if (!movie || !result || !result.checked
            || (!result.idMatch && !result.nameMatch)) return {roots:0, badges:0, details:0}
        if (!model.config.selfAdWarningEnabled.value) return {roots:0, badges:0, details:0}

        var roots = findDomRootsForMovieId(movie.id)
        var badges = 0
        var details = 0

        roots.forEach(function(rootElem) {
          // 詳細欄は存在すれば説明を追加。MovieRoot参照に依存しない。
          var info = rootElem.querySelector('.nrn-movie-info-container')
          if (info) {
            var old = info.querySelector('.nrn-self-ad-warning')
            if (old) old.remove()
            var warning = page.doc.createElement('div')
            warning.className = 'nrn-self-ad-warning'
            warning.textContent = result.idMatch
              ? '⚠ 自演広告を検出（投稿者ID = 広告者ID）'
              : '⚠ 自演広告の可能性（投稿者名 = 広告者名）'
            warning.title = result.idMatch
              ? '投稿者ユーザーIDと広告者ユーザーIDが一致しました。'
              : '表示名だけの一致です。同名・名前変更の可能性があるため参考判定です。'
            info.insertBefore(warning, info.firstChild)
            details++
          }

          // タイトル直前にも常時表示。サムネイルのoverflow/stacking contextに依存しない。
          var inlineBadge = rootElem.querySelector('.nrn-self-ad-inline-badge')
          if (!inlineBadge) {
            inlineBadge = page.doc.createElement('span')
            inlineBadge.className = 'nrn-self-ad-inline-badge'
            var titleElem = rootElem.querySelector('.nrn-movie-title')
            if (!titleElem) titleElem = rootElem.querySelector('a[data-nrn-movie-anchor="true"][href*="/watch/"]')
            if (!titleElem) titleElem = rootElem.querySelector('a[href^="/watch/"], a[href*="nicovideo.jp/watch/"]')
            if (titleElem && titleElem.parentNode) titleElem.parentNode.insertBefore(inlineBadge, titleElem)
            else rootElem.insertBefore(inlineBadge, rootElem.firstChild)
          }
          inlineBadge.textContent = result.idMatch ? '⚠ 自演広告' : '⚠ 自演広告？'
          inlineBadge.dataset.confidence = result.idMatch ? 'high' : 'name'
          inlineBadge.dataset.nrnMovieId = movie.id
          inlineBadge.title = result.idMatch
            ? '投稿者IDと広告者IDが一致（高信頼）'
            : '投稿者名と広告者名が一致（名前一致のみ・参考）'

          // サムネイル上バッジも補助表示として残す。
          var badge = rootElem.querySelector('.nrn-self-ad-card-badge')
          if (!badge) {
            badge = page.doc.createElement('span')
            badge.className = 'nrn-self-ad-card-badge'

            var thumbHost = rootElem.querySelector('.nrn-thumb-anchor-wrap')
            if (!thumbHost) {
              // 現行NicoNicoカードでは動画サムネイルを含む16:9要素を優先。
              var videoNode = rootElem.querySelector('[class*="asp_16"], img')
              var p = videoNode && videoNode.parentElement
              while (p && p !== rootElem) {
                var r = p.getBoundingClientRect()
                var ps = p.ownerDocument.defaultView.getComputedStyle(p)
                if (r.width > 80 && r.height > 40 &&
                    (ps.position === 'relative' || ps.position === 'absolute')) {
                  thumbHost = p
                  break
                }
                p = p.parentElement
              }
            }
            if (!thumbHost) thumbHost = rootElem
            if (thumbHost === rootElem) {
              var rs = rootElem.ownerDocument.defaultView.getComputedStyle(rootElem)
              if (rs.position === 'static') rootElem.style.position = 'relative'
            }
            thumbHost.appendChild(badge)
          }

          badge.textContent = result.idMatch ? '⚠ 自演広告' : '⚠ 自演広告？'
          badge.dataset.confidence = result.idMatch ? 'high' : 'name'
          badge.dataset.nrnMovieId = movie.id
          badge.title = result.idMatch
            ? '投稿者IDと広告者IDが一致（高信頼）'
            : '投稿者名と広告者名が一致（名前一致のみ・参考）'
          badges++
        })

        return {roots:roots.length, badges:badges, details:details}
      }

      var renderStoredSelfAdWarnings = function(ids, reason) {
        if (!model.config.selfAdWarningEnabled.value) return
        var rows = []
        ;[...new Set(ids)].forEach(function(id) {
          var movie = model.movies.get(id)
          if (!movie || !movie.nicoadSelfAdChecked
              || (!movie.nicoadSelfAdIdMatch && !movie.nicoadSelfAdNameMatch)) return
          var result = {
            checked:true,
            idMatch:Boolean(movie.nicoadSelfAdIdMatch),
            nameMatch:Boolean(movie.nicoadSelfAdNameMatch),
            sponsors:movie.nicoadSelfAdSponsors || []
          }
          var rendered = renderSelfAdWarning(movie, result)
          var roots = findDomRootsForMovieId(id)
          var visibleRoots = roots.filter(function(el) {
            var s = el.ownerDocument.defaultView.getComputedStyle(el)
            var r = el.getBoundingClientRect()
            return s.display !== 'none' && s.visibility !== 'hidden'
              && r.width > 2 && r.height > 2
          })
          rows.push({
            id:id,
            idMatch:result.idMatch,
            nameMatch:result.nameMatch,
            domRoots:rendered.roots,
            visibleRoots:visibleRoots.length,
            badges:rendered.badges,
            details:rendered.details,
            inlineBadgeVisible:visibleRoots.some(function(el) {
              var b = el.querySelector('.nrn-self-ad-inline-badge')
              if (!b) return false
              var bs = b.ownerDocument.defaultView.getComputedStyle(b)
              var br = b.getBoundingClientRect()
              return bs.display !== 'none' && bs.visibility !== 'hidden'
                && Number(bs.opacity || 1) > 0.2
                && br.width > 2 && br.height > 2
            }),
            overlayBadgeVisible:visibleRoots.some(function(el) {
              var b = el.querySelector('.nrn-self-ad-card-badge')
              if (!b) return false
              var bs = b.ownerDocument.defaultView.getComputedStyle(b)
              var br = b.getBoundingClientRect()
              return bs.display !== 'none' && bs.visibility !== 'hidden'
                && Number(bs.opacity || 1) > 0.2
                && br.width > 2 && br.height > 2
            })
          })
        })
        if (rows.length) {
          console.log(LOG, '自演広告警告UI監査:', {
            reason:reason,
            matched:rows.length,
            visibleMatched:rows.filter(function(r){return r.visibleRoots > 0}).length,
            inlineBadgeVisible:rows.filter(function(r){return r.inlineBadgeVisible}).length,
            overlayBadgeVisible:rows.filter(function(r){return r.overlayBadgeVisible}).length,
            badgeMissing:rows.filter(function(r){return r.visibleRoots > 0 && !r.inlineBadgeVisible}).length
          })
          var bad = rows.filter(function(r){ return r.visibleRoots > 0 && !r.inlineBadgeVisible })
          if (bad.length) {
            console.warn(LOG, '自演広告一致は検出済みですが警告バッジが見えていません')
            console.table(bad)
          }
          window.__nrnSelfAdUiAudit = rows
        }
      }

      var ensureSelfAdChecks = async function(ids, reason) {
        if (page._disposed) return
        if (!selfAdCheckRequired()) return {checked:0, matches:0, errors:0}
        var unique = [...new Set(ids)]
        var cursor = 0, checked = 0, matches = 0, errors = 0
        var rows = []
        var worker = async function() {
          if (page._disposed) return
          while (cursor < unique.length) {
            var id = unique[cursor++]
            var movie = model.movies.get(id)
            if (!movie || !movie.thumbInfoDone) continue
            var result = await fetchSelfAdResult(movie)
            if (page._disposed) return
            if (!result) continue
            if (result.checked) {
              checked++
              movie.setNicoadSelfAdResult(result)
              if (result.idMatch || result.nameMatch) {
                matches++
              }
            } else {
              errors++
              movie.nicoadSelfAdError = result.error || 'unknown'
            }
            rows.push({
              id:id, uploaderId:result.uploaderId, uploaderName:result.uploaderName,
              sponsors:result.sponsors ? result.sponsors.length : 0,
              idMatch:result.idMatch, nameMatch:result.nameMatch,
              checked:result.checked, error:result.error || ''
            })
          }
        }
        var started = performance.now()
        await Promise.all(Array.from({length:Math.min(6, Math.max(1, unique.length))}, worker))
        if (page._disposed) return
        var matchedRows = rows.filter(function(r) { return r.idMatch || r.nameMatch })
        var errorRows = rows.filter(function(r) { return !r.checked || r.error })
        var summary = {
          reason:reason,
          requested:unique.length,
          checked:checked,
          matches:matches,
          idMatches:rows.filter(function(r){return r.idMatch}).length,
          nameMatches:rows.filter(function(r){return r.nameMatch}).length,
          errors:errors,
          elapsedMs:Math.round(performance.now() - started),
          ruleUsesIdMatch:advancedRulesUseField('selfAdIdMatch'),
          ruleUsesNameMatch:advancedRulesUseField('selfAdNameMatch'),
          warningEnabled:model.config.selfAdWarningEnabled.value
        }

        // サマリーは折りたたまない。ログ貼り付け時にも結果が残る。
        console.log(LOG, '自演広告監査集計:', summary)
        if (matchedRows.length) {
          console.warn(LOG, '自演広告一致:', matchedRows.length + '件')
          console.table(matchedRows)
        }
        if (errorRows.length) {
          console.warn(LOG, '自演広告情報の取得失敗/未確認:', errorRows.length + '件')
          console.table(errorRows)
        }
        console.groupCollapsed(LOG + ' 自演広告監査詳細: ' + reason)
        console.table(rows)
        console.groupEnd()

        window.__nrnSelfAdDiagnostics = {
          summary:summary,
          matchedRows:matchedRows,
          errorRows:errorRows,
          rows:rows
        }
        return {checked:checked, matches:matches, errors:errors,
          idMatches:summary.idMatches, nameMatches:summary.nameMatches}
      }

      var decodeSearchPath = function() {
        try {
          return decodeURIComponent(location.pathname.replace(/^\/(tag|search)\//, ''))
        } catch (e) {
          if (page._disposed) return
          return location.pathname
        }
      }

      // -------------------- StatusPanel --------------------
      var badge = ensureStatusBadge(page.doc)
      var runStartedAt = performance.now()
      var finishedAt = null
      var phase = 'starting'
      var phaseDetail = '準備中'
      var lastTiming = null
      var adPending = 0
      var sourceLabel = '従来方式'
      var fallbackReason = ''

      // -------------------- runtime state --------------------
      var originalRoots = []
      var originalMovieIds = new Set()
      var knownMovieIds = new Set()
      var fetchedExtraPages = 0
      var totalFetchedItems = 0
      var totalApiPrefilteredNg = 0
      var totalDuplicatesRemoved = 0
      var totalDetailChecked = 0
      var totalAcceptedFromAdded = 0
      var candidatePool = []
      var candidatePoolSeen = new Set()
      var nextPageToFetch = page._currentPageNumber + 1
      var fetching = false
      var initialized = false
      var gaveUp = false
      var stopReason = ''
      var noProgressStreak = 0
      var debounceTimer = null
      var completionReported = false
      var lastFetchedHadNext = null
      var snapshotValidated = false
      var snapshotValidation = null
      var snapshotValidationOffset = Math.max(0, (page._currentPageNumber - 1) * 32)
      var snapshotOffset = Math.max(0, page._currentPageNumber * 32)
      var lastAcceptanceRate = null
      var detailCache = getNnrSessionDetailCache(model.config)
      var cacheHits = 0
      var cacheMisses = 0
      var cacheWrites = 0
      var cacheRestores = 0
      var cacheRestoreFailures = 0
      var fetchedPageNumbers = new Set()
      var pagerRenderVersion = 0
      // 現在表示中ページのページネーションUIを最優先の終端情報として使う。
      // fetch先HTMLの maxPage は「3」など局所的な値になることがあるため、
      // 既知終端を小さく上書きしない。
      var currentPhysicalPage = page._currentPageNumber
      // setupAutoFill時点ではReactのページャーが未描画のことがある。
      // ここでは終端を確定せず、waitForInitialRoots後に改めて検査する。
      var knownLastPage = null
      var endPageDetectionSource = 'not-checked-yet'
      var endReachedWithoutRequest = false
      var paginationDetectionHistory = []

      var targetCount = function() {
        var n = Number(model.config.autoFillTargetCount.value)
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 36
      }

      var refreshKnownLastPage = function(reason) {
        var snapshot = typeof page._paginationSnapshot === 'function'
          ? page._paginationSnapshot()
          : null

        var result = {
          reason: reason,
          at: new Date().toISOString(),
          currentPage: currentPageNumber ? currentPageNumber() : currentPhysicalPage,
          snapshot: snapshot,
          previousKnownLastPage: knownLastPage,
          accepted: false,
          decision: ''
        }

        if (!snapshot || !snapshot.hasPaginationEvidence) {
          result.decision = 'ページャー未描画/証拠なし → 終端未確定'
          endPageDetectionSource = 'pagination-not-ready'
        } else if (snapshot.maxPage < snapshot.currentPage) {
          result.decision = '最大ページが現在ページ未満 → 不正値として無視'
        } else {
          // 現在ページの実ページャーに存在する最大番号を採用。
          // 1ページ目なら通常は末尾リンク(例:157)も含まれる。
          knownLastPage = snapshot.maxPage
          endPageDetectionSource = 'current-pagination-ui'
          result.accepted = true
          result.decision = snapshot.maxPage === snapshot.currentPage
            ? '現在ページがページャー最大値 → 最終ページ候補'
            : '現在より大きいページを確認 → 最終ページ=' + snapshot.maxPage
        }

        result.knownLastPageAfter = knownLastPage
        paginationDetectionHistory.push(result)
        if (paginationDetectionHistory.length > 20) paginationDetectionHistory.shift()

        console.groupCollapsed(LOG + ' ページネーション終端検査: ' + reason)
        console.log('判定:', {
          currentPage: result.currentPage,
          previousKnownLastPage: result.previousKnownLastPage,
          knownLastPageAfter: result.knownLastPageAfter,
          accepted: result.accepted,
          decision: result.decision,
          source: endPageDetectionSource
        })
        if (snapshot) {
          console.log('ページャースナップショット:', {
            currentPage: snapshot.currentPage,
            maxPage: snapshot.maxPage,
            pageNumbers: snapshot.pageNumbers,
            linkCount: snapshot.linkCount,
            hasHigherPage: snapshot.hasHigherPage,
            hasLowerPage: snapshot.hasLowerPage,
            hasPaginationEvidence: snapshot.hasPaginationEvidence
          })
          if (snapshot.rows && snapshot.rows.length) {
            console.table(snapshot.rows)
          }
        }
        console.groupEnd()

        return result
      }

      var searchedPhysicalPageCount = function() {
        return useSnapshot ? null : 1 + fetchedPageNumbers.size
      }

      var isRunBusy = function() {
        return Boolean(fetching
          || ['starting','waiting-dom','initial-ng','validating-api','fetching','ng-check','adding'].includes(phase))
      }

      var setPhase = function(nextPhase, detail) {
        detail = detail || ''
        if (phase === nextPhase && phaseDetail === detail) {
          updateStatus()
          return
        }
        phase = nextPhase
        phaseDetail = detail
        if (nextPhase === 'completed' || nextPhase === 'stopped' || nextPhase === 'error') {
          finishedAt = performance.now()
        }
        console.log(LOG, '状態変更:', nextPhase, phaseDetail)
        updateStatus()
      }

      var phaseText = function() {
        switch (phase) {
          case 'starting': return '● 準備中'
          case 'waiting-dom': return '● 初期動画を確認中'
          case 'initial-ng': return '● 初期NG判定中'
          case 'validating-api': return '● API結果を検証中'
          case 'fetching': return '● 動画候補を取得中'
          case 'ng-check': return '● NG判定中'
          case 'adding': return '● 動画を追加中'
          case 'completed':
            return adPending > 0 ? '✓ 目標達成（広告情報更新中）' : '✓ 完了'
          case 'stopped': return '■ 終了'
          case 'error': return '⚠ エラー'
          case 'disabled': return '○ 無効'
          default: return phase
        }
      }

      var connectedOriginalRoots = function() {
        return originalRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
        })
      }

      var connectedInjectedRoots = function() {
        return page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
              && r.elem.dataset.nrnAutofill === 'true'
              && r.movieId
        })
      }

      var currentOriginalRootCandidates = function() {
        return page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
              && r.elem.dataset.nrnAutofill !== 'true'
              && r.movieId
        })
      }

      var uniqueVisibleRoots = function(roots) {
        var seen = new Set()
        return roots.filter(function(r) {
          if (!r || !r.elem || !r.elem.isConnected || !r.movieId || seen.has(r.movieId)) return false
          var movie = model.movies.get(r.movieId)
          if (!movie) return false
          if (model.config.useGetThumbInfo.value && !movie.thumbInfoDone) return false
          if (movie.ng) return false
          if (r.elem.classList.contains('nrn-hide')) return false
          if (r.elem.classList.contains('nrn-autofill-pending')) return false
          if (r.elem.classList.contains('nrn-autofill-overflow')) return false
          seen.add(r.movieId)
          return true
        })
      }

      var visibleOriginalCount = function() {
        return uniqueVisibleRoots(connectedOriginalRoots()).length
      }
      var visibleInjectedCount = function() {
        return uniqueVisibleRoots(connectedInjectedRoots()).length
      }
      var visibleTotalCount = function() {
        return visibleOriginalCount() + visibleInjectedCount()
      }

      var originalNgCount = function() {
        var ids = new Set()
        connectedOriginalRoots().forEach(function(r) {
          var movie = model.movies.get(r.movieId)
          if (movie && movie.ng) ids.add(r.movieId)
        })
        return ids.size
      }

      var injectedNgCount = function() {
        var ids = new Set()
        connectedInjectedRoots().forEach(function(r) {
          var movie = model.movies.get(r.movieId)
          if (movie && movie.ng) ids.add(r.movieId)
        })
        return ids.size
      }

      var pendingInjectedCount = function() {
        return connectedInjectedRoots().filter(function(r) {
          return r.elem.classList.contains('nrn-autofill-pending')
        }).length
      }

      var rebalanceOverflow = function() {
        connectedInjectedRoots().forEach(function(r) {
          r.elem.classList.remove('nrn-autofill-overflow')
        })
        var remaining = Math.max(0, targetCount() - visibleOriginalCount())
        var visibleInjected = uniqueVisibleRoots(connectedInjectedRoots())
        visibleInjected.forEach(function(r, i) {
          if (i >= remaining) r.elem.classList.add('nrn-autofill-overflow')
        })
      }

      // -------------------- diagnostics --------------------
      var currentSearchDescriptorForLog = function() {
        var u = new URL(location.href)
        var sort = u.searchParams.get('sort') || '(default)'
        var order = u.searchParams.get('order') || '(default)'
        var sortLabels = {
          hotLikeAndMylist: 'ニコニコで人気',
          registeredAt: '投稿日時',
          viewCount: '再生数',
          lastCommentTime: 'コメント日時',
          likeCount: 'いいね！数',
          commentCount: 'コメント数',
          mylistCount: 'マイリスト登録数',
          length: '再生時間',
          duration: '再生時間'
        }
        var orderLabels = {asc: '昇順', desc: '降順'}
        var trackingKeys = new Set(['rf', 'rp', 'ra'])
        var knownFilterKeys = new Set(['start', 'end', 'l_range'])
        var allParams = Array.from(u.searchParams.entries()).map(function(x) {
          return {key: x[0], value: x[1]}
        })
        var filters = allParams.filter(function(x) {
          return knownFilterKeys.has(x.key)
        }).map(function(x) {
          var label = x.key === 'start' ? '期間開始'
            : x.key === 'end' ? '期間終了'
            : x.key === 'l_range' ? '動画時間フィルター' : x.key
          return {key: x.key, value: x.value, label: label}
        })
        var trackingParams = allParams.filter(function(x) {
          return trackingKeys.has(x.key)
        })
        var unknownParams = allParams.filter(function(x) {
          return !['sort','order','page','start','end','l_range','rf','rp','ra'].includes(x.key)
        })
        return {
          type: u.pathname.startsWith('/tag/') ? 'tag'
              : u.pathname.startsWith('/search/') ? 'search' : 'other',
          query: decodeSearchPath(),
          sort: sort,
          sortLabel: sortLabels[sort] || sort,
          order: order,
          orderLabel: orderLabels[order] || order,
          page: u.searchParams.get('page') || '1',
          start: u.searchParams.get('start') || null,
          end: u.searchParams.get('end') || null,
          lengthRange: u.searchParams.get('l_range') || null,
          filters: filters,
          trackingParams: trackingParams,
          unknownParams: unknownParams,
          allParams: allParams,
          canonicalSearchUrl: u.origin + u.pathname + u.search
        }
      }

      var logSearchMethodAudit = function() {
        var search = currentSearchDescriptorForLog()
        console.group(LOG + ' 検索条件・検索法')
        console.table({
          searchType: {value: search.type},
          query: {value: search.query},
          sort: {value: search.sort},
          sortLabel: {value: search.sortLabel},
          order: {value: search.order},
          orderLabel: {value: search.orderLabel},
          page: {value: search.page},
          dateStart: {value: search.start},
          dateEnd: {value: search.end},
          lengthRange: {value: search.lengthRange}
        })
        if (search.filters.length) {
          console.log('検索フィルター:')
          console.table(search.filters)
        }
        if (search.trackingParams.length) {
          console.log('検索結果に影響しない追跡パラメータ:')
          console.table(search.trackingParams)
        }
        if (search.unknownParams.length) {
          console.warn('未分類URLパラメータ（API利用時は安全側に倒して検証/fallback対象）:')
          console.table(search.unknownParams)
        }
        console.log('URLパラメータ全件:')
        console.table(search.allParams)
        console.groupEnd()
        return search
      }

      var logAdvancedRuleTrace = function(movie, label) {
        if (!model.config.developerMode.value
            || !model.config.advancedNgRulesEnabled.value
            || !movie) return
        var matched = AdvancedNgRules.match(
          movie, true, model.config.advancedNgRulesJson.value, true)
        if (!matched.length) return
        console.groupCollapsed(LOG + ' 論理NG判定トレース: ' + (label || movie.id))
        console.log({id:movie.id, title:movie.title})
        matched.forEach(function(rule) {
          console.log('MATCH:', rule.name)
          if (rule.trace) console.table(rule.trace)
        })
        console.groupEnd()
      }

      var logRuntimeSettings = function() {
        var search = currentSearchDescriptorForLog()
        var settings = {
          version: '14.1',
          url: location.href,
          searchType: search.type,
          query: search.query,
          sort: search.sort,
          sortLabel: search.sortLabel,
          order: search.order,
          orderLabel: search.orderLabel,
          page: search.page,
          dateStart: search.start,
          dateEnd: search.end,
          lengthRange: search.lengthRange,
          filters: search.filters.map(function(x){ return x.label + '=' + x.value }).join(', ') || '(none)',
          trackingParams: search.trackingParams.map(function(x){ return x.key + '=' + x.value }).join(', ') || '(none)',
          unknownParams: search.unknownParams.map(function(x){ return x.key + '=' + x.value }).join(', ') || '(none)',
          detectedCurrentPage: currentPhysicalPage,
          detectedLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          paginationDetectionState: 'React描画後に再検査',
          autoFillEnabled: model.config.autoFillEnabled.value,
          targetCount: targetCount(),
          requestedMode: model.config.autoFillInfoMode.value,
          adMode: model.config.autoFillAdMode.value,
          selfAdWarningEnabled: model.config.selfAdWarningEnabled.value,
          selfAdRuleIdMatch:advancedRulesUseField('selfAdIdMatch'),
          selfAdRuleNameMatch:advancedRulesUseField('selfAdNameMatch'),
          selfAdFetchPolicy:selfAdRuleRequired()
            ? '全候補（NG条件に必要）'
            : (model.config.selfAdWarningEnabled.value ? 'NG通過動画のみ' : 'OFF'),
          useGetThumbInfo: model.config.useGetThumbInfo.value,
          thumbInfoConcurrency: model.config.thumbInfoConcurrency.value,
          maxExtraPages: model.config.autoFillMaxExtraPages.value,
          openNewTab: model.config.openNewWindow.value,
          developerMode: model.config.developerMode.value,
          statusPanelMode: model.config.statusPanelMode.value,
          detailUiTheme: model.config.detailUiTheme.value,
          resolvedDetailUiTheme: (window.__nrnDetailUiTheme && window.__nrnDetailUiTheme.resolved) || null,
          detailBatchMax: model.config.autoFillDetailBatchMax.value,
          spaNavigationFix: model.config.spaNavigationFix.value,
          autoFillPagerMode: model.config.autoFillPagerMode.value,
          pagerPreviewCount: model.config.pagerPreviewCount.value,
          sessionDetailCacheEnabled: model.config.sessionDetailCacheEnabled.value,
          sessionDetailCacheTtlMinutes: model.config.sessionDetailCacheTtlMinutes.value,
          sessionDetailCacheMaxEntries: model.config.sessionDetailCacheMaxEntries.value,
          statusAnimationEnabled: model.config.statusAnimationEnabled.value,
          developerDiagnosticMode: model.config.developerDiagnosticMode.value,
          lockedTagCountNg: model.config.ngLockedTagCountEnabled.value,
          lockedTagCountThreshold: model.config.ngLockedTagCountThreshold.value,
          advancedNgRulesEnabled: model.config.advancedNgRulesEnabled.value,
          advancedNgRuleCount: AdvancedNgRules.parse(
            model.config.advancedNgRulesJson.value).length,
          advancedNgRules: AdvancedNgRules.parse(
            model.config.advancedNgRulesJson.value).map(function(r) {
              return {
                name:r.name,
                enabled:r.enabled,
                expression:AdvancedNgRules.expressionText(r.expression)
              }
            }),
          ngMovieCount: arrayCount(model.config.ngMovies),
          ngTitleCount: arrayCount(model.config.ngTitles),
          ngTagCount: arrayCount(model.config.ngTags),
          ngLockedTagCount: arrayCount(model.config.ngLockedTags),
          ngUserIdCount: arrayCount(model.config.ngUserIds),
          ngUserNameCount: arrayCount(model.config.ngUserNames),
          ngChannelIdCount: arrayCount(model.config.ngChannelIds)
        }
        console.group(LOG + ' 実行設定')
        console.table(settings)
        console.log('完全設定オブジェクト:', settings)
        console.groupEnd()
        return settings
      }

      var logNavigationNotice = function() {
        if (!model.config.spaNavigationFix.value) {
          console.warn(LOG,
            'SPAページ移動対策がOFFです。現行NicoNicoでタグ/ページ/並び順を変更すると、'
            + 'URLだけ変わってスクリプトが再初期化されない場合があります。')
        }
      }

      var logNgEffectivenessNotice = function() {
        if (model.config.autoFillInfoMode.value === 'snapshot'
            && model.config.ngLockedTagCountEnabled.value) {
          console.info(
            LOG,
            'API高速モードですが「🔒 タグロック数NG」が有効です。Snapshot APIにはロック情報がないため、'
            + 'この条件はGetThumbInfoによる完全判定が必要です。API事前NGが0件でも異常ではありません。'
          )
        }
      }

      var updateStatus = function() {
        if (page._disposed) return
        if (!badge) return

        var busyPhases = new Set([
          'starting', 'waiting-dom', 'initial-ng', 'validating-api',
          'fetching', 'ng-check', 'adding'
        ])
        var shouldAnimate = Boolean(
          model.config.statusAnimationEnabled.value && busyPhases.has(phase))
        badge.classList.toggle('nrn-status-busy', shouldAnimate)

        var mode = model.config.statusPanelMode.value
        if (mode === 'hidden') {
          badge.style.display = 'none'
          return
        }
        badge.style.display = ''
        var elapsed = (finishedAt || performance.now()) - runStartedAt

        if (mode === 'compact') {
          badge.textContent = [
            phaseText(),
            initialized
              ? visibleTotalCount() + ' / ' + targetCount() + '件'
              : '判定中 / ' + targetCount() + '件',
            phaseDetail || '',
            !useSnapshot && fetchedPageNumbers.size
              ? '検索 ' + searchedPhysicalPageCount() + 'ページ分'
              : '',
            knownLastPage != null && currentPageNumber() >= knownLastPage
              ? '最終ページ ' + knownLastPage
              : '',
            '経過 ' + elapsedText(elapsed)
          ].filter(Boolean).join('\n')
          badge.title = '設定で詳細表示に変更できます。ダブルクリックで診断情報をConsoleへ出力。'
          return
        }

        var lines = [
          'Nico Nico Ranking NG / AutoFill v14.1',
          '状態：' + phaseText(),
          phaseDetail ? '処理：' + phaseDetail : '',
          '取得方式：' + sourceLabel + (fallbackReason ? '（fallback: ' + fallbackReason + '）' : ''),
          initialized
            ? '表示動画：' + visibleTotalCount() + ' / 目標 ' + targetCount() + '件'
            : '表示動画：判定中 / 目標 ' + targetCount() + '件',
          initialized ? '現在ページのNG：' + originalNgCount() + '件' : '現在ページのNG：判定中',
          '追加分：表示 ' + visibleInjectedCount() + '件 / NG ' + injectedNgCount() + '件',
          '候補プール：' + candidatePool.length + '件 / 詳細判定済み ' + totalDetailChecked + '件',
          '確認済み：' + totalFetchedItems + '件 / 重複除外 ' + totalDuplicatesRemoved + '件',
          totalApiPrefilteredNg ? 'API事前NG：' + totalApiPrefilteredNg + '件' : '',
          lastAcceptanceRate != null ? '直近採用率：' + Math.round(lastAcceptanceRate * 100) + '%' : '',
          '追加取得：' + fetchedExtraPages + '単位',
          useSnapshot
            ? '検索したページ数：API方式のため物理ページ換算なし'
            : '検索したページ数：' + searchedPhysicalPageCount()
              + 'ページ分（現在ページ1＋自動 ' + fetchedPageNumbers.size + '）',
          '取得済みページ：' + (fetchedPageNumbers.size ? [...fetchedPageNumbers].sort(function(a,b){return a-b}).join(',') : 'なし'),
          '最終ページ判定：' + (knownLastPage != null
            ? knownLastPage + '（' + endPageDetectionSource + '）'
            : '未確定'),
          model.config.sessionDetailCacheEnabled.value
            ? '詳細キャッシュ：復元 ' + cacheRestores + ' / hit ' + cacheHits + ' / miss ' + cacheMisses + ' / 保存 ' + detailCache.size + '件'
            : '詳細キャッシュ：OFF',
          '詳細情報同時取得：' + model.config.thumbInfoConcurrency.value + '件',
          'SPAページ移動対策：' + (model.config.spaNavigationFix.value ? 'ON' : 'OFF'),
          model.config.developerMode.value
            ? '開発者モード：ON [' + model.config.developerDiagnosticMode.value + '] ' + (developerSuiteRunning
                ? '（' + developerSuiteStep + '/' + developerSuiteTotalSteps + ' ' + developerSuiteStatus + '）'
                : '（' + developerSuiteStatus + '）')
            : '開発者モード：OFF',
          adPending ? 'ニコニコ広告：' + adPending + '件取得中' : 'ニコニコ広告：待機なし',
          '経過時間：' + elapsedText(elapsed),
          lastTiming ? '直近処理：' + elapsedText(lastTiming.totalMs) : '',
          stopReason ? '終了理由：' + stopReason : '',
          '',
          '※文字はドラッグしてコピーできます。ダブルクリックでConsoleへ診断出力。'
        ].filter(Boolean)
        badge.textContent = lines.join('\n')
      }

      var statusTimer = setInterval(function() {
        if (initialized && !fetching) return
        if (!document.contains(badge)) {
          clearInterval(statusTimer)
          return
        }
        updateStatus()
      }, 250)

      var logSnapshot = function(reason, extra) {
        var data = {
          reason: reason,
          state: phase,
          phaseDetail: phaseDetail,
          source: sourceLabel,
          fallbackReason: fallbackReason || null,
          target: targetCount(),
          visibleTotal: initialized ? visibleTotalCount() : null,
          visibleOriginal: initialized ? visibleOriginalCount() : null,
          visibleInjected: visibleInjectedCount(),
          originalNg: initialized ? originalNgCount() : null,
          injectedNg: injectedNgCount(),
          pending: pendingInjectedCount(),
          candidatePool: candidatePool.length,
          fetchedUnits: fetchedExtraPages,
          fetchedItems: totalFetchedItems,
          detailChecked: totalDetailChecked,
          acceptedFromAdded: totalAcceptedFromAdded,
          apiPrefilteredNg: totalApiPrefilteredNg,
          duplicatesRemoved: totalDuplicatesRemoved,
          knownIds: knownMovieIds.size,
          thumbInfoConcurrency: model.config.thumbInfoConcurrency.value,
          adMode: model.config.autoFillAdMode.value,
          adPending: adPending,
          fetchedPageNumbers: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
          searchedPhysicalPageCount: searchedPhysicalPageCount(),
          pagerMode: model.config.autoFillPagerMode.value,
          currentPhysicalPage: currentPageNumber(),
          knownLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          endReachedWithoutRequest: endReachedWithoutRequest,
          paginationDetectionHistory: paginationDetectionHistory.slice(),
          detailCacheEnabled: model.config.sessionDetailCacheEnabled.value,
          detailCacheSize: detailCache.size,
          detailCacheHits: cacheHits,
          detailCacheMisses: cacheMisses,
          detailCacheWrites: cacheWrites,
          detailCacheRestores: cacheRestores,
          detailCacheRestoreFailures: cacheRestoreFailures,
          detailCacheBackend: detailCache.diagnostics(),
          snapshotValidated: snapshotValidated,
          snapshotValidation: snapshotValidation,
          elapsedMs: Math.round((finishedAt || performance.now()) - runStartedAt),
          stopReason: stopReason || null
        }
        if (extra) Object.assign(data, extra)
        console.log(LOG, data)
        return data
      }

      listen(badge, 'dblclick', function() {
        var s = logSnapshot('status badge dblclick', {
          domCards: page.doc.querySelectorAll('[data-decoration-video-id]').length,
          domInjected: page.doc.querySelectorAll('[data-nrn-autofill="true"]').length,
          domHidden: page.doc.querySelectorAll('[data-decoration-video-id].nrn-hide').length
        })
        console.table(s)
      })

      // -------------------- waiting helpers --------------------
      var waitForInitialRoots = function(timeoutMs) {
        return new Promise(function(resolve) {
          var startedAt = Date.now()
          var lastCount = -1
          var stableSince = 0

          var check = function() {
            var candidates = currentOriginalRootCandidates()
            var count = candidates.length
            var domCount = page.doc.querySelectorAll(
              '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
            ).length

            if (count > 0 && count === lastCount) {
              if (!stableSince) stableSince = Date.now()
              if (Date.now() - stableSince >= 300
                  && (domCount === 0 || count >= domCount)) {
                resolve(candidates.slice())
                return
              }
            } else {
              lastCount = count
              stableSince = count > 0 ? Date.now() : 0
            }

            if (Date.now() - startedAt >= timeoutMs) {
              resolve(candidates.slice())
              return
            }
            setTimeout(check, 100)
          }
          check()
        })
      }

      var waitForThumbInfo = function(movieIds, timeoutMs) {
        if (!model.config.useGetThumbInfo.value) return Promise.resolve(true)
        var ids = [...new Set(movieIds)]
        if (!ids.length) return Promise.resolve(true)

        return new Promise(function(resolve) {
          var done = false
          var remaining = new Set(ids.filter(function(id) {
            var movie = model.movies.get(id)
            return movie && !movie.thumbInfoDone
          }))
          if (!remaining.size) {
            resolve(true)
            return
          }

          var finish = function() {
            if (!done && remaining.size === 0) {
              done = true
              clearTimeout(timer)
              resolve(true)
            }
          }

          remaining.forEach(function(id) {
            var movie = model.movies.get(id)
            if (!movie) {
              remaining.delete(id)
              return
            }
            movie.on('thumbInfoDone', function() {
              remaining.delete(id)
              finish()
            })
          })

          var timer = setTimeout(function() {
            if (done) return
            done = true
            console.warn(LOG, '詳細情報待機タイムアウト:', [...remaining])
            resolve(false)
          }, timeoutMs)
          finish()
        })
      }

      // -------------------- duplicate protection --------------------
      var isMovieAlreadyOnPage = function(id) {
        if (!id) return true
        return Array.from(page.doc.querySelectorAll('[data-decoration-video-id]')).some(function(el) {
          return el.getAttribute('data-decoration-video-id') === id
        })
      }

      var filterFreshItems = function(items) {
        var fresh = []
        var duplicateIds = []
        items.forEach(function(item) {
          if (!item || !item.id) return
          if (knownMovieIds.has(item.id)
              || candidatePoolSeen.has(item.id)
              || isMovieAlreadyOnPage(item.id)) {
            duplicateIds.push(item.id)
            knownMovieIds.add(item.id)
          } else {
            candidatePoolSeen.add(item.id)
            fresh.push(item)
          }
        })
        totalDuplicatesRemoved += duplicateIds.length
        return {freshItems: fresh, duplicateIds: duplicateIds}
      }

      // -------------------- Snapshot source --------------------
      var SNAPSHOT_ENDPOINT =
        'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

      var SNAPSHOT_SORT_MAP = {
        registeredAt: 'startTime',
        viewCount: 'viewCounter',
        commentCount: 'commentCounter',
        mylistCount: 'mylistCounter',
        likeCount: 'likeCounter',
        length: 'lengthSeconds',
        duration: 'lengthSeconds',
        lastCommentTime: 'lastCommentTime'
      }

      var createSnapshotDescriptor = function() {
        var u = new URL(sourceHref)
        if (!/^\/(tag|search)\//.test(u.pathname)) {
          return {supported: false, reason: 'tag/search以外'}
        }

        var isTag = u.pathname.startsWith('/tag/')
        var q = decodeURIComponent(u.pathname.replace(/^\/(tag|search)\//, ''))
        var explicitSort = u.searchParams.get('sort')
        var sort = explicitSort || '(default)'
        var order = u.searchParams.get('order') || 'desc'

        if (!explicitSort) {
          return {
            supported:false,
            reason:'並び順未指定（NicoNico既定順をSnapshotで保証できない）'
          }
        }

        var apiSort = SNAPSHOT_SORT_MAP[sort]
        if (!apiSort) {
          return {supported:false, reason:'API非対応の並び順: ' + sort}
        }

        var allowed = new Set(['sort', 'order', 'start', 'end', 'page'])
        var trackingOnly = new Set(['rf', 'rp', 'ra'])
        var unsupported = []
        var ignoredTracking = []
        u.searchParams.forEach(function(value, key) {
          if (trackingOnly.has(key)) {
            ignoredTracking.push(key + '=' + value)
          } else if (!allowed.has(key)) {
            unsupported.push(key)
          }
        })
        if (unsupported.length) {
          return {
            supported: false,
            reason: 'APIへ安全に変換できない条件: ' + [...new Set(unsupported)].join(','),
            unsupportedParams: [...new Set(unsupported)],
            ignoredTracking: ignoredTracking
          }
        }

        return {
          supported: true,
          isTag: isTag,
          q: q,
          sortField: apiSort,
          order: order === 'asc' ? 'asc' : 'desc',
          start: u.searchParams.get('start'),
          end: u.searchParams.get('end'),
          ignoredTracking: ignoredTracking,
          unsupportedParams: []
        }
      }

      var snapshotDescriptor = createSnapshotDescriptor()

      var logApiTranslationAudit = function() {
        var search = currentSearchDescriptorForLog()
        console.group(LOG + ' 検索API変換監査')
        console.log('ユーザー検索条件:', search)
        console.log('Snapshot変換結果:', snapshotDescriptor)
        if (!snapshotDescriptor.supported) {
          console.warn('この検索法はSnapshot APIへ安全に完全変換できないため、API方式では従来方式へfallbackします。')
        } else {
          console.log('API変換可能: ✓', {
            query: snapshotDescriptor.q,
            targets: snapshotDescriptor.isTag ? 'tagsExact' : 'title,description,tags',
            sort: (snapshotDescriptor.order === 'asc' ? '+' : '-') + snapshotDescriptor.sortField,
            dateStart: snapshotDescriptor.start,
            dateEnd: snapshotDescriptor.end,
            ignoredTracking: snapshotDescriptor.ignoredTracking || []
          })
        }
        console.groupEnd()
      }

      var snapshotFetchOffset = async function(offset) {
        if (page._disposed) return
        var p = new URLSearchParams()
        p.set('q', snapshotDescriptor.q)
        p.set('targets', snapshotDescriptor.isTag ? 'tagsExact' : 'title,description,tags')
        p.set('fields', [
          'contentId', 'title', 'description', 'userId', 'channelId',
          'viewCounter', 'mylistCounter', 'likeCounter', 'commentCounter',
          'lengthSeconds', 'thumbnailUrl', 'startTime', 'tags'
        ].join(','))
        p.set('_sort', (snapshotDescriptor.order === 'asc' ? '+' : '-') + snapshotDescriptor.sortField)
        p.set('_offset', String(offset))
        p.set('_limit', '100')
        p.set('_context', 'NicoNicoRankingNG_v9_1')

        if (snapshotDescriptor.start) {
          p.set('filters[startTime][gte]', snapshotDescriptor.start + 'T00:00:00+09:00')
        }
        if (snapshotDescriptor.end) {
          p.set('filters[startTime][lte]', snapshotDescriptor.end + 'T23:59:59+09:00')
        }

        var started = performance.now()
        var res = await gmRequest({
          method: 'GET',
          url: SNAPSHOT_ENDPOINT + '?' + p.toString(),
          timeout: 10000
        })
        if (page._disposed) return
        var networkDone = performance.now()

        if (res.status !== 200) throw new Error('Snapshot API HTTP ' + res.status)
        var json = JSON.parse(res.responseText)
        if (!json || !Array.isArray(json.data)) throw new Error('Snapshot APIの応答形式が不正です')
        var data = json.data
        var rawTotal = json.meta && json.meta.totalCount
        var totalCount = rawTotal == null ? NaN : Number(rawTotal)

        var items = data.map(function(x, i) {
          return {
            id: x.contentId,
            title: x.title || x.contentId,
            description: x.description || '',
            duration: Number(x.lengthSeconds) || 0,
            registeredAt: x.startTime || '',
            thumbnail: {listingUrl: x.thumbnailUrl || ''},
            count: {
              view: Number(x.viewCounter) || 0,
              comment: Number(x.commentCounter) || 0,
              mylist: Number(x.mylistCounter) || 0,
              like: Number(x.likeCounter) || 0
            },
            owner: {
              id: x.userId != null ? Number(x.userId) : null,
              channelId: x.channelId != null ? Number(x.channelId) : null,
              name: x.userId != null ? ('user:' + x.userId)
                    : x.channelId != null ? ('ch:' + x.channelId) : '',
              iconUrl: ''
            },
            snapshotTags: Array.isArray(x.tags)
              ? x.tags
              : typeof x.tags === 'string' ? x.tags.split(/\s+/).filter(Boolean) : [],
            __nrnSourcePage: Math.floor(offset / 100) + 1,
            __nrnSourceIndex: i,
            __nrnSnapshot: true,
            __nrnSnapshotOffset: offset + i
          }
        })

        var finished = performance.now()
        var result = {
          items: items,
          totalCount: Number.isFinite(totalCount) ? totalCount : null,
          hasNextPage: data.length > 0 && (Number.isFinite(totalCount)
            ? offset + data.length < totalCount
            : data.length === 100),
          timings: {
            networkMs: Math.round(networkDone - started),
            totalMs: Math.round(finished - started)
          },
          source: 'snapshot',
          offset: offset
        }

        console.log(LOG, 'Snapshot API一括取得:', {
          offset: offset,
          query: snapshotDescriptor.q,
          targets: snapshotDescriptor.isTag ? 'tagsExact' : 'title,description,tags',
          sort: (snapshotDescriptor.order === 'asc' ? '+' : '-') + snapshotDescriptor.sortField,
          startFilter: snapshotDescriptor.start || null,
          endFilter: snapshotDescriptor.end || null,
          ignoredTracking: snapshotDescriptor.ignoredTracking || [],
          count: items.length,
          totalCount: result.totalCount,
          networkMs: result.timings.networkMs,
          totalMs: result.timings.totalMs
        })

        return result
      }

      var requestedMode = model.config.autoFillInfoMode.value
      var useSnapshot = requestedMode !== 'legacy' && snapshotDescriptor.supported
      if (useSnapshot && advancedRulesUseField('pageContributorCount')) {
        useSnapshot = false
        fallbackReason = 'ページ内投稿数を正確に数えるため従来方式を使用'
      }

      if (requestedMode !== 'legacy' && !snapshotDescriptor.supported) {
        fallbackReason = snapshotDescriptor.reason
      }

      sourceLabel = useSnapshot
        ? (requestedMode === 'snapshot' ? 'API高速' : 'API併用')
        : '従来方式'

      if (useSnapshot && model.config.autoFillPagerMode.value !== 'off') {
        console.info(LOG,
          'ページャー取得済み表示は、物理ページ番号を取得する従来方式でのみ正確に反映します。'
          + 'API方式ではページ番号を勝手に推定しません。')
      }

      var apiQuickNgReason = function(item) {
        if (!item || !item.__nrnSnapshot) return ''
        if (model.config.ngMovies.set.has(item.id)) return 'NG動画ID'

        var titleUpper = String(item.title || '').toUpperCase()
        for (var ngTitle of model.config.ngTitles.set) {
          if (titleUpper.includes(String(ngTitle).toUpperCase())) return 'NGタイトル'
        }

        var tagUpper = new Set((item.snapshotTags || []).map(function(t) {
          return String(t).toUpperCase()
        }))
        for (var ngTag of model.config.ngTags.set) {
          if (tagUpper.has(String(ngTag).toUpperCase())) return 'NGタグ'
        }

        var owner = item.owner || {}
        if (owner.id != null && (
            model.config.ngUserIds.set.has(owner.id)
            || model.config.ngUserIds.set.has(String(owner.id))
          )) return 'NGユーザーID'
        if (owner.channelId != null && (
            model.config.ngChannelIds.set.has(owner.channelId)
            || model.config.ngChannelIds.set.has(String(owner.channelId))
          )) return 'NGチャンネルID'
        return ''
      }

      var getMovieNgReasons = function(movie) {
        if (!movie) return ['Movieなし']
        var reasons = []
        if (movie.ngId) reasons.push('NG動画ID')
        if (movie.ngTitle) reasons.push('NGタイトル:' + movie.ngTitle)

        if (movie.contributor && movie.contributor.ng) {
          if (movie.contributor.ngId) reasons.push(
            movie.contributor.type === 'channel' ? 'NGチャンネルID' : 'NGユーザーID')
          if (movie.contributor.ngName) reasons.push('NG投稿者名:' + movie.contributor.ngName)
          if (!movie.contributor.ngId && !movie.contributor.ngName) reasons.push('投稿者NG')
        }

        var ngTags = (movie.tags || []).filter(function(t) { return t.ng })
        ngTags.forEach(function(t) {
          reasons.push((t.lock ? 'NGロックタグ:' : 'NGタグ:') + t.name)
        })

        if (movie.ngByLockedTagCount) {
          var lockedCount = (movie.tags || []).filter(function(t) { return t.lock }).length
          reasons.push('ロックタグ数:' + lockedCount + '>='
            + model.config.ngLockedTagCountThreshold.value)
        }

        if (movie.ngByAdvancedRule && movie.advancedRuleMatches.length) {
          movie.advancedRuleMatches.forEach(function(rule) {
            reasons.push('論理NGルール:' + rule.name)
          })
        }

        if (movie.ng && !reasons.length) reasons.push('その他NG')
        return reasons
      }

      var summarizeNgReasons = function(rows) {
        var summary = {}
        rows.forEach(function(row) {
          ;(row.ngReasons || []).forEach(function(reason) {
            var key = String(reason).split(':')[0]
            summary[key] = (summary[key] || 0) + 1
          })
        })
        return summary
      }

      var logCandidateTable = function(label, items, extraStatusFn) {
        if (!model.config.developerMode.value) return
        console.groupCollapsed(LOG + ' ' + label + ' (' + items.length + '件)')
        console.table(items.map(function(item, i) {
          return {
            no: i + 1,
            source: item.__nrnSnapshot
              ? 'API:' + item.__nrnSnapshotOffset
              : 'page:' + item.__nrnSourcePage + '#' + item.__nrnSourceIndex,
            id: item.id,
            title: item.title,
            registeredAt: item.registeredAt || '',
            status: extraStatusFn ? extraStatusFn(item) : '候補'
          }
        }))
        console.groupEnd()
      }

      // 現在ページとAPI先頭を比較。
      // 投稿日時等で並びが一致しない場合に、間違った続きを足さないためfallbackする。
      var validateSnapshotAgainstCurrentDom = async function() {
        if (page._disposed) return
        if (!useSnapshot || snapshotValidated) return
        setPhase('validating-api', '現在ページと検索APIの並び順を照合中')

        var result = await snapshotFetchOffset(snapshotValidationOffset)
        if (page._disposed) return
        var domIds = []
        var seen = new Set()
        page.doc.querySelectorAll(
          '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])'
        ).forEach(function(el) {
          var id = el.getAttribute('data-decoration-video-id')
          if (id && !seen.has(id)) {
            seen.add(id)
            domIds.push(id)
          }
        })

        var apiIds = result.items.map(function(x) { return x.id })
        var compareN = Math.min(domIds.length, apiIds.length, 36)
        var exact = 0
        for (var i = 0; i < compareN; i++) {
          if (domIds[i] === apiIds[i]) exact++
        }
        var apiHeadSet = new Set(apiIds.slice(0, Math.max(compareN + 12, 48)))
        var overlap = domIds.slice(0, compareN).filter(function(id) {
          return apiHeadSet.has(id)
        }).length

        var exactRate = compareN ? exact / compareN : 0
        var overlapRate = compareN ? overlap / compareN : 0

        snapshotValidation = {
          currentPage: page._currentPageNumber,
          validationOffset: snapshotValidationOffset,
          candidateStartOffset: snapshotOffset,
          compared: compareN,
          exactMatches: exact,
          exactRate: Math.round(exactRate * 1000) / 10,
          overlapMatches: overlap,
          overlapRate: Math.round(overlapRate * 1000) / 10
        }
        snapshotValidated = true

        console.group(LOG + ' API/DOM順序検証')
        console.table({
          currentPage: {value: page._currentPageNumber},
          validationOffset: {value: snapshotValidationOffset},
          candidateStartOffset: {value: snapshotOffset},
          compared: {value: compareN},
          exactMatches: {value: exact},
          exactRatePercent: {value: snapshotValidation.exactRate},
          overlapMatches: {value: overlap},
          overlapRatePercent: {value: snapshotValidation.overlapRate}
        })
        var apiById = new Map(result.items.map(function(item) {
          return [item.id, item]
        }))
        var parityRows = domIds.slice(0, compareN).map(function(id, i) {
          var movie = model.movies.get(id)
          var apiItem = apiById.get(id)
          return {
            position:i + 1,
            dom:id || '',
            apiAtSamePosition:apiIds[i] || '',
            exactPosition:id === apiIds[i] ? '✓' : '×',
            existsInApiWindow:apiById.has(id) ? '✓' : '×',
            domTitle:movie ? movie.title : '',
            apiTitle:apiItem ? apiItem.title : '',
            titleMatch:movie && apiItem && movie.title === apiItem.title ? '✓' : ''
          }
        })
        console.table(parityRows)
        var contentIdType = function(id) {
          var m = String(id || '').match(/^([a-zA-Z]+)/)
          return m ? m[1].toLowerCase() : '(numeric/unknown)'
        }
        var typeCounts = function(ids) {
          return ids.reduce(function(acc, id) {
            var type = contentIdType(id)
            acc[type] = (acc[type] || 0) + 1
            return acc
          }, {})
        }
        console.log('API/DOM差分診断:', {
          currentPage:page._currentPageNumber,
          validationOffset:snapshotValidationOffset,
          apiWindowCount:result.items.length,
          exactRatePercent:snapshotValidation.exactRate,
          overlapRatePercent:snapshotValidation.overlapRate,
          titleMatchesAmongOverlap:parityRows.filter(function(r) {
            return r.existsInApiWindow === '✓' && r.titleMatch === '✓'
          }).length,
          domContentIdTypes:typeCounts(domIds.slice(0, compareN)),
          apiContentIdTypes:typeCounts(apiIds.slice(0, compareN)),
          interpretation:'一致率が低い場合はAPI方式を採用せず従来方式へfallbackするため、表示結果の正確性を優先します。'
        })
        console.groupEnd()

        // exactは広告差などでずれることがあるのでoverlapを主判定にする。
        // 先頭付近の70%未満しか重ならない場合は、検索結果の続きを保証できない。
        if (compareN === 0 || overlapRate < 0.70) {
          useSnapshot = false
          sourceLabel = '従来方式'
          fallbackReason = 'API/DOM一致率 ' + Math.round(overlapRate * 100) + '%'
          candidatePool = []
          candidatePoolSeen.clear()
          snapshotOffset = Math.max(0, page._currentPageNumber * 32)
          console.warn(LOG,
            'API結果と現在ページの一致率が低いため、正確性優先で従来方式へfallbackします。',
            snapshotValidation)
          return
        }

        // 検証に使ったAPI結果をそのまま候補プールへ再利用。
        // 現在DOMのIDはfilterFreshItemsで除外されるので、無駄な再通信をしない。
        var filtered = filterFreshItems(result.items)
        var fresh = filtered.freshItems

        if (requestedMode === 'snapshot') {
          var passed = []
          var quickRows = []
          fresh.forEach(function(item) {
            var reason = apiQuickNgReason(item)
            if (reason) {
              totalApiPrefilteredNg++
              quickRows.push({item: item, reason: reason})
            } else {
              passed.push(item)
            }
          })
          if (quickRows.length) {
            console.groupCollapsed(LOG + ' API事前NG（検証100件）')
            console.table(quickRows.map(function(x) {
              return {id: x.item.id, title: x.item.title, reason: x.reason}
            }))
            console.groupEnd()
          }
          fresh = passed
        }

        fresh.forEach(function(item) { candidatePool.push(item) })
        totalFetchedItems += result.items.length
        fetchedExtraPages++
        snapshotOffset = result.offset + result.items.length
        lastFetchedHadNext = result.hasNextPage

        logCandidateTable('API候補（検証結果を再利用）', fresh)
      }

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
            const movie = model.movies.get(id)
            return movie && movie.thumbInfoDone && movie.error?.type === 'NO_ERROR' && (movie.ng || displayed.has(id))
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


      // -------------------- CandidateSource / pool --------------------
      var fetchMoreCandidates = async function(minNeeded) {
        if (page._disposed) return
        var fetchStart = performance.now()
        var mayRequest = function() {
          var limit = Number(model.config.autoFillMaxExtraPages.value) || 0
          return model.config.autoFillEnabled.value && (limit <= 0 || fetchedExtraPages < limit)
        }

        if (useSnapshot) {
          if (!snapshotValidated) await validateSnapshotAgainstCurrentDom()
          if (page._disposed) return
          if (!useSnapshot) return fetchMoreCandidates(minNeeded)

          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            if (!mayRequest()) break
            var result = await snapshotFetchOffset(snapshotOffset)
            if (page._disposed) return
            snapshotOffset += 100
            fetchedExtraPages++
            totalFetchedItems += result.items.length
            lastFetchedHadNext = result.hasNextPage

            var filtered = filterFreshItems(result.items)
            var fresh = filtered.freshItems

            if (requestedMode === 'snapshot') {
              var passed = []
              var quickRows = []
              fresh.forEach(function(item) {
                var reason = apiQuickNgReason(item)
                if (reason) {
                  totalApiPrefilteredNg++
                  quickRows.push({item: item, reason: reason})
                } else {
                  passed.push(item)
                }
              })

              console.log(LOG, 'API事前NG判定:', {
                input: fresh.length,
                rejected: quickRows.length,
                passed: passed.length,
                reasons: quickRows.reduce(function(acc, x) {
                  acc[x.reason] = (acc[x.reason] || 0) + 1
                  return acc
                }, {})
              })
              fresh = passed
            }

            logCandidateTable('API取得 offset=' + result.offset, fresh)
            fresh.forEach(function(item) { candidatePool.push(item) })

            if (!result.items.length) break
          }
        } else {
          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            if (!mayRequest()) break
            var pageNumber = nextPageToFetch++

            // 現在ページUIから終端が分かっている場合は、存在しないページへ通信しない。
            if (knownLastPage != null && pageNumber > knownLastPage) {
              lastFetchedHadNext = false
              endReachedWithoutRequest = true
              nextPageToFetch = pageNumber
              console.log(LOG, '最終ページ到達を事前検出。HTTP要求を省略:', {
                attemptedPage: pageNumber,
                knownLastPage: knownLastPage,
                source: endPageDetectionSource
              })
              break
            }

            console.log(LOG, '次ページ取得判断:', {
              requestedPage: pageNumber,
              currentPage: currentPageNumber(),
              knownLastPage: knownLastPage,
              endPageDetectionSource: endPageDetectionSource,
              fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
              candidatePool: candidatePool.length,
              minNeeded: minNeeded,
              allowed: knownLastPage == null || pageNumber <= knownLastPage
            })

            var result
            try {
              result = await page.fetchPageItems(pageNumber, {
                scope: 'RUN',
                requestId: 'RUN-autofill-p' + pageNumber
              })
              if (page._disposed) return
            } catch (e) {
              if (page._disposed) return
              // 終端情報を読めなかった場合の安全弁。
              // 連番の次ページ取得で400/404なら検索終端として正常終了扱いにする。
              if (e && (e.status === 400 || e.status === 404)
                  && pageNumber > currentPageNumber()) {
                lastFetchedHadNext = false
                knownLastPage = pageNumber - 1
                endPageDetectionSource = 'HTTP-' + e.status + '-boundary'
                console.warn(LOG, '次ページが存在しないため最終ページとして正常終了:', {
                  requestedPage: pageNumber,
                  detectedLastPage: knownLastPage,
                  status: e.status,
                  url: e.url
                })
                break
              }
              throw e
            }

            fetchedExtraPages++
            fetchedPageNumbers.add(pageNumber)

            var resultMaxPage = Number(result.maxPage)
            if (!Array.isArray(result.items)) throw new Error('取得ページの動画一覧が不正です')
            if (!result.items.length) {
              // An empty/out-of-range response is not another consumed results page.
              fetchedExtraPages--
              fetchedPageNumbers.delete(pageNumber)
              lastFetchedHadNext = false
              knownLastPage = Number.isInteger(resultMaxPage) && resultMaxPage > 0
                ? Math.min(resultMaxPage, pageNumber - 1) : pageNumber - 1
              endPageDetectionSource = 'empty-page-boundary'
              updatePagerUi('empty page boundary: ' + pageNumber)
              break
            }
            if (result.hasNextPage === false) {
              var previousKnownLastPage = knownLastPage
              knownLastPage = pageNumber
              endPageDetectionSource = 'fetched-final-page-ui'
              console.log(LOG, '取得ページの最終ページUIを確定:', {
                pageFetched:pageNumber,
                previousKnownLastPage:previousKnownLastPage,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage,
                hasNextPage:false
              })
            } else if (Number.isInteger(resultMaxPage) && resultMaxPage >= pageNumber
                && (knownLastPage == null || resultMaxPage > knownLastPage)) {
              var previousKnownLastPage2 = knownLastPage
              knownLastPage = resultMaxPage
              endPageDetectionSource = 'fetched-pagination'
              console.log(LOG, '取得ページから最終ページ情報を更新:', {
                pageFetched:pageNumber,
                previousKnownLastPage:previousKnownLastPage2,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage
              })
            } else {
              console.log(LOG, '取得ページのmaxPageは既知終端を維持:', {
                pageFetched:pageNumber,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage
              })
            }

            updatePagerUi('page fetched: ' + pageNumber)
            totalFetchedItems += Array.isArray(result.items) ? result.items.length : 0
            lastFetchedHadNext =
              typeof result.hasNextPage === 'boolean' ? result.hasNextPage : null

            var items = Array.isArray(result.items) ? result.items : []
            items.forEach(function(item, idx) {
              item.__nrnSourcePage = pageNumber
              item.__nrnSourceIndex = idx
            })

            journey.record(pageNumber, items)
            var filtered = filterFreshItems(items)
            logCandidateTable('ページ ' + pageNumber + ' 候補', filtered.freshItems)
            filtered.freshItems.forEach(function(item) { candidatePool.push(item) })

            if (!items.length) break
          }
        }

        return performance.now() - fetchStart
      }

      // -------------------- AdService --------------------
      var decorateAds = function(roots, reason) {
        var mode = model.config.autoFillAdMode.value
        if (mode === 'none' || !roots.length) return
        adPending += roots.length
        updateStatus()

        var adStarted = performance.now()
        Promise.allSettled(roots.map(function(r) {
          return page._applyAdDecoration(r.elem, r.movieId)
        })).then(function() {
          adPending = Math.max(0, adPending - roots.length)
          console.log(LOG, 'ニコニコ広告取得完了:', {
            reason: reason,
            count: roots.length,
            elapsedMs: Math.round(performance.now() - adStarted)
          })
          updateStatus()
        })
      }

      var removePending = function(ids) {
        var s = new Set(ids)
        connectedInjectedRoots().forEach(function(r) {
          if (s.has(r.movieId)) r.elem.classList.remove('nrn-autofill-pending')
        })
      }

      var chooseDetailBatchSize = function(shortage) {
        var baseRate = lastAcceptanceRate
        if (baseRate == null && originalMovieIds.size) {
          baseRate = Math.max(0.05, visibleOriginalCount() / originalMovieIds.size)
        }
        if (baseRate == null) baseRate = 0.35
        baseRate = Math.max(0.08, Math.min(0.90, baseRate))

        // 必要数 / 直近採用率 に20%余裕。
        // ただし一度に大量のGetThumbInfoを投げない。
        var estimated = Math.ceil(shortage / baseRate * 1.20)
        var minimum = Math.max(shortage, Math.min(24, shortage + 8))
        var configuredMax = Math.max(
          8, Math.min(100, Math.trunc(Number(model.config.autoFillDetailBatchMax.value)) || 48))
        return Math.max(Math.min(minimum, configuredMax), Math.min(configuredMax, estimated))
      }

      var cacheKeyForMovie = function(id) {
        return String(id || '')
      }

      var applyThumbInfoFromCache = ThumbInfoListener.forCompleted(model.movies)

      var restoreCachedMovieDetails = function(ids, reason) {
        if (!model.config.sessionDetailCacheEnabled.value) {
          return {hits:0, misses:ids.length, restored:0}
        }
        detailCache.configure(model.config)
        var rows = []
        var restored = 0
        var hits = 0
        var misses = 0

        ;[...new Set(ids)].forEach(function(id) {
          var key = cacheKeyForMovie(id)
          var cached = detailCache.get(key)
          if (!cached) {
            misses++
            cacheMisses++
            rows.push({id:id, cache:'MISS', restored:false})
            return
          }
          hits++
          cacheHits++
          var movie = model.movies.get(id)
          if (!movie || movie.thumbInfoDone) {
            rows.push({id:id, cache:'HIT', restored:false, note:'movie無し/既に完了'})
            return
          }
          try {
            applyThumbInfoFromCache({
              id: id,
              description: cached.description || '',
              tags: Array.isArray(cached.tags) ? cached.tags : [],
              contributor: cached.contributor || {type:'unknown', id:-1, name:''},
              title: cached.title || movie.title,
              error: {type:'NO_ERROR', message:'cache'}
            })
            restored++
            cacheRestores++
            rows.push({
              id:id,
              cache:'HIT',
              restored:true,
              tagCount:Array.isArray(cached.tags) ? cached.tags.length : 0,
              contributorType:cached.contributor ? cached.contributor.type : 'unknown',
              ageMinutes:Math.round((Date.now() - Number(cached.cachedAt || 0)) / 60000)
            })
          } catch (e) {
            if (page._disposed) return
            cacheRestoreFailures++
            rows.push({id:id, cache:'HIT', restored:false, note:String(e)})
            console.warn(LOG, 'キャッシュ復元失敗:', {id:id, error:e})
          }
        })

        if (hits || model.config.developerMode.value) {
          console.groupCollapsed(LOG + ' 詳細キャッシュ復元: ' + reason)
          console.table(rows)
          console.log('集計:', {
            input: ids.length,
            hits: hits,
            misses: misses,
            restored: restored,
            backend: detailCache.diagnostics()
          })
          console.groupEnd()
        }
        return {hits:hits, misses:misses, restored:restored}
      }

      var cacheMovieAfterCheck = function(id) {
        if (!model.config.sessionDetailCacheEnabled.value) return
        var movie = model.movies.get(id)
        if (!movie || !movie.thumbInfoDone) return
        if (movie.error && movie.error.type && movie.error.type !== 'NO_ERROR') return
        var payload = {
          id: id,
          title: movie.title || '',
          description: movie.description || '',
          contributor: movie.contributor ? {
            type: movie.contributor.type,
            id: movie.contributor.id,
            name: movie.contributor.name
          } : null,
          tags: (movie.tags || []).map(function(t) {
            return {name:t.name, lock:Boolean(t.lock)}
          }),
          ng: Boolean(movie.ng),
          ngReasons: getMovieNgReasons(movie),
          cachedAt: Date.now()
        }
        detailCache.set(cacheKeyForMovie(id), payload)
        cacheWrites++
      }

      var logCacheCandidateAudit = function(items) {
        if (!model.config.sessionDetailCacheEnabled.value) return
        var rows = items.map(function(item) {
          var hit = detailCache.has(cacheKeyForMovie(item.id))
          var cached = hit ? detailCache.get(cacheKeyForMovie(item.id)) : null
          return {
            id: item.id,
            title: item.title,
            cache: hit ? 'HIT' : 'MISS',
            cachedNg: cached ? cached.ng : '',
            cachedReasons: cached ? (cached.ngReasons || []).join(' / ') : ''
          }
        })
        console.groupCollapsed(LOG + ' セッション詳細キャッシュ候補照合')
        console.table(rows)
        console.groupEnd()
      }

      var evaluateCandidateBatch = async function(items) {
        if (page._disposed) return
        if (!items.length) {
          return {checked: 0, accepted: 0, ng: 0, rows: [], timings: {}}
        }

        logCacheCandidateAudit(items)
        setPhase('adding', items.length + '件を詳細判定用に追加中')

        var wholeStart = performance.now()
        var addStart = performance.now()
        var addedIds = []
        var itemById = new Map()

        var parsedResults = items.map(function(item) {
          var tile = page._createInjectedTile(item)
          addedIds.push(item.id)
          itemById.set(item.id, item)
          knownMovieIds.add(item.id)
          return {
            type: 'main',
            movie: {id: item.id, title: item.title},
            rootElem: tile
          }
        })

        setup(parsedResults, model, page, controller)
        restoreCachedMovieDetails(addedIds, '自動追加候補')
        var addEnd = performance.now()

        var addedRootMap = new Map()
        connectedInjectedRoots().forEach(function(r) {
          if (itemById.has(r.movieId)) addedRootMap.set(r.movieId, r)
        })
        var addedRoots = addedIds.map(function(id) {
          return addedRootMap.get(id)
        }).filter(Boolean)

        if (model.config.autoFillAdMode.value === 'all') {
          decorateAds(addedRoots, '候補すべて')
        }

        setPhase('ng-check',
          addedIds.length + '件をNG判定中（同時 ' + model.config.thumbInfoConcurrency.value + '件）')

        var thumbStart = performance.now()
        model.requestThumbInfo(true)
        var completed = await waitForThumbInfo(addedIds, 30000)
        if (page._disposed) return
        var thumbEnd = performance.now()

        if (!completed) {
          throw new Error('動画詳細情報のNG判定がタイムアウト')
        }

        var candidateSelfAdStarted = performance.now()
        if (selfAdRuleRequired()) {
          await ensureSelfAdChecks(addedIds, '自動追加候補 / NG条件必須')
          if (page._disposed) return
        } else if (model.config.selfAdWarningEnabled.value) {
          var warningOnlyIds = visibleNonNgIds(addedIds)
          console.log(LOG, '自演広告監査を表示動画だけに限定:', {
            phase:'自動追加候補',
            all:addedIds.length,
            visibleCandidates:warningOnlyIds.length,
            skippedNg:addedIds.length - warningOnlyIds.length
          })
          await ensureSelfAdChecks(warningOnlyIds, '自動追加候補 / 表示動画のみ')
          if (page._disposed) return
        }
        var candidateSelfAdMs = Math.round(performance.now() - candidateSelfAdStarted)

        removePending(addedIds)

        // v13.3: 非表示中に▲▼を測定しない。カードを表示してから2フレーム待ち、
        // 追加カード全件のトグル位置を実DOM上で再確定する。
        await new Promise(function(resolve) {
          requestAnimationFrame(function() {
            requestAnimationFrame(resolve)
          })
        })
        if (page._disposed) return

        renderStoredSelfAdWarnings(addedIds, '自動追加カード表示後')

        var toggleAuditRows = addedRoots.map(function(root) {
          var movie = model.movies.get(root.movieId)
          var expectedVisible = Boolean(movie && !movie.ng
            && !root.elem.classList.contains('nrn-autofill-pending')
            && !root.elem.classList.contains('nrn-autofill-overflow'))
          var ok = expectedVisible && root._refreshMovieInfoToggleAfterReveal
            ? root._refreshMovieInfoToggleAfterReveal() : false
          var t = root.movieInfo && root.movieInfo.toggle
          var rect = t && t.isConnected ? t.getBoundingClientRect() : null
          var style = t && t.isConnected
            ? t.ownerDocument.defaultView.getComputedStyle(t) : null
          return {
            id:root.movieId,
            expectedVisible:expectedVisible,
            ng:Boolean(movie && movie.ng),
            overflow:root.elem.classList.contains('nrn-autofill-overflow'),
            present:Boolean(t && t.isConnected),
            visible:Boolean(rect && rect.width > 0 && rect.height > 0
              && style && style.display !== 'none' && style.visibility !== 'hidden'),
            pinned:Boolean(t && t.dataset.nrnPinned === 'true'),
            pinWaiting:Boolean(t && t.dataset.nrnPinWaiting === 'true'),
            top:t && t.dataset.nrnBaselineTop ? Number(t.dataset.nrnBaselineTop) : null,
            result:expectedVisible ? (ok ? 'OK' : '要確認') : '対象外（NG/予備）'
          }
        })
        var checkedToggleRows = toggleAuditRows.filter(function(r){ return r.expectedVisible })
        var toggleMissing = checkedToggleRows.filter(function(r) {
          return !r.present || !r.visible || !r.pinned
        })
        console.log(LOG, '自動追加動画 ▲▼ 監査:', {
          candidates:toggleAuditRows.length,
          checkedVisible:checkedToggleRows.length,
          skippedNgOrOverflow:toggleAuditRows.length - checkedToggleRows.length,
          present:checkedToggleRows.filter(function(r){return r.present}).length,
          visible:checkedToggleRows.filter(function(r){return r.visible}).length,
          pinned:checkedToggleRows.filter(function(r){return r.pinned}).length,
          problems:toggleMissing.length
        })
        if (toggleMissing.length) {
          console.warn(LOG, '自動追加動画の▲▼に問題があります')
          console.table(toggleMissing)
        }
        window.__nrnInjectedToggleAudit = toggleAuditRows

        var rows = addedIds.map(function(id, i) {
          var movie = model.movies.get(id)
          var item = itemById.get(id)
          var reasons = getMovieNgReasons(movie)
          return {
            order: i + 1,
            id: id,
            title: item ? item.title : (movie ? movie.title : ''),
            registeredAt: item ? item.registeredAt || '' : '',
            source: item && item.__nrnSnapshot
              ? 'API:' + item.__nrnSnapshotOffset
              : item ? 'page:' + item.__nrnSourcePage + '#' + item.__nrnSourceIndex : '',
            ng: Boolean(movie && movie.ng),
            ngReasons: reasons,
            decision: movie && movie.ng ? 'NG' : '表示候補'
          }
        })

        if (model.config.sessionDetailCacheEnabled.value) {
          addedIds.forEach(cacheMovieAfterCheck)
        }

        var accepted = rows.filter(function(r) { return !r.ng }).length
        var ngCount = rows.length - accepted
        totalDetailChecked += rows.length
        totalAcceptedFromAdded += accepted
        lastAcceptanceRate = rows.length ? accepted / rows.length : lastAcceptanceRate

        rebalanceOverflow()
        renderStoredSelfAdWarnings(addedIds, 'overflow調整後')

        if (model.config.autoFillAdMode.value === 'visible') {
          var visibleAddedRoots = addedRoots.filter(function(r) {
            var movie = model.movies.get(r.movieId)
            return movie && !movie.ng
                && !r.elem.classList.contains('nrn-hide')
                && !r.elem.classList.contains('nrn-autofill-overflow')
          })
          decorateAds(visibleAddedRoots, '表示動画のみ')
        }

        var end = performance.now()
        var timings = {
          domAddMs:Math.round(addEnd - addStart),
          thumbInfoMs:Math.round(thumbEnd - thumbStart),
          selfAdMs:candidateSelfAdMs,
          postProcessMs:Math.round(end - thumbEnd),
          totalMs:Math.round(end - wholeStart)
        }

        console.group(LOG + ' 詳細NG判定結果')
        console.table(rows.map(function(r) {
          return {
            order: r.order,
            source: r.source,
            id: r.id,
            title: r.title,
            registeredAt: r.registeredAt,
            decision: r.decision,
            ngReason: r.ngReasons.join(' / ')
          }
        }))
        console.log('NG理由集計:', summarizeNgReasons(rows))
        console.table({
          checked: {value: rows.length},
          accepted: {value: accepted},
          ng: {value: ngCount},
          acceptanceRatePercent: {
            value: rows.length ? Math.round(accepted / rows.length * 1000) / 10 : 0
          },
          domAddMs:{value:timings.domAddMs},
          thumbInfoMs:{value:timings.thumbInfoMs},
          selfAdMs:{value:timings.selfAdMs},
          totalMs:{value:timings.totalMs}
        })
        console.groupEnd()

        return {
          checked: rows.length,
          accepted: accepted,
          ng: ngCount,
          rows: rows,
          timings: timings
        }
      }

      // -------------------- main controller --------------------
      var maybeFetchMore = async function() {
        if (page._disposed) return
        if (!initialized || fetching || gaveUp) {
          updateStatus()
          return
        }

        if (!model.config.autoFillEnabled.value) {
          setPhase('disabled', '自動継ぎ足しOFF')
          return
        }

        rebalanceOverflow()
        if (visibleTotalCount() >= targetCount()) {
          setPhase('completed', '目標件数に到達')
          if (!completionReported) {
            completionReported = true
            updatePagerUi('target reached')
            logSnapshot('目標達成')
          }
          return
        }

        var maxExtra = Number(model.config.autoFillMaxExtraPages.value) || 0
        if (maxExtra > 0 && fetchedExtraPages >= maxExtra && candidatePool.length === 0) {
          gaveUp = true
          stopReason = '追加取得ページ数の上限に到達'
          setPhase('stopped', stopReason)
          return
        }

        if (lastFetchedHadNext === false && candidatePool.length === 0) {
          gaveUp = true
          stopReason = knownLastPage != null
            ? '最終ページ ' + knownLastPage + ' まで確認済み'
            : '取得元の最終位置に到達'
          setPhase('stopped', stopReason)
          console.log(LOG, '自動継ぎ足し正常終了:', {
            reason: stopReason,
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            searchedPhysicalPageCount: searchedPhysicalPageCount(),
            visible: visibleTotalCount(),
            target: targetCount()
          })
          console.log(LOG, '実行パフォーマンス総括:', {
            elapsedMs:Math.round(performance.now() - startedAt),
            initial:window.__nrnInitialPerformance || null,
            fetchedPages:[...fetchedPageNumbers].sort(function(a,b){return a-b}),
            fetchedItems:totalFetchedItems,
            detailChecked:totalDetailChecked,
            cacheHits:detailCacheStats.hits,
            cacheMisses:detailCacheStats.misses,
            newTabMutation:window.__nrnNewTabAudit || null,
            selfAdRuleRequired:selfAdRuleRequired(),
            selfAdWarningEnabled:model.config.selfAdWarningEnabled.value
          })
          return
        }

        fetching = true
        var cycleStart = performance.now()

        try {
          var shortage = targetCount() - visibleTotalCount()
          var detailBatchSize = chooseDetailBatchSize(shortage)

          // APIは候補だけ多めに保持してよいが、詳細判定は必要量だけ。
          var desiredPool = useSnapshot
            ? Math.max(detailBatchSize, Math.min(100, detailBatchSize + 24))
            : detailBatchSize

          var fetchMs = 0
          if (candidatePool.length < detailBatchSize) {
            setPhase('fetching',
              '候補を補充中（必要 ' + detailBatchSize + '件 / プール ' + candidatePool.length + '件）')
            fetchMs = await fetchMoreCandidates(desiredPool)
            if (page._disposed) return
          }

          if (!candidatePool.length) {
            if (lastFetchedHadNext === false) {
              gaveUp = true
              stopReason = '取得できる候補がありません'
              setPhase('stopped', stopReason)
              return
            }
            noProgressStreak++
            if (noProgressStreak >= 5) {
              gaveUp = true
              stopReason = '候補取得を5回試しても新規動画なし'
              setPhase('stopped', stopReason)
            }
            return
          }

          shortage = targetCount() - visibleTotalCount()
          detailBatchSize = Math.min(
            candidatePool.length,
            chooseDetailBatchSize(shortage)
          )

          var batch = candidatePool.splice(0, detailBatchSize)
          console.log(LOG, '候補プールから詳細判定へ:', {
            shortage: shortage,
            selected: batch.length,
            poolRemaining: candidatePool.length,
            estimatedAcceptanceRate:
              lastAcceptanceRate == null ? null : Math.round(lastAcceptanceRate * 1000) / 10
          })

          var result = await evaluateCandidateBatch(batch)
          if (page._disposed) return
          lastTiming = {
            fetchMs: fetchMs,
            domAddMs:result.timings.domAddMs || 0,
            thumbInfoMs:result.timings.thumbInfoMs || 0,
            selfAdMs:result.timings.selfAdMs || 0,
            totalMs:performance.now() - cycleStart
          }

          if (result.accepted > 0) noProgressStreak = 0
          else noProgressStreak++

          var acceptanceClass =
            lastAcceptanceRate == null ? 'unknown'
            : lastAcceptanceRate < 0.10 ? 'very-low'
            : lastAcceptanceRate < 0.30 ? 'low'
            : 'normal'

          console.log(LOG, '処理サイクル完了:', {
            visibleNow: visibleTotalCount(),
            target: targetCount(),
            shortageRemaining: Math.max(0, targetCount() - visibleTotalCount()),
            candidatePoolRemaining: candidatePool.length,
            detailCheckedThisCycle: result.checked,
            acceptedThisCycle: result.accepted,
            ngThisCycle: result.ng,
            acceptanceRate:
              lastAcceptanceRate == null ? null : Math.round(lastAcceptanceRate * 1000) / 10,
            acceptanceClass: acceptanceClass,
            acceptanceNote: '診断値のみ。低採用率だけでは異常判定や方式変更をしません。',
            pager: {
              mode: model.config.autoFillPagerMode.value,
              currentPage: currentPageNumber(),
              knownLastPage: knownLastPage,
              endPageDetectionSource: endPageDetectionSource,
              searchedPhysicalPageCount: searchedPhysicalPageCount(),
              fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
              nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
              latestPaginationDetection: paginationDetectionHistory.length
                ? paginationDetectionHistory[paginationDetectionHistory.length - 1]
                : null
            },
            statusAnimation: {
              enabled: model.config.statusAnimationEnabled.value,
              active: model.config.statusAnimationEnabled.value
                && ['starting','waiting-dom','initial-ng','validating-api','fetching','ng-check','adding'].includes(phase)
            },
            advancedRules: {
              enabled:model.config.advancedNgRulesEnabled.value,
              configured:AdvancedNgRules.parse(model.config.advancedNgRulesJson.value).length
            },
            cache: {
              enabled: model.config.sessionDetailCacheEnabled.value,
              size: detailCache.size,
              hits: cacheHits,
              misses: cacheMisses,
              writes: cacheWrites
            },
            timings: {
              candidateFetchMs: Math.round(lastTiming.fetchMs),
              domAddMs:Math.round(lastTiming.domAddMs),
              thumbInfoMs:Math.round(lastTiming.thumbInfoMs),
              selfAdMs:Math.round(lastTiming.selfAdMs || 0),
              totalCycleMs:Math.round(lastTiming.totalMs)
            }
          })

          if (noProgressStreak >= 10) {
            gaveUp = true
            stopReason = '10回連続で表示可能動画が増えず'
            setPhase('stopped', stopReason)
          }
        } catch (e) {
          if (page._disposed) return
          console.error(LOG, '自動継ぎ足しでエラー:', e)

          if (useSnapshot) {
            useSnapshot = false
            sourceLabel = '従来方式'
            fallbackReason = 'API実行エラー: ' + (e && e.message ? e.message : e)
            candidatePool = []
            candidatePoolSeen.clear()
            lastFetchedHadNext = null
            nextPageToFetch = page._currentPageNumber + 1
            console.warn(LOG, 'APIから従来方式へfallbackして続行します')
          } else {
            gaveUp = true
            stopReason = e && e.message ? e.message : '通信または解析エラー'
            setPhase('error', stopReason)
          }
        } finally {
          fetching = false
          if (page._disposed) return
          updateStatus()

          if (!gaveUp && model.config.autoFillEnabled.value) {
            if (visibleTotalCount() >= targetCount()) {
              setPhase('completed', '目標件数に到達')
              if (!completionReported) {
                completionReported = true
                updatePagerUi('target reached')
                logSnapshot('目標達成')
              }
            } else {
              setTimeout(maybeFetchMore, 0)
            }
          }
        }
      }

      // -------------------- Developer diagnostics --------------------
      var developerSuiteRunning = false
      var developerSuiteLastRunAt = 0
      var developerSuiteStep = 0
      var developerSuiteTotalSteps = 5
      var developerSuiteStatus = '未実行'

      var setDeveloperProgress = function(step, label) {
        developerSuiteStep = step
        developerSuiteStatus = label
        console.log(LOG, '[DEV ' + step + '/' + developerSuiteTotalSteps + '] ' + label)
        updateStatus()
      }

      var auditUserIdNg = async function(reason) {
        if (page._disposed) return
        var store = model.config.ngUserIds
        var configured = store.set
        var diagnosticValue = function(entry) {
          return entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
            ? entry.value : entry
        }
        var invalidEntries = store.arrayWithText.filter(function(entry) {
          var v = diagnosticValue(entry)
          var n = Math.trunc(Number(v))
          return !Number.isFinite(n) || n <= 0
        })

        var typeHistogram = {}
        store.arrayWithText.forEach(function(entry) {
          var v = diagnosticValue(entry)
          var t = typeof v
          typeHistogram[t] = (typeHistogram[t] || 0) + 1
        })

        var rows = []
        var contributorIdsSeen = new Set()
        connectedOriginalRoots().concat(connectedInjectedRoots()).forEach(function(root) {
          if (!root.movieId || !root.elem || !root.elem.isConnected) return
          var movie = model.movies.get(root.movieId)
          if (!movie || !movie.contributor || movie.contributor.type !== 'user') return

          var c = movie.contributor
          var id = Math.trunc(Number(c.id))
          var inStore = configured.has(id) || configured.has(String(id))
          var rootHidden = root.elem.classList.contains('nrn-hide')
          var shouldHideByUserId = inStore && !model.config.ngMovieVisible.value

          rows.push({
            movieId: movie.id,
            title: movie.title,
            userId: id,
            userName: c.name,
            inNgUserIdStore: inStore,
            contributorNgId: c.ngId,
            contributorNg: c.ng,
            movieNg: movie.ng,
            rootHidden: rootHidden,
            shouldHideByUserId: shouldHideByUserId,
            mismatch:
              inStore !== Boolean(c.ngId)
              || (inStore && !movie.ng)
              || (shouldHideByUserId && !rootHidden)
          })
          contributorIdsSeen.add(id)
        })

        var mismatches = rows.filter(function(r) { return r.mismatch })
        var matchedConfiguredOnPage = rows.filter(function(r) {
          return r.inNgUserIdStore
        }).length

        console.group(LOG + ' 開発者診断 / NGユーザーID監査: ' + reason)
        console.table({
          configuredCount: {value: store.array.length},
          configuredUniqueCount: {value: configured.size},
          invalidEntries: {value: invalidEntries.length},
          currentUserMovies: {value: rows.length},
          configuredUsersFoundOnPage: {value: matchedConfiguredOnPage},
          mismatches: {value: mismatches.length},
          valueTypes: {value: JSON.stringify(typeHistogram)}
        })

        if (mismatches.length) {
          console.error(LOG, 'NGユーザーIDのモデル/DOM不一致を検出:', mismatches)
          console.table(mismatches)
        } else {
          console.log(LOG, 'NGユーザーID整合性: ✓ 現在ページでは不一致なし')
        }

        if (invalidEntries.length) {
          console.warn(LOG, 'NGユーザーIDリスト内の不正値:', invalidEntries)
        }

        // 現在ページに存在するユーザーのうちNG登録されているものを一覧化。
        console.groupCollapsed('現在ページのNGユーザーID一致一覧')
        console.table(rows.filter(function(r) { return r.inNgUserIdStore }))
        console.groupEnd()
        console.groupEnd()

        return {
          configuredCount: store.array.length,
          uniqueCount: configured.size,
          invalidCount: invalidEntries.length,
          rows: rows,
          mismatches: mismatches
        }
      }

      var auditDomModel = function() {
        var domCards = Array.from(page.doc.querySelectorAll('[data-decoration-video-id]'))
        var domIds = domCards.map(function(el) {
          return el.getAttribute('data-decoration-video-id')
        }).filter(Boolean)
        var unique = new Set(domIds)
        var duplicates = []
        var counts = {}
        domIds.forEach(function(id) {
          counts[id] = (counts[id] || 0) + 1
        })
        Object.keys(counts).forEach(function(id) {
          if (counts[id] > 1) duplicates.push({id:id, count:counts[id]})
        })

        var roots = page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected && r.movieId
        })
        var rootIds = new Set(roots.map(function(r) { return r.movieId }))
        var domSet = new Set(domIds)

        var rootOnlyIds = [...rootIds].filter(function(id) { return !domSet.has(id) })
        var domOnlyIds = [...domSet].filter(function(id) { return !rootIds.has(id) })

        var classifyDomElement = function(el) {
          if (!el) return {area:'missing', main:false, auxiliary:false}
          var area = el.getAttribute('data-anchor-area')
            || (el.closest('[data-anchor-area]')
              && el.closest('[data-anchor-area]').getAttribute('data-anchor-area'))
            || ''
          var auxiliary = Boolean(
            el.closest('aside')
            || el.closest('[data-anchor-area="related"]')
            || el.closest('[data-anchor-area="recommend"]')
            || el.closest('[data-nrn-autofill-overflow="true"]')
          )
          var main = area === 'main' || (!area && !auxiliary)
          return {area:area || '(none)', main:main, auxiliary:auxiliary}
        }

        var rootOnlyRows = rootOnlyIds.map(function(id) {
          var movie = model.movies.get(id)
          var root = roots.find(function(r) { return r.movieId === id })
          var elem = root && root.elem
          var decorated = elem && (
            elem.matches && elem.matches('[data-decoration-video-id]')
              ? elem : elem.querySelector && elem.querySelector('[data-decoration-video-id]')
          )
          var cls = classifyDomElement(decorated || elem)
          var reason = ''
          var severity = 'info'
          if (!elem || !elem.isConnected) {
            reason = '切断済みroot（監査時点では通常無視）'
            severity = 'info'
          } else if (!decorated) {
            reason = 'MovieRootはあるが現行UIのdata-decoration-video-idカードではない'
            severity = 'info'
          } else if (!cls.main || cls.auxiliary) {
            reason = 'メイン検索結果外の補助カード/関連領域'
            severity = 'info'
          } else {
            reason = 'メインカード相当rootなのにDOMカード集合と不一致'
            severity = 'warning'
          }
          return {
            id:id,
            title:movie ? movie.title : '',
            classification:severity,
            reason:reason,
            anchorArea:cls.area,
            movieNg:Boolean(movie && movie.ng),
            thumbInfoDone:Boolean(movie && movie.thumbInfoDone),
            elemConnected:Boolean(elem && elem.isConnected),
            injected:Boolean(elem && elem.dataset && elem.dataset.nrnAutofill === 'true')
          }
        })

        var domOnlyRows = domOnlyIds.map(function(id) {
          var el = domCards.find(function(e) {
            return e.getAttribute('data-decoration-video-id') === id
          })
          var cls = classifyDomElement(el)
          var reason = ''
          var severity = 'info'
          if (!cls.main || cls.auxiliary) {
            reason = 'メイン検索結果外の補助カード/関連領域'
            severity = 'info'
          } else if (el && el.dataset.nrnAutofill === 'true'
              && el.classList.contains('nrn-autofill-overflow')) {
            reason = '自動追加の予備/overflowカード'
            severity = 'info'
          } else {
            reason = 'メイン検索結果カードなのにMovieRootが未生成'
            severity = 'warning'
          }
          return {
            id:id,
            classification:severity,
            reason:reason,
            anchorArea:cls.area,
            text:el ? String(el.textContent || '').trim().slice(0, 120) : '',
            hidden:Boolean(el && el.classList.contains('nrn-hide')),
            injected:Boolean(el && el.dataset.nrnAutofill === 'true')
          }
        })

        var warningRootOnly = rootOnlyRows.filter(function(r) {
          return r.classification === 'warning'
        })
        var warningDomOnly = domOnlyRows.filter(function(r) {
          return r.classification === 'warning'
        })
        var informationalRootOnly = rootOnlyRows.filter(function(r) {
          return r.classification !== 'warning'
        })
        var informationalDomOnly = domOnlyRows.filter(function(r) {
          return r.classification !== 'warning'
        })

        var result = {
          domCards:domIds.length,
          domUniqueIds:unique.size,
          duplicateCardCount:domIds.length - unique.size,
          connectedMovieRoots:roots.length,
          connectedRootUniqueIds:rootIds.size,
          rootOnlyIds:rootOnlyIds,
          domOnlyIds:domOnlyIds,
          warningRootOnlyIds:warningRootOnly.map(function(r){ return r.id }),
          warningDomOnlyIds:warningDomOnly.map(function(r){ return r.id }),
          informationalRootOnlyIds:informationalRootOnly.map(function(r){ return r.id }),
          informationalDomOnlyIds:informationalDomOnly.map(function(r){ return r.id }),
          mismatchWarningCount:warningRootOnly.length + warningDomOnly.length,
          mismatchInfoCount:informationalRootOnly.length + informationalDomOnly.length,
          hiddenCards:domCards.filter(function(el) {
            return el.classList.contains('nrn-hide')
          }).length,
          injectedCards:domCards.filter(function(el) {
            return el.dataset.nrnAutofill === 'true'
          }).length
        }

        console.group(LOG + ' 開発者診断 / DOM・モデル')
        console.table({
          domCards:{value:result.domCards},
          domUniqueIds:{value:result.domUniqueIds},
          duplicateCardCount:{value:result.duplicateCardCount},
          connectedMovieRoots:{value:result.connectedMovieRoots},
          connectedRootUniqueIds:{value:result.connectedRootUniqueIds},
          hiddenCards:{value:result.hiddenCards},
          injectedCards:{value:result.injectedCards},
          mismatchWarningCount:{value:result.mismatchWarningCount},
          mismatchInfoCount:{value:result.mismatchInfoCount}
        })

        if (duplicates.length) {
          console.warn(LOG, 'DOM重複動画:', duplicates)
          console.table(duplicates)
        }

        if (result.mismatchWarningCount > 0) {
          console.warn(LOG, 'DOM/モデル差分（要確認）:', {
            warningRootOnlyIds:result.warningRootOnlyIds,
            warningDomOnlyIds:result.warningDomOnlyIds
          })
        } else if (rootOnlyIds.length || domOnlyIds.length) {
          console.log(LOG, 'DOM/モデル差分はありますが、現時点では補助要素などの情報差分として分類:', {
            informationalRootOnlyIds:result.informationalRootOnlyIds,
            informationalDomOnlyIds:result.informationalDomOnlyIds
          })
        } else {
          console.log(LOG, 'DOM/モデル整合性: ✓ 差分なし')
        }

        if (rootOnlyRows.length) {
          console.groupCollapsed(LOG + ' rootOnly 分類詳細')
          console.table(rootOnlyRows)
          console.groupEnd()
        }
        if (domOnlyRows.length) {
          console.groupCollapsed(LOG + ' domOnly 分類詳細')
          console.table(domOnlyRows)
          console.groupEnd()
        }

        console.log(LOG, 'DOM/モデル監査の意味:', {
          warning:'メイン検索結果に関係する差分。要確認。',
          info:'関連動画・補助カード・現行UIカードではないroot等。通常は致命的ではない。',
          note:'単純なrootOnly/domOnly件数だけでは異常判定しません。'
        })
        console.groupEnd()
        return result
      }

      var developerDryRunSources = async function() {
        if (page._disposed) return
        var summary = {
          legacy: {supported: true, ok: false},
          hybrid: {supported: Boolean(snapshotDescriptor.supported), ok: false},
          snapshot: {supported: Boolean(snapshotDescriptor.supported), ok: false}
        }

        // 1) 従来方式: 次ページHTMLを読むだけ。
        try {
          var legacyPage = page._currentPageNumber + 1
          var t0 = performance.now()
          var legacy = await page.fetchPageItems(legacyPage, {
            scope: 'DEV',
            requestId: 'DEV-legacy-p' + legacyPage
          })
          if (page._disposed) return
          var legacyItems = Array.isArray(legacy.items) ? legacy.items : []
          summary.legacy = {
            supported: true,
            ok: true,
            candidateCount: legacyItems.length,
            estimatedDetailChecks: legacyItems.length,
            elapsedMs: Math.round(performance.now() - t0),
            hasNextPage: legacy.hasNextPage,
            sampleIds: legacyItems.slice(0, 12).map(function(x) { return x.id })
          }
          console.groupCollapsed(LOG + ' DEV方式1/3 従来方式')
          console.table(legacyItems.slice(0, 36).map(function(x, i) {
            return {order:i+1,id:x.id,title:x.title,registeredAt:x.registeredAt||''}
          }))
          console.groupEnd()
        } catch (e) {
          if (page._disposed) return
          summary.legacy.error = String(e && e.message || e)
        }

        if (snapshotDescriptor.supported) {
          try {
            var s0 = performance.now()
            var snapshot = await snapshotFetchOffset(0)
            if (page._disposed) return
            var apiItems = snapshot.items || []
            var sourceMs = Math.round(performance.now() - s0)

            // API併用: API候補を全て完全判定へ送る方式としてシミュレーション。
            summary.hybrid = {
              supported: true,
              ok: true,
              candidateCount: apiItems.length,
              estimatedDetailChecks: apiItems.length,
              sourceElapsedMs: sourceMs,
              note: 'API候補を全件完全NG判定へ送る'
            }

            // API高速: APIだけで確定できるNGを先に除外した場合をシミュレーション。
            var quickRows = apiItems.map(function(item) {
              return {item:item, reason:apiQuickNgReason(item)}
            })
            var quickRejected = quickRows.filter(function(x) { return x.reason }).length
            var quickPassed = apiItems.length - quickRejected
            summary.snapshot = {
              supported: true,
              ok: true,
              candidateCount: apiItems.length,
              apiPrefilterRejected: quickRejected,
              estimatedDetailChecks: quickPassed,
              sourceElapsedMs: sourceMs,
              prefilterReductionPercent: apiItems.length
                ? Math.round(quickRejected / apiItems.length * 1000) / 10 : 0,
              note: model.config.ngLockedTagCountEnabled.value
                ? '🔒 タグロック数NGは完全判定が必要' : ''
            }

            // DOM/API順序とタイトル整合性も同じSnapshot取得結果から監査。
            var domIds = []
            var seen = new Set()
            page.doc.querySelectorAll('[data-decoration-video-id]:not([data-nrn-autofill="true"])').forEach(function(el) {
              var id = el.getAttribute('data-decoration-video-id')
              if (id && !seen.has(id)) { seen.add(id); domIds.push(id) }
            })
            var apiIds = apiItems.map(function(x) { return x.id })
            var compareN = Math.min(domIds.length, apiIds.length, 36)
            var exact = 0
            var apiHead = new Set(apiIds.slice(0, Math.max(48, compareN + 12)))
            var overlap = 0
            for (var i = 0; i < compareN; i++) {
              if (domIds[i] === apiIds[i]) exact++
              if (apiHead.has(domIds[i])) overlap++
            }
            var exactRate = compareN ? Math.round(exact / compareN * 1000) / 10 : 0
            var overlapRate = compareN ? Math.round(overlap / compareN * 1000) / 10 : 0
            summary.hybrid.exactRate = exactRate
            summary.hybrid.overlapRate = overlapRate
            summary.snapshot.exactRate = exactRate
            summary.snapshot.overlapRate = overlapRate

            var apiById = new Map(apiItems.map(function(x) { return [x.id, x] }))
            var titleRows = connectedOriginalRoots().slice(0,36).map(function(r) {
              var m = model.movies.get(r.movieId)
              var a = apiById.get(r.movieId)
              return {id:r.movieId,modelTitle:m?m.title:'',apiTitle:a?a.title:'',match:Boolean(m&&a&&m.title===a.title)}
            }).filter(function(x){ return x.apiTitle })
            var titleMismatch = titleRows.filter(function(x){ return !x.match }).length
            summary.hybrid.titleMismatches = titleMismatch
            summary.snapshot.titleMismatches = titleMismatch

            console.groupCollapsed(LOG + ' DEV方式2/3 API併用')
            console.table(apiItems.slice(0,36).map(function(x,i){return {order:i+1,id:x.id,title:x.title,registeredAt:x.registeredAt||''}}))
            console.log('DOM/API整合:', {compared:compareN,exactRatePercent:exactRate,overlapRatePercent:overlapRate,titleMismatches:titleMismatch})
            console.groupEnd()

            console.groupCollapsed(LOG + ' DEV方式3/3 API高速')
            console.table(quickRows.slice(0,36).map(function(x,i){return {order:i+1,id:x.item.id,title:x.item.title,apiDecision:x.reason?'事前NG':'完全判定へ',reason:x.reason||''}}))
            console.log('API事前判定効果:', {input:apiItems.length,rejected:quickRejected,detailChecksNeeded:quickPassed,reductionPercent:summary.snapshot.prefilterReductionPercent})
            console.groupEnd()
          } catch (e) {
            if (page._disposed) return
            summary.hybrid.error = String(e && e.message || e)
            summary.snapshot.error = String(e && e.message || e)
          }
        } else {
          summary.hybrid.reason = snapshotDescriptor.reason
          summary.snapshot.reason = snapshotDescriptor.reason
        }

        console.group(LOG + ' 開発者診断 / 3方式比較')
        console.table({
          legacy: {
            supported:summary.legacy.supported, ok:summary.legacy.ok,
            candidates:summary.legacy.candidateCount||0,
            estimatedDetailChecks:summary.legacy.estimatedDetailChecks||0,
            sourceMs:summary.legacy.elapsedMs||null,
            note:summary.legacy.error||''
          },
          hybrid: {
            supported:summary.hybrid.supported, ok:summary.hybrid.ok,
            candidates:summary.hybrid.candidateCount||0,
            estimatedDetailChecks:summary.hybrid.estimatedDetailChecks||0,
            sourceMs:summary.hybrid.sourceElapsedMs||null,
            note:summary.hybrid.error||summary.hybrid.reason||summary.hybrid.note||''
          },
          snapshot: {
            supported:summary.snapshot.supported, ok:summary.snapshot.ok,
            candidates:summary.snapshot.candidateCount||0,
            estimatedDetailChecks:summary.snapshot.estimatedDetailChecks||0,
            sourceMs:summary.snapshot.sourceElapsedMs||null,
            note:summary.snapshot.error||summary.snapshot.reason||summary.snapshot.note||''
          }
        })
        console.groupEnd()
        return summary
      }

      var runDeveloperSuite = async function(reason, forcedFull) {
        if (page._disposed) return
        if (!model.config.developerMode.value || developerSuiteRunning) return
        var diagnosticMode = forcedFull ? 'full' : model.config.developerDiagnosticMode.value
        if (diagnosticMode === 'manual' && !forcedFull) {
          developerSuiteStatus = '手動待機'
          updateStatus()
          console.log(LOG, '開発者診断は「手動のみ」のため自動実行を省略:', reason)
          return
        }
        developerSuiteRunning = true
        developerSuiteLastRunAt = performance.now()
        developerSuiteStep = 0
        developerSuiteTotalSteps = diagnosticMode === 'full' ? 5 : 4
        developerSuiteStatus = '開始'
        var runWasBusyAtDiagnosticStart = isRunBusy()
        console.group(LOG + ' ===== 開発者モード一括診断 START =====')
        console.log('実行レーン:', 'DEV（診断）')
        console.log('本番処理状態:', runWasBusyAtDiagnosticStart ? 'RUN処理中（ログは[RUN]/[DEV]で識別）' : 'RUN待機/完了')
        console.log('理由:', reason)
        console.log('診断モード:', diagnosticMode, forcedFull ? '(手動完全診断)' : '')
        console.log('※設定を変更しません。完全診断の3方式比較もdry-run/シミュレーションで、診断用動画をDOMへ追加しません。')

        try {
          setDeveloperProgress(1, '設定監査')
          logRuntimeSettings()

          setDeveloperProgress(2, 'DOM・モデル・重複監査')
          var domAudit = auditDomModel()
          console.log(LOG, 'ページャー診断:', {
            mode: model.config.autoFillPagerMode.value,
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            isFinalPage: knownLastPage != null && currentPageNumber() >= knownLastPage,
            endPageDetectionSource: endPageDetectionSource,
            searchedPhysicalPageCount: searchedPhysicalPageCount(),
            fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
            compactRanges: compactRanges([...fetchedPageNumbers]).map(function(r){
              return r.start === r.end ? String(r.start) : r.start + '-' + r.end
            }),
            nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
            matchingPageLinks: Array.from(page.doc.querySelectorAll('a[href]')).filter(function(a){
              return pageNumberFromHref(a.href) != null
            }).length,
            paginationSnapshot: typeof page._paginationSnapshot === 'function'
              ? page._paginationSnapshot() : null,
            detectionHistory: paginationDetectionHistory.slice()
          })

          setDeveloperProgress(3, 'NGユーザーID監査')
          var userAudit = await auditUserIdNg(reason)
          if (page._disposed) return

          var sourceAudit = null
          if (diagnosticMode === 'full') {
            setDeveloperProgress(4, '3方式取得テスト')
            sourceAudit = await developerDryRunSources()
            if (page._disposed) return
            setDeveloperProgress(5, '総合判定')
          } else {
            setDeveloperProgress(4, '総合判定（軽量）')
          }
          var verdicts = []
          if (domAudit.duplicateCardCount > 0) verdicts.push('DOM重複あり: ' + domAudit.duplicateCardCount + '件')
          if (domAudit.mismatchWarningCount > 0) {
            verdicts.push('DOM/モデル差分（要確認）: ' + domAudit.mismatchWarningCount + '件')
          } else if (domAudit.mismatchInfoCount > 0) {
            console.log(LOG, 'DOM/モデル情報差分:', domAudit.mismatchInfoCount
              + '件（補助要素等として分類。総合判定の警告には含めません）')
          }
          if (userAudit.mismatches.length) verdicts.push('NGユーザーID反映不一致: ' + userAudit.mismatches.length + '件')
          if (userAudit.invalidCount) verdicts.push('NGユーザーID不正値: ' + userAudit.invalidCount + '件')
          if (sourceAudit) {
            ;['hybrid','snapshot'].forEach(function(mode) {
              var m = sourceAudit[mode]
              if (m && m.supported && m.ok && Number.isFinite(m.overlapRate) && m.overlapRate < 70) {
                verdicts.push(mode + ' のDOM一致率が低い: ' + m.overlapRate + '%')
              }
            })
          }

          developerSuiteStatus = verdicts.length ? '完了・要確認' : '完了・正常'
          console.log(LOG, '開発者診断総合判定:', verdicts.length ? verdicts : ['✓ 重大な整合性問題は検出されませんでした'])
          console.log(LOG, '診断所要時間:', Math.round(performance.now() - developerSuiteLastRunAt) + 'ms')
          console.log(LOG, '===== 開発者モード一括診断 END =====')
        } catch (e) {
          if (page._disposed) return
          developerSuiteStatus = '診断エラー'
          console.error(LOG, '開発者診断中にエラー:', e)
        } finally {
          console.groupEnd()
          developerSuiteRunning = false
          updateStatus()
        }
      }

      // ControllerからNG-ID操作後の監査を呼べるようにする。
      model.config._nrnDiagnosticHook = function(reason, detail) {
        console.log(LOG, '診断フック:', reason, detail || {})
        if (reason === 'manual-developer-suite') {
          if (!model.config.developerMode.value) {
            console.warn(LOG, '手動診断には開発者モードをONにしてください')
            return
          }
          runDeveloperSuite('設定画面から手動実行', true)
          return
        }
        if (reason === 'ng-id-mutated') {
          auditUserIdNg(
            'NG-ID操作後 id=' + detail.id + ' operation=' + detail.operation)
        }
        if (model.config.developerMode.value) {
          // 重い全診断は連打しない。ID監査は上で即時実行済み。
          var now = performance.now()
          if (now - developerSuiteLastRunAt > 2000) {
            setTimeout(function() {
              runDeveloperSuite(reason)
            }, 100)
          }
        }
      }

      // -------------------- initialize --------------------
      var initialize = async function() {
        if (page._disposed) return
        console.log(LOG, '詳細情報UI:', {
          behavior:'クリックで開閉。詳細は動画カード内部の通常レイアウトへ挿入し、マウスアウトでは閉じません。',
          layout:'reserved-space-below-card + pinned-toggle-v2（追加カードは表示後に▲▼を再測定。NG/予備カードは位置監査対象外）',
          design:'classic-functional（タグ名 → 🔒 → [+]。NG操作を常時表示し、装飾を最小限にする）',
          bulkControls:'上部バーの「全て開く / 全て閉じる」で一括操作可能'
        })
        console.log(LOG, 'ログ識別子:', {
          RUN:'実際の自動継ぎ足し・ユーザー画面へ反映する処理',
          DEV:'開発者モードのdry-run/比較診断。画面へ候補を追加しない',
          requestId:'同時通信があっても開始と解析結果を同じIDで追跡できます'
        })
        logSearchMethodAudit()
        logRuntimeSettings()
        console.group(LOG + ' 複合NGルール設定')
        console.log('有効:', model.config.advancedNgRulesEnabled.value)
        var activeAdvancedRules = AdvancedNgRules.parse(model.config.advancedNgRulesJson.value)
        console.table(activeAdvancedRules.map(function(rule, i) {
          return {
            no:i + 1,
            name:rule.name,
            enabled:rule.enabled,
            expression:AdvancedNgRules.expressionText(rule.expression)
          }
        }))
        console.log('判定論理: AND（論理積） / OR（論理和） / NOT（論理否定）を任意に入れ子可能')
        console.log('用語:', {
          condition: '条件式 = 1つの判定',
          group: '条件グループ = 複数の条件式をまとめたもの',
          nesting: '入れ子（ネスト） = グループの中に別グループを置くこと',
          comparisonOperators: '> / ≥ / < / ≤ / = / ≠',
          substringMatch: '部分一致 = 入力文字列が対象文字列の一部に含まれる',
          exactMatch: '完全一致 = 文字列全体またはタグ名1個が完全に同じ',
          tagMatch: 'タグ/🔒タグロックの「ある/ない」はタグ名1個との完全一致'
        })
        console.groupEnd()
        logApiTranslationAudit()
        logNavigationNotice()
        logNgEffectivenessNotice()

        setPhase('waiting-dom', 'ニコニコの動画カード生成待ち')
        var initStart = performance.now()
        var initialDomWaitStarted = performance.now()
        originalRoots = await waitForInitialRoots(15000)
        if (page._disposed) return
        var initialDomWaitMs = Math.round(performance.now() - initialDomWaitStarted)

        // connected + ID重複除去で正規化。
        var rootSeen = new Set()
        originalRoots = originalRoots.filter(function(r) {
          if (!r.movieId || rootSeen.has(r.movieId)) return false
          rootSeen.add(r.movieId)
          return true
        })

        originalMovieIds = new Set(originalRoots.map(function(r) {
          return r.movieId
        }).filter(Boolean))

        knownMovieIds = new Set(originalMovieIds)
        page.doc.querySelectorAll('[data-decoration-video-id]').forEach(function(el) {
          var id = el.getAttribute('data-decoration-video-id')
          if (id) knownMovieIds.add(id)
        })

        var domUniqueIds = new Set()
        page.doc.querySelectorAll(
          '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
        ).forEach(function(el) {
          var id = el.getAttribute('data-decoration-video-id')
          if (id) domUniqueIds.add(id)
        })

        console.log(LOG, '初期動画確定:', {
          rootsRawOrNormalized: originalRoots.length,
          uniqueMovieIds: originalMovieIds.size,
          domUniqueIds: domUniqueIds.size,
          rootOnlyIds: [...originalMovieIds].filter(function(id) { return !domUniqueIds.has(id) }),
          domOnlyIds: [...domUniqueIds].filter(function(id) { return !originalMovieIds.has(id) }),
          requestedMode: requestedMode,
          selectedSource: sourceLabel,
          snapshotSupported: snapshotDescriptor.supported,
          fallbackReason: fallbackReason || null,
          currentPhysicalPage: currentPageNumber(),
          knownLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          isFinalPage: knownLastPage != null && currentPageNumber() >= knownLastPage
        })

        if (!originalMovieIds.size) {
          initialized = true
          gaveUp = true
          stopReason = '現在ページの動画を認識できません'
          setPhase('error', stopReason)
          return
        }

        setPhase('initial-ng',
          originalMovieIds.size + '件を初期NG判定中（同時 ' + model.config.thumbInfoConcurrency.value + '件）')

        var initialCacheResult = restoreCachedMovieDetails([...originalMovieIds], '初期ページ')
        console.log(LOG, '初期詳細情報キャッシュ:', initialCacheResult)

        var thumbStart = performance.now()
        model.requestThumbInfo(true)
        var completed = await waitForThumbInfo([...originalMovieIds], 30000)
        if (page._disposed) return
        const countedMovies = [...new Set(originalRoots.filter(root => root.elem.matches('[data-decoration-video-id][data-anchor-area="main"]:not([data-anchor-detail="nicoad"])')).map(root => root.movieId))]
          .map(id => model.movies.get(id)).filter(Boolean)
        if (completed && countedMovies.length && countedMovies.every(movie => movie.thumbInfoDone
            && movie.error.type === 'NO_ERROR' && movie.contributor?.type !== 'unknown' && Number(movie.contributor?.id) > 0)) {
          const counts = new Map()
          const ownerKey = movie => movie.contributor.type + ':' + movie.contributor.id
          countedMovies.forEach(movie => counts.set(ownerKey(movie), (counts.get(ownerKey(movie)) || 0) + 1))
          countedMovies.forEach(movie => movie.setPageContributorCount(counts.get(ownerKey(movie))))
        }

        var thumbEnd = performance.now()

        if (!completed) {
          initialized = true
          gaveUp = true
          stopReason = '現在ページの動画詳細取得がタイムアウト'
          setPhase('error', stopReason)
          return
        }

        var initialSelfAdStarted = performance.now()
        if (selfAdRuleRequired()) {
          await ensureSelfAdChecks([...originalMovieIds], '初期ページ / NG条件必須')
          if (page._disposed) return
        } else if (model.config.selfAdWarningEnabled.value) {
          var initialWarningIds = visibleNonNgIds([...originalMovieIds])
          console.log(LOG, '自演広告監査を表示動画だけに限定:', {
            phase:'初期ページ',
            all:originalMovieIds.size,
            visibleCandidates:initialWarningIds.length,
            skippedNg:originalMovieIds.size - initialWarningIds.length
          })
          await ensureSelfAdChecks(initialWarningIds, '初期ページ / 表示動画のみ')
          if (page._disposed) return
        }
        var initialSelfAdMs = Math.round(performance.now() - initialSelfAdStarted)
        renderStoredSelfAdWarnings([...originalMovieIds], '初期ページ')

        initialized = true
        rebalanceOverflow()

        // 重要: setupAutoFill直後ではなく、動画DOMが安定したこの時点で初めて
        // 現在ページのページャーから最終ページを判定する。
        refreshKnownLastPage('initial DOM stable')

        var initialPaginationSnapshot = typeof page._paginationSnapshot === 'function'
          ? page._paginationSnapshot() : null
        if (!useSnapshot && knownLastPage != null
            && initialPaginationSnapshot
            && initialPaginationSnapshot.hasPaginationEvidence
            && currentPageNumber() >= knownLastPage) {
          lastFetchedHadNext = false
          endReachedWithoutRequest = true
          console.log(LOG, '現在ページが最終ページのため追加HTTP取得を行いません:', {
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            source: endPageDetectionSource,
            pageNumbers: initialPaginationSnapshot.pageNumbers,
            paginationLinkCount: initialPaginationSnapshot.linkCount
          })
        } else {
          console.log(LOG, '初期終端判定: 継ぎ足し可能', {
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            source: endPageDetectionSource,
            paginationEvidence: Boolean(
              initialPaginationSnapshot && initialPaginationSnapshot.hasPaginationEvidence),
            higherPagesVisible: Boolean(
              initialPaginationSnapshot && initialPaginationSnapshot.hasHigherPage),
            pageNumbers: initialPaginationSnapshot
              ? initialPaginationSnapshot.pageNumbers : []
          })
        }

        var initialRows = originalRoots.map(function(r, i) {
          var movie = model.movies.get(r.movieId)
          var reasons = getMovieNgReasons(movie)
          return {
            order: i + 1,
            id: r.movieId,
            title: movie ? movie.title : '',
            decision: movie && movie.ng ? 'NG' : '表示',
            ngReasons: reasons
          }
        })

        console.group(LOG + ' 初期ページNG判定結果')
        console.table(initialRows.map(function(r) {
          return {
            order: r.order,
            id: r.id,
            title: r.title,
            decision: r.decision,
            ngReason: r.ngReasons.join(' / ')
          }
        }))
        console.log('NG理由集計:', summarizeNgReasons(initialRows))
        console.groupEnd()

        console.log(LOG, '初期NG判定完了:', {
          total: originalMovieIds.size,
          ng: originalNgCount(),
          visible: visibleOriginalCount(),
          target: targetCount(),
          shortage: Math.max(0, targetCount() - visibleTotalCount()),
          timings:{
            totalInitMs:Math.round(performance.now() - initStart),
            domWaitMs:initialDomWaitMs,
            thumbInfoMs:Math.round(thumbEnd - thumbStart),
            selfAdMs:initialSelfAdMs
          }
        })

        var initialPerformance = {
          totalInitMs:Math.round(performance.now() - initStart),
          domWaitMs:initialDomWaitMs,
          thumbInfoMs:Math.round(thumbEnd - thumbStart),
          selfAdMs:initialSelfAdMs,
          originalCount:originalMovieIds.size,
          visibleAfterNg:visibleOriginalCount(),
          selfAdPolicy:selfAdRuleRequired() ? '全候補（NG条件）'
            : (model.config.selfAdWarningEnabled.value ? 'NG通過動画のみ' : 'OFF')
        }
        console.log(LOG, '初期処理パフォーマンス:', initialPerformance)
        window.__nrnInitialPerformance = initialPerformance
        updatePagerUi('initial checks completed')

        maybeFetchMore()

        if (model.config.developerMode.value) {
          setTimeout(function() {
            runDeveloperSuite('初期化完了').catch(function(e) { console.error(LOG, '開発者診断失敗:', e) })
          }, 300)
        }
      }

      model.movieViewModes.on('movieViewModeChanged', function() {
        if (!initialized) return
        rebalanceOverflow()
        updateStatus()
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(function() { updatePagerUi('NG display changed'); maybeFetchMore() }, 100)
      })

      model.config.autoFillEnabled.on('changed', function(enabled) {
        if (enabled) {
          gaveUp = false
          stopReason = ''
          finishedAt = null
          completionReported = false
          runStartedAt = performance.now()
          setPhase('starting', '再開')
          maybeFetchMore()
        } else {
          setPhase('disabled', '自動継ぎ足しOFF')
        }
      })

      model.config.autoFillTargetCount.on('changed', function() {
        gaveUp = false
        stopReason = ''
        finishedAt = null
        completionReported = false
        rebalanceOverflow()
        updateStatus()
        maybeFetchMore()
      })

      model.config.autoFillAdMode.on('changed', function(v) {
        console.log(LOG, '広告設定変更:', v)
        updateStatus()
      })
      model.config.selfAdWarningEnabled.on('changed', function(v) {
        console.log(LOG, '自演広告警告設定変更:', {
          enabled:Boolean(v),
          note:'次回の詳細判定対象から広告者照合を実行'
        })
      })

      model.config.autoFillInfoMode.on('changed', function(v) {
        console.log(LOG, '取得方式変更:', v, '（次回ページ再読み込み時に完全反映）')
        updateStatus()
      })

      model.config.thumbInfoConcurrency.on('changed', function(v) {
        console.log(LOG, '詳細情報同時取得数変更:', v)
        updateStatus()
      })

      model.config.statusPanelMode.on('changed', function(v) {
        console.log(LOG, 'ステータス表示変更:', v)
        updateStatus()
      })

      model.config.autoFillDetailBatchMax.on('changed', function(v) {
        console.log(LOG, '詳細判定バッチ上限変更:', v)
        updateStatus()
      })

      model.config.autoFillPagerMode.on('changed', function(v) {
        console.log(LOG, 'ページャー表示設定変更:', v)
        restorePagerUi()
        updatePagerUi('setting changed')
        updateStatus()
      })
      model.config.spaNavigationFix.on('changed', function() {
        restorePagerUi()
        updatePagerUi('SPA setting changed')
      })

      model.config.pagerPreviewCount.on('changed', function(v) {
        console.log(LOG, 'ページャー未取得プレビュー件数変更:', v)
        restorePagerUi()
        updatePagerUi('preview count changed')
        updateStatus()
      })

      model.config.sessionDetailCacheEnabled.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'セッション詳細キャッシュ設定変更:', {
          enabled: v,
          backend: detailCache.diagnostics()
        })
        updateStatus()
      })

      model.config.sessionDetailCacheTtlMinutes.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'キャッシュ保持時間変更:', {minutes:v, backend:detailCache.diagnostics()})
        updateStatus()
      })

      model.config.sessionDetailCacheMaxEntries.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'キャッシュ最大件数変更:', {maxEntries:v, backend:detailCache.diagnostics()})
        updateStatus()
      })

      model.config.statusAnimationEnabled.on('changed', function(v) {
        console.log(LOG, 'ステータスアニメーション設定変更:', v)
        updateStatus()
      })

      model.config.developerDiagnosticMode.on('changed', function(v) {
        console.log(LOG, '開発者診断モード変更:', v)
        developerSuiteStatus = v === 'manual' ? '手動待機' : '設定変更済み'
        updateStatus()
      })

      model.config.developerMode.on('changed', function(v) {
        console.log(LOG, '開発者モード変更:', v)
        updateStatus()
        if (v && initialized) {
          setTimeout(function() {
            runDeveloperSuite('開発者モードON').catch(function(e) { console.error(LOG, '開発者診断失敗:', e) })
          }, 50)
        }
      })

      setTimeout(initialize, 0)
    }
