  var Diagnostics = (function() {
    const version = typeof NRN_VERSION === 'string' ? NRN_VERSION : 'unknown'
    const native = typeof nrnNativeConsole === 'object' ? nrnNativeConsole : globalThis.console
    const now = () => typeof performance === 'object' ? performance.now() : Date.now()
    const clone = value => JSON.parse(JSON.stringify(value))
    const number = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.round(value)) : null
    const fields = ['ownerId','ownerType','ownerName','ownerVisibility','tags','lockedTags','description']
    const kinds = ['detail','page','snapshot','adsThanks','adsDecoration','ownerName','other']
    const outcomes = ['ok','http','network','timeout','aborted','invalid','apiFailure']
    const phases = ['starting','waiting-dom','initial-ng','validating-api','fetching','ng-check','adding','completed','stopped','error','disabled','disposed']
    const runtimeKeys = ['visibleTotal','visibleOriginal','visibleInjected','originalNg','injectedNg','pending',
      'candidatePool','fetchedUnits','fetchedItems','detailChecked','acceptedFromAdded','apiPrefilteredNg',
      'duplicatesRemoved','adPending','detailCacheHits','detailCacheMisses','detailCacheRestores',
      'detailCacheRestoreFailures','searchedPhysicalPageCount']
    const history = [], previous = []
    const problemCounts = {startup:0,routeSetup:0,developerAudit:0}
    let active = null, sequence = 0, eventSequence = 0
    function event(level,module) {
      history.push({sequence:++eventSequence,level,module:['startup','new-tab'].includes(module) ? module : 'other'})
      if (history.length > 300) history.shift()
    }
    function settings(config) {
      const counts = {}
      for (const key of ['ngMovies','ngTitles','ngUserIds','ngChannelIds','ngUserNames','ngTags','ngLockedTags']) counts[key] = number(config?.[key]?.set?.size)
      return {
        ngCounts:counts,
        lockedTagCountEnabled:Boolean(config?.ngLockedTagCountEnabled?.value),
        advancedRulesEnabled:Boolean(config?.advancedNgRulesEnabled?.value),
        detailsEnabled:Boolean(config?.useGetThumbInfo?.value),
        detailConcurrency:number(config?.thumbInfoConcurrency?.value),
        detailPanelAlwaysOpen:config?.movieInfoTogglable?.value === false,
        descriptionAlwaysOpen:config?.descriptionTogglable?.value === false,
        sessionCacheEnabled:Boolean(config?.sessionDetailCacheEnabled?.value),
        selfAdWarningEnabled:Boolean(config?.selfAdWarningEnabled?.value),
        autoFillEnabled:Boolean(config?.autoFillEnabled?.value),
        autoFillTarget:number(config?.autoFillTargetCount?.value),
        requestedSource:['legacy','hybrid','snapshot'].includes(config?.autoFillInfoMode?.value) ? config.autoFillInfoMode.value : 'unknown'
      }
    }
    function start(config,path) {
      active?.close()
      const started = now(), seq = ++sequence
      const routeKind = /^\/tag\//.test(path) ? 'tag' : /^\/search\//.test(path) ? 'search' : /^\/ranking/.test(path) ? 'ranking' : 'other'
      let movies = null, queue = null, runtime = null, closed = false, phase = 'starting'
      let frozen = null, initial = null, comparison = null, audit = null, preview = null, terminalElapsedMs = null, endedPhase = null
      const pending = new Set(), attempted = new Set(), recent = new Set(), session = new Set()
      const payloadFailures = {run:{},diagnostic:{}}
      const network = Object.fromEntries(['run','diagnostic'].map(lane => [lane,Object.fromEntries(kinds.map(kind => [kind,{
        attempts:0,retries:0,active:0,peakActive:0,ok:0,http:0,network:0,timeout:0,aborted:0,invalid:0,apiFailure:0,durationSumMs:0
      }]))]))
      function detailState() {
        const plan = {total:0,readyWithoutRequest:0,cacheOnly:0,requestedVideos:attempted.size,queued:queue?._pendingIds?.length || 0,terminalUnresolved:0,awaitingRequired:0}
        const states = Object.fromEntries(fields.map(field => [field,{unknown:0,known:0,failed:0}]))
        const missing = Object.fromEntries(fields.map(field => [field,0]))
        const ownerNameRecovery = {known:0,nicoad:0,pending:0,accepted:0,rejected:0,failed:0,untyped:0,budget:0,cached:0,
          hiddenUnknown:0,skippedNg:0,awaitingDetails:0}
        for (const movie of movies?._idToMovie?.values() || []) {
          if (movie.metadata.ownerName === 'known') ownerNameRecovery.known++
          if (movie._nrnOwnerNameSource === 'nicoad') ownerNameRecovery.nicoad++
          if (Object.hasOwn(ownerNameRecovery,movie._nrnOwnerNameStatus)) ownerNameRecovery[movie._nrnOwnerNameStatus]++
          plan.total++
          const required = MetadataReadiness.required(movie,config)
          if (movie.metadata.ownerName !== 'known') {
            if (movie.owner?.visibility === 'hidden') ownerNameRecovery.hiddenUnknown++
            if (movie.ng && !movie._detailsRequested) ownerNameRecovery.skippedNg++
            if (!movie.thumbInfoDone && [...required].some(field => movie.metadata[field] !== 'known')) ownerNameRecovery.awaitingDetails++
          }
          let ready = true
          for (const field of fields) {
            const state = movie.metadata[field]
            states[field][['known','failed'].includes(state) ? state : 'unknown']++
            if (required.has(field) && state !== 'known') { missing[field]++; ready = false }
          }
          if (movie.thumbInfoDone && !ready) plan.terminalUnresolved++
          if (!movie.thumbInfoDone && !ready) plan.awaitingRequired++
          if (!attempted.has(movie.id)) {
            if (recent.has(movie.id) || session.has(movie.id)) plan.cacheOnly++
            else if (ready) plan.readyWithoutRequest++
          }
        }
        return {detailPlan:plan,fieldStates:states,missingRequired:missing,ownerNameRecovery}
      }
      function snapshot() {
        if (closed) return clone(frozen)
        const data = typeof runtime === 'function' ? runtime() : {}
        const safeRuntime = Object.fromEntries(runtimeKeys.map(key => [key,number(data?.[key])]))
        const net = clone(network);net.run.detail.uniqueVideos = attempted.size
        const p = typeof preview === 'function' ? preview() : {}
        const previewState = Object.fromEntries(['started','playing','stopped','blocked','error','unavailable','commentsUnavailable','preview','rights','comments','http','invalid','aborted','network'].map(k=>[k,number(p[k])]))
        Object.assign(previewState,{active:p.active===true,enabled:Boolean(config?.hoverPreviewEnabled?.value),controlRequestsOnly:true})
        return {
          sequence:seq,routeKind,phase,endedPhase,elapsedSinceRouteStartMs:number(now()-started),terminalElapsedMs,
          settings:settings(config),network:net,payloadFailures:clone(payloadFailures),...detailState(),runtime:safeRuntime,
          cache:{recentRestoredVideos:recent.size,sessionRestoredVideos:session.size,
            restoredAfterRequestStarted:[...new Set([...recent,...session])].filter(id => attempted.has(id)).length},
          initialProcessing:clone(initial),sourceComparison:clone(comparison),audit:clone(audit),preview:previewState
        }
      }
      const run = {
        queueKey:'route-' + seq,
        bindPreview(read) { if (!closed) preview=typeof read==='function'?read:null },
        validationFailure(kind,lane,result) {
          if (closed || !kinds.includes(kind) || !['invalid','apiFailure','incomplete'].includes(result)) return
          lane = lane === 'diagnostic' ? lane : 'run'
          const counts = payloadFailures[lane][kind] || (payloadFailures[lane][kind] = {invalid:0,apiFailure:0,incomplete:0})
          counts[result]++
        },
        bind(value,thumbInfo) { if (!closed) { movies = value; if (thumbInfo) queue = thumbInfo } },
        runtime(provider) { if (!closed) runtime = provider },
        phase(value) {
          if (closed) return
          phase = phases.includes(value) ? value : 'starting'
          terminalElapsedMs = ['completed','stopped','error','disabled'].includes(phase) ? number(now()-started) : null
        },
        audit(value) {
          if (!closed) audit = Object.fromEntries(['duplicateCards','modelWarnings','ownerNgMismatches','invalidNgIds'].map(key => [key,number(value[key])]))
        },
        initial(value) {
          if (closed) return
          initial = Object.fromEntries(['totalInitMs','domWaitMs','thumbInfoMs','selfAdMs','originalCount','visibleAfterNg'].map(key => [key,number(value[key])]))
        },
        comparison(value) {
          if (closed) return
          comparison = {measurement:'candidate-fetch-and-estimate',sameWorkload:false}
          for (const mode of ['legacy','hybrid','snapshot']) {
            const v = value?.[mode] || {}
            comparison[mode] = {ok:v.ok === true,candidates:number(v.candidateCount),estimatedDetailChecks:number(v.estimatedDetailChecks),
              sourceMs:number(v.sourceElapsedMs ?? v.elapsedMs),exactRate:number(v.exactRate),overlapRate:number(v.overlapRate),titleMismatches:number(v.titleMismatches)}
          }
        },
        cache(id,kind) { if (!closed && (kind === 'recent' || kind === 'session')) (kind === 'recent' ? recent : session).add(id) },
        begin(kind,lane,id,retry) {
          if (closed) return function() {}
          lane = lane === 'diagnostic' ? lane : 'run';kind = kinds.includes(kind) ? kind : 'other'
          const counter = network[lane][kind], at = now()
          counter.attempts++;counter.active++;counter.peakActive = Math.max(counter.peakActive,counter.active)
          if (retry === true) counter.retries++
          if (kind === 'detail' && lane === 'run' && id != null) attempted.add(id)
          let settled = false
          const finish = result => {
            if (settled) return
            settled = true;pending.delete(finish);counter.active--
            counter[outcomes.includes(result) ? result : 'network']++
            counter.durationSumMs += number(now()-at)
          }
          pending.add(finish);return finish
        },
        snapshot,
        close() {
          if (closed) return
          for (const finish of [...pending]) finish('aborted')
          endedPhase = phase;phase = 'disposed';frozen = snapshot();closed = true
          previous.push(frozen);if (previous.length > 3) previous.shift()
          movies = queue = runtime = config = preview = null
          attempted.clear();recent.clear();session.clear()
          if (active === run) active = null
        }
      }
      active = run
      native?.log?.('[NRN ' + version + '] 診断開始。設定 → 開発者・診断 → 匿名診断をコピー で共有できます。')
      return run
    }
    const api = {
      start,
      log(module) { event('log',module) },
      warn(module) { event('warn',module) },
      error(module) { event('error',module) },
      problem(code) {
        if (!Object.hasOwn(problemCounts,code)) return
        problemCounts[code]++
        api.publish('error')
      },
      getHistory() { return clone(history) },
      snapshot() {
        return {format:'NRN-DIAGNOSTICS-1',version,scope:'this-userscript-only',
          measurement:{network:'transport-invocations-including-retries',timings:'monotonic-milliseconds',
            success:'detail-ok-includes-XML-validation;other-ok-is-HTTP-success-see-payloadFailures',
            durationSum:'sum-of-requests-not-wall-time',detailPlan:'current-distinct-videos-not-cumulative-skips'},
          privacy:{urls:false,searchTerms:false,videoIds:false,ownerIds:false,names:false,ruleValues:false,cookies:false,rawErrors:false},
          current:active?.snapshot() || null,previous:clone(previous),
          problemCounts:{...problemCounts},
          consoleCounts:typeof nrnConsoleCounts === 'object' ? {...nrnConsoleCounts} : {warnings:0,errors:0},
          historyCount:history.length,recent:clone(history.slice(-30))}
      },
      publish(reason) {
        const text = JSON.stringify({...api.snapshot(),reportReason:['initial','terminal','audit','manual','error'].includes(reason) ? reason : 'manual'},null,2)
        native?.log?.('NRN_REPORT_BEGIN\n' + text + '\nNRN_REPORT_END')
        return text
      }
    }
    window.__nrnDiagnostics = api
    return api
  })()
