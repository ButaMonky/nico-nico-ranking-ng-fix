// Protocol verified offline from the saved official Web assets (2026-09-20):
// root-rHgqTPAd.js, enum-CL_Gp8xK.js and dist-CweCUift.js.
// One ordinary browser request per action, no mutation retries. The caller owns
// the request deadline through signal; aborted mutations may have reached server.
var CardActionData = (function () {
  'use strict';
  const NVAPI = 'https://nvapi.nicovideo.jp';
  const MUTE_API = 'https://mute-api.nicovideo.jp';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function failure(code) {
    const error = new Error('Card action unavailable');
    error.code = code;
    if (code === 'aborted') error.name = 'AbortError';
    return error;
  }
  function checkAbort(signal) { if (signal && signal.aborted) throw failure('aborted'); }
  function ownerPath(owner) {
    if (!object(owner) || !['user', 'channel'].includes(owner.type) ||
        !['string', 'number'].includes(typeof owner.id) || !/^[1-9]\d{0,15}$/.test(String(owner.id)) ||
        !Number.isSafeInteger(Number(owner.id))) throw failure('invalid_input');
    return '/v1/' + (owner.type === 'user' ? 'users/' : 'channels/') + String(owner.id);
  }
  function headers(watch, mutate) {
    const result = {'X-Frontend-Id':'6', 'X-Frontend-Version':'0'};
    if (watch) result['X-Niconico-Language'] = 'ja-jp';
    result.Accept = watch ? 'application/json;charset=utf-8' : 'application/json';
    if (watch) result['Content-Type'] = 'application/x-www-form-urlencoded';
    if (mutate) result[watch ? 'X-Request-With' : 'X-Requested-With'] = location.origin;
    return result;
  }
  function errorCode(body, watch, status) {
    const code = watch ? body && body.meta && body.meta.errorCode : body && body.code;
    if (status === 401 || code === 'NEED_LOGIN' || code === 'UNAUTHORIZED' || code === 'noUserSession') return 'unauthorized';
    if (code === 'MAINTENANCE' || code === 'maintenance') return 'maintenance';
    if (code === 'regularAccountLimit' || code === 'premiumAccountLimit') return 'limit';
    return 'http';
  }
  async function request(url, options, context, watch, readMute) {
    const {signal, fetch:fetchFn = fetch} = context;
    checkAbort(signal);
    let response;
    try {
      response = await fetchFn(url, {...options, signal, mode:'cors', credentials:'include', cache:'no-store', redirect:'error'});
    } catch (_) {
      checkAbort(signal);
      throw failure('network');
    }
    checkAbort(signal);
    if (!response || response.redirected || (response.url && response.url !== url)) throw failure('malformed');
    // The official mute lookup determines absence by HTTP 404 alone.
    if (readMute && response.status === 404) return {status:'success', isMuted:false};
    let body;
    try { body = await response.json(); }
    catch (_) {
      checkAbort(signal);
      if (!response.ok) throw failure(errorCode(null, watch, response.status));
      throw failure('malformed');
    }
    checkAbort(signal);
    if (!response.ok) {
      if (watch && response.status === 409 && object(body) && object(body.meta) && body.meta.errorCode === 'CONFLICT') {
        return {status:'success', alreadyAdded:true};
      }
      throw failure(errorCode(body, watch, response.status));
    }
    if (!object(body)) throw failure('malformed');
    return null;
  }
  async function watchLater(id, opts = {}) {
    if (typeof id !== 'string' || !/^(sm|so|nm)[1-9]\d{0,15}$/.test(id)) throw failure('invalid_input');
    const duplicate = await request(NVAPI + '/v1/users/me/watch-later', {
      method:'POST', headers:headers(true, true), body:new URLSearchParams({watchId:id, memo:''})
    }, opts, true, false);
    return duplicate || {status:'success', alreadyAdded:false};
  }
  async function getOwnerMuted(owner, opts = {}) {
    const path = ownerPath(owner);
    const absent = await request(MUTE_API + path, {method:'GET', headers:headers(false, false)}, opts, false, true);
    return absent || {status:'success', isMuted:true};
  }
  async function setOwnerMuted(owner, muted, opts = {}) {
    const path = ownerPath(owner);
    if (typeof muted !== 'boolean') throw failure('invalid_input');
    await request(MUTE_API + path, {method:muted ? 'POST' : 'DELETE', headers:headers(false, true)}, opts, false, false);
    return {status:'success', isMuted:muted};
  }
  return {watchLater, getOwnerMuted, setOwnerMuted};
})();
