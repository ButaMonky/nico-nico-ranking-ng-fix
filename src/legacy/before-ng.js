  var Tag = (function(_super) {
    var Tag = function(thumbInfoTabObj) {
      _super.call(this);
      this.name = thumbInfoTabObj.name;
      this.lock = thumbInfoTabObj.lock;
      this.ngByNormal = false;
      this.ngByLock = false;
    }
    Tag.prototype = createObject(_super.prototype, {
      get ng() {
        return this.ngByNormal || this.ngByLock;
      },
      updateNg(upperCaseNgTagNameSet) {
        var pre = this.ng
        this.ngByNormal = upperCaseNgTagNameSet.has(this.name.toUpperCase())
        if (pre !== this.ng) this.emit('ngChanged', this.ng)
      },
      updateNgIfLocked(upperCaseNgTagNameSet) {
        if (!this.lock) return;
        const pre = this.ng;
        this.ngByLock = upperCaseNgTagNameSet.has(this.name.toUpperCase());
        if (pre !== this.ng) this.emit('ngChanged', this.ng);
      },
    })
    return Tag
  })(EventEmitter)

  var Contributor = (function(_super) {
    var Contributor = function(type, id, name) {
      _super.call(this)
      this.type = type
      this.id = id
      this.name = name
      this.ng = false
      this.ngId = false
      this.ngName = ''
    }
    Contributor.prototype = createObject(_super.prototype, {
      _updateNg() {
        var pre = this.ng
        this.ng = this.ngId || Boolean(this.ngName)
        if (pre !== this.ng) this.emit('ngChanged', this.ng)
      },
      updateNgId(ngIdSet) {
        var pre = this.ngId
        var normalizedId = Math.trunc(Number(this.id))
        this.ngId = ngIdSet.has(this.id)
          || (Number.isFinite(normalizedId) && ngIdSet.has(normalizedId))
          || ngIdSet.has(String(this.id))
        if (pre !== this.ngId) this.emit('ngIdChanged', this.ngId)
        this._updateNg()
      },
      _getNewNgName(upperCaseNgNameSet) {
        var n = this.name.toUpperCase()
        for (var ngName of upperCaseNgNameSet)
          if (n.includes(ngName)) return ngName
        return ''
      },
      updateNgName(upperCaseNgNameSet) {
        var pre = this.ngName
        this.ngName = this._getNewNgName(upperCaseNgNameSet)
        if (pre !== this.ngName) this.emit('ngNameChanged', this.ngName)
        this._updateNg()
      },
      get url() {
        throw new Error('must be implemented')
      },
      bindToConfig(config) {
        this.updateNgId(config[this.ngIdStoreName].set)
        config[this.ngIdStoreName].on('changed', this.updateNgId.bind(this))
      },
    })

    var User = function(id, name) {
      Contributor.call(this, 'user', id, name)
    }
    User.prototype = createObject(Contributor.prototype, {
      get ngIdStoreName() { return 'ngUserIds' },
      get url() {
        return 'https://www.nicovideo.jp/user/' + this.id
      },
      bindToConfig(config) {
        Contributor.prototype.bindToConfig.call(this, config)
        this.updateNgName(config.ngUserNames.set)
        config.ngUserNames.on('changed', this.updateNgName.bind(this))
      },
    })

    var Channel = function(id, name) {
      Contributor.call(this, 'channel', id, name)
    }
    Channel.prototype = createObject(Contributor.prototype, {
      get ngIdStoreName() { return 'ngChannelIds' },
      get url() {
        return 'https://ch.nicovideo.jp/channel/ch' + this.id
      },
    })

    Object.assign(Contributor, {
      NULL: new Contributor('unknown', -1, ''),
      TYPES: ['user', 'channel'],
      new(type, id, name) {
        switch (type) {
          case 'user': return new User(id, name)
          case 'channel': return new Channel(id, name)
          case 'unknown': return Contributor.NULL
          default: throw new Error(type)
        }
      },
    })
    return Contributor
  })(EventEmitter)

  // ============================================================
  // v11 Advanced NG Rules
  // ルール間 = OR / ルール内条件 = AND
  // ============================================================
