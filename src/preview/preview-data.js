// Experimental, ordinary browser fetch only. Contract: saved 2026-09-13 Web
// client, HOVER-PREVIEW-HANDOFF.md and COMMENTS-READ.md (2026-09-20).
// Header values 6/0 are documented client defaults, not a current-live guarantee.
var PreviewData = (function () {
  'use strict';
  const NVAPI = 'https://nvapi.nicovideo.jp';
  const COMMENT_ORIGIN = 'https://public.nvcomment.nicovideo.jp';
  const COMMANDS = new Set(['ue','shita','naka','big','medium','small','white','red','pink','orange','yellow','green','cyan','blue','purple','black']);
  const headers = () => ({Accept:'application/json','X-Frontend-Id':'6','X-Frontend-Version':'0','X-Niconico-Language':'ja-jp'});
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const string = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
  function failure(code) {
    const error = new Error('Preview request unavailable');
    error.code = code;
    if (code === 'aborted') error.name = 'AbortError';
    return error;
  }
  function checkAbort(signal) { if (signal && signal.aborted) throw failure('aborted'); }
  function reportSafe(report, kind, outcome) { try { report(kind, outcome); } catch (_) { /* Diagnostics cannot affect playback. */ } }
  function officialUrl(value, kind) {
    if (!string(value, 16384)) throw failure('invalid');
    let url; try { url = new URL(value); } catch (_) { throw failure('invalid'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw failure('invalid');
    if (kind === 'comments') {
      if (url.origin !== COMMENT_ORIGIN || url.pathname !== '/' || url.search) throw failure('invalid');
    } else if (url.hostname !== 'delivery.domand.nicovideo.jp' && !url.hostname.endsWith('.delivery.domand.nicovideo.jp')) {
      throw failure('invalid');
    }
    return url;
  }
  async function request(kind, url, options, context, validate) {
    const {signal, fetch:fetchFn, report} = context;
    checkAbort(signal);
    reportSafe(report, kind, 'started');
    let outcome = 'network';
    try {
      const response = await fetchFn(url, {...options,signal,cache:'no-store',redirect:'error'});
      checkAbort(signal);
      outcome = 'http';
      if (!response || !response.ok) throw failure('http');
      outcome = 'invalid';
      if (response.redirected || (response.url && response.url !== url)) throw failure('invalid');
      const body = await response.json();
      checkAbort(signal);
      const result = validate(body);
      checkAbort(signal);
      reportSafe(report, kind, 'ok');
      return result;
    } catch (_) {
      if (signal && signal.aborted) outcome = 'aborted';
      reportSafe(report, kind, outcome);
      throw failure(outcome);
    }
  }
  function envelope(body, statuses) {
    if (!object(body) || !object(body.meta) || !statuses.includes(body.meta.status) || !object(body.data)) throw failure('invalid');
    return body.data;
  }
  function selectOutputs(domand) {
    if (!object(domand) || !Array.isArray(domand.videos) || !Array.isArray(domand.audios) || domand.videos.length > 100 || domand.audios.length > 100) throw failure('invalid');
    const available = item => object(item) && item.isAvailable === true && string(item.id,200) && /^[a-zA-Z0-9_.-]+$/.test(item.id) && Number.isFinite(item.bitRate) && item.bitRate > 0;
    const videos = domand.videos.filter(v => available(v) && Number.isFinite(v.height) && v.height > 0);
    const audios = domand.audios.filter(available).sort((a,b) => a.bitRate-b.bitRate);
    const small = videos.filter(v => v.height <= 360);
    const candidates = (small.length ? small : videos).sort((a,b) => a.bitRate-b.bitRate || a.height-b.height);
    if (!candidates.length || !audios.length) throw failure('invalid');
    return [[candidates[0].id,audios[0].id]];
  }
  function targets(params) {
    if (!object(params) || !Array.isArray(params.targets) || !params.targets.length || params.targets.length > 20 || !string(params.language,20) || !/^[a-z]{2}(?:-[a-z]{2})?$/.test(params.language)) throw failure('invalid');
    return params.targets.map(target => {
      if (!object(target) || !string(target.id,30) || !/^\d+$/.test(target.id) || !['main','easy','owner'].includes(target.fork)) throw failure('invalid');
      return {id:target.id,fork:target.fork};
    });
  }
  function commentConfig(comment) {
    if (!object(comment) || !object(comment.nvComment)) throw failure('invalid');
    const nv = comment.nvComment;
    const server = officialUrl(nv.server,'comments').origin;
    if (!string(nv.threadKey,8192)) throw failure('invalid');
    return {nvComment:{server,threadKey:nv.threadKey,params:{targets:targets(nv.params),language:nv.params.language}},ng:comment.ng};
  }
  function emptyNg(ng) {
    // Unknown/nonempty rules fail closed. Implementing word/user/command matching
    // without the service's full semantics could reveal comments the user blocked.
    if (!object(ng) || Object.keys(ng).some(k => !['ngScore','owner','channel','viewer'].includes(k)) ||
        !object(ng.ngScore) || typeof ng.ngScore.isDisabled !== 'boolean' || Object.keys(ng.ngScore).some(k=>k!=='isDisabled') ||
        !Array.isArray(ng.owner) || ng.owner.length || !Array.isArray(ng.channel) || ng.channel.length ||
        !object(ng.viewer) || !Array.isArray(ng.viewer.items) || ng.viewer.items.length || ng.viewer.count !== 0 ||
        Object.keys(ng.viewer).some(k=>!['revision','count','items'].includes(k))) throw failure('unsupported_ng');
  }
  async function load(videoId, {signal,fetch:fetchFn=fetch,now=()=>Date.now(),report=()=>{}} = {}) {
    checkAbort(signal);
    if (!string(videoId,32) || !/^(?:sm|so|nm)[1-9]\d*$/.test(videoId)) throw failure('invalid');
    // Saved official generator: ten alphanumeric characters + '_' + epoch ms.
    // Fresh per attempt, shared by preview/rights; never persisted or logged.
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const random = new Uint32Array(10);
    crypto.getRandomValues(random);
    const actionTrackId = Array.from(random,x=>alphabet[x % alphabet.length]).join('') + '_' + Date.now();
    const base = NVAPI + '/v1/watch/' + videoId;
    const query = '?actionTrackId=' + actionTrackId;
    const context = {signal,fetch:fetchFn,report};
    const preview = await request('preview',base+'/preview'+query,{method:'GET',credentials:'include',headers:headers()},context,body=>{
      const data = envelope(body,[200]);
      if (!object(data.video) || (data.video.id !== undefined && data.video.id !== videoId) ||
          !Number.isFinite(data.video.duration) || data.video.duration <= 0 ||
          !object(data.domand) || !string(data.domand.accessRightKey,8192) || /[\r\n]/.test(data.domand.accessRightKey)) throw failure('invalid');
      const outputs = selectOutputs(data.domand);
      let comment = null;
      try { comment = commentConfig(data.comment); } catch (_) { /* Optional comments fail independently. */ }
      return {duration:data.video.duration, key:data.domand.accessRightKey, outputs, comment};
    });
    checkAbort(signal);
    const rights = await request('rights',base+'/access-rights/hls'+query,{method:'POST',credentials:'include',headers:{...headers(),'Content-Type':'application/json','X-Request-With':'https://www.nicovideo.jp','X-Access-Right-Key':preview.key},body:JSON.stringify({outputs:preview.outputs})},context,body=>{
      const data = envelope(body,[200,201]);
      if ((data.videoId !== undefined && data.videoId !== videoId) || (data.watchId !== undefined && data.watchId !== videoId)) throw failure('invalid');
      const url = officialUrl(data.contentUrl,'rights').href;
      const expiresAt = typeof data.expireTime === 'string' ? Date.parse(data.expireTime) : NaN;
      const current = now();
      if (!Number.isFinite(current) || !Number.isFinite(expiresAt) || expiresAt <= current) throw failure('invalid');
      return {url,expiresAt};
    });
    return {...rights,duration:preview.duration,comment:preview.comment,ng:preview.comment && preview.comment.ng};
  }
  function normalizeComments(body, requestedTargets, ng) {
    emptyNg(ng);
    const data = envelope(body,[200]);
    if (!Array.isArray(data.threads) || data.threads.length > 100 || !Array.isArray(requestedTargets)) throw failure('invalid');
    const allowed = new Set(requestedTargets.map(t=>String(t.id)+':'+t.fork));
    const result = []; let scanned = 0;
    for (const thread of data.threads) {
      if (!object(thread) || !Array.isArray(thread.comments)) throw failure('invalid');
      const matched = allowed.has(String(thread.id)+':'+thread.fork);
      for (const item of thread.comments) {
        if (++scanned > 5000 || result.length >= 300) return result.sort((a,b)=>a.vposMs-b.vposMs);
        if (!matched || !object(item) || !Number.isFinite(item.vposMs) || item.vposMs < 0 || item.vposMs >= 30000 ||
            !string(item.body,10000) || !Number.isFinite(item.score) || item.score < 0 || item.isAI === true || item.isAi === true ||
            !Array.isArray(item.commands) || item.commands.length > 100 || item.commands.some(c=>typeof c!=='string' || /^ai(?:$|[:_])/i.test(c))) continue;
        // Text only; consumers must draw text, never interpret this as markup.
        result.push({vposMs:item.vposMs,text:item.body.slice(0,200),commands:item.commands.filter(c=>COMMANDS.has(c)).slice(0,10)});
      }
    }
    return result.sort((a,b)=>a.vposMs-b.vposMs);
  }
  async function comments(data, {signal,fetch:fetchFn=fetch,report=()=>{}} = {}) {
    checkAbort(signal);
    let config;
    try {
      config = commentConfig(data && data.comment);
      emptyNg(config.ng);
    } catch (error) {
      reportSafe(report,'comments','invalid');
      throw failure(error && error.code === 'unsupported_ng' ? 'unsupported_ng' : 'invalid');
    }
    const nv = config.nvComment;
    return request('comments',nv.server+'/v1/threads?pc=1',{method:'POST',credentials:'omit',headers:{...headers(),'X-Client-Os-Type':'others','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({params:nv.params,threadKey:nv.threadKey,additionals:{}})},{signal,fetch:fetchFn,report},body=>normalizeComments(body,nv.params.targets,config.ng));
  }
  return {load,comments,selectOutputs,normalizeComments};
})();
