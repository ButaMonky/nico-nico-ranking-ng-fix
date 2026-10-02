
  // BRUSH-010: owner ID supplement for many videos in one Snapshot search GET.
  // Only for sm/nm videos still 'missing' after nicoad. Rows are matched by
  // contentId (never by order); userId and channelId are kept apart; a video
  // the index does not return stays unknown (new uploads are often absent).
  var SnapshotOwnerSource = (function() {
    const endpoint = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
    // Confirmed 2026-09-20: 100 requested IDs returned 100 rows in one GET and
    // _limit=101 is rejected (400). 100 is the page size, not a filter limit.
    const batchSize = 100
    const videoIdPattern = /^(sm|nm)[0-9]+$/
    function url(ids) {
      const params = new URLSearchParams()
      params.set('q','');params.set('targets','title');params.set('fields','contentId,userId,channelId')
      params.set('_sort','-startTime');params.set('_offset','0');params.set('_limit',String(ids.length))
      params.set('_context','NicoNicoRankingNG')
      ids.forEach((id,i) => params.set('filters[contentId][' + i + ']',id))
      return endpoint + '?' + params.toString()
    }
    // Positive safe integer ID or null (BRUSH-012A: no rounding of large IDs).
    function positiveId(value) {
      return OwnerId.safe(value)
    }
    // -> {status:'ok', owners:Map(id -> {type,id}), missing:[id], conflicts:[id]} | {status:'invalid'}
    function parse(text, ids) {
      let json
      try { json = JSON.parse(text) } catch (_) { return {status:'invalid'} }
      if (json?.meta?.status !== 200 || !Array.isArray(json.data)) return {status:'invalid'}
      const requested = new Set(ids), seen = new Map(), conflicts = new Set()
      for (const row of json.data) {
        const id = row?.contentId
        if (!requested.has(id)) continue
        const user = positiveId(row.userId), channel = positiveId(row.channelId)
        const owner = user && !channel ? {type:'user',id:user} : channel && !user ? {type:'channel',id:channel} : null
        if (seen.has(id)) {
          const previous = seen.get(id)
          if (previous?.type !== owner?.type || previous?.id !== owner?.id) conflicts.add(id)
          continue
        }
        seen.set(id,owner)
      }
      const owners = new Map()
      for (const [id,owner] of seen) if (owner && !conflicts.has(id)) owners.set(id,owner)
      return {status:'ok', owners, missing:ids.filter(id => !seen.has(id)), conflicts:[...conflicts]}
    }
    function create(movies, httpRequest, diagnostics) {
      const queue = [], attempted = new Set(), handles = new Set(), callbacks = new Map()
      const applySupplement = ThumbInfoListener.forSupplement(movies)
      let timer = null, disposed = false
      function finishMovie(id, status) {
        const movie = movies.get(id)
        if (!movie) return
        movie._nrnOwnerIdPending = false
        movie._nrnOwnerSnapshotStatus = status
        movie.metadataChanged()
        const done = callbacks.get(id)
        callbacks.delete(id)
        if (done && !disposed) done(status)
      }
      function send(ids) {
        const measured = diagnostics?.begin?.('snapshot','run') || function() {}
        let settled = false, handle = null
        const done = (outcome, result) => {
          if (settled) return
          settled = true;handles.delete(handle);measured(outcome)
          if (disposed) return
          const at = Date.now()
          for (const id of ids) {
            if (result?.status !== 'ok') { finishMovie(id,'failed');continue }
            const owner = result.owners.get(id)
            const status = owner?.type === 'user'
              ? (applySupplement(id,{type:'user',id:String(owner.id)},'snapshot',at) ? 'accepted' : 'rejected')
              : owner ? 'channel' : result.conflicts.includes(id) ? 'conflict' : 'absent'
            finishMovie(id,status)
          }
        }
        try {
          handle = httpRequest({method:'GET', url:url(ids), timeout:10000,
            onload:res => res?.status === 200 ? done('ok',parse(res.responseText,ids)) : done('http',{status:'http'}),
            onerror:() => done('network'), ontimeout:() => done('timeout'), onabort:() => done('aborted')})
          if (handle && !settled) handles.add(handle)
        } catch (_) { done('network') }
      }
      function flush() {
        clearTimeout(timer);timer = null
        while (!disposed && queue.length) send(queue.splice(0,batchSize))
      }
      // Collects videos for a short moment so several lookups share one GET.
      // onDone(status) runs once the batch answers (not after dispose).
      function enqueue(movie, onDone) {
        if (disposed || !movie || attempted.has(movie.id) || !videoIdPattern.test(movie.id)) return false
        if (movie.ownerResolution?.status !== 'missing') return false
        attempted.add(movie.id);queue.push(movie.id)
        if (typeof onDone === 'function') callbacks.set(movie.id,onDone)
        movie._nrnOwnerIdPending = true
        movie._nrnOwnerSnapshotStatus = 'queued'
        if (queue.length >= batchSize) flush()
        else if (!timer) timer = setTimeout(flush,50)
        return true
      }
      function dispose() {
        disposed = true;clearTimeout(timer);timer = null
        for (const handle of handles) { try { handle.abort?.() } catch (_) {} }
        handles.clear();queue.length = 0;callbacks.clear()
        for (const id of attempted) { const movie = movies.get(id); if (movie) movie._nrnOwnerIdPending = false }
      }
      return {enqueue, flush, dispose}
    }
    return {endpoint, batchSize, url, parse, create}
  })()
