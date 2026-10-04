
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

        // Keep physical card slots (including ads); request identities remain
        // deduplicated separately in originalMovieIds below.
        refreshOriginalCardBudget()

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
        if (completed && countedMovies.length && countedMovies.every(movie => movie.metadataSettled
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
        originalMovieIds.forEach(cacheMovieAfterCheck)
        if (selfAdRuleRequired()) {
          await ensureSelfAdChecks([...originalMovieIds], '初期ページ / NG条件必須')
          if (page._disposed) return
        }
        var initialSelfAdMs = Math.round(performance.now() - initialSelfAdStarted)
        renderStoredSelfAdWarnings([...originalMovieIds], '初期ページ')

        initialized = true
        rebalanceOverflow()
        if (!selfAdRuleRequired() && model.config.selfAdWarningEnabled.value) {
          var initialWarningIds = visibleNonNgIds([...originalMovieIds])
          console.log(LOG, '自演広告警告を表示動画だけ非同期取得:', {
            phase:'初期ページ',
            all:originalMovieIds.size,
            visibleCandidates:initialWarningIds.length,
            skippedNg:originalMovieIds.size - initialWarningIds.length
          })
          startSelfAdWarnings(initialWarningIds, '初期ページ / 表示動画のみ')
        }

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
        model.diagnostics?.initial(initialPerformance)
        Diagnostics.publish('initial')
        updatePagerUi('initial checks completed')

        maybeFetchMore()

        if (model.config.developerMode.value) {
          setTimeout(function() {
            runDeveloperSuite('初期化完了').catch(function(e) { console.error(LOG, '開発者診断失敗:', e) })
          }, 300)
        }
      }

      // Late native cards and metadata settlement can alter the budget without
      // a view-mode transition. Reconcile only actual changes, once per task.
      var cardBudgetMovies = new Map()
      var cardBudgetTimer = null
      var scheduleCardBudget = function() {
        if (page._disposed || !initialized || cardBudgetTimer !== null) return
        cardBudgetTimer = setTimeout(function() {
          cardBudgetTimer = null
          if (page._disposed) return
          stopRefillIfUnneeded()
          rebalanceOverflow()
          updateStatus()
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(function() { updatePagerUi('visible card budget changed'); maybeFetchMore() }, 100)
        }, 0)
      }
      var refreshOriginalCardBudget = function() {
        var seen = new Set()
        var next = currentOriginalRootCandidates().filter(function(root) {
          if (seen.has(root.elem)) return false
          seen.add(root.elem); return true
        }).sort(function(a,b) {
          var position = a.elem.compareDocumentPosition(b.elem)
          return position & 4 ? -1 : position & 2 ? 1 : 0
        })
        var changed = next.length !== originalRoots.length || next.some(function(root,i) { return root.elem !== originalRoots[i]?.elem })
        originalRoots = next
        next.forEach(function(root) {
          var movie = model.movies.get(root.movieId)
          if (!movie || cardBudgetMovies.has(movie)) return
          var settled = movie.metadataSettled
          var onMetadata = function() {
            var current = movie.metadataSettled
            if (settled === current) return
            settled = current
            scheduleCardBudget()
          }
          cardBudgetMovies.set(movie,onMetadata)
          movie.on('metadataChanged',onMetadata).on('thumbInfoDone',onMetadata)
          listeners.push(function() { movie.off('metadataChanged',onMetadata); movie.off('thumbInfoDone',onMetadata); cardBudgetMovies.delete(movie) })
        })
        return changed
      }
      page._onAutoFillRootsChanged = function() {
        if (page._disposed) return
        if (refreshOriginalCardBudget()) scheduleCardBudget()
      }

      var restorePrefilteredCandidates = function() {
        if (page._disposed) return
        lastAcceptanceRate = null
        var inPool = new Set(candidatePool.map(function(item) { return item.id }))
        var replay = candidateFilter.release().filter(function(item) {
          return !inPool.has(item.id) && !isMovieAlreadyOnPage(item.id)
        })
        if (!replay.length) return
        candidatePool = candidateFilter.sort(candidatePool.concat(replay))
        gaveUp = false
        stopReason = ''
        completionReported = false
        noProgressStreak = 0
        if (initialized) {
          updatePagerUi('prefilter criteria changed')
          maybeFetchMore()
        }
      }
      for (var key of ['ngMovies','ngTitles','advancedNgRulesEnabled','advancedNgRulesJson']) {
        model.config[key].on('changed',restorePrefilteredCandidates)
      }

      model.movieViewModes.on('movieViewModeChanged', function() {
        if (!initialized) return
        // Wait until the card's own view listener has applied nrn-hide/reduce.
        // A burst of NG transitions shares one budget/status update.
        scheduleCardBudget()
      })

      model.config.autoFillEnabled.on('changed', function(enabled) {
        stopRefillIfUnneeded()
        rebalanceOverflow()
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
        stopRefillIfUnneeded()
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
