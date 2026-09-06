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

