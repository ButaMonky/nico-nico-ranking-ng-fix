  var MovieViewMode = (function(_super) {
    var MovieViewMode = function(movie, config) {
      _super.call(this)
      this.movie = movie
      this.config = config
      this.value = this._newViewMode()
    }
    MovieViewMode.prototype = createObject(_super.prototype, {
      _isHiddenByNg() {
        return !this.config.ngMovieVisible.value && this.movie.ng
      },
      _isHiddenByContributorType() {
        var c = this.movie.contributor
        if (c === Contributor.NULL) {
          return this.movie.thumbInfoDone && !this.config.unknownContributorMovieVisible.value;
        }
        var t = this.config.visibleContributorType.value
        return !(t === 'all' || t === c.type)
      },
      _isHiddenByVisitedMovieViewMode() {
        return this.movie.visited
            && this.config.visitedMovieViewMode.value === 'hide'
      },
      _isHidden() {
        return this.movie.error.type === 'DELETED'
            || this._isHiddenByContributorType()
            || this._isHiddenByNg()
            || this._isHiddenByVisitedMovieViewMode()
      },
      _isReduced() {
        return this.movie.visited
            && this.config.visitedMovieViewMode.value === 'reduce'
      },
      _newViewMode() {
        if (this._isHidden()) return 'hide'
        if (this._isReduced()) return 'reduce'
        return 'doNothing'
      },
      update() {
        var pre = this.value
        this.value = this._newViewMode()
        if (pre !== this.value) this.emit('changed', this.value)
      },
      addListener() {
        var l = this.update.bind(this)
        this.movie
          .on('errorChanged', l)
          .on('ngChanged', l)
          .on('visitedChanged', l)
          .on('contributorChanged', l)
          .on('thumbInfoDone', l);
        ;['ngMovieVisible',
          'visibleContributorType',
          'visitedMovieViewMode',
          'unknownContributorMovieVisible',
        ].forEach(function(n) {
          this.config[n].on('changed', l)
        }, this)
        return this
      },
    })
    return MovieViewMode
  })(EventEmitter)

  var MovieViewModes = (function(_super) {
    var MovieViewModes = function(config) {
      _super.call(this)
      this.config = config
      this._movieToViewMode = new Map()
      this._emitViewModeChanged = this.emit.bind(this, 'movieViewModeChanged')
    }
    MovieViewModes.prototype = createObject(_super.prototype, {
      get(movie) {
        var m = this._movieToViewMode
        if (m.has(movie)) return m.get(movie)
        var viewMode = new MovieViewMode(movie, this.config)
        m.set(movie, viewMode)
        return viewMode.on('changed', this._emitViewModeChanged).addListener()
      },
      sort() {
        return [...this._movieToViewMode.values()].map(function(m, i) {
          return {i, m}
        }).sort(function(a, b) {
          if (a.m.value === 'hide' && b.m.value !== 'hide') return 1
          if (a.m.value !== 'hide' && b.m.value === 'hide') return -1
          return a.i - b.i
        }).map(function(o) {
          return o.m
        })
      },
    })
    return MovieViewModes
  })(EventEmitter)

