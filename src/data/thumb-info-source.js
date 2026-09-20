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
      const raw = rootElem.querySelector(id).textContent
      const numericId = /^[0-9]+$/.test(raw) ? Number(raw) : NaN
      if (!Number.isSafeInteger(numericId) || numericId <= 0) return {type:'unknown',id:-1,name:null}
      return {
        type: type,
        id: numericId,
        name: rootElem.querySelector(name)?.textContent ?? null,
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
      const chId = rootElem.querySelector('thumb > ch_id');
      if (userId && chId) return {type:'unknown',id:-1,name:null};
      if (userId) return user(rootElem);
      if (chId) return channel(rootElem);
      return {type: 'unknown', id: -1, name: null};
    }
    var parseThumbInfo = function(rootElem) {
      return {
        ...(rootElem.querySelector('thumb > video_id') ? {videoId:rootElem.querySelector('thumb > video_id').textContent} : {}),
        description: rootElem.querySelector('thumb > description').textContent,
        tags: rootElem.querySelector('thumb > tags') ? parseTags(rootElem.querySelectorAll('thumb > tags > tag')) : undefined,
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
      this.concurrent = Math.max(1, Math.min(20, Math.trunc(Number(concurrent)) || 5))
      this._requestCount = 0
      this._pendingIds = []
      this._requestedIds = new Set()
      this._handles = new Set()
      this._disposed = false
    }
    ThumbInfo.prototype = createObject(_super.prototype, {
      _onerror(id) {
        this._requestCount--
        this._requestAsPossible()
        this.emit('errorOccurred', error('ERROR', 'エラー', id))
      },
      _ontimeout(id, retried) {
        if (retried) {
          this._requestCount--
          this._requestAsPossible()
          this.emit('errorOccurred', error('TIMEOUT', 'タイムアウト', id))
        } else {
          this._requestMovie(id, true)
        }
      },
      _onload(id, res) {
        this._requestCount--
        this._requestAsPossible()
        if (res.status === 200) {
          var thumbInfo = parseResText(res.responseText)
          if (thumbInfo.videoId != null && thumbInfo.videoId !== id) {
            this.emit('errorOccurred',error('VIDEO_ID_MISMATCH','動画IDが一致しません',id))
            return
          }
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
        if (this._disposed) return
        var settled = false
        var once = callback => value => {
          if (settled || this._disposed) return
          settled = true
          this._handles.delete(request)
          callback(value)
        }
        var fail = once(this._onerror.bind(this, id))
        try {
        var request = this.httpRequest({
          method: 'GET',
          url: 'https://ext.nicovideo.jp/api/getthumbinfo/' + id,
          timeout: 5000,
          onload: once(this._onload.bind(this, id)),
          onerror: fail,
          onabort: fail,
          ontimeout: once(this._ontimeout.bind(this, id, retry)),
        })
        if (!settled && request) this._handles.add(request)
        if (request && typeof request.catch === 'function') request.catch(fail)
        } catch (e) { fail(e) }
      },
      _requestNextMovie() {
        if (this._requestCount >= this.concurrent) return
        var id = this._pendingIds.shift()
        if (!id) return
        this._requestCount++
        this._requestMovie(id)
      },
      _getNewIds(ids) {
        ids = ids || []
        var m = this._requestedIds
        return [...new Set(ids)].filter(function(id) { return !m.has(id) })
      },
      _requestAsPossible() {
        if (this._draining || this._disposed) return
        this._draining = true
        try {
          while (this._pendingIds.length && this._requestCount < this.concurrent) this._requestNextMovie()
        } finally { this._draining = false }
      },
      setConcurrent(concurrent) {
        this.concurrent = Math.max(1, Math.min(20, Math.trunc(Number(concurrent)) || 5))
        this._requestAsPossible()
        return this
      },
      dispose() {
        this._disposed = true
        this._pendingIds.length = 0
        for (const handle of this._handles) {
          try { handle.abort?.() } catch (e) {}
        }
        this._handles.clear()
        this._eventNameToListeners.clear()
      },
      request(ids, prefer) {
        if (this._disposed) return this
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
