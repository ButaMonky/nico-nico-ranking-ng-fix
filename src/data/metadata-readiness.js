  // Field knowledge is independent from the completion of a detail request.
  var MetadataReadiness = (function() {
    // Fields a detail (getthumbinfo) response can supply. A failed detail
    // request says nothing about the others, which come from search page data.
    const detailFields = ['ownerId','ownerType','ownerName','ownerVisibility','tags','lockedTags','description']
    const searchFields = ['likeCount','viewCount','commentCount','mylistCount','durationSeconds','registeredAtMs']
    const fields = [...detailFields, ...searchFields]
    const ruleFields = {
      contributorId:'ownerId', userId:'ownerId', channelId:'ownerId', contributorName:'ownerName',
      tag:'tags', tagCount:'tags', lockedTag:'lockedTags', lockedTagCount:'lockedTags', description:'description',
      selfAdIdMatch:'ownerId', selfAdNameMatch:'ownerName'
    }
    const settings = ['ngUserIds','ngChannelIds','ngUserNames','ngTags','ngLockedTags',
      'ngLockedTagCountEnabled','advancedNgRulesEnabled','advancedNgRulesJson',
      'visibleContributorType','unknownContributorMovieVisible','movieInfoTogglable',
      'descriptionTogglable','selfAdWarningEnabled','useGetThumbInfo']
    const ruleDemandCache = new Map()
    function ruleRequirements(raw) {
      const key = typeof raw === 'string' ? raw : JSON.stringify(raw)
      if (ruleDemandCache.has(key)) return ruleDemandCache.get(key)
      const need = new Set()
      const visit = function(node) {
        if (node.kind === 'condition' && ruleFields[node.field]) need.add(ruleFields[node.field])
        if (node.children) node.children.forEach(visit)
      }
      AdvancedNgRules.parse(raw).filter(rule => rule.enabled !== false).forEach(rule => visit(rule.expression))
      ruleDemandCache.set(key,need)
      if (ruleDemandCache.size > 32) ruleDemandCache.delete(ruleDemandCache.keys().next().value)
      return need
    }
    function required(movie, config) {
      // The owner row and contributor-type visibility need a trustworthy identity.
      const need = new Set(['ownerId','ownerType'])
      if (!config) return need
      if (config.ngUserNames.set.size) need.add('ownerName')
      if (config.ngTags.set.size) need.add('tags')
      if (config.ngLockedTags.set.size || config.ngLockedTagCountEnabled.value) need.add('lockedTags')
      if (config.selfAdWarningEnabled.value) { need.add('ownerId'); need.add('ownerName') }
      if (config.advancedNgRulesEnabled.value) {
        for (const field of ruleRequirements(config.advancedNgRulesJson.value)) need.add(field)
      }
      if (movie._detailsRequested || !config.movieInfoTogglable.value) {
        need.add('ownerName'); need.add('tags'); need.add('lockedTags')
      }
      if (movie._detailsRequested || movie._descriptionRequested || !config.descriptionTogglable.value) need.add('description')
      return need
    }
    function ready(movie, config) {
      return [...required(movie,config)].every(field => movie.metadata[field] === 'known')
    }
    // Provenance is an optional record kept beside movie.metadata. The status
    // strings stay authoritative: a record never promotes a field to known, and
    // a record that no longer matches its field status is not reported.
    const sources = new Set(['search','detail','cache','nicoad'])
    function provenanceMap(movie) {
      if (!movie.metadataSource) movie.metadataSource = {}
      return movie.metadataSource
    }
    function noteSource(movie, field, source, observedAt) {
      if (!movie?.metadata || !fields.includes(field) || !sources.has(source)) return false
      if (movie.metadata[field] !== 'known') return false
      provenanceMap(movie)[field] = {source, observedAt:Number.isFinite(observedAt) ? observedAt : null}
      return true
    }
    function noteFailure(movie, field, failureKind) {
      if (!movie?.metadata || !fields.includes(field) || movie.metadata[field] !== 'failed') return false
      provenanceMap(movie)[field] = {source:'detail', observedAt:null,
        failureKind:typeof failureKind === 'string' && failureKind ? failureKind : 'unknown'}
      return true
    }
    function clearSource(movie, field) {
      if (movie?.metadataSource && fields.includes(field)) delete movie.metadataSource[field]
    }
    function sourceOf(movie, field) {
      const status = movie?.metadata?.[field], record = movie?.metadataSource?.[field]
      if (!record) return null
      if (status === 'known' && !record.failureKind) return {...record}
      if (status === 'failed' && record.failureKind) return {...record}
      return null
    }
    return {fields,detailFields,searchFields,ruleFields,settings,required,ready,sources,noteSource,noteFailure,clearSource,sourceOf}
  })()
