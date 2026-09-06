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
          this.movieInfo.unbind()
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
            if (e.target.classList.contains('nrn-movie-tag-link') || e.target.classList.contains('nrn-contributor-link')) {
              NewTabService.open(e.target.href)
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
            const a = this.elem.querySelector('a[data-anchor-area][href^="/watch/"] > div > p');
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
        return parseInt(new URLSearchParams(location.search).get('page') || '1', 10) || 1
      },
      _paginationSnapshot() {
        var current = this._currentPageNumber
        var pathname = location.pathname
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
        var url = new URL(location.href)
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
        var res = await fetch(url.toString(), {
          credentials: 'same-origin',
          cache: 'no-store'
        })
        if (!res.ok) {
          var httpError = new Error('HTTP ' + res.status)
          httpError.status = res.status
          httpError.pageNumber = pageNumber
          httpError.url = url.toString()
          throw httpError
        }

        var responseReceivedAt = performance.now()
        var html = await res.text()
        var bodyReadAt = performance.now()
        var doc = new DOMParser().parseFromString(html, 'text/html')
        var parsedAt = performance.now()

        var items = []
        var maxPage = null
        var hasNextPage = null

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

            if (Number.isFinite(Number(jsonMaxPage))) {
              maxPage = Number(jsonMaxPage)
            }
            if (searchData && Array.isArray(searchData.items)) {
              items = searchData.items
            }
          } catch (e) {
            console.warn(fetchLog, 'server-response JSON解析失敗。DOM解析へ切り替えます。', e)
          }
        }

        // JSON側の構造が変更されていた場合は、実際の現行タイルDOMを直接読む。
        if (!items.length) {
          var roots = Array.from(doc.querySelectorAll('[data-decoration-video-id]'))
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
              owner: {
                id: ownerId,
                name: ownerNameElem ? ownerNameElem.textContent.trim() : '',
                iconUrl: ownerImg ? ownerImg.getAttribute('src') : ''
              }
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
            hasNextPage = pageNumbers.some(function(n){return n > pageNumber})
            if (!hasNextPage && pageNumbers.length) hasNextPage = false
          }
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
        var ownerUrl = owner.id ? ('https://www.nicovideo.jp/user/' + owner.id) : ''
        var root = doc.createElement('div')
        root.className = 'Pressable cursor_pointer d_flex cq-t_inline-size min-w_thumbnail.min max-w_thumbnail.max w_100% nrn-autofill-pending'
        root.setAttribute('data-decoration-video-id', item.id)
        root.setAttribute('data-nrn-autofill', 'true')
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
        this._appendInjectedTile(root)
        // 自動追加分では1本ごとのニコニコ広告API通信を省略して高速化する。
        // 元ページ側の広告表示には影響しない。
        return root
      },
      async _applyAdDecoration(root, videoId) {
        try {
          var res = await fetch('https://api.nicoad.nicovideo.jp/v1/contents/video/' + videoId, {credentials: 'omit'})
          if (!res.ok) return
          var json = await res.json()
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
          sponsorDiv.className = 'd_flex flex-d_column ' + colorClass
          var nameSpan = this.doc.createElement('span')
          nameSpan.className = 'fs_s fw_bold lc_1 min-h_font'
          nameSpan.textContent = '提供：' + (data.ownerName || '')
          var pointSpan = this.doc.createElement('span')
          pointSpan.className = 'd_inline-flex ai_center gap_x0_5 fs_s min-h_font'
          pointSpan.innerHTML = NICOAD_POINT_ICON_SVG
          pointSpan.appendChild(this.doc.createTextNode((data.totalPoint || 0).toLocaleString() + 'pt'))
          sponsorDiv.appendChild(nameSpan)
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
        const e = this.doc.querySelector('[aria-label="nicovideo-content"] section > div:first-of-type');
        if (e) {
          e.after(bar.elem);
          return;
        }
        this.doc.querySelector('[aria-label="nicovideo-content"] .grid-area_header')?.append(bar.elem);
      },
      parse(target) {
        if (!isTargetPage()) return [];
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
              rootElem: SearchPage.is(location)
                      ? item.parentNode.parentNode
                      : item.parentNode.parentNode.parentNode.parentNode,
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
      observeMutation(callback) {
        new MutationObserver((records, observer) => {
          if (!isTargetPage()) return;
          const parsed = this.parse();
          if (parsed.length > 0) {
            callback(parsed, true);
            this.unbindUnconnectedMovieRoots();
          }
          this.addConfigBar();
        }).observe(this.doc.body, {childList: true, subtree: true});
      },
      get css() {
        return `#nrn-config-button,
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
  display: block;
  inset: auto 0 0 auto;
  width: 22px;
  min-width: 22px;
  height: 20px;
  padding: 0;
  color: #777f89;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
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
  &.nrn-thumb-info-done {
    visibility: inherit;
  }
}
`;
      },
    })
    return ListPage
  })(NicoPage)

  var SearchPage = (function(_super) {

    var AbstractMovieRoot = (function(_super) {
      var AbstractMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      AbstractMovieRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          return this.elem.querySelector('.itemTitle a')
        },
        get _movieAnchorSelectors() {
          return ['.itemTitle a', '.itemThumbWrap']
        },
        bindToConfig(config) {
          _super.prototype.bindToConfig.call(this, config)
          this.movieInfoTogglable = config.movieInfoTogglable.value
          config.movieInfoTogglable.on('changed', set(this, 'movieInfoTogglable'))
          this.descriptionTogglable = config.descriptionTogglable.value
          config.descriptionTogglable.on('changed', set(this, 'descriptionTogglable'))
        },
      })
      return AbstractMovieRoot
    })(_super.MovieRoot)

    var FixedThumbMovieRoot = (function(_super) {
      var FixedThumbMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      FixedThumbMovieRoot.prototype = createObject(_super.prototype, {
        _getThumbElement() {
          const e = this.elem.querySelector('.thumb')
          return e ? e : this.elem.querySelector('.backgroundThumbnail')
        },
        _halfThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-9px'
          s.width = '80px'
          s.height = '63px'
        },
        _restoreThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-15px'
          s.width = '160px'
          s.height = ''
        },
      })
      return FixedThumbMovieRoot
    })(AbstractMovieRoot)

    var TwoColumnMovieRoot = (function(_super) {
      var TwoColumnMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      TwoColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return TwoColumnMovieRoot
    })(FixedThumbMovieRoot)

    var FourColumnMovieRoot = (function(_super) {
      var FourColumnMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-4-column-item')
      }
      FourColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return FourColumnMovieRoot
    })(FixedThumbMovieRoot)

    var MovieRoot = (function(_super) {
      var MovieRoot = function(elem) {
        _super.call(this, elem)
      }
      MovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.querySelector('.itemContent')
            .appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return MovieRoot
    })(FixedThumbMovieRoot)

    var SubMovieRoot = (function(_super) {
      var SubMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-sub-movie-root')
      }
      SubMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return SubMovieRoot
    })(AbstractMovieRoot)

    var createMainMovieRoot = function(rootElem) {
      var singleColumnView = Boolean(rootElem.getElementsByClassName('videoList01Wrap').length)
      if (singleColumnView) return new MovieRoot(rootElem)
      var twoColumnView = Boolean(rootElem.getElementsByClassName('videoList02Wrap').length)
      if (twoColumnView) return new TwoColumnMovieRoot(rootElem)
      return new FourColumnMovieRoot(rootElem)
    }
    var SearchPage = function(doc) {
      _super.call(this, doc)
    }
    SearchPage.prototype = createObject(_super.prototype, {
      removeEmbeddedStyle() {
        const nodeList = document.querySelectorAll('.itemContent[style="visibility: visible;"]');
        for (const node of Array.from(nodeList)) {
          node.style.visibility = '';
        }
      },
      parse(target) {
        target = target || this.doc
        return this._parseMain(target).concat(this._parseSub(target))
      },
      _parseItem(item) {
        return {
          type: 'main',
          movie: {
            id: item.dataset.videoId,
            title: item.querySelector('.itemTitle a').title,
          },
          rootElem: item,
        }
      },
      parseAutoPagerizedNodes(target) {
        return [this._parseItem(target)]
      },
      _parseMain(target) {
        return Array.from(target.querySelectorAll('.contentBody.video.uad .item[data-video-item]'))
          .map(item => this._parseItem(item))
      },
      _parseSub(target) {
        return Array.from(target.querySelectorAll('#tsukuaso .item'))
          .map(function(item) {
            return {
              type: 'sub',
              movie: {
                id: item.querySelector('.itemThumb').dataset.id,
                title: item.querySelector('.itemTitle a').textContent,
              },
              rootElem: item,
            }
          })
      },
      get _configBarContainer() {
        return this.doc.querySelector('.column.main')
      },
      createMovieRoot(resultOfParsing) {
        switch (resultOfParsing.type) {
          case 'main':
          case 'ad':
            return createMainMovieRoot(resultOfParsing.rootElem)
          case 'sub':
            return new SubMovieRoot(resultOfParsing.rootElem)
          default:
            throw new Error(resultOfParsing.type)
        }
      },
      observeMutation(callback) {
        const nodeList = document.querySelectorAll('.contentBody.video.uad .item.nicoadVideoItem .itemContent')
        for (const node of Array.from(nodeList)) {
          new MutationObserver((records, observer) => {
            for (const r of records) {
              if (SearchPage._isGettingAdDone(r)) {
                observer.disconnect()
                r.target.style.visibility = ''
                const item = ancestor(r.target, '.item.nicoadVideoItem')
                callback([SearchPage._parseAdItem(item)])
                return
              }
            }
          }).observe(node, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['style'],
          })
        }
      },
      get css() {
        return `#nrn-config-bar {
  margin: 10px 0;
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:6px;
}
#nrn-open-all-movie-info,
#nrn-close-all-movie-info {
  padding:2px 7px;
  border:1px solid #ccd1d8;
  border-radius:6px;
  background:#fff;
  color:#4e5661;
  cursor:pointer;
}
#nrn-open-all-movie-info:hover,
#nrn-close-all-movie-info:hover { background:#eef2f6; }
.nrn-detail-bulk-label { color:#6c737d; font-size:.92em; }
.nrn-config-separator { color:#b0b5bc; }
#nrn-config-button,
.nrn-visit-button:hover,
.nrn-movie-ng-button:hover,
.nrn-title-ng-button:hover,
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-movie-info-toggle:hover,
.nrn-description-open-button:hover,
.nrn-description-close-button:hover {
  text-decoration: underline;
  cursor: pointer;
}
.nrn-description-open-button {
  position: absolute;
  bottom: 0;
  right: 0;
  background-color: white;
}
.nrn-description-text,
.nrn-description-close-button {
  display: block;
}
.nrn-description-close-button {
  text-align: right;
}
.itemData,
.itemDescription,
.nicoadVideoItemWrapper {
  position: relative;
}
.nrn-movie-tag {
  display:grid;
  grid-template-columns:18px minmax(0,1fr) auto;
  align-items:start;
  gap:5px;
  min-width:0;
  margin:0;
  padding:6px 2px;
  border:0;
  border-bottom:1px solid #edf0f2;
  border-radius:0;
  background:transparent;
  font-size:13px;
  line-height:1.55;
}
.nrn-movie-tag:last-child { border-bottom:0; }
.nrn-movie-tag:hover { background:#f6f7f8; }
.nrn-movie-tag.nrn-locked-tag { background:transparent; }
.nrn-tag-lock-indicator { display:inline-flex; width:18px; min-width:18px; justify-content:center; color:#9b7c23; font-size:12px; line-height:1.55; filter:saturate(.72); }
.nrn-tag-lock-placeholder { visibility:hidden; }
.nrn-movie-tag-link { min-width:0; overflow-wrap:anywhere; word-break:break-word; }
.nrn-description-open-button,
.nrn-description-close-button,
.nrn-movie-tag-link,
.nrn-contributor-link {
  color: #333333;
}
.nrn-tag-ng-button,
.nrn-contributor-ng-button,
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button {
  display:inline-flex;
  align-items:center;
  min-height:20px;
  padding:1px 6px;
  border:1px solid #d3d7dc;
  border-radius:6px;
  background:transparent;
  color:#6f7781;
  font-size:11px;
  line-height:1.4;
  cursor:pointer;
}
.nrn-tag-ng-button { align-self:center; white-space:nowrap; opacity:.78; transition:opacity .12s ease,background-color .12s ease,border-color .12s ease; }
.nrn-movie-tag:hover .nrn-tag-ng-button,
.nrn-tag-ng-button:focus-visible { opacity:1; }
@media (hover:none) { .nrn-tag-ng-button { opacity:1; } }
.nrn-info-section + .nrn-info-section { margin-top:9px; padding-top:9px; border-top:1px solid #eceef1; }
.nrn-info-section-title { margin-bottom:5px; color:#717782; font-size:11px; font-weight:700; }
.nrn-tag-container { display:block; min-width:0; }
.nrn-contributor { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:7px 8px; min-width:0; padding:7px 2px; font-size:13px; line-height:1.5; border-radius:0; background:transparent; }
.nrn-contributor .nrn-user-ng-button,.nrn-contributor > .nrn-contributor-ng-button { grid-column:1 / -1; justify-self:start; }
.nrn-contributor-link { min-width:0; overflow-wrap:anywhere; }
.nrn-contributor-kind { padding:2px 6px; border-radius:999px; background:#e9edf2; color:#626a75; font-size:10px; font-weight:700; }
.nrn-user-ng-button { display:inline-flex; flex-wrap:wrap; gap:4px; margin-left:auto; }
.nrn-movie-tag-link.nrn-movie-ng-tag-link,
.nrn-contributor-link.nrn-ng-contributor-link,
.nrn-matched-ng-contributor-name,
.nrn-matched-ng-title {
  color: white;
  background-color: fuchsia;
}
.nrn-movie-info-container {
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  z-index:12;
  box-sizing:border-box;
  width:100%;
  margin:0;
  padding:8px 0 4px;
  background:transparent;
  color:#262b31;
  border:0;
  border-top:1px solid #e1e4e8;
  border-radius:0;
  box-shadow:none;
  overflow:visible;
}
.nrn-parsed {
  align-self: start !important;
}
.nrn-parsed.nrn-info-expanded {
  position:relative !important;
  margin-bottom:var(--nrn-detail-reserve,0px) !important;
  overflow:visible !important;
}
.nrn-movie-info-container .nrn-action-pane {
  line-height: 1.3em;
  padding: 0 0 6px;
  margin-bottom: 7px;
  border-bottom: 1px dashed #e2e5e8;
}
.nrn-movie-info-container .nrn-tag-container,
.nrn-movie-info-container .nrn-contributor-container {
  line-height: 1.5em;
  padding-top: 4px;
}
.videoList01 .itemContent .itemDescription.ranking.nrn-description {
  height: auto;
  width: auto;
}
.nrn-movie-info-toggle {
  color: #333333;
  font-size: 85%;
}
.videoList01 .nrn-movie-info-toggle {
  position: absolute;
  right: 0;
  top: 0;
}
.videoList02 .nrn-movie-info-toggle,
.nrn-4-column-item .nrn-movie-info-toggle {
  display: block;
  text-align: right;
}
.videoList02 .nrn-movie-info-container {
  clear: both;
}
.nrn-hide,
.videoList02 .item.nrn-hide,
.video .item.nrn-4-column-item.nrn-hide,
.uad .nicoadVideoItemWrapper .nicoadVideoItem.nrn-hide,
.item[data-video-item-muted] {
  display: none;
}
.item.nrn-reduce .videoList01Wrap,
.item.nrn-reduce .videoList02Wrap {
  width: 80px;
}
.item.nrn-reduce .itemThumbBox,
.item.nrn-reduce .itemThumbBox .itemThumb,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap img,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap img {
  width: 80px;
  height: 45px;
}
.videoList01 .nrn-action-pane,
.videoList02 .nrn-action-pane {
  display: none;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 3px;
  color: #999;
  background-color: rgb(105, 105, 105);
  z-index: 11;
}
.videoList02 .nrn-action-pane {
  font-size: 85%;
}
.videoList01 .item:hover .nrn-action-pane,
.videoList02 .item:hover .nrn-action-pane,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane {
  display: block;
}
.videoList01 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  color: white;
}
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  margin-left: 5px;
  border-left: solid thin;
  padding-left: 5px;
}
.nrn-user-ng-button,
.nrn-tag-ng-button {
  display: inline-block;
}
.nrn-ng-movie-title,
.nrn-contributor-link.nrn-ng-id-contributor-link {
  text-decoration: line-through;
}
.nrn-sub-movie-root {
  position: relative;
}
.nrn-sub-movie-root .nrn-movie-info-toggle {
  display: block;
  text-align: right;
  background-color: white;
}
.nrn-sub-movie-root .nrn-movie-info-container {
  clear: left;
  padding: 10px 0 15px 0;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-title-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-title-ng-button {
  display: inline-block;
  color: #333333;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button {
  margin-right: 0.5em;
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

.videoList02 .item,
.video .item.nrn-4-column-item {
  float: none;
  display: inline-block;
  vertical-align: top;
}
.video .item.nrn-4-column-item:nth-child(4n+1) {
  clear: none;
}
.nrn-4-column-item .nrn-movie-tag {
  display: block;
}
`
      },
    })
    Object.assign(SearchPage, {
      TwoColumnMovieRoot,
      FourColumnMovieRoot,
      is(location) {
        var p = location.pathname
        return p.startsWith('/search/') || p.startsWith('/tag/')
      },
      _isGettingAdDone(mutationRecord) {
        const r = mutationRecord
        return r.attributeName === 'style'
            && r.oldValue.includes('visibility: hidden;')
            && r.target.getAttribute('style').includes('visibility: visible;')
      },
      _parseAdItem(item) {
        const p = item.querySelector('.count.ads .value a').pathname
        return {
          type: 'ad',
          movie: {
            id: p.slice(p.lastIndexOf('/') + 1),
            title: item.querySelector('.itemTitle a').textContent,
          },
          rootElem: ancestor(item, '.nicoadVideoItemWrapper'),
        }
      },
      pendingMoviesInvisibleCss() {
        return `.contentBody.video.uad .item,
#tsukuaso .item,
.contentBody.video.uad .nicoadVideoItemWrapper {
  visibility: hidden;
}
.contentBody.video.uad .item[data-video-item-muted],
.contentBody.video.uad .item[data-video-item-sensitive],
.contentBody.video.uad .item.nrn-thumb-info-done,
#tsukuaso .item.nrn-thumb-info-done,
.contentBody.video.uad.searchUad .item,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done .item {
  visibility: inherit;
}
`
      },
    })
    return SearchPage
  })(NicoPage)

  // ========================================================================
  // Runtime services (v14.0)
  // Cross-cutting behavior belongs here instead of individual card classes.
  // ========================================================================

