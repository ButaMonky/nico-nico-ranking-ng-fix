
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
            var snapshot = await snapshotFetchOffset(0,'diagnostic')
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
          if (sourceAudit) model.diagnostics?.comparison(sourceAudit)
          model.diagnostics?.audit({duplicateCards:domAudit.duplicateCardCount,modelWarnings:domAudit.mismatchWarningCount,
            ownerNgMismatches:userAudit.mismatches.length,invalidNgIds:userAudit.invalidCount})
          Diagnostics.publish('audit')
          console.log(LOG, '開発者診断総合判定:', verdicts.length ? verdicts : ['✓ 重大な整合性問題は検出されませんでした'])
          console.log(LOG, '診断所要時間:', Math.round(performance.now() - developerSuiteLastRunAt) + 'ms')
          console.log(LOG, '===== 開発者モード一括診断 END =====')
        } catch (e) {
          if (page._disposed) return
          developerSuiteStatus = '診断エラー'
          console.error(LOG, '開発者診断中にエラー:', e)
          Diagnostics.problem('developerAudit')
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
