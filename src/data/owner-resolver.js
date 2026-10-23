
  // One place that states and applies the owner (投稿者) priority. Pure: it
  // never fetches; callers pass already-normalized OwnerEvidence owners.
  //
  // Priority (highest first) and where each tier comes from:
  //   detail     getthumbinfo, live or restored from the session cache
  //              (provenance 'detail' / 'cache')
  //   search     page evidence merged by ThumbInfoListener.forSearch:
  //              server-response (initial document / fetched pages),
  //              native owner row, delayed native row (refreshSearchOwners)
  //   supplement ID-only lookups for videos the tiers above left without an
  //              owner: nicoad contents (BRUSH-009), snapshot (BRUSH-010)
  //   unresolved nothing usable; never read as deleted / withdrawn / private
  //
  // A lower tier never replaces or contradicts a higher one. It may only fill
  // a missing name or visibility of the same identity (same type and ID).
  var OwnerResolver = (function() {
    const priority = ['detail','search','supplement']
    const supplementSources = new Set(['nicoad','snapshot'])
    // Supplements are accepted only for user-uploaded videos and user owners.
    function acceptsSupplement(videoId, owner, source) {
      return Boolean(owner) && owner.type === 'user' && supplementSources.has(source)
        && typeof videoId === 'string' && /^(sm|nm)[0-9]+$/.test(videoId)
    }
    // input: {videoId, detail, search, nameSupplement, supplement:{owner, source, at}, detailCompleted}
    // nameSupplement: a nicoad name already checked by OwnerEvidence.nicoadName.
    // Returns {owner, status, identity, name, visibility, conflict, origins}; each source
    // field is a tier/source name or null. status: known | supplemented | missing | unresolved.
    // origins identifies the input that supplied each field independently of
    // its reported source, so retained evidence keeps its own acquisition time.
    function select(input) {
      const same = OwnerEvidence.same
      const {detail = null, search = null} = input || {}
      let owner = detail || search
      let identity = detail ? 'detail' : search ? 'search' : null
      let name = owner?.name != null ? identity : null
      let visibility = owner ? identity : null
      const origins = {identity,name,visibility}
      if (owner && same(owner,search)) {
        if (owner.name === null && search.name !== null) name = origins.name = 'search'
        if (owner.visibility == null && search.visibility != null) visibility = origins.visibility = 'search'
        owner = {...owner,name:owner.name ?? search.name,visibility:owner.visibility ?? search.visibility}
        if (!owner.iconUrl && search.iconUrl) owner.iconUrl = search.iconUrl
      }
      const nameSupplement = input?.nameSupplement
      if (owner?.name === null && nameSupplement && same(owner,nameSupplement)) {
        owner = {...owner,name:nameSupplement.name}
        name = 'nicoad'
        origins.name = 'nameSupplement'
      }
      let conflict = false
      const extra = input?.supplement
      if (extra?.owner && acceptsSupplement(input.videoId,extra.owner,extra.source)) {
        if (!owner) {
          owner = extra.owner
          identity = extra.source
          name = owner.name != null ? extra.evidence?.name?.source || extra.source : null
          visibility = owner.visibility != null ? extra.evidence?.visibility?.source || extra.source : null
          origins.identity = 'supplement'
          origins.name = name ? 'supplement' : null
          origins.visibility = visibility ? 'supplement' : null
        } else if (same(owner,extra.owner)) {
          if (owner.name === null && extra.owner.name != null) {
            owner = {...owner,name:extra.owner.name};name = extra.evidence?.name?.source || extra.source
            origins.name = 'supplement'
          }
          if (!owner.iconUrl && extra.owner.iconUrl) owner = {...owner,iconUrl:extra.owner.iconUrl}
        } else conflict = true
      }
      const status = identity === 'detail' || identity === 'search' ? 'known'
        : identity ? 'supplemented' : input?.detailCompleted ? 'missing' : 'unresolved'
      return {owner:owner || null, status, identity, name, visibility, conflict, origins}
    }
    return {priority, supplementSources, acceptsSupplement, select}
  })()
