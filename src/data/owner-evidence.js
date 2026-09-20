  // Search evidence is scoped to the exact video/card and never inferred from names.
  var OwnerEvidence = (function() {
    const injected = new WeakMap()
    function normalize(owner) {
      if (!owner) return null
      if (owner.type != null && !['user','channel'].includes(owner.type)) return null
      const types = [owner.ownerType,owner.type].filter(value => value != null && value !== 'hidden')
      if (!types.length || types.some(value => !['user','channel'].includes(value)) || new Set(types).size !== 1) return null
      const type = types[0]
      const raw = String(owner.id ?? '')
      // Only explicitly channel-typed sources and native channel URLs accept ch.
      const text = type === 'channel' ? raw.replace(/^ch/,'') : raw
      if (!/^[0-9]+$/.test(text)) return null
      const id = Number(text)
      if (!Number.isSafeInteger(id) || id <= 0) return null
      const name = typeof owner.name === 'string' ? owner.name.trim() : null
      const visibility = owner.visibility === 'hidden' || owner.ownerType === 'hidden'
        ? 'hidden' : owner.visibility === 'visible' ? 'visible' : null
      return {type,id,name,visibility}
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
    function nicoadName(id,data,owner) {
      // This endpoint has no trustworthy user/channel discriminator. Require a
      // separately established user identity, even when the numeric IDs match.
      if (!owner || owner.type !== 'user' || data?.id !== id || !/^(sm|so|nm)[0-9]+$/.test(id)) return null
      if (typeof data.ownerName !== 'string' || !data.ownerName.trim()) return null
      if (data.targetUrl != null) {
        try {
          const url = new URL(data.targetUrl)
          if (url.origin !== 'https://www.nicovideo.jp' || url.pathname !== '/watch/' + id) return null
        } catch (_) { return null }
      }
      const candidate = normalize({type:'user',id:data.ownerId,name:data.ownerName})
      return same(owner,candidate) ? candidate : null
    }
    function initialDocument(doc) {
      const owners = new Map(), conflicts = new Set()
      try {
        const value = JSON.parse(doc.querySelector('meta[name="server-response"]')?.getAttribute('content') || 'null')
        const items = value?.data?.response?.$getSearchVideoV2?.data?.items
        if (!Array.isArray(items)) return owners
        for (const item of items) {
          if (!item || typeof item.id !== 'string' || !/^(sm|so|nm)[0-9]+$/.test(item.id)) continue
          const owner = normalize(item.owner), previous = owners.get(item.id)
          if (!owner || conflicts.has(item.id)) continue
          if (previous && !same(previous,owner)) { owners.delete(item.id);conflicts.add(item.id);continue }
          owners.set(item.id,previous ? {...owner,name:previous.name ?? owner.name} : owner)
        }
      } catch (_) {}
      return owners
    }
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
    return {normalize,fromUrl,fromRow,register,same,nicoadName,initialDocument}
  })()
