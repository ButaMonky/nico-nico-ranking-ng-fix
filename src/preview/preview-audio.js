  // The official PreviewVideoStore keeps isMuted in memory. Its public preview
  // button is the only write bridge; never inspect React or change native media.
  var PreviewAudio = (function() {
    const documents=new WeakMap()
    const selector='button[aria-label="プレビュー再生のミュート切り替え"]'
    const mutedPath='m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm12.3 4.12 2.52-2.52a.96.96 0 0 1 1.36 0l.24.24c.37.38.37.99 0 1.36L20.2 12l2.52 2.52c.37.37.37.98 0 1.36l-.24.24a.96.96 0 0 1-1.36 0L18.6 13.6l-2.52 2.52a.96.96 0 0 1-1.36 0l-.24-.24a.96.96 0 0 1 0-1.36L17 12l-2.52-2.52a.96.96 0 0 1 0-1.36l.24-.24a.96.96 0 0 1 1.36 0z'
    const soundPath='m6.3 6.28 4.65-5a.8.8 0 0 1 .95-.2 1 1 0 0 1 .54.9v20.03a1 1 0 0 1-.54.91.8.8 0 0 1-.95-.2l-4.64-5H2.76A1.76 1.76 0 0 1 1 15.96V8.04a1.76 1.76 0 0 1 1.76-1.76zm11.3-2.05.13-.15.31-.32a.9.9 0 0 1 1.2-.04 11 11 0 0 1 0 16.56.9.9 0 0 1-1.2-.04l-.2-.2-.12-.12a.9.9 0 0 1 .05-1.29 9 9 0 0 0 1.85-2.23l.04-.07.07-.13.02-.03.02-.04a9 9 0 0 0 .97-3.1v-.05q.06-.48.06-.98c0-2.32-.9-4.44-2.38-6.01l-.02-.03-.02-.01-.19-.2-.03-.04-.03-.02-.42-.4-.13-.18h-.01V5.1l-.02-.04a.9.9 0 0 1 .04-.8zm-2.92 2.9q.12-.14.24-.25a.9.9 0 0 1 1.16-.07q.3.23.56.49a6.6 6.6 0 0 1-.6 9.91l-.01.01q-.21.15-.47.15h-.01a1 1 0 0 1-.63-.25l-.2-.2-.12-.12-.14-.2h-.01l-.01-.03a.9.9 0 0 1 .24-1.09 4.38 4.38 0 0 0 0-6.97.87.87 0 0 1-.08-1.3l.04-.05z'
    function forDocument(doc) {
      if(documents.has(doc))return documents.get(doc)
      const win=doc.defaultView,listeners=new Set(),seen=new WeakMap(),pressUntil=new WeakMap()
      let muted=true,pending=null,inflight=null,nativeAction=null,writing=false,active=false,retryTimer=null
      function nativeButton(button) {
        if(!button?.isConnected||!button.matches?.(selector)||button.disabled||button.closest('[data-nrn-autofill="true"],.nrn-preview'))return false
        const root=button.closest('[data-decoration-video-id]')
        return root?.dataset.anchorArea==='main'&&/^(?:sm|so|nm)\d+$/.test(root.dataset.decorationVideoId)
      }
      function read(button) {
        if(!nativeButton(button))return null
        const paths=button.querySelectorAll('svg path')
        if(paths.length!==1)return null
        const path=paths[0].getAttribute('d')
        return path===mutedPath?true:path===soundPath?false:null
      }
      function publish(value) {
        if(muted===value)return
        muted=value;for(const listener of listeners)listener(muted)
      }
      function sync() {
        if(!active)return
        clearTimeout(retryTimer);retryTimer=null
        const controls=[];let changed=null
        for(const button of doc.querySelectorAll(selector)) {
          const value=read(button);if(value===null)continue
          const control={button,value};controls.push(control)
          if(!seen.has(button)||seen.get(button)!==value)changed=control
          seen.set(button,value)
        }
        if(inflight) {
          const current=controls.find(c=>c.button===inflight.button)
          if(current&&current.value!==inflight.expected)return // await the actual native render; never toggle twice from stale DOM
          inflight=null
        }
        if(pending===null) {
          const current=controls.find(c=>c.button===nativeAction)||changed
          nativeAction=null;if(current)publish(current.value);return
        }
        const current=changed||controls[0]
        if(!current)return // the native control is mounted lazily on hover
        if(current.value===pending) {pending=null;return}
        // Saved Button onPress ignores another activation for 200ms per button.
        // Wait for that real window before forwarding a newer absolute intent.
        const delay=(pressUntil.get(current.button)||0)-Date.now()
        if(delay>0){retryTimer=setTimeout(sync,delay);return}
        inflight={button:current.button,expected:pending}
        pressUntil.set(current.button,Date.now()+200)
        writing=true
        try {current.button.click()} finally {writing=false}
      }
      function clicked(event) {
        const button=event.target.closest?.(selector)
        if(writing||!nativeButton(button))return
        if((pressUntil.get(button)||0)>Date.now())return
        pressUntil.set(button,Date.now()+200)
        // A later native user action supersedes an earlier injected intent.
        pending=null;inflight=null;nativeAction=button;win.queueMicrotask(sync)
      }
      function volume(event) {
        const root=event.target.closest?.('[data-decoration-video-id]')
        if(event.target.tagName==='VIDEO'&&nativeButton(root?.querySelector(selector)))sync()
      }
      const observer=new win.MutationObserver(sync)
      function resume() {
        if(active)return;active=true
        observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['d','aria-label','disabled','data-decoration-video-id','data-anchor-area','data-nrn-autofill']})
        doc.addEventListener('click',clicked,true);doc.addEventListener('volumechange',volume,true);sync()
      }
      function suspend() {
        active=false;inflight=null;clearTimeout(retryTimer);retryTimer=null;observer.disconnect()
        doc.removeEventListener('click',clicked,true);doc.removeEventListener('volumechange',volume,true)
      }
      const shared={
        get muted(){sync();return muted},
        setMuted(value){pending=Boolean(value);publish(pending);sync()},
        subscribe(listener){listeners.add(listener);listener(muted);return ()=>listeners.delete(listener)}
      }
      documents.set(doc,shared)
      // One observer per document survives SPA controller replacement. pagehide
      // releases DOM listeners; pageshow also supports back/forward cache restore.
      win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',resume);resume()
      return shared
    }
    return {forDocument}
  })()
