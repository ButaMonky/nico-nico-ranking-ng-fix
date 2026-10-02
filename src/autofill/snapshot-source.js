
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

      var snapshotFetchOffset = async function(offset, diagnosticLane, signal) {
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
          _nrnKind:'snapshot',_nrnLane:diagnosticLane,signal:signal,
          method: 'GET',
          url: SNAPSHOT_ENDPOINT + '?' + p.toString(),
          timeout: 10000
        })
        if (page._disposed) return
        var networkDone = performance.now()

        if (res.status !== 200) throw new Error('Snapshot API HTTP ' + res.status)
        try {
          var json = JSON.parse(res.responseText)
          if (!json || !Array.isArray(json.data)) throw new Error('Snapshot APIの応答形式が不正です')
        } catch (error) { model.diagnostics?.validationFailure('snapshot',diagnosticLane,'invalid'); throw error }
        var data = json.data
        var rawTotal = json.meta && json.meta.totalCount
        var totalCount = rawTotal == null ? NaN : Number(rawTotal)

        var items = data.map(function(x, i) {
          return {
            id: x.contentId,
            title: x.title || x.contentId,
            description: x.description || '',
            duration: SearchItemAdapter.count(x.lengthSeconds),
            registeredAt: x.startTime || '',
            thumbnail: {listingUrl: x.thumbnailUrl || ''},
            count: {
              view: SearchItemAdapter.count(x.viewCounter),
              comment: SearchItemAdapter.count(x.commentCounter),
              mylist: SearchItemAdapter.count(x.mylistCounter),
              like: SearchItemAdapter.count(x.likeCounter)
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
      var validateSnapshotAgainstCurrentDom = async function(signal) {
        if (page._disposed) return
        if (!useSnapshot || snapshotValidated) return
        setPhase('validating-api', '現在ページと検索APIの並び順を照合中')

        var result = await snapshotFetchOffset(snapshotValidationOffset,undefined,signal)
        if (page._disposed || signal?.aborted) return
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
          candidateFilter.clear()
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
