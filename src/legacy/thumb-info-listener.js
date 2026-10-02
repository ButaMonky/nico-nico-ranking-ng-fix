  var ThumbInfoListener = (function() {
    var createTagBuilder = function(config) {
      var map = new Map()
      return thumbInfoTag => {
        let a;
        const i = thumbInfoTag.lock ? 1 : 0;
        if (map.has(thumbInfoTag.name)) {
          a = map.get(thumbInfoTag.name);
          if (a[i]) return a[i];
        } else {
          a = [null, null];
        }
        const tag = new Tag(thumbInfoTag);
        a[i] = tag;
        map.set(thumbInfoTag.name, a);
        config.ngTags.on('changed', tagNameSet => tag.updateNg(tagNameSet));
        config.ngLockedTags.on('changed', tagNameSet => tag.updateNgIfLocked(tagNameSet));
        return tag;
      };
    }
    var createTagsBuilder = function(config) {
      var getTagBy = createTagBuilder(config)
      return thumbInfoTags => {
        const tags = thumbInfoTags.map(getTagBy);
        const ngTagSet = config.ngTags.set;
        const ngLockedTagSet = config.ngLockedTags.set;
        for (const t of tags) {
          t.updateNg(ngTagSet);
          t.updateNgIfLocked(ngLockedTagSet);
        }
        return tags;
      };
    }
    var createContributorBuilder = function(config) {
      var typeToMap = Contributor.TYPES.reduce(function(map, type) {
        return map.set(type, new Map())
      }, new Map())
      return function(o, source) {
        if (o.type === 'unknown') return Contributor.NULL;
        var map = typeToMap.get(o.type)
        const key = JSON.stringify([source || 'detail',o.id,o.name])
        if (map.has(key)) return map.get(key)
        var contributor = Contributor.new(o.type, o.id, o.name || '')
        map.set(key, contributor)
        contributor.bindToConfig(config)
        return contributor
      }
    }
    const builders = new WeakMap()
    function builder(movies) {
      if (!builders.has(movies)) builders.set(movies,createContributorBuilder(movies.config))
      return builders.get(movies)
    }
    // Priority and merge rules live in OwnerResolver; this applies the result.
    function selectOwner(movie, getContributorBy) {
      const primary = movie._nrnDetailContributor || movie._nrnSearchContributor
      const nameData = movie._nrnOwnerNameSupplement
      const extra = movie._nrnOwnerSupplement
      const result = OwnerResolver.select({videoId:movie.id, detail:movie._nrnDetailContributor || null,
        search:movie._nrnSearchContributor || null, nameSupplement:OwnerEvidence.nicoadName(movie.id,nameData,primary),
        supplement:extra || null, detailCompleted:Boolean(movie._nrnDetailAnswered)})
      const owner = result.owner
      movie._nrnContributorSource = result.identity || 'unknown'
      movie._nrnOwnerNameSource = result.name || 'unknown'
      movie.ownerResolution = {status:result.status, source:result.identity, conflict:result.conflict}
      // Provenance: detail/search carry their own observation times; a
      // supplement source uses the time of the lookup that supplied it.
      const mark = (source, supplementAt) => !source ? null
        : source === 'detail' ? {source:movie._nrnDetailOwnerSource || 'detail',at:movie._nrnDetailOwnerAt}
        : source === 'search' ? {source,at:movie._nrnSearchObservedAt} : {source,at:supplementAt}
      const nameAt = result.name === result.identity ? extra?.at : nameData?.fetchedAt
      movie.setOwnerKnowledge(owner,owner ? {ownerId:mark(result.identity,extra?.at),
        ownerType:mark(result.identity,extra?.at),ownerName:mark(result.name,nameAt),
        ownerVisibility:mark(result.visibility,extra?.at)} : null)
      const selected = owner ? getContributorBy(owner,movie._nrnContributorSource) : Contributor.NULL
      if (movie.contributor !== selected) movie.contributor = selected
      movie.metadataChanged()
    }
    return {
      // Entry point for ID supplements (nicoad: BRUSH-009, snapshot: BRUSH-010).
      // No communication here. Accepted only for sm/nm videos with a user owner;
      // it never replaces or contradicts detail/search owners. Returns boolean.
      forSupplement(movies) {
        const getContributorBy = builder(movies)
        return function(id, evidence, source, observedAt = Date.now()) {
          const movie = movies.get(id), owner = OwnerEvidence.normalize(evidence)
          if (!movie || !OwnerResolver.acceptsSupplement(id,owner,source)) return false
          if (!Number.isFinite(observedAt) || observedAt > Date.now()) return false
          const primary = movie._nrnDetailContributor || movie._nrnSearchContributor
          if (primary && !OwnerEvidence.same(primary,owner)) return false
          const previous = movie._nrnOwnerSupplement
          if (previous && !OwnerEvidence.same(previous.owner,owner)) return false
          movie._nrnOwnerSupplement = {owner:previous ? {...owner,name:owner.name ?? previous.owner.name} : owner,source,at:observedAt}
          selectOwner(movie,getContributorBy)
          return true
        }
      },
      forOwnerName(movies) {
        const getContributorBy = builder(movies)
        return function(id,data,fetchedAt = Date.now()) {
          const movie = movies.get(id)
          const owner = movie?._nrnDetailContributor || movie?._nrnSearchContributor
          if (!movie || !OwnerEvidence.nicoadName(id,data,owner)
              || !Number.isFinite(fetchedAt) || fetchedAt > Date.now() || Date.now()-fetchedAt > 600000) return false
          movie._nrnOwnerNameSupplement = {id,ownerId:data.ownerId,ownerName:data.ownerName.trim(),fetchedAt}
          selectOwner(movie,getContributorBy)
          return true
        }
      },
      forSearch(movies) {
        const getContributorBy = builder(movies)
        return function(id, evidence) {
          const movie = movies.get(id), owner = OwnerEvidence.normalize(evidence)
          if (!movie || !owner || movie._nrnSearchOwnerConflict) return
          const previous = movie._nrnSearchContributor
          if (OwnerEvidence.same(previous,owner) && (previous.name || previous.name === owner.name || owner.name === null)
              && (previous.visibility !== null || owner.visibility === null)) return
          if (previous && !OwnerEvidence.same(previous,owner)) {
            movie._nrnSearchContributor = null
            movie._nrnSearchOwnerConflict = true
          } else {
            movie._nrnSearchContributor = previous ? {...owner,
              name:previous.name || (owner.name ?? previous.name),visibility:previous.visibility ?? owner.visibility} : owner
            movie._nrnSearchObservedAt = Date.now()
          }
          selectOwner(movie,getContributorBy)
        }
      },
      forCompleted(movies) {
        var getTagsBy = createTagsBuilder(movies.config)
        var getContributorBy = builder(movies)
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m._nrnDetailFetchedAt = Number.isFinite(thumbInfo.fetchedAt) && thumbInfo.fetchedAt <= Date.now() ? thumbInfo.fetchedAt : Date.now()
          // Session cache restores arrive through this listener marked with message 'cache'.
          m._nrnDetailSource = thumbInfo.source === 'cache' || thumbInfo.error?.message === 'cache' ? 'cache' : 'detail'
          if (m.error && m.error.type !== 'NO_ERROR') m.error = Movie.NO_ERROR
          if (typeof thumbInfo.description === 'string') {
            m.description = thumbInfo.description
            MetadataReadiness.noteSource(m,'description',m._nrnDetailSource,m._nrnDetailFetchedAt)
          }
          if (Array.isArray(thumbInfo.tags)) {
            m.tags = getTagsBy(thumbInfo.tags)
            MetadataReadiness.noteSource(m,'tags',m._nrnDetailSource,m._nrnDetailFetchedAt)
            MetadataReadiness.noteSource(m,'lockedTags',m._nrnDetailSource,m._nrnDetailFetchedAt)
          }
          // A successful detail answer (not a failure) can report a missing owner.
          m._nrnDetailAnswered = true
          // Keep raw API/cache objects unchanged; search evidence belongs to this route's movie.
          const detailOwner = OwnerEvidence.normalize(thumbInfo.contributor)
          if (detailOwner) {
            const previous = m._nrnDetailContributor
            m._nrnDetailContributor = OwnerEvidence.same(previous,detailOwner) ? {...detailOwner,
              name:detailOwner.name ?? previous.name,visibility:detailOwner.visibility ?? previous.visibility} : detailOwner
            m._nrnDetailOwnerSource = m._nrnDetailSource
            m._nrnDetailOwnerAt = m._nrnDetailFetchedAt
          }
          selectOwner(m,getContributorBy)
          m.setThumbInfoDone()
        }
      },
      forErrorOccurred(movies) {
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.error = thumbInfo.error
          for (const field of MetadataReadiness.detailFields) {
            if (m.metadata[field] !== 'known') {
              m.metadata[field] = 'failed'
              MetadataReadiness.noteFailure(m,field,thumbInfo.error?.type)
            }
          }
          m.setThumbInfoDone()
        }
      },
    }
  })()
