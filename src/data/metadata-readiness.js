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
    const settings = ['ngMovies','ngTitles','ngUserIds','ngChannelIds','ngUserNames','ngTags','ngLockedTags',
      'ngLockedTagCountEnabled','advancedNgRulesEnabled','advancedNgRulesJson',
      'visibleContributorType','unknownContributorMovieVisible','movieInfoTogglable',
      'descriptionTogglable','selfAdWarningEnabled','useGetThumbInfo']
    const parsedRuleCache = new Map()
    function parsedRules(raw) {
      const key = typeof raw === 'string' ? raw : JSON.stringify(raw)
      if (!parsedRuleCache.has(key)) {
        parsedRuleCache.set(key,AdvancedNgRules.parse(raw).filter(rule => rule.enabled !== false))
        if (parsedRuleCache.size > 32) parsedRuleCache.delete(parsedRuleCache.keys().next().value)
      }
      return parsedRuleCache.get(key)
    }
    function progressive(movie, config) {
      const need = new Set()
      if (!config?.advancedNgRulesEnabled?.value) return {matched:false,need}
      const stable = Object.create(movie || null)
      stable.metadata = {...movie?.metadata}
      // A pending detail can supersede weak owner evidence. Do not prune a
      // sibling branch merely because a search/supplemental owner matches.
      for (const field of ['ownerId','ownerType','ownerName','ownerVisibility']) {
        if (!['detail','cache'].includes(sourceOf(movie,field)?.source)) stable.metadata[field] = 'unknown'
      }
      function collect(node) {
        if (!node || AdvancedNgRules.evaluateState(stable,node) !== null) return
        if (node.kind === 'condition' && ruleFields[node.field]) need.add(ruleFields[node.field])
        else if (node.children) node.children.forEach(collect)
      }
      for (const rule of parsedRules(config.advancedNgRulesJson.value)) {
        const result = AdvancedNgRules.evaluateState(stable,rule.expression)
        if (result === true) return {matched:true,need:new Set()}
        if (result === null) collect(rule.expression)
      }
      return {matched:false,need}
    }
    function required(movie, config) {
      const rulePlan = progressive(movie,config)
      const blocked = Boolean(movie?.ngId || movie?.ngTitle || rulePlan.matched)
      const need = blocked ? new Set() : new Set(['ownerId','ownerType'])
      if (!config) return need
      if (!blocked) {
        if (config.ngUserNames.set.size) need.add('ownerName')
        if (config.ngTags.set.size) need.add('tags')
        if (config.ngLockedTags.set.size || config.ngLockedTagCountEnabled.value) need.add('lockedTags')
        if (config.selfAdWarningEnabled.value) { need.add('ownerId'); need.add('ownerName') }
        for (const field of rulePlan.need) need.add(field)
      }
      if (movie._detailsRequested || (!blocked && !config.movieInfoTogglable.value)) {
        need.add('ownerName'); need.add('tags'); need.add('lockedTags')
      }
      if (movie._detailsRequested || movie._descriptionRequested || (!blocked && !config.descriptionTogglable.value)) need.add('description')
      return need
    }
    // BRUSH-011: whether an owner the normal route could not find is worth an
    // extra lookup. id: NG, visibility or rules depend on the identity.
    // name: something also reads the account name (implies id).
    function ownerDemand(movie, config) {
      if (!config) return {id:true, name:true}
      const rulePlan = progressive(movie,config)
      if ((movie?.ngId || movie?.ngTitle || rulePlan.matched) && !movie?._detailsRequested) return {id:false,name:false}
      const rules = rulePlan.need
      const name = config.ngUserNames.set.size > 0 || rules.has('ownerName') || Boolean(config.selfAdWarningEnabled.value)
        || Boolean(movie?._detailsRequested) || !config.movieInfoTogglable.value
      const id = name || config.ngUserIds.set.size > 0 || config.ngChannelIds.set.size > 0 || rules.has('ownerId')
        || config.visibleContributorType.value !== 'all' || !config.unknownContributorMovieVisible.value
      return {id, name}
    }
    function ready(movie, config) {
      return [...required(movie,config)].every(field => movie.metadata[field] === 'known')
    }
    // Provenance is an optional record kept beside movie.metadata. The status
    // strings stay authoritative: a record never promotes a field to known, and
    // a record that no longer matches its field status is not reported.
    const sources = new Set(['search','detail','cache','nicoad','snapshot'])
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
    return {fields,detailFields,searchFields,ruleFields,settings,required,ownerDemand,ready,sources,noteSource,noteFailure,clearSource,sourceOf}
  })()
