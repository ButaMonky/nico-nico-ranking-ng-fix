  // BRUSH-038/039 Phase C: opt-in, bounded, read-only Nicodic transport.
  // This module has NO automatic caller, cache, or background discovery.
  // It deliberately is not wired to a card/UI until a separately reviewed phase.
  var DicArticleClient = (function() {
    const endpoint = 'https://api.dic.nicovideo.jp/v1/articles/article';
    const maxUrlBytes = 1900; // conservative CLIENT policy, not an API guarantee
    const maxActionTitles = 30;
    const encoder = new TextEncoder();
    function hasUnpairedSurrogate(value) {
      for (const char of value) {
        const cp = char.codePointAt(0);
        if (cp >= 0xD800 && cp <= 0xDFFF) return true;
      }
      return false;
    }
    function urlOf(names) {
      const params = new URLSearchParams();
      for (const title of names) params.append('titles[]', title);
      return endpoint + '?' + params.toString();
    }
    function create(normalizer, request, options = {}) {
      if (typeof request !== 'function') throw new TypeError('inject request transport');
      const now = options.now || Date.now;
      const timeoutMs = Number.isSafeInteger(options.timeoutMs)
        ? Math.min(30000, Math.max(100, options.timeoutMs)) : 15000;
      const controller = new AbortController();
      const batchesInFlight = new Map();
      let disposed = false;
      const abort = () => dispose();
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener('abort', abort, {once:true});
      function dispose() {
        if (disposed) return;
        disposed = true;
        controller.abort();
        options.signal?.removeEventListener('abort', abort);
      }
      async function runBatch(names) {
        if (disposed) return normalizer.failure(names, 'aborted');
        // URLSearchParams replaces lone UTF-16 surrogates with U+FFFD.
        // Never turn a lookup for a different name into an 'absent' observation.
        if (names.some(name => name.length > maxUrlBytes || hasUnpairedSurrogate(name)))
          return normalizer.failure(names, 'malformed');
        const url = urlOf(names);
        if (encoder.encode(url).length > maxUrlBytes)
          return normalizer.failure(names, 'unknown');
        let timedOut = false;
        const batchController = new AbortController();
        let rejectStop;
        const stopped = new Promise((_, reject) => {
          rejectStop = () => reject(Object.assign(new Error('aborted'), {name:'AbortError'}));
        });
        const cancel = () => { batchController.abort(); rejectStop(); };
        if (controller.signal.aborted) cancel();
        else controller.signal.addEventListener('abort', cancel, {once:true});
        const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
        try {
          const work = (async () => {
            const res = await request(url, {
              method:'GET', credentials:'omit', mode:'cors', redirect:'error',
              cache:'no-store', referrerPolicy:'no-referrer', signal:batchController.signal
            });
            if (disposed) return normalizer.failure(names, 'aborted');
            if (!res || !res.ok) return normalizer.failure(names, 'http');
            if (res.url && res.url !== url)
              return normalizer.failure(names, 'malformed');
            const payload = await res.json();
            if (disposed) return normalizer.failure(names, 'aborted');
            return normalizer.normalizeResponse(names, payload, now());
          })();
          return await Promise.race([work, stopped]);
        } catch (error) {
          if (disposed || options.signal?.aborted)
            return normalizer.failure(names, 'aborted');
          const kind = timedOut || error?.name === 'AbortError' ? 'timeout'
            : error?.name === 'SyntaxError' ? 'malformed' : 'network';
          return normalizer.failure(names, kind);
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', cancel);
        }
      }
      function shared(names) {
        const key = JSON.stringify(names);
        if (batchesInFlight.has(key)) return batchesInFlight.get(key);
        const p = runBatch(names).finally(() => {
          if (batchesInFlight.get(key) === p) batchesInFlight.delete(key);
        });
        batchesInFlight.set(key, p);
        return p;
      }
      async function lookup(requested) {
        if (!Array.isArray(requested) || requested.length > 60)
          return {status:'invalid', reason:'invalid_request', results:[]};
        const names = normalizer.titlesOf(requested);
        if (!names.length || names.length > maxActionTitles)
          return {status:'invalid', reason:'action_budget',
            results:normalizer.failure(names,'unknown').results};
        const pages = [];
        for (const batch of normalizer.batches(names)) {
          // Once disposed, no subsequent batch may launch on a stale route.
          pages.push(disposed ? normalizer.failure(batch,'aborted') : await shared(batch));
        }
        // Discard every earlier observation if this route was invalidated mid-action.
        // A partial success on a stale card must never be displayed as current.
        if (disposed) return {status:'error',reason:'unresolved',
          results:normalizer.failure(names,'aborted').results};
        const good = pages.filter(page => page.status === 'ok').length;
        return {status:good === pages.length ? 'ok' : good ? 'partial' : 'error',
          reason:good === pages.length ? null : 'unresolved',
          results:pages.flatMap(page => page.results)};
      }
      return {lookup, dispose, get disposed() { return disposed; }};
    }
    return {create};
  })();
