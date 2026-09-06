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
      return function(o) {
        if (o.type === 'unknown') return Contributor.NULL;
        var map = typeToMap.get(o.type)
        if (map.has(o.id)) return map.get(o.id)
        var contributor = Contributor.new(o.type, o.id, o.name)
        map.set(o.id, contributor)
        contributor.bindToConfig(config)
        return contributor
      }
    }
    return {
      forCompleted(movies) {
        var getTagsBy = createTagsBuilder(movies.config)
        var getContributorBy = createContributorBuilder(movies.config)
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.description = thumbInfo.description
          m.tags = getTagsBy(thumbInfo.tags)
          m.contributor = getContributorBy(thumbInfo.contributor)
          m.setThumbInfoDone()
        }
      },
      forErrorOccurred(movies) {
        return function(thumbInfo) {
          var m = movies.get(thumbInfo.id)
          m.error = thumbInfo.error
          m.setThumbInfoDone()
        }
      },
    }
  })()

