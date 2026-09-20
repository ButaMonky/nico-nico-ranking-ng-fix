  // Watch-later tooltip settings and transitions follow the supplied official assets.
  // This controller owns only explicitly attached injected-card triggers.
  var CardTooltip = (function() {
    let serial=0;
    const css=`
.nrn-card-tooltip { position:fixed; z-index:auto; isolation:isolate; box-sizing:border-box; width:max-content; max-width:calc(100vw - 16px); padding:var(--spacing-base,8px); font-size:var(--font-sizes-s,12px); font-weight:400; line-height:var(--line-heights-base,1.4); color:var(--colors-tooltip-text-on-background,#252525); background:var(--colors-tooltip-background,#e6e6e6); border-radius:var(--radii-s,4px); pointer-events:none; overflow-wrap:anywhere; animation:nrn-card-tooltip-fade-in 300ms; }
@keyframes nrn-card-tooltip-fade-in { from { opacity:0; } to { opacity:1; } }
`;
    function create(doc) {
      const win=doc.defaultView,records=new Map();
      let active=null,node=null,timer=null,frame=null,disposed=false;
      function usable(r){return !disposed&&r.button.isConnected&&(!r.root||r.root.isConnected)&&(!r.canShow||r.canShow())&&!r.button.closest('[hidden],[inert]')&&r.button.getClientRects().length>0}
      function clearTimer(){win.clearTimeout(timer);timer=null}
      function close(){clearTimer();if(frame!==null)win.cancelAnimationFrame(frame);frame=null;if(node&&active){const ids=(active.button.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==node.id);if(ids.length)active.button.setAttribute('aria-describedby',ids.join(' '));else active.button.removeAttribute('aria-describedby')}node?.remove();node=null;active=null}
      function position(){if(!node||!active)return;if(!usable(active)){close();return}const a=active.button.getBoundingClientRect(),b=node.getBoundingClientRect();let side='top',y=a.top-b.height-8;if(y<8&&win.innerHeight-a.bottom>a.top){side='bottom';y=a.bottom+8}const x=Math.max(8,Math.min(a.left+(a.width-b.width)/2,win.innerWidth-b.width-8));node.style.left=x+'px';node.style.top=Math.max(8,Math.min(y,win.innerHeight-b.height-8))+'px';node.dataset.placement=side}
      function tick(){frame=null;if(!node)return;position();if(node)frame=win.requestAnimationFrame(tick)}
      function open(r){clearTimer();if(!usable(r)||r.dismissed)return;if(active!==r)close();active=r;if(!node){node=doc.createElement('div');node.className='nrn-card-tooltip';node.id='nrn-card-tooltip-'+(++serial);node.setAttribute('role','tooltip');node.dataset.state='open';if(r.root?.id)node.dataset.nrnPreviewCardRef=r.root.id;doc.body.append(node);const ids=(r.button.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);ids.push(node.id);r.button.setAttribute('aria-describedby',ids.join(' '))}node.textContent=String(r.getText());position();if(node&&frame===null)frame=win.requestAnimationFrame(tick)}
      function enter(r,event){if(event.defaultPrevented||event.pointerType==='touch'||!usable(r)||r.dismissed)return;if(active===r)return;const instant=!!node;close();active=r;if(instant)open(r);else timer=win.setTimeout(()=>open(r),200)}
      function leave(r){r.dismissed=false;if(active===r)close()}
      function refresh(){if(!active)return;if(!usable(active)){close();return}if(node){const text=String(active.getText());if(node.textContent!==text)node.textContent=text;position()}}
      function keys(e){if(e.key==='Escape'&&node){active.dismissed=true;e.stopPropagation();close()}}
      function leftWindow(){if(active)active.dismissed=false;close()}
      function hidden(){if(doc.hidden)leftWindow()}
      const observer=new win.MutationObserver(refresh);
      observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','class']});
      doc.addEventListener('keydown',keys,true);doc.addEventListener('scroll',position,true);doc.addEventListener('visibilitychange',hidden);doc.documentElement.addEventListener('mouseleave',leftWindow);win.addEventListener('blur',leftWindow);win.addEventListener('resize',position);
      return {
        attach(button,getText,root,canShow){if(disposed||records.has(button))return;if(typeof root==='function'){canShow=root;root=null}const r={button,getText,root,canShow,dismissed:false};button.removeAttribute('title');const events={pointerover:e=>enter(r,e),pointermove:e=>enter(r,e),pointerleave:()=>leave(r),pointercancel:()=>leave(r),focus:e=>{if(!e.defaultPrevented&&button.matches(':focus-visible')){r.dismissed=false;open(r)}},blur:()=>{if(active===r)close()}};for(const [type,fn]of Object.entries(events))button.addEventListener(type,fn);records.set(button,{r,events})},
        refresh,
        dispose(){if(disposed)return;disposed=true;close();observer.disconnect();for(const [button,{events}]of records)for(const [type,fn]of Object.entries(events))button.removeEventListener(type,fn);records.clear();doc.removeEventListener('keydown',keys,true);doc.removeEventListener('scroll',position,true);doc.removeEventListener('visibilitychange',hidden);doc.documentElement.removeEventListener('mouseleave',leftWindow);win.removeEventListener('blur',leftWindow);win.removeEventListener('resize',position)}
      }
    }
    return {create,css}
  })()
