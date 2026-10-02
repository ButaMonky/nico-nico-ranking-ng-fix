
  // Pure adapter for search items in meta[name="server-response"]
  // (data.response.$getSearchVideoV2.data.items[]). It copies only fields
  // whose path and meaning are backed by saved captures or shipped code
  // (see _ai-sync completed BRUSH-005/007). Unknown fields are dropped;
  // nothing is fetched or rendered.
  var SearchItemAdapter = (function() {
    const videoIdPattern = /^(sm|so|nm)[0-9]+$/
    // Search-sourced metadata fields, in the order callers apply them.
    const fields = ['likeCount','viewCount','commentCount','mylistCount','durationSeconds','registeredAtMs']
    // A count is known only when it is a non-negative safe integer number.
    // Missing, null, strings, negatives, fractions and non-finite values stay
    // unknown (null). Never coerce them to 0: 0 is a real count.
    function count(value) {
      // JSON "-0" is a zero count; normalize the sign.
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value + 0 : null
    }
    // ISO 8601 with an explicit offset only; anything else stays unknown
    // instead of being read in the browser's local time zone.
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/
    function timestamp(value) {
      if (typeof value !== 'string' || !isoPattern.test(value)) return null
      const ms = Date.parse(value)
      return Number.isFinite(ms) ? ms : null
    }
    // Validates one value of a search field; used by the movie model too.
    function valueOf(field, value) {
      if (field === 'registeredAtMs') return Number.isFinite(value) ? value : null
      return fields.includes(field) ? count(value) : null
    }
    function normalize(item) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !videoIdPattern.test(item.id)) return null
      return {
        videoId:item.id,
        // OwnerEvidence keeps the strict user/channel identity checks.
        owner:OwnerEvidence.normalize(item.owner),
        likeCount:count(item.count?.like),
        viewCount:count(item.count?.view),
        commentCount:count(item.count?.comment),
        mylistCount:count(item.count?.mylist),
        // Seconds: the shipped card renders it with formatSecondsAsDuration.
        durationSeconds:count(item.duration),
        registeredAtMs:timestamp(item.registeredAt)
      }
    }
    // For callers that must not fail a whole page because of one item.
    function tryNormalize(item) {
      try { return normalize(item) } catch (_) { return null }
    }
    // Returns the raw items array, or null when the response has no such list.
    function itemsOf(response) {
      const items = response?.data?.response?.$getSearchVideoV2?.data?.items
      return Array.isArray(items) ? items : null
    }
    // Parses the document's server-response. status: 'ok' | 'missing' | 'invalid'.
    // Items keep page order and duplicates; callers decide how to merge them.
    function readDocument(doc) {
      let response
      try {
        const content = doc?.querySelector?.('meta[name="server-response"]')?.getAttribute('content')
        if (content == null) return {status:'missing', items:[]}
        response = JSON.parse(content)
      } catch (_) { return {status:'invalid', items:[]} }
      const raw = itemsOf(response)
      if (!raw) return {status:'missing', items:[]}
      const items = []
      for (const item of raw) {
        try {
          const normalized = normalize(item)
          if (normalized) items.push(normalized)
        } catch (_) {}
      }
      return {status:'ok', items}
    }
    // Injected cards keep the normalized item of the exact video they render.
    const injected = new WeakMap()
    function register(root, normalized) {
      if (root && normalized && root.dataset?.decorationVideoId === normalized.videoId) injected.set(root, normalized)
    }
    function fromRoot(root, videoId) {
      const normalized = root ? injected.get(root) : null
      return normalized && normalized.videoId === videoId && root.dataset?.decorationVideoId === videoId ? normalized : null
    }
    // videoId -> {field: value} of known search values. Per field, rows of one
    // video that disagree leave that field out (unknown); null never hides a value.
    function valuesById(items) {
      const out = new Map(), conflicts = new Map()
      for (const item of items || []) {
        if (!item?.videoId) continue
        const values = out.get(item.videoId) || {}, bad = conflicts.get(item.videoId) || new Set()
        for (const field of fields) {
          const value = item[field]
          if (value === null || value === undefined || bad.has(field)) continue
          if (field in values && values[field] !== value) { delete values[field];bad.add(field);continue }
          values[field] = value
        }
        out.set(item.videoId,values);conflicts.set(item.videoId,bad)
      }
      return out
    }
    // Search values for one parsed card row: the card's own injected item
    // first, then the initial document (only when the card is that same video).
    function valuesFor(row, initialValues) {
      const id = row?.movie?.id, root = row?.rootElem
      if (!id || root?.dataset?.decorationVideoId !== id) return {}
      const injectedItem = fromRoot(root,id)
      const source = injectedItem || initialValues?.get(id) || {}
      const values = {}
      for (const field of fields) if (source[field] !== null && source[field] !== undefined) values[field] = source[field]
      return values
    }
    return {fields, normalize, tryNormalize, count, timestamp, valueOf, itemsOf, readDocument, register, fromRoot, valuesById, valuesFor}
  })()
