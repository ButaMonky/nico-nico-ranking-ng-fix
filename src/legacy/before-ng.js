  var ThumbInfo = (function(_super) {
    const parseTags = tags => {
      return Array.from(tags, tag => {
        return {
          name: tag.textContent,
          lock: tag.getAttribute('lock') === '1',
        };
      });
    };
    var contributor = function(rootElem, type, id, name) {
      return {
        type: type,
        id: parseInt(rootElem.querySelector(id).textContent),
        name: rootElem.querySelector(name)?.textContent ?? '',
      }
    }
    var user = function(rootElem) {
      return contributor(rootElem
                       , 'user'
                       , 'thumb > user_id'
                       , 'thumb > user_nickname')
    }
    var channel = function(rootElem) {
      return contributor(rootElem
                       , 'channel'
                       , 'thumb > ch_id'
                       , 'thumb > ch_name')
    }
    var parseContributor = function(rootElem) {
      const userId = rootElem.querySelector('thumb > user_id');
      if (userId) return user(rootElem);
      const chId = rootElem.querySelector('thumb > ch_id');
      if (chId) return channel(rootElem);
      return {type: 'unknown', id: -1, name: ''};
    }
    var parseThumbInfo = function(rootElem) {
      return {
        description: rootElem.querySelector('thumb > description').textContent,
        tags: parseTags(rootElem.querySelectorAll('thumb > tags > tag')),
        contributor: parseContributor(rootElem),
        title: rootElem.querySelector('thumb > title').textContent,
        error: {type: 'NO_ERROR', message: 'no error'},
      }
    }
    var error = function(type, message, id) {
      var result = {error: {type, message}}
      if (id) result.id = id
      return result
    }
    var parseError = function(rootElem) {
      var type = rootElem.querySelector('error > code').textContent
      switch (type) {
        case 'DELETED': return error(type, '削除された動画')
        case 'NOT_FOUND': return error(type, '見つからない、または無効な動画')
        case 'COMMUNITY': return error(type, 'コミュニティ限定動画')
        default: return error(type, 'エラーコード: ' + type)
      }
    }
    var parseResText = function(resText) {
      try {
        var d = new DOMParser().parseFromString(resText, 'application/xml')
        var r = d.documentElement
        var status = r.getAttribute('status')
        switch (status) {
          case 'ok': return parseThumbInfo(r)
          case 'fail': return parseError(r)
          default: return error(status, 'ステータス: ' + status)
        }
      } catch (e) {
        return error('PARSING', 'パースエラー')
      }
    }
    var statusMessage = function(res) {
      return res.status + ' ' + res.statusText
    }

    var ThumbInfo = function(httpRequest, concurrent) {
      _super.call(this)
      this.httpRequest = httpRequest
      this.concurrent = concurrent || 5
      this._requestCount = 0
      this._pendingIds = []
      this._requestedIds = new Set()
    }
    ThumbInfo.prototype = createObject(_super.prototype, {
      _onerror(id) {
        this._requestCount--
        this._requestNextMovie()
        this.emit('errorOccurred', error('ERROR', 'エラー', id))
      },
      _ontimeout(id, retried) {
        if (retried) {
          this._requestCount--
          this._requestNextMovie()
          this.emit('errorOccurred', error('TIMEOUT', 'タイムアウト', id))
        } else {
          this._requestMovie(id, true)
        }
      },
      _onload(id, res) {
        this._requestCount--
        this._requestNextMovie()
        if (res.status === 200) {
          var thumbInfo = parseResText(res.responseText)
          thumbInfo.id = id
          if (thumbInfo.error.type === 'NO_ERROR') {
            this.emit('completed', thumbInfo)
          } else {
            this.emit('errorOccurred', thumbInfo)
          }
        } else {
          this.emit('errorOccurred'
                  , error('HTTP_STATUS', statusMessage(res), id))
        }
      },
      _requestMovie(id, retry) {
        this.httpRequest({
          method: 'GET',
          url: 'https://ext.nicovideo.jp/api/getthumbinfo/' + id,
          timeout: 5000,
          onload: this._onload.bind(this, id),
          onerror: this._onerror.bind(this, id),
          ontimeout: this._ontimeout.bind(this, id, retry),
        })
      },
      _requestNextMovie() {
        var id = this._pendingIds.shift()
        if (!id) return
        this._requestMovie(id)
        this._requestCount++
      },
      _getNewIds(ids) {
        ids = ids || []
        var m = this._requestedIds
        return [...new Set(ids)].filter(function(id) { return !m.has(id) })
      },
      _requestAsPossible() {
        var space = this.concurrent - this._requestCount
        var c = Math.min(this._pendingIds.length, space)
        for (var i = 0; i < c; i++) this._requestNextMovie()
      },
      setConcurrent(concurrent) {
        this.concurrent = Math.max(1, Math.min(20, Math.trunc(Number(concurrent)) || 5))
        this._requestAsPossible()
        return this
      },
      request(ids, prefer) {
        const newIds = this._getNewIds(ids)
        for (const id of newIds) this._requestedIds.add(id)
        if (prefer) {
          this._pendingIds.unshift(...newIds);
        } else {
          this._pendingIds.push(...newIds);
        }
        this._requestAsPossible()
        return this
      },
    })
    return ThumbInfo
  })(EventEmitter)

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
