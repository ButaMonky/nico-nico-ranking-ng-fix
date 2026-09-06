  var ArrayStore = (function(_super) {
    var isObject = function(v) {
      return v === Object(v)
    }
    var valueIfObj = function(v) {
      return isObject(v) ? v.value : v
    }
    var toUpperCase = function(s) {
      return s.toUpperCase()
    }
    var ArrayStore = function(getValue, setValue, key, caseInsensitive) {
      _super.call(this)
      this.getValue = getValue
      this.setValue = setValue
      this.key = key
      this.caseInsensitive = Boolean(caseInsensitive)
      this._arrayWithText = []
      // クリック連打や複数NG操作で sync→write が競合しないよう直列化する。
      this._mutationQueue = Promise.resolve()
    }
    ArrayStore.prototype = createObject(_super.prototype, {
      get array() {
        return this.arrayWithText.map(valueIfObj)
      },
      get arrayWithText() {
        return this._arrayWithText
      },
      _isIntegerIdStore() {
        return this.key === 'ngUserIds' || this.key === 'ngChannelIds'
      },
      _normalizeValue(value) {
        if (this._isIntegerIdStore()) {
          var n = Math.trunc(Number(value))
          return Number.isFinite(n) ? n : value
        }
        return this.caseInsensitive && typeof value === 'string'
          ? value.toUpperCase() : value
      },
      _normalizeStoredEntry(entry) {
        if (entry && typeof entry === 'object') {
          return Object.assign({}, entry, {
            value: this._normalizeValue(entry.value)
          })
        }
        return this._normalizeValue(entry)
      },
      _setOf(values) {
        return new Set(values.map(this._normalizeValue.bind(this)))
      },
      get set() {
        return this._setOf(this.array)
      },
      _toUpperCaseIfRequired(value) {
        return this._normalizeValue(value)
      },
      _concat(value, text) {
        return this.arrayWithText.concat(text ? {value, text} : value)
      },
      add(value, text) {
        value = this._normalizeValue(value)
        if (this.set.has(value)) return false
        this.arrayWithText.push(text ? {value: value, text: text} : value)
        this.setValue(this.key, JSON.stringify(this.arrayWithText))
        this.emit('changed', this.set)
        return true
      },
      _enqueueMutation(task) {
        // 失敗した前タスクが後続操作を止めないよう catch 後に継続。
        this._mutationQueue = this._mutationQueue
          .catch(function() {})
          .then(task)
        return this._mutationQueue
      },
      addAsync(value, text) {
        var self = this
        return this._enqueueMutation(async function() {
          await self.sync()
          var changed = self.add(value, text)
          await Promise.resolve(self.setValue(self.key, JSON.stringify(self.arrayWithText)))
          return changed
        })
      },
      addAll(values) {
        if (values.length === 0) return
        var oldVals = this.arrayWithText
        var set = this._setOf(oldVals.map(valueIfObj))
        var filtered = values.filter(function(v) {
          return !set.has(this._toUpperCaseIfRequired(valueIfObj(v)))
        }, this)
        if (filtered.length === 0) return
        this.arrayWithText.push(...filtered)
        this.setValue(this.key, JSON.stringify(this.arrayWithText))
        this.emit('changed', this.set)
      },
      _reject(values) {
        var valueSet = this._setOf(values)
        return this.arrayWithText.filter(function(v) {
          return !valueSet.has(this._toUpperCaseIfRequired(valueIfObj(v)))
        }, this)
      },
      remove(values) {
        const oldVals = this.arrayWithText
        const newVals = this._reject(values)
        if (oldVals.length === newVals.length) return false
        this._arrayWithText = newVals
        this.setValue(this.key, JSON.stringify(newVals))
        this.emit('changed', this.set)
        return true
      },
      removeAsync(values) {
        var self = this
        return this._enqueueMutation(async function() {
          await self.sync()
          var changed = self.remove(values)
          await Promise.resolve(self.setValue(self.key, JSON.stringify(self.arrayWithText)))
          return changed
        })
      },
      clear() {
        if (!this.arrayWithText.length) return
        this._arrayWithText = []
        this.setValue(this.key, '[]')
        this.emit('changed', new Set())
      },
      async sync() {
        var raw = JSON.parse(await this.getValue(this.key, '[]'))
        this._arrayWithText = raw.map(this._normalizeStoredEntry.bind(this))
      },
      async verifyPersisted(value) {
        value = this._normalizeValue(value)
        var raw = JSON.parse(await this.getValue(this.key, '[]'))
        var normalized = raw.map(this._normalizeStoredEntry.bind(this))
        var values = normalized.map(valueIfObj)
        return {
          present: this._setOf(values).has(value),
          storedCount: values.length,
          storedValueType: typeof value
        }
      },
    })
    return ArrayStore
  })(EventEmitter)

  var Store = (function(_super) {
    var Store = function(getValue, setValue, key, defaultValue) {
      _super.call(this)
      this.getValue = getValue
      this.setValue = setValue
      this.key = key
      this._value = this.defaultValue = defaultValue
    }
    Store.prototype = createObject(_super.prototype, {
      get value() {
        return this._value
      },
      set value(value) {
        if (this._value === value) return
        this._value = value
        this.setValue(this.key, value)
        this.emit('changed', value)
      },
      async sync() {
        this._value = await this.getValue(this.key, this.defaultValue)
      }
    })
    return Store
  })(EventEmitter)

