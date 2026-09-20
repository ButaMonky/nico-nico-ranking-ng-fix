  var Network = (function() {
    function createQueue(limit) {
      const pending = new Map(), waiting = [];
      let active = 0;
      function drain() {
        while (active < limit && waiting.length) {
          const job = waiting.shift();
          active++;
          Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
            active--; pending.delete(job.key); drain();
          });
        }
      }
      return function(key, task) {
        if (pending.has(key)) return pending.get(key);
        const promise = new Promise((resolve, reject) => waiting.push({key, task, resolve, reject}));
        pending.set(key, promise); drain();
        return promise;
      };
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
