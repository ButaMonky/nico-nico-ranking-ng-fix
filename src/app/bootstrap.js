    var domContentLoaded = async function() {
      try {
        const initialSourceUrl = initialDocumentUrl
        let initialOwners = OwnerEvidence.initialDocument(document)
        const initialSearchItems = SearchItemAdapter.readDocument(document).items
        let initialSearchValues = SearchItemAdapter.valuesById(initialSearchItems)
        // BRUSH-064: only the first document of a search/tag route carries
        // server-response; SPA-entered routes are not checked.
        let initialPageData = SearchPage.is(location) ? {checked:true, items:initialSearchItems.length} : null
        const config = new Config(gmGetValue(), gmSetValue())
        await config.sync()
        if (typeof nrnSetConsoleConfig === 'function') nrnSetConsoleConfig(config)
        DetailUiTheme.apply(config, document, 'initial')
        DetailUiTheme.watch(config, document)
        addStyle(DetailUiTheme.CSS)
        addStyle(CardEnhancements.css)
        addStyle(HoverPreview.css)
        addStyle(CardActions.css)
        addStyle(SiteHealth.CSS)
        var verdictCache = NgVerdictCache.attach(config, gmGetValue(), gmSetValue(), document)
        config.detailUiTheme.on('changed', function(v) {
          DetailUiTheme.apply(config, document, 'setting-changed:' + v)
        })
        NewTabService.install(config, document)
        var dispose = function() {}
        var pageStyle = null
        var stop = function() { dispose(); dispose = function() {} }
        var start = function() {
          stop()
          if (!(ListPage.is(location) || SearchPage.is(location))) return
          const page = getPage()
          page._sourceUrl = location.href
          pageStyle?.remove()
          pageStyle = document.createElement('style')
          pageStyle.textContent = page.css
          document.head.appendChild(pageStyle)
          // Capture the persistent listeners before binding this route's models.
          const subscriptions = Object.values(config).filter(store => store?._eventNameToListeners)
            .map(store => [store, new Map(Array.from(store._eventNameToListeners,
              ([name, listeners]) => [name, new Set(listeners)]))])
          var model, ctrl, verdictTrackers = [], cancelHealth = null
          dispose = function() {
            cancelHealth?.()
            for (const untrack of verdictTrackers) untrack()
            verdictTrackers.length = 0
            page._disposed = true
            page._hoverPreview?.dispose()
            page._cardActions?.dispose()
            page._disposeAutoFill?.()
            model?.requestThumbInfo.dispose?.()
            ctrl?.dispose()
            page.dispose()
            for (const [store, before] of subscriptions) {
              for (const [name, listeners] of store._eventNameToListeners) {
                for (const listener of listeners) if (!before.get(name)?.has(listener)) store.off(name, listener)
              }
            }
          }
          try {
            model = createModel(config)
            model.initialOwners = initialSourceUrl === location.href ? initialOwners : null
            model.initialSearchValues = initialSourceUrl === location.href ? initialSearchValues : null
            initialOwners = null
            initialSearchValues = null
            // BRUSH-060: learn/forget NG verdicts as each new movie settles.
            const createMovies = model.createMovies
            model.createMovies = function(rows) {
              const known = new Set(model.movies._idToMovie.keys())
              const result = createMovies.apply(this, arguments)
              if (verdictCache.enabled()) for (const row of rows) {
                const id = row.movie.id, movie = model.movies.get(id)
                if (movie && !known.has(id)) { known.add(id); verdictTrackers.push(NgVerdictCache.track(movie, config, document)) }
              }
              return result
            }
            page._diagnostics = model.diagnostics
            page._ownerNames = model.ownerNames
            page._cardActions = CardActions.create(page,config)
            page._hoverPreview = HoverPreview.create(page,config)
            model.diagnostics.bindPreview?.(()=>page._hoverPreview.snapshot())
            ctrl = new Controller(config, page)
            ctrl.addListenersTo(page.doc.body)
            const view = createView(page, ctrl)
            view.addConfigBar()
            view.bindToModel(model)
            view.bindToWindow()
            view.setup(model)
            view.observeMutation(model)
            setupAutoFill(model, page, ctrl)
            model.requestThumbInfo()
            cancelHealth = SiteHealth.schedule(document, page, {
              enabled: () => config.siteHealthNoticeEnabled.value,
              initialPageData: initialSourceUrl === location.href ? initialPageData : null,
            })
            initialPageData = null
            console.log('[NicoNicoRankingNG SPA]', 'Start NG checks', page._sourceUrl)
          } catch (e) {
            console.error(e); Diagnostics.problem('routeSetup'); stop()
            if (config.siteHealthNoticeEnabled.value) {
              const input = SiteHealth.collect(document, null)
              SiteHealth.showNotice(document, input, SiteHealth.evaluate(input))
            }
          }
        }
        const configure = function() {
          window.__nrnConfigureSpaNavigationGuard?.({enabled:config.spaNavigationFix.value, start, stop})
        }
        config.spaNavigationFix.on('changed', configure)
        start()
        configure()
      } catch (e) {
        console.error(e)
        Diagnostics.problem('startup')
        try {
          addStyle(SiteHealth.CSS)
          const input = SiteHealth.collect(document, null)
          SiteHealth.showNotice(document, input, SiteHealth.evaluate(input))
        } catch (ignored) {}
      }
    }
    var getPage = function() {
      // NicoNico の /tag/ /search/ には旧UIと現行UIが混在する。
      // URLや .BaseLayout の有無だけでは判定できないため、
      // 実際の動画カードDOMで判定する。
      var hasModernVideoCards = Boolean(
        document.querySelector('[data-decoration-video-id]')
      )
      var hasLegacySearchCards = Boolean(
        document.querySelector('.itemTitle, .videoList01Wrap, .videoList02Wrap, [data-video-id]')
      )

      if (SearchPage.is(document.location) && hasLegacySearchCards && !hasModernVideoCards) {
        console.log('[NicoNicoRankingNG] 旧検索UIを検出: SearchPage')
        return new SearchPage(document)
      }

      console.log('[NicoNicoRankingNG] 現行UIを検出: ListPage')
      return new ListPage(document)
    }
    var main = function() {
      setupSpaNavigationGuard()
      // BRUSH-060: GM_getValue is synchronous, so cached NG cards can be
      // hidden as they are inserted, before the first paint. GM.getValue
      // (async only) managers skip this and still use the normal pipeline.
      if (typeof GM_getValue === 'function') NgVerdictCache.installEarly(GM_getValue, document)
      // Native cards stay visible while metadata is pending; confirmed NG is
      // hidden by MovieViewMode as each result arrives.
      // BRUSH-062: search, tag, ranking and watch are one React Router app
      // (nvpc_next), so e.g. a tag link on a watch page reaches /tag/ without a
      // reload. The script therefore loads on every www.nicovideo.jp page but
      // stays idle elsewhere: no settings, styles or link changes until the
      // first supported route, then the normal startup runs once.
      var supported = function() { return ListPage.is(location) || SearchPage.is(location) }
      var whenReady = function(fn) {
        if (['interactive', 'complete'].includes(document.readyState)) fn()
        else document.addEventListener('DOMContentLoaded', fn, {once:true})
      }
      if (supported()) { whenReady(domContentLoaded); return }
      var activated = false, poll = null
      var activate = function() {
        if (activated || !supported()) return
        activated = true
        clearInterval(poll)
        window.removeEventListener('popstate', activate)
        console.log('[NicoNicoRankingNG SPA]', '対象画面へ移動したため起動します', location.pathname)
        whenReady(domContentLoaded)
      }
      ;['pushState', 'replaceState'].forEach(function(name) {
        var original = history[name]
        history[name] = function() {
          var result = original.apply(this, arguments)
          // Run after the router's own synchronous work for this navigation.
          if (!activated) Promise.resolve().then(activate)
          return result
        }
      })
      window.addEventListener('popstate', activate)
      // Covers routers that update the URL without calling these methods.
      poll = setInterval(activate, 500)
    }
    return {main}
  })()
