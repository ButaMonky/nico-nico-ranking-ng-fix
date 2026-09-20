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
    function selectOwner(movie, getContributorBy) {
      let owner = movie._nrnDetailContributor || movie._nrnSearchContributor
      movie._nrnContributorSource = movie._nrnDetailContributor ? 'detail' : owner ? 'search' : 'unknown'
      movie._nrnOwnerNameSource = owner?.name != null ? movie._nrnContributorSource : 'unknown'
      const search = movie._nrnSearchContributor
      if (owner && OwnerEvidence.same(owner,search)) {
        if (owner.name === null && search.name !== null) movie._nrnOwnerNameSource = 'search'
        owner = {...owner,name:owner.name ?? search.name,visibility:owner.visibility ?? search.visibility}
      }
      const supplement = movie._nrnOwnerNameSupplement
      if (owner?.name === null && OwnerEvidence.nicoadName(movie.id,supplement,owner)) {
        owner = {...owner,name:supplement.ownerName.trim()}
        movie._nrnOwnerNameSource = 'nicoad'
      }
      movie.setOwnerKnowledge(owner || null)
      const selected = owner ? getContributorBy(owner,movie._nrnContributorSource) : Contributor.NULL
      if (movie.contributor !== selected) movie.contributor = selected
      movie.metadataChanged()
    }
    return {
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
          if (m.error && m.error.type !== 'NO_ERROR') m.error = Movie.NO_ERROR
          if (typeof thumbInfo.description === 'string') m.description = thumbInfo.description
          if (Array.isArray(thumbInfo.tags)) m.tags = getTagsBy(thumbInfo.tags)
          // Keep raw API/cache objects unchanged; search evidence belongs to this route's movie.
          const detailOwner = OwnerEvidence.normalize(thumbInfo.contributor)
          if (detailOwner) {
            const previous = m._nrnDetailContributor
            m._nrnDetailContributor = OwnerEvidence.same(previous,detailOwner) ? {...detailOwner,
              name:detailOwner.name ?? previous.name,visibility:detailOwner.visibility ?? previous.visibility} : detailOwner
          }
          selectOwner(m,getContributorBy)
          m.setThumbInfoDone()
        }
      },
      forErrorOccurred(movies) {
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.error = thumbInfo.error
          for (const field of MetadataReadiness.fields) {
            if (m.metadata[field] !== 'known') m.metadata[field] = 'failed'
          }
          m.setThumbInfoDone()
        }
      },
    }
  })()
