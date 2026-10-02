
  // Pure adapter for search items in meta[name="server-response"]
  // (data.response.$getSearchVideoV2.data.items[]). It copies only fields
  // whose presence and meaning are confirmed in saved responses: id, owner and
  // count.like. Unknown fields are dropped; nothing is fetched or rendered.
  var SearchItemAdapter = (function() {
    const videoIdPattern = /^(sm|so|nm)[0-9]+$/
    // A count is known only when it is a non-negative safe integer number.
    // Missing, null, strings, negatives, fractions and non-finite values stay
    // unknown (null). Never coerce them to 0: 0 is a real count.
    function count(value) {
      // JSON "-0" is a zero count; normalize the sign.
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value + 0 : null
    }
    function normalize(item) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !videoIdPattern.test(item.id)) return null
      return {
        videoId:item.id,
        // OwnerEvidence keeps the strict user/channel identity checks.
        owner:OwnerEvidence.normalize(item.owner),
        likeCount:count(item.count?.like)
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
    // videoId -> likeCount for known counts. Rows of one video that disagree
    // leave it out (unknown); null rows never hide a known row.
    function likeCounts(items) {
      const counts = new Map(), conflicts = new Set()
      for (const item of items || []) {
        if (!item || item.likeCount === null || conflicts.has(item.videoId)) continue
        if (counts.has(item.videoId) && counts.get(item.videoId) !== item.likeCount) {
          counts.delete(item.videoId);conflicts.add(item.videoId);continue
        }
        counts.set(item.videoId,item.likeCount)
      }
      return counts
    }
    // The like count for one parsed card row: its own injected item first,
    // then the initial document (only when the card is that same video).
    function likeFor(row, initialLikes) {
      const id = row?.movie?.id, root = row?.rootElem
      if (!id || root?.dataset?.decorationVideoId !== id) return null
      const injectedItem = fromRoot(root,id)
      if (injectedItem) return injectedItem.likeCount
      return initialLikes?.has(id) ? initialLikes.get(id) : null
    }
    return {normalize, tryNormalize, count, itemsOf, readDocument, register, fromRoot, likeCounts, likeFor}
  })()
