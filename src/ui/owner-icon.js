
  // BRUSH-012B: owner icon candidates in one priority order. An icon is only
  // a display candidate: a 404, a blank image or a successful CDN load says
  // nothing about whether the account exists, was deleted or used this icon.
  // Setting <img src> is an image GET; cards use loading="lazy" so off-screen
  // owners are not fetched ahead of time.
  var OwnerIcon = (function() {
    const blank = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
    // A broken URL is skipped for a short while, then may be tried again.
    const failureTtl = 30000, maxFailures = 512
    const failures = new Map()
    // https on a nimg.jp host only; http is upgraded; the query string is kept.
    function valid(value) {
      if (typeof value !== 'string' || !value) return null
      try {
        const url = new URL(value.replace(/^http:\/\//,'https://'))
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
        return /(^|\.)nimg\.jp$/.test(url.hostname) ? url.href : null
      } catch (_) { return null }
    }
    const isDefault = url => /\/usericon\/defaults\/blank\.jpg(?:[?#]|$)/.test(url)
    // CDN URL from the canonical decimal user ID (no Number arithmetic).
    function cdn(owner) {
      if (owner?.type !== 'user') return null
      const id = OwnerId.canonical(owner.id), bucket = OwnerId.bucket(owner.id)
      return id && bucket ? 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/' + bucket + '/' + id + '.jpg' : null
    }
    // Ordered, de-duplicated: native page icon -> API icon -> CDN -> default.
    // Default images found in native/API data do not stop a CDN attempt.
    function candidates({native = null, api = null, owner = null} = {}) {
      const list = [], seen = new Set()
      const add = (value, source) => {
        const url = valid(value)
        if (url && !seen.has(url)) { seen.add(url);list.push({url, source}) }
      }
      for (const [value, source] of [[native,'native'],[api,'api']]) {
        const url = valid(value)
        if (url && !isDefault(url)) add(url, source)
      }
      add(cdn(owner),'cdn')
      add(blank,'default')
      return list
    }
    function recentlyFailed(url, now) {
      const at = failures.get(url)
      if (at === undefined) return false
      if (now - at >= failureTtl) { failures.delete(url);return false }
      return true
    }
    function noteFailure(url, now) {
      failures.delete(url);failures.set(url,now)
      while (failures.size > maxFailures) failures.delete(failures.keys().next().value)
    }
    // Shows the first candidate that has not failed recently; each error moves
    // on once, so the chain ends after at most list.length attempts with a
    // local fallback (no image request). A card removed from the page stops.
    function apply(image, list, clock = Date.now) {
      let index = -1
      const finish = () => {
        image.onerror = null
        image.removeAttribute('src')
        image.style.visibility = 'hidden'
        image.dataset.nrnIconSource = 'local'
        image.dataset.nrnIconState = 'local-fallback'
      }
      const next = () => {
        index++
        while (index < list.length && recentlyFailed(list[index].url, clock())) index++
        if (index >= list.length) return finish()
        image.style.visibility = ''
        image.dataset.nrnIconSource = list[index].source
        image.dataset.nrnIconState = 'loading'
        image.src = list[index].url
      }
      image.onload = () => { image.dataset.nrnIconState = 'loaded' }
      image.onerror = () => {
        if (list[index]) noteFailure(list[index].url, clock())
        if (!image.isConnected) { image.onerror = null;return }
        next()
      }
      next()
    }
    return {blank, failureTtl, valid, isDefault, cdn, candidates, apply, _failures:failures}
  })()
