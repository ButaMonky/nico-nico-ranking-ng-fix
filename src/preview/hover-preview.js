  var HoverPreview = (function() {
    const css = `
.nrn-preview-host { position:relative; border-radius:var(--radii-m,8px); }
.nrn-preview { position:absolute; inset:0; z-index:2; overflow:hidden; border-radius:inherit; pointer-events:none; color:#fff; }
.nrn-preview-surface { position:absolute; inset:0; border-radius:inherit; background:var(--colors-monotone--l0,#000); opacity:0; transition:opacity var(--durations-medium,.3s); }
.nrn-preview[data-phase="loading"] { visibility:hidden; }
.nrn-preview[data-phase="playing"] .nrn-preview-surface { opacity:1; }
.nrn-preview[data-closing="true"] { animation:nrn-preview-fade-out var(--durations-medium,.3s) both; }
.nrn-preview-controls { position:absolute; inset:0; z-index:3; pointer-events:none; }
.nrn-preview-controls[data-closing="true"] { animation:nrn-preview-fade-out var(--durations-slow,.5s) both; }
.nrn-preview-controls[data-closing="true"] .nrn-preview-mute { pointer-events:none; }
@keyframes nrn-preview-fade-out { from {opacity:1} to {opacity:0} }
.nrn-preview video,.nrn-preview canvas { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; }
.nrn-preview-mute,.nrn-preview-loading { position:absolute; right:4px; top:4px; width:28px; height:28px; box-sizing:border-box; z-index:3; padding:4px; border:0; border-radius:var(--radii-s,4px); }
.nrn-preview-mute { display:flex; align-items:center; justify-content:center; pointer-events:auto; color:#fff; background:var(--colors-layer-surface-overlay-black,rgba(0,0,0,.8)); cursor:pointer; }
.nrn-preview-mute[hidden] { display:none; }
.nrn-preview-mute:hover { background:var(--colors-layer-surface-high-em-black,#000); }
.nrn-preview-mute svg { width:100%; height:100%; fill:currentColor; pointer-events:none; }
.nrn-preview-loading { pointer-events:none; }
.nrn-preview-loading::after { content:''; display:block; box-sizing:border-box; width:20px; height:20px; border:2px solid white; border-bottom-color:transparent; border-radius:50%; animation:nrn-preview-spin .8s linear infinite; filter:drop-shadow(0 0 2px #0009); }
@keyframes nrn-preview-spin { to {transform:rotate(360deg)} }
.nrn-preview-mute:focus-visible { outline:3px solid #58b4ff; }
.nrn-preview-status { position:absolute; left:4px; top:4px; font:12px/1.4 sans-serif; background:#111c; padding:2px 4px; }
.nrn-preview-track { position:absolute; bottom:0; left:0; width:100%; height:4px; background:var(--colors-monotone--l90,#e6e6e6); }
.nrn-preview-progress { position:absolute; bottom:0; left:0; height:100%; background:var(--colors-layer-surface-accent-azure,#0080ff); }
`;
    function layoutComments(comments, ctx, w, h) {
      const colors={white:'#ffffff',red:'#ff0000',pink:'#ff8080',orange:'#ffc000',yellow:'#ffff00',green:'#00ff00',cyan:'#00ffff',blue:'#0000ff',purple:'#c000ff',black:'#000000'}
      const rows=[]
      for(const comment of comments.slice(0,300)) {
        const commands=comment.commands||[],position=commands.find(c=>['ue','shita','naka'].includes(c))||'naka'
        const defaultSize=commands.some(c=>['gothic','mincho','defont','ender','full','patissier'].includes(c))?24:39
        const size=Math.max(8,({big:39,small:15,medium:24}[commands.find(c=>['big','small','medium'].includes(c))]||defaultSize)*h/360)
        const lineHeight=size*1.2,font='bold '+size+'px '+(commands.includes('mincho')?'serif':'sans-serif'),lines=comment.text.split(/\r?\n/),height=lineHeight*lines.length
        ctx.font=font
        const width=Math.max(...lines.map(line=>ctx.measureText(line).width)),duration=4000
        for(let offset=0;offset+height<=h;offset+=lineHeight) {
          const y=position==='shita'?h-offset-height:offset
          if(rows.some(row=>row.end>comment.vposMs&&row.y<y+height&&row.y+row.height>y))continue
          rows.push({...comment,position,size,font,lines,height,width,y,duration,end:comment.vposMs+duration,color:colors[commands.find(c=>Object.hasOwn(colors,c))]||'#ffffff'})
          break
        }
      }
      return rows
    }
    function media(video, data, {onError}) {
      // This private lazy factory does not read/replace the site's Hls global.
      const Hls = getNnrPreviewHls()
      if (Hls.isSupported()) {
        const policy = {default:{maxTimeToFirstByteMs:8000,maxLoadTimeMs:10000,timeoutRetry:null,errorRetry:null}}
        const hls = new Hls({enableWorker:false,lowLatencyMode:false,backBufferLength:0,
          maxBufferLength:5,maxMaxBufferLength:10,maxBufferSize:4000000,
          manifestLoadPolicy:policy,playlistLoadPolicy:policy,fragLoadPolicy:policy,keyLoadPolicy:policy,
          xhrSetup(xhr,url) {
            const u = new URL(url)
            if (u.protocol !== 'https:' || u.username || u.password || u.port || !/(^|\.)(?:delivery|asset)\.domand\.nicovideo\.jp$/.test(u.hostname)) throw new Error('preview-media-host')
            xhr.withCredentials = true
          }})
        hls.on(Hls.Events.ERROR, (_event, info) => { if (info.fatal) onError() })
        try {hls.attachMedia(video);hls.loadSource(data.url)} catch(error) {hls.destroy();throw error}
        return {destroy() { hls.stopLoad();hls.destroy() }}
      }
      if (!video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('preview-unsupported')
      video.crossOrigin = 'use-credentials';video.src = data.url
      return {destroy() {}}
    }
    function create(page, config, options = {}) {
      const doc = page.doc, win = doc.defaultView, setting = config.hoverPreviewEnabled
      const load = options.load || ((id,opts) => PreviewData.load(id,opts))
      const fetchComments = options.comments || ((data,opts) => PreviewData.comments(data,opts))
      const mountMedia = options.media || media
      const source = new URL(page._sourceUrl || doc.location.href)
      let disposed = false, hovered = null, blockedRoot = null, timer = null, muted = true, attempt = 0, allowStart = false
      const sessions=new Set(),retiredControls=new Map()
      const audio=typeof PreviewAudio!=='undefined'?PreviewAudio.forDocument(doc):null
      if(audio)muted=audio.muted
      const unsubscribeAudio=audio?.subscribe(value=>{
        muted=value
        for(const s of sessions)if(s.video){s.video.muted=value;updateButton(s)}
      })
      let hoverUntil=0,pointerUntil=0,scrollUntil=0
      const counts = {started:0,playing:0,stopped:0,blocked:0,error:0,unavailable:0,commentsUnavailable:0,
        preview:0,rights:0,comments:0,http:0,invalid:0,aborted:0,network:0}
      const report = (kind,result) => {
        if (disposed) return
        if (result === 'started' && ['preview','rights','comments'].includes(kind)) counts[kind]++
        if (['http','invalid','aborted','network'].includes(result)) counts[result]++
      }
      function sameRoute() { const u=new URL(doc.location.href);return u.origin===source.origin&&u.pathname===source.pathname&&u.search===source.search }
      function eligible(root, id) {
        if (disposed || page._disposed || !setting?.value || doc.hidden || !sameRoute() || !root?.isConnected) return false
        if (root.dataset.nrnAutofill !== 'true' || root.dataset.decorationVideoId !== id || !/^(?:sm|so|nm)\d+$/.test(id)) return false
        if (root.dataset.nrnOfficialMuted === 'true') return false
        if (root.closest('[hidden],.nrn-hide,.nrn-is-ng,.nrn-autofill-pending,.nrn-autofill-overflow')) return false
        const r=root.getBoundingClientRect()
        return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<win.innerHeight&&r.left<win.innerWidth
      }
      function live(s) { return sessions.has(s)&&!s.abort.signal.aborted&&eligible(s.root,s.id) }
      function release(s,keepControls=false) {
        s.cancelFrameWait?.();s.cancelFrameWait=null
        s.abort.abort();s.commentAbort?.abort();clearTimeout(s.deadline);clearTimeout(s.commentDeadline);clearTimeout(s.leaveTimer);clearTimeout(s.exitTimer);clearInterval(s.check);win.cancelAnimationFrame(s.frame)
        s.observer?.disconnect();s.intersection?.disconnect()
        if (s.video) {
          s.video.onended=s.video.onerror=s.video.ontimeupdate=null
          s.video.pause();s.adapter?.destroy();s.adapter=null
          s.video.removeAttribute('src');s.video.load();s.video.remove();s.video=null
        } else {s.adapter?.destroy();s.adapter=null}
        if(!keepControls)s.controls?.remove()
        s.canvas?.remove();s.canvas=null;s.rows=[];s.comments=[]
      }
      function clearRetired(root) {
        const old=retiredControls.get(root);if(!old)return
        clearTimeout(old.timer);old.controls.remove();retiredControls.delete(root)
        if(![...sessions].some(s=>s.root===root))old.host.classList.remove('nrn-preview-host')
      }
      function stopSession(s,finishControls=false) {
        if(!sessions.delete(s))return
        const keep=finishControls&&s.controlsUntil>Date.now()
        release(s,keep);s.layer.remove();counts.stopped++
        if(keep) {
          clearRetired(s.root)
          retiredControls.set(s.root,{controls:s.controls,host:s.host,timer:setTimeout(()=>clearRetired(s.root),s.controlsUntil-Date.now())})
        } else if(!retiredControls.has(s.root))s.host.classList.remove('nrn-preview-host')
      }
      function stop() {
        clearTimeout(timer);timer=null
        for(const s of [...sessions])stopSession(s)
        for(const root of [...retiredControls.keys()])clearRetired(root)
      }
      function animationMs(element,fallback) {
        const value=win.getComputedStyle(element).animationDuration.split(',')[0].trim(),number=parseFloat(value)
        return Number.isFinite(number)?number*(value.endsWith('ms')?1:1000):fallback
      }
      function close(s) {
        if(!live(s)){stopSession(s);return}
        s.closing=true;s.layer.dataset.closing=s.controls.dataset.closing='true'
        s.controlsUntil=Date.now()+animationMs(s.controls,500)
        s.exitTimer=setTimeout(()=>stopSession(s,true),animationMs(s.layer,300))
      }
      function departures(root) {
        for(const s of sessions) {
          clearTimeout(s.leaveTimer);s.leaveTimer=null
          if(s.root!==root&&!s.closing)s.leaveTimer=setTimeout(()=>close(s),200)
        }
      }
      function reopen(s) {
        clearTimeout(s.leaveTimer);clearTimeout(s.exitTimer);s.closing=false
        delete s.layer.dataset.closing;delete s.controls.dataset.closing
      }
      function terminal(s, state) {
        if (!sessions.has(s)) return
        if (Object.hasOwn(counts,state)) counts[state]++
        // Keep the original thumbnail/link usable, and require a genuine leave
        // before retrying this card. A failed hover must not loop by itself.
        if(hovered===s.root){blockedRoot=s.root;hovered=null;clearTimeout(timer);timer=null}
        stopSession(s)
      }
      function waitForFrame(s) {
        const video=s.video
        return new Promise(resolve=>{
          const events=['loadeddata','playing','resize']
          const finish=ready=>{for(const event of events)video.removeEventListener(event,check);s.cancelFrameWait=null;resolve(ready)}
          const check=()=>{if(live(s)&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)finish(true)}
          s.cancelFrameWait=()=>finish(false)
          for(const event of events)video.addEventListener(event,check)
          check()
        })
      }
      function draw(s) {
        if (!live(s) || !s.video) {stopSession(s);return}
        const t=s.video.currentTime,limit=Math.min(30,s.data.duration)
        if (t>=limit || Date.now()>=s.data.expiresAt) {terminal(s,'ended');return}
        s.progress.style.width=Math.min(100,t/limit*100)+'%'
        if (s.canvas && s.comments.length) {
          const w=s.host.clientWidth,h=s.host.clientHeight,dpr=Math.min(2,win.devicePixelRatio||1)
          if (s.canvas.width!==Math.round(w*dpr)||s.canvas.height!==Math.round(h*dpr)) {s.canvas.width=Math.round(w*dpr);s.canvas.height=Math.round(h*dpr)}
          const ctx=s.canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h)
          if(s.layoutKey!==w+':'+h) {s.rows=layoutComments(s.comments,ctx,w,h);s.layoutKey=w+':'+h}
          ctx.lineWidth=Math.max(1,h/180);ctx.strokeStyle='#111';ctx.textBaseline='top'
          for (const row of s.rows) {
            const elapsed=t*1000-row.vposMs;if(elapsed<0||elapsed>=row.duration)continue
            ctx.font=row.font;ctx.fillStyle=row.color
            const x=row.position==='naka'?w-(w+row.width)*elapsed/row.duration:(w-row.width)/2
            row.lines.forEach((line,index)=>{const y=row.y+index*row.size*1.2;ctx.strokeText(line,x,y);ctx.fillText(line,x,y)})
          }
        }
        s.frame=win.requestAnimationFrame(()=>draw(s))
      }
      async function start(root,id) {
        timer=null
        if(!eligible(root,id)||hovered!==root)return
        const existing=[...sessions].find(s=>s.root===root&&s.id===id)
        if(existing){reopen(existing);return}
        if(!allowStart)return
        clearRetired(root)
        const host=root.querySelector('.nrn-thumb-anchor-wrap');if(!host)return
        let prefs={volume:1,commentVisible:true,commentOpacity:1,scoreThreshold:-4800,userNgEnabled:true}
        try {if(typeof PreviewData!=='undefined')prefs=PreviewData.preferences(win.localStorage)}catch(_){}
        const s={root,id,host,attempt:++attempt,abort:new AbortController(),rows:[],comments:[],prefs}
        sessions.add(s);counts.started++
        s.layer=doc.createElement('div');s.layer.className='nrn-preview';s.layer.dataset.phase='loading'
        s.surface=doc.createElement('div');s.surface.className='nrn-preview-surface';s.layer.append(s.surface)
        s.status=doc.createElement('span');s.status.className='nrn-preview-status';s.status.hidden=true
        s.spinner=doc.createElement('span');s.spinner.className='nrn-preview-loading';s.spinner.setAttribute('role','status');s.spinner.setAttribute('aria-label','プレビュー再生の読み込み中')
        s.button=doc.createElement('button');s.button.type='button';s.button.className='nrn-preview-mute';s.button.hidden=true
        s.controls=doc.createElement('div');s.controls.className='nrn-preview-controls';s.controls.append(s.button,s.spinner)
        s.progress=doc.createElement('div');s.progress.className='nrn-preview-progress'
        s.track=doc.createElement('div');s.track.className='nrn-preview-track';s.track.append(s.progress)
        s.surface.append(s.status,s.track);host.classList.add('nrn-preview-host');host.append(s.layer,s.controls)
        s.button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation()
          if(!live(s)||!s.video)return
          if(s.pressUntil>Date.now())return
          s.pressUntil=Date.now()+200
          if(audio)audio.setMuted(!muted)
          else {muted=!muted;s.video.muted=muted;updateButton(s)}
          s.video.play().catch(()=>{if(sessions.has(s))terminal(s,'blocked')})
        })
        const check=()=>{if(!eligible(root,id)) {if(hovered===root)hovered=null;stopSession(s)}}
        s.observer=new MutationObserver(records=>{
          if(records.some(r=>!r.target.closest?.('.nrn-preview')))check()
        });s.observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-decoration-video-id','data-nrn-official-muted']})
        s.intersection=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{if(entries.some(e=>!e.isIntersecting)){if(hovered===root)hovered=null;stopSession(s)}}):null
        s.intersection?.observe(root);s.check=setInterval(check,200)
        s.deadline=setTimeout(()=>{if(sessions.has(s))terminal(s,'error')},12000)
        try {
          s.data=await load(id,{signal:s.abort.signal,report})
          if(!live(s))return
          if(!s.data||!Number.isFinite(s.data.duration)||s.data.duration<=0||!Number.isFinite(s.data.expiresAt)||s.data.expiresAt<=Date.now()){terminal(s,'unavailable');return}
          const video=doc.createElement('video');s.video=video;video.muted=muted;video.defaultMuted=true;video.playsInline=true;video.preload='none';video.volume=prefs.volume
          video.onended=()=>terminal(s,'ended');video.onerror=()=>terminal(s,'error')
          s.surface.prepend(video);s.adapter=mountMedia(video,s.data,{onError:()=>terminal(s,'error'),signal:s.abort.signal})
          if(!live(s)){s.adapter?.destroy();s.adapter=null;return}
          try {await video.play()}catch(_){if(live(s))terminal(s,'blocked');return}
          if(!live(s))return
          if(!await waitForFrame(s)||!live(s))return
          clearTimeout(s.deadline);s.deadline=setTimeout(()=>{if(sessions.has(s))terminal(s,'ended')},45000)
          s.layer.dataset.phase='playing';counts.playing++;s.spinner.remove();s.button.hidden=false;updateButton(s)
          if(prefs.commentVisible){s.canvas=doc.createElement('canvas');s.canvas.setAttribute('aria-hidden','true');s.canvas.style.opacity=String(prefs.commentOpacity);s.surface.insertBefore(s.canvas,s.status)}
          draw(s)
          if(!prefs.commentVisible)return
          s.commentAbort=new AbortController();s.commentDeadline=setTimeout(()=>s.commentAbort.abort(),8000)
          fetchComments(s.data,{signal:s.commentAbort.signal,report,scoreThreshold:prefs.scoreThreshold,userNgEnabled:prefs.userNgEnabled}).then(comments=>{
            if(!live(s))return
            s.comments=comments.slice(0,300);s.layoutKey=null
          }).catch(error=>{if(live(s)){counts.commentsUnavailable++;s.button.title=error?.code==='unsupported_ng'?'未対応のコメントNG形式のため映像のみ':'コメントは表示できません'}})
            .finally(()=>clearTimeout(s.commentDeadline))
        } catch(_) {if(live(s))terminal(s,'unavailable')}
      }
      function updateButton(s) {
        const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),path=doc.createElementNS(ns,'path')
        svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true')
        path.setAttribute('fill-rule','evenodd');path.setAttribute('clip-rule','evenodd')
        path.setAttribute('d',muted?"m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm12.3 4.12 2.52-2.52a.96.96 0 0 1 1.36 0l.24.24c.37.38.37.99 0 1.36L20.2 12l2.52 2.52c.37.37.37.98 0 1.36l-.24.24a.96.96 0 0 1-1.36 0L18.6 13.6l-2.52 2.52a.96.96 0 0 1-1.36 0l-.24-.24a.96.96 0 0 1 0-1.36L17 12l-2.52-2.52a.96.96 0 0 1 0-1.36l.24-.24a.96.96 0 0 1 1.36 0z":"m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm11.3-2.05.13-.15.31-.32a.9.9 0 0 1 1.2-.04 11 11 0 0 1 0 16.56.9.9 0 0 1-1.2-.04l-.2-.2-.12-.12a.9.9 0 0 1 .05-1.29 9 9 0 0 0 1.85-2.23l.04-.07.07-.13.02-.03.02-.04a9 9 0 0 0 .97-3.1v-.05q.06-.48.06-.98c0-2.32-.9-4.44-2.38-6.01l-.02-.03-.02-.01-.19-.2-.03-.04-.03-.02-.42-.4-.13-.18h-.01V5.1l-.02-.04a.9.9 0 0 1 .04-.8zm-2.92 2.9q.12-.14.24-.25a.9.9 0 0 1 1.16-.07q.3.23.56.49a6.6 6.6 0 0 1-.6 9.91l-.01.01q-.21.15-.47.15h-.01a1 1 0 0 1-.63-.25l-.2-.2-.12-.12-.14-.2h-.01l-.01-.03a.9.9 0 0 1 .24-1.09 4.38 4.38 0 0 0 0-6.97.87.87 0 0 1-.08-1.3l.04-.05z")
        svg.append(path);s.button.replaceChildren(svg);s.button.setAttribute('aria-label',muted?'プレビューの音声を出す':'プレビューを消音');s.button.setAttribute('aria-pressed',String(!muted))
      }
      function schedule() {
        clearTimeout(timer);timer=null
        if(!hovered||hovered===blockedRoot||!eligible(hovered,hovered.dataset.decorationVideoId)||[...sessions].some(s=>s.root===hovered&&!s.closing))return
        const root=hovered,id=root.dataset.decorationVideoId,delay=Math.max(0,hoverUntil-Date.now(),pointerUntil-Date.now(),scrollUntil-Date.now())
        timer=setTimeout(()=>start(root,id),delay)
      }
      function motion(event) {
        if(event.type==='scroll')scrollUntil=Date.now()+400
        else pointerUntil=Date.now()+50
        if(!hovered||[...sessions].some(s=>s.root===hovered&&!s.closing))return
        schedule()
      }
      function scope(target) {
        const direct=target?.closest?.('[data-nrn-autofill="true"]')
        if(direct)return {root:direct,direct:true}
        const reference=target?.closest?.('[data-nrn-preview-card-ref]')?.dataset.nrnPreviewCardRef
        const root=reference?doc.getElementById(reference):null
        return {root:root&&[...sessions].some(s=>s.root===root&&s.id===root.dataset.decorationVideoId)?root:null,direct:false}
      }
      function over(event) {
        if(!setting?.value||disposed)return
        const target=scope(event.target),root=target.root
        departures(root)
        clearTimeout(timer);timer=null
        if(root&&root===blockedRoot){hovered=null;return}
        if(root!==blockedRoot)blockedRoot=null
        hovered=null
        if(!root||!eligible(root,root.dataset.decorationVideoId))return
        hovered=root;allowStart=target.direct
        hoverUntil=Date.now()+200;pointerUntil=Date.now()+50;schedule()
      }
      function out(event) {
        const root=scope(event.relatedTarget).root
        if(blockedRoot&&root!==blockedRoot)blockedRoot=null
        if(hovered&&root!==hovered){hovered=null;clearTimeout(timer);timer=null}
        departures(root)
      }
      function suspend(){blockedRoot=hovered||[...sessions][0]?.root||blockedRoot;hovered=null;stop()}
      const changed=()=>{if(!setting.value)suspend()}
      doc.addEventListener('mouseover',over);doc.addEventListener('mouseout',out)
      doc.documentElement.addEventListener('mouseleave',out)
      doc.addEventListener('mousemove',motion,{passive:true});doc.addEventListener('scroll',motion,{passive:true,capture:true})
      doc.addEventListener('visibilitychange',suspend);win.addEventListener('pagehide',suspend)
      setting?.on('changed',changed)
      return {snapshot(){return {...counts,active:[...sessions].some(s=>!!s.video),enabled:Boolean(setting?.value),controlRequestsOnly:true}},
        dispose(){if(disposed)return;disposed=true;unsubscribeAudio?.();suspend();doc.removeEventListener('mouseover',over);doc.removeEventListener('mouseout',out);doc.documentElement.removeEventListener('mouseleave',out);doc.removeEventListener('mousemove',motion);doc.removeEventListener('scroll',motion,true);doc.removeEventListener('visibilitychange',suspend);win.removeEventListener('pagehide',suspend);setting?.off('changed',changed)}}
    }
    return {create,css,media}
  })()
