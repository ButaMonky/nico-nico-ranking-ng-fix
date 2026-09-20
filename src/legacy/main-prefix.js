  var Main = (function() {
    var MAINTENANCE_MANIFEST = Object.freeze({
      version:NRN_VERSION,
      principles:[
        '既存NGデータ形式を壊さない',
        '動画カードDOMと横断的ポリシーを分離する',
        '新機能にはConsole診断を同時追加する',
        '処理中/非表示DOMをUI監査対象から除外する',
        'SPA遷移・自動継ぎ足し・詳細UIを独立して診断できるようにする'
      ],
      services:['Diagnostics','NewTabService'],
      compatibility:[
        'legacy NG stores',
        'advanced logical NG rules',
        'GetThumbInfo',
        'Snapshot fallback',
        'auto fill',
        'detail cache',
        'pager rewrite',
        'SPA navigation guard'
      ]
    })
    window.__nrnMaintenanceManifest = MAINTENANCE_MANIFEST
    Diagnostics.log('startup', '保守構成', MAINTENANCE_MANIFEST)

    var createMovieRoot = function(resultOfParsing, page, movieViewMode) {
      var movie = movieViewMode.movie
      var result = page.createMovieRoot(resultOfParsing)
      result._nrnOriginalAnchors = Array.from(result.elem.querySelectorAll('a[href]'), function(a) {
        return {node:a, target:a.getAttribute('target'), rel:a.getAttribute('rel')}
      })
      result.movieId = movie.id
      result.actionPane
        = new NicoPage.ActionPane(page.doc, movie).bindToMovie(movie)
      result.setMovieInfoToggleIfRequired()
      result.markMovieAnchor()
      result.id = movie.id
      result.title = movie.title
      result.bindToMovieViewMode(movieViewMode)
      result.bindToConfig(movieViewMode.config)
      result.bindToMovie(movie)
      CardEnhancements.attach(result, movie, page)
      return result
    }
    var createMovieRoots = function(resultsOfParsing, model, page, controller) {
      for (var r of resultsOfParsing) {
        var movie = model.movies.get(r.movie.id)
        var movieViewMode = model.movieViewModes.get(movie)
        var root = createMovieRoot(r, page, movieViewMode)
        root.movieTitle = new NicoPage.MovieTitle(root.titleElem).bindToMovie(movie)
        page.mapToggleTo(root)
        root.preventPageTransition(controller);
      }
    }
    var setup = function(resultsOfParsing, model, page, controller) {
      model.createMovies(resultsOfParsing)
      createMovieRoots(resultsOfParsing, model, page, controller)
    }
    var createMessageElem = function(doc, message) {
      var result = doc.createElement('p')
      result.textContent = message
      return result
    }
    function gmXmlHttpRequest() {
      if (typeof GM_xmlhttpRequest === 'undefined')
        return GM.xmlHttpRequest
      return GM_xmlhttpRequest
    }
    // Short-lived successful metadata only; NG decisions always use current settings.
    var recentDetails = new Map()
    var createThumbInfoRequester = function(movies, movieViewModes, diagnostics) {
      var disposed = false, scheduled = false
      var watched = new Set()
      var applyDetails = ThumbInfoListener.forCompleted(movies)
      var thumbInfo = new ThumbInfo(
          gmXmlHttpRequest(),
          movies.config.thumbInfoConcurrency.value, diagnostics)
        .on('completed', function(info) {
          recentDetails.delete(info.id)
          recentDetails.set(info.id, {info:info, at:Date.now()})
          if (recentDetails.size > 512) recentDetails.delete(recentDetails.keys().next().value)
          applyDetails(info)
        })
        .on('errorOccurred', ThumbInfoListener.forErrorOccurred(movies))
      var updateConcurrency = function(v) {
        thumbInfo.setConcurrent(v)
        console.log('[NicoNicoRankingNG ThumbInfo] 同時取得数を変更:', thumbInfo.concurrent)
      }
      movies.config.thumbInfoConcurrency.on('changed', updateConcurrency)
      var schedule = function() {
        if (disposed || scheduled) return
        scheduled = true
        queueMicrotask(function() { scheduled = false; if (!disposed) request() })
      }
      var settingsChanged = function() {
        if (disposed) return
        for (var movie of movies._idToMovie.values()) movie.metadataChanged()
        schedule()
      }
      for (var key of MetadataReadiness.settings) movies.config[key].on('changed',settingsChanged)
      var request = function(prefer) {
        if (disposed || !movies.config.useGetThumbInfo.value) return
        var allIds = movieViewModes.sort().map(function(m) { return m.movie.id })
        for (var id of allIds) {
          var movie = movies.get(id)
          if (!watched.has(movie)) {
            watched.add(movie)
            movie.on('metadataDemandChanged',schedule).on('metadataChanged',schedule)
          }
          var cached = recentDetails.get(id)
          if (cached && Date.now() - cached.at > 120000) { recentDetails.delete(id); cached = null }
          if (cached && !movies.get(id).thumbInfoDone) {
            applyDetails(cached.info)
            if (movie.thumbInfoDone) diagnostics?.cache(id,'recent')
          }
        }
        var pendingIds = allIds.filter(function(id) {
          var movie = movies.get(id)
          return movie && !movie.thumbInfoDone && !MetadataReadiness.ready(movie,movies.config)
        })
        thumbInfo.request(pendingIds, prefer)
      }
      request.dispose = function() {
        disposed = true
        thumbInfo.dispose()
        diagnostics?.close()
        movies.config.thumbInfoConcurrency.off('changed',updateConcurrency)
        for (var key of MetadataReadiness.settings) movies.config[key].off('changed',settingsChanged)
        for (var movie of watched) {
          movie.off('metadataDemandChanged',schedule)
          movie.off('metadataChanged',schedule)
        }
        watched.clear()
      }
      diagnostics?.bind(movies,thumbInfo)
      return request
    }
    var getThumbInfoRequester = function(movies, movieViewModes, diagnostics) {
      return createThumbInfoRequester(movies, movieViewModes, diagnostics)
    }
    var createModel = function(config) {
      var movies = new Movies(config)
      var diagnostics = Diagnostics.start(config,location.pathname)
      config._nrnRulePreviewMovies = () => Array.from(movies._idToMovie.values()).slice(0,100)
      var applySearchOwner = ThumbInfoListener.forSearch(movies)
      var movieViewModes = new MovieViewModes(config)
      var requestThumbInfo = getThumbInfoRequester(movies, movieViewModes, diagnostics)
      return {
        diagnostics,
        config,
        movies,
        movieViewModes,
        requestThumbInfo,
        refreshSearchOwners(rows) {
          for (const row of rows) applySearchOwner(row.movie.id, OwnerEvidence.fromRow(row))
        },
        createMovies(resultsOfParsing) {
          movies.setIfAbsent(resultsOfParsing.map(function(r) {
            return new Movie(r.movie.id, r.movie.title)
          }))
          for (var row of resultsOfParsing) {
            applySearchOwner(row.movie.id, OwnerEvidence.fromRow(row))
            var count = Number(row.rootElem.dataset.nrnPageContributorCount)
            if (Number.isFinite(count) && count > 0) movies.get(row.movie.id).setPageContributorCount(count)
          }
        },
      }
    }
    var createView = function(page, controller) {
      var configBar = page.createConfigBar()
      return {
        page,
        addConfigBar() {
          page.addConfigBar(configBar)
        },
        _bindToConfig(config) {
          page.bindToConfig(config)
          configBar.bindToConfig(config)
        },
        bindToModel(model) {
          this._bindToConfig(model.config)
        },
        bindToWindow() {
        },
        setup(model, targetElem) {
          setup(page.parse(targetElem), model, page, controller)
        },
        setupAndRequestThumbInfo(model, targetElem) {
          this.setup(model, targetElem)
          model.requestThumbInfo()
        },
        observeMutation(model) {
          page.observeMutation(function(resultOfParsing, prefer) {
            setup(resultOfParsing, model, page, controller)
            model.requestThumbInfo(prefer)
          }, function(rows) {
            for (const row of rows) {
              const root = page.movieRoots.find(root => root.elem === row.rootElem && root.movieId === row.movie.id)
              if (!root || root._disposed) continue
              model.refreshSearchOwners([row])
              root._refreshOwnerPresentation?.()
            }
          })
        },
      }
    }
    function addStyle(style) {
      const e = document.createElement('style');
      e.textContent = style;
      document.head.appendChild(e);
    }
    function gmGetValue() {
      if (typeof GM_getValue === 'undefined')
        return GM.getValue
      return GM_getValue
    }
    function gmSetValue() {
      if (typeof GM_setValue === 'undefined')
        return GM.setValue
      return GM_setValue
    }
    var ensureStatusBadge = function(doc) {
      var badge = doc.getElementById('nrn-status-badge')
      if (badge) return badge

      if (!doc.getElementById('nrn-status-badge-style')) {
        var style = doc.createElement('style')
        style.id = 'nrn-status-badge-style'
        style.textContent = [
          '@keyframes nrn-status-spin { to { transform: rotate(360deg); } }',
          '@keyframes nrn-status-pulse { 0%,100% { box-shadow:0 2px 10px rgba(0,0,0,.35),0 0 0 0 rgba(255,255,255,.10); } 50% { box-shadow:0 2px 14px rgba(0,0,0,.45),0 0 0 5px rgba(255,255,255,.04); } }',
          '#nrn-status-badge.nrn-status-busy { animation:nrn-status-pulse 1.6s ease-in-out infinite; padding-left:30px !important; }',
          '#nrn-status-badge.nrn-status-busy::before { content:""; position:absolute; left:10px; top:12px; width:10px; height:10px; border:2px solid rgba(255,255,255,.28); border-top-color:#fff; border-radius:50%; animation:nrn-status-spin .75s linear infinite; }',
          '@media (prefers-reduced-motion: reduce) { #nrn-status-badge.nrn-status-busy, #nrn-status-badge.nrn-status-busy::before { animation:none !important; } }'
        ].join('\n')
        ;(doc.head || doc.documentElement).appendChild(style)
      }

      badge = doc.createElement('div')
      badge.id = 'nrn-status-badge'
      badge.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;background:rgba(28,32,37,0.94);color:#dbe1e8;font-size:12px;padding:8px 10px;border-radius:6px;line-height:1.7;pointer-events:auto;user-select:text;-webkit-user-select:text;cursor:text;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;max-width:min(460px,45vw);max-height:45vh;overflow:auto;box-shadow:0 2px 10px rgba(0,0,0,.35);'
      doc.body.appendChild(badge)
      return badge
    }
    // ------------------------------------------------------------------
    // v9 AutoFill subsystem
    //
    // 旧スクリプトのNGモデル/保存形式は維持し、自動継ぎ足しだけを
    // Source / Status / Ad / Controller 相当に役割分離している。
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // v13.4 AutoFill subsystem
    // - API候補プールを保持し、必要な分だけ詳細NG判定
    // - 起動設定/取得候補/順序一致/NG理由/採用結果をConsoleへ出力
    // - Snapshot APIと現在DOMの並びが大きく異なる場合は従来方式へfallback
    // ------------------------------------------------------------------
