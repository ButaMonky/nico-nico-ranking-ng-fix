  // BRUSH-038/039 phase A: pure response normalization, deliberately NOT wired to live requests or UI.
  // API evidence is observational (2026-10-07): validated 200 responses are arrays of
  // {request_title,title,...}; omitted request_title means absent at observation time only.
  var DicArticleSource = (function() {
    const batchSize = 10; // conservative CLIENT batch policy, not a server limit
    const failureKinds = new Set(['http','network','timeout','aborted','malformed','unknown']);
    function titlesOf(values) {
      if (!Array.isArray(values)) return [];
      const seen = new Set(), names = [];
      for (const value of values) {
        if (typeof value !== 'string' || !value.trim() || seen.has(value)) continue;
        seen.add(value); names.push(value);
      }
      return names;
    }
    function batches(values) {
      const names = titlesOf(values), out = [];
      for (let i = 0; i < names.length; i += batchSize) out.push(names.slice(i,i + batchSize));
      return out;
    }
    function unresolved(names,state,reason) {
      return {status:state === 'error' ? 'error' : 'invalid',reason,
        results:names.map(name => ({name,state,article:null,observedAt:null}))};
    }
    // "observed_absent" is valid ONLY for a complete validated successful response.
    // Reject the whole payload if any row is malformed/duplicated/unrequested.
    function normalizeResponse(requested,payload,observedAt) {
      const names = titlesOf(requested);
      if (!Array.isArray(requested) || !names.length || names.length > batchSize)
        return unresolved(names,'unknown','invalid_request');
      if (!Number.isSafeInteger(observedAt) || observedAt < 0)
        return unresolved(names,'unknown','invalid_timestamp');
      if (!Array.isArray(payload)) return unresolved(names,'unknown','invalid_payload');
      const wanted = new Set(names), articles = new Map();
      for (const row of payload) {
        if (!row || typeof row !== 'object' || Array.isArray(row)
          || typeof row.request_title !== 'string' || typeof row.title !== 'string'
          || !row.request_title || !row.title || !wanted.has(row.request_title)
          || articles.has(row.request_title))
          return unresolved(names,'unknown','invalid_row');
        // Drop all other remote properties, including unsafe URLs/HTML.
        articles.set(row.request_title,{title:row.title});
      }
      return {status:'ok',reason:null,results:names.map(name => ({
        name,state:articles.has(name) ? 'observed_present' : 'observed_absent',
        article:articles.get(name) || null,observedAt
      }))};
    }
    // This helper must be called only after a real transport/HTTP/abort error.
    // An empty HTTP 200 array MUST go through normalizeResponse, not failure.
    function failure(requested,kind) {
      const reason = failureKinds.has(kind) ? kind : 'unknown';
      return unresolved(titlesOf(requested),'error',reason);
    }
    return {batchSize,titlesOf,batches,normalizeResponse,failure};
  })();
