
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
        if (visibleTotalCount() >= targetCount() && !hasEarlierCandidate()) {
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
        var cycleController = new AbortController()
        refillController = cycleController
        var cancelCycle = function() { cycleController.abort() }
        if (runLifetime.signal.aborted) cancelCycle()
        else runLifetime.signal.addEventListener('abort',cancelCycle,{once:true})
        var cycleStart = performance.now()

        try {
          var shortage = targetCount() - visibleTotalCount()
          var detailBatchSize = chooseDetailBatchSize(Math.max(shortage,hasEarlierCandidate() ? 1 : 0))

          // APIは候補だけ多めに保持してよいが、詳細判定は必要量だけ。
          var desiredPool = useSnapshot
            ? Math.max(detailBatchSize, Math.min(100, detailBatchSize + 24))
            : detailBatchSize

          var fetchMs = 0
          var seenBeforeFetch = candidatePoolSeen.size
          if (!hasEarlierCandidate() && candidatePool.length < detailBatchSize) {
            setPhase('fetching',
              '候補を補充中（必要 ' + detailBatchSize + '件 / プール ' + candidatePool.length + '件）')
            fetchMs = await fetchMoreCandidates(desiredPool,cycleController.signal)
            if (page._disposed) return
          }

          // A user action or another settled card may have removed the need
          // while the source was loading. Keep raw candidates for later use.
          if (!model.config.autoFillEnabled.value) { setPhase('disabled','自動継ぎ足しOFF'); return }
          if (cycleController.signal.aborted || (visibleTotalCount() >= targetCount() && !hasEarlierCandidate())) return

          if (!candidatePool.length) {
            if (lastFetchedHadNext === false) {
              gaveUp = true
              stopReason = '取得できる候補がありません'
              setPhase('stopped', stopReason)
              return
            }
            // New unique videos rejected by NG still advance the search.
            // Raw duplicate responses alone must not reset this safeguard.
            if (candidatePoolSeen.size > seenBeforeFetch) { noProgressStreak = 0; return }
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
            chooseDetailBatchSize(Math.max(shortage,hasEarlierCandidate() ? 1 : 0))
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
          if (page._disposed || cycleController.signal.aborted) return
          console.error(LOG, '自動継ぎ足しでエラー:', e)

          if (useSnapshot) {
            useSnapshot = false
            sourceLabel = '従来方式'
            fallbackReason = 'API実行エラー: ' + (e && e.message ? e.message : e)
            candidatePool = []
            candidatePoolSeen.clear()
            candidateFilter.clear()
            if (typeof detailParked !== 'undefined') detailParked.clear()
            lastFetchedHadNext = null
            nextPageToFetch = page._currentPageNumber + 1
            console.warn(LOG, 'APIから従来方式へfallbackして続行します')
          } else {
            gaveUp = true
            stopReason = e && e.message ? e.message : '通信または解析エラー'
            setPhase('error', stopReason)
          }
        } finally {
          runLifetime.signal.removeEventListener('abort',cancelCycle)
          if (refillController === cycleController) refillController = null
          fetching = false
          if (page._disposed) return
          updateStatus()

          if (!gaveUp && model.config.autoFillEnabled.value) {
            if (visibleTotalCount() >= targetCount() && !hasEarlierCandidate()) {
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
