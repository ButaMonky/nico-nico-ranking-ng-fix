    // Observe native routing without intercepting clicks or replacing the document.
    var setupSpaNavigationGuard = function() {
      if (window.__nrnSpaNavigationGuardInstalled) return
      window.__nrnSpaNavigationGuardInstalled = true
      var enabled = true, armed = false, lastHref = location.href
      var activeKey = '', displayedKey = '', suspended = false, timer = null, generation = 0
      var previous = [], start = function() {}, stop = function() {}
      var selector = '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"]), .itemTitle'
      var key = function(href) {
        var u = new URL(href, location.href)
        return u.origin + u.pathname + u.search
      }
      var supported = function() {
        return ListPage.is(location) || SearchPage.is(location)
      }
      var cards = function() {
        return Array.from(document.querySelectorAll(selector)).map(function(node) {
          return {node:node, id:node.getAttribute('data-decoration-video-id'),
            text:node.querySelector('a[href*="/watch/"]')?.getAttribute('href') || node.textContent}
        })
      }
      var sameCards = function(a, b) {
        return a.length === b.length && a.every(function(row, i) {
          return row.node === b[i].node && row.id === b[i].id && row.text === b[i].text
        })
      }
      var clear = function() { clearTimeout(timer); timer = null }
      var begin = function() {
        clear()
        if (!armed || !enabled || !supported()) return
        var token = generation
        // React may commit after its history update. Wait for changed results, then
        // coalesce that commit. Zero results is also a valid mounted route.
        timer = setTimeout(function() {
          timer = null
          if (token !== generation || !supported() || !enabled) return
          activeKey = key(location.href)
          displayedKey = activeKey
          suspended = false
          start()
          previous = cards()
        }, 100)
      }
      var changed = function() {
        var href = location.href, nextKey = key(href)
        if (key(lastHref) === nextKey) { lastHref = href; return }
        lastHref = href
        if (!armed) return
        if (!enabled) { generation++; clear(); stop(); previous = []; activeKey = ''; return }
        generation++
        clear()
        // ZenzaWatch replaces history while leaving the search DOM mounted.
        if (/^\/watch\//.test(location.pathname) && previous.length
            && previous.every(function(row) { return row.node.isConnected })) {
          suspended = true
          return
        }
        if (suspended && nextKey === activeKey && previous.length
            && sameCards(previous, cards())) {
          suspended = false
          return
        }
        stop()
        activeKey = ''
        suspended = false
        if (!supported()) { previous = []; activeKey = ''; return }
        if (nextKey === displayedKey || !sameCards(previous, cards())) begin()
        // Identical/reused results are recognized by a native DOM commit below.
      }
      ;['pushState', 'replaceState'].forEach(function(name) {
        var original = history[name]
        history[name] = function() {
          var result = original.apply(this, arguments)
          changed()
          return result
        }
      })
      window.addEventListener('popstate', changed)
      setInterval(changed, 250)
      var observer = new MutationObserver(function(records) {
        if (!armed || !enabled) return
        changed()
        if (!supported()) {
          if (suspended && previous.some(function(row) { return !row.node.isConnected })) {
            stop(); suspended = false; previous = []; activeKey = ''
          }
          return
        }
        if (key(location.href) === activeKey) { previous = cards(); return }
        // Ignore the userscript's own teardown/status/detail mutations. Native
        // result replacement or text updates, including empty results, commit a route.
        var owned = '[id^="nrn-"], .nrn-movie-info-container, .nrn-movie-info-toggle, .nrn-action-pane, .nrn-description, .nrn-movie-title, [data-nrn-autofill="true"]'
        var nativeCommit = records.some(function(record) {
          var target = record.target.nodeType === 1 ? record.target : record.target.parentElement
          if (!target || target.closest(owned)) return false
          if (previous.length && !previous.some(function(row) {
            return row.node.contains(target) || target.contains(row.node)
          })) return false
          if (record.type === 'characterData' || record.type === 'attributes') return true
          return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(function(node) {
            return node.nodeType === 1 && !node.matches(owned)
          })
        })
        if (!sameCards(previous, cards()) || nativeCommit) begin()
      })
      observer.observe(document, {childList:true, subtree:true, characterData:true,
        attributes:true, attributeFilter:['data-decoration-video-id', 'href']})
      window.__nrnConfigureSpaNavigationGuard = function(opts) {
        opts = opts || {}
        var wasEnabled = enabled
        enabled = opts.enabled !== false
        if (opts.start) start = opts.start
        if (opts.stop) stop = opts.stop
        if (!armed) { activeKey = key(location.href); displayedKey = activeKey; previous = cards(); armed = true }
        lastHref = location.href
        if (!enabled) clear()
        if (!wasEnabled && enabled && key(location.href) !== activeKey) {
          generation++; stop(); begin()
        }
      }
    }
