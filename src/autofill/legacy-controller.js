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
      var LOG = '[NicoNicoRankingNG autoFill ' + NRN_VERSION + ']'

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
          var measured = model.diagnostics?.begin(options._nrnKind,options._nrnLane) || function() {}
          var transportOptions = {...options}
          delete transportOptions._nrnKind
          delete transportOptions._nrnLane
          var settled = false
          var finish = function(fn, outcome) { return function(value) {
            if (settled) return
            settled = true; handles.delete(handle)
            measured(outcome || (value?.status >= 200 && value.status < 300 ? 'ok' : 'http'))
            fn(value)
          } }
          try {
          var handle = request(Object.assign({}, transportOptions, {
            onload: finish(resolve),
            onerror: finish(reject,'network'),
            onabort: finish(function() { reject(new Error('request aborted')) },'aborted'),
            ontimeout: finish(function() { reject(new Error('timeout')) },'timeout')
          }))
          if (handle && !settled) handles.add(handle)
          if (handle && typeof handle.catch === 'function') handle.catch(finish(reject,'network'))
          } catch (error) { finish(reject,'network')(error) }
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
          return movie && movie.metadataSettled && !movie.ng
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
            _nrnKind:'adsThanks',
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
          try {
            var json = JSON.parse(response.responseText || response.response || '{}')
            if (!json || !json.data || !Array.isArray(json.data.sponsors)) throw new Error('広告者一覧の応答形式が不正です')
          } catch (error) { model.diagnostics?.validationFailure('adsThanks','run','invalid'); throw error }
          var sponsors = json.data.sponsors
          if (sponsors.length >= 100) {
            model.diagnostics?.validationFailure('adsThanks','run','incomplete')
            throw new Error('広告者一覧が取得上限100件に到達したため、一致・不一致の判定を保留します')
          }
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
            if (!movie || !movie.metadataSettled) continue
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
      var candidateFilter = CandidateFilter.create(model.config)
      var totalCheapPrefilteredNg = 0
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
        var phaseChanged = phase !== nextPhase
        phase = nextPhase
        model.diagnostics?.phase(nextPhase)
        phaseDetail = detail
        if (nextPhase === 'completed' || nextPhase === 'stopped' || nextPhase === 'error') {
          finishedAt = performance.now()
        }
        console.log(LOG, '状態変更:', nextPhase, phaseDetail)
        updateStatus()
        if (phaseChanged && ['completed','stopped','error'].includes(nextPhase)) Diagnostics.publish('terminal')
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

      var injectedOrder = function(root) {
        var raw = root.elem.dataset.nrnCandidateOrder
        return raw && Number.isSafeInteger(Number(raw)) ? Number(raw) : Infinity
      }
      var hasEarlierCandidate = function() {
        if (!candidatePool.length) return false
        var displayed = uniqueVisibleRoots(connectedInjectedRoots())
        return displayed.length > 0 && candidateFilter.order(candidatePool[0]) < injectedOrder(displayed[displayed.length - 1])
      }
      var connectedInjectedRoots = function() {
        return page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
              && r.elem.dataset.nrnAutofill === 'true'
              && r.movieId
        }).sort(function(a,b) {
          return injectedOrder(a) - injectedOrder(b)
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
          if (model.config.useGetThumbInfo.value && !movie.metadataSettled) return false
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
          version: NRN_VERSION,
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
          'Nico Nico Ranking NG / AutoFill ' + NRN_VERSION,
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

      model.diagnostics?.runtime(function() {
        return {visibleTotal:initialized ? visibleTotalCount() : null,
          visibleOriginal:initialized ? visibleOriginalCount() : null,visibleInjected:visibleInjectedCount(),
          originalNg:initialized ? originalNgCount() : null,injectedNg:injectedNgCount(),pending:pendingInjectedCount(),
          candidatePool:candidatePool.length,fetchedUnits:fetchedExtraPages,fetchedItems:totalFetchedItems,
          detailChecked:totalDetailChecked,acceptedFromAdded:totalAcceptedFromAdded,apiPrefilteredNg:totalApiPrefilteredNg,
          duplicatesRemoved:totalDuplicatesRemoved,adPending:adPending,searchedPhysicalPageCount:searchedPhysicalPageCount(),
          detailCacheHits:cacheHits,detailCacheMisses:cacheMisses,detailCacheRestores:cacheRestores,detailCacheRestoreFailures:cacheRestoreFailures}
      })
      listen(badge, 'dblclick', function() { Diagnostics.publish('manual') })

      // -------------------- waiting helpers --------------------
      var waitForInitialRoots = function(timeoutMs) {
        return new Promise(function(resolve) {
          var startedAt = Date.now()
          var lastCount = -1
          var stableSince = 0

          var check = function() {
            var candidates = currentOriginalRootCandidates()
            var count = candidates.length
            // Decoration/hover elements also carry video IDs. Only real main
            // cards belong to the initial result readiness check.
            var expected = [...page.doc.querySelectorAll(
              '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])'
            )].filter(elem => !elem.closest('[data-scope="presence"],[data-scope="tooltip"],[data-scope="menu"]'))
            var allBound = expected.every(elem => candidates.some(root => root.movieId === elem.dataset.decorationVideoId
              && (root.elem === elem || root.elem.contains(elem) || elem.contains(root.elem))))

            if (count > 0 && count === lastCount) {
              if (!stableSince) stableSince = Date.now()
              if (Date.now() - stableSince >= 300
                  && allBound) {
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
          var listeners = new Map(), checking = false
          var cleanup = function() {
            clearTimeout(timer)
            for (var [movie,listener] of listeners) movie.off('metadataChanged',listener)
            listeners.clear()
          }
          var finish = function() {
            if (done || checking) return
            checking = true
            // Metadata changes also schedule dependent owner-name work. Let that
            // scheduling run, then recheck every video instead of deleting it early.
            Promise.resolve().then(function() {
              checking = false
              if (done || ids.some(id => model.movies.get(id) && !model.movies.get(id).metadataSettled)) return
              done = true;cleanup();resolve(true)
            })
          }
          ids.forEach(function(id) {
            var movie = model.movies.get(id)
            if (!movie) return
            listeners.set(movie,finish)
            movie.on('metadataChanged',finish)
          })

          var timer = setTimeout(function() {
            if (done) return
            done = true
            cleanup()
            console.warn(LOG, '詳細情報待機タイムアウト:', ids.filter(id => !model.movies.get(id)?.metadataSettled))
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
