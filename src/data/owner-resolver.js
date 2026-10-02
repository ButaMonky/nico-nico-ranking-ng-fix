
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
    // Returns {owner, status, identity, name, visibility, conflict}; each source
    // field is a tier/source name or null. status: known | supplemented | missing | unresolved.
    function select(input) {
      const same = OwnerEvidence.same
      const {detail = null, search = null} = input || {}
      let owner = detail || search
      let identity = detail ? 'detail' : search ? 'search' : null
      let name = owner?.name != null ? identity : null
      let visibility = owner ? identity : null
      if (owner && same(owner,search)) {
        if (owner.name === null && search.name !== null) name = 'search'
        if (owner.visibility == null && search.visibility != null) visibility = 'search'
        owner = {...owner,name:owner.name ?? search.name,visibility:owner.visibility ?? search.visibility}
      }
      const nameSupplement = input?.nameSupplement
      if (owner?.name === null && nameSupplement && same(owner,nameSupplement)) {
        owner = {...owner,name:nameSupplement.name}
        name = 'nicoad'
      }
      let conflict = false
      const extra = input?.supplement
      if (extra?.owner && acceptsSupplement(input.videoId,extra.owner,extra.source)) {
        if (!owner) {
          owner = extra.owner
          identity = extra.source
          name = owner.name != null ? extra.source : null
          visibility = owner.visibility != null ? extra.source : null
        } else if (same(owner,extra.owner)) {
          if (owner.name === null && extra.owner.name != null) { owner = {...owner,name:extra.owner.name};name = extra.source }
        } else conflict = true
      }
      const status = identity === 'detail' || identity === 'search' ? 'known'
        : identity ? 'supplemented' : input?.detailCompleted ? 'missing' : 'unresolved'
      return {owner:owner || null, status, identity, name, visibility, conflict}
    }
    return {priority, supplementSources, acceptsSupplement, select}
  })()
