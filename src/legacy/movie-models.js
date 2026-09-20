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
      this.metadata = Object.fromEntries(MetadataReadiness.fields.map(field => [field,'unknown']))
      this.owner = null
      this._ng = false
      this.ngByLockedTagCount = false
      this._lockedTagCountEnabled = false
      this._lockedTagCountThreshold = Infinity
      this.ngByAdvancedRule = false
      this.pageContributorCount = null
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
        this.metadata.description = 'known'
        this.emit('descriptionChanged', this._description)
        this._updateAdvancedRule()
        this._updateNg()
        this.emit('metadataChanged')
      },
      get tags() { return this._tags },
      set tags(tags) {
        this._tags = tags
        this.metadata.tags = 'known'
        this.metadata.lockedTags = 'known'
        this.ngByLockedTagCount = this._ngByLockedTagCountValue()
        this.emit('tagsChanged', this._tags)
        this._updateAdvancedRule()
        this._updateNg()
        var update = this._updateNg.bind(this)
        for (var t of this._tags) t.on('ngChanged', update)
        this.emit('metadataChanged')
      },
      _lockedTagCount() {
        return this._tags.filter(function(t) { return t.lock }).length
      },
      _ngByLockedTagCountValue() {
        return this._lockedTagCountEnabled
            && this.metadata.lockedTags === 'known'
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
        this._nicoadSponsorsKnown = Boolean(result.checked && Array.isArray(result.sponsors))
        this._refreshNicoadMatches()
        this.nicoadSelfAdError = result.error || null
        this.emit('nicoadSelfAdChanged', result)
        this._updateAdvancedRule()
        this._updateNg()
      },
      _refreshNicoadMatches() {
        if (!this._nicoadSponsorsKnown) return
        const owner = this.owner
        const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase()
        const name = normalize(owner?.name)
        this.nicoadSelfAdIdMatch = Boolean(owner?.type === 'user' && this.nicoadSelfAdSponsors.some(s => s.userId === owner.id))
        this.nicoadSelfAdNameMatch = Boolean(name && this.nicoadSelfAdSponsors.some(s => normalize(s.advertiserName) === name))
      },
      get contributor() { return this._contributor },
      set contributor(contributor) {
        if (this._contributorNgListener) {
          this._contributor.off('ngChanged', this._contributorNgListener)
          this._contributor.off('ngReasonsChanged', this._contributorNgListener)
        }
        this._contributor = contributor
        this.emit('contributorChanged', this._contributor)
        this._updateAdvancedRule()
        this._updateNg()
        if (contributor.type !== 'unknown') {
          this._contributorNgListener = this._updateNg.bind(this)
          contributor.on('ngChanged', this._contributorNgListener)
          contributor.on('ngReasonsChanged', this._contributorNgListener)
        }
      },
      get error() { return this._error },
      set error(error) {
        this._error = error
        this.emit('errorChanged', this._error)
        this._updateAdvancedRule()
        this._updateNg()
      },
      get thumbInfoDone() { return this._thumbInfoDone },
      get metadataSettled() {
        return this.thumbInfoDone || MetadataReadiness.ready(this,this._metadataConfig)
      },
      requestDetails(descriptionOnly) {
        if (descriptionOnly ? this._descriptionRequested : this._detailsRequested) return
        if (descriptionOnly) this._descriptionRequested = true
        else this._detailsRequested = true
        this.emit('metadataDemandChanged')
        this.emit('metadataChanged')
      },
      setOwnerKnowledge(owner) {
        this.owner = owner
        this.metadata.ownerId = this.metadata.ownerType = owner ? 'known' : 'unknown'
        this.metadata.ownerName = owner && owner.name !== null ? 'known' : 'unknown'
        this.metadata.ownerVisibility = owner && owner.visibility !== null ? 'known' : 'unknown'
        this._refreshNicoadMatches()
      },
      metadataChanged() {
        this._updateAdvancedRule()
        this._updateNg()
        this.emit('metadataChanged')
      },
      setThumbInfoDone() {
        this._thumbInfoDone = true
        this._updateAdvancedRule()
        this._updateNg()
        this.emit('thumbInfoDone')
        this.emit('metadataChanged')
      },
      get ng() { return this._ng },
      setPageContributorCount(value) {
        if (this.pageContributorCount === value) return
        this.pageContributorCount = value
        this._updateAdvancedRule()
        this._updateNg()
      },
      _updateNg() {
        var pre = this._ng
        this._ng = this.ngId
          || Boolean(this.ngTitle)
          || this.contributor.ng
          || this.tags.some(function(t) { return t.ng })
          || this.ngByLockedTagCount
          || this.ngByAdvancedRule
        if (pre !== this._ng) this.emit('ngChanged', this._ng)
        this.emit('ngReasonsChanged')
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
          m._metadataConfig = this.config
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
