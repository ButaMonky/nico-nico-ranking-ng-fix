
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
    return {normalize, count, itemsOf, readDocument}
  })()
