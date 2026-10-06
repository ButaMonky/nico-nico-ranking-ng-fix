
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

      // BRUSH-054C: keep AutoFill responsive without adding fixed sleeps or
      // changing network concurrency. scheduler.yield is preferred where
      // available; MessageChannel is the cross-browser fallback.
      var autoFillMainThreadBudgetMs = 10
      var cooperativeWorkStopped = function() {
        return page._disposed || runLifetime.signal.aborted
      }
      var messageChannelYield = function() {
        if (cooperativeWorkStopped()) return Promise.resolve(false)
        return new Promise(function(resolve) {
          var channel = new MessageChannel()
          var done = false
          var finish = function(value) {
            if (done) return
            done = true
            runLifetime.signal.removeEventListener('abort',cancel)
            channel.port1.onmessage = null
            channel.port1.close()
            channel.port2.close()
            resolve(Boolean(value) && !cooperativeWorkStopped())
          }
          var cancel = function() { finish(false) }
          runLifetime.signal.addEventListener('abort',cancel,{once:true})
          channel.port1.onmessage = function() { finish(true) }
          channel.port2.postMessage(0)
        })
      }
      var yieldToMainThread = function() {
        if (cooperativeWorkStopped()) return Promise.resolve(false)
        var schedulerApi = globalThis.scheduler
        if (schedulerApi && typeof schedulerApi.yield === 'function') {
          try {
            return Promise.resolve(schedulerApi.yield()).then(function() {
              return !cooperativeWorkStopped()
            }, function() {
              return messageChannelYield()
            })
          } catch (e) {}
        }
        return messageChannelYield()
      }
      var mapCooperatively = async function(values, mapper) {
        var result = []
        var startedAt = performance.now()
        for (var i = 0; i < values.length; i++) {
          if (cooperativeWorkStopped()) return null
          result.push(mapper(values[i],i))
          if (i + 1 < values.length && performance.now() - startedAt >= autoFillMainThreadBudgetMs) {
            if (!(await yieldToMainThread())) return null
            startedAt = performance.now()
          }
        }
        return result
      }

      var chooseDetailBatchSize = function(shortage) {
        if (typeof shortage !== 'number' || !Number.isFinite(shortage) || shortage <= 0) return 0
        var need = Math.ceil(shortage)
        var configuredMax = Math.max(
          8, Math.min(100, Math.trunc(Number(model.config.autoFillDetailBatchMax.value)) || 48))
        var baseRate = lastAcceptanceRate
        if (!Number.isFinite(baseRate)) {
          if (originalMovieIds.size) {
            var eligible = [...originalMovieIds].map(function(id) { return model.movies.get(id) })
              .filter(function(movie) { return movie && !CandidateFilter.reason({id:movie.id,title:movie.title},model.config) })
            // Cheap rejects never enter the detail pool: do not count them
            // again when estimating acceptance of the remaining candidates.
            baseRate = eligible.length ? visibleOriginalCount() / eligible.length : 1
          } else baseRate = 0.35
        }
        baseRate = Math.max(0.05,Math.min(1,baseRate))
        return Math.max(1,Math.min(configuredMax,Math.ceil(need / baseRate)))
      }

      var cacheKeyForMovie = function(id) {
        return String(id || '')
      }

      var applyThumbInfoFromCache = ThumbInfoListener.forCompleted(model.movies)
      var applyOwnerNameFromCache = ThumbInfoListener.forOwnerName(model.movies)
      var checkedDetailCacheIds = new Set()
      var checkedOwnerNameCache = new Map()

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
          const existingMovie = model.movies.get(id)
          if (existingMovie) {
            const identity = existingMovie._nrnDetailContributor || existingMovie._nrnSearchContributor
            const identityKey = identity ? identity.type + ':' + identity.id : 'unknown'
            if (existingMovie.metadata.ownerName !== 'known' && checkedOwnerNameCache.get(id) !== identityKey) {
              checkedOwnerNameCache.set(id,identityKey)
              const cachedOwner = detailCache.get(cacheKeyForMovie(id))
              const name = cachedOwner?.id === id ? cachedOwner.ownerNameSupplement : null
              if (name && Number.isFinite(name.fetchedAt) && applyOwnerNameFromCache(id,name,name.fetchedAt)) existingMovie._nrnOwnerNameStatus = 'cached'
            }
          }
          if (existingMovie?.thumbInfoDone) return
          if (checkedDetailCacheIds.has(id)) return
          checkedDetailCacheIds.add(id)
          var key = cacheKeyForMovie(id)
          var cached = detailCache.get(key)
          if (cached && (cached.id !== id || !cached.metadata
              || cached.metadata.tags !== 'known' || cached.metadata.lockedTags !== 'known'
              || cached.metadata.description !== 'known' || !Array.isArray(cached.tags)
              || typeof cached.description !== 'string')) cached = null
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
              fetchedAt:cached.cachedAt,
              description: cached.description,
              tags: cached.tags,
              contributor: cached.contributor ? {...cached.contributor,
                name:cached.metadata.ownerName === 'known' ? cached.contributor.name : null} : null,
              title: cached.title || movie.title,
              error: {type:'NO_ERROR', message:'cache'}
            })
            if (cached.ownerNameSupplement && Number.isFinite(cached.ownerNameSupplement.fetchedAt)
                && applyOwnerNameFromCache(id,cached.ownerNameSupplement,cached.ownerNameSupplement.fetchedAt)) movie._nrnOwnerNameStatus = 'cached'
            restored++
            model.diagnostics?.cache(id,'session')
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
      model.requestThumbInfo.restoreCachedDetails = restoreCachedMovieDetails

      var cacheMovieAfterCheck = function(id) {
        if (!model.config.sessionDetailCacheEnabled.value) return
        var movie = model.movies.get(id)
        if (!movie) return
        if (!movie.thumbInfoDone || movie.metadata.tags !== 'known' || movie.metadata.description !== 'known') {
          if (movie._nrnOwnerNameSupplement) {
            const previous = detailCache.get(cacheKeyForMovie(id))
            detailCache.set(cacheKeyForMovie(id),{...(previous?.id === id ? previous : {}),id,
              ownerNameSupplement:{...movie._nrnOwnerNameSupplement},
              cachedAt:previous?.id === id ? previous.cachedAt : movie._nrnOwnerNameSupplement.fetchedAt})
            cacheWrites++
          }
          return
        }
        if (movie.error && movie.error.type && movie.error.type !== 'NO_ERROR') return
        var payload = {
          id: id,
          metadata: {...movie.metadata},
          title: movie.title || '',
          description: movie.description || '',
          contributor: movie._nrnDetailContributor ? {...movie._nrnDetailContributor} : null,
          ownerNameSupplement: movie._nrnOwnerNameSupplement ? {...movie._nrnOwnerNameSupplement} : null,
          tags: (movie.tags || []).map(function(t) {
            return {name:t.name, lock:Boolean(t.lock)}
          }),
          ng: Boolean(movie.ng),
          ngReasons: getMovieNgReasons(movie),
          cachedAt: movie._nrnDetailFetchedAt || Date.now()
        }
        detailCache.set(cacheKeyForMovie(id), payload)
        cacheWrites++
      }
      if (model.ownerNames) model.ownerNames.onRecovered = cacheMovieAfterCheck

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

        var batchTiles = await page._createInjectedTilesCooperatively(
          items, yieldToMainThread, autoFillMainThreadBudgetMs, cooperativeWorkStopped)
        if (cooperativeWorkStopped() || batchTiles.length !== items.length) return
        var parsedResults = items.map(function(item, itemIndex) {
          var tile = batchTiles[itemIndex]
          var ordinal = candidateFilter.order(item)
          tile.dataset.nrnCandidateOrder = String(ordinal)
          var later = connectedInjectedRoots().find(function(root) {
            return root.elem.parentNode === tile.parentNode && injectedOrder(root) > ordinal
          })
          if (later) tile.parentNode.insertBefore(tile,later.elem)
          addedIds.push(item.id)
          itemById.set(item.id, item)
          knownMovieIds.add(item.id)
          return {
            type: 'main',
            movie: {id: item.id, title: item.title},
            rootElem: tile
          }
        })

        var setupStartedAt = performance.now()
        setup(parsedResults, model, page, controller)
        if (performance.now() - setupStartedAt >= autoFillMainThreadBudgetMs
            && !(await yieldToMainThread())) return
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
        }
        var candidateSelfAdMs = Math.round(performance.now() - candidateSelfAdStarted)

        removePending(addedIds)

        // v13.3: 非表示中に▲▼を測定しない。カードを表示してから2フレーム待ち、
        // 追加カード全件のトグル位置を実DOM上で再確定する。
        await waitForPaint()
        if (page._disposed) return

        renderStoredSelfAdWarnings(addedIds, '自動追加カード表示後')

        var toggleAuditRows = await mapCooperatively(addedRoots,function(root) {
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
        if (!toggleAuditRows) return
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
        if (!selfAdRuleRequired() && model.config.selfAdWarningEnabled.value) {
          var warningOnlyIds = addedRoots.filter(function(r) {
            var movie = model.movies.get(r.movieId)
            return movie && movie.metadataSettled && !movie.ng
              && !r.elem.classList.contains('nrn-hide')
              && !r.elem.classList.contains('nrn-autofill-overflow')
          }).map(function(r) { return r.movieId })
          console.log(LOG, '自演広告警告を最終表示候補だけ非同期取得:', {
            phase:'自動追加候補',
            all:addedIds.length,
            visibleCandidates:warningOnlyIds.length,
            skippedNgOrOverflow:addedIds.length - warningOnlyIds.length
          })
          startSelfAdWarnings(warningOnlyIds, '自動追加候補 / 最終表示動画のみ')
        }

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
