  // The nicoad content endpoint can retain an account name after other sources
  // stop returning it. Its numeric ownerId alone does not establish owner type.
  var OwnerNameSource = (function() {
    let sequence = 0
    function create(movies,diagnostics) {
      const scope = 'owner-name-' + ++sequence, responses = new Map(), attempted = new Set()
      const abort = new AbortController(), apply = ThumbInfoListener.forOwnerName(movies)
      let disposed = false, extraRequests = 0
      function getData(id,kind = 'adsDecoration') {
        if (disposed || !/^(sm|so|nm)[0-9]+$/.test(id)) return Promise.resolve(null)
        if (responses.has(id)) return responses.get(id)
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
          if (!res.ok) throw new Error('owner content HTTP failure')
          try {
            if (res.url && res.url !== url) throw new Error('unexpected content URL')
            const json = await res.json(), data = json?.data
            if (json?.meta?.status != null && json.meta.status !== 200) throw new Error('content status failure')
            if (!data || data.id !== id) throw new Error('content identity mismatch')
            // Never keep raw response objects or unrelated fields in our cache.
            return {data:{id:data.id,ownerId:data.ownerId,ownerName:data.ownerName,
              targetUrl:data.targetUrl,decoration:data.decoration,totalPoint:data.totalPoint},fetchedAt:Date.now()}
          } catch (error) { diagnostics?.validationFailure(kind,'run','invalid'); throw error }
        })
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
      function request(list) {
        if (disposed) return
        for (const movie of list) {
          if (movie.metadata.ownerName === 'known' || movie._nrnOwnerNamePending) continue
          if (movie.ng && !movie._detailsRequested) continue
          const identity = movie._nrnDetailContributor || movie._nrnSearchContributor
          if (!identity || identity.type !== 'user') { movie._nrnOwnerNameStatus = 'untyped'; continue }
          if (!movie.thumbInfoDone && !MetadataReadiness.ready(movie,movies.config)) continue
          if (attempted.has(movie.id)) continue
          if (!responses.has(movie.id) && extraRequests >= 64) { movie._nrnOwnerNameStatus = 'budget'; continue }
          if (!responses.has(movie.id)) extraRequests++
          attempted.add(movie.id)
          movie._nrnOwnerNamePending = true
          movie._nrnOwnerNameStatus = 'pending'
          movie.metadataChanged()
          getData(movie.id,'ownerName').then(result => {
            if (disposed) return
            movie._nrnOwnerNameStatus = result && apply(movie.id,result.data,result.fetchedAt) ? 'accepted' : 'rejected'
          },() => { if (!disposed) movie._nrnOwnerNameStatus = 'failed' }).finally(() => {
            movie._nrnOwnerNamePending = false
            if (!disposed) movie.metadataChanged()
          })
        }
      }
      const api = {getData,request,dispose() {
        disposed = true;abort.abort();responses.clear();attempted.clear()
        api.onRecovered = null
        for (const movie of movies._idToMovie.values()) movie._nrnOwnerNamePending = false
      }}
      return api
    }
    return {create}
  })()
