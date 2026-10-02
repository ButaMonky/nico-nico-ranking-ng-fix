  // Pre-DOM decisions may use only fields that a later detail cannot replace.
  // Search owner/tag evidence is deliberately left unknown here.
  var CandidateFilter = (function() {
    function reason(item, config) {
      if (!item || typeof item.id !== 'string' || !/^(sm|so|nm)[0-9]+$/.test(item.id)) return null
      if (config?.ngMovies?.set.has(item.id)) return 'movieId'
      if (typeof item.title !== 'string') return null
      const title = item.title.toUpperCase()
      for (const text of config?.ngTitles?.set || []) {
        if (typeof text === 'string' && text && title.includes(text)) return 'title'
      }
      if (!config?.advancedNgRulesEnabled?.value) return null
      const movie = {id:item.id, title:item.title, thumbInfoDone:false,
        metadata:Object.fromEntries(MetadataReadiness.fields.map(field=>[field,'unknown']))}
      return AdvancedNgRules.match(movie,true,config.advancedNgRulesJson.value,false).length ? 'advanced' : null
    }
    function create(config, capacity = 2048) {
      const limit = Number.isSafeInteger(capacity) && capacity > 0 ? Math.min(capacity,10000) : 2048
      const parked = new Map(), ordinals = new WeakMap()
      let sequence = 0, rejectedTotal = 0, releasedTotal = 0, capacityFallback = 0
      function order(item) {
        if (!ordinals.has(item)) ordinals.set(item,++sequence)
        return ordinals.get(item)
      }
      const sort = items => [...items].sort((a,b)=>order(a)-order(b))
      function partition(items) {
        const passed = []
        let rejected = 0
        for (const item of items) {
          order(item)
          const match = reason(item,config)
          if (match && (parked.has(item.id) || parked.size < limit)) {
            if (!parked.has(item.id)) parked.set(item.id,item)
            rejected++; rejectedTotal++
          } else {
            if (match) capacityFallback++
            passed.push(item)
          }
        }
        return {passed,rejected}
      }
      function release() {
        const result = []
        for (const [id,item] of parked) if (!reason(item,config)) {
          parked.delete(id); result.push(item); releasedTotal++
        }
        return sort(result)
      }
      return {order,sort,partition,release,
        isRejected:id=>parked.has(id) && Boolean(reason(parked.get(id),config)),
        clear:()=>parked.clear(),
        snapshot:()=>({retained:parked.size,rejectedTotal,releasedTotal,capacityFallback,limit})}
    }
    return {reason,create}
  })()
