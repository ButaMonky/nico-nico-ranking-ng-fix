    var getNnrSessionDetailCache = function(config) {
      var STORAGE_KEY = 'NicoNicoRankingNG:detailCache:v2'
      if (window.__nrnSessionDetailCacheService) {
        window.__nrnSessionDetailCacheService.configure(config)
        return window.__nrnSessionDetailCacheService
      }

      var map = new Map()
      var stats = {loads:0, saves:0, expired:0, evicted:0, parseErrors:0}
      var ttlMinutes = 360
      var maxEntries = 1500
      var saveTimer = null
      var dirty = false

      var configure = function(c) {
        if (!c) return
        ttlMinutes = Math.max(1, Math.min(1440,
          Math.trunc(Number(c.sessionDetailCacheTtlMinutes.value)) || 360))
        maxEntries = Math.max(100, Math.min(4000,
          Math.trunc(Number(c.sessionDetailCacheMaxEntries.value)) || 1500))
      }

      var isExpired = function(entry) {
        return !entry || !Number.isFinite(Number(entry.cachedAt)) || Number(entry.cachedAt) <= 0
          || Date.now() - Number(entry.cachedAt) > ttlMinutes * 60 * 1000
      }

      var trim = function() {
        for (var pair of [...map.entries()]) {
          var entry = pair[1]
          if (isExpired(entry)) {
            map.delete(pair[0])
            stats.expired++
          }
        }
        if (map.size > maxEntries) {
          var ordered = [...map.entries()].sort(function(a,b) {
            return Number(a[1].cachedAt || 0) - Number(b[1].cachedAt || 0)
          })
          var removeCount = map.size - maxEntries
          for (var i = 0; i < removeCount; i++) {
            map.delete(ordered[i][0])
            stats.evicted++
          }
        }
      }

      var load = function() {
        configure(config)
        try {
          var raw = sessionStorage.getItem(STORAGE_KEY)
          if (!raw) return
          var parsed = JSON.parse(raw)
          if (!parsed || parsed.schema !== 2 || !Array.isArray(parsed.entries)) return
          parsed.entries.forEach(function(pair) {
            if (Array.isArray(pair) && pair.length === 2) map.set(String(pair[0]), pair[1])
          })
          trim()
          stats.loads++
        } catch (e) {
          stats.parseErrors++
          console.warn('[NicoNicoRankingNG cache] sessionStorage読込失敗:', e)
        }
      }

      var persist = function() {
        if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null }
        dirty = false
        trim()
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            schema: 2,
            savedAt: Date.now(),
            entries: [...map.entries()]
          }))
          stats.saves++
        } catch (e) {
          console.warn('[NicoNicoRankingNG cache] sessionStorage保存失敗:', e)
        }
      }

      var schedulePersist = function() {
        dirty = true
        if (saveTimer === null) saveTimer = setTimeout(persist, 200)
      }
      var flush = function() { if (dirty) persist() }
      window.addEventListener?.('pagehide', flush)

      var service = {
        configure: configure,
        flush: flush,
        get size() { trim(); return map.size },
        has: function(key) {
          key = String(key)
          var entry = map.get(key)
          if (!entry) return false
          if (isExpired(entry)) {
            map.delete(key)
            stats.expired++
            schedulePersist()
            return false
          }
          return true
        },
        get: function(key) {
          key = String(key)
          if (!this.has(key)) return undefined
          return map.get(key)
        },
        set: function(key, value) {
          key = String(key)
          map.set(key, value)
          schedulePersist()
          return this
        },
        delete: function(key) {
          var result = map.delete(String(key))
          if (result) schedulePersist()
          return result
        },
        clear: function() {
          map.clear()
          persist()
        },
        diagnostics: function() {
          trim()
          return {
            size: map.size,
            ttlMinutes: ttlMinutes,
            maxEntries: maxEntries,
            storageKey: STORAGE_KEY,
            stats: Object.assign({}, stats)
          }
        }
      }

      load()
      window.__nrnSessionDetailCacheService = service
      return service
    }

