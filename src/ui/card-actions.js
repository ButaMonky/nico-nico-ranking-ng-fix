  // Additional cards own these controls; native React cards are never cloned or rebound.
  var CardActions = (function() {
    const paths = {
      later:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18.06a8.06 8.06 0 1 1 0-16.12 8.06 8.06 0 0 1 0 16.12m3.34-3.52-4.27-3.17a.5.5 0 0 1-.2-.4V6.36c0-.26.22-.48.48-.48h1.3c.26 0 .48.22.48.48v5.72l3.54 2.65c.22.16.26.46.1.68l-.76 1.04a.5.5 0 0 1-.67.1',
      television:'M20.21 5.81H14.4l2.38-2.24a.83.83 0 0 0 .05-1.17.8.8 0 0 0-1.16-.04L12 5.81 8.33 2.36a.8.8 0 0 0-1.16.04c-.3.34-.28.86.05 1.17L9.6 5.8H3.8C2.8 5.81 2 6.61 2 7.6v10.7c0 1 .8 1.8 1.79 1.8h2.26l1.35 1.56c.23.26.6.26.82 0l1.35-1.57h4.86l1.35 1.57c.23.26.6.26.82 0l1.35-1.57h2.26c1 0 1.79-.8 1.79-1.78V7.6c0-.99-.8-1.79-1.79-1.79',
      more:'M16 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0m-6 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0m-6 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0',
      x:'M13.48 10.62 20.03 3h-1.55l-5.7 6.61L8.25 3H3l6.87 10L3 21h1.55l6.01-6.98 4.8 6.98h5.24zm-2.13 2.47-.7-1-5.54-7.92H7.5l4.47 6.4.7 1 5.8 8.3H16.1z',
      close:'M8 6.34A1.17 1.17 0 1 0 6.33 8l3.85 3.85-3.85 3.85A1.17 1.17 0 1 0 8 17.34l3.85-3.85 3.85 3.85a1.17 1.17 0 0 0 1.65-1.65l-3.85-3.85 3.85-3.85a1.17 1.17 0 0 0-1.65-1.65l-3.85 3.85z',
      share:'m14.26 6.24-.02-.36a2.88 2.88 0 1 1 1.08 2.24l-7.58 4.24.02.45 7.35 3.24A2.87 2.87 0 0 1 20 18.12a2.88 2.88 0 1 1-5.76-.09L6.9 14.79A2.87 2.87 0 0 1 2 12.72a2.88 2.88 0 0 1 4.68-2.25z',
      mute:'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m5.64-5.68a6.55 6.55 0 0 0-8.96-8.96zm-2.32 2.32L6.36 8.67a6.55 6.55 0 0 0 8.96 8.96',
      ad:'M8.6 2.68c.65-.63 2.06-.36 3.78.58l-.2 1.17c-.9-.43-1.6-.53-1.92-.2-.76.75.77 3.5 3.42 6.13 2.64 2.64 5.4 4.16 6.15 3.4.33-.3.23-1-.2-1.9l1.17-.2c.94 1.7 1.21 3.12.57 3.75q-.22.21-.51.28L7.7 19.23l-.66 2.45a.4.4 0 0 1-.11.2c-.45.44-1.88-.27-3.2-1.6-1.33-1.32-2.04-2.74-1.6-3.18a.4.4 0 0 1 .2-.1l2.46-.67L8.32 3.2q.08-.3.28-.52m12.6 5.83c.32-.08.66.1.74.43l.04.13a.6.6 0 0 1-.43.75l-4.27 1.14a.6.6 0 0 1-.75-.43l-.04-.13a.6.6 0 0 1 .44-.75zm-2.7-3.93a.6.6 0 0 1 .87 0l.1.1a.6.6 0 0 1 0 .86l-3.6 3.6a.6.6 0 0 1-.87 0l-.1-.1a.6.6 0 0 1 0-.86zM14.84 2l.11.02.13.04a.6.6 0 0 1 .43.74l-1.14 4.26a.6.6 0 0 1-.75.43l-.13-.04a.6.6 0 0 1-.43-.74l1.14-4.26a.6.6 0 0 1 .75-.43z'
    }
    const css = `
.nrn-card-actions-host { position:relative; }
.nrn-card-actions { position:absolute; top:4px; right:4px; display:flex; flex-direction:column; gap:4px; z-index:4; visibility:hidden; opacity:0; pointer-events:none; transition:opacity var(--durations-slow,.5s),visibility 0s var(--durations-slow,.5s); }
[data-nrn-card-hover="true"] .nrn-card-actions,.nrn-card-actions[data-open] { visibility:visible; opacity:1; pointer-events:auto; transition:opacity var(--durations-slow,.5s); }
.nrn-card-actions button { box-sizing:border-box; display:flex; align-items:center; justify-content:center; width:28px; height:28px; padding:4px; border:0; border-radius:var(--radii-s,4px); color:#fff; background:var(--colors-layer-surface-overlay-black,#000c); cursor:pointer; }
.nrn-card-actions button:hover { background:var(--colors-layer-surface-high-em-black,#000); }
.nrn-card-actions button:disabled { cursor:wait; opacity:.6; }
.nrn-card-actions svg { width:20px; height:20px; fill:currentColor; pointer-events:none; }
.nrn-card-actions-host .nrn-preview-mute,.nrn-card-actions-host .nrn-preview-loading { top:68px; }
.nrn-card-actions button:focus-visible,.nrn-card-menu :focus-visible,.nrn-card-dialog :focus-visible { outline:2px solid var(--colors-action-primary-azure,#0080ff); outline-offset:1px; }
.nrn-card-menu,.nrn-card-dialog { box-sizing:border-box; color:var(--colors-action-text-on-base,#191919); background:var(--colors-layer-surface-high-em,#fff); font:var(--font-sizes-base,14px)/var(--line-heights-base,1.4) var(--fonts-default,sans-serif); border-radius:var(--radii-m,8px); box-shadow:var(--shadows-base,0 0 8px #0003); }
.nrn-card-menu { position:fixed; z-index:1100; width:max-content; min-width:220px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:auto; padding:8px; }
.nrn-card-menu > button,.nrn-card-menu > a { box-sizing:border-box; display:flex; gap:4px; align-items:center; width:100%; min-height:40px; border:0; padding:0 8px; border-radius:4px; color:inherit; background:transparent; text-decoration:none; font:inherit; cursor:pointer; text-align:left; }
.nrn-card-menu > :hover,.nrn-card-menu > :focus-visible { background:var(--colors-action-base-hover,#0000001a); }
.nrn-card-menu > :disabled { opacity:.5; cursor:default; }
.nrn-card-menu svg { width:24px; height:24px; flex-shrink:0; fill:currentColor; pointer-events:none; }
.nrn-card-modal { position:fixed; inset:0; z-index:var(--z-index-modal,1400); display:flex; align-items:center; justify-content:center; }
.nrn-card-modal::before { content:""; position:absolute; inset:0; z-index:-1; background:var(--colors-layer-surface-overlay,#0009); animation:nrn-card-fade-in var(--durations-fast,.1s); }
.nrn-card-modal[data-state="closed"] { pointer-events:none; }
.nrn-card-modal[data-state="closed"]::before { animation:nrn-card-fade-out var(--durations-fast,.1s) forwards; }
.nrn-card-modal[data-state="closed"] .nrn-card-dialog { animation:nrn-card-slide-out var(--durations-medium,.3s) forwards; }
@keyframes nrn-card-fade-in { from {opacity:0} to {opacity:1} }
@keyframes nrn-card-fade-out { from {opacity:1} to {opacity:0} }
@keyframes nrn-card-slide-in { from {opacity:0;transform:translateY(48px)} to {opacity:1;transform:translateY(0)} }
@keyframes nrn-card-slide-out { from {opacity:1;transform:translateY(0)} to {opacity:0;transform:translateY(48px)} }
.nrn-card-dialog { animation:nrn-card-slide-in var(--durations-medium,.3s); display:flex; flex-direction:column; align-items:center; width:fit-content; max-width:100%; max-height:100vh; overflow:auto; }
.nrn-card-dialog header { box-sizing:border-box; width:100%; padding:16px; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--colors-border-high-em,#ccc); }
.nrn-card-dialog h2 { margin:0; font:inherit; font-weight:bold; }
.nrn-card-dialog button { display:inline-flex; align-items:center; justify-content:center; gap:4px; flex-shrink:0; padding:0 16px; height:40px; border:0; border-radius:var(--radii-full,9999px); background:var(--colors-action-primary,#191919); color:var(--colors-action-text-on-primary,#f2f2f2); fill:currentColor; font:inherit; font-weight:bold; white-space:nowrap; cursor:pointer; }
.nrn-card-dialog button:hover { background:var(--colors-action-primary-hover,#333); }
.nrn-card-dialog button > svg { width:24px; height:24px; flex-shrink:0; pointer-events:none; }
.nrn-card-dialog header button { padding:0; width:24px; height:24px; border-radius:0; background:transparent; color:inherit; }
.nrn-card-share { box-sizing:border-box; display:flex; flex-direction:column; gap:16px; padding:16px; max-width:100%; overflow:auto; }
.nrn-card-share > div { display:flex; align-items:center; gap:16px; }
.nrn-card-share > div:last-child { justify-content:space-between; }
.nrn-card-dialog input { box-sizing:border-box; min-width:480px; padding:16px; border:1px solid var(--colors-border-base,#ccc); border-radius:8px; color:inherit; background:inherit; font:inherit; }
.nrn-card-dialog > p { margin:16px; }
.nrn-card-dialog > a { margin:0 16px 16px; }
.nrn-card-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:1400; max-width:calc(100vw - 32px); padding:12px 16px; border-radius:8px; background:#222; color:#fff; font:14px/1.5 sans-serif; pointer-events:none; }
[data-nrn-official-muted="true"] { position:relative; }
[data-nrn-official-muted="true"] > :not(.nrn-official-mute-mask),[data-nrn-official-muted="true"] > :not(.nrn-official-mute-mask) * { visibility:hidden !important; }
 .nrn-official-mute-mask { position:absolute; inset:0; z-index:20; display:flex; flex-direction:column; align-items:stretch; box-sizing:border-box; color:var(--colors-text-on-layer-low-em,#999); font-weight:bold; text-align:left; cursor:default; }
.nrn-muted-thumbnail { position:relative; width:100%; aspect-ratio:16/9; flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:var(--radii-m,8px); background:var(--colors-layer-surface-low-em,#e6e6e6); }
.nrn-muted-thumbnail > svg { width:calc(100% / 2.25); height:calc(100% / 2.25); fill:var(--colors-icon-base-disabled,#ccc); }
.nrn-official-mute-mask > p { margin:4px 0 8px; font-size:var(--font-sizes-l,16px); line-height:var(--line-heights-base,1.5); }
@container (max-width:320px) { .nrn-official-mute-mask > p { font-size:var(--font-sizes-base,14px); } }
[data-nrn-result-layout="list"] > .nrn-official-mute-mask { flex-direction:row; gap:16px; }
[data-nrn-result-layout="list"] > .nrn-official-mute-mask .nrn-muted-thumbnail { width:320px; align-self:flex-start; }

`;
    function validPlaylist(value) {
      if(typeof value!=='string'||value.length>20000||!value.length||!/^[A-Za-z0-9+/_=-]+$/.test(value))return null
      try {
        const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))
        if(decoded?.type!=='search'||!decoded.context||!Number.isInteger(decoded.context.page)||decoded.context.page<1)return null
        return value
      }catch(_){return null}
    }
    let rootSerial=0
    function create(page, config, options={}) {
      const doc=page.doc,win=doc.defaultView,source=page._sourceUrl||doc.location.href,data=options.data||CardActionData
      const popup=options.popup||((url,target,features)=>win.open(url,target,features)),copy=options.copy||(text=>win.navigator.clipboard.writeText(text))
      const records=new Map(),pending=new Set(),busy=new Set(),ownerStates=new Map(),closingDialogs=new Map()
      const tips=typeof CardTooltip!=='undefined'?CardTooltip.create(doc):null
      let disposed=false,menu=null,modal=null,toast=null,toastTimer=null,leaveTimer=null,hoverTimer=null,hoverRecord=null,serial=0
      const routeLive=()=>!disposed&&!page._disposed&&doc.location.href===source
      const live=r=>routeLive()&&r.root.isConnected&&r.root.dataset.decorationVideoId===r.id&&!r.root.closest('[hidden],.nrn-hide,.nrn-is-ng,.nrn-autofill-pending,.nrn-autofill-overflow')
      const operable=r=>live(r)&&r.root.dataset.nrnOfficialMuted!=='true'
      const ownerKey=owner=>owner?.type+':'+owner?.id
      function element(tag,cls,text){const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
      function icon(kind){const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),path=doc.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[kind]);if(!['x','close'].includes(kind)){path.setAttribute('fill-rule','evenodd');path.setAttribute('clip-rule','evenodd');}svg.append(path);return svg}
      function button(label,kind,fn){const b=element('button');b.type='button';b.setAttribute('aria-label',label);if(kind)b.append(icon(kind));else b.textContent=label;b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();fn(event)});return b}
      function notify(text){if(!routeLive())return;clearTimeout(toastTimer);toast?.remove();toast=element('div','nrn-card-toast',text);toast.setAttribute('role','status');doc.body.append(toast);toastTimer=setTimeout(()=>{toast?.remove();toast=null},5000)}
      const triggerFor=r=>r.maskMore||r.more
      const rackFor=r=>r.maskRack||r.rack
      function focusTrigger(r){const trigger=triggerFor(r),rack=rackFor(r);if(!live(r)||!trigger)return;rack.setAttribute('data-open','');trigger.focus();rack.removeAttribute('data-open')}
      function closeMenu(focus=false){clearTimeout(leaveTimer);leaveTimer=null;if(!menu)return;const m=menu;menu=null;m.abort?.abort();m.node.remove();m.trigger.setAttribute('aria-expanded','false');m.rack.removeAttribute('data-open');if(focus)focusTrigger(m.r)}
      function closeModal(focus=true,animate=true){if(!modal)return;const m=modal;modal=null;if(doc.body.style.overflow==='hidden'){if(m.overflow)doc.body.style.setProperty('overflow',m.overflow,m.overflowPriority);else doc.body.style.removeProperty('overflow')}if(animate){m.node.dataset.state='closed';m.node.setAttribute('aria-hidden','true');m.node.inert=true;const duration=win.getComputedStyle(m.box).animationDuration.split(',')[0].trim(),ms=parseFloat(duration)*(duration.endsWith('ms')?1:1000);const timer=setTimeout(()=>{m.node.remove();closingDialogs.delete(m.node)},Number.isFinite(ms)?ms:300);closingDialogs.set(m.node,timer)}else m.node.remove();if(focus){if(m.returnFocus?.isConnected)m.returnFocus.focus();else focusTrigger(m.r)}}
      function dialog(r,title,preserveMenu=false){const returnFocus=doc.activeElement;if(!preserveMenu)closeMenu();closeModal(false,false);const overlay=element('div','nrn-card-modal'),box=element('div','nrn-card-dialog'),header=element('header'),heading=element('h2',null,title);overlay.dataset.nrnPreviewCardRef=r.root.id;heading.id='nrn-card-dialog-'+(++serial);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby',heading.id);header.append(heading,button('閉じる','close',()=>closeModal()));box.append(header);overlay.append(box);overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});doc.body.append(overlay);modal={r,node:overlay,box,returnFocus,overflow:doc.body.style.getPropertyValue('overflow'),overflowPriority:doc.body.style.getPropertyPriority('overflow')};doc.body.style.overflow='hidden';header.querySelector('button').focus();return box}
      function failure(error,r,kind){if(!live(r))return;if(error?.code==='unauthorized'){const box=dialog(r,'ログインが必要です');box.append(element('p',null,'ログインしてから、もう一度お試しください。'));const link=element('a',null,'ログイン');link.href='https://www.nicovideo.jp/login?sec='+ (kind==='later'?'pc_video_ellipsismenu_watchlater':'pc_video_ellipsismenu_usermute');box.append(link);return}
        notify(error?.code==='limit'?'登録数が上限に達しています':error?.code==='aborted'?'処理結果を確認できませんでした。時間をおいて状態をご確認ください。':error?.code==='maintenance'?'メンテナンス中です。時間をおいてお試しください。':'操作に失敗しました。時間をおいてお試しください。')}
      async function request(fn){const abort=new AbortController();pending.add(abort);const deadline=setTimeout(()=>abort.abort(),10000);try{return await fn(abort.signal)}finally{clearTimeout(deadline);pending.delete(abort)}}
      async function later(r){if(!operable(r)||busy.has('later:'+r.id))return;busy.add('later:'+r.id);for(const a of records.values())if(a.id===r.id&&a.later)a.later.disabled=true;tips?.refresh()
        try{const result=await request(signal=>data.watchLater(r.id,{signal}));if(live(r))notify(result.alreadyAdded?'すでに「あとで見る」に追加されています':'「あとで見る」に追加しました')}catch(e){failure(e,r,'later')}finally{busy.delete('later:'+r.id);for(const a of records.values())if(a.id===r.id&&a.later)a.later.disabled=false;tips?.refresh()}}
      function coverContent(r){if(!r.mask)return;for(const child of r.root.children){if(child===r.mask)continue;if(!r.inert.has(child))r.inert.set(child,child.inert);if(!child.inert)child.inert=true}}
      function clearMask(r){r.mask?.remove();r.mask=null;r.maskMore=null;r.maskRack=null;for(const [child,inert]of r.inert||[])child.inert=inert;r.inert=new Map();r.root.removeAttribute('data-nrn-official-muted')}
      function moreButton(r){const b=button('この動画に対するメニューを開く','more',event=>showMenu(r,event.detail===0));b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');return b}
      function mask(r,muted){if(r.root.dataset.decorationVideoId!==r.id)return;clearMask(r);if(!muted)return;r.root.dataset.nrnOfficialMuted='true';r.mask=element('div','nrn-official-mute-mask');const thumb=element('div','nrn-muted-thumbnail');thumb.append(icon('television'));r.maskRack=element('div','nrn-card-actions');r.maskMore=moreButton(r);r.maskRack.append(r.maskMore);thumb.append(r.maskRack);r.mask.append(thumb,element('p',null,'この動画は非表示に設定されています'));r.root.append(r.mask);coverContent(r)}
      async function setMute(r,muted){const key='owner:'+ownerKey(r.owner);if(!live(r)||!r.owner||busy.has(key))return;busy.add(key);closeMenu();const b=r.mask?.querySelector('button');if(b)b.disabled=true
        try{await request(signal=>data.setOwnerMuted(r.owner,muted,{signal}));if(!routeLive())return;ownerStates.set(ownerKey(r.owner),muted);for(const a of records.values())if(ownerKey(a.owner)===ownerKey(r.owner)&&a.root.dataset.decorationVideoId===a.id){a.muted=muted;mask(a,muted)}notify(muted?'この投稿者の動画を非表示にしました':'この投稿者の動画を表示します')}catch(e){failure(e,r,'owner')}finally{busy.delete(key);if(b)b.disabled=false}}
      function openPopup(url,target,features){try{const opened=popup(url,target,features);if(opened===null)notify('ポップアップを開けませんでした。ブラウザの設定をご確認ください。')}catch(_){notify('ポップアップを開けませんでした。ブラウザの設定をご確認ください。')}}
      function share(r){const box=dialog(r,'共有',true),url='https://www.nicovideo.jp/watch/'+r.id,body=element('div','nrn-card-share'),social=element('div'),links=element('div');const x=button('X で共有','x',()=>{const message=r.title+'\n'+url+'?ref=pc_video_x\n\n#'+r.id+'\n#ニコニコ動画';openPopup('https://x.com/intent/tweet?text='+encodeURIComponent(message),'_blank','width=800,height=500,top='+(win.screen.height/2-250)+',left='+(win.screen.width/2-400))});x.append(doc.createTextNode('共有'));social.append(x);const input=element('input');input.type='text';input.readOnly=true;input.value=url;input.setAttribute('aria-label','リンク URL');links.append(input,button('リンクをコピー',null,async()=>{try{await copy(url);if(live(r))notify('URL をコピーしました')}catch(_){if(!modal?.box.contains(input))return;input.focus();input.select();notify('コピーできませんでした。URLを選択してコピーしてください。')}}));body.append(social,links);box.append(body)}
      function position(){if(!menu)return;const m=menu;if(!live(m.r)){closeMenu();return}const a=m.trigger.getBoundingClientRect(),b=m.node.getBoundingClientRect();if(a.bottom<0||a.top>win.innerHeight){closeMenu();return}const x=Math.max(8,Math.min(a.right-b.width,win.innerWidth-b.width-8));let y=a.bottom+8;if(y+b.height>win.innerHeight-8)y=Math.max(8,a.top-b.height-8);m.node.style.left=x+'px';m.node.style.top=y+'px'}
      function showMenu(r,keyboard=false){if(!live(r))return;if(menu?.r===r){closeMenu(true);return}closeModal(false);closeMenu();const node=element('div','nrn-card-menu');node.dataset.nrnPreviewCardRef=r.root.id;node.setAttribute('role','menu');node.id='nrn-card-menu-'+(++serial);const trigger=triggerFor(r),rack=rackFor(r);trigger.setAttribute('aria-controls',node.id);trigger.setAttribute('aria-expanded','true');rack.setAttribute('data-open','');doc.body.append(node);const m={r,node,trigger,rack};menu=m
        const item=(label,kind,fn)=>{const b=button(label,kind,fn);b.setAttribute('role','menuitem');b.tabIndex=-1;if(kind)b.append(doc.createTextNode(label));node.append(b);return b}
        if(!r.muted&&r.playlist){const link=element('a',null,'ここから連続再生');link.setAttribute('role','menuitem');link.tabIndex=-1;const url=new URL('https://www.nicovideo.jp/watch/'+r.id);url.searchParams.set('continuous','1');url.searchParams.set('playlist',r.playlist);link.href=url.href;if(config.openNewWindow?.value){link.target='_blank';link.rel='noopener noreferrer'}link.addEventListener('click',e=>{e.stopPropagation()});node.append(link)}
        if(!r.muted){item('共有','share',()=>share(r));item('ニコニ広告する','ad',()=>{openPopup('https://nicoad.nicovideo.jp/video/publish/'+r.id+'?frontend_id=6&frontend_version=0','','width=428,height=600,toolbar=no,scrollbars=1')})}
        if(r.owner){const type=r.owner.type==='channel'?'チャンネル':'ユーザー',b=item('確認中…','mute',()=>setMute(r,!r.muted));b.disabled=true;const abort=new AbortController();m.abort=abort;pending.add(abort);const deadline=setTimeout(()=>abort.abort(),10000)
          data.getOwnerMuted(r.owner,{signal:abort.signal}).then(result=>{if(menu!==m||!live(r))return;r.muted=result.isMuted;const label='この'+type+'の動画を'+(r.muted?'表示':'非表示');b.replaceChildren(icon('mute'),doc.createTextNode(label));b.setAttribute('aria-label',label);b.disabled=false;if(keyboard&&doc.activeElement===node)b.focus();position()}).catch(e=>{if(menu!==m||!live(r))return;b.replaceChildren(icon('mute'),doc.createTextNode('非表示設定を確認できません'));b.setAttribute('aria-label','非表示設定を確認できません');if(!modal)failure(e,r,'owner')}).finally(()=>{clearTimeout(deadline);pending.delete(abort)})}
        position();if(keyboard){node.tabIndex=-1;(node.querySelector('[role="menuitem"]:not(:disabled)')||node).focus()}
      }
      function ensure(r){if(!operable(r)||r.rack)return;r.host.classList.add('nrn-card-actions-host');r.rack=element('div','nrn-card-actions');r.later=button('あとで見る','later',()=>later(r));tips?.attach(r.later,()=>busy.has('later:'+r.id)?'更新中':'あとで見る',r.root,()=>operable(r)&&!modal);r.later.disabled=busy.has('later:'+r.id);r.more=moreButton(r);r.rack.append(r.later,r.more);r.host.append(r.rack)}
      function hoverScope(target){return menu&&(menu.r.root.contains(target)||menu.node.contains(target)||(modal?.r===menu.r&&modal.node.contains(target)))}
      function moved(e){if(!menu)return;clearTimeout(leaveTimer);leaveTimer=null;if(hoverScope(e.target))return;const m=menu;leaveTimer=setTimeout(()=>{if(menu===m)closeMenu()},200)}
      function setHover(r){if(hoverRecord&&hoverRecord!==r)hoverRecord.root.removeAttribute('data-nrn-card-hover');hoverRecord=r;if(r&&live(r)){ensure(r);r.root.dataset.nrnCardHover='true'}}
      function hoverLater(r){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>setHover(r),200)}
      function leftWindow(){hoverLater(null);if(!menu)return;const m=menu;clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(menu===m)closeMenu()},200)}
      function entered(e){moved(e);const portal=e.target.closest?.('[data-nrn-preview-card-ref]'),root=e.target.closest?.('[data-nrn-autofill="true"]')||(portal&&doc.getElementById(portal.dataset.nrnPreviewCardRef)),r=records.get(root)||null;if(r)ensure(r);if(e.type==='focusin'&&r){clearTimeout(hoverTimer);setHover(r)}else if(e.type==='mouseover')hoverLater(r)}
      function outside(e){if(modal?.node.contains(e.target))return;if(menu&&!menu.node.contains(e.target)&&!menu.trigger.contains(e.target))closeMenu()}
      function keys(e){if(modal){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeModal()}else if(e.key==='Tab'){const items=[...modal.box.querySelectorAll('button,a[href],input')].filter(x=>!x.disabled);const i=items.indexOf(doc.activeElement);if((e.shiftKey&&i<=0)||(!e.shiftKey&&i===items.length-1)){e.preventDefault();items[e.shiftKey?items.length-1:0]?.focus()}}return}
        if(!menu)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);return}if(e.key==='Tab'){closeMenu();return}const items=[...menu.node.querySelectorAll('[role="menuitem"]:not(:disabled)')],i=items.indexOf(doc.activeElement);let next;if(e.key==='ArrowDown')next=(i+1)%items.length;else if(e.key==='ArrowUp')next=(i-1+items.length)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;if(next!==undefined){e.preventDefault();items[next]?.focus()}}
      // ResultLayout reinserts the same nodes on the following animation frame.
      // Keep disconnected registrations for this route; dispose owns final cleanup.
      const observer=new MutationObserver(()=>{if(menu&&!live(menu.r))closeMenu();if(modal&&!live(modal.r))closeModal(false,false);for(const [root,r]of records){if(root.dataset.decorationVideoId!==r.id){r.rack?.remove();clearMask(r);r.host.classList.remove('nrn-card-actions-host');root.removeAttribute('tabindex');root.removeAttribute('data-nrn-card-hover');if(r.ownRootId===root.id)root.removeAttribute('id');records.delete(root)}else coverContent(r)}})
      observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','data-decoration-video-id']})
      doc.addEventListener('mouseover',entered);doc.documentElement.addEventListener('mouseleave',leftWindow);doc.addEventListener('focusin',entered);doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',keys);doc.addEventListener('scroll',position,true);win.addEventListener('resize',position)
      return {attach(root,item){if(disposed||records.has(root)||root.dataset.nrnAutofill!=='true'||!/^((sm|so|nm)[1-9]\d*)$/.test(item.id))return;const host=root.querySelector('.nrn-thumb-anchor-wrap');if(!host)return;const r={root,host,id:item.id,title:typeof item.title==='string'?item.title:'',owner:OwnerEvidence.normalize(item.owner),playlist:validPlaylist(item.__nrnPlaylist),muted:item.isMuted===true,inert:new Map()};if(r.owner&&ownerStates.has(ownerKey(r.owner)))r.muted=ownerStates.get(ownerKey(r.owner));if(!root.id){let id;do{id='nrn-action-card-'+(++rootSerial)}while(doc.getElementById(id));root.id=id;r.ownRootId=id}records.set(root,r);root.tabIndex=0;if(r.muted&&r.owner)mask(r,true)},
        dispose(){if(disposed)return;disposed=true;clearTimeout(hoverTimer);tips?.dispose();closeMenu();closeModal(false,false);for(const [node,timer]of closingDialogs){clearTimeout(timer);node.remove()}closingDialogs.clear();clearTimeout(toastTimer);toast?.remove();for(const a of pending)a.abort();pending.clear();observer.disconnect();for(const r of records.values()){r.rack?.remove();clearMask(r);r.host.classList.remove('nrn-card-actions-host');r.root.removeAttribute('tabindex');r.root.removeAttribute('data-nrn-card-hover');if(r.ownRootId===r.root.id)r.root.removeAttribute('id')}records.clear();ownerStates.clear();doc.removeEventListener('mouseover',entered);doc.documentElement.removeEventListener('mouseleave',leftWindow);doc.removeEventListener('focusin',entered);doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',keys);doc.removeEventListener('scroll',position,true);win.removeEventListener('resize',position)}}
    }
    return {create,css:css+(typeof CardTooltip!=='undefined'?CardTooltip.css:''),validPlaylist}
  })()
