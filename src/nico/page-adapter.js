  var NicoPage = (function() {
    var TOGGLE_OPEN_TEXT = '▼'
    var TOGGLE_CLOSE_TEXT = '▲'
    var emphasizeMatchedText = function(e, text, createMatchedElem) {
      var t = e.textContent
      if (!text) {
        e.textContent = t
        return
      }
      var i = t.toUpperCase().indexOf(text)
      if (i === -1) {
        e.textContent = t
        return
      }
      while (e.hasChildNodes()) e.removeChild(e.firstChild)
      var d = e.ownerDocument
      if (i !== 0) e.appendChild(d.createTextNode(t.slice(0, i)))
      e.appendChild(createMatchedElem(t.slice(i, i + text.length)))
      if (i + text.length !== t.length) {
        e.appendChild(d.createTextNode(t.slice(i + text.length)))
      }
    }

    var MovieTitle = (function() {
      var MovieTitle = function(elem) {
        this.elem = elem
        this._ngTitle = ''
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngTitleChanged: set(this, 'ngTitle'),
        })
      }
      MovieTitle.prototype = {
        get ngId() {
          return this.elem.classList.contains('nrn-ng-movie-title')
        },
        set ngId(ngId) {
          var n = ngId ? 'add' : 'remove'
          this.elem.classList[n]('nrn-ng-movie-title')
        },
        _createNgTitleElem(textContent) {
          var result = this.elem.ownerDocument.createElement('span')
          result.className = 'nrn-matched-ng-title'
          result.textContent = textContent
          return result
        },
        get ngTitle() { return this._ngTitle },
        set ngTitle(ngTitle) {
          this._ngTitle = ngTitle
          emphasizeMatchedText(this.elem, ngTitle, this._createNgTitleElem.bind(this))
        },
        bindToMovie(movie) {
          this.ngId = movie.ngId
          this.ngTitle = movie.ngTitle
          this._listeners.bind(movie)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return MovieTitle
    })()

    var ActionPane = (function() {
      var createVisitButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-visit-button'
        result.textContent = '閲覧済み'
        result.dataset.movieId = movie.id
        result.dataset.type = 'add'
        result.dataset.movieTitle = movie.title
        return result
      }
      var createMovieNgButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-movie-ng-button'
        result.textContent = 'NG動画'
        result.dataset.movieId = movie.id
        result.dataset.type = 'add'
        result.dataset.movieTitle = movie.title
        return result
      }
      var createTitleNgButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-title-ng-button'
        result.textContent = 'NGタイトル追加'
        result.dataset.movieTitle = movie.title
        result.dataset.ngTitle = ''
        return result
      }
      var createPane = function(doc) {
        var result = doc.createElement('div')
        result.className = 'nrn-action-pane'
        for (var c of Array.from(arguments).slice(1)) result.appendChild(c)
        return result
      }
      var ActionPane = function(doc, movie) {
        this.elem = createPane(doc
                             , createVisitButton(doc, movie)
                             , createMovieNgButton(doc, movie)
                             , createTitleNgButton(doc, movie))
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngTitleChanged: set(this, 'ngTitle'),
          visitedChanged: set(this, 'visited'),
        })
      }
      ActionPane.prototype = {
        get _visitButton() {
          return this.elem.querySelector('.nrn-visit-button')
        },
        get visited() {
          return this._visitButton.dataset.type === 'remove'
        },
        set visited(visited) {
          var b = this._visitButton
          b.textContent = visited ? '未閲覧' : '閲覧済み'
          b.dataset.type = visited ? 'remove' : 'add'
        },
        get _movieNgButton() {
          return this.elem.querySelector('.nrn-movie-ng-button')
        },
        get ngId() {
          return this._movieNgButton.dataset.type === 'remove'
        },
        set ngId(ngId) {
          var b = this._movieNgButton
          b.textContent = ngId ? 'NG解除' : 'NG登録'
          b.dataset.type = ngId ? 'remove' : 'add'
        },
        get _titleNgButton() {
          return this.elem.querySelector('.nrn-title-ng-button')
        },
        get ngTitle() {
          return this._titleNgButton.dataset.ngTitle
        },
        set ngTitle(ngTitle) {
          var b = this._titleNgButton
          b.textContent = ngTitle ? 'NGタイトル削除' : 'NGタイトル追加'
          b.dataset.type = ngTitle ? 'remove' : 'add'
          b.dataset.ngTitle = ngTitle
        },
        bindToMovie(movie) {
          this.ngId = movie.ngId
          this.ngTitle = movie.ngTitle
          this.visited = movie.visited
          this._listeners.bind(movie)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return ActionPane
    })()

    // --------------------------------------------------------------------
    // Detail UI views: tags / contributor / description
    // --------------------------------------------------------------------
    var TagView = (function() {
      var createElem = function(doc, tag) {
        var a = doc.createElement('a')
        a.className = 'nrn-movie-tag-link'
        a.target = '_blank'
        a.textContent = tag.name
        a.href = 'https://www.nicovideo.jp/tag/' + tag.name
        const key = doc.createElement('span');
        key.className = 'nrn-tag-lock-indicator'
        key.textContent = tag.lock ? '🔒' : '';
        key.setAttribute('aria-hidden', 'true')
        if (tag.lock) key.title = '投稿者がロックしているタグ（タグロック）'
        var b = doc.createElement('span')
        b.className = 'nrn-tag-ng-button'
        b.textContent = '[+]'
        b.title = 'このタグをNGリストへ追加'
        b.dataset.type = 'add'
        b.dataset.tagName = tag.name
        if (tag.lock) b.dataset.lock = 'true';
        var result = doc.createElement('span')
        result.className = 'nrn-movie-tag'
        if (tag.lock) result.classList.add('nrn-locked-tag')
        result.appendChild(a)
        if (tag.lock) result.appendChild(key)
        result.appendChild(b)
        return result
      }
      var TagView = function(doc, tag) {
        this.tagName = tag.name;
        this.locked = Boolean(tag.lock);
        this.elem = createElem(doc, tag);
        this._listeners = new Listeners({ngChanged: set(this, 'ng')})
      }
      TagView.prototype = {
        get _link() {
          return this.elem.querySelector('.nrn-movie-tag-link')
        },
        get ng() {
          return this._link.classList.contains('nrn-movie-ng-tag-link')
        },
        set ng(ng) {
          this._link.classList[ng ? 'add' : 'remove']('nrn-movie-ng-tag-link')
          var b = this.elem.querySelector('.nrn-tag-ng-button')
          b.textContent = ng ? '[x]' : '[+]'
          b.title = ng ? 'このタグをNGリストから解除' : 'このタグをNGリストへ追加'
          b.dataset.type = ng ? 'remove' : 'add'
        },
        bindToTag(tag) {
          this.ng = tag.ng
          this._listeners.bind(tag)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return TagView
    })()

    var ContributorView = (function() {
      var ContributorView = function(doc, contributor) {
        this.contributor = contributor
        this.elem = this._createElem(doc)
      }
      ContributorView.prototype = {
        _createElem(doc) {
          var a = doc.createElement('a')
          a.className = 'nrn-contributor-link'
          a.target = '_blank'
          a.href = this.contributor.url
          a.textContent = this.contributor.name || '(名前不明)'
          var b = doc.createElement('span')
          this._setNgButton(b)
          var result = doc.createElement('span')
          result.className = 'nrn-contributor'
          var label = doc.createElement('span')
          label.className = 'nrn-contributor-kind'
          label.textContent = this._label
          result.appendChild(label)
          result.appendChild(a)
          result.appendChild(b)
          return result
        },
        _initContributorDataset(dataset) {
          dataset.contributorType = this.contributor.type
          dataset.id = this.contributor.id
          dataset.name = this.contributor.name
          dataset.type = 'add'
        },
        get _label() {
          throw new Error('must be implemented')
        },
        _setNgButton() {
          throw new Error('must be implemented')
        },
        _bindToContributor() {
          throw new Error('must be implemented')
        },
      }

      var UserView = function UserView(doc, contributor) {
        ContributorView.call(this, doc, contributor)
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngNameChanged: set(this, 'ngName'),
        })
        this._bindToContributor()
      }
      UserView.prototype = createObject(ContributorView.prototype, {
        get _label() {
          return 'ユーザー:'
        },
        _setNgButton(b) {
          var d = b.ownerDocument
          var ngIdButton = d.createElement('span')
          ngIdButton.className = 'nrn-contributor-ng-id-button'
          ngIdButton.textContent = '+ID'
          this._initContributorDataset(ngIdButton.dataset)
          var ngNameButton = d.createElement('span')
          ngNameButton.className = 'nrn-contributor-ng-name-button'
          ngNameButton.textContent = '+名'
          this._initContributorDataset(ngNameButton.dataset)
          b.className = 'nrn-user-ng-button'
          b.appendChild(ngIdButton)
          if (this.contributor.name) {
          } else {
            ngNameButton.style.display = 'none'
          }
          b.appendChild(ngNameButton)
        },
        get ngId() {
          return this.elem.querySelector('.nrn-contributor-link')
            .classList.contains('nrn-ng-id-contributor-link')
        },
        set ngId(ngId) {
          var a = this.elem.querySelector('.nrn-contributor-link')
          a.classList[ngId ? 'add' : 'remove']('nrn-ng-id-contributor-link')
          var b = this.elem.querySelector('.nrn-contributor-ng-id-button')
          b.textContent = ngId ? 'xID' : '+ID'
          b.dataset.type = ngId ? 'remove' : 'add'
        },
        get ngName() {
          var e = this.elem.querySelector('.nrn-matched-ng-contributor-name')
          return e ? e.textContent : ''
        },
        set ngName(ngName) {
          var b = this.elem.querySelector('.nrn-contributor-ng-name-button')
          b.textContent = ngName ? 'x名' : '+名'
          b.dataset.type = ngName ? 'remove' : 'add'
          b.dataset.matched = ngName
          emphasizeMatchedText(
            this.elem.querySelector('.nrn-contributor-link'),
            ngName,
            function(text) {
              var result = this.elem.ownerDocument.createElement('span')
              result.className = 'nrn-matched-ng-contributor-name'
              result.textContent = text
              return result
            }.bind(this))
        },
        _bindToContributor() {
          this.ngId = this.contributor.ngId
          this.ngName = this.contributor.ngName
          this._listeners.bind(this.contributor)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      })

      var ChannelView = function ChannelView(doc, contributor) {
        ContributorView.call(this, doc, contributor)
        this._listeners = new Listeners({ngChanged: set(this, 'ng')})
        this._bindToContributor()
      }
      ChannelView.prototype = createObject(ContributorView.prototype, {
        get _label() {
          return 'チャンネル:'
        },
        _setNgButton(e) {
          e.className = 'nrn-contributor-ng-button'
          e.textContent = '[+]'
          this._initContributorDataset(e.dataset)
        },
        get ng() {
          return this.elem.querySelector('.nrn-contributor-link')
            .classList.contains('nrn-ng-contributor-link')
        },
        set ng(ng) {
          var a = this.elem.querySelector('.nrn-contributor-link')
          a.classList[ng ? 'add' : 'remove']('nrn-ng-contributor-link')
          var b = this.elem.querySelector('.nrn-contributor-ng-button')
          b.textContent = ng ? '[x]' : '[+]'
          b.dataset.type = ng ? 'remove' : 'add'
        },
        _bindToContributor() {
          this.ng = this.contributor.ng
          this._listeners.bind(this.contributor)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      })

      ContributorView.new = function(doc, contributor) {
        switch (contributor.type) {
          case 'user': return new UserView(doc, contributor)
          case 'channel': return new ChannelView(doc, contributor)
          default: throw new Error(contributor.type)
        }
      }
      return ContributorView
    })()

    var MovieInfo = (function() {
      var createElem = function(doc) {
        var e = doc.createElement('P')
        e.className = 'nrn-error'
        var tagSection = doc.createElement('section')
        tagSection.className = 'nrn-info-section nrn-tag-section'
        var tagHead = doc.createElement('div')
        tagHead.className = 'nrn-info-section-title'
        tagHead.textContent = 'タグ'
        var t = doc.createElement('div')
        t.className = 'nrn-tag-container'
        tagSection.appendChild(tagHead)
        tagSection.appendChild(t)

        var contributorSection = doc.createElement('section')
        contributorSection.className = 'nrn-info-section nrn-contributor-section'
        var contributorHead = doc.createElement('div')
        contributorHead.className = 'nrn-info-section-title'
        contributorHead.textContent = '投稿者情報'
        var c = doc.createElement('div')
        c.className = 'nrn-contributor-container'
        contributorSection.appendChild(contributorHead)
        contributorSection.appendChild(c)

        var result = doc.createElement('div')
        result.className = 'nrn-movie-info-container'
        result.appendChild(e)
        result.appendChild(tagSection)
        result.appendChild(contributorSection)
        return result
      }
      var createToggle = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-movie-info-toggle'
        result.textContent = TOGGLE_OPEN_TEXT
        return result
      }
      var MovieInfo = function(doc) {
        this.elem = createElem(doc)
        this.toggle = createToggle(doc)
        this.togglable = true
        this._tagViews = []
        this._contributorView = null
        this._error = Movie.NO_ERROR
        this._actionPane = null
        this._listeners = new Listeners({
          tagsChanged: this._createAndSetTagViews.bind(this),
          contributorChanged: this._createAndSetContributorView.bind(this),
          errorChanged: set(this, 'error'),
        })
      }
      MovieInfo.prototype = {
        set actionPane(actionPane) {
          this._actionPane = actionPane
          this.elem.insertBefore(actionPane.elem, this.elem.firstChild)
        },
        get tagViews() { return this._tagViews },
        set tagViews(tagViews) {
          this._tagViews = tagViews
          var e = this.elem.querySelector('.nrn-tag-container')
          e.textContent = ''
          for (var v of tagViews) e.appendChild(v.elem)

          var title = this.elem.querySelector('.nrn-tag-section .nrn-info-section-title')
          if (title) {
            var lockedCount = tagViews.filter(function(v) { return v.locked }).length
            title.textContent = '🔒' + lockedCount + ' / ' + tagViews.length
            title.title = 'ロック済みタグ数 / 全タグ数'
          }
        },
        get contributorView() { return this._contributorView },
        set contributorView(contributorView) {
          if (this._contributorView && this._contributorView !== contributorView) {
            try { this._contributorView.unbind() } catch (e) {}
          }
          this._contributorView = contributorView
          var container = this.elem.querySelector('.nrn-contributor-container')
          container.textContent = ''
          var title = this.elem.querySelector('.nrn-contributor-section .nrn-info-section-title')
          if (contributorView) {
            container.appendChild(contributorView.elem)
            if (title) title.textContent = '投稿者情報'
          } else {
            if (title) title.textContent = '投稿者情報（取得できません）'
          }
        },
        get error() { return this._error },
        set error(error) {
          if (this._error === error) return
          this._error = error
          this.elem.querySelector('.nrn-error').textContent = error.message
        },
        hasAny() {
          return Boolean(this.elem.querySelector('.nrn-action-pane')
                      || this.elem.querySelector('.nrn-movie-tag')
                      || this.elem.querySelector('.nrn-contributor')
                      || this.error !== Movie.NO_ERROR)
        },
        _createAndSetTagViews(tags) {
          var d = this.elem.ownerDocument
          this.tagViews = tags.map(function(tag) {
            return new TagView(d, tag).bindToTag(tag)
          })
        },
        _createAndSetContributorView(contributor) {
          if (contributor === Contributor.NULL) return
          var d = this.elem.ownerDocument
          this.contributorView = ContributorView.new(d, contributor)
        },
        bindToMovie(movie) {
          this._createAndSetTagViews(movie.tags)
          this._createAndSetContributorView(movie.contributor)
          this.error = movie.error
          if (!movie.thumbInfoDone) this._listeners.bind(movie)
        },
        unbind() {
          this._listeners.unbind()
          this.tagViews.forEach(function(v) { v.unbind() })
          if (this.contributorView) this.contributorView.unbind()
          if (this._actionPane) this._actionPane.unbind()
        },
      }
      return MovieInfo
    })()

    var Description = (function() {
      var re = /(sm|so|nm|co|ar|im|lv|mylist\/|watch\/|user\/)(?:\d+)/g
      var typeToHRef = {
        sm: 'https://www.nicovideo.jp/watch/',
        so: 'https://www.nicovideo.jp/watch/',
        nm: 'https://www.nicovideo.jp/watch/',
        co: 'https://com.nicovideo.jp/community/',
        ar: 'https://ch.nicovideo.jp/article/',
        im: 'https://seiga.nicovideo.jp/seiga/',
        lv: 'http://live.nicovideo.jp/watch/',
        'mylist/': 'https://www.nicovideo.jp/',
        'watch/': 'https://www.nicovideo.jp/',
        'user/': 'https://www.nicovideo.jp/',
      }
      var createAnchor = function(doc, href, text) {
        var a = doc.createElement('a')
        a.target = '_blank'
        a.href = href
        a.textContent = text
        return a
      }
      var createCloseButton = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-description-close-button'
        result.textContent = TOGGLE_CLOSE_TEXT
        return result
      }
      var createElem = function(doc, closeButton) {
        var text = doc.createElement('span')
        text.className = 'nrn-description-text'
        var result = doc.createElement('p')
        result.className = 'itemDescription ranking nrn-description'
        result.appendChild(text)
        result.appendChild(closeButton)
        return result
      }
      var createOpenButton = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-description-open-button'
        result.textContent = TOGGLE_OPEN_TEXT
        return result
      }
      var Description = function(doc) {
        this.closeButton = createCloseButton(doc)
        this.elem = createElem(doc, this.closeButton)
        this.openButton = createOpenButton(doc)
        this.original = null
        this.text = ''
        this.linkified = false
        this.togglable = true
        this._listeners = new Listeners({
          'descriptionChanged': set(this, 'text'),
        })
      }
      Description.prototype = {
        linkify() {
          if (this.linkified) return
          this.linkified = true
          var t = this.text
          var d = this.elem.ownerDocument
          var f = d.createDocumentFragment()
          var lastIndex = 0
          for (var r; r = re.exec(t);) {
            f.appendChild(d.createTextNode(t.slice(lastIndex, r.index)))
            f.appendChild(createAnchor(d, typeToHRef[r[1]] + r[0], r[0]))
            lastIndex = re.lastIndex
          }
          f.appendChild(d.createTextNode(t.slice(lastIndex)))
          f.normalize()
          this.elem.firstChild.appendChild(f)
        },
        bindToMovie(movie) {
          this.text = movie.description
          this._listeners.bind(movie)
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return Description
    })()

    // --------------------------------------------------------------------
    // Movie card adapter: DOM representation only
    // Global policies (new-tab, diagnostics) live in Runtime services.
    // --------------------------------------------------------------------
    var MovieRoot = (function() {
      var MovieRoot = function(elem) {
        this.elem = elem
        var d = elem.ownerDocument
        this.movieInfo = new MovieInfo(d)
        this.description = new Description(d)
        this._openNewWindow = false
        this.movieTitle = null
        this._movieListeners = new Listeners({
          thumbInfoDone: this.setThumbInfoDone.bind(this),
        })
        this._movieViewModeListeners = new Listeners({
          changed: set(this, 'viewMode'),
        })
        this._configOpenNewWindowListeners = new Listeners({
          changed: set(this, 'openNewWindow'),
        })
        this._nrnBaselineRect = null
        this._nrnManualMovieInfoVisible = null
        this._nrnMovieInfoInteractionSeq = 0
        requestAnimationFrame(function() {
          if (!this.elem || !this.elem.isConnected) return
          var r = this.elem.getBoundingClientRect()
          if (r && r.width > 0 && r.height > 0) {
            this._nrnBaselineRect = {width:r.width, height:r.height}
          }
        }.bind(this))
      }
      MovieRoot.prototype = {
        markMovieAnchor() {
          for (var a of this._movieAnchors) a.dataset.nrnMovieAnchor = 'true'
        },
        set id(id) {
          for (var a of this._movieAnchors) a.dataset.nrnMovieId = id
        },
        get titleElem() {
          throw new Error('must be implemented')
        },
        set title(title) {
          this.titleElem.textContent = title
          for (var a of this._movieAnchors) a.dataset.nrnMovieTitle = title
        },
        get _reduced() {
          return this.elem.classList.contains('nrn-reduce')
        },
        _halfThumb() {},
        _restoreThumb() {},
        _reduce() {
          this.elem.classList.add('nrn-reduce')
          this._halfThumb()
        },
        _unreduce() {
          this.elem.classList.remove('nrn-reduce')
          this._restoreThumb()
        },
        get _hidden() {
          return this.elem.classList.contains('nrn-hide')
        },
        _hide() {
          if (this._movieInfoVisible) this._movieInfoVisible = false
          this.elem.classList.add('nrn-hide')
        },
        _show() {
          this.elem.classList.remove('nrn-hide')
        },
        get viewMode() {
          if (this.elem.classList.contains('nrn-reduce')) return 'reduce'
          if (this.elem.classList.contains('nrn-hide')) return 'hide'
          return 'doNothing'
        },
        set viewMode(viewMode) {
          if (this._reduced) this._unreduce()
          else if (this._hidden) this._show()
          switch (viewMode) {
            case 'reduce': this._reduce(); break
            case 'hide': this._hide(); break
            case 'doNothing': break
            default: throw new Error(viewMode)
          }
        },
        get _movieAnchorSelectors() {
          throw new Error('must be implemented')
        },
        get _movieAnchors() {
          var result = []
          for (var s of this._movieAnchorSelectors) {
            var a = this.elem.querySelector(s)
            if (a) result.push(a)
          }
          return result
        },
        get openNewWindow() { return this._openNewWindow },
        set openNewWindow(openNewWindow) {
          this._openNewWindow = Boolean(openNewWindow)
          var anchors = this._movieAnchors
          for (var a of anchors) {
            if (this._openNewWindow) {
              a.target = '_blank'
              a.rel = 'noopener noreferrer'
              a.dataset.nrnOpenNewTab = 'true'
            } else {
              if (a.dataset.nrnOpenNewTab === 'true') {
                a.removeAttribute('target')
                a.removeAttribute('rel')
                delete a.dataset.nrnOpenNewTab
              }
            }
          }
          if (typeof NewTabService !== 'undefined') {
            NewTabService.decorateWithin(this.elem, this._openNewWindow)
          }
        },
        get _movieInfoVisible() {
          return Boolean(this.movieInfo.elem.parentNode)
        },
        set _movieInfoVisible(visible) {
          if (visible) {
            this._pinMovieInfoTogglePosition()
            this._addMovieInfo()
            this.elem.classList.add('nrn-info-expanded')
            this.movieInfo.toggle.textContent = TOGGLE_CLOSE_TEXT
            this._startMovieInfoReserve()
            requestAnimationFrame(function() {
              this._auditMovieInfoLayout('opened')
            }.bind(this))
          } else {
            this._stopMovieInfoReserve()
            this.movieInfo.elem.remove()
            this.elem.classList.remove('nrn-info-expanded')
            this.movieInfo.toggle.textContent = TOGGLE_OPEN_TEXT
            requestAnimationFrame(function() {
              this._auditMovieInfoLayout('closed')
            }.bind(this))
          }
        },
        toggleMovieInfo() {
          if (!this.movieInfo || !this.movieInfo.hasAny()) return false
          var next = !this._movieInfoVisible
          this._nrnManualMovieInfoVisible = next
          this._nrnMovieInfoInteractionSeq++
          this._movieInfoVisible = next
          console.log('[NicoNicoRankingNG detail] ユーザー開閉:', {
            movieId:this.movieId || null,
            visible:next,
            seq:this._nrnMovieInfoInteractionSeq,
            pending:this.elem.classList.contains('nrn-autofill-pending'),
            hidden:this.elem.classList.contains('nrn-hide')
          })
          return true
        },
        setMovieInfoVisible(visible, source) {
          if (!this.movieInfo.hasAny()) return false
          var requested = Boolean(visible)
          if (source === 'user-bulk') {
            this._nrnManualMovieInfoVisible = requested
            this._nrnMovieInfoInteractionSeq++
          }
          this.setMovieInfoToggleIfRequired()
          this._pinMovieInfoTogglePosition()
          this._movieInfoVisible = requested
          return true
        },
        _pinMovieInfoTogglePosition(force) {
          if (this._disposed) return
          if (!this.elem || !this.elem.isConnected) return false
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected) return false
          if (!force && toggle.dataset.nrnPinned === 'true') return true

          var win = this.elem.ownerDocument.defaultView
          var rootStyle = win.getComputedStyle(this.elem)
          var toggleStyle = win.getComputedStyle(toggle)
          var rootRectBefore = this.elem.getBoundingClientRect()

          // 自動追加カードはNG判定中に display:none になる。
          // 非表示中に座標を測ると top=0 などを誤記録するため、表示後まで保留する。
          if (this.elem.classList.contains('nrn-autofill-pending')
              || rootStyle.display === 'none'
              || rootStyle.visibility === 'hidden'
              || toggleStyle.display === 'none'
              || rootRectBefore.width < 2
              || rootRectBefore.height < 2) {
            toggle.dataset.nrnPinWaiting = 'true'
            toggle.dataset.nrnPinned = 'false'
            toggle.classList.remove('nrn-toggle-pinned')
            toggle.style.removeProperty('--nrn-toggle-top')
            return false
          }

          // Measure the arrow in NicoNico's original card layout.
          // The detail panel must not affect this coordinate.
          var wasPinned = toggle.classList.contains('nrn-toggle-pinned')
          if (wasPinned) toggle.classList.remove('nrn-toggle-pinned')
          toggle.style.removeProperty('--nrn-toggle-top')

          var rootRect = this.elem.getBoundingClientRect()
          var toggleRect = toggle.getBoundingClientRect()
          var top = toggleRect.top - rootRect.top

          if (Number.isFinite(top) && top >= 0
              && toggleRect.width > 0 && toggleRect.height > 0) {
            toggle.style.setProperty('--nrn-toggle-top', (Math.round(top * 100) / 100) + 'px')
            toggle.dataset.nrnPinned = 'true'
            toggle.dataset.nrnPinWaiting = 'false'
            toggle.dataset.nrnBaselineTop = String(Math.round(top * 100) / 100)
            toggle.classList.add('nrn-toggle-pinned')
            return true
          }

          toggle.dataset.nrnPinWaiting = 'true'
          if (wasPinned) toggle.classList.add('nrn-toggle-pinned')
          return false
        },
        _scheduleMovieInfoTogglePin() {
          if (this._disposed) return
          if (this._nrnTogglePinScheduled) return
          this._nrnTogglePinScheduled = true
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              this._nrnTogglePinScheduled = false
              this._pinMovieInfoTogglePosition(false)
            }.bind(this))
          }.bind(this))
        },
        _refreshMovieInfoToggleAfterReveal() {
          if (!this.elem || !this.elem.isConnected) return false
          this.setMovieInfoToggleIfRequired()
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected) {
            console.warn('[NicoNicoRankingNG detail] 自動追加動画の▲▼生成失敗:', {
              movieId:this.movieId || null
            })
            return false
          }
          var ok = this._pinMovieInfoTogglePosition(true)
          if (!ok) this._scheduleMovieInfoTogglePin()
          return ok
        },
        _auditMovieInfoTogglePosition(reason) {
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected || toggle.dataset.nrnPinned !== 'true') return null
          var baselineTop = Number(toggle.dataset.nrnBaselineTop)
          var rootRect = this.elem.getBoundingClientRect()
          var toggleRect = toggle.getBoundingClientRect()
          var currentTop = toggleRect.top - rootRect.top
          var delta = Math.abs(currentTop - baselineTop)
          var result = {
            reason: reason || 'audit',
            movieId: this.movieId || null,
            baselineTop: Math.round(baselineTop * 100) / 100,
            currentTop: Math.round(currentTop * 100) / 100,
            delta: Math.round(delta * 100) / 100,
            expanded: this._movieInfoVisible
          }
          if (delta > 1.5) {
            console.warn('[NicoNicoRankingNG detail] ▲▼位置ずれを検出:', result)
          }
          return result
        },
        _auditMovieInfoLayout(reason) {
          if (!this.elem || !this.elem.isConnected) return null
          var cardRect = this.elem.getBoundingClientRect()
          var detail = this.movieInfo && this.movieInfo.elem
          var detailRect = detail && detail.isConnected ? detail.getBoundingClientRect() : null
          var reserve = Number(this.elem.dataset.nrnDetailReserve || 0)
          var toggleAudit = this._auditMovieInfoTogglePosition(reason)
          var overlaps = []
          if (detailRect && detailRect.width > 0 && detailRect.height > 0) {
            Array.from(this.elem.ownerDocument.querySelectorAll('.nrn-parsed')).forEach(function(other) {
              if (other === this.elem || !other.isConnected) return
              var r = other.getBoundingClientRect()
              var x = Math.min(detailRect.right, r.right) - Math.max(detailRect.left, r.left)
              var y = Math.min(detailRect.bottom, r.bottom) - Math.max(detailRect.top, r.top)
              if (x > 2 && y > 2) overlaps.push({
                id:other.getAttribute('data-decoration-video-id')
                  || (other.querySelector('[data-decoration-video-id]')
                    && other.querySelector('[data-decoration-video-id]').getAttribute('data-decoration-video-id'))
                  || '',
                overlapX:Math.round(x), overlapY:Math.round(y)
              })
            }.bind(this))
          }
          var result = {
            reason:reason || 'audit', movieId:this.movieId || null,
            expanded:Boolean(this._movieInfoVisible),
            cardWidth:Math.round(cardRect.width * 10) / 10,
            cardHeight:Math.round(cardRect.height * 10) / 10,
            detailWidth:detailRect ? Math.round(detailRect.width * 10) / 10 : 0,
            detailHeight:detailRect ? Math.round(detailRect.height * 10) / 10 : 0,
            reserve:reserve,
            toggleDelta:toggleAudit ? toggleAudit.delta : null,
            overlaps:overlaps.length,
            ok:(!toggleAudit || toggleAudit.delta <= 1.5) && overlaps.length === 0
          }
          if (!result.ok) {
            console.warn('[NicoNicoRankingNG detail] レイアウト異常を検出:', result)
            if (overlaps.length) console.table(overlaps)
          } else {
            console.log('[NicoNicoRankingNG detail] レイアウト監査:', result)
          }
          window.__nrnLastLayoutAudit = result
          return result
        },
        _syncMovieInfoReserve() {
          if (this._disposed) return
          if (!this.elem || !this.elem.isConnected || !this._movieInfoVisible) return
          var info = this.movieInfo && this.movieInfo.elem
          if (!info || !info.isConnected) return
          var rect = info.getBoundingClientRect()
          var height = Math.max(
            Number(rect && rect.height) || 0,
            Number(info.scrollHeight) || 0,
            Number(info.offsetHeight) || 0
          )
          var reserve = Math.ceil(height + 10)
          if (reserve < 10) reserve = 10
          this.elem.style.setProperty('--nrn-detail-reserve', reserve + 'px')
          this.elem.dataset.nrnDetailReserve = String(reserve)

          if (this._nrnBaselineRect) {
            var current = this.elem.getBoundingClientRect()
            var widthDelta = Math.abs(current.width - this._nrnBaselineRect.width)
            this.elem.dataset.nrnDetailWidthDelta = String(Math.round(widthDelta * 100) / 100)
            if (widthDelta > 1.5) {
              console.warn('[NicoNicoRankingNG detail] カード幅が変化しました（本来は0pxのはず）', {
                id:this.movieInfo && this.movieInfo.movieId,
                before:this._nrnBaselineRect.width,
                after:current.width,
                delta:widthDelta,
                reserve:reserve
              })
            }
          }
        },
        _startMovieInfoReserve() {
          this._stopMovieInfoReserve()
          var sync = function() {
            this._syncMovieInfoReserve()
          }.bind(this)
          this._nrnMovieInfoReserveSync = sync
          requestAnimationFrame(function() {
            sync()
            requestAnimationFrame(sync)
          })
          if (typeof ResizeObserver !== 'undefined') {
            this._nrnMovieInfoReserveObserver = new ResizeObserver(sync)
            this._nrnMovieInfoReserveObserver.observe(this.movieInfo.elem)
          }
        },
        _stopMovieInfoReserve() {
          if (this._nrnMovieInfoReserveObserver) {
            try { this._nrnMovieInfoReserveObserver.disconnect() } catch (e) {}
            this._nrnMovieInfoReserveObserver = null
          }
          this._nrnMovieInfoReserveSync = null
          if (this.elem) {
            this.elem.style.removeProperty('--nrn-detail-reserve')
            delete this.elem.dataset.nrnDetailReserve
          }
        },
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          throw new Error('must be implemented')
        },
        _addMovieInfoToggle() {
          this.elem.querySelector('.itemData')
            .appendChild(this.movieInfo.toggle)
          this._scheduleMovieInfoTogglePin()
        },
        setMovieInfoToggleIfRequired() {},
        _updateByMovieInfoTogglable() {
          if (!this.movieInfo.hasAny()) return
          if (this.movieInfo.togglable) {
            this._addMovieInfoToggle()
            var desired = this._nrnManualMovieInfoVisible
            if (desired == null) desired = false
            if (this._movieInfoVisible !== desired) this._movieInfoVisible = desired
          } else {
            this.movieInfo.toggle.remove()
            if (!this._movieInfoVisible) this._movieInfoVisible = true
          }
        },
        get movieInfoTogglable() {
          return this.movieInfo.togglable
        },
        set movieInfoTogglable(movieInfoTogglable) {
          this.movieInfo.togglable = movieInfoTogglable
          this._updateByMovieInfoTogglable()
        },
        _queryOriginalDescriptionElem() {
          return this.elem.querySelector('.itemDescription')
        },
        get _originalDescriptionElem() {
          var result = this.description.original
          if (!result) {
            result
              = this.description.original
              = this._queryOriginalDescriptionElem()
          }
          return result
        },
        get _descriptionExpanded() {
          return Boolean(this.description.elem.parentNode)
        },
        set _descriptionExpanded(expanded) {
          var o = this._originalDescriptionElem
          var d = this.description
          if (expanded && o.parentNode) {
            d.linkify()
            o.parentNode.replaceChild(d.elem, o)
          } else if (!expanded && d.elem.parentNode) {
            d.elem.parentNode.replaceChild(o, d.elem)
          }
        },
        _updateByDescriptionTogglable() {
          if (!this.description.text) return
          if (this.description.togglable) {
            this._originalDescriptionElem?.appendChild(this.description.openButton)
            this.description.elem.appendChild(this.description.closeButton)
          } else {
            this.description.closeButton.remove()
          }
          this._descriptionExpanded = !this.description.togglable
        },
        toggleDescription() {
          this._descriptionExpanded = !this._descriptionExpanded
        },
        get descriptionTogglable() {
          return this.description.togglable
        },
        set descriptionTogglable(descriptionTogglable) {
          this.description.togglable = descriptionTogglable
          this._updateByDescriptionTogglable()
        },
        setThumbInfoDone() {
          this.elem.classList.add('nrn-thumb-info-done')
        },
        get thumbInfoDone() {
          return this.elem.classList.contains('nrn-thumb-info-done')
        },
        bindToMovie(movie) {
          this.movieInfo.bindToMovie(movie)
          this.description.bindToMovie(movie)
          if (movie.thumbInfoDone) this.setThumbInfoDone()
          else this._movieListeners.bind(movie)
        },
        bindToMovieViewMode(movieViewMode) {
          this.viewMode = movieViewMode.value
          this._movieViewModeListeners.bind(movieViewMode)
        },
        bindToConfig(config) {
          this.openNewWindow = config.openNewWindow.value
          this._configOpenNewWindowListeners.bind(config.openNewWindow)
        },
        unbind() {
          this._disposed = true
          this.movieInfo.unbind()
          this._stopMovieInfoReserve()
          this.description.unbind()
          this._movieListeners.unbind()
          this._movieViewModeListeners.unbind()
          this._configOpenNewWindowListeners.unbind()
          if (this.movieTitle) this.movieTitle.unbind()
        },
        preventPageTransition(config) {},
      }
      return MovieRoot
    })()

    var ConfigBar = (function() {
      var createConfigBar = function(doc) {
        var html = `<div id=nrn-config-bar>
    <label>
      閲覧済みの動画を
      <select id=nrn-visited-movie-view-mode-select>
        <option value=reduce>縮小</option>
        <option value=hide>非表示</option>
        <option value=doNothing>通常表示</option>
      </select>
    </label>
    |
    <label>
      投稿者
      <select id=nrn-visible-contributor-type-select>
        <option value=all>全部</option>
        <option value=user>ユーザー</option>
        <option value=channel>チャンネル</option>
      </select>
    </label>
    |
    <label><input type=checkbox id=nrn-ng-movie-visible-checkbox> NG動画を表示</label>
    <span class=nrn-config-separator>|</span>
    <span class=nrn-detail-bulk-label>タグ・投稿者情報</span>
    <button type=button id=nrn-open-all-movie-info>全て開く</button>
    <button type=button id=nrn-close-all-movie-info>全て閉じる</button>
    <span class=nrn-config-separator>|</span>
    <span id=nrn-config-button>設定</span>
  </div>`
        var e = doc.createElement('div')
        e.innerHTML = html
        var result = e.firstChild
        result.remove()
        return result
      }
      var ConfigBar = function(doc) {
        this.elem = createConfigBar(doc)
      }
      ConfigBar.prototype = {
        get _viewModeSelect() {
          return this.elem.querySelector('#nrn-visited-movie-view-mode-select')
        },
        get visitedMovieViewMode() {
          return this._viewModeSelect.value
        },
        set visitedMovieViewMode(viewMode) {
          this._viewModeSelect.value = viewMode
        },
        get _visibleContributorTypeSelect() {
          return this.elem.querySelector('#nrn-visible-contributor-type-select')
        },
        get visibleContributorType() {
          return this._visibleContributorTypeSelect.value
        },
        set visibleContributorType(type) {
          this._visibleContributorTypeSelect.value = type
        },
        get _ngMovieVisibleCheckbox() {
          return this.elem.querySelector('#nrn-ng-movie-visible-checkbox')
        },
        get ngMovieVisible() {
          return this._ngMovieVisibleCheckbox.checked
        },
        set ngMovieVisible(visible) {
          this._ngMovieVisibleCheckbox.checked = visible
        },
        bindToConfig(config) {
          this.visitedMovieViewMode = config.visitedMovieViewMode.value
          this.visibleContributorType = config.visibleContributorType.value
          this.ngMovieVisible = config.ngMovieVisible.value
          config.visitedMovieViewMode.on('changed', set(this, 'visitedMovieViewMode'))
          config.visibleContributorType.on('changed', set(this, 'visibleContributorType'))
          config.ngMovieVisible.on('changed', set(this, 'ngMovieVisible'))
          return this
        },
      }
      return ConfigBar
    })()

    var NicoPage = function(doc) {
      this.doc = doc
      this._toggleToMovieRoot = new Map()
    }
    NicoPage.prototype = {
      dispose() {
        this._disposed = true
        this._abortController?.abort()
        this._observer?.disconnect()
        for (const observer of this._observers || []) observer.disconnect()
        for (const root of new Set(this._toggleToMovieRoot.values())) {
          root.unbind()
          if (root.elem.dataset.nrnAutofill === 'true') { root.elem.remove(); continue }
          for (const node of [root.movieInfo.elem, root.movieInfo.toggle, root.description.elem,
              root.description.openButton, root.description.closeButton]) node?.remove()
          root.elem.querySelectorAll('.nrn-action-pane, .nrn-self-ad-warning, .nrn-self-ad-inline-badge, .nrn-self-ad-card-badge').forEach(node => node.remove())
          const title = root.movieTitle?.elem
          if (title?.classList.contains('nrn-movie-title')) title.replaceWith(this.doc.createTextNode(title.textContent))
          for (const saved of root._nrnOriginalAnchors || []) {
            for (const name of ['target', 'rel']) {
              if (saved[name] == null) saved.node.removeAttribute(name)
              else saved.node.setAttribute(name, saved[name])
            }
          }
          for (const node of [root.elem, ...root.elem.querySelectorAll('*')]) {
            for (const name of Array.from(node.classList)) if (name.startsWith('nrn-')) node.classList.remove(name)
            for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-nrn-')) node.removeAttribute(attr.name)
          }
        }
        this._toggleToMovieRoot.clear()
        this.movieRoots = []
        for (const node of this._dialogNodes || []) node.remove()
        this.doc.getElementById('nrn-config-bar')?.remove()
        this.doc.getElementById('nrn-status-badge')?.remove()
      },
      createConfigBar() {
        return new ConfigBar(this.doc)
      },
      createTables() { return [] },
      createMovieRoot() {
        throw new Error('must be implemented')
      },
      get _configBarContainer() {
        throw new Error('must be implemented')
      },
      addConfigBar(bar) {
        var target = this._configBarContainer
        if (target) {
          target.insertBefore(bar.elem, target.firstChild);
        }
      },
      parse() {
        throw new Error('must be implemented')
      },
      mapToggleTo(movieRoot) {
        var m = this._toggleToMovieRoot
        m.set(movieRoot.movieInfo.toggle, movieRoot)
        m.set(movieRoot.description.openButton, movieRoot)
        m.set(movieRoot.description.closeButton, movieRoot)
      },
      unmapToggleFrom(movieRoot) {
        var m = this._toggleToMovieRoot
        m.delete(movieRoot.movieInfo.toggle)
        m.delete(movieRoot.description.openButton)
        m.delete(movieRoot.description.closeButton)
      },
      getMovieRootBy(toggle) {
        return this._toggleToMovieRoot.get(toggle)
      },
      _configDialogLoaded() {},
      showConfigDialog(config) {
        var back = this.doc.createElement('div')
        back.style.backgroundColor = 'black'
        back.style.opacity = '0.58'
        back.style.zIndex = '10000'
        back.style.backdropFilter = 'blur(3px)'
        back.style.position = 'fixed'
        back.style.top = '0'
        back.style.left = '0'
        back.style.width = '100%'
        back.style.height = '100%'
        this.doc.body.appendChild(back)

        var f = this.doc.createElement('iframe')
        f.style.position = 'fixed'
        f.style.top = '0'
        f.style.left = '0'
        f.style.width = '100%'
        f.style.height = '100%'
        f.style.zIndex = '10001'
        f.srcdoc = ConfigDialog.SRCDOC
        f.addEventListener('load', function loaded() {
          if (this._disposed) return
          this._configDialogLoaded(f.contentDocument)
          var themeResult = DetailUiTheme.resolve(config, this.doc)
          f.contentDocument.documentElement.dataset.nrnTheme = themeResult.resolved
          const openInTab = typeof GM_openInTab === 'undefined'
                            ? GM.openInTab : GM_openInTab
          new ConfigDialog(config, f.contentDocument, openInTab)
            .on('closed', function() {
              if (f.isConnected) f.remove()
              if (back.isConnected) back.remove()
            })
        }.bind(this))
        this.doc.body.appendChild(f)
        this._dialogNodes = [back, f]
      },
      bindToConfig() {},
      get css() {
        throw new Error('must be implemented')
      },
      observeMutation() {},
    }
    Object.assign(NicoPage, {
      MovieTitle,
      ActionPane,
      TagView,
      ContributorView,
      MovieInfo,
      Description,
      MovieRoot,
      ConfigBar,
    })
    return NicoPage
  })()
