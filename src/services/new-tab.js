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
