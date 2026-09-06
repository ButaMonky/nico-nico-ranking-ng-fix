  var EventEmitter = (function() {
    var EventEmitter = function() {
      this._eventNameToListeners = new Map()
    }
    EventEmitter.prototype = {
      on(eventName, listener) {
        var m = this._eventNameToListeners
        var v = m.get(eventName)
        if (v) {
          v.add(listener)
        } else {
          m.set(eventName, new Set([listener]))
        }
        return this
      },
      emit(eventName) {
        var m = this._eventNameToListeners
        var args = Array.from(arguments).slice(1)
        for (var l of m.get(eventName) || []) l(...args)
      },
      off(eventName, listener) {
        var v = this._eventNameToListeners.get(eventName)
        if (v) v.delete(listener)
      },
    }
    return EventEmitter
  })()

  var Listeners = (function() {
    var Listeners = function(eventNameToListener) {
      this.eventNameToListener = eventNameToListener
      this.eventEmitter = null
    }
    Listeners.prototype = {
      bind(eventEmitter) {
        this.eventEmitter = eventEmitter
        Object.keys(this.eventNameToListener).forEach(function(k) {
          eventEmitter.on(k, this.eventNameToListener[k])
        }, this)
      },
      unbind() {
        if (!this.eventEmitter) return
        Object.keys(this.eventNameToListener).forEach(function(k) {
          this.eventEmitter.off(k, this.eventNameToListener[k])
        }, this)
      },
    }
    return Listeners
  })()

