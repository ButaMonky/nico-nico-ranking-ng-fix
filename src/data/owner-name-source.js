  // The nicoad content endpoint can retain an account name after other sources
  // stop returning it. Its numeric ownerId alone does not establish owner type.
  var OwnerNameSource = (function() {
    let sequence = 0
    // BRUSH-022: HTTP 404 = nicoad has no record for the video (a normal
    // answer). Kept for 5 minutes across SPA routes; failures are never kept.
    // Created on first use so this module does not need Network at load time.
    let absentCache = null
    const absent = {
      get cache() { return absentCache || (absentCache = Network.negativeCache(5 * 60 * 1000, 1000)) },
      has(id) { return this.cache.has(id) }, note(id) { this.cache.note(id) }
    }
    // options.snapshot: SnapshotOwnerSource for IDs nicoad could not supply (BRUSH-010).
    function create(movies,diagnostics,options = {}) {
      const snapshot = options.snapshot || null
      const scope = 'owner-name-' + ++sequence, responses = new Map(), attempted = new Set(), idAttempted = new Set()
      const abort = new AbortController(), apply = ThumbInfoListener.forOwnerName(movies)
      const applySupplement = ThumbInfoListener.forSupplement(movies)
      let disposed = false, extraRequests = 0
      // No new network request needed for this video (shared or known absent).
      const free = id => responses.has(id) || absent.has(id)
      function getData(id,kind = 'adsDecoration') {
        if (disposed || !/^(sm|so|nm)[0-9]+$/.test(id)) return Promise.resolve(null)
        if (responses.has(id)) return responses.get(id)
        if (absent.has(id)) {
          // Same outcome as the 404 it remembers, without a request.
          const error = new Error('owner content absent (remembered)')
          error.status = 404;error.remembered = true
          return Promise.reject(error)
        }
        const controller = new AbortController()
        let expired = false, timer, cancel
        const deadline = new Promise((resolve,reject) => {
          cancel = () => { expired = true;controller.abort();reject(new Error('owner content cancelled')) }
          abort.signal.addEventListener('abort',cancel,{once:true})
          timer = setTimeout(() => {
            expired = true;controller.abort('owner-name-deadline');reject(new Error('owner content deadline'))
          },8000)
        })
        const transport = Network.ads(scope + ':' + id, async function() {
          if (disposed || expired) return null
          const url = 'https://api.nicoad.nicovideo.jp/v1/contents/video/' + id
          const res = await Network.fetchResponse(url,{credentials:'omit',signal:controller.signal},8000,{run:diagnostics,kind})
          if (disposed || expired) return null
          if (!res.ok) {
            // Keep the status: 404 means nicoad has no record, not a failed request.
            if (res.status === 404) absent.note(id)
            const error = new Error('owner content HTTP failure')
            error.status = res.status
            throw error
          }
          try {
            if (res.url && res.url !== url) throw new Error('unexpected content URL')
            const json = await res.json(), data = json?.data
            if (json?.meta?.status != null && json.meta.status !== 200) throw new Error('content status failure')
            if (!data || data.id !== id) throw new Error('content identity mismatch')
            // Never keep raw response objects or unrelated fields in our cache.
            return {data:{id:data.id,ownerId:data.ownerId,ownerName:data.ownerName,ownerIcon:data.ownerIcon,
              targetUrl:data.targetUrl,decoration:data.decoration,totalPoint:data.totalPoint},fetchedAt:Date.now()}
          } catch (error) { diagnostics?.validationFailure(kind,'run','invalid'); throw error }
        // BRUSH-019: a lookup that expires or is cancelled (SPA dispose) while
        // still queued is dropped by the broker and never starts.
        },{signal:controller.signal})
        const promise = Promise.race([transport,deadline]).finally(() => {
          clearTimeout(timer);abort.signal.removeEventListener('abort',cancel)
        }).then(result => {
          if (disposed || !result) return null
          if (apply(id,result.data,result.fetchedAt)) api.onRecovered?.(id)
          return result
        })
        responses.set(id,promise)
        return promise
      }
      // BRUSH-009: owner ID supplement for user-uploaded videos whose detail
      // answer had no owner (ownerResolution 'missing'). data.id is the video
      // ID and is checked by getData; only data.ownerId becomes the user ID.
      // A failure or 404 leaves the owner unknown; nothing is read as absence.
      // BRUSH-011: demand-driven order. No owner demand -> no extra request.
      // ID only -> one batched Snapshot GET first, nicoad for what it misses.
      // Name too -> nicoad first (it also carries the name), Snapshot after.
      function requestOwnerId(movie) {
        if (movie.ownerResolution?.status !== 'missing' || movie._nrnOwnerIdPending) return
        if (!/^(sm|nm)[0-9]+$/.test(movie.id) || idAttempted.has(movie.id)) return
        if (movie.ng && !movie._detailsRequested) return
        const demand = MetadataReadiness.ownerDemand(movie,movies.config)
        // Not marked attempted: a later setting or details request re-plans it.
        if (!demand.id) { movie._nrnOwnerIdStatus = 'not-needed'; return }
        idAttempted.add(movie.id)
        if (!demand.name && snapshot) {
          movie._nrnOwnerIdStatus = 'snapshot-first'
          const queued = snapshot.enqueue(movie,status => {
            if (status !== 'accepted' && status !== 'channel') lookupNicoad(movie,false)
          })
          if (queued) return
        }
        lookupNicoad(movie,true)
      }
      function lookupNicoad(movie, snapshotAfter) {
        if (disposed || movie.ownerResolution?.status !== 'missing') return
        if (!free(movie.id) && extraRequests >= 64) {
          // Over the per-video budget: the batched Snapshot lookup is cheaper.
          movie._nrnOwnerIdStatus = 'budget'
          if (snapshotAfter) snapshot?.enqueue(movie)
          return
        }
        if (!free(movie.id)) extraRequests++
        movie._nrnOwnerIdPending = true
        movie._nrnOwnerIdStatus = 'pending'
        movie.metadataChanged()
        getData(movie.id,'ownerId').then(result => {
          if (disposed) return
          const data = result?.data
          const name = typeof data?.ownerName === 'string' && data.ownerName.trim() ? data.ownerName : null
          const accepted = Boolean(data && data.id === movie.id && data.ownerId != null
            && applySupplement(movie.id,{type:'user',id:String(data.ownerId),name,
              ...(typeof data.ownerIcon === 'string' && data.ownerIcon ? {iconUrl:data.ownerIcon} : {})},'nicoad',result.fetchedAt))
          movie._nrnOwnerIdStatus = accepted ? 'accepted' : 'rejected'
        },error => { if (!disposed) movie._nrnOwnerIdStatus = error?.status === 404 ? 'absent' : 'failed' }).finally(() => {
          movie._nrnOwnerIdPending = false
          if (disposed) return
          // Still without an ID: hand over to the batched Snapshot lookup.
          if (snapshotAfter && movie._nrnOwnerIdStatus !== 'accepted') snapshot?.enqueue(movie)
          movie.metadataChanged()
        })
      }
      function request(list) {
        if (disposed) return
        for (const movie of list) requestOwnerId(movie)
        for (const movie of list) {
          if (movie.metadata.ownerName === 'known' || movie._nrnOwnerNamePending) continue
          if (movie.ng && !movie._detailsRequested) continue
          const identity = movie._nrnDetailContributor || movie._nrnSearchContributor
          if (!identity || identity.type !== 'user') { movie._nrnOwnerNameStatus = 'untyped'; continue }
          if (!movie.thumbInfoDone && !MetadataReadiness.ready(movie,movies.config)) continue
          if (attempted.has(movie.id)) continue
          if (!free(movie.id) && extraRequests >= 64) { movie._nrnOwnerNameStatus = 'budget'; continue }
          if (!free(movie.id)) extraRequests++
          attempted.add(movie.id)
          movie._nrnOwnerNamePending = true
          movie._nrnOwnerNameStatus = 'pending'
          movie.metadataChanged()
          getData(movie.id,'ownerName').then(result => {
            if (disposed) return
            movie._nrnOwnerNameStatus = result && apply(movie.id,result.data,result.fetchedAt) ? 'accepted' : 'rejected'
          },error => { if (!disposed) movie._nrnOwnerNameStatus = error?.status === 404 ? 'absent' : 'failed' }).finally(() => {
            movie._nrnOwnerNamePending = false
            if (!disposed) movie.metadataChanged()
          })
        }
      }
      const api = {getData,request,dispose() {
        disposed = true;abort.abort();responses.clear();attempted.clear();idAttempted.clear();snapshot?.dispose()
        api.onRecovered = null
        for (const movie of movies._idToMovie.values()) { movie._nrnOwnerNamePending = false;movie._nrnOwnerIdPending = false }
      }}
      return api
    }
    return {create, get _absent() { return absent.cache }}
  })()
