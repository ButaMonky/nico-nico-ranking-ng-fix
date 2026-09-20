  var ListPage = (function(_super) {

    const wrapTitleTextNodeInElement = parentOfTitleTextNode => {
      const e = document.createElement('span');
      e.classList.add('nrn-movie-title');
      if (!parentOfTitleTextNode) return e;
      const s = parentOfTitleTextNode.querySelector('span');
      if (s) {
        // 有料動画、プレミアム限定動画のタイトルの先頭にタグがつくので、それに対する場合分け
        e.textContent = parentOfTitleTextNode.lastChild?.textContent ?? '';
        parentOfTitleTextNode.replaceChildren(s, e);
      } else {
        e.textContent = parentOfTitleTextNode.textContent;
        parentOfTitleTextNode.replaceChildren(e);
      }
      return e;
    };

    const formatSecondsAsDuration = seconds => {
      seconds = Math.max(0, Math.trunc(seconds || 0));
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + ':' + (s < 10 ? '0' + s : s);
    };

    const formatRelativeOrDate = isoString => {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMin < 60) return Math.max(diffMin, 0) + '分前';
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return diffHour + '時間前';
      return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
    };

    const VIEW_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" class="w_font h_font"><path fill-rule="evenodd" d="M35.18 16.92 8.01 2.94C5.56 1.68 2.5 3.26 2.5 5.78v27.96c0 2.52 3.06 4.1 5.51 2.84L35.18 22.6c2.45-1.26 2.45-4.42 0-5.68" clip-rule="evenodd"></path></svg>';
    const COMMENT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" class="w_font h_font"><path fill-rule="evenodd" d="M5.38 1.67A2.9 2.9 0 0 0 2.5 4.53v20.65c0 1.58 1.3 2.87 2.88 2.87h5.75v9.31c0 1.58 1 2.04 2.2 1.03l10.75-10.34h10.06a2.9 2.9 0 0 0 2.88-2.87V4.53c0-1.57-1.3-2.86-2.88-2.86z" clip-rule="evenodd"></path></svg>';
    const NICOAD_RIBBON = {
      gold: "data:image/svg+xml,%3csvg%20width='50'%20height='50'%20viewBox='0%200%2050%2050'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M48.9979%200H3.00073H1.00024C0.448108%200%200%200.448108%200%201.00024V3.00073V48.9979C0%2049.8911%201.08126%2050.3362%201.71041%2049.702L3.7109%2047.6855C3.89694%2047.4975%204.00097%2047.2444%204.00097%2046.9814V40.0097L40.0097%204.00097H46.9814C47.2454%204.00097%2047.4985%203.89694%2047.6855%203.7109L49.702%201.71041C50.3362%201.08126%2049.8911%200%2048.9979%200Z'%20fill='%23FFD700'/%3e%3cg%20clip-path='url(%23clip0_597_346)'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M10.6963%205.59039C11.2495%205.04209%2012.4718%205.27496%2013.9554%206.08324L13.7742%207.09236C13.0017%206.72641%2012.4028%206.64263%2012.1231%206.92109C11.4725%207.57042%2012.7897%209.93858%2015.0717%2012.2119C17.3524%2014.4839%2019.7293%2015.8011%2020.3811%2015.1505C20.662%2014.8794%2020.5758%2014.2745%2020.2086%2013.5044L21.2141%2013.3245C22.0261%2014.8055%2022.2602%2016.0204%2021.7106%2016.5699C21.5862%2016.687%2021.4321%2016.7695%2021.2658%2016.8102L21.267%2016.8127L9.91263%2019.8486L9.34337%2021.9679C9.32858%2022.032%209.29654%2022.0911%209.24972%2022.1392C8.86405%2022.515%207.63435%2021.9051%206.4909%2020.7641C5.34745%2019.6219%204.7326%2018.3935%205.11211%2018.014C5.16016%2017.9684%205.21931%2017.9364%205.28461%2017.9216L7.4101%2017.3536L10.4499%206.03395C10.4917%205.86638%2010.5768%205.7136%2010.6963%205.59039ZM21.558%2010.6172C21.8389%2010.5421%2022.1272%2010.7084%2022.2024%2010.9881L22.2319%2011.099C22.3071%2011.3787%2022.1408%2011.6658%2021.8598%2011.7409L18.1757%2012.7254C17.8947%2012.8006%2017.6076%2012.6342%2017.5312%2012.3546L17.5017%2012.2437C17.4265%2011.964%2017.5928%2011.6769%2017.8738%2011.6017L21.558%2010.6172ZM19.2388%207.22949C19.4445%207.02496%2019.7772%207.02496%2019.983%207.22949L20.0643%207.31205C20.2701%207.51658%2020.2701%207.84802%2020.0643%208.05256L16.9556%2011.1526C16.7498%2011.3571%2016.4171%2011.3571%2016.2113%2011.1526L16.13%2011.0713C15.9242%2010.8655%2015.9242%2010.5341%2016.13%2010.3295L19.2388%207.22949ZM16.0671%205.00177L16.1607%205.01806L16.2728%205.04763C16.5538%205.12279%2016.7201%205.41111%2016.6449%205.6908L15.6567%209.36256C15.5828%209.64226%2015.2932%209.80859%2015.0135%209.73343L14.9014%209.70386C14.6205%209.6287%2014.4541%209.34162%2014.5293%209.06192L15.5175%205.38893C15.5927%205.10924%2015.8798%204.9429%2016.1607%205.01806L16.0671%205.00177Z'%20fill='%23DCA000'/%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_597_346'%3e%3crect%20width='18'%20height='18'%20fill='white'%20transform='translate(5%205)'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e",
      silver: "data:image/svg+xml,%3csvg%20width='50'%20height='50'%20viewBox='0%200%2050%2050'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M48.9979%200H3.00073H1.00024C0.448108%200%200%200.448108%200%201.00024V3.00073V48.9979C0%2049.8911%201.08126%2050.3362%201.71041%2049.702L3.7109%2047.6855C3.89694%2047.4975%204.00097%2047.2444%204.00097%2046.9814V40.0097L40.0097%204.00097H46.9814C47.2454%204.00097%2047.4985%203.89694%2047.6855%203.7109L49.702%201.71041C50.3362%201.08126%2049.8911%200%2048.9979%200Z'%20fill='%23BEC8C8'/%3e%3cg%20clip-path='url(%23clip0_597_345)'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M10.6963%205.59039C11.2495%205.04209%2012.4718%205.27496%2013.9554%206.08324L13.7742%207.09236C13.0017%206.72641%2012.4028%206.64263%2012.1231%206.92109C11.4725%207.57042%2012.7897%209.93858%2015.0717%2012.2119C17.3524%2014.4839%2019.7293%2015.8011%2020.3811%2015.1505C20.662%2014.8794%2020.5758%2014.2745%2020.2086%2013.5044L21.2141%2013.3245C22.0261%2014.8055%2022.2602%2016.0204%2021.7106%2016.5699C21.5862%2016.687%2021.4321%2016.7695%2021.2658%2016.8102L21.267%2016.8127L9.91263%2019.8486L9.34337%2021.9679C9.32858%2022.032%209.29654%2022.0911%209.24972%2022.1392C8.86405%2022.515%207.63435%2021.9051%206.4909%2020.7641C5.34745%2019.6219%204.7326%2018.3935%205.11211%2018.014C5.16016%2017.9684%205.21931%2017.9364%205.28461%2017.9216L7.4101%2017.3536L10.4499%206.03395C10.4917%205.86638%2010.5768%205.7136%2010.6963%205.59039ZM21.558%2010.6172C21.8389%2010.5421%2022.1272%2010.7084%2022.2024%2010.9881L22.2319%2011.099C22.3071%2011.3787%2022.1408%2011.6658%2021.8598%2011.7409L18.1757%2012.7254C17.8947%2012.8006%2017.6076%2012.6342%2017.5312%2012.3546L17.5017%2012.2437C17.4265%2011.964%2017.5928%2011.6769%2017.8738%2011.6017L21.558%2010.6172ZM19.2388%207.22949C19.4445%207.02496%2019.7772%207.02496%2019.983%207.22949L20.0643%207.31205C20.2701%207.51658%2020.2701%207.84802%2020.0643%208.05256L16.9556%2011.1526C16.7498%2011.3571%2016.4171%2011.3571%2016.2113%2011.1526L16.13%2011.0713C15.9242%2010.8655%2015.9242%2010.5341%2016.13%2010.3295L19.2388%207.22949ZM16.0671%205.00177L16.1607%205.01806L16.2728%205.04763C16.5538%205.12279%2016.7201%205.41111%2016.6449%205.6908L15.6567%209.36256C15.5828%209.64226%2015.2932%209.80859%2015.0135%209.73343L14.9014%209.70386C14.6205%209.6287%2014.4541%209.34162%2014.5293%209.06192L15.5175%205.38893C15.5927%205.10924%2015.8798%204.9429%2016.1607%205.01806L16.0671%205.00177Z'%20fill='%23889C9C'/%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_597_345'%3e%3crect%20width='18'%20height='18'%20fill='white'%20transform='translate(5%205)'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e"
    };
    const NICOAD_POINT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="w_font h_font"><path fill-rule="evenodd" d="M8.6 2.68c.65-.63 2.06-.36 3.78.58l-.2 1.17c-.9-.43-1.6-.53-1.92-.2-.76.75.77 3.5 3.42 6.13 2.64 2.64 5.4 4.16 6.15 3.4.33-.3.23-1-.2-1.9l1.17-.2c.94 1.7 1.21 3.12.57 3.75q-.22.21-.51.28L7.7 19.23l-.66 2.45a.4.4 0 0 1-.11.2c-.45.44-1.88-.27-3.2-1.6-1.33-1.32-2.04-2.74-1.6-3.18a.4.4 0 0 1 .2-.1l2.46-.67L8.32 3.2q.08-.3.28-.52m12.6 5.83c.32-.08.66.1.74.43l.04.13a.6.6 0 0 1-.43.75l-4.27 1.14a.6.6 0 0 1-.75-.43l-.04-.13a.6.6 0 0 1 .44-.75zm-2.7-3.93a.6.6 0 0 1 .87 0l.1.1a.6.6 0 0 1 0 .86l-3.6 3.6a.6.6 0 0 1-.87 0l-.1-.1a.6.6 0 0 1 0-.86zM14.84 2l.11.02.13.04a.6.6 0 0 1 .43.74l-1.14 4.26a.6.6 0 0 1-.75.43l-.13-.04a.6.6 0 0 1-.43-.74l1.14-4.26a.6.6 0 0 1 .75-.43z" clip-rule="evenodd"></path></svg>';

    var MovieRoot = (function(_super) {
      var MovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-parsed');
      }
      MovieRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          let e = this.elem.querySelector('.nrn-movie-title');
          if (!e) {
            const a = this.elem.querySelector('div:not(.pos_relative) > a[data-anchor-area][href^="/watch/"]');
            e = wrapTitleTextNodeInElement(a);
          }
          return e;
        },
        get _movieAnchorSelectors() {
          // 投稿者やタグへのリンクではなく、動画ページへのリンクだけを対象にする。
          return [
            'a[href^="/watch/"]',
            'a[href^="https://www.nicovideo.jp/watch/"]'
          ];
        },
        set actionPane(actionPane) {
          this._actionPane = actionPane;
          this.elem.appendChild(actionPane.elem);
        },
        _addMovieInfo() {
          this.movieInfo.elem.dataset.nrnLayout = 'reserved-below-card'
          this.elem.appendChild(this.movieInfo.elem)
        },
        _addMovieInfoToggle() {
          if (!this.movieInfo.toggle.parentNode) this.elem.appendChild(this.movieInfo.toggle)
          this._scheduleMovieInfoTogglePin()
        },
        bindToConfig(config) {
          _super.prototype.bindToConfig.call(this,config)
          this.movieInfoTogglable = config.movieInfoTogglable.value
          config.movieInfoTogglable.on('changed',set(this,'movieInfoTogglable'))
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this);
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle);
          }
          this._scheduleMovieInfoTogglePin()
        },
        preventPageTransition(controller) {
          const f = e => {
            e.preventDefault();
            e.stopPropagation();
            const link = e.target.closest('.nrn-movie-tag-link, a.nrn-contributor-link')
            if (link) {
              NewTabService.open(link.href)
            } else {
              controller._clicked(e)
            }
          };
          this.movieInfo.elem.addEventListener('click', f);
          this.movieInfo.toggle.addEventListener('click', f);
          this._actionPane?.elem.addEventListener('click', f);
        },
      })
      return MovieRoot
    })(_super.MovieRoot)

    const AdsRoot = (function(_super) {
      const AdsRoot = function(elem) {
        _super.call(this, elem)
      }
      AdsRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          let e = this.elem.querySelector('.nrn-movie-title');
          if (!e) {
            const a = this.elem.querySelector('a[data-anchor-area][href^="/watch/"] > div > p') || (this.elem.matches('a[data-anchor-detail="nicoad"]') ? this.elem.querySelector('p') : null);
            e = wrapTitleTextNodeInElement(a);
          }
          return e;
        },
      })
      return AdsRoot
    })(MovieRoot);

    const isTargetPage = () => {
      return ListPage.is(location) || SearchPage.is(location);
    };
    var parent = function(className, child) {
      for (var e = child; e; e = e.parentNode) {
        if (e.classList.contains(className)) return e
      }
      return null
    }
    var ListPage = function(doc) {
      _super.call(this, doc)
      this.movieRoots = [];
      this._sourceUrl = location.href;
      this._abortController = new AbortController();
      this.resultLayout = ResultLayout.create(this);
    }
    ListPage.prototype = createObject(_super.prototype, {
      createTables() { return [] },
      _createMovieRoot(resultOfParsing) {
        switch (resultOfParsing.type) {
          case 'main': return new MovieRoot(resultOfParsing.rootElem)
          case 'ads': return new AdsRoot(resultOfParsing.rootElem)
          default: throw new Error(resultOfParsing.type)
        }
      },
      createMovieRoot(resultOfParsing) {
        const res = this._createMovieRoot(resultOfParsing);
        this.movieRoots.push(res);
        return res;
      },
      get _currentPageNumber() {
        return parseInt(new URL(this._sourceUrl || location.href).searchParams.get('page') || '1', 10) || 1
      },
      _paginationSnapshot() {
        var current = this._currentPageNumber
        var pathname = new URL(this._sourceUrl || location.href).pathname
        var rows = []
        var pageNumbers = []
        var itemElements = Array.from(this.doc.querySelectorAll(
          '[data-scope="pagination"] [data-part="item"]'
        ))

        itemElements.forEach(function(el) {
          var href = el.getAttribute('href') || ''
          var n = parseInt(el.getAttribute('data-index'),10)
          var parsedHref = null
          var samePath = true
          if (href) {
            try {
              parsedHref = new URL(href,location.href)
              samePath = parsedHref.origin === location.origin && parsedHref.pathname === pathname
              if (isNaN(n) && samePath) n = parseInt(parsedHref.searchParams.get('page'),10)
            } catch(e) { samePath = false }
          }
          if (!samePath || isNaN(n) || n < 1) return
          pageNumbers.push(n)
          rows.push({
            page:n,
            href:parsedHref ? parsedHref.href : href,
            text:String(el.textContent || '').trim().slice(0,40),
            ariaLabel:el.getAttribute('aria-label') || '',
            selected:el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page',
            dataIndex:el.getAttribute('data-index')
          })
        })

        var uniquePages = [...new Set(pageNumbers)].sort(function(a,b){return a-b})
        var selectedLast = itemElements.find(function(el) {
          var label = String(el.getAttribute('aria-label') || '').toLowerCase()
          return (el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page')
            && label.indexOf('last page') !== -1
        })
        var selectedLastPage = null
        if (selectedLast) {
          selectedLastPage = parseInt(selectedLast.getAttribute('data-index'),10)
          if (isNaN(selectedLastPage)) {
            try {
              selectedLastPage = parseInt(new URL(selectedLast.getAttribute('href'),location.href)
                .searchParams.get('page'),10)
            } catch(e) {}
          }
          if (isNaN(selectedLastPage)) selectedLastPage = null
        }

        var nextControl = this.doc.querySelector(
          '[data-scope="pagination"] [data-part="next-trigger"],'
          + '[data-scope="pagination"] [aria-label="next page"]'
        )
        var nextDisabled = Boolean(nextControl && (
          nextControl.hasAttribute('data-disabled')
          || nextControl.getAttribute('aria-disabled') === 'true'
        ))

        var maxPage = selectedLastPage != null
          ? selectedLastPage
          : (uniquePages.length ? Math.max.apply(Math,uniquePages) : null)
        var isFinalPageEvidence = Boolean(
          selectedLastPage === current
          || (nextDisabled && uniquePages.indexOf(current) !== -1)
        )
        if (isFinalPageEvidence) maxPage = current

        return {
          currentPage:current,
          maxPage:maxPage,
          pageNumbers:uniquePages,
          rows:rows,
          linkCount:rows.length,
          hasHigherPage:!isFinalPageEvidence
            && uniquePages.some(function(n){return n > current}),
          hasLowerPage:uniquePages.some(function(n){return n < current}),
          hasPaginationEvidence:uniquePages.length > 0,
          selectedLastPage:selectedLastPage,
          nextDisabled:nextDisabled,
          isFinalPageEvidence:isFinalPageEvidence
        }
      },
      _lastPageNumber() {
        var snapshot = this._paginationSnapshot()
        // v9.9の不具合修正:
        // ページャー未描画時に currentPage を最終ページとして返してはいけない。
        return snapshot.hasPaginationEvidence ? snapshot.maxPage : null
      },
      async fetchPageItems(pageNumber, options) {
        options = options || {}
        var timingStart = performance.now()
        var url = new URL(this._sourceUrl || location.href)
        url.searchParams.set('page', pageNumber)

        var fetchScope = String(options.scope || 'RUN').toUpperCase()
        var fetchRequestId = options.requestId
          || (fetchScope + '-p' + pageNumber + '-' + Math.random().toString(36).slice(2, 7))
        var fetchLog = '[NicoNicoRankingNG autoFill][' + fetchScope + '][' + fetchRequestId + ']'

        console.log(fetchLog, '取得開始:', {
          page: pageNumber,
          url: url.toString(),
          scope: fetchScope,
          requestId: fetchRequestId
        })

        var networkStart = performance.now()
        var res = await Network.fetchResponse(url.toString(), {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this._abortController?.signal
        })
        if (!res.ok) {
          var httpError = new Error('HTTP ' + res.status)
          httpError.status = res.status
          httpError.pageNumber = pageNumber
          httpError.url = url.toString()
          throw httpError
        }

        var responseReceivedAt = performance.now()
        if (res.url) {
          var responseUrl = new URL(res.url, url)
          if (responseUrl.origin !== url.origin || responseUrl.pathname !== url.pathname) {
            throw new Error('検索結果以外のURLへ転送されました: ' + responseUrl.pathname)
          }
          var responsePage = Number(responseUrl.searchParams.get('page') || 1)
          if (Number.isInteger(responsePage) && responsePage > 0 && responsePage < pageNumber) {
            return {items:[], hasNextPage:false, maxPage:responsePage, pageNumber:pageNumber}
          }
        }
        var html = await res.text()
        var bodyReadAt = performance.now()
        var doc = new DOMParser().parseFromString(html, 'text/html')
        var parsedAt = performance.now()

        var items = []
        var maxPage = null
        var hasNextPage = null
        var hasSearchItems = false

        // まず NicoNico の server-response JSON を試す。
        var metaElem = doc.querySelector('meta[name="server-response"]')
        if (metaElem) {
          try {
            var parsed = JSON.parse(metaElem.getAttribute('content'))
            var searchData = parsed
              && parsed.data
              && parsed.data.response
              && parsed.data.response['$getSearchVideoV2']
              && parsed.data.response['$getSearchVideoV2'].data

            var jsonMaxPage = parsed
              && parsed.data
              && parsed.data.response
              && parsed.data.response.page
              && parsed.data.response.page.pagination
              && parsed.data.response.page.pagination.maxPage

            if (Number.isInteger(Number(jsonMaxPage)) && Number(jsonMaxPage) > 0) {
              maxPage = Number(jsonMaxPage)
            }
            if (searchData && Array.isArray(searchData.items)) {
              items = searchData.items
              hasSearchItems = true
            }
          } catch (e) {
            console.warn(fetchLog, 'server-response JSON解析失敗。DOM解析へ切り替えます。', e)
          }
        }

        // JSON側の構造が変更されていた場合は、実際の現行タイルDOMを直接読む。
        if (!hasSearchItems) {
          var roots = Array.from(doc.querySelectorAll('[data-decoration-video-id][data-anchor-area="main"]'))
          var seen = new Set()

          items = roots.map(function(root) {
            var id = root.getAttribute('data-decoration-video-id')
            if (!id || seen.has(id)) return null
            seen.add(id)

            var titleAnchor =
              root.querySelector('a[href^="/watch/"].fw_bold') ||
              Array.from(root.querySelectorAll('a[href^="/watch/"]')).find(function(a) {
                return a.textContent && a.textContent.trim()
              })
            var thumb = root.querySelector('img[src*="/nicovideo/thumbnails/"]')
            var times = root.querySelectorAll('time')
            var durationSpan = root.querySelector('.pos_absolute time span')
            var ownerAnchor = root.querySelector('a[href*="/user/"]')
            var ownerImg = ownerAnchor && ownerAnchor.querySelector('img')
            var ownerNameElem = ownerAnchor && ownerAnchor.querySelector('p')
            var metaSpans = root.querySelectorAll('.ff_metaNumber span')

            var duration = 0
            if (durationSpan) {
              var parts = durationSpan.textContent.trim().split(':').map(Number)
              if (parts.length === 2 && parts.every(Number.isFinite)) {
                duration = parts[0] * 60 + parts[1]
              } else if (parts.length === 3 && parts.every(Number.isFinite)) {
                duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
              }
            }

            var ownerId = null
            if (ownerAnchor) {
              var m = ownerAnchor.getAttribute('href').match(/\/user\/(\d+)/)
              if (m) ownerId = Number(m[1])
            }

            var registeredAt = ''
            for (var i = 0; i < times.length; i++) {
              if (times[i].getAttribute('datetime')) {
                registeredAt = times[i].getAttribute('datetime')
                break
              }
            }

            var parseCount = function(s) {
              if (!s) return 0
              var n = Number(String(s).replace(/[^\d]/g, ''))
              return Number.isFinite(n) ? n : 0
            }

            return {
              id: id,
              title: titleAnchor ? titleAnchor.textContent.trim() : id,
              thumbnail: {
                listingUrl: thumb ? thumb.getAttribute('src') : ''
              },
              duration: duration,
              registeredAt: registeredAt,
              count: {
                view: metaSpans[0] ? parseCount(metaSpans[0].textContent) : 0,
                comment: metaSpans[1] ? parseCount(metaSpans[1].textContent) : 0
              },
              owner: OwnerEvidence.fromRow({rootElem:root,movie:{id:id}})
            }
          }).filter(Boolean)

          // ページネーションDOMから最大ページを読む
          Array.from(doc.querySelectorAll(
            '[data-scope="pagination"] [data-part="item"], a[href*="page="]'
          )).forEach(function(el) {
            var n = parseInt(
              el.getAttribute('data-index') ||
              (function() {
                try {
                  return new URL(el.getAttribute('href'), location.origin).searchParams.get('page')
                } catch (e) {
                  return ''
                }
              })(),
              10
            )
            if (!isNaN(n) && n > maxPage) maxPage = n
          })

          console.log(fetchLog, 'DOMから', items.length, '件取得')
        } else {
          console.log(fetchLog, 'server-responseから', items.length, '件取得')
        }

        // SSR HTML のページネーションと <link rel=next> から終端を判定する。
        // maxPage が読めないときに「今取得したページ=最終ページ」とは絶対にみなさない。
        var paginationItems = Array.from(doc.querySelectorAll(
          '[data-scope="pagination"] [data-part="item"]'
        ))
        var pageNumbers = []
        paginationItems.forEach(function(el) {
          var n = parseInt(el.getAttribute('data-index'),10)
          if (isNaN(n)) {
            try {
              var href = el.getAttribute('href')
              if (href) n = parseInt(new URL(href,location.origin).searchParams.get('page'),10)
            } catch(e) {}
          }
          if (!isNaN(n)) pageNumbers.push(n)
        })

        var selectedLast = paginationItems.find(function(el) {
          var label = String(el.getAttribute('aria-label') || '').toLowerCase()
          return (el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page')
            && label.indexOf('last page') !== -1
        })
        var selectedLastPage = null
        if (selectedLast) {
          selectedLastPage = parseInt(selectedLast.getAttribute('data-index'),10)
          if (isNaN(selectedLastPage)) {
            try {
              selectedLastPage = parseInt(new URL(selectedLast.getAttribute('href'),location.origin)
                .searchParams.get('page'),10)
            } catch(e) {}
          }
          if (isNaN(selectedLastPage)) selectedLastPage = null
        }

        var nextTrigger = doc.querySelector(
          '[data-scope="pagination"] [data-part="next-trigger"],'
          + '[data-scope="pagination"] [aria-label="next page"]'
        )
        var nextDisabled = Boolean(nextTrigger && (
          nextTrigger.hasAttribute('data-disabled')
          || nextTrigger.getAttribute('aria-disabled') === 'true'
        ))

        if (selectedLastPage != null) {
          maxPage = selectedLastPage
        } else if (pageNumbers.length) {
          var domMaxPage = Math.max.apply(Math,pageNumbers)
          if (!Number.isFinite(Number(maxPage)) || domMaxPage > Number(maxPage)) maxPage = domMaxPage
        }

        if (selectedLastPage === pageNumber || nextDisabled) {
          hasNextPage = false
          maxPage = pageNumber
        } else {
          var nextLink = doc.querySelector('link[rel="next"], a[rel="next"]')
          if (nextLink) hasNextPage = true
          else {
            hasNextPage = pageNumbers.some(function(n){return n > pageNumber}) ? true : null
          }
        }

        if (!items.length) {
          if (!hasSearchItems) throw new Error('検索結果を解析できませんでした。空ページとは判定せず取得を停止します。')
          hasNextPage = false
          maxPage = Math.min(maxPage > 0 ? maxPage : pageNumber - 1, pageNumber - 1)
        }
        var timingEnd = performance.now()
        var timings = {
          networkMs: Math.round(responseReceivedAt - networkStart),
          bodyReadMs: Math.round(bodyReadAt - responseReceivedAt),
          htmlParseMs: Math.round(parsedAt - bodyReadAt),
          itemParseAndPaginationMs: Math.round(timingEnd - parsedAt),
          totalMs: Math.round(timingEnd - timingStart)
        }

        console.log(fetchLog, '取得ページ解析:', {
          scope: fetchScope,
          requestId: fetchRequestId,
          page: pageNumber,
          items: items.length,
          maxPage: maxPage,
          hasNextPage: hasNextPage,
          timings: timings,
          finalPageEvidence:{
            selectedLastPage:selectedLastPage,
            nextDisabled:nextDisabled,
            hasNextPage:hasNextPage
          }
        })

        const owners = items.map(item => OwnerEvidence.normalize(item.owner))
        if (owners.length && owners.every(Boolean)) {
          const counts = new Map(), seen = new Set()
          const keys = owners.map(owner => owner.type + ':' + owner.id)
          items.forEach((item, i) => {
            if (seen.has(item.id)) return
            seen.add(item.id); counts.set(keys[i], (counts.get(keys[i]) || 0) + 1)
          })
          items.forEach((item, i) => { item.__nrnPageContributorCount = counts.get(keys[i]) })
        }
        return {
          items: items,
          maxPage: maxPage,
          hasNextPage: hasNextPage,
          pageNumber: pageNumber,
          timings: timings
        }
      },
      _nextInsertAnchor() {
        if (this._injectAnchor && this._injectAnchor.isConnected) {
          return this._injectAnchor
        }

        // movieRoots の配列順ではなく、実際のDOM上で最後のメイン動画を基準にする。
        var mainCards = Array.from(this.doc.querySelectorAll(
          '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])'
        )).filter(function(el) {
          return el.isConnected
        })

        if (!mainCards.length) {
          mainCards = Array.from(this.doc.querySelectorAll(
            '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
          )).filter(function(el) {
            return el.isConnected
          })
        }

        if (mainCards.length) {
          this._injectAnchor = mainCards[mainCards.length - 1]
          console.log(
            '[NicoNicoRankingNG autoFill] 初回挿入アンカー:',
            this._injectAnchor.getAttribute('data-decoration-video-id'),
            'DOM候補数=' + mainCards.length
          )
          return this._injectAnchor
        }

        return null
      },
      _appendInjectedTile(tileElem) {
        var anchor = this._nextInsertAnchor()
        if (anchor && anchor.parentNode) {
          anchor.insertAdjacentElement('afterend', tileElem)
        } else {
          console.warn('[NicoNicoRankingNG] 本物のタイルが見つからないため、独立した領域に追加しました')
          this._fallbackContainer().appendChild(tileElem)
        }
        this._injectAnchor = tileElem
      },
      _fallbackContainer() {
        // 本物のタイルが1件も見つからない場合のみ使う最終手段
        var existing = this.doc.getElementById('nrn-autofill-container')
        if (existing) return existing
        var label = this.doc.createElement('div')
        label.id = 'nrn-autofill-label'
        label.textContent = '↓ ここから自動継ぎ足し（次ページ以降の動画）'
        label.style.cssText = 'width:100%;font-size:80%;color:#999;margin:12px 0 4px;border-top:1px dashed #999;padding-top:8px;'
        var wrap = this.doc.createElement('div')
        wrap.className = 'cq-t_inline-size'
        var container = this.doc.createElement('div')
        container.id = 'nrn-autofill-container'
        container.className = 'd_grid grid-tc_repeat(5,_1fr) rg_x4 cg_x2 [@container_(max-width:_968px)]:grid-tc_repeat(3,_1fr) [@container_(max-width:_1296px)]:grid-tc_repeat(4,_1fr)'
        wrap.appendChild(container)
        var host = this.doc.querySelector('[aria-label="nicovideo-content"]') || this.doc.body
        host.appendChild(label)
        host.appendChild(wrap)
        return container
      },
      _createInjectedTile(item) {
        var doc = this.doc
        var thumbUrl = (item.thumbnail && (item.thumbnail.listingUrl || item.thumbnail.middleUrl || item.thumbnail.url)) || ''
        var watchUrl = 'https://www.nicovideo.jp/watch/' + item.id
        var view = (item.count && item.count.view) || 0
        var comment = (item.count && item.count.comment) || 0
        var owner = item.owner || {}
        var ownerName = owner.name || (owner.visibility === 'hidden' ? '(投稿者非公開)' : '不明')
        var ownerIcon = owner.iconUrl || 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
        var identity = OwnerEvidence.normalize(owner)
        var ownerUrl = identity ? (identity.type === 'channel' ? 'https://ch.nicovideo.jp/channel/ch' + identity.id : 'https://www.nicovideo.jp/user/' + identity.id) : ''
        var root = doc.createElement('div')
        root.className = 'Pressable cursor_pointer d_flex cq-t_inline-size min-w_thumbnail.min max-w_thumbnail.max w_100% nrn-autofill-pending'
        root.setAttribute('data-decoration-video-id', item.id)
        root.setAttribute('data-nrn-autofill', 'true')
        OwnerEvidence.register(root, item)
        if (Number.isFinite(item.__nrnPageContributorCount)) root.dataset.nrnPageContributorCount = String(item.__nrnPageContributorCount)
        root.setAttribute('data-anchor-area', 'main')
        root.setAttribute('data-anchor-page',
          location.pathname.startsWith('/tag/') ? 'tag' :
          location.pathname.startsWith('/search/') ? 'search' : 'main')
        if (item.__nrnSourcePage != null) {
          root.setAttribute('data-nrn-source-page', String(item.__nrnSourcePage))
        }
        if (item.__nrnSourceIndex != null) {
          root.setAttribute('data-nrn-source-index', String(item.__nrnSourceIndex))
        }
        root.innerHTML =
          '<div class="d_flex flex-d_column w_100% min-h_[calc(_100cqi_*_9_/_16_+_{lineHeights.base}_*_2_*_{fontSizes.l}_+_{sizes.base}_+_{sizes.x0_5}_+_{lineHeights.base}_*_{fontSizes.s}_+_{sizes.base}_+_{sizes.x3}_)]">' +
            '<div class="pos_relative nrn-thumb-anchor-wrap">' +
              '<a href="' + watchUrl + '" class="hover:c_action.primaryAzure">' +
                '<div class="pos_relative asp_16:9 bg-c_layer.surfaceHighEmBlack bdr_m ov_hidden content-visibility_auto contain_content w_100% min-w_100% [&_>_img]:obj-f_contain [&_>_img]:h_100%">' +
                  '<img alt="" class="mx_auto bdr_s" loading="lazy" decoding="async" src="' + thumbUrl + '">' +
                  '<div class="pos_absolute bottom_x0_5 right_x0_5 z_forward p_x0_5 ff_metaNumber fs_s fw_bold lh_1 c_textOnLayer.highEmWhite bg-c_layer.surfaceOverlayBlack bdr_s">' +
                    '<time><span class="white-space_nowrap">' + formatSecondsAsDuration(item.duration) + '</span></time>' +
                  '</div>' +
                '</div>' +
              '</a>' +
            '</div>' +
            '<a href="' + watchUrl + '" class="hover:c_action.primaryAzure fs_l mt_x0_5 mb_base fw_bold lc_2 visited:text-layer_visited groupHover:text-layer_accentAzure [@container_(max-width:_320px)]:fs_base h_[calc({lineHeights.base}_*_2em)] nrn-title-anchor"></a>' +
            '<div class="fs_s flex-wrap_wrap d_flex gap_base mb_base text-layer_lowEm [&_>_*]:d_flex [&_>_*]:ai_center [&_>_*]:gap_x0_5 [&_>_*]:lh_1 [&_>_*]:ff_metaNumber [&_>_*]:fs_s [&_>_*]:white-space_nowrap">' +
              '<time>' + formatRelativeOrDate(item.registeredAt) + '</time>' +
              '<p>' + VIEW_ICON_SVG + '<span class="white-space_nowrap">' + view.toLocaleString() + '</span></p>' +
              '<p>' + COMMENT_ICON_SVG + '<span class="white-space_nowrap">' + comment.toLocaleString() + '</span></p>' +
            '</div>' +
            (ownerUrl ?
              '<a href="' + ownerUrl + '" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center text-layer_mediumEm w_fit-content fs_base [@container_(max-width:_320px)]:fs_s">' +
                '<img alt="" class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3" loading="lazy" decoding="async" src="' + ownerIcon + '">' +
                '<p class="fw_bold lc_1"></p>' +
              '</a>' : '<span class="fs_base text-layer_mediumEm">' + ownerName + '</span>') +
          '</div>'
        // XSS対策のためテキストはDOM APIで設定する（タイトル・投稿者名にHTMLを解釈させない）
        root.querySelector('img.mx_auto').alt = item.title || ''
        var titleA = root.querySelector('.nrn-title-anchor')
        titleA.textContent = item.title || ''
        titleA.classList.add('nrn-movie-title')
        titleA.classList.remove('nrn-title-anchor')
        if (ownerUrl) {
          root.querySelector('img.bdr_full').alt = ownerName
          root.querySelector('p.fw_bold.lc_1').textContent = ownerName
        }
        root.firstElementChild.classList.add("nrn-card-body")
        var description = doc.createElement("div")
        description.className = "nrn-card-description"
        description.textContent = item.description || ""
        titleA.after(description)
        this.resultLayout.add(root)
        this._appendInjectedTile(root)
        // 自動追加分では1本ごとのニコニコ広告API通信を省略して高速化する。
        // 元ページ側の広告表示には影響しない。
        return root
      },
      async _applyAdDecoration(root, videoId) {
        try {
          if (this._disposed || root.dataset.nrnAdDecorated === 'true') return
          var json = await Network.ads('decoration:' + videoId, async function() {
            var res = await Network.fetchResponse('https://api.nicoad.nicovideo.jp/v1/contents/video/' + videoId, {credentials: 'omit'}, 10000)
            if (!res.ok) throw new Error('広告 HTTP ' + res.status)
            return res.json()
          })
          if (this._disposed || root.dataset.nrnAdDecorated === 'true') return
          root.dataset.nrnAdDecorated = 'true'
          var data = json && json.data
          var decoration = data && data.decoration
          if (decoration !== 'gold' && decoration !== 'silver') return
          var thumbWrap = root.querySelector('.nrn-thumb-anchor-wrap')
          if (thumbWrap) {
            var ribbon = this.doc.createElement('img')
            ribbon.alt = ''
            ribbon.className = 'pos_absolute top_-x0_5 left_-x0_5'
            ribbon.loading = 'lazy'
            ribbon.src = decoration === 'gold' ? NICOAD_RIBBON.gold : NICOAD_RIBBON.silver
            thumbWrap.appendChild(ribbon)
          }
          var colorClass = decoration === 'gold' ? 'c_serviceColor.nicoadGold fill_serviceColor.nicoadGold' : 'c_serviceColor.nicoadGray fill_serviceColor.nicoadGray'
          var sponsorDiv = this.doc.createElement('div')
          sponsorDiv.className = 'nrn-ad-decoration d_flex flex-d_column ' + colorClass
          // ownerName identifies the content owner, not the advertiser.
          // The decoration response alone cannot supply an accurate sponsor label.
          var pointSpan = this.doc.createElement('span')
          pointSpan.className = 'd_inline-flex ai_center gap_x0_5 fs_s min-h_font'
          pointSpan.innerHTML = NICOAD_POINT_ICON_SVG
          pointSpan.appendChild(this.doc.createTextNode((data.totalPoint || 0).toLocaleString() + 'pt'))
          sponsorDiv.appendChild(pointSpan)
          root.firstElementChild.appendChild(sponsorDiv)
        } catch (e) {
          // 広告枠の判定に失敗しても致命的ではないため無視する（CORS等でブロックされる場合がある）
        }
      },
      unbindUnconnectedMovieRoots() {
        const a = [];
        for (const r of this.movieRoots) {
          if (r.elem.isConnected) {
            a.push(r);
          } else {
            this.unmapToggleFrom(r);
            r.unbind();
          }
        }
        this.movieRoots = a;
      },
      addConfigBar(bar) {
        if (bar) {
          this.configBar = bar;
        } else if (this.configBar) {
          bar = this.configBar;
        } else {
          return;
        }
        if (bar.elem.isConnected) {
          return;
        }
        const e = Array.from(this.doc.querySelectorAll('[aria-label="nicovideo-content"] section > div:first-of-type')).find(node => !node.closest('.nrn-parsed, [data-decoration-video-id], .nrn-movie-info-container, [data-anchor-detail="nicoad"]'));
        if (e) {
          e.after(bar.elem);
          return;
        }
        const header = this.doc.querySelector('[aria-label="nicovideo-content"] .grid-area_header');
        if (header) header.append(bar.elem);
        else this.doc.querySelector('[aria-label="nicovideo-content"]')?.prepend(bar.elem);
      },
      parse(target) {
        if (!isTargetPage()) return [];
        this.resultLayout.sync();
        target = target || this.doc
        return this._parseMain(target).concat(this._parseAds(target));
      },
      _parseMain(target) {
        return Array.from(target.querySelectorAll('div[data-anchor] > div:not(.pos_relative) > a[data-anchor-area][href^="/watch/"]'))
          .map(function(item) {
            return {
              type: 'main',
              movie: {
                id: movieIdOf(item.href),
                title: item.lastChild?.textContent,
              },
              rootElem: item.closest('[data-decoration-video-id]') || (SearchPage.is(location)
                      ? item.parentNode.parentNode
                      : item.parentNode.parentNode.parentNode.parentNode),
            }
          }).filter(e => e.movie.id && e.movie.title && !e.rootElem.classList.contains('nrn-parsed'));
      },
      _parseAds(target) {
        return Array.from(target.querySelectorAll('a[data-anchor-area][href^="/watch/"]:has(> div > p)'))
          .map(function(item) {
            return {
              type: 'ads',
              movie: {
                id: movieIdOf(item.href),
                title: item.querySelector(':scope > div > p')?.lastChild?.textContent,
              },
              rootElem: SearchPage.is(location)
                      ? item
                      : item.parentNode.parentNode,
            }
          }).filter(e => e.movie.id && e.movie.title && !e.rootElem.classList.contains('nrn-parsed'));
      },
      _configDialogLoaded(doc) {
        // 旧UIでは #togglable が存在したが、v9.3以降の新UIでは廃止。
        // null参照でConfigDialog生成前に例外を起こさないよう互換ガード。
        var togglable = doc.getElementById('togglable')
        if (togglable) togglable.hidden = true
      },
      observeMutation(callback, refreshOwners) {
        const transient = '[data-scope="presence"], [data-scope="tooltip"], video, canvas, .nrn-movie-info-container, .nrn-ng-reasons'
        const ownerSelector = 'a[data-group-ignore="true"][data-anchor-area="main"]'
        const ownerRoots = new Set()
        let parsePending = false
        const currentRoute = () => {
          if (this._disposed || !isTargetPage()) return false
          const source = new URL(this._sourceUrl)
          return source.pathname + source.search === location.pathname + location.search
        }
        this._observer = new MutationObserver(records => {
          if (!currentRoute()) return
          let relevant = false
          for (const record of records) {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement
            if (!target || target.closest(transient)) continue
            if (record.type === 'attributes' && record.attributeName === 'class') {
              const nativeClasses = value => String(value || '').split(/\s+/).filter(name => name && !name.startsWith('nrn-')).sort().join(' ')
              if (nativeClasses(record.oldValue) === nativeClasses(target.className)) {
                this.resultLayout.rememberState(target)
                continue
              }
            }
            const nodes = [...record.addedNodes, ...record.removedNodes]
            // Recheck only cards whose native owner row changed, including late text/href.
            const ownerChanged = (record.type !== 'attributes' || record.attributeName !== 'class') &&
              (target.closest(ownerSelector) || nodes.some(node => node.nodeType === 1 &&
                (node.matches(ownerSelector) || node.querySelector(ownerSelector))))
            if (ownerChanged) {
              const root = target.closest('[data-decoration-video-id]')
              if (root) ownerRoots.add(root)
            }
            // Owner-only text/URL updates do not need a whole-page parse.
            if (record.type === 'characterData' || (record.type === 'attributes' && record.attributeName !== 'class')) continue
            if (nodes.length && nodes.every(node => node.nodeType !== 1 || node.matches(transient))) continue
            relevant = true
          }
          parsePending ||= relevant
          if ((!parsePending && !ownerRoots.size) || this._mutationFrame != null) return
          this._mutationFrame = requestAnimationFrame(() => {
            this._mutationFrame = null
            if (!currentRoute()) { ownerRoots.clear(); return }
            const rows = [...ownerRoots].filter(root => root.isConnected && root.classList.contains('nrn-parsed'))
              .map(root => ({rootElem:root, movie:{id:root.dataset.decorationVideoId}}))
            ownerRoots.clear()
            if (rows.length) refreshOwners?.(rows)
            if (parsePending) {
              parsePending = false
              const parsed = this.parse()
              if (parsed.length > 0) { callback(parsed, true); this.unbindUnconnectedMovieRoots() }
              this.addConfigBar()
              this._refreshPagerAnnotations?.()
            }
          })
        })
        this._observer.observe(this.doc.body, {childList:true, subtree:true, characterData:true, attributes:true,
          attributeFilter:['class','href','data-anchor-href','data-group-ignore','data-anchor-area'], attributeOldValue:true})
      },
      get css() {
        return ResultLayout.css + `#nrn-config-button,
.nrn-visit-button:hover,
.nrn-movie-ng-button:hover,
.nrn-title-ng-button:hover,
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-movie-info-toggle:hover {
  text-decoration: none;
  cursor: pointer;
  background: #f3f5f7;
}
#nrn-open-all-movie-info,
#nrn-close-all-movie-info {
  margin-left: 4px;
  padding: 2px 7px;
  border: 1px solid #ccd1d8;
  border-radius: 6px;
  background: #fff;
  color: #4e5661;
  font: inherit;
  cursor: pointer;
}
#nrn-open-all-movie-info:hover,
#nrn-close-all-movie-info:hover {
  background: #eef2f6;
}
.nrn-detail-bulk-label {
  color: #6c737d;
  font-size: .92em;
}
.nrn-config-separator {
  margin: 0 4px;
  color: #b0b5bc;
}
.nrn-movie-tag {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: start;
  gap: 5px;
  min-width: 0;
  margin: 0;
  padding: 6px 2px;
  border: 0;
  border-bottom: 1px solid #edf0f2;
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  line-height: 1.55;
}
.nrn-movie-tag:last-child {
  border-bottom: 0;
}
.nrn-movie-tag:hover {
  background: #f6f7f8;
}
.nrn-movie-tag.nrn-locked-tag {
  background: transparent;
}
.nrn-tag-lock-indicator {
  display: inline-flex;
  width: 18px;
  min-width: 18px;
  justify-content: center;
  color: #9b7c23;
  font-size: 12px;
  line-height: 1.55;
  filter: saturate(.72);
}
.nrn-tag-lock-placeholder {
  visibility: hidden;
}
.nrn-movie-tag-link {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.nrn-movie-tag-link,
.nrn-contributor-link {
  color: #272a2f;
  text-decoration: none;
}
.nrn-movie-tag-link:hover,
.nrn-contributor-link:hover {
  text-decoration: underline;
}
.nrn-tag-ng-button,
.nrn-contributor-ng-button,
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 6px;
  border: 1px solid #d3d7dc;
  border-radius: 6px;
  background: transparent;
  color: #6f7781;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}
.nrn-tag-ng-button {
  align-self: center;
  white-space: nowrap;
  opacity: .78;
  transition: opacity .12s ease, background-color .12s ease, border-color .12s ease;
}
.nrn-movie-tag:hover .nrn-tag-ng-button,
.nrn-tag-ng-button:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .nrn-tag-ng-button { opacity: 1; }
}
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover {
  border-color: #8d96a3;
  background: #eef1f5;
  text-decoration: none;
}
.nrn-movie-tag-link.nrn-movie-ng-tag-link,
.nrn-contributor-link.nrn-ng-contributor-link,
.nrn-matched-ng-contributor-name,
.nrn-matched-ng-title {
  color: white;
  background-color: fuchsia;
}
.nrn-movie-info-container {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 12;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px 0 4px;
  color: #262b31;
  background: transparent;
  border: 0;
  border-top: 1px solid #e1e4e8;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
}
.nrn-parsed {
  align-self: start !important;
}
.nrn-parsed.nrn-info-expanded {
  position: relative !important;
  margin-bottom: var(--nrn-detail-reserve, 0px) !important;
  overflow: visible !important;
}
/* v13.0: 動画カード・サムネイル・タイトル等の幅/高さは変更しない。
   変更するのは下方向の予約スペース(margin-bottom)だけ。 */
.nrn-info-section + .nrn-info-section {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid #eceef1;
}
.nrn-info-section-title {
  margin-bottom: 4px;
  color: #737b86;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .01em;
}
.nrn-tag-container {
  display: block;
  min-width: 0;
}
.nrn-contributor-container {
  display: block;
}
.nrn-contributor {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 7px 8px;
  min-width: 0;
  padding: 7px 2px;
  font-size: 13px;
  line-height: 1.5;
  border-radius: 0;
  background: transparent;
}
.nrn-contributor .nrn-user-ng-button,
.nrn-contributor > .nrn-contributor-ng-button {
  grid-column: 1 / -1;
  justify-self: start;
}
.nrn-contributor-link {
  min-width: 0;
  overflow-wrap: anywhere;
}
.nrn-contributor-kind {
  display: inline-flex;
  padding: 2px 6px;
  border-radius: 999px;
  background: #e9edf2;
  color: #626a75;
  font-size: 11px;
  font-weight: 700;
}
.nrn-user-ng-button {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
}
.nrn-autofill-pending,
.nrn-autofill-overflow {
  display: none !important;
}
.nrn-hide {
  display: none;
}
.nrn-user-ng-button {
  display: inline-block;
}
.nrn-ng-movie-title,
.nrn-contributor-link.nrn-ng-id-contributor-link {
  text-decoration: line-through;
}
.nrn-parsed {
  position: relative;
}
.nrn-action-pane {
  display: none;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 3px;
  color: #999;
  background-color: rgb(105, 105, 105);
  z-index: 11;

  .d_grid > [data-anchor] > & { /* 新検索ページ タイル表示 */
    top: -1.8em;
    white-space: nowrap;
  }
}
/* 詳細情報はクリックで開閉する。マウスがカード外へ移動しても閉じない。 */
.nrn-parsed {
  &:hover {
    & .nrn-action-pane {
      display: block;
    }
  }
}
.nrn-visit-button, .nrn-movie-ng-button, .nrn-title-ng-button {
  color: white;
}
.nrn-movie-ng-button, .nrn-title-ng-button {
  margin-left: 5px;
  border-left: solid thin;
  padding-left: 5px;
}
.nrn-movie-info-toggle {
  position: absolute;
  z-index: 20;
  pointer-events: auto;
  cursor: pointer;
  display: block;
  inset: auto 0 0 auto;
  width: 26px;
  min-width: 26px;
  height: 24px;
  padding: 0;
  color: #777f89;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  line-height: 24px;
  text-align: center;
  user-select: none;
}
.nrn-movie-info-toggle.nrn-toggle-pinned {
  top: var(--nrn-toggle-top) !important;
  right: 0 !important;
  bottom: auto !important;
  left: auto !important;
}
.nrn-self-ad-warning {
  margin: 0 0 7px;
  padding: 5px 7px;
  border-left: 3px solid #c77c12;
  background: #fff4dd;
  color: #704500;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}
.nrn-self-ad-inline-badge {
  display: inline-block;
  margin: 0 5px 3px 0;
  padding: 1px 5px;
  border: 1px solid #b56a00;
  border-radius: 4px;
  background: #fff0cf;
  color: #7a4700;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 800;
  vertical-align: baseline;
  white-space: nowrap;
}
.nrn-self-ad-inline-badge[data-confidence="name"] {
  border-color: #9a7a3b;
  background: #f7f0dd;
  color: #66501f;
}
.nrn-self-ad-card-badge {
  position: absolute !important;
  left: 4px !important;
  top: 4px !important;
  bottom: auto !important;
  z-index: 80 !important;
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(104, 62, 0, .90);
  color: #fff4d6;
  font-size: 10px;
  line-height: 1.35;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,.65);
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.nrn-self-ad-card-badge[data-confidence="name"] {
  background: rgba(103, 76, 25, .88);
}
.nrn-error {
  color: red;
}

/* ============================================================
 * v12.9 Classic Functional Detail
 * 「タグ名 🔒 [+]」を基準にした、常時見えるシンプルUI。
 * ============================================================ */
.nrn-movie-info-container {
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-info-section-title {
  margin: 0 0 5px !important;
  color: #6c737d !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}
.nrn-tag-container {
  display: block !important;
}
.nrn-movie-tag {
  display: block !important;
  margin: 0 !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  white-space: normal !important;
}
.nrn-movie-tag:hover {
  background: transparent !important;
}
.nrn-movie-tag-link {
  display: inline !important;
  overflow-wrap: anywhere;
  word-break: normal;
}
.nrn-tag-lock-indicator {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-left: 4px !important;
  color: #a67818 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  vertical-align: baseline !important;
}
.nrn-tag-lock-placeholder {
  display: none !important;
}
.nrn-tag-ng-button {
  display: inline !important;
  margin-left: 4px !important;
  padding: 0 !important;
  min-height: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  opacity: 1 !important;
  cursor: pointer !important;
}
.nrn-tag-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}
.nrn-contributor {
  display: block !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-contributor-kind {
  display: inline !important;
  margin: 0 4px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #555e68 !important;
  font-size: 13px !important;
  font-weight: 400 !important;
}
.nrn-contributor-link {
  display: inline !important;
}
.nrn-user-ng-button {
  display: inline !important;
  margin-left: 4px !important;
}
.nrn-user-ng-button::before {
  content: '[';
  color: #727b85;
}
.nrn-user-ng-button::after {
  content: ']';
  color: #727b85;
}
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button,
.nrn-contributor-ng-button {
  display: inline !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  cursor: pointer !important;
}
.nrn-contributor-ng-name-button::before {
  content: '/';
  color: #727b85;
  margin: 0 1px;
}
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-contributor-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}

.nrn-reduce {
  & :is(img[src^="https://nicovideo.cdn.nimg.jp/thumbnails/"], img[src^="https://img.cdn.nimg.jp/s/nicovideo/thumbnails/"]) {
    div:has(> &) {
      height: 63px;
    }
  }
  & div:not(.pos_relative) > a[href^="/watch/"] ~ * {
    display: none;
  }
}
`
      },
    })
    Object.assign(ListPage, {
      MovieRoot,
      is(location) {
        return location.pathname.startsWith('/ranking/genre');
      },
      pendingMoviesInvisibleCss() {
        return `div:has(> :not(.pos_relative) > [data-anchor-page="ranking_genre"] > :not(.pos_relative) > [data-anchor-page="ranking_genre"][href^="/watch/"]),
div:has(> div > a[data-anchor-page="ranking_genre"][href^="/watch/"] > div > p),
[data-anchor-page="tag"]:has(> :not(.pos_relative) > [data-anchor-page="tag"][href^="/watch/"]),
[data-anchor-page="search"]:has(> :not(.pos_relative) > [data-anchor-page="search"][href^="/watch/"]) {
  visibility: hidden;
  &.nrn-thumb-info-done, &.nrn-metadata-settled {
    visibility: inherit;
  }
}
`;
      },
    })
    return ListPage
  })(NicoPage)
