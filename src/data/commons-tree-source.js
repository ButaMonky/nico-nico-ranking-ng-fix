  // BRUSH-038/039 Phase B: pure Commons tree response validation, NOT shipped or network-wired.
  // LIVE 2026-10-07/08 observations, not an official API contract:
  // combined and directional endpoints wrap a direction in data.parents/data.children.
  var CommonsTreeSource = (function() {
    const directions = new Set(['combined','parents','children']);
    // Observed 300 succeeds, 301 rejects. This is a conservative parser limit,
    // not a guarantee that the server will keep accepting requests of size 300.
    const observedLimitCeiling = 300;
    const failureKinds = new Set(['http','network','timeout','aborted','malformed','unknown']);
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function scope(request) {
      if (!isObject(request) || !directions.has(request.direction)
        || typeof request.globalId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(request.globalId)
        || !Number.isSafeInteger(request.offset) || request.offset < 0
        || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > observedLimitCeiling
        || !Number.isSafeInteger(request.offset + request.limit)) return null;
      return {globalId:request.globalId,direction:request.direction,offset:request.offset,limit:request.limit};
    }
    function invalid(reason) { return {status:'invalid',reason,observedAt:null,pages:null}; }
    function error(reason) { return {status:'error',reason,observedAt:null,pages:null}; }
    function normalizeSide(direction,raw,request) {
      if (!isObject(raw) || !Number.isSafeInteger(raw.total) || raw.total < 0
        || !Array.isArray(raw.contents) || raw.contents.length > request.limit) return null;
      const seen = new Set(), contents = [];
      for(const item of raw.contents) {
        if (!isObject(item) || typeof item.globalId !== 'string'
          || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.globalId) || seen.has(item.globalId)) return null;
        seen.add(item.globalId);
        // Optional metadata cannot determine identity, completeness or absence.
        // NEVER reuse untrusted API HTML/URLs without separate validation.
        contents.push({globalId:item.globalId,
          contentKind:typeof item.contentKind === 'string' ? item.contentKind : 'unknown',
          visibleStatus:typeof item.visibleStatus === 'string' ? item.visibleStatus : 'unknown',
          title:typeof item.title === 'string' ? item.title : null});
      }
      const expected = Math.min(request.limit, Math.max(0,raw.total-request.offset));
      // A returned item cannot lie outside the window claimed by this response's total.
      if (contents.length > expected) return null;
      return {direction,total:raw.total,offset:request.offset,limit:request.limit,
        contents,returned:contents.length,nextOffset:request.offset+request.limit,
        sparse:contents.length < expected,
        // These are observations, not a certification that every ID exists in prior pages.
        empty:contents.length===0,observedLastWindow:request.offset+request.limit>=raw.total};
    }
    function normalizeResponse(request,payload,observedAt) {
      const bound = scope(request);
      if (!bound) return invalid('invalid_request');
      if (!Number.isSafeInteger(observedAt) || observedAt < 0) return invalid('invalid_timestamp');
      if (!isObject(payload) || !isObject(payload.data)
        || (payload.meta != null && (!isObject(payload.meta) || payload.meta.status !== 200)))
        return invalid('invalid_response');
      const wanted = bound.direction === 'combined' ? ['parents','children'] : [bound.direction];
      const pages = {};
      for(const direction of wanted) {
        const side = normalizeSide(direction,payload.data[direction],bound);
        if (!side) return invalid('invalid_'+direction);
        pages[direction] = side;
      }
      return {status:'ok',reason:null,globalId:bound.globalId,observedAt,pages};
    }
    function failure(kind) { return error(failureKinds.has(kind) ? kind : 'unknown'); }
    return {observedLimitCeiling,scope,normalizeResponse,failure};
  })();
