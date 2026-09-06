    var domContentLoaded = async function() {
      try {
        const page = getPage();
        addStyle(page.css)
        addStyle(DetailUiTheme.CSS)
        const config = new Config(gmGetValue(), gmSetValue())
        await config.sync()
        DetailUiTheme.apply(config, page.doc, 'initial')
        DetailUiTheme.watch(config, page.doc)
        config.detailUiTheme.on('changed', function(v) {
          DetailUiTheme.apply(config, page.doc, 'setting-changed:' + v)
        })
        var model = createModel(config)
        const ctrl = new Controller(model.config, page)
        ctrl.addListenersTo(page.doc.body)

        // Cross-cutting runtime policies are installed once here.
        // Individual card classes only expose data/UI; services own global behavior.
        NewTabService.install(model.config, page.doc)
        Diagnostics.log('startup', '主要ランタイムサービスを初期化', {
          version:'14.0',
          architecture:'runtime-services-v1 (Diagnostics / NewTabService / existing domain modules)',
          newTab:model.config.openNewWindow.value,
          developer:model.config.developerMode.value,
          autoFill:model.config.autoFillEnabled.value
        })

        var view = createView(page, ctrl)
        view.addConfigBar()
        view.bindToModel(model)
        view.bindToWindow()
        view.setupAndRequestThumbInfo(model)
        view.observeMutation(model)
        setupAutoFill(model, page, ctrl)

        if (typeof window.__nrnConfigureSpaNavigationGuard === 'function') {
          window.__nrnConfigureSpaNavigationGuard({
            enabled: model.config.spaNavigationFix.value,
            developer: model.config.developerMode.value
          })
        }

        model.config.spaNavigationFix.on('changed', function(v) {
          console.log('[NicoNicoRankingNG route v14.1] SPA再検索設定変更:', v)
          if (typeof window.__nrnConfigureSpaNavigationGuard === 'function') {
            window.__nrnConfigureSpaNavigationGuard({
              enabled: v,
              developer: model.config.developerMode.value
            })
          }
        })

        model.config.developerMode.on('changed', function(v) {
          if (typeof window.__nrnConfigureSpaNavigationGuard === 'function') {
            window.__nrnConfigureSpaNavigationGuard({
              enabled: model.config.spaNavigationFix.value,
              developer: v
            })
          }
        })

        if (!model.config.useGetThumbInfo.value) {
          removePendingMovieInvisibleStyle();
        }
      } catch (e) {
        console.error(e)
        removePendingMovieInvisibleStyle();
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
    const createPendingMoviesInvisibleStyle = css => {
      const result = document.createElement('style');
      result.id = 'nrn-pending-movies-hide-style';
      result.textContent = css;
      return result;
    };
    const addPendingMoviesInvisibleStyle = css => {
      if (!document.head) {
        new MutationObserver((recs, observer) => {
          if (!document.head) return;
          document.head.appendChild(createPendingMoviesInvisibleStyle(css));
          observer.disconnect();
        }).observe(document, {childList: true, subtree: true});
      } else {
        document.head.appendChild(createPendingMoviesInvisibleStyle(css));
      }
    };
    const removePendingMovieInvisibleStyle = () => {
      document.getElementById('nrn-pending-movies-hide-style')?.remove();
    };
    const setPendingMoviesInvisible = () => {
      let css = ListPage.pendingMoviesInvisibleCss();
      if (SearchPage.is(location)) css += SearchPage.pendingMoviesInvisibleCss();
      addPendingMoviesInvisibleStyle(css);
    };
    var main = function() {
      setupSpaNavigationGuard()
      setPendingMoviesInvisible();
      if (['interactive', 'complete'].includes(document.readyState)) {
        domContentLoaded();
      } else {
        document.addEventListener('DOMContentLoaded', domContentLoaded);
      }
    }
    return {main}
  })()

