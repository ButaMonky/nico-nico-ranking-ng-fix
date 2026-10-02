

      // -------------------- CandidateSource / pool --------------------
      var fetchMoreCandidates = async function(minNeeded, signal) {
        if (page._disposed || signal?.aborted) return
        var fetchStart = performance.now()
        var issuedThisCall = 0
        var sourceWindowLimit = 8
        var mayRequest = function() {
          var limit = Number(model.config.autoFillMaxExtraPages.value) || 0
          return !page._disposed && !signal?.aborted && issuedThisCall < sourceWindowLimit
            && model.config.autoFillEnabled.value && (limit <= 0 || fetchedExtraPages < limit)
        }

        if (useSnapshot) {
          if (!snapshotValidated) await validateSnapshotAgainstCurrentDom(signal)
          if (page._disposed || signal?.aborted) return
          if (!useSnapshot) return fetchMoreCandidates(minNeeded,signal)

          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            if (!mayRequest()) break
            issuedThisCall++
            var result = await snapshotFetchOffset(snapshotOffset,undefined,signal)
            if (page._disposed || signal?.aborted) return
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

            var cheap = candidateFilter.partition(fresh)
            totalCheapPrefilteredNg += cheap.rejected
            fresh = cheap.passed
            logCandidateTable('API取得 offset=' + result.offset, fresh)
            fresh.forEach(function(item) { candidatePool.push(item) })

            if (!result.items.length) break
          }
        } else {
          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            if (!mayRequest()) break
            var pageNumber = nextPageToFetch

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
              issuedThisCall++
              result = await page.fetchPageItems(pageNumber, {
                scope: 'RUN', signal:signal,
                requestId: 'RUN-autofill-p' + pageNumber
              })
              if (page._disposed || signal?.aborted) return
            } catch (e) {
              if (page._disposed || signal?.aborted) return
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

            if (!result || !Array.isArray(result.items)) throw new Error('取得ページの動画一覧が不正です')
            nextPageToFetch = pageNumber + 1
            fetchedExtraPages++
            fetchedPageNumbers.add(pageNumber)

            var resultMaxPage = Number(result.maxPage)
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
            var cheap = candidateFilter.partition(filtered.freshItems)
            totalCheapPrefilteredNg += cheap.rejected
            logCandidateTable('ページ ' + pageNumber + ' 候補', cheap.passed)
            cheap.passed.forEach(function(item) { candidatePool.push(item) })

            if (!items.length) break
          }
        }

        return performance.now() - fetchStart
      }
