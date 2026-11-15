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


  // Background tabs never run requestAnimationFrame and throttle timers, so a
  // pipeline that waits for a frame stalls until the tab is shown again.
  // nrnRequestFrame runs fn on the next frame while the page is visible. While
  // it is hidden, a MessageChannel task (not throttled like timers) runs it.
  // A visible-path timer covers a tab hidden after scheduling. First one wins.
  // Returns a cancel function. Callers that only need "after the current
  // task, before the next paint if visible" can use this instead of rAF.
  var nrnRequestFrame = (function() {
    var channel = null, queue = []
    var postTask = function(run) {
      if (typeof MessageChannel !== 'function') return setTimeout(run, 0)
      if (!channel) {
        channel = new MessageChannel()
        channel.port1.onmessage = function() {
          var tasks = queue; queue = []
          for (var task of tasks) task()
        }
        // unref exists only in Node (tests); browsers do not have it.
        if (typeof channel.port1.unref === 'function') channel.port1.unref()
      }
      queue.push(run)
      if (queue.length === 1) channel.port2.postMessage(0)
    }
    return function(fn) {
      var g = globalThis, done = false, raf = null, timer = null
      var cancel = function() {
        done = true
        if (raf !== null && typeof g.cancelAnimationFrame === 'function') g.cancelAnimationFrame(raf)
        if (timer !== null) clearTimeout(timer)
        raf = timer = null
      }
      var run = function() { if (done) return; cancel(); fn() }
      var hidden = Boolean(g.document && g.document.hidden)
      if (hidden || typeof g.requestAnimationFrame !== 'function') postTask(run)
      else {
        raf = g.requestAnimationFrame(run)
        timer = setTimeout(function() {
          if (!done && g.document && g.document.hidden) run()
        }, 200)
      }
      return cancel
    }
  })()
  var nrnCancelFrame = function(cancel) { if (typeof cancel === 'function') cancel() }
