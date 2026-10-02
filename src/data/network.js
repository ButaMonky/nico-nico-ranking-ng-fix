  var Network = (function() {
    // BRUSH-019 request broker: one queue per request family.
    //   key          callers sharing a key share one request (dedupe) while it
    //                is waiting or running; the key decides the sharing scope
    //                (e.g. 'route:kind:videoId', so a new SPA route never
    //                reuses an old route's request)
    //   limit        at most `limit` tasks run at once (concurrency)
    //   signal       optional per caller; a job that has not started yet is
    //                dropped once every caller that asked for it has aborted
    //                (a caller without a signal keeps it alive); a dropped job
    //                never starts and rejects with an AbortError
    //   timeout/abort of a running request belong to the task (fetchResponse)
    function createQueue(limit) {
      const pending = new Map(), waiting = [];
      let active = 0;
      function drain() {
        while (active < limit && waiting.length) {
          const job = waiting.shift();
          job.started = true;
          active++;
          Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
            active--;
            if (pending.get(job.key) === job) pending.delete(job.key);
            drain();
          });
        }
      }
      function drop(job, reason) {
        const at = waiting.indexOf(job);
        if (job.started || at < 0) return;
        waiting.splice(at, 1);
        if (pending.get(job.key) === job) pending.delete(job.key);
        const error = new Error('request cancelled before start');
        error.name = 'AbortError';
        error.reason = reason;
        job.reject(error);
      }
      function watch(job, signal) {
        if (!signal) { job.keepAlive = true; return; }
        job.callers++;
        const onAbort = () => {
          job.aborted++;
          if (!job.keepAlive && job.aborted >= job.callers) drop(job, signal.reason);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, {once:true});
      }
      const enqueue = function(key, task, options) {
        const shared = pending.get(key);
        if (shared) { watch(shared, options?.signal); return shared.promise; }
        const job = {key, task, started:false, keepAlive:false, callers:0, aborted:0};
        job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
        pending.set(key, job);
        waiting.push(job);
        watch(job, options?.signal);
        drain();
        return job.promise;
      };
      enqueue.stats = () => ({active, queued:waiting.length});
      return enqueue;
    }
    async function fetchResponse(url, options, timeout = 15000, diagnostics) {
      const finish = diagnostics?.run?.begin(diagnostics.kind,diagnostics.lane) || function() {};
      let timedOut = false;
      const controller = new AbortController();
      const externalSignal = options?.signal;
      const abort = () => controller.abort();
      if (externalSignal?.aborted) abort();
      else externalSignal?.addEventListener('abort', abort, {once:true});
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
      try {
        const res = await fetch(url, Object.assign({}, options, {signal:controller.signal}));
        const body = await res.text(); // Keep timeout active through body download.
        finish(res.ok ? 'ok' : 'http');
        return {ok:res.ok, status:res.status, statusText:res.statusText, url:res.url,
          text:async () => body, json:async () => JSON.parse(body)};
      } catch (error) {
        finish(timedOut || externalSignal?.reason === 'owner-name-deadline' ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network');
        throw error;
      } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
    }
    return {createQueue, fetchResponse, ads:createQueue(4)};
  })();
