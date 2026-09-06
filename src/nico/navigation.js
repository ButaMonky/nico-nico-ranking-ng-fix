    var setupSpaNavigationGuard = function() {
      if (window.__nrnSpaNavigationGuardInstalled) return
      window.__nrnSpaNavigationGuardInstalled = true

      var LOG = '[NicoNicoRankingNG route v14.1]'
      var enabled = true
      var developer = false
      var armed = false
      var lastHref = location.href
      var reloadScheduled = false
      var routeSequence = 0
      var pollTimer = null

      var toUrl = function(value) {
        try { return new URL(value, location.href) }
        catch (e) { return null }
      }

      var routeKey = function(value) {
        var u = toUrl(value)
        if (!u) return ''
        // hashだけの変更は検索条件変更ではない。
        return u.origin + u.pathname + u.search
      }

      var isSearchRoute = function(value) {
        var u = toUrl(value)
        return Boolean(u
          && u.origin === location.origin
          && /^\/(?:tag|search)\//.test(u.pathname))
      }

      var scheduleReload = function(source, fromHref, toHref) {
        var fromKey = routeKey(fromHref)
        var toKey = routeKey(toHref)

        lastHref = toHref
        if (!armed || !enabled) {
          if (developer && fromKey !== toKey) {
            console.log(LOG, 'URL変更を検出（修正OFF/未準備）:', {
              source: source, from: fromHref, to: toHref
            })
          }
          return
        }
        if (!toKey || fromKey === toKey) return
        if (!isSearchRoute(toHref)) return
        if (reloadScheduled) return

        reloadScheduled = true
        routeSequence++

        console.warn(LOG, 'SPA検索遷移を検出。新しい検索結果で再初期化します:', {
          sequence: routeSequence,
          source: source,
          from: fromHref,
          to: toHref,
          action: 'location.reload()'
        })

        // Reactがhistory更新を終えた後、現在の新URLを保持してreload。
        setTimeout(function() {
          var currentKey = routeKey(location.href)
          if (currentKey !== toKey) {
            // 短時間にさらに別URLへ移動した場合は最終URLを優先。
            console.log(LOG, 'reload直前にURLがさらに変化:', {
              expected: toHref,
              current: location.href
            })
          }
          location.reload()
        }, 120)
      }

      var observeAfterHistory = function(source, beforeHref) {
        var afterHref = location.href
        if (routeKey(beforeHref) !== routeKey(afterHref)) {
          scheduleReload(source, beforeHref, afterHref)
        } else {
          lastHref = afterHref
        }
      }

      ;['pushState', 'replaceState'].forEach(function(methodName) {
        var original = history[methodName]
        if (typeof original !== 'function') return

        history[methodName] = function() {
          var beforeHref = location.href
          var result = original.apply(this, arguments)
          observeAfterHistory('history.' + methodName, beforeHref)
          return result
        }
      })

      window.addEventListener('popstate', function() {
        var beforeHref = lastHref
        setTimeout(function() {
          observeAfterHistory('popstate', beforeHref)
        }, 0)
      })

      // 開発者モードでは、押した検索系リンクそのものも記録する。
      document.addEventListener('click', function(e) {
        if (!developer) return
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
        if (!a) return
        var u = toUrl(a.href)
        if (!u || !isSearchRoute(u.href)) return
        console.log(LOG, '検索系リンククリック:', {
          text: String(a.textContent || '').trim().slice(0, 100),
          href: u.href,
          current: location.href,
          modifiedClick: Boolean(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey),
          target: a.target || ''
        })
      }, true)

      // History APIを経由しない将来の実装変更にも備える保険。
      pollTimer = setInterval(function() {
        if (reloadScheduled) return
        if (routeKey(lastHref) !== routeKey(location.href)) {
          scheduleReload('url-poll', lastHref, location.href)
        }
      }, 250)

      window.__nrnConfigureSpaNavigationGuard = function(opts) {
        opts = opts || {}
        enabled = opts.enabled !== false
        developer = Boolean(opts.developer)
        lastHref = location.href
        armed = true

        console.log(LOG, 'SPA遷移監視を開始:', {
          enabled: enabled,
          developer: developer,
          current: lastHref
        })
      }

      console.log(LOG, 'SPA遷移監視フックを設置しました')
    }

