  var Movie = (function(_super) {
    var Movie = function(id, title) {
      _super.call(this)
      this.id = id
      this.title = title
      this.ngTitle = ''
      this.ngId = false
      this.visited = false
      this._tags = []
      this._contributor = Contributor.NULL
      this._description = ''
      this._error = Movie.NO_ERROR
      this._thumbInfoDone = false
      this._ng = false
      this.ngByLockedTagCount = false
      this._lockedTagCountEnabled = false
      this._lockedTagCountThreshold = Infinity
      this.ngByAdvancedRule = false
      this.advancedRuleMatches = []
      this._advancedRulesEnabled = false
      this._advancedRulesJson = '[]'
      this.nicoadSelfAdChecked = false
      this.nicoadSelfAdIdMatch = false
      this.nicoadSelfAdNameMatch = false
      this.nicoadSelfAdSponsors = []
      this.nicoadSelfAdError = null
    }
    Movie.NO_ERROR = {type: 'NO_ERROR', message: 'no error'}
    Movie.prototype = createObject(_super.prototype, {
      _matchedNgTitle(upperCaseNgTitleSet) {
        var t = this.title.toUpperCase()
        for (var ng of upperCaseNgTitleSet) {
          if (t.includes(ng)) return ng
        }
        return ''
      },
      updateNgTitle(upperCaseNgTitleSet) {
        var pre = this.ngTitle
        this.ngTitle = this._matchedNgTitle(upperCaseNgTitleSet)
        if (pre === this.ngTitle) return
        this.emit('ngTitleChanged', this.ngTitle)
        this._updateNg()
      },
      updateNgId(ngIdSet) {
        var pre = this.ngId
        this.ngId = ngIdSet.has(this.id)
        if (pre === this.ngId) return
        this.emit('ngIdChanged', this.ngId)
        this._updateNg()
      },
      updateVisited(visitedIdSet) {
        var pre = this.visited
        this.visited = visitedIdSet.has(this.id)
        if (pre !== this.visited) this.emit('visitedChanged', this.visited)
      },
      get description() { return this._description },
      set description(description) {
        this._description = description
        this.emit('descriptionChanged', this._description)
        this._updateAdvancedRule()
        this._updateNg()
      },
      get tags() { return this._tags },
      set tags(tags) {
        this._tags = tags
        this.ngByLockedTagCount = this._ngByLockedTagCountValue()
        this.emit('tagsChanged', this._tags)
        this._updateAdvancedRule()
        this._updateNg()
        var update = this._updateNg.bind(this)
        for (var t of this._tags) t.on('ngChanged', update)
      },
      _lockedTagCount() {
        return this._tags.filter(function(t) { return t.lock }).length
      },
      _ngByLockedTagCountValue() {
        return this._lockedTagCountEnabled
            && this._lockedTagCount() >= this._lockedTagCountThreshold
      },
      updateLockedTagCountConfig(enabled, threshold) {
        this._lockedTagCountEnabled = enabled
        this._lockedTagCountThreshold = threshold
        this.ngByLockedTagCount = this._ngByLockedTagCountValue()
        this._updateNg()
      },
      updateAdvancedRulesConfig(enabled, rulesJson) {
        this._advancedRulesEnabled = Boolean(enabled)
        this._advancedRulesJson = typeof rulesJson === 'string'
          ? rulesJson : JSON.stringify(rulesJson || [])
        this._updateAdvancedRule()
        this._updateNg()
      },
      _updateAdvancedRule() {
        var matches = AdvancedNgRules.match(
          this, this._advancedRulesEnabled, this._advancedRulesJson, false)
        this.advancedRuleMatches = matches
        this.ngByAdvancedRule = matches.length > 0
      },
      setNicoadSelfAdResult(result) {
        result = result || {}
        this.nicoadSelfAdChecked = Boolean(result.checked)
        this.nicoadSelfAdIdMatch = Boolean(result.idMatch)
        this.nicoadSelfAdNameMatch = Boolean(result.nameMatch)
        this.nicoadSelfAdSponsors = Array.isArray(result.sponsors) ? result.sponsors : []
        this.nicoadSelfAdError = result.error || null
        this.emit('nicoadSelfAdChanged', result)
        this._updateAdvancedRule()
        this._updateNg()
      },
      get contributor() { return this._contributor },
      set contributor(contributor) {
        this._contributor = contributor
        this.emit('contributorChanged', this._contributor)
        this._updateAdvancedRule()
        this._updateNg()
        this._contributor.on('ngChanged', this._updateNg.bind(this))
      },
      get error() { return this._error },
      set error(error) {
        this._error = error
        this.emit('errorChanged', this._error)
        this._updateAdvancedRule()
        this._updateNg()
      },
      get thumbInfoDone() { return this._thumbInfoDone },
      setThumbInfoDone() {
        this._thumbInfoDone = true
        this._updateAdvancedRule()
        this._updateNg()
        this.emit('thumbInfoDone')
      },
      get ng() { return this._ng },
      _updateNg() {
        var pre = this._ng
        this._ng = this.ngId
          || Boolean(this.ngTitle)
          || this.contributor.ng
          || this.tags.some(function(t) { return t.ng })
          || this.ngByLockedTagCount
          || this.ngByAdvancedRule
        if (pre !== this._ng) this.emit('ngChanged', this._ng)
      },
      addListenerToConfig(config) {
        config.ngMovies.on('changed', this.updateNgId.bind(this))
        config.ngTitles.on('changed', this.updateNgTitle.bind(this))
        config.visitedMovies.on('changed', this.updateVisited.bind(this))
        var updateLockedTagCountConfig = () => {
          this.updateLockedTagCountConfig(
            config.ngLockedTagCountEnabled.value,
            config.ngLockedTagCountThreshold.value)
        }
        config.ngLockedTagCountEnabled.on('changed', updateLockedTagCountConfig)
        config.ngLockedTagCountThreshold.on('changed', updateLockedTagCountConfig)
        var updateAdvancedRulesConfig = () => {
          this.updateAdvancedRulesConfig(
            config.advancedNgRulesEnabled.value,
            config.advancedNgRulesJson.value)
        }
        config.advancedNgRulesEnabled.on('changed', updateAdvancedRulesConfig)
        config.advancedNgRulesJson.on('changed', updateAdvancedRulesConfig)
      },
    })
    return Movie
  })(EventEmitter)

  var Movies = (function() {
    var Movies = function(config) {
      this.config = config
      this._idToMovie = new Map()
    }
    Movies.prototype = {
      setIfAbsent(movies) {
        var ngIds = this.config.ngMovies.set
        var ngTitles = this.config.ngTitles.set
        var visitedIds = this.config.visitedMovies.set
        var lockedTagCountEnabled = this.config.ngLockedTagCountEnabled.value
        var lockedTagCountThreshold = this.config.ngLockedTagCountThreshold.value
        var advancedNgRulesEnabled = this.config.advancedNgRulesEnabled.value
        var advancedNgRulesJson = this.config.advancedNgRulesJson.value
        var map = this._idToMovie
        for (var m of movies) {
          if (map.has(m.id)) continue
          map.set(m.id, m)
          m.updateNgId(ngIds)
          m.updateNgTitle(ngTitles)
          m.updateVisited(visitedIds)
          m.updateLockedTagCountConfig(lockedTagCountEnabled, lockedTagCountThreshold)
          m.updateAdvancedRulesConfig(advancedNgRulesEnabled, advancedNgRulesJson)
          m.addListenerToConfig(this.config)
        }
      },
      get(movieId) {
        return this._idToMovie.get(movieId)
      },
    }
    return Movies
  })()

  var ThumbInfoListener = (function() {
    var createTagBuilder = function(config) {
      var map = new Map()
      return thumbInfoTag => {
        let a;
        const i = thumbInfoTag.lock ? 1 : 0;
        if (map.has(thumbInfoTag.name)) {
          a = map.get(thumbInfoTag.name);
          if (a[i]) return a[i];
        } else {
          a = [null, null];
        }
        const tag = new Tag(thumbInfoTag);
        a[i] = tag;
        map.set(thumbInfoTag.name, a);
        config.ngTags.on('changed', tagNameSet => tag.updateNg(tagNameSet));
        config.ngLockedTags.on('changed', tagNameSet => tag.updateNgIfLocked(tagNameSet));
        return tag;
      };
    }
    var createTagsBuilder = function(config) {
      var getTagBy = createTagBuilder(config)
      return thumbInfoTags => {
        const tags = thumbInfoTags.map(getTagBy);
        const ngTagSet = config.ngTags.set;
        const ngLockedTagSet = config.ngLockedTags.set;
        for (const t of tags) {
          t.updateNg(ngTagSet);
          t.updateNgIfLocked(ngLockedTagSet);
        }
        return tags;
      };
    }
    var createContributorBuilder = function(config) {
      var typeToMap = Contributor.TYPES.reduce(function(map, type) {
        return map.set(type, new Map())
      }, new Map())
      return function(o) {
        if (o.type === 'unknown') return Contributor.NULL;
        var map = typeToMap.get(o.type)
        if (map.has(o.id)) return map.get(o.id)
        var contributor = Contributor.new(o.type, o.id, o.name)
        map.set(o.id, contributor)
        contributor.bindToConfig(config)
        return contributor
      }
    }
    return {
      forCompleted(movies) {
        var getTagsBy = createTagsBuilder(movies.config)
        var getContributorBy = createContributorBuilder(movies.config)
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.description = thumbInfo.description
          m.tags = getTagsBy(thumbInfo.tags)
          m.contributor = getContributorBy(thumbInfo.contributor)
          m.setThumbInfoDone()
        }
      },
      forErrorOccurred(movies) {
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.error = thumbInfo.error
          m.setThumbInfoDone()
        }
      },
    }
  })()

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

  var ConfigDialog = (function(_super) {
    var isValidStr = function(s) {
      return typeof s === 'string' && Boolean(s.trim().length)
    }
    var isPositiveInt = function(n) {
      return Number.isSafeInteger(n) && n > 0
    }
    var initCheckbox = function(config, doc, name) {
      var b = doc.getElementById(name)
      b.checked = config[name].value
      b.addEventListener('change', function() {
        config[name].value = b.checked
      })
    }
    var initNumberInput = function(config, doc, name, min, max) {
      var i = doc.getElementById(name)
      i.value = config[name].value
      i.addEventListener('change', function() {
        var n = Math.max(min, Math.trunc(Number(i.value)) || min)
        if (Number.isFinite(max)) n = Math.min(max, n)
        i.value = n
        config[name].value = n
      })
    }
    var initSelect = function(config, doc, name) {
      var s = doc.getElementById(name)
      s.value = config[name].value
      s.addEventListener('change', function() {
        config[name].value = s.value
      })
    }
    var optionOf = function(v) {
      return typeof v === 'object'
           ? new Option(v.value + ',' + v.text, v.value)
           : new Option(v, v)
    }
    var diffBy = function(target) {
      var SOMETHING_INPUT_TEXT = '何か入力して下さい。'
      var POSITIVE_INT_INPUT_TEXT = '1以上の整数を入力して下さい。'
      var movieUrlOf = function(movieId) {
        return 'https://www.nicovideo.jp/watch/' + movieId
      }
      return {
        'ng-movie-id': {
          targetText: 'NG動画ID',
          storeName: 'ngMovies',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf: movieUrlOf,
        },
        'ng-title': {
          targetText: 'NGタイトル',
          storeName: 'ngTitles',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(title) { return 'https://www.nicovideo.jp/search/' + title },
        },
        'ng-tag': {
          targetText: 'NGタグ',
          storeName: 'ngTags',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(tag) { return 'https://www.nicovideo.jp/tag/' + tag },
        },
        'ng-locked-tag': {
          targetText: 'NGタグ(ロック)',
          storeName: 'ngLockedTags',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(tag) { return 'https://www.nicovideo.jp/tag/' + tag },
        },
        'ng-user-id': {
          targetText: 'NGユーザーID',
          storeName: 'ngUserIds',
          convert: Math.trunc,
          isValid(v) { return isPositiveInt(Math.trunc(v)) },
          inputRequestText: POSITIVE_INT_INPUT_TEXT,
          urlOf(userId) { return 'https://www.nicovideo.jp/user/' + userId },
        },
        'ng-user-name': {
          targetText: 'NGユーザー名',
          storeName: 'ngUserNames',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(userName) { return 'https://www.nicovideo.jp/search/' + userName },
        },
        'ng-channel-id': {
          targetText: 'NGチャンネルID',
          storeName: 'ngChannelIds',
          convert: Math.trunc,
          isValid(v) { return isPositiveInt(Math.trunc(v)) },
          inputRequestText: POSITIVE_INT_INPUT_TEXT,
          urlOf(channelId) { return 'https://ch.nicovideo.jp/ch' + channelId },
        },
        'visited-movie-id': {
          targetText: '閲覧済み動画ID',
          storeName: 'visitedMovies',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf: movieUrlOf,
        },
      }[target]
    }
    var promptFor = async function(target, config, defaultValue) {
      var d = diffBy(target)
      var r = ''
      do {
        var msg = r ? `"${r}"は登録済みです。\n` : ''
        r = window.prompt(msg + d.targetText, r || defaultValue || '')
        if (r === null) return ''
        while (!d.isValid(r)) {
          r = window.prompt(d.inputRequestText + '\n' + d.targetText)
          if (r === null) return ''
        }
      } while (!(await config[d.storeName].addAsync(d.convert(r))))
      return r
    }

    var ConfigDialog = function(config, doc, openInTab) {
      _super.call(this)
      this.config = config
      this.doc = doc
      this.openInTab = openInTab
      for (var v of config.ngTitles.array) {
        this._e('list').add(new Option(v, v))
      }
      this._e('removeAllButton').disabled = !config.ngTitles.array.length
      initCheckbox(config, doc, 'openNewWindow')
      initCheckbox(config, doc, 'useGetThumbInfo')
      initCheckbox(config, doc, 'movieInfoTogglable')
      initCheckbox(config, doc, 'descriptionTogglable')
      initCheckbox(config, doc, 'addToNgLockedTags')
      initCheckbox(config, doc, 'unknownContributorMovieVisible')
      initCheckbox(config, doc, 'ngLockedTagCountEnabled')
      initNumberInput(config, doc, 'ngLockedTagCountThreshold', 1, 11)
      initCheckbox(config, doc, 'advancedNgRulesEnabled')
      initCheckbox(config, doc, 'autoFillEnabled')
      initNumberInput(config, doc, 'autoFillTargetCount', 1)
      initNumberInput(config, doc, 'autoFillMaxExtraPages', 0)
      initSelect(config, doc, 'autoFillInfoMode')
      initSelect(config, doc, 'autoFillAdMode')
      initCheckbox(config, doc, 'selfAdWarningEnabled')
      initNumberInput(config, doc, 'thumbInfoConcurrency', 1, 20)
      initCheckbox(config, doc, 'developerMode')
      initSelect(config, doc, 'statusPanelMode')
      initSelect(config, doc, 'detailUiTheme')
      var applyDialogTheme = function() {
        var requested = String(config.detailUiTheme.value || 'auto')
        var resolved = requested
        if (requested === 'auto') {
          var parentTheme = doc.defaultView && doc.defaultView.parent
            && doc.defaultView.parent.document
            && doc.defaultView.parent.document.documentElement.dataset.nrnUiTheme
          resolved = parentTheme || 'light'
        }
        doc.documentElement.dataset.nrnTheme = resolved
      }
      applyDialogTheme()
      config.detailUiTheme.on('changed', applyDialogTheme)
      initNumberInput(config, doc, 'autoFillDetailBatchMax', 8, 100)
      initCheckbox(config, doc, 'spaNavigationFix')
      initSelect(config, doc, 'autoFillPagerMode')
      initCheckbox(config, doc, 'sessionDetailCacheEnabled')
      initCheckbox(config, doc, 'statusAnimationEnabled')
      initSelect(config, doc, 'developerDiagnosticMode')
      initNumberInput(config, doc, 'pagerPreviewCount', 0, 6)
      initNumberInput(config, doc, 'sessionDetailCacheTtlMinutes', 1, 1440)
      initNumberInput(config, doc, 'sessionDetailCacheMaxEntries', 100, 4000)
      this._on('target', 'change', this._targetChanged.bind(this))
      this._on('addButton', 'click', this._addButtonClicked.bind(this))
      this._on('removeButton', 'click', this._removeButtonClicked.bind(this))
      this._on('removeAllButton', 'click', this._removeAllButtonClicked.bind(this))
      this._on('openButton', 'click', this._openButtonClicked.bind(this))
      this._on('closeButton', 'click', this._close.bind(this))
      this.doc.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') this._close()
      }.bind(this))
      this._on('runDeveloperDiagnostics', 'click', this._runDeveloperDiagnostics.bind(this))
      this._on('exportVisibleCheckbox', 'change', this._exportVisibleCheckboxChanged.bind(this))
      this._on('importVisibleCheckbox', 'change', this._importVisibleCheckboxChanged.bind(this))
      this._on('exportButton', 'click', this._exportButtonClicked.bind(this))
      this._on('importButton', 'click', this._importButtonClicked.bind(this))
      var updateButtonsDisabled = this._updateButtonsDisabled.bind(this)
      this._on('target', 'change', updateButtonsDisabled)
      this._on('list', 'change', updateButtonsDisabled)
      this._on('addButton', 'click', updateButtonsDisabled)
      this._on('removeButton', 'click', updateButtonsDisabled)
      this._on('removeAllButton', 'click', updateButtonsDisabled)
      this._initAdvancedNgRuleBuilder()
    }
    ConfigDialog.prototype = createObject(_super.prototype, {
      _e(id) { return this.doc.getElementById(id) },
      _close() {
        if (this._closed) return
        this._closed = true
        this.emit('closed')
      },
      _on(id, eventName, listener) {
        this._e(id).addEventListener(eventName, listener)
      },
      _diffBySelectedTarget() {
        return diffBy(this._e('target').value)
      },
      _updateList() {
        for (var o of Array.from(this._e('list').options)) o.remove()
        var d = this._diffBySelectedTarget()
        for (var val of this.config[d.storeName].arrayWithText) {
          this._e('list').add(optionOf(val))
        }
      },
      _targetChanged() {
        this._updateList()
      },
      _updateButtonsDisabled() {
        var l = this._e('list')
        var d = l.selectedIndex === -1
        this._e('removeButton').disabled = d
        this._e('openButton').disabled = d
        this._e('removeAllButton').disabled = !l.length
      },
      async _addButtonClicked() {
        var r = await promptFor(this._e('target').value, this.config)
        if (r) this._e('list').add(new Option(r, r))
      },
      async _removeButtonClicked() {
        var opts = Array.from(this._e('list').selectedOptions)
        var d = this._diffBySelectedTarget()
        await this.config[d.storeName]
          .removeAsync(opts.map(function(o) { return d.convert(o.value) }))
        for (var o of opts) o.remove()
      },
      _removeAllButtonClicked() {
        var d = this._diffBySelectedTarget()
        if (!window.confirm(`すべての"${d.targetText}"を削除しますか？`)) return
        this.config[d.storeName].clear()
        for (var o of Array.from(this._e('list').options)) o.remove()
      },
      _openButtonClicked() {
        var opts = Array.from(this._e('list').selectedOptions)
        var d = this._diffBySelectedTarget()
        for (var v of opts.map(function(o) { return o.value })) {
          this.openInTab(d.urlOf(v))
        }
      },
      _readAdvancedRules() {
        return AdvancedNgRules.parse(this.config.advancedNgRulesJson.value)
      },
      _saveAdvancedRules(rules) {
        this.config.advancedNgRulesJson.value = JSON.stringify(rules)
        this._renderAdvancedNgRules()
      },
      _lockSvgElement(className) {
        var span = this.doc.createElement('span')
        span.className = className || 'advancedLockSvg'
        span.setAttribute('aria-hidden', 'true')
        span.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M18 7h-1V5.98a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4V7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M9.53 17.16l1.14-1.97.51-.87a2 2 0 0 1 .83-3.82c.7 0 1.32.36 1.67.91q.32.48.33 1.09a2 2 0 0 1-1.17 1.82l1.64 2.84a.23.23 0 0 1-.2.34H9.74a.23.23 0 0 1-.2-.34zM9 5.98c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2V7H9z"></path></svg>'
        return span
      },
      _friendlyOperatorLabel(field, operator) {
        // タグ系は配列中の「タグ名1個」との完全一致。
        // タイトル/説明文/投稿者名/動画IDは通常の文字列比較。
        if (field === 'tag') {
          if (operator === 'contains') return '指定したタグ名がある（完全一致）'
          if (operator === 'notContains') return '指定したタグ名がない（完全一致）'
          if (operator === 'exists') return 'タグが1個以上ある'
          if (operator === 'notExists') return 'タグが1個もない'
        }

        if (field === 'lockedTag') {
          if (operator === 'contains') return '指定した🔒タグロック名がある（完全一致）'
          if (operator === 'notContains') return '指定した🔒タグロック名がない（完全一致）'
          if (operator === 'exists') return '🔒タグロックが1個以上ある'
          if (operator === 'notExists') return '🔒タグロックが1個もない'
        }

        if (field === 'title') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '文字列が完全一致（=）'
          if (operator === 'neq') return '文字列が完全一致しない（≠）'
          if (operator === 'exists') return 'タイトルが空ではない'
          if (operator === 'notExists') return 'タイトルが空'
        }

        if (field === 'description') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '文字列が完全一致（=）'
          if (operator === 'neq') return '文字列が完全一致しない（≠）'
          if (operator === 'exists') return '説明文が空ではない'
          if (operator === 'notExists') return '説明文が空'
        }

        if (field === 'contributorName') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '名前が完全一致（=）'
          if (operator === 'neq') return '名前が完全一致しない（≠）'
          if (operator === 'exists') return '投稿者名が取得できる'
          if (operator === 'notExists') return '投稿者名が取得できない'
        }

        if (field === 'movieId') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '動画IDが完全一致（=）'
          if (operator === 'neq') return '動画IDが完全一致しない（≠）'
        }
        if (field === 'selfAdIdMatch') {
          if (operator === 'isTrue') return '一致する（高信頼）'
          if (operator === 'isFalse') return '一致しない'
        }
        if (field === 'selfAdNameMatch') {
          if (operator === 'isTrue') return '一致する（名前一致・参考）'
          if (operator === 'isFalse') return '一致しない'
        }

        if (operator === 'exists') {
          if (field === 'userId') return 'IDがある'
          if (field === 'channelId') return 'IDがある'
          if (field === 'contributorId') return '投稿者IDがある'
        }
        if (operator === 'notExists') {
          if (field === 'userId') return 'IDがない（退会済みなど）'
          if (field === 'channelId') return 'IDがない'
          if (field === 'contributorId') return '投稿者IDがない（退会済みなど）'
        }

        var generic = AdvancedNgRules.OP_META[operator]
          ? AdvancedNgRules.OP_META[operator].label : operator
        return generic
      },
      _operatorHelpText(field, operator) {
        if (field === 'tag' && operator === 'contains')
          return '動画に付いているタグの中に、入力したタグ名と完全に同じタグが1個以上ある場合に一致します。部分一致ではありません。'
        if (field === 'tag' && operator === 'notContains')
          return '入力したタグ名と完全に同じタグが1個もない場合に一致します。部分一致ではありません。'
        if (field === 'lockedTag' && operator === 'contains')
          return 'ロック済みタグだけを対象に、入力したタグ名と完全に同じ🔒タグロックがある場合に一致します。部分一致ではありません。'
        if (field === 'lockedTag' && operator === 'notContains')
          return 'ロック済みタグの中に、入力したタグ名と完全に同じ🔒タグロックがない場合に一致します。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'contains')
          return '入力した文字列が対象の文章・名前・IDの一部に含まれていれば一致します。これは部分一致です。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'notContains')
          return '入力した文字列が対象の文章・名前・IDのどこにも含まれていない場合に一致します。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'eq')
          return '先頭から末尾まで文字列全体が同じ場合だけ一致します。これは完全一致です。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'neq')
          return '文字列全体が完全一致しない場合に一致します。'

        if (field === 'selfAdIdMatch' && operator === 'isTrue')
          return '広告者ユーザーIDと投稿者ユーザーIDが同じ場合に一致します。ID比較なので高信頼です。'
        if (field === 'selfAdNameMatch' && operator === 'isTrue')
          return '広告者名と投稿者名が同じ場合に一致します。表示名は重複・変更できるため参考条件です。'
        if ((field === 'selfAdIdMatch' || field === 'selfAdNameMatch') && operator === 'isFalse')
          return '一致が検出されなかった場合に一致します。通信エラー時は不一致と断定しません。'
        if (operator === 'gt') return '指定した値より大きい場合に一致します。記号では「>」です。'
        if (operator === 'gte') return '指定した値と同じ、またはそれより大きい場合に一致します。記号では「≥」です。'
        if (operator === 'lt') return '指定した値より小さい場合に一致します。記号では「<」です。'
        if (operator === 'lte') return '指定した値と同じ、またはそれより小さい場合に一致します。記号では「≤」です。'
        if (operator === 'eq') return '指定した値と完全に等しい場合に一致します。記号では「=」です。'
        if (operator === 'neq') return '指定した値と等しくない場合に一致します。記号では「≠」です。'
        if (operator === 'contains') return '指定した値を含む場合に一致します。'
        if (operator === 'notContains') return '指定した値を含まない場合に一致します。'

        if (operator === 'exists') {
          if (field === 'userId' || field === 'contributorId')
            return '投稿者のIDを正常に取得できる場合に一致します。'
          if (field === 'tag') return 'タグが1個以上付いている場合に一致します。タグ名の指定はしません。'
          if (field === 'lockedTag') return 'ロック済みタグが1個以上ある場合に一致します。タグ名の指定はしません。'
          return 'その情報が空ではなく、取得できている場合に一致します。'
        }
        if (operator === 'notExists') {
          if (field === 'userId' || field === 'contributorId')
            return '投稿者IDを取得できない場合に一致します。退会済みユーザーなどが該当します。通信エラーは一致扱いにしません。'
          if (field === 'tag') return 'タグが1個も付いていない場合に一致します。'
          if (field === 'lockedTag') return 'ロック済みタグが1個もない場合に一致します。'
          return 'その情報が空、または取得できない場合に一致します。'
        }
        return ''
      },
      _newAdvancedRule(enabled) {
        var root = AdvancedNgRules.makeGroup('AND')
        root.children.push(AdvancedNgRules.makeCondition('lockedTagCount'))
        return {
          id:'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
          name:'新しい論理NGルール',
          enabled:enabled !== false,
          expression:root
        }
      },
      _initAdvancedNgRuleBuilder() {
        var add = this._e('advancedRuleAddButton')
        var sample = this._e('advancedRuleSampleButton')
        if (!add || !sample) return

        add.addEventListener('click', function() {
          var rules = this._readAdvancedRules()
          rules.push(this._newAdvancedRule(true))
          this._saveAdvancedRules(rules)
        }.bind(this))

        sample.addEventListener('click', function() {
          var rules = this._readAdvancedRules()
          var root = AdvancedNgRules.makeGroup('AND')
          root.children = [
            {kind:'condition',field:'lockedTagCount',operator:'eq',value:11,not:false},
            {kind:'condition',field:'tag',operator:'contains',value:'ホモと見るシリーズ',not:false},
            {kind:'condition',field:'tag',operator:'contains',value:'本編改造淫夢',not:false},
            {kind:'condition',field:'contributorId',operator:'notExists',value:'',not:false}
          ]
          rules.push({
            id:'rule-' + Date.now() + '-sample',
            name:'例：検索妨害（編集して使用）',
            enabled:false,
            expression:root
          })
          this._saveAdvancedRules(rules)
        }.bind(this))

        this._renderAdvancedNgRules()
      },
      _renderAdvancedNgRules() {
        var container = this._e('advancedRuleList')
        var count = this._e('advancedRuleCount')
        if (!container) return

        var rules = this._readAdvancedRules()
        if (count) count.textContent = rules.length + '件'
        container.textContent = ''

        if (!rules.length) {
          var empty = this.doc.createElement('div')
          empty.className = 'advancedRuleEmpty'
          empty.textContent = '論理NGルールはまだありません。「ルールを追加」または「サンプルを追加」から作成できます。'
          container.appendChild(empty)
          return
        }

        var operatorOptionsFor = function(field) {
          var meta = AdvancedNgRules.FIELD_META[field]
          return meta ? meta.operators : []
        }

        var defaultValueFor = function(field) {
          if (field === 'lockedTagCount') return 11
          if (field === 'tagCount') return 1
          return ''
        }

        rules.forEach(function(rule, ruleIndex) {
          var card = this.doc.createElement('div')
          card.className = 'advancedRuleCard logicRuleCard'
          card.classList.toggle('disabled', !rule.enabled)

          var head = this.doc.createElement('div')
          head.className = 'advancedRuleHead'

          var enabled = this.doc.createElement('input')
          enabled.type = 'checkbox'
          enabled.checked = rule.enabled !== false
          enabled.title = 'このルールだけをON/OFFします。'

          var name = this.doc.createElement('input')
          name.type = 'text'
          name.value = rule.name
          name.className = 'advancedRuleName'
          name.placeholder = 'ルール名'

          var del = this.doc.createElement('button')
          del.type = 'button'
          del.textContent = '削除'
          del.className = 'danger'

          head.appendChild(enabled)
          head.appendChild(name)
          head.appendChild(del)
          card.appendChild(head)

          var preview = this.doc.createElement('div')
          preview.className = 'logicExpressionPreview'
          card.appendChild(preview)

          var rootHost = this.doc.createElement('div')
          rootHost.className = 'logicRootHost'
          card.appendChild(rootHost)

          var saveNow = function(renderAgain) {
            var all = this._readAdvancedRules()
            if (!all[ruleIndex]) return
            all[ruleIndex] = rule
            this.config.advancedNgRulesJson.value = JSON.stringify(all)
            preview.textContent = '式: ' + AdvancedNgRules.expressionText(rule.expression)
            if (renderAgain) renderRoot()
          }.bind(this)

          enabled.addEventListener('change', function() {
            rule.enabled = enabled.checked
            card.classList.toggle('disabled', !rule.enabled)
            saveNow(false)
          })
          name.addEventListener('change', function() {
            rule.name = name.value.trim() || ('ルール ' + (ruleIndex + 1))
            name.value = rule.name
            saveNow(false)
          })
          del.addEventListener('click', function() {
            if (!window.confirm('「' + rule.name + '」を削除しますか？')) return
            var all = this._readAdvancedRules()
            all.splice(ruleIndex, 1)
            this._saveAdvancedRules(all)
          }.bind(this))

          var renderCondition = function(node, parentGroup, index, depth) {
            var row = this.doc.createElement('div')
            row.className = 'logicConditionRow'
            row.style.setProperty('--logic-depth', String(depth))

            var notLabel = this.doc.createElement('label')
            notLabel.className = 'logicNotToggle'
            var notCheck = this.doc.createElement('input')
            notCheck.type = 'checkbox'
            notCheck.checked = Boolean(node.not)
            notLabel.appendChild(notCheck)
            notLabel.appendChild(this.doc.createTextNode('条件を反対にする（NOT）'))

            var field = this.doc.createElement('select')
            field.className = 'logicField'
            Object.keys(AdvancedNgRules.FIELD_META).forEach(function(key) {
              var meta = AdvancedNgRules.FIELD_META[key]
              field.add(new Option(meta.label, key))
            })
            field.value = node.field
            field.title = '比較したい情報を選びます。タグ名と文字列、個数は別の項目です。'

            var lockSpot = this.doc.createElement('span')
            lockSpot.className = 'logicFieldIcon'
            var updateLockSpot = function() {
              lockSpot.textContent = ''
              if (field.value === 'lockedTag' || field.value === 'lockedTagCount') {
                lockSpot.appendChild(this._lockSvgElement('advancedLockSvg small'))
              }
            }.bind(this)
            updateLockSpot()

            var operator = this.doc.createElement('select')
            operator.className = 'logicOperator'

            var value = this.doc.createElement('input')
            value.className = 'logicValue'

            var remove = this.doc.createElement('button')
            remove.type = 'button'
            remove.className = 'logicRemove'
            remove.textContent = '×'
            remove.title = 'この条件を削除'

            var rebuildOperator = function() {
              operator.textContent = ''
              operatorOptionsFor(node.field).forEach(function(opKey) {
                operator.add(new Option(
                  this._friendlyOperatorLabel(node.field, opKey), opKey))
              }.bind(this))
              if (!operatorOptionsFor(node.field).includes(node.operator)) {
                node.operator = operatorOptionsFor(node.field)[0]
              }
              operator.value = node.operator
              operator.title = this._operatorHelpText(node.field, node.operator)

              var fm = AdvancedNgRules.FIELD_META[node.field]
              var om = AdvancedNgRules.OP_META[node.operator]
              var numeric = fm && (fm.type === 'number' || fm.type === 'numberOrMissing')
              value.type = numeric ? 'number' : 'text'
              if (node.field === 'lockedTagCount' || node.field === 'tagCount') {
                value.min = '0'
                value.max = '11'
              } else {
                value.removeAttribute('min')
                value.removeAttribute('max')
              }
              value.style.display = om && om.needsValue === false ? 'none' : ''
              value.value = node.value == null ? '' : node.value

              if (node.field === 'tag') value.placeholder = '例：本編改造淫夢'
              else if (node.field === 'lockedTag') value.placeholder = '例：ホモと見るシリーズ'
              else if (node.field === 'title') value.placeholder = 'タイトルに探す文字列'
              else if (node.field === 'description') value.placeholder = '説明文に探す文字列'
              else if (node.field === 'contributorName') value.placeholder = '投稿者名'
              else if (node.field === 'movieId') value.placeholder = '例：sm12345678'
              else if (node.field === 'lockedTagCount') value.placeholder = '例：11'
              else if (node.field === 'tagCount') value.placeholder = '例：5'
              else if (['userId','channelId','contributorId'].includes(node.field))
                value.placeholder = '数値ID'
              else value.placeholder = ''
            }.bind(this)
            rebuildOperator()

            notCheck.addEventListener('change', function() {
              node.not = notCheck.checked
              saveNow(false)
            })
            field.addEventListener('change', function() {
              node.field = field.value
              var ops = operatorOptionsFor(node.field)
              node.operator = ops[0]
              node.value = defaultValueFor(node.field)
              updateLockSpot()
              rebuildOperator()
              saveNow(false)
            })
            operator.addEventListener('change', function() {
              node.operator = operator.value
              rebuildOperator()
              saveNow(false)
            })
            value.addEventListener('change', function() {
              var fm = AdvancedNgRules.FIELD_META[node.field]
              if (fm && (fm.type === 'number' || fm.type === 'numberOrMissing')) {
                var n = Number(value.value)
                node.value = Number.isFinite(n) ? n : 0
              } else {
                node.value = value.value.trim()
              }
              value.value = node.value
              saveNow(false)
            })
            remove.addEventListener('click', function() {
              parentGroup.children.splice(index, 1)
              saveNow(true)
            })

            row.appendChild(notLabel)
            row.appendChild(lockSpot)
            row.appendChild(field)
            row.appendChild(operator)
            row.appendChild(value)
            row.appendChild(remove)
            return row
          }.bind(this)

          var renderGroup = function(group, parentGroup, index, depth, isRoot) {
            var box = this.doc.createElement('div')
            box.className = 'logicGroup'
            box.dataset.logicDepth = String(depth)

            var toolbar = this.doc.createElement('div')
            toolbar.className = 'logicGroupToolbar'

            var op = this.doc.createElement('select')
            op.className = 'logicGroupOp'
            op.add(new Option('すべて満たす（AND / 論理積）', 'AND'))
            op.add(new Option('どれか1つ以上満たす（OR / 論理和）', 'OR'))
            op.value = group.op === 'OR' ? 'OR' : 'AND'
            op.title = 'このグループ内の条件をAND/ORで結合します。'

            var notLabel = this.doc.createElement('label')
            notLabel.className = 'logicNotToggle groupNot'
            var notCheck = this.doc.createElement('input')
            notCheck.type = 'checkbox'
            notCheck.checked = Boolean(group.not)
            notLabel.appendChild(notCheck)
            notLabel.appendChild(this.doc.createTextNode('このグループを否定する（NOT / 論理否定）'))

            var addCondition = this.doc.createElement('button')
            addCondition.type = 'button'
            addCondition.textContent = '＋ 条件'
            addCondition.title = 'このグループに比較条件を追加'

            var addGroup = this.doc.createElement('button')
            addGroup.type = 'button'
            addGroup.textContent = '＋ AND/OR グループ'
            addGroup.title = 'AND/ORを入れ子にした新しい論理グループを追加'

            toolbar.appendChild(op)
            toolbar.appendChild(notLabel)
            toolbar.appendChild(addCondition)
            toolbar.appendChild(addGroup)

            if (!isRoot) {
              var removeGroup = this.doc.createElement('button')
              removeGroup.type = 'button'
              removeGroup.textContent = 'グループ削除'
              removeGroup.className = 'danger'
              removeGroup.addEventListener('click', function() {
                parentGroup.children.splice(index, 1)
                saveNow(true)
              })
              toolbar.appendChild(removeGroup)
            }

            box.appendChild(toolbar)

            var children = this.doc.createElement('div')
            children.className = 'logicChildren'
            box.appendChild(children)

            if (!group.children.length) {
              var blank = this.doc.createElement('div')
              blank.className = 'logicEmptyGroup'
              blank.textContent = '条件なし（安全のためこのグループはFALSE扱い）'
              children.appendChild(blank)
            }

            group.children.forEach(function(child, childIndex) {
              if (child.kind === 'group') {
                children.appendChild(renderGroup(
                  child, group, childIndex, depth + 1, false))
              } else {
                children.appendChild(renderCondition(
                  child, group, childIndex, depth + 1))
              }
            })

            op.addEventListener('change', function() {
              group.op = op.value
              saveNow(false)
            })
            notCheck.addEventListener('change', function() {
              group.not = notCheck.checked
              saveNow(false)
            })
            addCondition.addEventListener('click', function() {
              group.children.push(AdvancedNgRules.makeCondition('tag'))
              saveNow(true)
            })
            addGroup.addEventListener('click', function() {
              var g = AdvancedNgRules.makeGroup('AND')
              g.children.push(AdvancedNgRules.makeCondition('lockedTagCount'))
              group.children.push(g)
              saveNow(true)
            })

            return box
          }.bind(this)

          var renderRoot = function() {
            rootHost.textContent = ''
            rootHost.appendChild(renderGroup(
              rule.expression, null, -1, 0, true))
            preview.textContent = '式: ' + AdvancedNgRules.expressionText(rule.expression)
          }

          renderRoot()
          container.appendChild(card)
        }.bind(this))
      },
      _runDeveloperDiagnostics() {
        var status = this._e('developerDiagnosticStatus')
        status.textContent = '診断を開始しました。結果はConsoleと右下ステータスに出力されます。'
        status.className = 'statusNote running'
        if (typeof this.config._nrnDiagnosticHook === 'function') {
          this.config._nrnDiagnosticHook('manual-developer-suite', {from: 'config-dialog'})
        } else {
          status.textContent = '現在のページでは診断コントローラーがまだ準備できていません。'
          status.className = 'statusNote warning'
        }
      },
      _exportVisibleCheckboxChanged() {
        var n = this._e('exportVisibleCheckbox').checked ? 'remove' : 'add'
        this._e('exportContainer').classList[n]('isHidden')
      },
      _importVisibleCheckboxChanged() {
        var n = this._e('importVisibleCheckbox').checked ? 'remove' : 'add'
        this._e('importContainer').classList[n]('isHidden')
      },
      async _exportButtonClicked() {
        var textarea = this._e('exportTextarea')
        textarea.value = await this.config.toCSV({
          ngMovieId: this._e('exportNgMovieIdCheckbox').checked,
          ngTitle: this._e('exportNgTitleCheckbox').checked,
          ngTag: this._e('exportNgTagCheckbox').checked,
          ngUserId: this._e('exportNgUserIdCheckbox').checked,
          ngUserName: this._e('exportNgUserNameCheckbox').checked,
          ngChannelId: this._e('exportNgChannelIdCheckbox').checked,
          visitedMovieId: this._e('exportVisitedMovieIdCheckbox').checked,
        })
        textarea.focus()
        textarea.select()
      },
      async _importButtonClicked() {
        await this.config.addFromCSV(this._e('importTextarea').value)
        this._updateList()
        this._e('importTextarea').value = ''
      },
    })
    ConfigDialog.promptNgTitle = function(config, defaultValue) {
      promptFor('ng-title', config, defaultValue)
    }
    ConfigDialog.promptNgUserName = function(config, defaultValue) {
      promptFor('ng-user-name', config, defaultValue)
    }
    ConfigDialog.SRCDOC = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root {
    color-scheme: light dark;
    --bg: #f5f6f8;
    --panel: #ffffff;
    --panel2: #f8f9fb;
    --text: #202124;
    --muted: #67707a;
    --line: #dde1e6;
    --accent: #246bfd;
    --accent-soft: #eaf0ff;
    --danger: #c53b3b;
    --ok: #238636;
    --warn: #9a6700;
    --shadow: 0 12px 36px rgba(0,0,0,.18);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-nrn-theme]) {
      --bg: #17191c;
      --panel: #22252a;
      --panel2: #292d33;
      --text: #f2f3f5;
      --muted: #aeb5bf;
      --line: #3a4048;
      --accent: #7aa2ff;
      --accent-soft: #243252;
      --danger: #ff7b72;
      --ok: #56d364;
      --warn: #e3b341;
      --shadow: 0 12px 40px rgba(0,0,0,.45);
    }
  }
  :root[data-nrn-theme=dark] {
    color-scheme: dark;
    --bg: #1d2126;
    --panel: #24292f;
    --panel2: #2a3037;
    --text: #d9dfe7;
    --muted: #9fa9b5;
    --line: #3b434d;
    --accent: #7fa9ee;
    --accent-soft: #273650;
    --danger: #e9827c;
    --ok: #68c982;
    --warn: #d5b467;
    --shadow: 0 12px 40px rgba(0,0,0,.38);
  }
  :root[data-nrn-theme=light] { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin:0; min-height:100%; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); background:transparent; }
  body { display:flex; align-items:center; justify-content:center; padding:24px; }
  .dialog {
    width:min(920px, calc(100vw - 32px));
    max-height:calc(100vh - 32px);
    overflow:auto;
    background:var(--bg);
    border:1px solid var(--line);
    border-radius:16px;
    box-shadow:var(--shadow);
  }
  .header {
    position:sticky; top:0; z-index:5;
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:16px 20px;
    background:color-mix(in srgb, var(--panel) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom:1px solid var(--line);
  }
  .title { font-size:18px; font-weight:700; }
  .subtitle { color:var(--muted); font-size:12px; margin-top:2px; }
  .tabbar {
    position:sticky; top:65px; z-index:4;
    display:flex; gap:6px; padding:10px 16px;
    overflow-x:auto; background:color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter:blur(10px); border-bottom:1px solid var(--line);
  }
  .tabButton {
    white-space:nowrap; border-radius:999px; padding:7px 12px; font-size:13px;
  }
  .tabButton.active {
    background:var(--accent); color:#fff; border-color:var(--accent); font-weight:700;
  }
  [data-tab-panel] { display:none; }
  [data-tab-panel].active { display:block; }
  .content { padding:16px; display:grid; gap:12px; }
  details.card, .card {
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:12px;
    overflow:hidden;
  }
  details.card > summary {
    cursor:pointer; list-style:none; padding:14px 16px; font-weight:700;
    display:flex; align-items:center; gap:8px;
    user-select:none;
  }
  details.card > summary::-webkit-details-marker { display:none; }
  details.card > summary::before { content:'›'; font-size:20px; transition:.15s; color:var(--muted); }
  details.card[open] > summary::before { transform:rotate(90deg); }
  .sectionBody { padding:0 16px 16px; display:grid; gap:10px; }
  .row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; min-height:32px; }
  .row.stack { align-items:flex-start; flex-direction:column; }
  .row > label { display:flex; align-items:center; gap:7px; }
  .muted, small { color:var(--muted); }
  .hint { background:var(--panel2); border-left:3px solid var(--accent); padding:9px 11px; border-radius:7px; color:var(--muted); font-size:12px; line-height:1.55; }
  .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .grid2 > .row {
    min-width:0; align-items:stretch; padding:10px 12px;
    background:var(--panel2); border:1px solid var(--line); border-radius:10px;
  }
  .grid2 > .row > label { width:100%; min-width:0; }
  .grid2 > .row > label:has(select),
  .grid2 > .row > label:has(input[type=number]) {
    display:grid; grid-template-columns:minmax(118px,auto) minmax(0,1fr);
    align-items:center; gap:10px;
  }
  .grid2 > .row select { width:100%; min-width:0; }
  .grid2 > .row input[type=number] { justify-self:start; }
  .row.stack {
    padding:10px 12px; background:var(--panel2);
    border:1px solid var(--line); border-radius:10px;
  }
  .row.stack > label {
    width:100%; display:grid; grid-template-columns:140px minmax(0,1fr); gap:10px;
  }
  .row.stack select { width:100%; }
  .settingHelp {
    display:inline-flex; align-items:center; justify-content:center;
    width:18px; height:18px; margin-left:4px; border-radius:50%;
    border:1px solid var(--line); color:var(--muted); font-size:11px;
    cursor:help; vertical-align:middle; background:var(--panel);
  }
  .settingHelp:hover { color:var(--accent); border-color:var(--accent); }
  .sectionTitle {
    margin:4px 0 -2px; color:var(--muted); font-size:11px;
    font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  }
  .advancedRuleList { display:grid; gap:10px; }
  .advancedRuleEmpty {
    padding:14px; border:1px dashed var(--line); border-radius:10px;
    color:var(--muted); text-align:center; background:var(--panel2);
  }
  .advancedRuleCard {
    padding:12px; border:1px solid var(--line); border-radius:12px;
    background:var(--panel2); display:grid; gap:9px;
  }
  .advancedRuleCard.disabled { opacity:.58; }
  .advancedRuleHead {
    display:grid; grid-template-columns:auto minmax(0,1fr) auto;
    align-items:center; gap:8px;
  }
  .advancedRuleName {
    width:100%; font-weight:700; background:var(--panel);
    color:var(--text); border:1px solid var(--line); border-radius:7px; padding:7px 9px;
  }
  .advancedRuleLogic { font-size:11px; color:var(--muted); }
  .advancedConditions { display:grid; gap:7px; }
  .advancedConditionRow {
    display:grid; grid-template-columns:minmax(180px,.9fr) minmax(180px,1.2fr) auto;
    gap:7px; align-items:center;
  }
  .advancedConditionRow select, .advancedConditionRow input { width:100%; min-width:0; }
  .advancedAddCondition { justify-self:start; }
  .inlineLockIcon, .advancedLockSvg {
    display:inline-flex; align-items:center; justify-content:center;
    vertical-align:-3px; fill:currentColor;
  }
  .inlineLockIcon { margin-right:5px; }
  .advancedLockSvg.small svg { width:15px; height:15px; }
  .lockText { white-space:nowrap; font-weight:700; }
  .logicExpressionPreview {
    font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
    font-size:11px; line-height:1.5; color:var(--muted);
    padding:7px 9px; border-radius:8px; background:var(--panel);
    border:1px solid var(--line); overflow-wrap:anywhere;
  }
  .logicGroup {
    --logic-accent: color-mix(in srgb, var(--accent) 42%, var(--line));
    border:1px solid var(--logic-accent); border-left-width:4px;
    border-radius:10px; padding:9px; background:var(--panel);
    display:grid; gap:8px;
  }
  .logicGroup[data-logic-depth="1"] { margin-left:14px; }
  .logicGroup[data-logic-depth="2"] { margin-left:28px; }
  .logicGroup[data-logic-depth="3"] { margin-left:42px; }
  .logicGroupToolbar {
    display:flex; flex-wrap:wrap; gap:6px; align-items:center;
  }
  .logicGroupOp { min-width:170px; font-weight:700; }
  .logicNotToggle {
    display:inline-flex !important; width:auto !important;
    align-items:center !important; gap:4px !important;
    grid-template-columns:none !important; white-space:nowrap;
    padding:4px 7px; border:1px solid var(--line); border-radius:7px;
    background:var(--panel2);
  }
  .logicNotToggle.groupNot { font-weight:700; }
  .logicChildren { display:grid; gap:7px; }
  .logicConditionRow {
    display:grid;
    grid-template-columns:auto 20px minmax(155px,1fr) minmax(135px,.9fr) minmax(120px,1fr) auto;
    gap:6px; align-items:center;
    padding:7px; border-radius:8px; background:var(--panel2);
    border:1px solid var(--line);
  }
  .logicFieldIcon { display:flex; width:20px; justify-content:center; color:var(--accent); }
  .logicConditionRow select, .logicConditionRow input { width:100%; min-width:0; }
  .logicRemove { min-width:34px; }
  .logicEmptyGroup {
    color:var(--muted); font-size:11px; padding:8px;
    border:1px dashed var(--line); border-radius:7px;
  }
  .logicHelpDetails {
    border:1px solid var(--line); border-radius:10px; background:var(--panel2);
  }
  .logicHelpDetails > summary {
    cursor:pointer; padding:10px 12px; font-weight:700; color:var(--text);
  }
  .logicHelpBody {
    padding:0 14px 12px; color:var(--muted); font-size:12px; line-height:1.65;
  }
  .logicHelpBody p { margin:7px 0; }
  .logicHelpBody ul { margin:7px 0 7px 22px; padding:0; }
  .logicHelpBody hr { border:0; border-top:1px solid var(--line); margin:12px 0; }
  .logicExample {
    padding:11px 13px; border-radius:10px; background:var(--accent-soft);
    border:1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    line-height:1.7; font-size:12px;
  }
  @media(max-width:700px) {
    .advancedConditionRow { grid-template-columns:1fr auto; }
    .advancedConditionRow select { grid-column:1 / -1; }
    .logicConditionRow {
      grid-template-columns:auto 20px minmax(0,1fr) auto;
    }
    .logicConditionRow .logicOperator,
    .logicConditionRow .logicValue { grid-column:3 / 5; }
  }
  @media(max-width:700px){ .grid2{grid-template-columns:1fr;} body{padding:8px;} .dialog{width:100%;max-height:calc(100vh - 16px);} }
  input[type=number], select, textarea {
    background:var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:7px;
    padding:6px 8px; font:inherit;
  }
  input[type=number] { width:74px; }
  select { max-width:100%; }
  textarea { width:100%; min-height:76px; resize:vertical; }
  button, input[type=button] {
    border:1px solid var(--line); background:var(--panel2); color:var(--text);
    border-radius:8px; padding:7px 11px; cursor:pointer; font:inherit;
  }
  button:hover, input[type=button]:hover { border-color:var(--accent); }
  .primary { background:var(--accent); color:white; border-color:var(--accent); font-weight:700; }
  .danger { color:var(--danger); }
  .listButtonsWrap { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
  .listButtonsWrap .list select { width:100%; min-height:220px; }
  .listButtonsWrap .buttons { display:flex; flex-direction:column; gap:6px; }
  .isHidden { display:none; }
  .statusNote { font-size:12px; color:var(--muted); padding:8px 10px; border-radius:7px; background:var(--panel2); }
  .statusNote.running { color:var(--accent); }
  .statusNote.warning { color:var(--warn); }
  .pill { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; color:var(--muted); }
  .footer { padding:12px 16px 18px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
  a { color:var(--accent); }
</style></head><body>
  <div class=dialog>
    <div class=header>
      <div><div class=title>Nico Nico Ranking NG</div><div class=subtitle>フィルター・自動継ぎ足し・診断設定</div></div>
      <input class=primary type=button value="閉じる" id=closeButton>
    </div>
    <div class=tabbar role=tablist>
      <button class="tabButton active" type=button data-tab=filter>NG・フィルター</button>
      <button class=tabButton type=button data-tab=autofill>自動継ぎ足し</button>
      <button class=tabButton type=button data-tab=display>表示・操作</button>
      <button class=tabButton type=button data-tab=developer>開発者・診断</button>
      <button class=tabButton type=button data-tab=data>データ管理</button>
    </div>
    <div class=content>
      <div data-tab-panel=filter class=active><details class=card open>
        <summary>NGリスト</summary>
        <div class=sectionBody>
          <div class=row><label>種類 <select id=target>
            <option value=ng-movie-id>NG動画ID</option><option value=ng-title selected>NGタイトル</option>
            <option value=ng-tag>NGタグ</option><option value=ng-locked-tag>NGタグ(ロック)</option>
            <option value=ng-user-id>NGユーザーID</option><option value=ng-user-name>NGユーザー名</option>
            <option value=ng-channel-id>NGチャンネルID</option><option value=visited-movie-id>閲覧済み動画ID</option>
          </select></label></div>
          <div class=listButtonsWrap>
            <div class=list><select multiple size=10 id=list></select></div>
            <div class=buttons>
              <input type=button value=追加 id=addButton>
              <input type=button value=削除 disabled id=removeButton>
              <input type=button class=danger value=全削除 disabled id=removeAllButton>
              <input type=button value=開く disabled id=openButton>
            </div>
          </div>
        </div>
      </details>

      <details class=card open>
        <summary>NG判定</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=unknownContributorMovieVisible>削除された投稿者の動画を表示する</label></div>
          <div class=row><label><input type=checkbox id=addToNgLockedTags>ロックタグを[+]で登録するとき「NGタグ(ロック)」へ追加</label></div>
          <div class=row><label><input type=checkbox id=ngLockedTagCountEnabled>🔒 タグロックが <input type=number id=ngLockedTagCountThreshold min=1 max=11> 個以上ならNG</label><span class=pill>1～11</span></div>
          <div class=hint>従来の単独NG条件です。「ロックタグ11個だけでは正常動画も巻き込む」場合は、下の複合NGルールを使うと条件をANDで組み合わせられます。</div>
        </div>
      </details>

      <details class=card open>
        <summary><span class=inlineLockIcon aria-hidden=true><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M18 7h-1V5.98a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4V7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M9.53 17.16l1.14-1.97.51-.87a2 2 0 0 1 .83-3.82c.7 0 1.32.36 1.67.91q.32.48.33 1.09a2 2 0 0 1-1.17 1.82l1.64 2.84a.23.23 0 0 1-.2.34H9.74a.23.23 0 0 1-.2-.34zM9 5.98c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2V7H9z"></path></svg></span>論理NGルール <span id=advancedRuleCount class=pill>0件</span></summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=advancedNgRulesEnabled>複合NGルールを有効にする</label></div>
          <div class=hint>
            <b>論理NGルール</b>は、複数の条件を組み合わせて「この条件に当てはまる動画だけNG」にする機能です。<br>
            <b>AND（論理積）</b> = すべて満たす / <b>OR（論理和）</b> = どれか1つ以上満たす / <b>NOT（論理否定）</b> = 条件の結果を反対にする、という意味です。<br>
            タイトル・説明文などは<b>文字列の部分一致 / 完全一致</b>、タグ・🔒タグロックは<b>タグ名1個との完全一致</b>、タグ数は<b>数値比較</b>として扱います。普通はまず <b>AND（すべて満たす）</b> を使えば十分です。
          </div>

          <details class=logicHelpDetails>
            <summary>📘 論理ルールの詳しい使い方・用語解説</summary>
            <div class=logicHelpBody>
              <p><b>条件式</b>：1つの判定です。例「🔒 タグロック数が 11以上」。</p>
              <p><b>条件グループ</b>：複数の条件式を AND / OR でまとめたものです。</p>
              <p><b>AND（論理積）</b>：グループ内の条件をすべて満たしたときだけ成立します。</p>
              <p><b>OR（論理和）</b>：グループ内の条件を1つ以上満たせば成立します。</p>
              <p><b>NOT（論理否定）</b>：条件やグループの結果を反転します。初心者の方はまず「含まない」「IDがない」などの直接的な条件を使う方が分かりやすいです。</p>
              <p><b>入れ子（ネスト）</b>：条件グループの中へさらに別の条件グループを入れることです。例：A AND (B OR C)。</p>
              <hr>
              <p><b>文字列</b>：タイトル・説明文・投稿者名・動画IDなど、文字の並びとして扱う値です。</p>
              <p><b>部分一致</b>：入力した文字列が、対象の文字列の一部分に含まれていれば一致します。例：「改造」を検索すると「本編改造淫夢」に一致します。</p>
              <p><b>完全一致</b>：先頭から末尾まで文字列全体が同じ場合だけ一致します。例：「本編改造淫夢」は「本編改造淫夢」に一致しますが、「改造淫夢」には一致しません。</p>
              <p><b>タグ / 🔒タグロックの文字列比較</b>：タグは1個ずつ独立した名前として比較します。「指定したタグ名がある」は<b>タグ名の完全一致</b>です。タグ名の一部分だけでは一致しません。</p>
              <p><b>タグ数 / 🔒タグロック数</b>：タグの名前ではなく、何個付いているかを数値で比較する項目です。</p>
              <hr>
              <p><b>比較演算子</b></p>
              <ul>
                <li><b>より大きい（&gt;）</b>：指定値より大きい</li>
                <li><b>以上（≥）</b>：指定値と同じ、または大きい</li>
                <li><b>未満（&lt;）</b>：指定値より小さい</li>
                <li><b>以下（≤）</b>：指定値と同じ、または小さい</li>
                <li><b>等しい（=）</b>：指定値と同じ</li>
                <li><b>等しくない（≠）</b>：指定値と異なる</li>
              </ul>
              <hr>
              <p><b>ユーザーID / 投稿者IDについて</b></p>
              <p><b>IDがない（退会済みなど）</b>：投稿者IDを取得できない動画に一致します。退会済みユーザーの動画などが該当します。通信エラーは「IDがない」とは判定しません。</p>
              <p><b>IDがある</b>：投稿者IDを正常に取得できる動画に一致します。</p>
              <p>IDは数値なので、<b>以上 / 以下 / より大きい / 未満</b>も使えます。たとえば「ユーザーIDが 50000000以上」のように、特定時期以降に作られたID帯を条件として組み合わせる用途にも使えます。</p>
              <hr>
              <p><b>タイトル・説明文</b>：文章そのものを文字列として比較します。「文字列を含む（部分一致）」と「文字列が完全一致」を使い分けられます。</p>
              <p><b>タグ</b>：動画に付いているタグ名を1個ずつ比較します。「指定したタグ名がある（完全一致）」を使います。</p>
              <p><b>🔒 タグロック</b>：投稿者がロックしたタグです。鍵アイコンが付くタグを意味します。こちらもタグ名1個との完全一致です。</p>
              <p><b>🔒 タグロック数</b>：ロックされているタグの個数です。1～11の範囲で比較できます。</p>
              <p><b>広告：投稿者IDと広告者ID</b>：ニコニ広告の広告者ユーザーIDと投稿者ユーザーIDを比較します。ID一致は高信頼です。</p>
              <p><b>広告：投稿者名と広告者名</b>：表示名同士を比較します。同名や名前変更があり得るため参考条件です。可能ならID一致を優先してください。</p>
            </div>
          </details>
          <div class=logicExample>
            <b>例：検索妨害だけを狙ってNG</b>
            <div>🔒 タグロック数 <b>以上（≥） 11</b></div>
            <div>AND タグ <b>含む「ホモと見るシリーズ」</b></div>
            <div>AND タグ <b>含む「本編改造淫夢」</b></div>
            <div>AND ユーザーID <b>IDがない（退会済みなど）</b></div>
          </div>
          <div class=row>
            <button type=button id=advancedRuleAddButton class=primary>＋ 論理ルールを追加</button>
            <button type=button id=advancedRuleSampleButton>サンプルを追加</button>
          </div>
          <div id=advancedRuleList class=advancedRuleList></div>
        </div>
      </details></div>

      <div data-tab-panel=autofill><details class=card open>
        <summary>自動継ぎ足し</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=autoFillEnabled>表示動画数が目標に達するまで自動追加</label></div>
          <div class=grid2>
            <div class=row><label>表示動画数の目標 <input type=number id=autoFillTargetCount min=1> 件</label></div>
            <div class=row><label>追加取得上限 <input type=number id=autoFillMaxExtraPages min=0> 単位</label><small>0=無制限</small></div>
          </div>
          <div class=row stack><label>候補取得方式
            <select id=autoFillInfoMode>
              <option value=legacy>従来方式（ページHTML＋詳細情報）</option>
              <option value=hybrid>API併用（検索API＋完全NG判定）</option>
              <option value=snapshot>API高速（API事前NG＋必要分だけ完全判定）</option>
            </select></label>
          </div>
          <div class=grid2>
            <div class=row><label>詳細情報の同時取得 <input type=number id=thumbInfoConcurrency min=1 max=20> 件</label></div>
            <div class=row><label>1回の詳細判定上限 <input type=number id=autoFillDetailBatchMax min=8 max=100> 件</label></div>
          </div>
          <div class=sectionTitle>表示とページ移動</div>
          <div class=grid2>
            <div class=row><label>右下ステータス
              <select id=statusPanelMode><option value=compact>コンパクト</option><option value=detailed>詳細</option><option value=hidden>非表示</option></select>
            </label></div>
            <div class=row><label>ページ番号の扱い
              <select id=autoFillPagerMode>
                <option value=off>変更しない</option>
                <option value=mark>取得済みページに斜線だけ付ける</option>
                <option value=compactSkip>取得済みをまとめて未取得ページへ送る（推奨）</option>
              </select>
            </label></div>
            <div class=row><label>取得済み範囲の後に表示 <input type=number id=pagerPreviewCount min=0 max=6> ページ（標準 2）</label></div>
            <div class=row><label><input type=checkbox id=statusAnimationEnabled>処理中ステータスをアニメーション表示</label></div>
          </div>
          <div class=sectionTitle>通信・キャッシュ</div>
          <div class=grid2>
            <div class=row><label><input type=checkbox id=sessionDetailCacheEnabled>同一タブ内の動画詳細を再利用する</label></div>
            <div class=row><label>キャッシュ保持時間 <input type=number id=sessionDetailCacheTtlMinutes min=1 max=1440> 分</label></div>
            <div class=row><label>キャッシュ最大件数 <input type=number id=sessionDetailCacheMaxEntries min=100 max=4000> 件</label></div>
            <div class=row><label>追加動画のニコニコ広告
              <select id=autoFillAdMode><option value=all>候補すべて取得</option><option value=visible>表示動画のみ（推奨）</option><option value=none>取得しない</option></select>
            </label></div>
            <div class=row><label><input type=checkbox id=selfAdWarningEnabled>自演広告の可能性を警告する（実験的）</label></div>
          </div>
          <div class=hint>APIが現在の検索条件・並びを再現できない場合は自動で従来方式へ戻ります。🔒 タグロック数NGは完全判定が必要です。採用率が低くても異常とは扱いません。ページ番号は「取得済み範囲＋未取得の先頭数ページ＋最終ページ＋次矢印」の順で表示します。詳細キャッシュは同一タブの再読み込みを跨いで再利用し、保存するのはタグ・ロック状態・投稿者などの詳細情報です。NG設定変更時は保存済みの最終判定を使わず、現在の設定で再判定します。</div>
        </div>
      </details></div>

      <div data-tab-panel=developer><details class=card open>
        <summary>開発者・診断</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=developerMode>開発者モード</label><span class=pill>再読み込み不要</span></div>
          <div class=row><label>自動診断の量
            <select id=developerDiagnosticMode>
              <option value=light>軽量（設定・DOM・NG-ID・ページャー）</option>
              <option value=full>完全（3方式/API通信まで毎回実行）</option>
              <option value=manual>手動のみ</option>
            </select>
          </label></div>
          <div class=hint>通常利用は「軽量」推奨です。完全診断はSnapshot API通信まで行うため数秒余計にかかる場合があります。「診断を今すぐ実行」は設定に関係なく完全診断を実行します。</div>
          <div class=row><input class=primary type=button id=runDeveloperDiagnostics value="診断を今すぐ実行"></div>
          <div id=developerDiagnosticStatus class=statusNote>開発者モードをONにするとページ初期化後にも自動実行します。</div>
        </div>
      </details></div>

      <div data-tab-panel=display><details class=card open>
        <summary>表示・操作</summary>
        <div class=sectionBody>
          <div class=row><label>スクリプトUIの配色
            <select id=detailUiTheme>
              <option value=auto>自動（ニコニコ画面に合わせる・推奨）</option>
              <option value=light>ライト</option>
              <option value=dark>ダーク（低コントラスト）</option>
            </select>
          </label></div>
          <div class=hint>「自動」はニコニコ画面の実際の背景色を見てライト/ダークを判定します。ダーク配色は真っ黒・真っ白を避け、暗い青灰色の背景と少し抑えた文字色にして長時間見ても眩しすぎない配色にしています。</div>
          <div class=row><label><input type=checkbox id=openNewWindow>動画を新しいタブで開く</label></div>
          <div class=row><label><input type=checkbox id=spaNavigationFix>検索・タグ・ページ番号の移動時に確実に再検索する（推奨）</label></div>
          <div class=hint>現行ニコニコは検索画面内でURLだけを切り替えるSPA遷移を行います。ONではタグ・検索語・ページ番号・並び順などが変わったとき、新しいURLを保ったまま1回だけ再読み込みし、NG判定と自動継ぎ足しを新しい検索結果で最初から実行します。</div>
          <div class=row><label><input type=checkbox id=useGetThumbInfo>動画詳細情報を取得する</label></div>
          <div class=row><label><input type=checkbox id=movieInfoTogglable>タグ・ユーザー・チャンネルの表示切替</label></div>
          <div class=row><label><input type=checkbox id=descriptionTogglable>動画説明の表示切替</label></div>
        </div>
      </details></div>

      <div data-tab-panel=data><details class=card open>
        <summary>インポート・エクスポート</summary>
        <div class=sectionBody>
          <div class=row><label><input id=exportVisibleCheckbox type=checkbox>エクスポートを表示</label></div>
          <div id=exportContainer class=isHidden>
            <div class=row><label><input id=exportNgMovieIdCheckbox type=checkbox checked>動画ID</label><label><input id=exportNgTitleCheckbox type=checkbox checked>タイトル</label><label><input id=exportNgTagCheckbox type=checkbox checked>タグ</label><label><input id=exportNgUserIdCheckbox type=checkbox checked>ユーザーID</label><label><input id=exportNgUserNameCheckbox type=checkbox checked>ユーザー名</label><label><input id=exportNgChannelIdCheckbox type=checkbox checked>チャンネルID</label><label><input id=exportVisitedMovieIdCheckbox type=checkbox checked>閲覧済み</label></div>
            <div class=row><input type=button id=exportButton value=エクスポート></div><textarea id=exportTextarea rows=4></textarea>
          </div>
          <div class=row><label><input id=importVisibleCheckbox type=checkbox>インポートを表示</label></div>
          <div id=importContainer class=isHidden><textarea id=importTextarea rows=4></textarea><div class=row><input type=button id=importButton value=インポート></div></div>
        </div>
      </details></div>
    </div>
    <div class=footer><small>設定は変更時に保存されます。Escキーでも閉じられます。</small><small>Nico Nico Ranking NG / Umonky</small></div>
  </div>
<script>
(function(){
  var buttons = Array.from(document.querySelectorAll('.tabButton'));
  var panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  function activate(name) {
    buttons.forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
    panels.forEach(function(p){ p.classList.toggle('active', p.dataset.tabPanel === name); });
  }
  buttons.forEach(function(b){
    b.addEventListener('click', function(){ activate(b.dataset.tab); });
  });

  var help = {
    autoFillEnabled: 'NG判定後に表示できる動画が目標件数へ達するまで後続候補を取得します。',
    autoFillTargetCount: '画面上に実際に表示する非NG動画の目標件数です。',
    autoFillMaxExtraPages: '追加取得する上限です。0なら最終ページまで制限しません。',
    autoFillInfoMode: '従来方式は互換性優先。API併用/高速は検索APIを使いますが、再現できない検索条件では自動的に従来方式へ戻ります。',
    thumbInfoConcurrency: 'GetThumbInfoを同時に取得する本数です。大きすぎると通信失敗が増える場合があります。',
    autoFillDetailBatchMax: '1回に完全NG判定へ送る最大候補数です。低NG率では小さめ、高NG率では大きめが効率的です。',
    statusPanelMode: '右下の進捗パネルの表示量を選択します。',
    detailUiTheme: 'タグ・投稿者情報、操作ボタン、設定画面などスクリプト独自UIの配色です。自動はニコニコ本体の実背景色から判定します。',
    autoFillPagerMode: '自動取得済みのページを斜線・圧縮し、次矢印を最初の未取得ページへ変更できます。',
    pagerPreviewCount: '取得済み範囲の直後に通常リンクとして残す未取得ページ数です。2なら 20–31 32 33 … 157 → のように表示します。',
    statusAnimationEnabled: '処理中だけ右下ステータスに回転インジケーターを表示します。',
    sessionDetailCacheEnabled: '同じタブで一度取得したタグ・タグロック・投稿者情報をsessionStorageへ保存し、ページ移動後の再取得を省略します。',
    sessionDetailCacheTtlMinutes: 'キャッシュを何分まで有効とみなすかです。期限切れは自動削除します。',
    sessionDetailCacheMaxEntries: 'キャッシュ件数の上限です。古いものから削除します。',
    autoFillAdMode: '自動追加動画に対してニコニコ広告情報を取得する範囲です。',
    selfAdWarningEnabled: '広告者一覧を確認し、投稿者本人によるニコニ広告の可能性を警告します。追加通信が発生します。',
    spaNavigationFix: 'ニコニコのSPAページ移動で古いスクリプト状態が残るのを防ぐため、新URLで安全に再読み込みします。',
    developerMode: '診断ログを増やします。通常利用は軽量またはOFFで十分です。',
    developerDiagnosticMode: '軽量はローカル監査のみ、完全はAPI通信を含む3方式比較、手動のみはボタンを押した時だけ診断します。',
    ngLockedTagCountEnabled: 'ロックされたタグ数がしきい値以上の動画をNGにします。',
    ngLockedTagCountThreshold: 'ニコニコのタグ上限に合わせ1～11で指定します。',
    advancedNgRulesEnabled: 'AND / OR / NOT を自由に入れ子にし、比較演算子まで指定できる論理NG判定を有効にします。',
    openNewWindow: '動画のサムネイルやタイトルを左クリックしたとき、新しいタブで開きます。Ctrl/Cmd/中クリックなどブラウザ標準操作も維持します。Consoleの [new-tab] で動作監査できます。',
    useGetThumbInfo: 'タグのロック状態・投稿者など完全NG判定に必要な詳細情報を取得します。'
  };
  Object.keys(help).forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var row = el.closest('.row') || el.parentElement;
    if (!row) return;
    row.title = help[id];
    var icon = document.createElement('span');
    icon.className = 'settingHelp';
    icon.textContent = '?';
    icon.title = help[id];
    row.appendChild(icon);
  });
})();
</script>
</body></html>`
    return ConfigDialog
  })(EventEmitter)

  // ============================================================
  // v12.5 DetailUiTheme
  // ニコニコ本体のライト/ダークとスクリプト独自UIを自然に合わせる。
  // autoはOS設定だけでなく、実際のページ背景色も見る。
  // ============================================================
  var DetailUiTheme = (function() {
    var parseRgb = function(value) {
      var m = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i)
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
    }
    var luminance = function(rgb) {
      if (!rgb) return null
      var f = function(v) {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    var elementBackground = function(doc, el) {
      if (!el) return null
      try {
        var style = doc.defaultView.getComputedStyle(el)
        var color = style && style.backgroundColor
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null
        return parseRgb(color)
      } catch (e) { return null }
    }
    var detect = function(doc) {
      doc = doc || document
      var candidates = [
        doc.body,
        doc.documentElement,
        doc.querySelector('main'),
        doc.querySelector('[data-anchor-area="main"]') && doc.querySelector('[data-anchor-area="main"]').parentElement
      ].filter(Boolean)
      for (var el of candidates) {
        var rgb = elementBackground(doc, el)
        var lum = luminance(rgb)
        if (lum != null) {
          return {
            theme: lum < 0.18 ? 'dark' : 'light',
            luminance: Number(lum.toFixed(4)),
            rgb: rgb,
            source: el === doc.body ? 'body-background'
              : el === doc.documentElement ? 'html-background' : 'page-background'
          }
        }
      }
      var mediaDark = Boolean(doc.defaultView && doc.defaultView.matchMedia
        && doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches)
      return {
        theme: mediaDark ? 'dark' : 'light',
        luminance: null,
        rgb: null,
        source: 'prefers-color-scheme'
      }
    }
    var resolve = function(config, doc) {
      var requested = config && config.detailUiTheme
        ? String(config.detailUiTheme.value || 'auto') : 'auto'
      if (requested === 'dark' || requested === 'light') {
        return {requested:requested, resolved:requested, source:'setting'}
      }
      var detected = detect(doc)
      return Object.assign({requested:'auto', resolved:detected.theme}, detected)
    }
    var apply = function(config, doc, reason) {
      doc = doc || document
      var result = resolve(config, doc)
      doc.documentElement.dataset.nrnUiTheme = result.resolved
      if (doc.body) doc.body.dataset.nrnUiTheme = result.resolved
      window.__nrnDetailUiTheme = result
      console.log('[NicoNicoRankingNG theme]', reason || 'apply', result)
      return result
    }
    var watch = function(config, doc) {
      doc = doc || document
      if (window.__nrnDetailUiThemeWatcherInstalled) return
      window.__nrnDetailUiThemeWatcherInstalled = true
      var scheduled = false
      var schedule = function(reason) {
        if (String(config.detailUiTheme.value || 'auto') !== 'auto') return
        if (scheduled) return
        scheduled = true
        setTimeout(function() {
          scheduled = false
          apply(config, doc, reason)
        }, 80)
      }
      var observer = new MutationObserver(function() { schedule('page-theme-mutation') })
      if (doc.documentElement) observer.observe(doc.documentElement, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.body) observer.observe(doc.body, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.defaultView && doc.defaultView.matchMedia) {
        var media = doc.defaultView.matchMedia('(prefers-color-scheme: dark)')
        if (media.addEventListener) media.addEventListener('change', function() { schedule('system-theme-change') })
      }
    }
    var CSS = `
html[data-nrn-ui-theme="dark"] {
  --nrn-bg: #202429;
  --nrn-panel: #252a30;
  --nrn-panel-soft: #2b3037;
  --nrn-text: #d8dee8;
  --nrn-muted: #9fa9b6;
  --nrn-border: #3b424c;
  --nrn-link: #91b9f8;
  --nrn-hover: #333943;
  --nrn-lock-bg: #393522;
  --nrn-lock-border: #756a3d;
  --nrn-lock-text: #e6d99a;
}
html[data-nrn-ui-theme="dark"] #nrn-config-bar {
  color: var(--nrn-text) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle {
  color: var(--nrn-text) !important;
  background: var(--nrn-panel-soft) !important;
  border-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle:hover {
  background: var(--nrn-hover) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-detail-bulk-label,
html[data-nrn-ui-theme="dark"] .nrn-config-separator,
html[data-nrn-ui-theme="dark"] .nrn-info-section-title {
  color: var(--nrn-muted) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-info-container {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-top-color: var(--nrn-border) !important;
  box-shadow: none !important;
}
html[data-nrn-ui-theme="dark"] .nrn-info-section + .nrn-info-section {
  border-top-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-bottom-color: #353c45 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag:hover {
  background: #2a3037 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag.nrn-locked-tag {
  color: var(--nrn-lock-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag-link,
html[data-nrn-ui-theme="dark"] .nrn-contributor-link {
  color: var(--nrn-link) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor {
  color: var(--nrn-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #c3cad4 !important;
  background: #353b44 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #c9d0da !important;
  background: #30363e !important;
  border-color: #48515d !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #e4e9ef !important;
  background: #39414b !important;
  border-color: #626e7d !important;
}

html[data-nrn-ui-theme="dark"] .nrn-info-section-title,
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #aab3bf !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-lock-indicator {
  color: #d0ad55 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-warning {
  background: #3a3020 !important;
  border-left-color: #d4a24b !important;
  color: #ead7ab !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-inline-badge {
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
  background: rgba(76, 55, 19, .94) !important;
  color: #ead7ab !important;
  outline: 1px solid rgba(212,162,75,.45);
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #91b9f8 !important;
  background: transparent !important;
  border: 0 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #b7d2ff !important;
  background: transparent !important;
}
`
    return {detect:detect, resolve:resolve, apply:apply, watch:watch, CSS:CSS}
  })()

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

  var Diagnostics = (function() {
    var PREFIX = '[NicoNicoRankingNG v14.0]'
    var history = []
    var maxHistory = 300

    var push = function(level, module, message, data) {
      var entry = {
        at: new Date().toISOString(),
        level: level,
        module: module,
        message: message,
        data: data == null ? null : data
      }
      history.push(entry)
      if (history.length > maxHistory) history.splice(0, history.length - maxHistory)
      return entry
    }

    var write = function(level, module, message, data) {
      push(level, module, message, data)
      var fn = level === 'error' ? console.error
        : level === 'warn' ? console.warn : console.log
      if (data == null) fn(PREFIX, '[' + module + ']', message)
      else fn(PREFIX, '[' + module + ']', message, data)
    }

    var api = {
      log: function(module, message, data) { write('log', module, message, data) },
      warn: function(module, message, data) { write('warn', module, message, data) },
      error: function(module, message, data) { write('error', module, message, data) },
      getHistory: function() { return history.slice() },
      snapshot: function() {
        return {
          version: '14.1',
          url: location.href,
          historyCount: history.length,
          recent: history.slice(-30)
        }
      }
    }

    window.__nrnDiagnostics = api
    return api
  })()

  var NewTabService = (function() {
    var installed = false
    var config = null
    var observer = null
    var counters = {
      decorated: 0,
      intercepted: 0,
      nativeModifiedClicks: 0,
      failures: 0,
      lastUrl: null,
      mutationCallbacks: 0,
      mutationNodes: 0,
      mutationBatches: 0,
      mutationDecorateMs: 0
    }
    var pendingMutationRoots = new Set()
    var mutationFlushScheduled = false

    var isWatchUrl = function(value) {
      try {
        var u = new URL(value, location.href)
        return u.origin === location.origin && /^\/watch\//.test(u.pathname)
      } catch (e) {
        return false
      }
    }

    var findVideoAnchor = function(target) {
      var a = target && target.closest ? target.closest('a[href]') : null
      if (!a || !isWatchUrl(a.href)) return null

      // Only links belonging to a movie card handled by this userscript.
      var card = a.closest('.nrn-parsed, [data-nrn-autofill="true"]')
      if (!card) return null
      return a
    }

    var decorateAnchor = function(a, enabled) {
      if (!a || !isWatchUrl(a.href)) return false
      if (enabled) {
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
      return true
    }

    var decorateWithin = function(root, enabled) {
      if (!root || !root.querySelectorAll) return 0
      var count = 0
      var anchors = []
      if (root.matches && root.matches('a[href]')) anchors.push(root)
      anchors.push.apply(anchors, root.querySelectorAll('a[href]'))
      anchors.forEach(function(a) {
        var card = a.closest && a.closest('.nrn-parsed, [data-nrn-autofill="true"]')
        if (!card) return
        if (decorateAnchor(a, enabled)) count++
      })
      counters.decorated += count
      return count
    }

    var collectMovieCardRoots = function(node) {
      var roots = []
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return roots
      if (node.matches && node.matches('.nrn-parsed, [data-nrn-autofill="true"]')) roots.push(node)
      if (node.querySelectorAll) {
        node.querySelectorAll('.nrn-parsed, [data-nrn-autofill="true"]').forEach(function(card) {
          roots.push(card)
        })
      }
      return roots
    }

    var flushMutationRoots = function() {
      mutationFlushScheduled = false
      if (!pendingMutationRoots.size) return
      var started = performance.now()
      var enabled = Boolean(config && config.openNewWindow.value)
      var roots = Array.from(pendingMutationRoots)
      pendingMutationRoots.clear()
      var processed = 0
      roots.forEach(function(root) {
        if (root && root.isConnected) processed += decorateWithin(root, enabled)
      })
      counters.mutationBatches++
      counters.mutationDecorateMs += performance.now() - started
      if (processed || counters.mutationBatches % 20 === 0) {
        Diagnostics.log('new-tab', '動的リンク装飾バッチ', {
          roots:roots.length,
          anchorsProcessed:processed,
          batches:counters.mutationBatches,
          totalDecorateMs:Math.round(counters.mutationDecorateMs * 10) / 10
        })
      }
    }

    var queueMutationNode = function(node) {
      collectMovieCardRoots(node).forEach(function(root) { pendingMutationRoots.add(root) })
      if (!mutationFlushScheduled && pendingMutationRoots.size) {
        mutationFlushScheduled = true
        requestAnimationFrame(flushMutationRoots)
      }
    }

    var open = function(url) {
      counters.lastUrl = url
      try {
        if (typeof GM_openInTab === 'function') {
          GM_openInTab(url, {active:true, insert:true, setParent:true})
          return true
        }
        if (typeof GM !== 'undefined' && typeof GM.openInTab === 'function') {
          GM.openInTab(url, {active:true, insert:true, setParent:true})
          return true
        }
        var w = window.open(url, '_blank', 'noopener,noreferrer')
        return Boolean(w)
      } catch (e) {
        counters.failures++
        Diagnostics.error('new-tab', '新しいタブを開けませんでした', {
          url: url,
          error: String(e && e.message ? e.message : e)
        })
        return false
      }
    }

    var audit = function(reason) {
      var enabled = Boolean(config && config.openNewWindow && config.openNewWindow.value)
      var cards = Array.from(document.querySelectorAll('.nrn-parsed, [data-nrn-autofill="true"]'))
      var watchAnchors = []
      cards.forEach(function(card) {
        card.querySelectorAll('a[href]').forEach(function(a) {
          if (isWatchUrl(a.href)) watchAnchors.push(a)
        })
      })
      var decorated = watchAnchors.filter(function(a) {
        return a.target === '_blank' && a.dataset.nrnOpenNewTab === 'true'
      }).length
      var bad = enabled ? watchAnchors.filter(function(a) {
        return !(a.target === '_blank' && a.dataset.nrnOpenNewTab === 'true')
      }) : []

      var result = {
        reason: reason || 'audit',
        enabled: enabled,
        cards: cards.length,
        watchAnchors: watchAnchors.length,
        decorated: decorated,
        undecorated: bad.length,
        intercepted: counters.intercepted,
        nativeModifiedClicks: counters.nativeModifiedClicks,
        failures: counters.failures,
        lastUrl: counters.lastUrl,
        mutationCallbacks:counters.mutationCallbacks,
        mutationNodes:counters.mutationNodes,
        mutationBatches:counters.mutationBatches,
        mutationDecorateMs:Math.round(counters.mutationDecorateMs * 10) / 10
      }
      if (bad.length) {
        Diagnostics.warn('new-tab', '新しいタブ設定が未反映の動画リンクを検出', result)
      } else {
        Diagnostics.log('new-tab', '新しいタブ機能監査', result)
      }
      window.__nrnNewTabAudit = result
      return result
    }

    var onClickCapture = function(e) {
      if (!config || !config.openNewWindow.value) return
      var a = findVideoAnchor(e.target)
      if (!a) return

      // Keep native browser semantics for Ctrl/Cmd/Shift/Alt and non-left clicks.
      // target=_blank has already been applied, so these work naturally.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
        counters.nativeModifiedClicks++
        decorateAnchor(a, true)
        return
      }

      // NicoNico React can prevent navigation after our bubbling listener.
      // Intercept primary clicks in capture phase and open explicitly.
      e.preventDefault()
      e.stopImmediatePropagation()
      counters.intercepted++
      var ok = open(a.href)
      Diagnostics.log('new-tab', '動画リンクを新しいタブで開く', {
        href: a.href,
        success: ok,
        movieId: a.dataset.nrnMovieId
          || (a.closest('[data-decoration-video-id]')
            && a.closest('[data-decoration-video-id]').getAttribute('data-decoration-video-id'))
          || null,
        intercepted: counters.intercepted
      })
    }

    var install = function(configObject, doc) {
      config = configObject
      doc = doc || document

      if (installed) {
        decorateWithin(doc.body, Boolean(config.openNewWindow.value))
        return audit('reinstall')
      }
      installed = true

      doc.addEventListener('click', onClickCapture, true)

      observer = new MutationObserver(function(records) {
        counters.mutationCallbacks++
        records.forEach(function(rec) {
          rec.addedNodes.forEach(function(node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return
            counters.mutationNodes++
            queueMutationNode(node)
          })
        })
      })
      observer.observe(doc.documentElement, {childList:true, subtree:true})

      config.openNewWindow.on('changed', function(v) {
        var changed = decorateWithin(doc.body, Boolean(v))
        Diagnostics.log('new-tab', '設定変更をDOMへ反映', {
          enabled: Boolean(v),
          anchorsProcessed: changed
        })
        setTimeout(function() { audit('setting-changed') }, 0)
      })

      decorateWithin(doc.body, Boolean(config.openNewWindow.value))
      setTimeout(function() { audit('startup') }, 250)

      window.__nrnNewTabService = {
        audit: audit,
        open: open,
        decorate: function() {
          return decorateWithin(doc.body, Boolean(config.openNewWindow.value))
        }
      }
      Diagnostics.log('new-tab', 'NewTabServiceを開始', {
        enabled: Boolean(config.openNewWindow.value)
      })
    }

    return {
      install: install,
      audit: audit,
      open: open,
      decorateWithin: decorateWithin
    }
  })()

  // ========================================================================
  // User interaction controller
  // ========================================================================
  var Controller = (function() {
    var isMovieAnchor = function(e) {
      return e.dataset.nrnMovieAnchor === 'true'
    }
    var movieAnchor = function(child) {
      for (var n = child; n; n = n.parentNode) {
        if (n.nodeType !== Node.ELEMENT_NODE) return null
        if (n.tagName === 'BUTTON') return null
        if (isMovieAnchor(n)) return n
      }
    }
    var dataOfMovieAnchor = function(e) {
      return {
        id: e.dataset.nrnMovieId,
        title: e.dataset.nrnMovieTitle,
      }
    }
    var Controller = function(config, page) {
      this.config = config
      this.page = page
    }
    Controller.prototype = {
      addListenersTo(eventTarget) {
        eventTarget.addEventListener('change', this._changed.bind(this))
        eventTarget.addEventListener('click', this._clicked.bind(this))
      },
      _changed(event) {
        switch (event.target.id) {
          case 'nrn-visited-movie-view-mode-select':
            this.config.visitedMovieViewMode.value = event.target.value; break
          case 'nrn-visible-contributor-type-select':
            this.config.visibleContributorType.value = event.target.value; break
          case 'nrn-ng-movie-visible-checkbox':
            this.config.ngMovieVisible.value = event.target.checked; break
        }
      },
      _auditLayout(reason) {
        var rows = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root._auditMovieInfoLayout) continue
          if (!root._movieInfoVisible) continue
          var row = root._auditMovieInfoLayout(reason || 'bulk-layout')
          if (row) rows.push(row)
        }
        var bad = rows.filter(function(r) { return !r.ok })
        var result = {
          checked:rows.length,
          errors:bad.length,
          overlapCards:rows.reduce(function(n,r){ return n + Number(r.overlaps || 0) }, 0),
          maxToggleDelta:rows.length
            ? Math.max.apply(Math, rows.map(function(r){ return Number(r.toggleDelta || 0) }))
            : 0
        }
        console.log('[NicoNicoRankingNG detail] レイアウト全体監査:', result)
        if (bad.length) console.table(bad)
        window.__nrnLayoutDiagnostics = {summary:result, rows:rows}
        return result
      },
      _auditTogglePositions(reason) {
        var rows = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root._auditMovieInfoTogglePosition) continue
          var row = root._auditMovieInfoTogglePosition(reason || 'bulk')
          if (row) rows.push(row)
        }
        var maxDelta = rows.length ? Math.max.apply(Math, rows.map(function(r) { return r.delta })) : 0
        var moved = rows.filter(function(r) { return r.delta > 1.5 })
        var result = {
          checked: rows.length,
          moved: moved.length,
          maxDelta: Math.round(maxDelta * 100) / 100
        }
        console.log('[NicoNicoRankingNG detail] ▲▼位置監査:', result)
        if (moved.length) console.table(moved)
        return result
      },
      _auditDetailActionVisibility() {
        var tagButtons = Array.from(this.page.doc.querySelectorAll('.nrn-tag-ng-button'))
        var contributorButtons = Array.from(this.page.doc.querySelectorAll(
          '.nrn-contributor-ng-button, .nrn-contributor-ng-id-button, .nrn-contributor-ng-name-button'))
        var isVisible = function(el) {
          if (!el || !el.isConnected) return false
          var s = el.ownerDocument.defaultView.getComputedStyle(el)
          var r = el.getBoundingClientRect()
          return s.display !== 'none'
            && s.visibility !== 'hidden'
            && Number(s.opacity || 1) > 0.2
            && r.width > 0 && r.height > 0
        }
        var result = {
          tagNgButtons: tagButtons.length,
          visibleTagNgButtons: tagButtons.filter(isVisible).length,
          contributorNgButtons: contributorButtons.length,
          visibleContributorNgButtons: contributorButtons.filter(isVisible).length
        }
        result.ok = result.tagNgButtons === result.visibleTagNgButtons
          && result.contributorNgButtons === result.visibleContributorNgButtons
        console.log('[NicoNicoRankingNG detail] 操作ボタン可視性監査:', result)
        if (!result.ok) console.warn('[NicoNicoRankingNG detail] NG操作の一部が見えていません', result)
        return result
      },
      _setAllMovieInfoVisible(visible) {
        var total = 0
        var eligible = 0
        var skippedHidden = 0
        var changed = 0
        var widths = []
        var reserves = []
        for (var root of this.page.movieRoots) {
          if (!root || !root.elem || !root.elem.isConnected || !root.movieInfo) continue
          if (!root.movieInfo.hasAny()) continue
          total++
          var s = root.elem.ownerDocument.defaultView.getComputedStyle(root.elem)
          var r0 = root.elem.getBoundingClientRect()
          var interactive = !root.elem.classList.contains('nrn-autofill-pending')
            && !root.elem.classList.contains('nrn-autofill-overflow')
            && !root.elem.classList.contains('nrn-hide')
            && s.display !== 'none' && s.visibility !== 'hidden'
            && r0.width > 2 && r0.height > 2
          if (!interactive) {
            skippedHidden++
            continue
          }
          eligible++
          if (root.setMovieInfoVisible(visible, 'user-bulk')) {
            if (visible && root._syncMovieInfoReserve) root._syncMovieInfoReserve()
            if (visible && root.elem) {
              var r = root.elem.getBoundingClientRect()
              if (r && r.width) widths.push(Math.round(r.width * 10) / 10)
              var reserve = Number(root.elem.dataset.nrnDetailReserve || 0)
              if (reserve) reserves.push(reserve)
            }
            changed++
          }
        }
        if (visible) {
          setTimeout(function() {
            this._auditDetailActionVisibility()
            this._auditTogglePositions('open-all')
            this._auditLayout('open-all')
          }.bind(this), 80)
        } else {
          setTimeout(function() {
            this._auditTogglePositions('close-all')
          }.bind(this), 80)
        }
        console.log('[NicoNicoRankingNG detail]', visible ? '全て開く' : '全て閉じる', {
          total: total,
          eligible: eligible,
          skippedHiddenOrPending: skippedHidden,
          changed: changed,
          cardWidthMin: widths.length ? Math.min.apply(Math, widths) : null,
          cardWidthMax: widths.length ? Math.max.apply(Math, widths) : null,
          cardWidthSample: widths.slice(0, 12),
          detailReserveMin: reserves.length ? Math.min.apply(Math, reserves) : null,
          detailReserveMax: reserves.length ? Math.max.apply(Math, reserves) : null,
          detailReserveSample: reserves.slice(0, 12),
          invariant:'動画カード幅は変更せず、detailReserve分だけ下方向へ余白を確保'
        })
      },
      _addVisitedMovie(target) {
        var d = dataOfMovieAnchor(movieAnchor(target))
        this.config.visitedMovies.addAsync(d.id, d.title)
      },
      _toggleData(target, add, remove) {
        var ds = target.dataset
        switch (ds.type) {
          case 'add': add.call(this, ds); break
          case 'remove': remove.call(this, ds); break
          default: throw new Error(ds.type)
        }
      },
      _toggleVisitedMovie(target) {
        this._toggleData(target, function(ds) {
          this.config.visitedMovies.addAsync(ds.movieId, ds.movieTitle)
        }, function(ds) {
          this.config.visitedMovies.removeAsync([ds.movieId])
        })
      },
      _toggleNgMovie(target) {
        this._toggleData(target, function(ds) {
          this.config.ngMovies.addAsync(ds.movieId, ds.movieTitle)
        }, function(ds) {
          this.config.ngMovies.removeAsync([ds.movieId])
        })
      },
      _toggleNgTitle(target) {
        this._toggleData(target, function(ds) {
          ConfigDialog.promptNgTitle(this.config, ds.movieTitle)
        }, function(ds) {
          this.config.ngTitles.removeAsync([ds.ngTitle])
        })
      },
      _toggleNgTag(target) {
        this._toggleData(target, function(ds) {
          if (this.config.addToNgLockedTags.value && ds.lock) {
            this.config.ngLockedTags.addAsync(ds.tagName);
          } else {
            this.config.ngTags.addAsync(ds.tagName);
          }
        }, function(ds) {
          this.config.ngTags.removeAsync([ds.tagName])
          this.config.ngLockedTags.removeAsync([ds.tagName])
        })
      },
      async _toggleContributorNgId(target) {
        var ds = target.dataset
        var contributor = Contributor.new(ds.contributorType, parseInt(ds.id, 10), ds.name)
        var storeName = contributor.ngIdStoreName
        var store = this.config[storeName]
        var id = Math.trunc(Number(ds.id))

        if (!Number.isFinite(id) || id <= 0) {
          console.error('[NicoNicoRankingNG NG-ID] 不正な投稿者IDのため操作を中止:', {
            contributorType: ds.contributorType,
            rawId: ds.id,
            name: ds.name
          })
          return
        }

        var operation = ds.type
        var before = store.set.has(id) || store.set.has(String(id))
        console.group('[NicoNicoRankingNG NG-ID] ' + operation)
        console.log('操作前:', {
          store: storeName,
          id: id,
          name: ds.name,
          inMemoryPresent: before,
          count: store.array.length
        })

        try {
          var changed
          if (operation === 'add') {
            changed = await store.addAsync(id, ds.name)
          } else if (operation === 'remove') {
            changed = await store.removeAsync([id])
          } else {
            throw new Error('unknown operation: ' + operation)
          }

          var expectedPresent = operation === 'add'
          var memoryPresent = store.set.has(id) || store.set.has(String(id))
          var persisted = await store.verifyPersisted(id)
          var ok = memoryPresent === expectedPresent
            && persisted.present === expectedPresent

          console.log('操作後:', {
            changed: changed,
            expectedPresent: expectedPresent,
            inMemoryPresent: memoryPresent,
            persistedPresent: persisted.present,
            count: store.array.length,
            persistedCount: persisted.storedCount,
            result: ok ? '✓ 保存確認OK' : '⚠ 保存状態不一致'
          })

          if (!ok) {
            console.error('[NicoNicoRankingNG NG-ID] 保存検証に失敗しました', {
              store: storeName, id: id, operation: operation
            })
          }

          // モデル/DOM反映はイベント伝播後に監査する。
          setTimeout(function() {
            if (typeof this.config._nrnDiagnosticHook === 'function') {
              this.config._nrnDiagnosticHook('ng-id-mutated', {
                storeName: storeName,
                contributorType: ds.contributorType,
                id: id,
                name: ds.name,
                operation: operation,
                persistedOk: ok
              })
            }
          }.bind(this), 50)
        } catch (e) {
          console.error('[NicoNicoRankingNG NG-ID] 操作失敗:', e)
        } finally {
          console.groupEnd()
        }
      },
      _toggleNgUserName(target) {
        this._toggleData(target, function(ds) {
          ConfigDialog.promptNgUserName(this.config, ds.name)
        }, function(ds) {
          this.config.ngUserNames.removeAsync([ds.matched])
        })
      },
      _clicked(event) {
        var e = event.target
        if (e.id === 'nrn-config-button') {
          this.page.showConfigDialog(this.config)
        } else if (e.id === 'nrn-open-all-movie-info') {
          this._setAllMovieInfoVisible(true)
        } else if (e.id === 'nrn-close-all-movie-info') {
          this._setAllMovieInfoVisible(false)
        } else if (movieAnchor(e)) {
          this._addVisitedMovie(e)
        } else if (e.classList.contains('nrn-visit-button')) {
          this._toggleVisitedMovie(e)
        } else if (e.classList.contains('nrn-movie-ng-button')) {
          this._toggleNgMovie(e)
        } else if (e.classList.contains('nrn-title-ng-button')) {
          this._toggleNgTitle(e)
        } else if (e.classList.contains('nrn-movie-info-toggle')) {
          this.page.getMovieRootBy(e).toggleMovieInfo()
        } else if (e.classList.contains('nrn-description-open-button')
                || e.classList.contains('nrn-description-close-button')) {
          this.page.getMovieRootBy(e).toggleDescription()
        } else if (e.classList.contains('nrn-tag-ng-button')) {
          this._toggleNgTag(e)
        } else if (e.classList.contains('nrn-contributor-ng-button')) {
          this._toggleContributorNgId(e)
        } else if (e.classList.contains('nrn-contributor-ng-id-button')) {
          this._toggleContributorNgId(e)
        } else if (e.classList.contains('nrn-contributor-ng-name-button')) {
          this._toggleNgUserName(e)
        }
      },
    }
    return Controller
  })()

  // ========================================================================
  // Composition root / application startup
  // ========================================================================
  var Main = (function() {
    var MAINTENANCE_MANIFEST = Object.freeze({
      version:'14.0',
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
    var createThumbInfoRequester = function(movies, movieViewModes) {
      var thumbInfo = new ThumbInfo(
          gmXmlHttpRequest(),
          movies.config.thumbInfoConcurrency.value)
        .on('completed', ThumbInfoListener.forCompleted(movies))
        .on('errorOccurred', ThumbInfoListener.forErrorOccurred(movies))
      movies.config.thumbInfoConcurrency.on('changed', function(v) {
        thumbInfo.setConcurrent(v)
        console.log('[NicoNicoRankingNG ThumbInfo] 同時取得数を変更:', thumbInfo.concurrent)
      })
      return function(prefer) {
        var allIds = movieViewModes.sort().map(function(m) { return m.movie.id })
        var pendingIds = allIds.filter(function(id) {
          var movie = movies.get(id)
          return movie && !movie.thumbInfoDone
        })
        var skippedDone = allIds.length - pendingIds.length
        if (skippedDone > 0) {
          console.log('[NicoNicoRankingNG ThumbInfo] 既に詳細情報取得済みのため通信を省略:', {
            totalIds: allIds.length,
            requestIds: pendingIds.length,
            skippedDone: skippedDone
          })
        }
        thumbInfo.request(pendingIds, prefer)
      }
    }
    var getThumbInfoRequester = function(movies, movieViewModes) {
      return movies.config.useGetThumbInfo.value
           ? createThumbInfoRequester(movies, movieViewModes)
           : function() {}
    }
    var createModel = function(config) {
      var movies = new Movies(config)
      var movieViewModes = new MovieViewModes(config)
      var requestThumbInfo = getThumbInfoRequester(movies, movieViewModes)
      return {
        config,
        movies,
        movieViewModes,
        requestThumbInfo,
        createMovies(resultsOfParsing) {
          movies.setIfAbsent(resultsOfParsing.map(function(r) {
            return new Movie(r.movie.id, r.movie.title)
          }))
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
    var getNnrSessionDetailCache = function(config) {
      var STORAGE_KEY = 'NicoNicoRankingNG:detailCache:v2'
      if (window.__nrnSessionDetailCacheService) {
        window.__nrnSessionDetailCacheService.configure(config)
        return window.__nrnSessionDetailCacheService
      }

      var map = new Map()
      var stats = {loads:0, saves:0, expired:0, evicted:0, parseErrors:0}
      var ttlMinutes = 360
      var maxEntries = 1500

      var configure = function(c) {
        if (!c) return
        ttlMinutes = Math.max(1, Math.min(1440,
          Math.trunc(Number(c.sessionDetailCacheTtlMinutes.value)) || 360))
        maxEntries = Math.max(100, Math.min(4000,
          Math.trunc(Number(c.sessionDetailCacheMaxEntries.value)) || 1500))
      }

      var isExpired = function(entry) {
        return !entry || !entry.cachedAt
          || Date.now() - Number(entry.cachedAt) > ttlMinutes * 60 * 1000
      }

      var trim = function() {
        var now = Date.now()
        for (var pair of [...map.entries()]) {
          var entry = pair[1]
          if (!entry || now - Number(entry.cachedAt || 0) > ttlMinutes * 60 * 1000) {
            map.delete(pair[0])
            stats.expired++
          }
        }
        if (map.size > maxEntries) {
          var ordered = [...map.entries()].sort(function(a,b) {
            return Number(a[1].cachedAt || 0) - Number(b[1].cachedAt || 0)
          })
          var removeCount = map.size - maxEntries
          for (var i = 0; i < removeCount; i++) {
            map.delete(ordered[i][0])
            stats.evicted++
          }
        }
      }

      var load = function() {
        configure(config)
        try {
          var raw = sessionStorage.getItem(STORAGE_KEY)
          if (!raw) return
          var parsed = JSON.parse(raw)
          if (!parsed || parsed.schema !== 2 || !Array.isArray(parsed.entries)) return
          parsed.entries.forEach(function(pair) {
            if (Array.isArray(pair) && pair.length === 2) map.set(String(pair[0]), pair[1])
          })
          trim()
          stats.loads++
        } catch (e) {
          stats.parseErrors++
          console.warn('[NicoNicoRankingNG cache] sessionStorage読込失敗:', e)
        }
      }

      var persist = function() {
        trim()
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            schema: 2,
            savedAt: Date.now(),
            entries: [...map.entries()]
          }))
          stats.saves++
        } catch (e) {
          console.warn('[NicoNicoRankingNG cache] sessionStorage保存失敗:', e)
        }
      }

      var service = {
        configure: configure,
        get size() { trim(); return map.size },
        has: function(key) {
          key = String(key)
          var entry = map.get(key)
          if (!entry) return false
          if (isExpired(entry)) {
            map.delete(key)
            stats.expired++
            persist()
            return false
          }
          return true
        },
        get: function(key) {
          key = String(key)
          if (!this.has(key)) return undefined
          return map.get(key)
        },
        set: function(key, value) {
          key = String(key)
          map.set(key, value)
          persist()
          return this
        },
        delete: function(key) {
          var result = map.delete(String(key))
          if (result) persist()
          return result
        },
        clear: function() {
          map.clear()
          persist()
        },
        diagnostics: function() {
          trim()
          return {
            size: map.size,
            ttlMinutes: ttlMinutes,
            maxEntries: maxEntries,
            storageKey: STORAGE_KEY,
            stats: Object.assign({}, stats)
          }
        }
      }

      load()
      window.__nrnSessionDetailCacheService = service
      return service
    }


    var setupAutoFill = function(model, page, controller) {
      var LOG = '[NicoNicoRankingNG autoFill v14.1]'

      if (typeof page.fetchPageItems !== 'function') {
        console.warn(LOG, 'このページでは自動継ぎ足し用のページ取得処理が利用できません')
        return
      }

      // -------------------- utility --------------------
      var gmRequest = function(options) {
        return new Promise(function(resolve, reject) {
          var request = typeof GM_xmlhttpRequest === 'undefined'
            ? GM.xmlHttpRequest : GM_xmlhttpRequest
          request(Object.assign({}, options, {
            onload: resolve,
            onerror: reject,
            ontimeout: function() { reject(new Error('timeout')) }
          }))
        })
      }

      var elapsedText = function(ms) {
        if (!Number.isFinite(ms)) return '-'
        if (ms < 1000) return Math.round(ms) + 'ms'
        return (ms / 1000).toFixed(1) + '秒'
      }

      var arrayCount = function(store) {
        return store && Array.isArray(store.array) ? store.array.length : 0
      }

      // -------------------- SelfAdService --------------------
      var selfAdCache = new Map()
      var normalizeAdName = function(v) {
        return String(v == null ? '' : v).normalize('NFKC').trim()
          .replace(/\s+/g, ' ').toUpperCase()
      }
      var advancedRulesUseField = function(field) {
        if (!model.config.advancedNgRulesEnabled.value) return false
        var visit = function(node) {
          if (!node) return false
          if (node.kind === 'condition') return node.field === field
          return Array.isArray(node.children) && node.children.some(visit)
        }
        return AdvancedNgRules.parse(model.config.advancedNgRulesJson.value)
          .some(function(rule) { return rule.enabled && visit(rule.expression) })
      }
      var selfAdRuleRequired = function() {
        return Boolean(
          advancedRulesUseField('selfAdIdMatch')
          || advancedRulesUseField('selfAdNameMatch')
        )
      }
      var selfAdCheckRequired = function() {
        return Boolean(model.config.selfAdWarningEnabled.value || selfAdRuleRequired())
      }
      var visibleNonNgIds = function(ids) {
        return [...new Set(ids)].filter(function(id) {
          var movie = model.movies.get(id)
          return movie && movie.thumbInfoDone && !movie.ng
        })
      }
      var fetchSelfAdResult = async function(movie) {
        if (!movie) return null
        if (movie.nicoadSelfAdChecked) return {
          checked:true,
          idMatch:Boolean(movie.nicoadSelfAdIdMatch),
          nameMatch:Boolean(movie.nicoadSelfAdNameMatch),
          sponsors:movie.nicoadSelfAdSponsors || [],
          uploaderId:movie.contributor && movie.contributor.type === 'user'
            ? Number(movie.contributor.id) : null,
          uploaderName:movie.contributor ? movie.contributor.name || '' : ''
        }
        if (selfAdCache.has(movie.id)) return selfAdCache.get(movie.id)

        var contributor = movie.contributor
        var uploaderId = contributor && contributor.type === 'user'
          ? Number(contributor.id) : null
        var uploaderName = contributor ? String(contributor.name || '') : ''
        var uploaderNameNorm = normalizeAdName(uploaderName)
        var result = {
          checked:false, idMatch:false, nameMatch:false, sponsors:[],
          uploaderId:Number.isFinite(uploaderId) ? uploaderId : null,
          uploaderName:uploaderName, error:null
        }
        try {
          var response = await gmRequest({
            method:'GET',
            url:'https://api.nicoad.nicovideo.jp/v1/contents/video/'
              + encodeURIComponent(movie.id) + '/thanks?limit=100',
            timeout:10000,
            headers:{'Accept':'application/json'}
          })
          if (Number(response.status) === 404) {
            result.checked = true
            selfAdCache.set(movie.id, result)
            return result
          }
          if (Number(response.status) < 200 || Number(response.status) >= 300) {
            throw new Error('HTTP ' + response.status)
          }
          var json = JSON.parse(response.responseText || response.response || '{}')
          var sponsors = json && json.data && Array.isArray(json.data.sponsors)
            ? json.data.sponsors : []
          result.sponsors = sponsors.map(function(s) {
            return {
              userId:s && s.userId != null ? Number(s.userId) : null,
              advertiserName:s ? String(s.advertiserName || '') : '',
              contribution:s && s.contribution != null ? Number(s.contribution) : null
            }
          })
          result.idMatch = Boolean(Number.isFinite(uploaderId)
            && result.sponsors.some(function(s) {
              return Number.isFinite(s.userId) && s.userId === uploaderId
            }))
          result.nameMatch = Boolean(uploaderNameNorm
            && result.sponsors.some(function(s) {
              return normalizeAdName(s.advertiserName) === uploaderNameNorm
            }))
          result.checked = true
        } catch (e) {
          result.error = String(e && e.message ? e.message : e)
        }
        selfAdCache.set(movie.id, result)
        return result
      }
      var findDomRootsForMovieId = function(movieId) {
        var esc = (window.CSS && CSS.escape) ? CSS.escape(movieId) : String(movieId).replace(/"/g, '\\"')
        var nodes = Array.from(page.doc.querySelectorAll(
          '[data-decoration-video-id="' + esc + '"]'
        ))
        var roots = []
        var seen = new Set()
        nodes.forEach(function(node) {
          var root = node.classList && node.classList.contains('nrn-parsed')
            ? node : node.closest('.nrn-parsed')
          if (!root) root = node
          if (root && root.isConnected && !seen.has(root)) {
            seen.add(root)
            roots.push(root)
          }
        })
        return roots
      }

      var renderSelfAdWarning = function(movie, result) {
        if (!movie || !result || !result.checked
            || (!result.idMatch && !result.nameMatch)) return {roots:0, badges:0, details:0}
        if (!model.config.selfAdWarningEnabled.value) return {roots:0, badges:0, details:0}

        var roots = findDomRootsForMovieId(movie.id)
        var badges = 0
        var details = 0

        roots.forEach(function(rootElem) {
          // 詳細欄は存在すれば説明を追加。MovieRoot参照に依存しない。
          var info = rootElem.querySelector('.nrn-movie-info-container')
          if (info) {
            var old = info.querySelector('.nrn-self-ad-warning')
            if (old) old.remove()
            var warning = page.doc.createElement('div')
            warning.className = 'nrn-self-ad-warning'
            warning.textContent = result.idMatch
              ? '⚠ 自演広告を検出（投稿者ID = 広告者ID）'
              : '⚠ 自演広告の可能性（投稿者名 = 広告者名）'
            warning.title = result.idMatch
              ? '投稿者ユーザーIDと広告者ユーザーIDが一致しました。'
              : '表示名だけの一致です。同名・名前変更の可能性があるため参考判定です。'
            info.insertBefore(warning, info.firstChild)
            details++
          }

          // タイトル直前にも常時表示。サムネイルのoverflow/stacking contextに依存しない。
          var inlineBadge = rootElem.querySelector('.nrn-self-ad-inline-badge')
          if (!inlineBadge) {
            inlineBadge = page.doc.createElement('span')
            inlineBadge.className = 'nrn-self-ad-inline-badge'
            var titleElem = rootElem.querySelector('.nrn-movie-title')
            if (!titleElem) titleElem = rootElem.querySelector('a[data-nrn-movie-anchor="true"][href*="/watch/"]')
            if (!titleElem) titleElem = rootElem.querySelector('a[href^="/watch/"], a[href*="nicovideo.jp/watch/"]')
            if (titleElem && titleElem.parentNode) titleElem.parentNode.insertBefore(inlineBadge, titleElem)
            else rootElem.insertBefore(inlineBadge, rootElem.firstChild)
          }
          inlineBadge.textContent = result.idMatch ? '⚠ 自演広告' : '⚠ 自演広告？'
          inlineBadge.dataset.confidence = result.idMatch ? 'high' : 'name'
          inlineBadge.dataset.nrnMovieId = movie.id
          inlineBadge.title = result.idMatch
            ? '投稿者IDと広告者IDが一致（高信頼）'
            : '投稿者名と広告者名が一致（名前一致のみ・参考）'

          // サムネイル上バッジも補助表示として残す。
          var badge = rootElem.querySelector('.nrn-self-ad-card-badge')
          if (!badge) {
            badge = page.doc.createElement('span')
            badge.className = 'nrn-self-ad-card-badge'

            var thumbHost = rootElem.querySelector('.nrn-thumb-anchor-wrap')
            if (!thumbHost) {
              // 現行NicoNicoカードでは動画サムネイルを含む16:9要素を優先。
              var videoNode = rootElem.querySelector('[class*="asp_16"], img')
              var p = videoNode && videoNode.parentElement
              while (p && p !== rootElem) {
                var r = p.getBoundingClientRect()
                var ps = p.ownerDocument.defaultView.getComputedStyle(p)
                if (r.width > 80 && r.height > 40 &&
                    (ps.position === 'relative' || ps.position === 'absolute')) {
                  thumbHost = p
                  break
                }
                p = p.parentElement
              }
            }
            if (!thumbHost) thumbHost = rootElem
            if (thumbHost === rootElem) {
              var rs = rootElem.ownerDocument.defaultView.getComputedStyle(rootElem)
              if (rs.position === 'static') rootElem.style.position = 'relative'
            }
            thumbHost.appendChild(badge)
          }

          badge.textContent = result.idMatch ? '⚠ 自演広告' : '⚠ 自演広告？'
          badge.dataset.confidence = result.idMatch ? 'high' : 'name'
          badge.dataset.nrnMovieId = movie.id
          badge.title = result.idMatch
            ? '投稿者IDと広告者IDが一致（高信頼）'
            : '投稿者名と広告者名が一致（名前一致のみ・参考）'
          badges++
        })

        return {roots:roots.length, badges:badges, details:details}
      }

      var renderStoredSelfAdWarnings = function(ids, reason) {
        if (!model.config.selfAdWarningEnabled.value) return
        var rows = []
        ;[...new Set(ids)].forEach(function(id) {
          var movie = model.movies.get(id)
          if (!movie || !movie.nicoadSelfAdChecked
              || (!movie.nicoadSelfAdIdMatch && !movie.nicoadSelfAdNameMatch)) return
          var result = {
            checked:true,
            idMatch:Boolean(movie.nicoadSelfAdIdMatch),
            nameMatch:Boolean(movie.nicoadSelfAdNameMatch),
            sponsors:movie.nicoadSelfAdSponsors || []
          }
          var rendered = renderSelfAdWarning(movie, result)
          var roots = findDomRootsForMovieId(id)
          var visibleRoots = roots.filter(function(el) {
            var s = el.ownerDocument.defaultView.getComputedStyle(el)
            var r = el.getBoundingClientRect()
            return s.display !== 'none' && s.visibility !== 'hidden'
              && r.width > 2 && r.height > 2
          })
          rows.push({
            id:id,
            idMatch:result.idMatch,
            nameMatch:result.nameMatch,
            domRoots:rendered.roots,
            visibleRoots:visibleRoots.length,
            badges:rendered.badges,
            details:rendered.details,
            inlineBadgeVisible:visibleRoots.some(function(el) {
              var b = el.querySelector('.nrn-self-ad-inline-badge')
              if (!b) return false
              var bs = b.ownerDocument.defaultView.getComputedStyle(b)
              var br = b.getBoundingClientRect()
              return bs.display !== 'none' && bs.visibility !== 'hidden'
                && Number(bs.opacity || 1) > 0.2
                && br.width > 2 && br.height > 2
            }),
            overlayBadgeVisible:visibleRoots.some(function(el) {
              var b = el.querySelector('.nrn-self-ad-card-badge')
              if (!b) return false
              var bs = b.ownerDocument.defaultView.getComputedStyle(b)
              var br = b.getBoundingClientRect()
              return bs.display !== 'none' && bs.visibility !== 'hidden'
                && Number(bs.opacity || 1) > 0.2
                && br.width > 2 && br.height > 2
            })
          })
        })
        if (rows.length) {
          console.log(LOG, '自演広告警告UI監査:', {
            reason:reason,
            matched:rows.length,
            visibleMatched:rows.filter(function(r){return r.visibleRoots > 0}).length,
            inlineBadgeVisible:rows.filter(function(r){return r.inlineBadgeVisible}).length,
            overlayBadgeVisible:rows.filter(function(r){return r.overlayBadgeVisible}).length,
            badgeMissing:rows.filter(function(r){return r.visibleRoots > 0 && !r.inlineBadgeVisible}).length
          })
          var bad = rows.filter(function(r){ return r.visibleRoots > 0 && !r.inlineBadgeVisible })
          if (bad.length) {
            console.warn(LOG, '自演広告一致は検出済みですが警告バッジが見えていません')
            console.table(bad)
          }
          window.__nrnSelfAdUiAudit = rows
        }
      }

      var ensureSelfAdChecks = async function(ids, reason) {
        if (!selfAdCheckRequired()) return {checked:0, matches:0, errors:0}
        var unique = [...new Set(ids)]
        var cursor = 0, checked = 0, matches = 0, errors = 0
        var rows = []
        var worker = async function() {
          while (cursor < unique.length) {
            var id = unique[cursor++]
            var movie = model.movies.get(id)
            if (!movie || !movie.thumbInfoDone) continue
            var result = await fetchSelfAdResult(movie)
            if (!result) continue
            if (result.checked) {
              checked++
              movie.setNicoadSelfAdResult(result)
              if (result.idMatch || result.nameMatch) {
                matches++
              }
            } else {
              errors++
              movie.nicoadSelfAdError = result.error || 'unknown'
            }
            rows.push({
              id:id, uploaderId:result.uploaderId, uploaderName:result.uploaderName,
              sponsors:result.sponsors ? result.sponsors.length : 0,
              idMatch:result.idMatch, nameMatch:result.nameMatch,
              checked:result.checked, error:result.error || ''
            })
          }
        }
        var started = performance.now()
        await Promise.all(Array.from({length:Math.min(6, Math.max(1, unique.length))}, worker))
        var matchedRows = rows.filter(function(r) { return r.idMatch || r.nameMatch })
        var errorRows = rows.filter(function(r) { return !r.checked || r.error })
        var summary = {
          reason:reason,
          requested:unique.length,
          checked:checked,
          matches:matches,
          idMatches:rows.filter(function(r){return r.idMatch}).length,
          nameMatches:rows.filter(function(r){return r.nameMatch}).length,
          errors:errors,
          elapsedMs:Math.round(performance.now() - started),
          ruleUsesIdMatch:advancedRulesUseField('selfAdIdMatch'),
          ruleUsesNameMatch:advancedRulesUseField('selfAdNameMatch'),
          warningEnabled:model.config.selfAdWarningEnabled.value
        }

        // サマリーは折りたたまない。ログ貼り付け時にも結果が残る。
        console.log(LOG, '自演広告監査集計:', summary)
        if (matchedRows.length) {
          console.warn(LOG, '自演広告一致:', matchedRows.length + '件')
          console.table(matchedRows)
        }
        if (errorRows.length) {
          console.warn(LOG, '自演広告情報の取得失敗/未確認:', errorRows.length + '件')
          console.table(errorRows)
        }
        console.groupCollapsed(LOG + ' 自演広告監査詳細: ' + reason)
        console.table(rows)
        console.groupEnd()

        window.__nrnSelfAdDiagnostics = {
          summary:summary,
          matchedRows:matchedRows,
          errorRows:errorRows,
          rows:rows
        }
        return {checked:checked, matches:matches, errors:errors,
          idMatches:summary.idMatches, nameMatches:summary.nameMatches}
      }

      var decodeSearchPath = function() {
        try {
          return decodeURIComponent(location.pathname.replace(/^\/(tag|search)\//, ''))
        } catch (e) {
          return location.pathname
        }
      }

      // -------------------- StatusPanel --------------------
      var badge = ensureStatusBadge(page.doc)
      var runStartedAt = performance.now()
      var finishedAt = null
      var phase = 'starting'
      var phaseDetail = '準備中'
      var lastTiming = null
      var adPending = 0
      var sourceLabel = '従来方式'
      var fallbackReason = ''

      // -------------------- runtime state --------------------
      var originalRoots = []
      var originalMovieIds = new Set()
      var knownMovieIds = new Set()
      var fetchedExtraPages = 0
      var totalFetchedItems = 0
      var totalApiPrefilteredNg = 0
      var totalDuplicatesRemoved = 0
      var totalDetailChecked = 0
      var totalAcceptedFromAdded = 0
      var candidatePool = []
      var candidatePoolSeen = new Set()
      var nextPageToFetch = page._currentPageNumber + 1
      var fetching = false
      var initialized = false
      var gaveUp = false
      var stopReason = ''
      var noProgressStreak = 0
      var debounceTimer = null
      var completionReported = false
      var lastFetchedHadNext = null
      var snapshotValidated = false
      var snapshotValidation = null
      var snapshotValidationOffset = Math.max(0, (page._currentPageNumber - 1) * 32)
      var snapshotOffset = Math.max(0, page._currentPageNumber * 32)
      var lastAcceptanceRate = null
      var detailCache = getNnrSessionDetailCache(model.config)
      var cacheHits = 0
      var cacheMisses = 0
      var cacheWrites = 0
      var cacheRestores = 0
      var cacheRestoreFailures = 0
      var fetchedPageNumbers = new Set()
      var pagerRenderVersion = 0
      // 現在表示中ページのページネーションUIを最優先の終端情報として使う。
      // fetch先HTMLの maxPage は「3」など局所的な値になることがあるため、
      // 既知終端を小さく上書きしない。
      var currentPhysicalPage = page._currentPageNumber
      // setupAutoFill時点ではReactのページャーが未描画のことがある。
      // ここでは終端を確定せず、waitForInitialRoots後に改めて検査する。
      var knownLastPage = null
      var endPageDetectionSource = 'not-checked-yet'
      var endReachedWithoutRequest = false
      var paginationDetectionHistory = []

      var targetCount = function() {
        var n = Number(model.config.autoFillTargetCount.value)
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 36
      }

      var refreshKnownLastPage = function(reason) {
        var snapshot = typeof page._paginationSnapshot === 'function'
          ? page._paginationSnapshot()
          : null

        var result = {
          reason: reason,
          at: new Date().toISOString(),
          currentPage: currentPageNumber ? currentPageNumber() : currentPhysicalPage,
          snapshot: snapshot,
          previousKnownLastPage: knownLastPage,
          accepted: false,
          decision: ''
        }

        if (!snapshot || !snapshot.hasPaginationEvidence) {
          result.decision = 'ページャー未描画/証拠なし → 終端未確定'
          endPageDetectionSource = 'pagination-not-ready'
        } else if (snapshot.maxPage < snapshot.currentPage) {
          result.decision = '最大ページが現在ページ未満 → 不正値として無視'
        } else {
          // 現在ページの実ページャーに存在する最大番号を採用。
          // 1ページ目なら通常は末尾リンク(例:157)も含まれる。
          knownLastPage = snapshot.maxPage
          endPageDetectionSource = 'current-pagination-ui'
          result.accepted = true
          result.decision = snapshot.maxPage === snapshot.currentPage
            ? '現在ページがページャー最大値 → 最終ページ候補'
            : '現在より大きいページを確認 → 最終ページ=' + snapshot.maxPage
        }

        result.knownLastPageAfter = knownLastPage
        paginationDetectionHistory.push(result)
        if (paginationDetectionHistory.length > 20) paginationDetectionHistory.shift()

        console.groupCollapsed(LOG + ' ページネーション終端検査: ' + reason)
        console.log('判定:', {
          currentPage: result.currentPage,
          previousKnownLastPage: result.previousKnownLastPage,
          knownLastPageAfter: result.knownLastPageAfter,
          accepted: result.accepted,
          decision: result.decision,
          source: endPageDetectionSource
        })
        if (snapshot) {
          console.log('ページャースナップショット:', {
            currentPage: snapshot.currentPage,
            maxPage: snapshot.maxPage,
            pageNumbers: snapshot.pageNumbers,
            linkCount: snapshot.linkCount,
            hasHigherPage: snapshot.hasHigherPage,
            hasLowerPage: snapshot.hasLowerPage,
            hasPaginationEvidence: snapshot.hasPaginationEvidence
          })
          if (snapshot.rows && snapshot.rows.length) {
            console.table(snapshot.rows)
          }
        }
        console.groupEnd()

        return result
      }

      var searchedPhysicalPageCount = function() {
        return useSnapshot ? null : 1 + fetchedPageNumbers.size
      }

      var isRunBusy = function() {
        return Boolean(fetching
          || ['starting','waiting-dom','initial-ng','validating-api','fetching','ng-check','adding'].includes(phase))
      }

      var setPhase = function(nextPhase, detail) {
        detail = detail || ''
        if (phase === nextPhase && phaseDetail === detail) {
          updateStatus()
          return
        }
        phase = nextPhase
        phaseDetail = detail
        if (nextPhase === 'completed' || nextPhase === 'stopped' || nextPhase === 'error') {
          finishedAt = performance.now()
        }
        console.log(LOG, '状態変更:', nextPhase, phaseDetail)
        updateStatus()
      }

      var phaseText = function() {
        switch (phase) {
          case 'starting': return '● 準備中'
          case 'waiting-dom': return '● 初期動画を確認中'
          case 'initial-ng': return '● 初期NG判定中'
          case 'validating-api': return '● API結果を検証中'
          case 'fetching': return '● 動画候補を取得中'
          case 'ng-check': return '● NG判定中'
          case 'adding': return '● 動画を追加中'
          case 'completed':
            return adPending > 0 ? '✓ 目標達成（広告情報更新中）' : '✓ 完了'
          case 'stopped': return '■ 終了'
          case 'error': return '⚠ エラー'
          case 'disabled': return '○ 無効'
          default: return phase
        }
      }

      var connectedOriginalRoots = function() {
        return originalRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
        })
      }

      var connectedInjectedRoots = function() {
        return page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
              && r.elem.dataset.nrnAutofill === 'true'
              && r.movieId
        })
      }

      var currentOriginalRootCandidates = function() {
        return page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected
              && r.elem.dataset.nrnAutofill !== 'true'
              && r.movieId
        })
      }

      var uniqueVisibleRoots = function(roots) {
        var seen = new Set()
        return roots.filter(function(r) {
          if (!r || !r.elem || !r.elem.isConnected || !r.movieId || seen.has(r.movieId)) return false
          var movie = model.movies.get(r.movieId)
          if (!movie) return false
          if (model.config.useGetThumbInfo.value && !movie.thumbInfoDone) return false
          if (movie.ng) return false
          if (r.elem.classList.contains('nrn-hide')) return false
          if (r.elem.classList.contains('nrn-autofill-pending')) return false
          if (r.elem.classList.contains('nrn-autofill-overflow')) return false
          seen.add(r.movieId)
          return true
        })
      }

      var visibleOriginalCount = function() {
        return uniqueVisibleRoots(connectedOriginalRoots()).length
      }
      var visibleInjectedCount = function() {
        return uniqueVisibleRoots(connectedInjectedRoots()).length
      }
      var visibleTotalCount = function() {
        return visibleOriginalCount() + visibleInjectedCount()
      }

      var originalNgCount = function() {
        var ids = new Set()
        connectedOriginalRoots().forEach(function(r) {
          var movie = model.movies.get(r.movieId)
          if (movie && movie.ng) ids.add(r.movieId)
        })
        return ids.size
      }

      var injectedNgCount = function() {
        var ids = new Set()
        connectedInjectedRoots().forEach(function(r) {
          var movie = model.movies.get(r.movieId)
          if (movie && movie.ng) ids.add(r.movieId)
        })
        return ids.size
      }

      var pendingInjectedCount = function() {
        return connectedInjectedRoots().filter(function(r) {
          return r.elem.classList.contains('nrn-autofill-pending')
        }).length
      }

      var rebalanceOverflow = function() {
        connectedInjectedRoots().forEach(function(r) {
          r.elem.classList.remove('nrn-autofill-overflow')
        })
        var remaining = Math.max(0, targetCount() - visibleOriginalCount())
        var visibleInjected = uniqueVisibleRoots(connectedInjectedRoots())
        visibleInjected.forEach(function(r, i) {
          if (i >= remaining) r.elem.classList.add('nrn-autofill-overflow')
        })
      }

      // -------------------- diagnostics --------------------
      var currentSearchDescriptorForLog = function() {
        var u = new URL(location.href)
        var sort = u.searchParams.get('sort') || '(default)'
        var order = u.searchParams.get('order') || '(default)'
        var sortLabels = {
          hotLikeAndMylist: 'ニコニコで人気',
          registeredAt: '投稿日時',
          viewCount: '再生数',
          lastCommentTime: 'コメント日時',
          likeCount: 'いいね！数',
          commentCount: 'コメント数',
          mylistCount: 'マイリスト登録数',
          length: '再生時間',
          duration: '再生時間'
        }
        var orderLabels = {asc: '昇順', desc: '降順'}
        var trackingKeys = new Set(['rf', 'rp', 'ra'])
        var knownFilterKeys = new Set(['start', 'end', 'l_range'])
        var allParams = Array.from(u.searchParams.entries()).map(function(x) {
          return {key: x[0], value: x[1]}
        })
        var filters = allParams.filter(function(x) {
          return knownFilterKeys.has(x.key)
        }).map(function(x) {
          var label = x.key === 'start' ? '期間開始'
            : x.key === 'end' ? '期間終了'
            : x.key === 'l_range' ? '動画時間フィルター' : x.key
          return {key: x.key, value: x.value, label: label}
        })
        var trackingParams = allParams.filter(function(x) {
          return trackingKeys.has(x.key)
        })
        var unknownParams = allParams.filter(function(x) {
          return !['sort','order','page','start','end','l_range','rf','rp','ra'].includes(x.key)
        })
        return {
          type: u.pathname.startsWith('/tag/') ? 'tag'
              : u.pathname.startsWith('/search/') ? 'search' : 'other',
          query: decodeSearchPath(),
          sort: sort,
          sortLabel: sortLabels[sort] || sort,
          order: order,
          orderLabel: orderLabels[order] || order,
          page: u.searchParams.get('page') || '1',
          start: u.searchParams.get('start') || null,
          end: u.searchParams.get('end') || null,
          lengthRange: u.searchParams.get('l_range') || null,
          filters: filters,
          trackingParams: trackingParams,
          unknownParams: unknownParams,
          allParams: allParams,
          canonicalSearchUrl: u.origin + u.pathname + u.search
        }
      }

      var logSearchMethodAudit = function() {
        var search = currentSearchDescriptorForLog()
        console.group(LOG + ' 検索条件・検索法')
        console.table({
          searchType: {value: search.type},
          query: {value: search.query},
          sort: {value: search.sort},
          sortLabel: {value: search.sortLabel},
          order: {value: search.order},
          orderLabel: {value: search.orderLabel},
          page: {value: search.page},
          dateStart: {value: search.start},
          dateEnd: {value: search.end},
          lengthRange: {value: search.lengthRange}
        })
        if (search.filters.length) {
          console.log('検索フィルター:')
          console.table(search.filters)
        }
        if (search.trackingParams.length) {
          console.log('検索結果に影響しない追跡パラメータ:')
          console.table(search.trackingParams)
        }
        if (search.unknownParams.length) {
          console.warn('未分類URLパラメータ（API利用時は安全側に倒して検証/fallback対象）:')
          console.table(search.unknownParams)
        }
        console.log('URLパラメータ全件:')
        console.table(search.allParams)
        console.groupEnd()
        return search
      }

      var logAdvancedRuleTrace = function(movie, label) {
        if (!model.config.developerMode.value
            || !model.config.advancedNgRulesEnabled.value
            || !movie) return
        var matched = AdvancedNgRules.match(
          movie, true, model.config.advancedNgRulesJson.value, true)
        if (!matched.length) return
        console.groupCollapsed(LOG + ' 論理NG判定トレース: ' + (label || movie.id))
        console.log({id:movie.id, title:movie.title})
        matched.forEach(function(rule) {
          console.log('MATCH:', rule.name)
          if (rule.trace) console.table(rule.trace)
        })
        console.groupEnd()
      }

      var logRuntimeSettings = function() {
        var search = currentSearchDescriptorForLog()
        var settings = {
          version: '14.1',
          url: location.href,
          searchType: search.type,
          query: search.query,
          sort: search.sort,
          sortLabel: search.sortLabel,
          order: search.order,
          orderLabel: search.orderLabel,
          page: search.page,
          dateStart: search.start,
          dateEnd: search.end,
          lengthRange: search.lengthRange,
          filters: search.filters.map(function(x){ return x.label + '=' + x.value }).join(', ') || '(none)',
          trackingParams: search.trackingParams.map(function(x){ return x.key + '=' + x.value }).join(', ') || '(none)',
          unknownParams: search.unknownParams.map(function(x){ return x.key + '=' + x.value }).join(', ') || '(none)',
          detectedCurrentPage: currentPhysicalPage,
          detectedLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          paginationDetectionState: 'React描画後に再検査',
          autoFillEnabled: model.config.autoFillEnabled.value,
          targetCount: targetCount(),
          requestedMode: model.config.autoFillInfoMode.value,
          adMode: model.config.autoFillAdMode.value,
          selfAdWarningEnabled: model.config.selfAdWarningEnabled.value,
          selfAdRuleIdMatch:advancedRulesUseField('selfAdIdMatch'),
          selfAdRuleNameMatch:advancedRulesUseField('selfAdNameMatch'),
          selfAdFetchPolicy:selfAdRuleRequired()
            ? '全候補（NG条件に必要）'
            : (model.config.selfAdWarningEnabled.value ? 'NG通過動画のみ' : 'OFF'),
          useGetThumbInfo: model.config.useGetThumbInfo.value,
          thumbInfoConcurrency: model.config.thumbInfoConcurrency.value,
          maxExtraPages: model.config.autoFillMaxExtraPages.value,
          openNewTab: model.config.openNewWindow.value,
          developerMode: model.config.developerMode.value,
          statusPanelMode: model.config.statusPanelMode.value,
          detailUiTheme: model.config.detailUiTheme.value,
          resolvedDetailUiTheme: (window.__nrnDetailUiTheme && window.__nrnDetailUiTheme.resolved) || null,
          detailBatchMax: model.config.autoFillDetailBatchMax.value,
          spaNavigationFix: model.config.spaNavigationFix.value,
          autoFillPagerMode: model.config.autoFillPagerMode.value,
          pagerPreviewCount: model.config.pagerPreviewCount.value,
          sessionDetailCacheEnabled: model.config.sessionDetailCacheEnabled.value,
          sessionDetailCacheTtlMinutes: model.config.sessionDetailCacheTtlMinutes.value,
          sessionDetailCacheMaxEntries: model.config.sessionDetailCacheMaxEntries.value,
          statusAnimationEnabled: model.config.statusAnimationEnabled.value,
          developerDiagnosticMode: model.config.developerDiagnosticMode.value,
          lockedTagCountNg: model.config.ngLockedTagCountEnabled.value,
          lockedTagCountThreshold: model.config.ngLockedTagCountThreshold.value,
          advancedNgRulesEnabled: model.config.advancedNgRulesEnabled.value,
          advancedNgRuleCount: AdvancedNgRules.parse(
            model.config.advancedNgRulesJson.value).length,
          advancedNgRules: AdvancedNgRules.parse(
            model.config.advancedNgRulesJson.value).map(function(r) {
              return {
                name:r.name,
                enabled:r.enabled,
                expression:AdvancedNgRules.expressionText(r.expression)
              }
            }),
          ngMovieCount: arrayCount(model.config.ngMovies),
          ngTitleCount: arrayCount(model.config.ngTitles),
          ngTagCount: arrayCount(model.config.ngTags),
          ngLockedTagCount: arrayCount(model.config.ngLockedTags),
          ngUserIdCount: arrayCount(model.config.ngUserIds),
          ngUserNameCount: arrayCount(model.config.ngUserNames),
          ngChannelIdCount: arrayCount(model.config.ngChannelIds)
        }
        console.group(LOG + ' 実行設定')
        console.table(settings)
        console.log('完全設定オブジェクト:', settings)
        console.groupEnd()
        return settings
      }

      var logNavigationNotice = function() {
        if (!model.config.spaNavigationFix.value) {
          console.warn(LOG,
            'SPAページ移動対策がOFFです。現行NicoNicoでタグ/ページ/並び順を変更すると、'
            + 'URLだけ変わってスクリプトが再初期化されない場合があります。')
        }
      }

      var logNgEffectivenessNotice = function() {
        if (model.config.autoFillInfoMode.value === 'snapshot'
            && model.config.ngLockedTagCountEnabled.value) {
          console.info(
            LOG,
            'API高速モードですが「🔒 タグロック数NG」が有効です。Snapshot APIにはロック情報がないため、'
            + 'この条件はGetThumbInfoによる完全判定が必要です。API事前NGが0件でも異常ではありません。'
          )
        }
      }

      var updateStatus = function() {
        if (!badge) return

        var busyPhases = new Set([
          'starting', 'waiting-dom', 'initial-ng', 'validating-api',
          'fetching', 'ng-check', 'adding'
        ])
        var shouldAnimate = Boolean(
          model.config.statusAnimationEnabled.value && busyPhases.has(phase))
        badge.classList.toggle('nrn-status-busy', shouldAnimate)

        var mode = model.config.statusPanelMode.value
        if (mode === 'hidden') {
          badge.style.display = 'none'
          return
        }
        badge.style.display = ''
        var elapsed = (finishedAt || performance.now()) - runStartedAt

        if (mode === 'compact') {
          badge.textContent = [
            phaseText(),
            initialized
              ? visibleTotalCount() + ' / ' + targetCount() + '件'
              : '判定中 / ' + targetCount() + '件',
            phaseDetail || '',
            !useSnapshot && fetchedPageNumbers.size
              ? '検索 ' + searchedPhysicalPageCount() + 'ページ分'
              : '',
            knownLastPage != null && currentPageNumber() >= knownLastPage
              ? '最終ページ ' + knownLastPage
              : '',
            '経過 ' + elapsedText(elapsed)
          ].filter(Boolean).join('\n')
          badge.title = '設定で詳細表示に変更できます。ダブルクリックで診断情報をConsoleへ出力。'
          return
        }

        var lines = [
          'Nico Nico Ranking NG / AutoFill v14.1',
          '状態：' + phaseText(),
          phaseDetail ? '処理：' + phaseDetail : '',
          '取得方式：' + sourceLabel + (fallbackReason ? '（fallback: ' + fallbackReason + '）' : ''),
          initialized
            ? '表示動画：' + visibleTotalCount() + ' / 目標 ' + targetCount() + '件'
            : '表示動画：判定中 / 目標 ' + targetCount() + '件',
          initialized ? '現在ページのNG：' + originalNgCount() + '件' : '現在ページのNG：判定中',
          '追加分：表示 ' + visibleInjectedCount() + '件 / NG ' + injectedNgCount() + '件',
          '候補プール：' + candidatePool.length + '件 / 詳細判定済み ' + totalDetailChecked + '件',
          '確認済み：' + totalFetchedItems + '件 / 重複除外 ' + totalDuplicatesRemoved + '件',
          totalApiPrefilteredNg ? 'API事前NG：' + totalApiPrefilteredNg + '件' : '',
          lastAcceptanceRate != null ? '直近採用率：' + Math.round(lastAcceptanceRate * 100) + '%' : '',
          '追加取得：' + fetchedExtraPages + '単位',
          useSnapshot
            ? '検索したページ数：API方式のため物理ページ換算なし'
            : '検索したページ数：' + searchedPhysicalPageCount()
              + 'ページ分（現在ページ1＋自動 ' + fetchedPageNumbers.size + '）',
          '取得済みページ：' + (fetchedPageNumbers.size ? [...fetchedPageNumbers].sort(function(a,b){return a-b}).join(',') : 'なし'),
          '最終ページ判定：' + (knownLastPage != null
            ? knownLastPage + '（' + endPageDetectionSource + '）'
            : '未確定'),
          model.config.sessionDetailCacheEnabled.value
            ? '詳細キャッシュ：復元 ' + cacheRestores + ' / hit ' + cacheHits + ' / miss ' + cacheMisses + ' / 保存 ' + detailCache.size + '件'
            : '詳細キャッシュ：OFF',
          '詳細情報同時取得：' + model.config.thumbInfoConcurrency.value + '件',
          'SPAページ移動対策：' + (model.config.spaNavigationFix.value ? 'ON' : 'OFF'),
          model.config.developerMode.value
            ? '開発者モード：ON [' + model.config.developerDiagnosticMode.value + '] ' + (developerSuiteRunning
                ? '（' + developerSuiteStep + '/' + developerSuiteTotalSteps + ' ' + developerSuiteStatus + '）'
                : '（' + developerSuiteStatus + '）')
            : '開発者モード：OFF',
          adPending ? 'ニコニコ広告：' + adPending + '件取得中' : 'ニコニコ広告：待機なし',
          '経過時間：' + elapsedText(elapsed),
          lastTiming ? '直近処理：' + elapsedText(lastTiming.totalMs) : '',
          stopReason ? '終了理由：' + stopReason : '',
          '',
          '※文字はドラッグしてコピーできます。ダブルクリックでConsoleへ診断出力。'
        ].filter(Boolean)
        badge.textContent = lines.join('\n')
      }

      var statusTimer = setInterval(function() {
        if (!document.contains(badge)) {
          clearInterval(statusTimer)
          return
        }
        updateStatus()
      }, 250)

      var logSnapshot = function(reason, extra) {
        var data = {
          reason: reason,
          state: phase,
          phaseDetail: phaseDetail,
          source: sourceLabel,
          fallbackReason: fallbackReason || null,
          target: targetCount(),
          visibleTotal: initialized ? visibleTotalCount() : null,
          visibleOriginal: initialized ? visibleOriginalCount() : null,
          visibleInjected: visibleInjectedCount(),
          originalNg: initialized ? originalNgCount() : null,
          injectedNg: injectedNgCount(),
          pending: pendingInjectedCount(),
          candidatePool: candidatePool.length,
          fetchedUnits: fetchedExtraPages,
          fetchedItems: totalFetchedItems,
          detailChecked: totalDetailChecked,
          acceptedFromAdded: totalAcceptedFromAdded,
          apiPrefilteredNg: totalApiPrefilteredNg,
          duplicatesRemoved: totalDuplicatesRemoved,
          knownIds: knownMovieIds.size,
          thumbInfoConcurrency: model.config.thumbInfoConcurrency.value,
          adMode: model.config.autoFillAdMode.value,
          adPending: adPending,
          fetchedPageNumbers: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
          searchedPhysicalPageCount: searchedPhysicalPageCount(),
          pagerMode: model.config.autoFillPagerMode.value,
          currentPhysicalPage: currentPageNumber(),
          knownLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          endReachedWithoutRequest: endReachedWithoutRequest,
          paginationDetectionHistory: paginationDetectionHistory.slice(),
          detailCacheEnabled: model.config.sessionDetailCacheEnabled.value,
          detailCacheSize: detailCache.size,
          detailCacheHits: cacheHits,
          detailCacheMisses: cacheMisses,
          detailCacheWrites: cacheWrites,
          detailCacheRestores: cacheRestores,
          detailCacheRestoreFailures: cacheRestoreFailures,
          detailCacheBackend: detailCache.diagnostics(),
          snapshotValidated: snapshotValidated,
          snapshotValidation: snapshotValidation,
          elapsedMs: Math.round((finishedAt || performance.now()) - runStartedAt),
          stopReason: stopReason || null
        }
        if (extra) Object.assign(data, extra)
        console.log(LOG, data)
        return data
      }

      badge.addEventListener('dblclick', function() {
        var s = logSnapshot('status badge dblclick', {
          domCards: page.doc.querySelectorAll('[data-decoration-video-id]').length,
          domInjected: page.doc.querySelectorAll('[data-nrn-autofill="true"]').length,
          domHidden: page.doc.querySelectorAll('[data-decoration-video-id].nrn-hide').length
        })
        console.table(s)
      })

      // -------------------- waiting helpers --------------------
      var waitForInitialRoots = function(timeoutMs) {
        return new Promise(function(resolve) {
          var startedAt = Date.now()
          var lastCount = -1
          var stableSince = 0

          var check = function() {
            var candidates = currentOriginalRootCandidates()
            var count = candidates.length
            var domCount = page.doc.querySelectorAll(
              '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
            ).length

            if (count > 0 && count === lastCount) {
              if (!stableSince) stableSince = Date.now()
              if (Date.now() - stableSince >= 300
                  && (domCount === 0 || count >= domCount)) {
                resolve(candidates.slice())
                return
              }
            } else {
              lastCount = count
              stableSince = count > 0 ? Date.now() : 0
            }

            if (Date.now() - startedAt >= timeoutMs) {
              resolve(candidates.slice())
              return
            }
            setTimeout(check, 100)
          }
          check()
        })
      }

      var waitForThumbInfo = function(movieIds, timeoutMs) {
        if (!model.config.useGetThumbInfo.value) return Promise.resolve(true)
        var ids = [...new Set(movieIds)]
        if (!ids.length) return Promise.resolve(true)

        return new Promise(function(resolve) {
          var done = false
          var remaining = new Set(ids.filter(function(id) {
            var movie = model.movies.get(id)
            return movie && !movie.thumbInfoDone
          }))
          if (!remaining.size) {
            resolve(true)
            return
          }

          var finish = function() {
            if (!done && remaining.size === 0) {
              done = true
              clearTimeout(timer)
              resolve(true)
            }
          }

          remaining.forEach(function(id) {
            var movie = model.movies.get(id)
            if (!movie) {
              remaining.delete(id)
              return
            }
            movie.on('thumbInfoDone', function() {
              remaining.delete(id)
              finish()
            })
          })

          var timer = setTimeout(function() {
            if (done) return
            done = true
            console.warn(LOG, '詳細情報待機タイムアウト:', [...remaining])
            resolve(false)
          }, timeoutMs)
          finish()
        })
      }

      // -------------------- duplicate protection --------------------
      var isMovieAlreadyOnPage = function(id) {
        if (!id) return true
        return Array.from(page.doc.querySelectorAll('[data-decoration-video-id]')).some(function(el) {
          return el.getAttribute('data-decoration-video-id') === id
        })
      }

      var filterFreshItems = function(items) {
        var fresh = []
        var duplicateIds = []
        items.forEach(function(item) {
          if (!item || !item.id) return
          if (knownMovieIds.has(item.id)
              || candidatePoolSeen.has(item.id)
              || isMovieAlreadyOnPage(item.id)) {
            duplicateIds.push(item.id)
            knownMovieIds.add(item.id)
          } else {
            candidatePoolSeen.add(item.id)
            fresh.push(item)
          }
        })
        totalDuplicatesRemoved += duplicateIds.length
        return {freshItems: fresh, duplicateIds: duplicateIds}
      }

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
        var u = new URL(location.href)
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

      var snapshotFetchOffset = async function(offset) {
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
          method: 'GET',
          url: SNAPSHOT_ENDPOINT + '?' + p.toString(),
          timeout: 10000
        })
        var networkDone = performance.now()

        if (res.status !== 200) throw new Error('Snapshot API HTTP ' + res.status)
        var json = JSON.parse(res.responseText)
        var data = Array.isArray(json.data) ? json.data : []
        var totalCount = json.meta && Number(json.meta.totalCount)

        var items = data.map(function(x, i) {
          return {
            id: x.contentId,
            title: x.title || x.contentId,
            description: x.description || '',
            duration: Number(x.lengthSeconds) || 0,
            registeredAt: x.startTime || '',
            thumbnail: {listingUrl: x.thumbnailUrl || ''},
            count: {
              view: Number(x.viewCounter) || 0,
              comment: Number(x.commentCounter) || 0,
              mylist: Number(x.mylistCounter) || 0,
              like: Number(x.likeCounter) || 0
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
          hasNextPage: Number.isFinite(totalCount)
            ? offset + data.length < totalCount
            : data.length === 100,
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
      var validateSnapshotAgainstCurrentDom = async function() {
        if (!useSnapshot || snapshotValidated) return
        setPhase('validating-api', '現在ページと検索APIの並び順を照合中')

        var result = await snapshotFetchOffset(snapshotValidationOffset)
        var domIds = []
        var seen = new Set()
        page.doc.querySelectorAll(
          '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
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
        if (compareN >= 10 && overlapRate < 0.70) {
          useSnapshot = false
          sourceLabel = '従来方式'
          fallbackReason = 'API/DOM一致率 ' + Math.round(overlapRate * 100) + '%'
          candidatePool = []
          candidatePoolSeen.clear()
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
        snapshotOffset = 100
        lastFetchedHadNext = result.hasNextPage

        logCandidateTable('API候補（検証結果を再利用）', fresh)
      }

      // -------------------- PagerManager --------------------
      var pageNumberFromHref = function(href) {
        try {
          var u = new URL(href, location.href)
          if (u.origin !== location.origin || u.pathname !== location.pathname) return null
          var p = Number(u.searchParams.get('page') || 1)
          return Number.isFinite(p) && p >= 1 ? Math.trunc(p) : null
        } catch (e) {
          return null
        }
      }

      var compactRanges = function(numbers) {
        var arr = [...new Set(numbers)].sort(function(a,b){return a-b})
        if (!arr.length) return []
        var ranges = []
        var start = arr[0]
        var prev = arr[0]
        for (var i = 1; i < arr.length; i++) {
          var n = arr[i]
          if (n === prev + 1) {
            prev = n
            continue
          }
          ranges.push({start:start,end:prev})
          start = prev = n
        }
        ranges.push({start:start,end:prev})
        return ranges
      }

      var currentPageNumber = function() {
        var u = new URL(location.href)
        var p = Number(u.searchParams.get('page') || 1)
        return Number.isFinite(p) && p >= 1 ? Math.trunc(p) : 1
      }

      var firstUnfetchedPageAfterCurrent = function() {
        var p = currentPageNumber() + 1
        while (fetchedPageNumbers.has(p)) p++
        if (knownLastPage != null && p > knownLastPage) return null
        return p
      }

      var makePageHref = function(pageNumber, baseHref) {
        var u
        try {
          u = new URL(baseHref || location.href, location.href)
        } catch (e) {
          u = new URL(location.href)
        }
        // 検索条件とNicoNicoの rf/rp/ra 等を維持し、pageだけ変更する。
        u.searchParams.set('page', String(pageNumber))
        return u.href
      }

      var pagerPreviewCount = function() {
        return Math.max(0, Math.min(6,
          Math.trunc(Number(model.config.pagerPreviewCount.value)) || 0))
      }

      var pagerOriginalState = new WeakMap()

      var rememberPagerAnchor = function(a) {
        if (pagerOriginalState.has(a)) return
        pagerOriginalState.set(a, {
          // textContentではなくinnerHTMLを保存する。
          // ニコニコの前/次リンクはSVGアイコンなのでtextContent復元するとSVGが消える。
          innerHTML: a.innerHTML,
          textContent: a.textContent,
          href: a.getAttribute('href'),
          title: a.getAttribute('title'),
          display: a.style.display,
          textDecoration: a.style.textDecoration,
          opacity: a.style.opacity,
          pointerEvents: a.style.pointerEvents,
          cursor: a.style.cursor,
          ariaDisabled: a.getAttribute('aria-disabled')
        })
      }

      var restorePagerAnchor = function(a) {
        var s = pagerOriginalState.get(a)
        if (!s) return
        // SVGやspan等の子要素を丸ごと復元する。
        if (a.innerHTML !== s.innerHTML) a.innerHTML = s.innerHTML
        if (s.href == null) a.removeAttribute('href')
        else a.setAttribute('href', s.href)
        if (s.title == null) a.removeAttribute('title')
        else a.setAttribute('title', s.title)
        a.style.display = s.display
        a.style.textDecoration = s.textDecoration
        a.style.opacity = s.opacity
        a.style.pointerEvents = s.pointerEvents
        a.style.cursor = s.cursor
        if (s.ariaDisabled == null) a.removeAttribute('aria-disabled')
        else a.setAttribute('aria-disabled', s.ariaDisabled)
        a.classList.remove('nrn-page-consumed')
        a.removeAttribute('data-nrn-page-range')
        a.removeAttribute('data-nrn-page-range-hidden')
        a.removeAttribute('data-nrn-next-page')
      }

      var isNumericPagerAnchor = function(a) {
        var original = pagerOriginalState.get(a)
        var txt = String(original ? original.textContent : a.textContent || '').trim()
        return /^\d+$/.test(txt)
      }

      var classifyPagerControl = function(a, cur) {
        var p = pageNumberFromHref(a.href)
        if (p == null) return ''
        var txt = String(a.textContent || '').trim().toLowerCase()
        var aria = String(a.getAttribute('aria-label') || '').trim().toLowerCase()
        var rel = String(a.getAttribute('rel') || '').trim().toLowerCase()

        if (rel === 'next'
            || /^(?:次|次へ|next|›|»|→|⇒)$/.test(txt)
            || aria.includes('次') || aria.includes('next')) return 'next'
        if (rel === 'prev' || rel === 'previous'
            || /^(?:前|前へ|prev|previous|‹|«|←|⇐)$/.test(txt)
            || aria.includes('前') || aria.includes('prev')) return 'prev'

        // 現行ニコニコの矢印はSVGだけでtextContentが空の場合がある。
        // 数字ではない同一ページャーリンクなら、遷移先の方向で判定する。
        if (!isNumericPagerAnchor(a)) {
          if (p > cur) return 'next'
          if (p < cur) return 'prev'
        }
        return ''
      }

      var findPagerContext = function() {
        page.doc.querySelectorAll('a[data-nrn-synthetic-page="true"], a[data-nrn-synthetic-next="true"]').forEach(function(a) {
          a.remove()
        })
        var all = Array.from(page.doc.querySelectorAll('a[href]')).filter(function(a) {
          return pageNumberFromHref(a.href) != null
        })
        all.forEach(rememberPagerAnchor)
        // 前回の描画状態を必ず戻してから、新しい取得済み範囲を描画する。
        all.forEach(restorePagerAnchor)

        var cur = currentPageNumber()
        var numeric = all.filter(isNumericPagerAnchor)
        var nextControls = all.filter(function(a) {
          return classifyPagerControl(a, cur) === 'next'
        })
        var prevControls = all.filter(function(a) {
          return classifyPagerControl(a, cur) === 'prev'
        })
        return {
          all: all,
          numeric: numeric,
          nextControls: nextControls,
          prevControls: prevControls
        }
      }

      var createSyntheticNextControl = function(context, nextPage) {
        if (nextPage == null || !context.numeric.length) return null
        var lastNumeric = context.numeric[context.numeric.length - 1]
        var parent = lastNumeric.parentElement
        if (!parent) return null

        var a = page.doc.createElement('a')
        a.href = makePageHref(nextPage)
        a.textContent = '›'
        a.setAttribute('aria-label', '次へ')
        a.style.fontSize = '24px'
        a.style.lineHeight = '1'
        a.style.textDecoration = 'none'
        a.dataset.nrnSyntheticNext = 'true'
        a.dataset.nrnNextPage = String(nextPage)
        a.title = '未取得の直近ページ ' + nextPage + ' を開く'
        a.className = lastNumeric.className
        a.style.marginLeft = '8px'
        parent.appendChild(a)
        console.warn(LOG, '次ページリンクが見つからなかったため補助リンクを生成:', {
          nextPage: nextPage,
          href: a.href
        })
        return a
      }

      var addPagerPreviewLinks = function(context, rangeAnchor, firstPage) {
        var count = pagerPreviewCount()
        if (!count || firstPage == null || !rangeAnchor || !rangeAnchor.parentElement) return []

        var pages = []
        for (var i = 0; i < count; i++) {
          var p = firstPage + i
          if (knownLastPage != null && p >= knownLastPage) break
          if (fetchedPageNumbers.has(p) || p <= currentPageNumber()) continue
          pages.push(p)
        }
        if (!pages.length) return []

        var template = context.numeric.find(function(a) {
          return !a.classList.contains('nrn-page-consumed')
        }) || context.numeric[0]
        var inserted = []
        var anchor = rangeAnchor

        pages.forEach(function(p) {
          var a = page.doc.createElement('a')
          if (template) a.className = template.className
          a.textContent = String(p)
          a.href = makePageHref(p)
          a.dataset.nrnSyntheticPage = 'true'
          a.dataset.nrnPreviewPage = String(p)
          a.title = '未取得ページ ' + p
          a.style.marginLeft = '4px'
          a.style.marginRight = '4px'
          anchor.insertAdjacentElement('afterend', a)
          anchor = a
          inserted.push(a)
        })
        return inserted
      }

      var updatePagerUi = function(reason) {
        var mode = model.config.autoFillPagerMode.value
        if (mode === 'off') return

        // React再描画後のページャーから終端情報も最新化。
        refreshKnownLastPage('pager update: ' + reason)
        pagerRenderVersion++
        var cur = currentPageNumber()
        var consumed = [...fetchedPageNumbers]
          .filter(function(p){ return p > cur })
          .sort(function(a,b){return a-b})
        if (!consumed.length) return

        var context = findPagerContext()
        if (!context.all.length) return

        // 重要: 数字リンクだけを取得済み範囲の対象にする。
        // 前へ/次へ矢印は絶対に範囲圧縮・無効化しない。
        var numericAnchors = context.numeric
        var consumedSet = new Set(consumed)
        var ranges = compactRanges(consumed)

        numericAnchors.forEach(function(a) {
          var p = pageNumberFromHref(a.href)
          if (!p || !consumedSet.has(p)) return

          a.classList.add('nrn-page-consumed')
          a.style.textDecoration = 'line-through'
          a.style.opacity = '0.52'
          a.title = 'Nico Nico Ranking NG が自動取得済みのページ ' + p
          if (mode === 'compactSkip') {
            a.style.pointerEvents = 'none'
            a.style.cursor = 'not-allowed'
            a.setAttribute('aria-disabled', 'true')
          }
        })

        if (mode === 'compactSkip') {
          var lastRangeAnchor = null
          ranges.forEach(function(range) {
            var rangeAnchors = numericAnchors.filter(function(a) {
              var p = pageNumberFromHref(a.href)
              return p >= range.start && p <= range.end
            }).sort(function(a,b) {
              return pageNumberFromHref(a.href) - pageNumberFromHref(b.href)
            })
            if (!rangeAnchors.length) return

            var first = rangeAnchors[0]
            lastRangeAnchor = first
            if (range.start !== range.end) {
              first.textContent = range.start + '–' + range.end
              first.setAttribute('data-nrn-page-range', range.start + '-' + range.end)
              for (var i = 1; i < rangeAnchors.length; i++) {
                rangeAnchors[i].style.display = 'none'
                rangeAnchors[i].setAttribute('data-nrn-page-range-hidden', 'true')
              }
            }
          })

          var nextPage = firstUnfetchedPageAfterCurrent()
          var previewLinks = addPagerPreviewLinks(context, lastRangeAnchor, nextPage)
          var nextControls = context.nextControls

          if (nextPage == null) {
            nextControls.forEach(function(a) {
              rememberPagerAnchor(a)
              a.removeAttribute('data-nrn-next-page')
              a.setAttribute('data-nrn-hidden-final-next','true')
              a.setAttribute('aria-hidden','true')
              a.style.display = 'none'
              a.style.pointerEvents = 'none'
              a.title = '最終ページまで取得済み'
            })
          } else {
            if (!nextControls.length) {
              var synthetic = createSyntheticNextControl(context, nextPage)
              if (synthetic) nextControls = [synthetic]
            }

            nextControls.forEach(function(a) {
              rememberPagerAnchor(a)
              // href/titleだけ変更し、SVGを含む中身には一切触れない。
              // 元hrefを基準にすることで rf/rp/ra などのNicoNico側パラメータも維持。
              var nextHref = makePageHref(nextPage, pagerOriginalState.get(a)
                ? pagerOriginalState.get(a).href : a.href)
              a.removeAttribute('data-nrn-hidden-final-next')
              a.removeAttribute('aria-hidden')
              a.style.display = ''
              a.style.pointerEvents = ''
              a.style.opacity = ''
              a.style.textDecoration = ''
              a.style.cursor = 'pointer'
              a.removeAttribute('aria-disabled')
              a.href = nextHref
              a.dataset.nrnNextPage = String(nextPage)
              a.title = '未取得の直近ページ ' + nextPage + ' を開く'
            })
          }
        }

        console.log(LOG, 'ページャー更新:', {
          reason: reason,
          mode: mode,
          currentPage: cur,
          searchedPhysicalPageCount: searchedPhysicalPageCount(),
          fetchedPages: consumed,
          compactRanges: ranges.map(function(r) {
            return r.start === r.end ? String(r.start) : r.start + '-' + r.end
          }),
          nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
          previewCountSetting: pagerPreviewCount(),
          previewPages: Array.from(page.doc.querySelectorAll('a[data-nrn-synthetic-page="true"]')).map(function(a) {
            return Number(a.dataset.nrnPreviewPage)
          }),
          totalPageLinks: context.all.length,
          numericPageLinks: numericAnchors.length,
          nextControls: context.nextControls.length,
          prevControls: context.prevControls.length,
          nextControlDetails: context.nextControls.map(function(a) {
            return {
              href: a.href,
              ariaLabel: a.getAttribute('aria-label') || '',
              rel: a.getAttribute('rel') || '',
              text: String(a.textContent || '').trim(),
              hasSvg: Boolean(a.querySelector('svg')),
              childCount: a.childNodes.length
            }
          }),
          renderVersion: pagerRenderVersion
        })
      }

      var isLiveNextPagerControl = function(a) {
        if (!a || !a.matches || !a.matches('a[href]')) return false
        rememberPagerAnchor(a)
        var cur = currentPageNumber()
        return classifyPagerControl(a, cur) === 'next'
      }

      var correctNextControlHref = function(a, reason) {
        if (model.config.autoFillPagerMode.value !== 'compactSkip') return null
        if (!isLiveNextPagerControl(a)) return null
        var nextPage = firstUnfetchedPageAfterCurrent()
        if (nextPage == null) {
          a.setAttribute('data-nrn-hidden-final-next','true')
          a.setAttribute('aria-hidden','true')
          a.style.display = 'none'
          a.style.pointerEvents = 'none'
          console.log(LOG, '次リンクを非表示（最終ページまで確認済み）:', {
            reason:reason,
            currentPage:currentPageNumber(),
            knownLastPage:knownLastPage
          })
          return null
        }

        var original = pagerOriginalState.get(a)
        var desired = makePageHref(nextPage, original ? original.href : a.href)
        if (a.href !== desired) {
          console.log(LOG, 'React再描画後の次リンクhrefを再補正:', {
            reason: reason,
            before: a.href,
            after: desired,
            nextPage: nextPage
          })
          a.href = desired
        }
        a.dataset.nrnNextPage = String(nextPage)
        a.title = '未取得の直近ページ ' + nextPage + ' を開く'
        return desired
      }

      // hover時に補正するので、ブラウザ左下のリンク表示も正しい値になる。
      ;['pointerover', 'focusin'].forEach(function(eventName) {
        page.doc.addEventListener(eventName, function(e) {
          var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
          if (a) correctNextControlHref(a, eventName)
        }, true)
      })

      // click時はhrefを書き換えるだけでなく、NicoNico Reactが古いpage=2を使う前に
      // 確定した未取得ページURLへ直接遷移させる。
      page.doc.addEventListener('click', function(e) {
        if (e.defaultPrevented || e.button !== 0) return
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
        if (!a || !isLiveNextPagerControl(a)) return

        var desired = correctNextControlHref(a, 'click')
        if (!desired) return

        e.preventDefault()
        e.stopPropagation()
        console.log(LOG, '次リンクを未取得ページへ確定遷移:', {
          from: location.href,
          to: desired,
          fetchedPages: [...fetchedPageNumbers].sort(function(x,y){return x-y})
        })
        location.href = desired
      }, true)

      var restorePagerUi = function() {
        page.doc.querySelectorAll('a[href], a[data-nrn-synthetic-next="true"]').forEach(function(a) {
          if (a.dataset.nrnSyntheticNext === 'true'
              || a.dataset.nrnSyntheticPage === 'true') {
            a.remove()
            return
          }
          restorePagerAnchor(a)
        })
      }


      // -------------------- CandidateSource / pool --------------------
      var fetchMoreCandidates = async function(minNeeded) {
        var fetchStart = performance.now()

        if (useSnapshot) {
          if (!snapshotValidated) await validateSnapshotAgainstCurrentDom()
          if (!useSnapshot) return fetchMoreCandidates(minNeeded)

          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            var result = await snapshotFetchOffset(snapshotOffset)
            snapshotOffset += 100
            fetchedExtraPages++
            totalFetchedItems += result.items.length
            lastFetchedHadNext = result.hasNextPage

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

              console.log(LOG, 'API事前NG判定:', {
                input: fresh.length,
                rejected: quickRows.length,
                passed: passed.length,
                reasons: quickRows.reduce(function(acc, x) {
                  acc[x.reason] = (acc[x.reason] || 0) + 1
                  return acc
                }, {})
              })
              fresh = passed
            }

            logCandidateTable('API取得 offset=' + result.offset, fresh)
            fresh.forEach(function(item) { candidatePool.push(item) })

            if (!result.items.length) break
          }
        } else {
          while (candidatePool.length < minNeeded && lastFetchedHadNext !== false) {
            var pageNumber = nextPageToFetch++

            // 現在ページUIから終端が分かっている場合は、存在しないページへ通信しない。
            if (knownLastPage != null && pageNumber > knownLastPage) {
              lastFetchedHadNext = false
              endReachedWithoutRequest = true
              nextPageToFetch = pageNumber
              console.log(LOG, '最終ページ到達を事前検出。HTTP要求を省略:', {
                attemptedPage: pageNumber,
                knownLastPage: knownLastPage,
                source: endPageDetectionSource
              })
              break
            }

            console.log(LOG, '次ページ取得判断:', {
              requestedPage: pageNumber,
              currentPage: currentPageNumber(),
              knownLastPage: knownLastPage,
              endPageDetectionSource: endPageDetectionSource,
              fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
              candidatePool: candidatePool.length,
              minNeeded: minNeeded,
              allowed: knownLastPage == null || pageNumber <= knownLastPage
            })

            var result
            try {
              result = await page.fetchPageItems(pageNumber, {
                scope: 'RUN',
                requestId: 'RUN-autofill-p' + pageNumber
              })
            } catch (e) {
              // 終端情報を読めなかった場合の安全弁。
              // 連番の次ページ取得で400/404なら検索終端として正常終了扱いにする。
              if (e && (e.status === 400 || e.status === 404)
                  && pageNumber > currentPageNumber()) {
                lastFetchedHadNext = false
                knownLastPage = pageNumber - 1
                endPageDetectionSource = 'HTTP-' + e.status + '-boundary'
                console.warn(LOG, '次ページが存在しないため最終ページとして正常終了:', {
                  requestedPage: pageNumber,
                  detectedLastPage: knownLastPage,
                  status: e.status,
                  url: e.url
                })
                break
              }
              throw e
            }

            fetchedExtraPages++
            fetchedPageNumbers.add(pageNumber)

            var resultMaxPage = Number(result.maxPage)
            if (result.hasNextPage === false) {
              var previousKnownLastPage = knownLastPage
              knownLastPage = pageNumber
              endPageDetectionSource = 'fetched-final-page-ui'
              console.log(LOG, '取得ページの最終ページUIを確定:', {
                pageFetched:pageNumber,
                previousKnownLastPage:previousKnownLastPage,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage,
                hasNextPage:false
              })
            } else if (Number.isFinite(resultMaxPage)
                && (knownLastPage == null || resultMaxPage > knownLastPage)) {
              var previousKnownLastPage2 = knownLastPage
              knownLastPage = resultMaxPage
              endPageDetectionSource = 'fetched-pagination'
              console.log(LOG, '取得ページから最終ページ情報を更新:', {
                pageFetched:pageNumber,
                previousKnownLastPage:previousKnownLastPage2,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage
              })
            } else {
              console.log(LOG, '取得ページのmaxPageは既知終端を維持:', {
                pageFetched:pageNumber,
                resultMaxPage:resultMaxPage,
                knownLastPage:knownLastPage
              })
            }

            updatePagerUi('page fetched: ' + pageNumber)
            totalFetchedItems += Array.isArray(result.items) ? result.items.length : 0
            lastFetchedHadNext =
              typeof result.hasNextPage === 'boolean' ? result.hasNextPage : null

            var items = Array.isArray(result.items) ? result.items : []
            items.forEach(function(item, idx) {
              item.__nrnSourcePage = pageNumber
              item.__nrnSourceIndex = idx
            })

            var filtered = filterFreshItems(items)
            logCandidateTable('ページ ' + pageNumber + ' 候補', filtered.freshItems)
            filtered.freshItems.forEach(function(item) { candidatePool.push(item) })

            if (!items.length) break
          }
        }

        return performance.now() - fetchStart
      }

      // -------------------- AdService --------------------
      var decorateAds = function(roots, reason) {
        var mode = model.config.autoFillAdMode.value
        if (mode === 'none' || !roots.length) return
        adPending += roots.length
        updateStatus()

        var adStarted = performance.now()
        Promise.allSettled(roots.map(function(r) {
          return page._applyAdDecoration(r.elem, r.movieId)
        })).then(function() {
          adPending = Math.max(0, adPending - roots.length)
          console.log(LOG, 'ニコニコ広告取得完了:', {
            reason: reason,
            count: roots.length,
            elapsedMs: Math.round(performance.now() - adStarted)
          })
          updateStatus()
        })
      }

      var removePending = function(ids) {
        var s = new Set(ids)
        connectedInjectedRoots().forEach(function(r) {
          if (s.has(r.movieId)) r.elem.classList.remove('nrn-autofill-pending')
        })
      }

      var chooseDetailBatchSize = function(shortage) {
        var baseRate = lastAcceptanceRate
        if (baseRate == null && originalMovieIds.size) {
          baseRate = Math.max(0.05, visibleOriginalCount() / originalMovieIds.size)
        }
        if (baseRate == null) baseRate = 0.35
        baseRate = Math.max(0.08, Math.min(0.90, baseRate))

        // 必要数 / 直近採用率 に20%余裕。
        // ただし一度に大量のGetThumbInfoを投げない。
        var estimated = Math.ceil(shortage / baseRate * 1.20)
        var minimum = Math.max(shortage, Math.min(24, shortage + 8))
        var configuredMax = Math.max(
          8, Math.min(100, Math.trunc(Number(model.config.autoFillDetailBatchMax.value)) || 48))
        return Math.max(Math.min(minimum, configuredMax), Math.min(configuredMax, estimated))
      }

      var cacheKeyForMovie = function(id) {
        return String(id || '')
      }

      var applyThumbInfoFromCache = ThumbInfoListener.forCompleted(model.movies)

      var restoreCachedMovieDetails = function(ids, reason) {
        if (!model.config.sessionDetailCacheEnabled.value) {
          return {hits:0, misses:ids.length, restored:0}
        }
        detailCache.configure(model.config)
        var rows = []
        var restored = 0
        var hits = 0
        var misses = 0

        ;[...new Set(ids)].forEach(function(id) {
          var key = cacheKeyForMovie(id)
          var cached = detailCache.get(key)
          if (!cached) {
            misses++
            cacheMisses++
            rows.push({id:id, cache:'MISS', restored:false})
            return
          }
          hits++
          cacheHits++
          var movie = model.movies.get(id)
          if (!movie || movie.thumbInfoDone) {
            rows.push({id:id, cache:'HIT', restored:false, note:'movie無し/既に完了'})
            return
          }
          try {
            applyThumbInfoFromCache({
              id: id,
              description: cached.description || '',
              tags: Array.isArray(cached.tags) ? cached.tags : [],
              contributor: cached.contributor || {type:'unknown', id:-1, name:''},
              title: cached.title || movie.title,
              error: {type:'NO_ERROR', message:'cache'}
            })
            restored++
            cacheRestores++
            rows.push({
              id:id,
              cache:'HIT',
              restored:true,
              tagCount:Array.isArray(cached.tags) ? cached.tags.length : 0,
              contributorType:cached.contributor ? cached.contributor.type : 'unknown',
              ageMinutes:Math.round((Date.now() - Number(cached.cachedAt || 0)) / 60000)
            })
          } catch (e) {
            cacheRestoreFailures++
            rows.push({id:id, cache:'HIT', restored:false, note:String(e)})
            console.warn(LOG, 'キャッシュ復元失敗:', {id:id, error:e})
          }
        })

        if (hits || model.config.developerMode.value) {
          console.groupCollapsed(LOG + ' 詳細キャッシュ復元: ' + reason)
          console.table(rows)
          console.log('集計:', {
            input: ids.length,
            hits: hits,
            misses: misses,
            restored: restored,
            backend: detailCache.diagnostics()
          })
          console.groupEnd()
        }
        return {hits:hits, misses:misses, restored:restored}
      }

      var cacheMovieAfterCheck = function(id) {
        if (!model.config.sessionDetailCacheEnabled.value) return
        var movie = model.movies.get(id)
        if (!movie || !movie.thumbInfoDone) return
        if (movie.error && movie.error.type && movie.error.type !== 'NO_ERROR') return
        var payload = {
          id: id,
          title: movie.title || '',
          description: movie.description || '',
          contributor: movie.contributor ? {
            type: movie.contributor.type,
            id: movie.contributor.id,
            name: movie.contributor.name
          } : null,
          tags: (movie.tags || []).map(function(t) {
            return {name:t.name, lock:Boolean(t.lock)}
          }),
          ng: Boolean(movie.ng),
          ngReasons: getMovieNgReasons(movie),
          cachedAt: Date.now()
        }
        detailCache.set(cacheKeyForMovie(id), payload)
        cacheWrites++
      }

      var logCacheCandidateAudit = function(items) {
        if (!model.config.sessionDetailCacheEnabled.value) return
        var rows = items.map(function(item) {
          var hit = detailCache.has(cacheKeyForMovie(item.id))
          var cached = hit ? detailCache.get(cacheKeyForMovie(item.id)) : null
          return {
            id: item.id,
            title: item.title,
            cache: hit ? 'HIT' : 'MISS',
            cachedNg: cached ? cached.ng : '',
            cachedReasons: cached ? (cached.ngReasons || []).join(' / ') : ''
          }
        })
        console.groupCollapsed(LOG + ' セッション詳細キャッシュ候補照合')
        console.table(rows)
        console.groupEnd()
      }

      var evaluateCandidateBatch = async function(items) {
        if (!items.length) {
          return {checked: 0, accepted: 0, ng: 0, rows: [], timings: {}}
        }

        logCacheCandidateAudit(items)
        setPhase('adding', items.length + '件を詳細判定用に追加中')

        var wholeStart = performance.now()
        var addStart = performance.now()
        var addedIds = []
        var itemById = new Map()

        var parsedResults = items.map(function(item) {
          var tile = page._createInjectedTile(item)
          addedIds.push(item.id)
          itemById.set(item.id, item)
          knownMovieIds.add(item.id)
          return {
            type: 'main',
            movie: {id: item.id, title: item.title},
            rootElem: tile
          }
        })

        setup(parsedResults, model, page, controller)
        restoreCachedMovieDetails(addedIds, '自動追加候補')
        var addEnd = performance.now()

        var addedRootMap = new Map()
        connectedInjectedRoots().forEach(function(r) {
          if (itemById.has(r.movieId)) addedRootMap.set(r.movieId, r)
        })
        var addedRoots = addedIds.map(function(id) {
          return addedRootMap.get(id)
        }).filter(Boolean)

        if (model.config.autoFillAdMode.value === 'all') {
          decorateAds(addedRoots, '候補すべて')
        }

        setPhase('ng-check',
          addedIds.length + '件をNG判定中（同時 ' + model.config.thumbInfoConcurrency.value + '件）')

        var thumbStart = performance.now()
        model.requestThumbInfo(true)
        var completed = await waitForThumbInfo(addedIds, 30000)
        var thumbEnd = performance.now()

        if (!completed) {
          throw new Error('動画詳細情報のNG判定がタイムアウト')
        }

        var candidateSelfAdStarted = performance.now()
        if (selfAdRuleRequired()) {
          await ensureSelfAdChecks(addedIds, '自動追加候補 / NG条件必須')
        } else if (model.config.selfAdWarningEnabled.value) {
          var warningOnlyIds = visibleNonNgIds(addedIds)
          console.log(LOG, '自演広告監査を表示動画だけに限定:', {
            phase:'自動追加候補',
            all:addedIds.length,
            visibleCandidates:warningOnlyIds.length,
            skippedNg:addedIds.length - warningOnlyIds.length
          })
          await ensureSelfAdChecks(warningOnlyIds, '自動追加候補 / 表示動画のみ')
        }
        var candidateSelfAdMs = Math.round(performance.now() - candidateSelfAdStarted)

        removePending(addedIds)

        // v13.3: 非表示中に▲▼を測定しない。カードを表示してから2フレーム待ち、
        // 追加カード全件のトグル位置を実DOM上で再確定する。
        await new Promise(function(resolve) {
          requestAnimationFrame(function() {
            requestAnimationFrame(resolve)
          })
        })

        renderStoredSelfAdWarnings(addedIds, '自動追加カード表示後')

        var toggleAuditRows = addedRoots.map(function(root) {
          var movie = model.movies.get(root.movieId)
          var expectedVisible = Boolean(movie && !movie.ng
            && !root.elem.classList.contains('nrn-autofill-pending')
            && !root.elem.classList.contains('nrn-autofill-overflow'))
          var ok = expectedVisible && root._refreshMovieInfoToggleAfterReveal
            ? root._refreshMovieInfoToggleAfterReveal() : false
          var t = root.movieInfo && root.movieInfo.toggle
          var rect = t && t.isConnected ? t.getBoundingClientRect() : null
          var style = t && t.isConnected
            ? t.ownerDocument.defaultView.getComputedStyle(t) : null
          return {
            id:root.movieId,
            expectedVisible:expectedVisible,
            ng:Boolean(movie && movie.ng),
            overflow:root.elem.classList.contains('nrn-autofill-overflow'),
            present:Boolean(t && t.isConnected),
            visible:Boolean(rect && rect.width > 0 && rect.height > 0
              && style && style.display !== 'none' && style.visibility !== 'hidden'),
            pinned:Boolean(t && t.dataset.nrnPinned === 'true'),
            pinWaiting:Boolean(t && t.dataset.nrnPinWaiting === 'true'),
            top:t && t.dataset.nrnBaselineTop ? Number(t.dataset.nrnBaselineTop) : null,
            result:expectedVisible ? (ok ? 'OK' : '要確認') : '対象外（NG/予備）'
          }
        })
        var checkedToggleRows = toggleAuditRows.filter(function(r){ return r.expectedVisible })
        var toggleMissing = checkedToggleRows.filter(function(r) {
          return !r.present || !r.visible || !r.pinned
        })
        console.log(LOG, '自動追加動画 ▲▼ 監査:', {
          candidates:toggleAuditRows.length,
          checkedVisible:checkedToggleRows.length,
          skippedNgOrOverflow:toggleAuditRows.length - checkedToggleRows.length,
          present:checkedToggleRows.filter(function(r){return r.present}).length,
          visible:checkedToggleRows.filter(function(r){return r.visible}).length,
          pinned:checkedToggleRows.filter(function(r){return r.pinned}).length,
          problems:toggleMissing.length
        })
        if (toggleMissing.length) {
          console.warn(LOG, '自動追加動画の▲▼に問題があります')
          console.table(toggleMissing)
        }
        window.__nrnInjectedToggleAudit = toggleAuditRows

        var rows = addedIds.map(function(id, i) {
          var movie = model.movies.get(id)
          var item = itemById.get(id)
          var reasons = getMovieNgReasons(movie)
          return {
            order: i + 1,
            id: id,
            title: item ? item.title : (movie ? movie.title : ''),
            registeredAt: item ? item.registeredAt || '' : '',
            source: item && item.__nrnSnapshot
              ? 'API:' + item.__nrnSnapshotOffset
              : item ? 'page:' + item.__nrnSourcePage + '#' + item.__nrnSourceIndex : '',
            ng: Boolean(movie && movie.ng),
            ngReasons: reasons,
            decision: movie && movie.ng ? 'NG' : '表示候補'
          }
        })

        if (model.config.sessionDetailCacheEnabled.value) {
          addedIds.forEach(cacheMovieAfterCheck)
        }

        var accepted = rows.filter(function(r) { return !r.ng }).length
        var ngCount = rows.length - accepted
        totalDetailChecked += rows.length
        totalAcceptedFromAdded += accepted
        lastAcceptanceRate = rows.length ? accepted / rows.length : lastAcceptanceRate

        rebalanceOverflow()
        renderStoredSelfAdWarnings(addedIds, 'overflow調整後')

        if (model.config.autoFillAdMode.value === 'visible') {
          var visibleAddedRoots = addedRoots.filter(function(r) {
            var movie = model.movies.get(r.movieId)
            return movie && !movie.ng
                && !r.elem.classList.contains('nrn-hide')
                && !r.elem.classList.contains('nrn-autofill-overflow')
          })
          decorateAds(visibleAddedRoots, '表示動画のみ')
        }

        var end = performance.now()
        var timings = {
          domAddMs:Math.round(addEnd - addStart),
          thumbInfoMs:Math.round(thumbEnd - thumbStart),
          selfAdMs:candidateSelfAdMs,
          postProcessMs:Math.round(end - thumbEnd),
          totalMs:Math.round(end - wholeStart)
        }

        console.group(LOG + ' 詳細NG判定結果')
        console.table(rows.map(function(r) {
          return {
            order: r.order,
            source: r.source,
            id: r.id,
            title: r.title,
            registeredAt: r.registeredAt,
            decision: r.decision,
            ngReason: r.ngReasons.join(' / ')
          }
        }))
        console.log('NG理由集計:', summarizeNgReasons(rows))
        console.table({
          checked: {value: rows.length},
          accepted: {value: accepted},
          ng: {value: ngCount},
          acceptanceRatePercent: {
            value: rows.length ? Math.round(accepted / rows.length * 1000) / 10 : 0
          },
          domAddMs:{value:timings.domAddMs},
          thumbInfoMs:{value:timings.thumbInfoMs},
          selfAdMs:{value:timings.selfAdMs},
          totalMs:{value:timings.totalMs}
        })
        console.groupEnd()

        return {
          checked: rows.length,
          accepted: accepted,
          ng: ngCount,
          rows: rows,
          timings: timings
        }
      }

      // -------------------- main controller --------------------
      var maybeFetchMore = async function() {
        if (!initialized || fetching || gaveUp) {
          updateStatus()
          return
        }

        if (!model.config.autoFillEnabled.value) {
          setPhase('disabled', '自動継ぎ足しOFF')
          return
        }

        rebalanceOverflow()
        if (visibleTotalCount() >= targetCount()) {
          setPhase('completed', '目標件数に到達')
          if (!completionReported) {
            completionReported = true
            updatePagerUi('target reached')
            logSnapshot('目標達成')
          }
          return
        }

        var maxExtra = Number(model.config.autoFillMaxExtraPages.value) || 0
        if (maxExtra > 0 && fetchedExtraPages >= maxExtra && candidatePool.length === 0) {
          gaveUp = true
          stopReason = '追加取得ページ数の上限に到達'
          setPhase('stopped', stopReason)
          return
        }

        if (lastFetchedHadNext === false && candidatePool.length === 0) {
          gaveUp = true
          stopReason = knownLastPage != null
            ? '最終ページ ' + knownLastPage + ' まで確認済み'
            : '取得元の最終位置に到達'
          setPhase('stopped', stopReason)
          console.log(LOG, '自動継ぎ足し正常終了:', {
            reason: stopReason,
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            searchedPhysicalPageCount: searchedPhysicalPageCount(),
            visible: visibleTotalCount(),
            target: targetCount()
          })
          console.log(LOG, '実行パフォーマンス総括:', {
            elapsedMs:Math.round(performance.now() - startedAt),
            initial:window.__nrnInitialPerformance || null,
            fetchedPages:[...fetchedPageNumbers].sort(function(a,b){return a-b}),
            fetchedItems:totalFetchedItems,
            detailChecked:totalDetailChecked,
            cacheHits:detailCacheStats.hits,
            cacheMisses:detailCacheStats.misses,
            newTabMutation:window.__nrnNewTabAudit || null,
            selfAdRuleRequired:selfAdRuleRequired(),
            selfAdWarningEnabled:model.config.selfAdWarningEnabled.value
          })
          return
        }

        fetching = true
        var cycleStart = performance.now()

        try {
          var shortage = targetCount() - visibleTotalCount()
          var detailBatchSize = chooseDetailBatchSize(shortage)

          // APIは候補だけ多めに保持してよいが、詳細判定は必要量だけ。
          var desiredPool = useSnapshot
            ? Math.max(detailBatchSize, Math.min(100, detailBatchSize + 24))
            : detailBatchSize

          var fetchMs = 0
          if (candidatePool.length < detailBatchSize) {
            setPhase('fetching',
              '候補を補充中（必要 ' + detailBatchSize + '件 / プール ' + candidatePool.length + '件）')
            fetchMs = await fetchMoreCandidates(desiredPool)
          }

          if (!candidatePool.length) {
            if (lastFetchedHadNext === false) {
              gaveUp = true
              stopReason = '取得できる候補がありません'
              setPhase('stopped', stopReason)
              return
            }
            noProgressStreak++
            if (noProgressStreak >= 5) {
              gaveUp = true
              stopReason = '候補取得を5回試しても新規動画なし'
              setPhase('stopped', stopReason)
            }
            return
          }

          shortage = targetCount() - visibleTotalCount()
          detailBatchSize = Math.min(
            candidatePool.length,
            chooseDetailBatchSize(shortage)
          )

          var batch = candidatePool.splice(0, detailBatchSize)
          console.log(LOG, '候補プールから詳細判定へ:', {
            shortage: shortage,
            selected: batch.length,
            poolRemaining: candidatePool.length,
            estimatedAcceptanceRate:
              lastAcceptanceRate == null ? null : Math.round(lastAcceptanceRate * 1000) / 10
          })

          var result = await evaluateCandidateBatch(batch)
          lastTiming = {
            fetchMs: fetchMs,
            domAddMs:result.timings.domAddMs || 0,
            thumbInfoMs:result.timings.thumbInfoMs || 0,
            selfAdMs:result.timings.selfAdMs || 0,
            totalMs:performance.now() - cycleStart
          }

          if (result.accepted > 0) noProgressStreak = 0
          else noProgressStreak++

          var acceptanceClass =
            lastAcceptanceRate == null ? 'unknown'
            : lastAcceptanceRate < 0.10 ? 'very-low'
            : lastAcceptanceRate < 0.30 ? 'low'
            : 'normal'

          console.log(LOG, '処理サイクル完了:', {
            visibleNow: visibleTotalCount(),
            target: targetCount(),
            shortageRemaining: Math.max(0, targetCount() - visibleTotalCount()),
            candidatePoolRemaining: candidatePool.length,
            detailCheckedThisCycle: result.checked,
            acceptedThisCycle: result.accepted,
            ngThisCycle: result.ng,
            acceptanceRate:
              lastAcceptanceRate == null ? null : Math.round(lastAcceptanceRate * 1000) / 10,
            acceptanceClass: acceptanceClass,
            acceptanceNote: '診断値のみ。低採用率だけでは異常判定や方式変更をしません。',
            pager: {
              mode: model.config.autoFillPagerMode.value,
              currentPage: currentPageNumber(),
              knownLastPage: knownLastPage,
              endPageDetectionSource: endPageDetectionSource,
              searchedPhysicalPageCount: searchedPhysicalPageCount(),
              fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
              nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
              latestPaginationDetection: paginationDetectionHistory.length
                ? paginationDetectionHistory[paginationDetectionHistory.length - 1]
                : null
            },
            statusAnimation: {
              enabled: model.config.statusAnimationEnabled.value,
              active: model.config.statusAnimationEnabled.value
                && ['starting','waiting-dom','initial-ng','validating-api','fetching','ng-check','adding'].includes(phase)
            },
            advancedRules: {
              enabled:model.config.advancedNgRulesEnabled.value,
              configured:AdvancedNgRules.parse(model.config.advancedNgRulesJson.value).length
            },
            cache: {
              enabled: model.config.sessionDetailCacheEnabled.value,
              size: detailCache.size,
              hits: cacheHits,
              misses: cacheMisses,
              writes: cacheWrites
            },
            timings: {
              candidateFetchMs: Math.round(lastTiming.fetchMs),
              domAddMs:Math.round(lastTiming.domAddMs),
              thumbInfoMs:Math.round(lastTiming.thumbInfoMs),
              selfAdMs:Math.round(lastTiming.selfAdMs || 0),
              totalCycleMs:Math.round(lastTiming.totalMs)
            }
          })

          if (noProgressStreak >= 10) {
            gaveUp = true
            stopReason = '10回連続で表示可能動画が増えず'
            setPhase('stopped', stopReason)
          }
        } catch (e) {
          console.error(LOG, '自動継ぎ足しでエラー:', e)

          if (useSnapshot) {
            useSnapshot = false
            sourceLabel = '従来方式'
            fallbackReason = 'API実行エラー: ' + (e && e.message ? e.message : e)
            candidatePool = []
            candidatePoolSeen.clear()
            lastFetchedHadNext = null
            nextPageToFetch = page._currentPageNumber + 1
            console.warn(LOG, 'APIから従来方式へfallbackして続行します')
          } else {
            gaveUp = true
            stopReason = e && e.message ? e.message : '通信または解析エラー'
            setPhase('error', stopReason)
          }
        } finally {
          fetching = false
          updateStatus()

          if (!gaveUp && model.config.autoFillEnabled.value) {
            if (visibleTotalCount() >= targetCount()) {
              setPhase('completed', '目標件数に到達')
              if (!completionReported) {
                completionReported = true
                updatePagerUi('target reached')
                logSnapshot('目標達成')
              }
            } else {
              setTimeout(maybeFetchMore, 0)
            }
          }
        }
      }

      // -------------------- Developer diagnostics --------------------
      var developerSuiteRunning = false
      var developerSuiteLastRunAt = 0
      var developerSuiteStep = 0
      var developerSuiteTotalSteps = 5
      var developerSuiteStatus = '未実行'

      var setDeveloperProgress = function(step, label) {
        developerSuiteStep = step
        developerSuiteStatus = label
        console.log(LOG, '[DEV ' + step + '/' + developerSuiteTotalSteps + '] ' + label)
        updateStatus()
      }

      var auditUserIdNg = async function(reason) {
        var store = model.config.ngUserIds
        var configured = store.set
        var diagnosticValue = function(entry) {
          return entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
            ? entry.value : entry
        }
        var invalidEntries = store.arrayWithText.filter(function(entry) {
          var v = diagnosticValue(entry)
          var n = Math.trunc(Number(v))
          return !Number.isFinite(n) || n <= 0
        })

        var typeHistogram = {}
        store.arrayWithText.forEach(function(entry) {
          var v = diagnosticValue(entry)
          var t = typeof v
          typeHistogram[t] = (typeHistogram[t] || 0) + 1
        })

        var rows = []
        var contributorIdsSeen = new Set()
        connectedOriginalRoots().concat(connectedInjectedRoots()).forEach(function(root) {
          if (!root.movieId || !root.elem || !root.elem.isConnected) return
          var movie = model.movies.get(root.movieId)
          if (!movie || !movie.contributor || movie.contributor.type !== 'user') return

          var c = movie.contributor
          var id = Math.trunc(Number(c.id))
          var inStore = configured.has(id) || configured.has(String(id))
          var rootHidden = root.elem.classList.contains('nrn-hide')
          var shouldHideByUserId = inStore && !model.config.ngMovieVisible.value

          rows.push({
            movieId: movie.id,
            title: movie.title,
            userId: id,
            userName: c.name,
            inNgUserIdStore: inStore,
            contributorNgId: c.ngId,
            contributorNg: c.ng,
            movieNg: movie.ng,
            rootHidden: rootHidden,
            shouldHideByUserId: shouldHideByUserId,
            mismatch:
              inStore !== Boolean(c.ngId)
              || (inStore && !movie.ng)
              || (shouldHideByUserId && !rootHidden)
          })
          contributorIdsSeen.add(id)
        })

        var mismatches = rows.filter(function(r) { return r.mismatch })
        var matchedConfiguredOnPage = rows.filter(function(r) {
          return r.inNgUserIdStore
        }).length

        console.group(LOG + ' 開発者診断 / NGユーザーID監査: ' + reason)
        console.table({
          configuredCount: {value: store.array.length},
          configuredUniqueCount: {value: configured.size},
          invalidEntries: {value: invalidEntries.length},
          currentUserMovies: {value: rows.length},
          configuredUsersFoundOnPage: {value: matchedConfiguredOnPage},
          mismatches: {value: mismatches.length},
          valueTypes: {value: JSON.stringify(typeHistogram)}
        })

        if (mismatches.length) {
          console.error(LOG, 'NGユーザーIDのモデル/DOM不一致を検出:', mismatches)
          console.table(mismatches)
        } else {
          console.log(LOG, 'NGユーザーID整合性: ✓ 現在ページでは不一致なし')
        }

        if (invalidEntries.length) {
          console.warn(LOG, 'NGユーザーIDリスト内の不正値:', invalidEntries)
        }

        // 現在ページに存在するユーザーのうちNG登録されているものを一覧化。
        console.groupCollapsed('現在ページのNGユーザーID一致一覧')
        console.table(rows.filter(function(r) { return r.inNgUserIdStore }))
        console.groupEnd()
        console.groupEnd()

        return {
          configuredCount: store.array.length,
          uniqueCount: configured.size,
          invalidCount: invalidEntries.length,
          rows: rows,
          mismatches: mismatches
        }
      }

      var auditDomModel = function() {
        var domCards = Array.from(page.doc.querySelectorAll('[data-decoration-video-id]'))
        var domIds = domCards.map(function(el) {
          return el.getAttribute('data-decoration-video-id')
        }).filter(Boolean)
        var unique = new Set(domIds)
        var duplicates = []
        var counts = {}
        domIds.forEach(function(id) {
          counts[id] = (counts[id] || 0) + 1
        })
        Object.keys(counts).forEach(function(id) {
          if (counts[id] > 1) duplicates.push({id:id, count:counts[id]})
        })

        var roots = page.movieRoots.filter(function(r) {
          return r.elem && r.elem.isConnected && r.movieId
        })
        var rootIds = new Set(roots.map(function(r) { return r.movieId }))
        var domSet = new Set(domIds)

        var rootOnlyIds = [...rootIds].filter(function(id) { return !domSet.has(id) })
        var domOnlyIds = [...domSet].filter(function(id) { return !rootIds.has(id) })

        var classifyDomElement = function(el) {
          if (!el) return {area:'missing', main:false, auxiliary:false}
          var area = el.getAttribute('data-anchor-area')
            || (el.closest('[data-anchor-area]')
              && el.closest('[data-anchor-area]').getAttribute('data-anchor-area'))
            || ''
          var auxiliary = Boolean(
            el.closest('aside')
            || el.closest('[data-anchor-area="related"]')
            || el.closest('[data-anchor-area="recommend"]')
            || el.closest('[data-nrn-autofill-overflow="true"]')
          )
          var main = area === 'main' || (!area && !auxiliary)
          return {area:area || '(none)', main:main, auxiliary:auxiliary}
        }

        var rootOnlyRows = rootOnlyIds.map(function(id) {
          var movie = model.movies.get(id)
          var root = roots.find(function(r) { return r.movieId === id })
          var elem = root && root.elem
          var decorated = elem && (
            elem.matches && elem.matches('[data-decoration-video-id]')
              ? elem : elem.querySelector && elem.querySelector('[data-decoration-video-id]')
          )
          var cls = classifyDomElement(decorated || elem)
          var reason = ''
          var severity = 'info'
          if (!elem || !elem.isConnected) {
            reason = '切断済みroot（監査時点では通常無視）'
            severity = 'info'
          } else if (!decorated) {
            reason = 'MovieRootはあるが現行UIのdata-decoration-video-idカードではない'
            severity = 'info'
          } else if (!cls.main || cls.auxiliary) {
            reason = 'メイン検索結果外の補助カード/関連領域'
            severity = 'info'
          } else {
            reason = 'メインカード相当rootなのにDOMカード集合と不一致'
            severity = 'warning'
          }
          return {
            id:id,
            title:movie ? movie.title : '',
            classification:severity,
            reason:reason,
            anchorArea:cls.area,
            movieNg:Boolean(movie && movie.ng),
            thumbInfoDone:Boolean(movie && movie.thumbInfoDone),
            elemConnected:Boolean(elem && elem.isConnected),
            injected:Boolean(elem && elem.dataset && elem.dataset.nrnAutofill === 'true')
          }
        })

        var domOnlyRows = domOnlyIds.map(function(id) {
          var el = domCards.find(function(e) {
            return e.getAttribute('data-decoration-video-id') === id
          })
          var cls = classifyDomElement(el)
          var reason = ''
          var severity = 'info'
          if (!cls.main || cls.auxiliary) {
            reason = 'メイン検索結果外の補助カード/関連領域'
            severity = 'info'
          } else if (el && el.dataset.nrnAutofill === 'true'
              && el.classList.contains('nrn-autofill-overflow')) {
            reason = '自動追加の予備/overflowカード'
            severity = 'info'
          } else {
            reason = 'メイン検索結果カードなのにMovieRootが未生成'
            severity = 'warning'
          }
          return {
            id:id,
            classification:severity,
            reason:reason,
            anchorArea:cls.area,
            text:el ? String(el.textContent || '').trim().slice(0, 120) : '',
            hidden:Boolean(el && el.classList.contains('nrn-hide')),
            injected:Boolean(el && el.dataset.nrnAutofill === 'true')
          }
        })

        var warningRootOnly = rootOnlyRows.filter(function(r) {
          return r.classification === 'warning'
        })
        var warningDomOnly = domOnlyRows.filter(function(r) {
          return r.classification === 'warning'
        })
        var informationalRootOnly = rootOnlyRows.filter(function(r) {
          return r.classification !== 'warning'
        })
        var informationalDomOnly = domOnlyRows.filter(function(r) {
          return r.classification !== 'warning'
        })

        var result = {
          domCards:domIds.length,
          domUniqueIds:unique.size,
          duplicateCardCount:domIds.length - unique.size,
          connectedMovieRoots:roots.length,
          connectedRootUniqueIds:rootIds.size,
          rootOnlyIds:rootOnlyIds,
          domOnlyIds:domOnlyIds,
          warningRootOnlyIds:warningRootOnly.map(function(r){ return r.id }),
          warningDomOnlyIds:warningDomOnly.map(function(r){ return r.id }),
          informationalRootOnlyIds:informationalRootOnly.map(function(r){ return r.id }),
          informationalDomOnlyIds:informationalDomOnly.map(function(r){ return r.id }),
          mismatchWarningCount:warningRootOnly.length + warningDomOnly.length,
          mismatchInfoCount:informationalRootOnly.length + informationalDomOnly.length,
          hiddenCards:domCards.filter(function(el) {
            return el.classList.contains('nrn-hide')
          }).length,
          injectedCards:domCards.filter(function(el) {
            return el.dataset.nrnAutofill === 'true'
          }).length
        }

        console.group(LOG + ' 開発者診断 / DOM・モデル')
        console.table({
          domCards:{value:result.domCards},
          domUniqueIds:{value:result.domUniqueIds},
          duplicateCardCount:{value:result.duplicateCardCount},
          connectedMovieRoots:{value:result.connectedMovieRoots},
          connectedRootUniqueIds:{value:result.connectedRootUniqueIds},
          hiddenCards:{value:result.hiddenCards},
          injectedCards:{value:result.injectedCards},
          mismatchWarningCount:{value:result.mismatchWarningCount},
          mismatchInfoCount:{value:result.mismatchInfoCount}
        })

        if (duplicates.length) {
          console.warn(LOG, 'DOM重複動画:', duplicates)
          console.table(duplicates)
        }

        if (result.mismatchWarningCount > 0) {
          console.warn(LOG, 'DOM/モデル差分（要確認）:', {
            warningRootOnlyIds:result.warningRootOnlyIds,
            warningDomOnlyIds:result.warningDomOnlyIds
          })
        } else if (rootOnlyIds.length || domOnlyIds.length) {
          console.log(LOG, 'DOM/モデル差分はありますが、現時点では補助要素などの情報差分として分類:', {
            informationalRootOnlyIds:result.informationalRootOnlyIds,
            informationalDomOnlyIds:result.informationalDomOnlyIds
          })
        } else {
          console.log(LOG, 'DOM/モデル整合性: ✓ 差分なし')
        }

        if (rootOnlyRows.length) {
          console.groupCollapsed(LOG + ' rootOnly 分類詳細')
          console.table(rootOnlyRows)
          console.groupEnd()
        }
        if (domOnlyRows.length) {
          console.groupCollapsed(LOG + ' domOnly 分類詳細')
          console.table(domOnlyRows)
          console.groupEnd()
        }

        console.log(LOG, 'DOM/モデル監査の意味:', {
          warning:'メイン検索結果に関係する差分。要確認。',
          info:'関連動画・補助カード・現行UIカードではないroot等。通常は致命的ではない。',
          note:'単純なrootOnly/domOnly件数だけでは異常判定しません。'
        })
        console.groupEnd()
        return result
      }

      var developerDryRunSources = async function() {
        var summary = {
          legacy: {supported: true, ok: false},
          hybrid: {supported: Boolean(snapshotDescriptor.supported), ok: false},
          snapshot: {supported: Boolean(snapshotDescriptor.supported), ok: false}
        }

        // 1) 従来方式: 次ページHTMLを読むだけ。
        try {
          var legacyPage = page._currentPageNumber + 1
          var t0 = performance.now()
          var legacy = await page.fetchPageItems(legacyPage, {
            scope: 'DEV',
            requestId: 'DEV-legacy-p' + legacyPage
          })
          var legacyItems = Array.isArray(legacy.items) ? legacy.items : []
          summary.legacy = {
            supported: true,
            ok: true,
            candidateCount: legacyItems.length,
            estimatedDetailChecks: legacyItems.length,
            elapsedMs: Math.round(performance.now() - t0),
            hasNextPage: legacy.hasNextPage,
            sampleIds: legacyItems.slice(0, 12).map(function(x) { return x.id })
          }
          console.groupCollapsed(LOG + ' DEV方式1/3 従来方式')
          console.table(legacyItems.slice(0, 36).map(function(x, i) {
            return {order:i+1,id:x.id,title:x.title,registeredAt:x.registeredAt||''}
          }))
          console.groupEnd()
        } catch (e) {
          summary.legacy.error = String(e && e.message || e)
        }

        if (snapshotDescriptor.supported) {
          try {
            var s0 = performance.now()
            var snapshot = await snapshotFetchOffset(0)
            var apiItems = snapshot.items || []
            var sourceMs = Math.round(performance.now() - s0)

            // API併用: API候補を全て完全判定へ送る方式としてシミュレーション。
            summary.hybrid = {
              supported: true,
              ok: true,
              candidateCount: apiItems.length,
              estimatedDetailChecks: apiItems.length,
              sourceElapsedMs: sourceMs,
              note: 'API候補を全件完全NG判定へ送る'
            }

            // API高速: APIだけで確定できるNGを先に除外した場合をシミュレーション。
            var quickRows = apiItems.map(function(item) {
              return {item:item, reason:apiQuickNgReason(item)}
            })
            var quickRejected = quickRows.filter(function(x) { return x.reason }).length
            var quickPassed = apiItems.length - quickRejected
            summary.snapshot = {
              supported: true,
              ok: true,
              candidateCount: apiItems.length,
              apiPrefilterRejected: quickRejected,
              estimatedDetailChecks: quickPassed,
              sourceElapsedMs: sourceMs,
              prefilterReductionPercent: apiItems.length
                ? Math.round(quickRejected / apiItems.length * 1000) / 10 : 0,
              note: model.config.ngLockedTagCountEnabled.value
                ? '🔒 タグロック数NGは完全判定が必要' : ''
            }

            // DOM/API順序とタイトル整合性も同じSnapshot取得結果から監査。
            var domIds = []
            var seen = new Set()
            page.doc.querySelectorAll('[data-decoration-video-id]:not([data-nrn-autofill="true"])').forEach(function(el) {
              var id = el.getAttribute('data-decoration-video-id')
              if (id && !seen.has(id)) { seen.add(id); domIds.push(id) }
            })
            var apiIds = apiItems.map(function(x) { return x.id })
            var compareN = Math.min(domIds.length, apiIds.length, 36)
            var exact = 0
            var apiHead = new Set(apiIds.slice(0, Math.max(48, compareN + 12)))
            var overlap = 0
            for (var i = 0; i < compareN; i++) {
              if (domIds[i] === apiIds[i]) exact++
              if (apiHead.has(domIds[i])) overlap++
            }
            var exactRate = compareN ? Math.round(exact / compareN * 1000) / 10 : 0
            var overlapRate = compareN ? Math.round(overlap / compareN * 1000) / 10 : 0
            summary.hybrid.exactRate = exactRate
            summary.hybrid.overlapRate = overlapRate
            summary.snapshot.exactRate = exactRate
            summary.snapshot.overlapRate = overlapRate

            var apiById = new Map(apiItems.map(function(x) { return [x.id, x] }))
            var titleRows = connectedOriginalRoots().slice(0,36).map(function(r) {
              var m = model.movies.get(r.movieId)
              var a = apiById.get(r.movieId)
              return {id:r.movieId,modelTitle:m?m.title:'',apiTitle:a?a.title:'',match:Boolean(m&&a&&m.title===a.title)}
            }).filter(function(x){ return x.apiTitle })
            var titleMismatch = titleRows.filter(function(x){ return !x.match }).length
            summary.hybrid.titleMismatches = titleMismatch
            summary.snapshot.titleMismatches = titleMismatch

            console.groupCollapsed(LOG + ' DEV方式2/3 API併用')
            console.table(apiItems.slice(0,36).map(function(x,i){return {order:i+1,id:x.id,title:x.title,registeredAt:x.registeredAt||''}}))
            console.log('DOM/API整合:', {compared:compareN,exactRatePercent:exactRate,overlapRatePercent:overlapRate,titleMismatches:titleMismatch})
            console.groupEnd()

            console.groupCollapsed(LOG + ' DEV方式3/3 API高速')
            console.table(quickRows.slice(0,36).map(function(x,i){return {order:i+1,id:x.item.id,title:x.item.title,apiDecision:x.reason?'事前NG':'完全判定へ',reason:x.reason||''}}))
            console.log('API事前判定効果:', {input:apiItems.length,rejected:quickRejected,detailChecksNeeded:quickPassed,reductionPercent:summary.snapshot.prefilterReductionPercent})
            console.groupEnd()
          } catch (e) {
            summary.hybrid.error = String(e && e.message || e)
            summary.snapshot.error = String(e && e.message || e)
          }
        } else {
          summary.hybrid.reason = snapshotDescriptor.reason
          summary.snapshot.reason = snapshotDescriptor.reason
        }

        console.group(LOG + ' 開発者診断 / 3方式比較')
        console.table({
          legacy: {
            supported:summary.legacy.supported, ok:summary.legacy.ok,
            candidates:summary.legacy.candidateCount||0,
            estimatedDetailChecks:summary.legacy.estimatedDetailChecks||0,
            sourceMs:summary.legacy.elapsedMs||null,
            note:summary.legacy.error||''
          },
          hybrid: {
            supported:summary.hybrid.supported, ok:summary.hybrid.ok,
            candidates:summary.hybrid.candidateCount||0,
            estimatedDetailChecks:summary.hybrid.estimatedDetailChecks||0,
            sourceMs:summary.hybrid.sourceElapsedMs||null,
            note:summary.hybrid.error||summary.hybrid.reason||summary.hybrid.note||''
          },
          snapshot: {
            supported:summary.snapshot.supported, ok:summary.snapshot.ok,
            candidates:summary.snapshot.candidateCount||0,
            estimatedDetailChecks:summary.snapshot.estimatedDetailChecks||0,
            sourceMs:summary.snapshot.sourceElapsedMs||null,
            note:summary.snapshot.error||summary.snapshot.reason||summary.snapshot.note||''
          }
        })
        console.groupEnd()
        return summary
      }

      var runDeveloperSuite = async function(reason, forcedFull) {
        if (!model.config.developerMode.value || developerSuiteRunning) return
        var diagnosticMode = forcedFull ? 'full' : model.config.developerDiagnosticMode.value
        if (diagnosticMode === 'manual' && !forcedFull) {
          developerSuiteStatus = '手動待機'
          updateStatus()
          console.log(LOG, '開発者診断は「手動のみ」のため自動実行を省略:', reason)
          return
        }
        developerSuiteRunning = true
        developerSuiteLastRunAt = performance.now()
        developerSuiteStep = 0
        developerSuiteTotalSteps = diagnosticMode === 'full' ? 5 : 4
        developerSuiteStatus = '開始'
        var runWasBusyAtDiagnosticStart = isRunBusy()
        console.group(LOG + ' ===== 開発者モード一括診断 START =====')
        console.log('実行レーン:', 'DEV（診断）')
        console.log('本番処理状態:', runWasBusyAtDiagnosticStart ? 'RUN処理中（ログは[RUN]/[DEV]で識別）' : 'RUN待機/完了')
        console.log('理由:', reason)
        console.log('診断モード:', diagnosticMode, forcedFull ? '(手動完全診断)' : '')
        console.log('※設定を変更しません。完全診断の3方式比較もdry-run/シミュレーションで、診断用動画をDOMへ追加しません。')

        try {
          setDeveloperProgress(1, '設定監査')
          logRuntimeSettings()

          setDeveloperProgress(2, 'DOM・モデル・重複監査')
          var domAudit = auditDomModel()
          console.log(LOG, 'ページャー診断:', {
            mode: model.config.autoFillPagerMode.value,
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            isFinalPage: knownLastPage != null && currentPageNumber() >= knownLastPage,
            endPageDetectionSource: endPageDetectionSource,
            searchedPhysicalPageCount: searchedPhysicalPageCount(),
            fetchedPages: [...fetchedPageNumbers].sort(function(a,b){return a-b}),
            compactRanges: compactRanges([...fetchedPageNumbers]).map(function(r){
              return r.start === r.end ? String(r.start) : r.start + '-' + r.end
            }),
            nextUnfetchedPage: firstUnfetchedPageAfterCurrent(),
            matchingPageLinks: Array.from(page.doc.querySelectorAll('a[href]')).filter(function(a){
              return pageNumberFromHref(a.href) != null
            }).length,
            paginationSnapshot: typeof page._paginationSnapshot === 'function'
              ? page._paginationSnapshot() : null,
            detectionHistory: paginationDetectionHistory.slice()
          })

          setDeveloperProgress(3, 'NGユーザーID監査')
          var userAudit = await auditUserIdNg(reason)

          var sourceAudit = null
          if (diagnosticMode === 'full') {
            setDeveloperProgress(4, '3方式取得テスト')
            sourceAudit = await developerDryRunSources()
            setDeveloperProgress(5, '総合判定')
          } else {
            setDeveloperProgress(4, '総合判定（軽量）')
          }
          var verdicts = []
          if (domAudit.duplicateCardCount > 0) verdicts.push('DOM重複あり: ' + domAudit.duplicateCardCount + '件')
          if (domAudit.mismatchWarningCount > 0) {
            verdicts.push('DOM/モデル差分（要確認）: ' + domAudit.mismatchWarningCount + '件')
          } else if (domAudit.mismatchInfoCount > 0) {
            console.log(LOG, 'DOM/モデル情報差分:', domAudit.mismatchInfoCount
              + '件（補助要素等として分類。総合判定の警告には含めません）')
          }
          if (userAudit.mismatches.length) verdicts.push('NGユーザーID反映不一致: ' + userAudit.mismatches.length + '件')
          if (userAudit.invalidCount) verdicts.push('NGユーザーID不正値: ' + userAudit.invalidCount + '件')
          if (sourceAudit) {
            ;['hybrid','snapshot'].forEach(function(mode) {
              var m = sourceAudit[mode]
              if (m && m.supported && m.ok && Number.isFinite(m.overlapRate) && m.overlapRate < 70) {
                verdicts.push(mode + ' のDOM一致率が低い: ' + m.overlapRate + '%')
              }
            })
          }

          developerSuiteStatus = verdicts.length ? '完了・要確認' : '完了・正常'
          console.log(LOG, '開発者診断総合判定:', verdicts.length ? verdicts : ['✓ 重大な整合性問題は検出されませんでした'])
          console.log(LOG, '診断所要時間:', Math.round(performance.now() - developerSuiteLastRunAt) + 'ms')
          console.log(LOG, '===== 開発者モード一括診断 END =====')
        } catch (e) {
          developerSuiteStatus = '診断エラー'
          console.error(LOG, '開発者診断中にエラー:', e)
        } finally {
          console.groupEnd()
          developerSuiteRunning = false
          updateStatus()
        }
      }

      // ControllerからNG-ID操作後の監査を呼べるようにする。
      model.config._nrnDiagnosticHook = function(reason, detail) {
        console.log(LOG, '診断フック:', reason, detail || {})
        if (reason === 'manual-developer-suite') {
          if (!model.config.developerMode.value) {
            console.warn(LOG, '手動診断には開発者モードをONにしてください')
            return
          }
          runDeveloperSuite('設定画面から手動実行', true)
          return
        }
        if (reason === 'ng-id-mutated') {
          auditUserIdNg(
            'NG-ID操作後 id=' + detail.id + ' operation=' + detail.operation)
        }
        if (model.config.developerMode.value) {
          // 重い全診断は連打しない。ID監査は上で即時実行済み。
          var now = performance.now()
          if (now - developerSuiteLastRunAt > 2000) {
            setTimeout(function() {
              runDeveloperSuite(reason)
            }, 100)
          }
        }
      }

      // -------------------- initialize --------------------
      var initialize = async function() {
        console.log(LOG, '詳細情報UI:', {
          behavior:'クリックで開閉。詳細は動画カード内部の通常レイアウトへ挿入し、マウスアウトでは閉じません。',
          layout:'reserved-space-below-card + pinned-toggle-v2（追加カードは表示後に▲▼を再測定。NG/予備カードは位置監査対象外）',
          design:'classic-functional（タグ名 → 🔒 → [+]。NG操作を常時表示し、装飾を最小限にする）',
          bulkControls:'上部バーの「全て開く / 全て閉じる」で一括操作可能'
        })
        console.log(LOG, 'ログ識別子:', {
          RUN:'実際の自動継ぎ足し・ユーザー画面へ反映する処理',
          DEV:'開発者モードのdry-run/比較診断。画面へ候補を追加しない',
          requestId:'同時通信があっても開始と解析結果を同じIDで追跡できます'
        })
        logSearchMethodAudit()
        logRuntimeSettings()
        console.group(LOG + ' 複合NGルール設定')
        console.log('有効:', model.config.advancedNgRulesEnabled.value)
        var activeAdvancedRules = AdvancedNgRules.parse(model.config.advancedNgRulesJson.value)
        console.table(activeAdvancedRules.map(function(rule, i) {
          return {
            no:i + 1,
            name:rule.name,
            enabled:rule.enabled,
            expression:AdvancedNgRules.expressionText(rule.expression)
          }
        }))
        console.log('判定論理: AND（論理積） / OR（論理和） / NOT（論理否定）を任意に入れ子可能')
        console.log('用語:', {
          condition: '条件式 = 1つの判定',
          group: '条件グループ = 複数の条件式をまとめたもの',
          nesting: '入れ子（ネスト） = グループの中に別グループを置くこと',
          comparisonOperators: '> / ≥ / < / ≤ / = / ≠',
          substringMatch: '部分一致 = 入力文字列が対象文字列の一部に含まれる',
          exactMatch: '完全一致 = 文字列全体またはタグ名1個が完全に同じ',
          tagMatch: 'タグ/🔒タグロックの「ある/ない」はタグ名1個との完全一致'
        })
        console.groupEnd()
        logApiTranslationAudit()
        logNavigationNotice()
        logNgEffectivenessNotice()

        setPhase('waiting-dom', 'ニコニコの動画カード生成待ち')
        var initStart = performance.now()
        var initialDomWaitStarted = performance.now()
        originalRoots = await waitForInitialRoots(15000)
        var initialDomWaitMs = Math.round(performance.now() - initialDomWaitStarted)

        // connected + ID重複除去で正規化。
        var rootSeen = new Set()
        originalRoots = originalRoots.filter(function(r) {
          if (!r.movieId || rootSeen.has(r.movieId)) return false
          rootSeen.add(r.movieId)
          return true
        })

        originalMovieIds = new Set(originalRoots.map(function(r) {
          return r.movieId
        }).filter(Boolean))

        knownMovieIds = new Set(originalMovieIds)
        page.doc.querySelectorAll('[data-decoration-video-id]').forEach(function(el) {
          var id = el.getAttribute('data-decoration-video-id')
          if (id) knownMovieIds.add(id)
        })

        var domUniqueIds = new Set()
        page.doc.querySelectorAll(
          '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
        ).forEach(function(el) {
          var id = el.getAttribute('data-decoration-video-id')
          if (id) domUniqueIds.add(id)
        })

        console.log(LOG, '初期動画確定:', {
          rootsRawOrNormalized: originalRoots.length,
          uniqueMovieIds: originalMovieIds.size,
          domUniqueIds: domUniqueIds.size,
          rootOnlyIds: [...originalMovieIds].filter(function(id) { return !domUniqueIds.has(id) }),
          domOnlyIds: [...domUniqueIds].filter(function(id) { return !originalMovieIds.has(id) }),
          requestedMode: requestedMode,
          selectedSource: sourceLabel,
          snapshotSupported: snapshotDescriptor.supported,
          fallbackReason: fallbackReason || null,
          currentPhysicalPage: currentPageNumber(),
          knownLastPage: knownLastPage,
          endPageDetectionSource: endPageDetectionSource,
          isFinalPage: knownLastPage != null && currentPageNumber() >= knownLastPage
        })

        if (!originalMovieIds.size) {
          initialized = true
          gaveUp = true
          stopReason = '現在ページの動画を認識できません'
          setPhase('error', stopReason)
          return
        }

        setPhase('initial-ng',
          originalMovieIds.size + '件を初期NG判定中（同時 ' + model.config.thumbInfoConcurrency.value + '件）')

        var initialCacheResult = restoreCachedMovieDetails([...originalMovieIds], '初期ページ')
        console.log(LOG, '初期詳細情報キャッシュ:', initialCacheResult)

        var thumbStart = performance.now()
        model.requestThumbInfo(true)
        var completed = await waitForThumbInfo([...originalMovieIds], 30000)
        var thumbEnd = performance.now()

        if (!completed) {
          initialized = true
          gaveUp = true
          stopReason = '現在ページの動画詳細取得がタイムアウト'
          setPhase('error', stopReason)
          return
        }

        var initialSelfAdStarted = performance.now()
        if (selfAdRuleRequired()) {
          await ensureSelfAdChecks([...originalMovieIds], '初期ページ / NG条件必須')
        } else if (model.config.selfAdWarningEnabled.value) {
          var initialWarningIds = visibleNonNgIds([...originalMovieIds])
          console.log(LOG, '自演広告監査を表示動画だけに限定:', {
            phase:'初期ページ',
            all:originalMovieIds.size,
            visibleCandidates:initialWarningIds.length,
            skippedNg:originalMovieIds.size - initialWarningIds.length
          })
          await ensureSelfAdChecks(initialWarningIds, '初期ページ / 表示動画のみ')
        }
        var initialSelfAdMs = Math.round(performance.now() - initialSelfAdStarted)
        renderStoredSelfAdWarnings([...originalMovieIds], '初期ページ')

        initialized = true
        rebalanceOverflow()

        // 重要: setupAutoFill直後ではなく、動画DOMが安定したこの時点で初めて
        // 現在ページのページャーから最終ページを判定する。
        refreshKnownLastPage('initial DOM stable')

        var initialPaginationSnapshot = typeof page._paginationSnapshot === 'function'
          ? page._paginationSnapshot() : null
        if (!useSnapshot && knownLastPage != null
            && initialPaginationSnapshot
            && initialPaginationSnapshot.hasPaginationEvidence
            && currentPageNumber() >= knownLastPage) {
          lastFetchedHadNext = false
          endReachedWithoutRequest = true
          console.log(LOG, '現在ページが最終ページのため追加HTTP取得を行いません:', {
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            source: endPageDetectionSource,
            pageNumbers: initialPaginationSnapshot.pageNumbers,
            paginationLinkCount: initialPaginationSnapshot.linkCount
          })
        } else {
          console.log(LOG, '初期終端判定: 継ぎ足し可能', {
            currentPage: currentPageNumber(),
            knownLastPage: knownLastPage,
            source: endPageDetectionSource,
            paginationEvidence: Boolean(
              initialPaginationSnapshot && initialPaginationSnapshot.hasPaginationEvidence),
            higherPagesVisible: Boolean(
              initialPaginationSnapshot && initialPaginationSnapshot.hasHigherPage),
            pageNumbers: initialPaginationSnapshot
              ? initialPaginationSnapshot.pageNumbers : []
          })
        }

        var initialRows = originalRoots.map(function(r, i) {
          var movie = model.movies.get(r.movieId)
          var reasons = getMovieNgReasons(movie)
          return {
            order: i + 1,
            id: r.movieId,
            title: movie ? movie.title : '',
            decision: movie && movie.ng ? 'NG' : '表示',
            ngReasons: reasons
          }
        })

        console.group(LOG + ' 初期ページNG判定結果')
        console.table(initialRows.map(function(r) {
          return {
            order: r.order,
            id: r.id,
            title: r.title,
            decision: r.decision,
            ngReason: r.ngReasons.join(' / ')
          }
        }))
        console.log('NG理由集計:', summarizeNgReasons(initialRows))
        console.groupEnd()

        console.log(LOG, '初期NG判定完了:', {
          total: originalMovieIds.size,
          ng: originalNgCount(),
          visible: visibleOriginalCount(),
          target: targetCount(),
          shortage: Math.max(0, targetCount() - visibleTotalCount()),
          timings:{
            totalInitMs:Math.round(performance.now() - initStart),
            domWaitMs:initialDomWaitMs,
            thumbInfoMs:Math.round(thumbEnd - thumbStart),
            selfAdMs:initialSelfAdMs
          }
        })

        var initialPerformance = {
          totalInitMs:Math.round(performance.now() - initStart),
          domWaitMs:initialDomWaitMs,
          thumbInfoMs:Math.round(thumbEnd - thumbStart),
          selfAdMs:initialSelfAdMs,
          originalCount:originalMovieIds.size,
          visibleAfterNg:visibleOriginalCount(),
          selfAdPolicy:selfAdRuleRequired() ? '全候補（NG条件）'
            : (model.config.selfAdWarningEnabled.value ? 'NG通過動画のみ' : 'OFF')
        }
        console.log(LOG, '初期処理パフォーマンス:', initialPerformance)
        window.__nrnInitialPerformance = initialPerformance

        maybeFetchMore()

        if (model.config.developerMode.value) {
          setTimeout(function() {
            runDeveloperSuite('初期化完了').catch(function(e) { console.error(LOG, '開発者診断失敗:', e) })
          }, 300)
        }
      }

      model.movieViewModes.on('movieViewModeChanged', function() {
        if (!initialized) return
        rebalanceOverflow()
        updateStatus()
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(maybeFetchMore, 100)
      })

      model.config.autoFillEnabled.on('changed', function(enabled) {
        if (enabled) {
          gaveUp = false
          stopReason = ''
          finishedAt = null
          completionReported = false
          runStartedAt = performance.now()
          setPhase('starting', '再開')
          maybeFetchMore()
        } else {
          setPhase('disabled', '自動継ぎ足しOFF')
        }
      })

      model.config.autoFillTargetCount.on('changed', function() {
        gaveUp = false
        stopReason = ''
        finishedAt = null
        completionReported = false
        rebalanceOverflow()
        updateStatus()
        maybeFetchMore()
      })

      model.config.autoFillAdMode.on('changed', function(v) {
        console.log(LOG, '広告設定変更:', v)
        updateStatus()
      })
      model.config.selfAdWarningEnabled.on('changed', function(v) {
        console.log(LOG, '自演広告警告設定変更:', {
          enabled:Boolean(v),
          note:'次回の詳細判定対象から広告者照合を実行'
        })
      })

      model.config.autoFillInfoMode.on('changed', function(v) {
        console.log(LOG, '取得方式変更:', v, '（次回ページ再読み込み時に完全反映）')
        updateStatus()
      })

      model.config.thumbInfoConcurrency.on('changed', function(v) {
        console.log(LOG, '詳細情報同時取得数変更:', v)
        updateStatus()
      })

      model.config.statusPanelMode.on('changed', function(v) {
        console.log(LOG, 'ステータス表示変更:', v)
        updateStatus()
      })

      model.config.autoFillDetailBatchMax.on('changed', function(v) {
        console.log(LOG, '詳細判定バッチ上限変更:', v)
        updateStatus()
      })

      model.config.autoFillPagerMode.on('changed', function(v) {
        console.log(LOG, 'ページャー表示設定変更:', v)
        restorePagerUi()
        updatePagerUi('setting changed')
        updateStatus()
      })

      model.config.pagerPreviewCount.on('changed', function(v) {
        console.log(LOG, 'ページャー未取得プレビュー件数変更:', v)
        restorePagerUi()
        updatePagerUi('preview count changed')
        updateStatus()
      })

      model.config.sessionDetailCacheEnabled.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'セッション詳細キャッシュ設定変更:', {
          enabled: v,
          backend: detailCache.diagnostics()
        })
        updateStatus()
      })

      model.config.sessionDetailCacheTtlMinutes.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'キャッシュ保持時間変更:', {minutes:v, backend:detailCache.diagnostics()})
        updateStatus()
      })

      model.config.sessionDetailCacheMaxEntries.on('changed', function(v) {
        detailCache.configure(model.config)
        console.log(LOG, 'キャッシュ最大件数変更:', {maxEntries:v, backend:detailCache.diagnostics()})
        updateStatus()
      })

      model.config.statusAnimationEnabled.on('changed', function(v) {
        console.log(LOG, 'ステータスアニメーション設定変更:', v)
        updateStatus()
      })

      model.config.developerDiagnosticMode.on('changed', function(v) {
        console.log(LOG, '開発者診断モード変更:', v)
        developerSuiteStatus = v === 'manual' ? '手動待機' : '設定変更済み'
        updateStatus()
      })

      model.config.developerMode.on('changed', function(v) {
        console.log(LOG, '開発者モード変更:', v)
        updateStatus()
        if (v && initialized) {
          setTimeout(function() {
            runDeveloperSuite('開発者モードON').catch(function(e) { console.error(LOG, '開発者診断失敗:', e) })
          }, 50)
        }
      })

      setTimeout(initialize, 0)
    }
    // ------------------------------------------------------------------
    // v13.4 NicoNico SPA navigation guard
    //
    // 現行 /tag/ /search/ は pushState/replaceState を使ってURLだけ切り替え、
    // userscript自体は再実行されないことがある。
    // このスクリプトは旧設計由来の解除不能Listener/Observerが多いため、
    // 同一document上で再setupするより、新URLで1回だけreloadする方が安全。
    // ------------------------------------------------------------------
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

  Main.main()
})()
