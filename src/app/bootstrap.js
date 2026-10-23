    var domContentLoaded = async function() {
      try {
        const initialSourceUrl = initialDocumentUrl
        let initialOwners = OwnerEvidence.initialDocument(document)
        let initialSearchValues = SearchItemAdapter.valuesById(SearchItemAdapter.readDocument(document).items)
        const config = new Config(gmGetValue(), gmSetValue())
        await config.sync()
        if (typeof nrnSetConsoleConfig === 'function') nrnSetConsoleConfig(config)
        DetailUiTheme.apply(config, document, 'initial')
        DetailUiTheme.watch(config, document)
        addStyle(DetailUiTheme.CSS)
        addStyle(CardEnhancements.css)
        addStyle(HoverPreview.css)
        addStyle(CardActions.css)
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
          var model, ctrl
          dispose = function() {
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
            console.log('[NicoNicoRankingNG SPA]', 'Start NG checks', page._sourceUrl)
          } catch (e) { console.error(e); Diagnostics.problem('routeSetup'); stop() }
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
      // Native cards stay visible while metadata is pending; confirmed NG is
      // hidden by MovieViewMode as each result arrives.
      if (['interactive', 'complete'].includes(document.readyState)) {
        domContentLoaded();
      } else {
        document.addEventListener('DOMContentLoaded', domContentLoaded);
      }
    }
    return {main}
  })()
