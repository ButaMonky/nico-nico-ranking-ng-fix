
  // Pure planner: decides which source should supply each missing field.
  // It never fetches, touches the DOM or mutates the movie. Callers own I/O.
  var SourcePlan = (function() {
    // Cheapest first. 'search' = data already on the page (server-response or
    // native card), 'cache' = session detail cache; both cost no request.
    const ladders = {
      ownerId:['search','cache','nicoad','snapshot','detail'],
      // A numeric nicoad ownerId alone does not establish the owner type.
      ownerType:['search','cache','snapshot','detail'],
      ownerName:['search','cache','nicoad','detail'],
      ownerVisibility:['search','cache','detail'],
      // Lock state exists only in detail responses; index tags are not used here.
      tags:['cache','detail'],
      lockedTags:['cache','detail'],
      description:['cache','detail'],
      // Search page data only; no detail or index source is used for these.
      likeCount:['search'],
      viewCount:['search'],
      commentCount:['search'],
      mylistCount:['search'],
      durationSeconds:['search'],
      registeredAtMs:['search']
    }
    const freeSources = new Set(['search','cache'])
    const allSources = ['search','cache','nicoad','snapshot','detail']
    function toSet(value) {
      if (!value) return new Set()
      if (value instanceof Set || Array.isArray(value)) return new Set(value)
      return new Set(Object.keys(value).filter(key => value[key]))
    }
    function statusOf(movie, field) {
      const status = movie?.metadata?.[field]
      return status === 'known' || status === 'failed' ? status : 'unknown'
    }
    // options.available: sources the caller can use now (Set/array/object).
    // options.exhausted: {field: [sources]} already tried for that field without a value.
    function plan(movie, required, options = {}) {
      const available = toSet(options.available), exhausted = options.exhausted || {}
      const fields = {}, open = []
      for (const field of new Set(required || [])) {
        const status = statusOf(movie, field)
        if (status === 'known') {
          const record = typeof MetadataReadiness !== 'undefined' ? MetadataReadiness.sourceOf(movie, field) : null
          fields[field] = {status, source:record ? record.source : null, next:null}
          continue
        }
        const skip = toSet(exhausted[field])
        // A failed detail request is not repeated by the plan; other sources may still help.
        if (status === 'failed') skip.add('detail')
        const candidates = (ladders[field] || []).filter(source => available.has(source) && !skip.has(source))
        fields[field] = {status, source:null, next:candidates[0] || null, candidates}
        if (!candidates.length) fields[field].reason = ladders[field] ? 'no-available-source' : 'unsupported-field'
        else open.push(field)
      }
      // Fields that need a request share as few request kinds as possible:
      // pick the source covering most such fields, ties go to the cheaper one.
      let pending = open.filter(field => !freeSources.has(fields[field].next))
      while (pending.length) {
        let best = null, cover = []
        for (const source of allSources) {
          if (freeSources.has(source)) continue
          const covered = pending.filter(field => fields[field].candidates.includes(source))
          if (covered.length > cover.length) { best = source; cover = covered }
        }
        for (const field of cover) fields[field].next = best
        pending = pending.filter(field => !cover.includes(field))
      }
      const requests = {}
      for (const field of open) (requests[fields[field].next] ||= []).push(field)
      const complete = Object.values(fields).every(entry => entry.status === 'known')
      return {fields, requests, complete}
    }
    function planMovie(movie, config, options) {
      return plan(movie, MetadataReadiness.required(movie, config), options)
    }
    // Groups per-movie plans into {source: [videoId]} for batch-capable callers.
    function group(entries) {
      const out = {}
      for (const {id, plan: p} of entries || []) {
        for (const source of Object.keys(p?.requests || {})) {
          const ids = (out[source] ||= [])
          if (!ids.includes(id)) ids.push(id)
        }
      }
      return out
    }
    return {ladders, freeSources, plan, planMovie, group}
  })()
