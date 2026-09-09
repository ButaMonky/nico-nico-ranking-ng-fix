  // Search evidence is scoped to the exact video/card and never inferred from names.
  var OwnerEvidence = (function() {
    const injected = new WeakMap()
    function normalize(owner) {
      if (!owner) return null
      const declared = owner.ownerType || owner.type
      if (declared && !['user','channel'].includes(declared)) return null
      const raw = String(owner.id ?? '')
      const type = declared || (/^ch[0-9]+$/.test(raw) ? 'channel' : 'user')
      const text = type === 'channel' ? raw.replace(/^ch/,'') : raw
      if (!/^[0-9]+$/.test(text)) return null
      const id = Number(text)
      if (!Number.isSafeInteger(id) || id <= 0) return null
      const name = typeof owner.name === 'string' ? owner.name.trim() : ''
      return {type,id,name}
    }
    function fromUrl(value, base) {
      try {
        const url = new URL(value,base)
        if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return null
        let match
        if (url.hostname === 'www.nicovideo.jp' && (match = url.pathname.match(/^\/user\/([0-9]+)\/?$/))) return normalize({type:'user',id:match[1]})
        if (['www.nicovideo.jp','ch.nicovideo.jp'].includes(url.hostname) && (match = url.pathname.match(/^\/channel\/(?:ch)?([0-9]+)\/?$/))) return normalize({type:'channel',id:match[1]})
      } catch (_) {}
      return null
    }
    const same = (a,b) => a && b && a.type === b.type && a.id === b.id
    function register(root,item) {
      if (root.dataset.decorationVideoId === item.id) injected.set(root,{id:item.id,owner:normalize(item.owner)})
    }
    function fromRow(row) {
      const root = row.rootElem, id = row.movie.id
      if (!root || root.dataset.decorationVideoId !== id) return null
      const recorded = injected.get(root)
      if (recorded?.id === id) return recorded.owner
      const owners = []
      for (const link of root.querySelectorAll('a[data-group-ignore="true"][data-anchor-area="main"][href]')) {
        if (link.closest('[data-decoration-video-id]') !== root || link.closest('.nrn-movie-info-container,.nrn-description,.nrn-card-description,[data-scope="menu"]')) continue
        if (!link.querySelector(':scope > img') || !link.querySelector(':scope > p')) continue
        // The native owner row is a sibling of this video's title, not a user link in a description.
        const titleSibling = [...link.parentElement.querySelectorAll(':scope > a[href]')].some(a => {
          try { return new URL(a.href).pathname === '/watch/' + id } catch (_) { return false }
        })
        if (!titleSibling) continue
        const owner = fromUrl(link.href,root.ownerDocument.baseURI)
        if (!owner) continue
        const tracked = link.getAttribute('data-anchor-href')
        if (tracked && !same(owner,fromUrl(tracked,root.ownerDocument.baseURI))) continue
        owner.name = link.querySelector(':scope > p').textContent.trim()
        owners.push(owner)
      }
      if (!owners.length || owners.some(owner => !same(owner,owners[0]))) return null
      return owners[0]
    }
    return {normalize,fromUrl,fromRow,register,same}
  })()
