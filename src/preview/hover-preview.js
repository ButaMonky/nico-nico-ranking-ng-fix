  var HoverPreview = (function() {
    const css = `
.nrn-preview-host { position:relative; }
.nrn-preview { position:absolute; inset:0; z-index:2; overflow:hidden; border-radius:inherit; pointer-events:none; background:#111; color:#fff; }
.nrn-preview video,.nrn-preview canvas { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; }
.nrn-preview-mute { position:absolute; right:6px; bottom:6px; z-index:3; pointer-events:auto; border:1px solid #ddd; border-radius:4px; color:#fff; background:#222c; padding:4px 8px; cursor:pointer; }
.nrn-preview-mute:focus-visible { outline:3px solid #58b4ff; }
.nrn-preview-status { position:absolute; left:4px; top:4px; font:12px/1.4 sans-serif; background:#111c; padding:2px 4px; }
.nrn-preview-progress { position:absolute; bottom:0; left:0; height:3px; background:#168cf6; }
`;
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
      let disposed = false, hovered = null, blockedRoot = null, session = null, timer = null, muted = true, attempt = 0
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
        if (root.closest('[hidden],.nrn-hide,.nrn-is-ng,.nrn-autofill-pending,.nrn-autofill-overflow')) return false
        const r=root.getBoundingClientRect()
        return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<win.innerHeight&&r.left<win.innerWidth
      }
      function live(s) { return session===s&&!s.abort.signal.aborted&&eligible(s.root,s.id) }
      function release(s) {
        s.abort.abort();s.commentAbort?.abort();clearTimeout(s.deadline);clearTimeout(s.commentDeadline);clearInterval(s.check);win.cancelAnimationFrame(s.frame)
        s.observer?.disconnect();s.intersection?.disconnect()
        if (s.video) {
          s.video.onended=s.video.onerror=s.video.ontimeupdate=null
          s.video.pause();s.adapter?.destroy();s.adapter=null
          s.video.removeAttribute('src');s.video.load();s.video.remove();s.video=null
        } else {s.adapter?.destroy();s.adapter=null}
        s.canvas?.remove();s.canvas=null;s.rows=[]
      }
      function stop() {
        clearTimeout(timer);timer=null
        if (session) {
          const s=session;session=null;release(s);s.layer.remove();s.host.classList.remove('nrn-preview-host');counts.stopped++
        }
      }
      function terminal(s, state) {
        if (session!==s) return
        release(s);s.layer.dataset.phase=state;s.button.hidden=true;s.progress.hidden=true
        s.status.textContent={blocked:'再生が許可されませんでした',error:'プレビューを再生できません',unavailable:'プレビューは利用できません',ended:'プレビュー終了'}[state] || ''
        if (Object.hasOwn(counts,state)) counts[state]++
      }
      function draw(s) {
        if (!live(s) || !s.video) {stop();return}
        const t=s.video.currentTime,limit=Math.min(30,s.data.duration)
        if (t>=limit || Date.now()>=s.data.expiresAt) {terminal(s,'ended');return}
        s.progress.style.width=Math.min(100,t/limit*100)+'%'
        if (s.canvas && s.rows.length) {
          const w=s.host.clientWidth,h=s.host.clientHeight,dpr=Math.min(2,win.devicePixelRatio||1)
          if (s.canvas.width!==Math.round(w*dpr)||s.canvas.height!==Math.round(h*dpr)) {s.canvas.width=Math.round(w*dpr);s.canvas.height=Math.round(h*dpr)}
          const ctx=s.canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h)
          const size=Math.max(12,Math.min(22,h/5));ctx.font='bold '+size+'px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#111';ctx.fillStyle='#fff'
          for (const row of s.rows) {
            const elapsed=t*1000-row.vposMs;if(elapsed<0||elapsed>=4000)continue
            const x=w-(w+ctx.measureText(row.text).width)*elapsed/4000,y=(row.lane+1)*size
            ctx.strokeText(row.text,x,y);ctx.fillText(row.text,x,y)
          }
        }
        s.frame=win.requestAnimationFrame(()=>draw(s))
      }
      async function start(root,id) {
        timer=null
        if(!eligible(root,id)||hovered!==root)return
        stop()
        const host=root.querySelector('.nrn-thumb-anchor-wrap');if(!host)return
        const s={root,id,host,attempt:++attempt,abort:new AbortController(),rows:[]}
        session=s;counts.started++
        s.layer=doc.createElement('div');s.layer.className='nrn-preview';s.layer.dataset.phase='loading'
        s.status=doc.createElement('span');s.status.className='nrn-preview-status';s.status.textContent='プレビューを読み込み中'
        s.button=doc.createElement('button');s.button.type='button';s.button.className='nrn-preview-mute';s.button.hidden=true
        s.progress=doc.createElement('div');s.progress.className='nrn-preview-progress'
        s.layer.append(s.status,s.button,s.progress);host.classList.add('nrn-preview-host');host.append(s.layer)
        s.button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation()
          if(!live(s)||!s.video)return
          muted=!muted;s.video.muted=muted;updateButton(s)
          s.video.play().catch(()=>{if(session===s)terminal(s,'blocked')})
        })
        const check=()=>{if(!eligible(root,id)) {hovered=null;stop()}}
        s.observer=new MutationObserver(records=>{
          if(records.some(r=>!r.target.closest?.('.nrn-preview')))check()
        });s.observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-decoration-video-id']})
        s.intersection=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{if(entries.some(e=>!e.isIntersecting)){hovered=null;stop()}}):null
        s.intersection?.observe(root);s.check=setInterval(check,200)
        s.deadline=setTimeout(()=>{if(session===s)terminal(s,'error')},12000)
        try {
          s.data=await load(id,{signal:s.abort.signal,report})
          if(!live(s))return
          if(!s.data||!Number.isFinite(s.data.duration)||s.data.duration<=0||!Number.isFinite(s.data.expiresAt)||s.data.expiresAt<=Date.now()){terminal(s,'unavailable');return}
          const video=doc.createElement('video');s.video=video;video.muted=muted;video.defaultMuted=true;video.playsInline=true;video.preload='none';video.volume=.3
          video.onended=()=>terminal(s,'ended');video.onerror=()=>terminal(s,'error')
          s.layer.prepend(video);s.adapter=mountMedia(video,s.data,{onError:()=>terminal(s,'error'),signal:s.abort.signal})
          if(!live(s)){s.adapter?.destroy();s.adapter=null;return}
          try {await video.play()}catch(_){if(live(s))terminal(s,'blocked');return}
          if(!live(s))return
          clearTimeout(s.deadline);s.deadline=setTimeout(()=>{if(session===s)terminal(s,'ended')},45000)
          s.layer.dataset.phase='playing';counts.playing++;s.status.textContent='';s.button.hidden=false;updateButton(s)
          s.canvas=doc.createElement('canvas');s.canvas.setAttribute('aria-hidden','true');s.layer.insertBefore(s.canvas,s.status)
          draw(s)
          s.commentAbort=new AbortController();s.commentDeadline=setTimeout(()=>s.commentAbort.abort(),8000)
          fetchComments(s.data,{signal:s.commentAbort.signal,report}).then(comments=>{
            if(!live(s))return
            // Four lanes, with at most one four-second comment per lane.
            // Dense comments are dropped instead of overlapping or growing DOM.
            const ends=[-1,-1,-1,-1]
            for(const row of comments.slice(0,300)) {
              const lane=ends.findIndex(end=>end<=row.vposMs);if(lane<0)continue
              ends[lane]=row.vposMs+4000;s.rows.push({...row,lane})
            }
          }).catch(error=>{if(live(s)){counts.commentsUnavailable++;s.status.textContent=error?.code==='unsupported_ng'?'コメントNGに未対応のため映像のみ':'コメントは表示できません'}})
            .finally(()=>clearTimeout(s.commentDeadline))
        } catch(_) {if(live(s))terminal(s,'unavailable')}
      }
      function updateButton(s) {s.button.textContent=muted?'音声ON':'消音';s.button.setAttribute('aria-label',muted?'プレビューの音声を出す':'プレビューを消音');s.button.setAttribute('aria-pressed',String(!muted))}
      function over(event) {
        if(!setting?.value||disposed)return
        const root=event.target.closest?.('[data-nrn-autofill="true"]')
        if(root&&root===blockedRoot)return
        if(root!==blockedRoot)blockedRoot=null
        if(root===hovered)return
        hovered=null;stop()
        if(!root||!eligible(root,root.dataset.decorationVideoId))return
        hovered=root;const id=root.dataset.decorationVideoId
        timer=setTimeout(()=>start(root,id),200)
      }
      function out(event) {
        if(blockedRoot&&!blockedRoot.contains(event.relatedTarget))blockedRoot=null
        if(hovered&&!hovered.contains(event.relatedTarget)){hovered=null;stop()}
      }
      function suspend(){blockedRoot=hovered||session?.root||blockedRoot;hovered=null;stop()}
      const changed=()=>{if(!setting.value)suspend()}
      doc.addEventListener('mouseover',over);doc.addEventListener('mouseout',out)
      doc.addEventListener('visibilitychange',suspend);win.addEventListener('pagehide',suspend)
      setting?.on('changed',changed)
      return {snapshot(){return {...counts,active:Boolean(session?.video),enabled:Boolean(setting?.value),controlRequestsOnly:true}},
        dispose(){if(disposed)return;disposed=true;suspend();doc.removeEventListener('mouseover',over);doc.removeEventListener('mouseout',out);doc.removeEventListener('visibilitychange',suspend);win.removeEventListener('pagehide',suspend);setting?.off('changed',changed)}}
    }
    return {create,css,media}
  })()
