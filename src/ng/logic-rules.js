  var AdvancedNgRules = (function() {
    // v12 recursive expression format:
    // group     = {kind:'group', op:'AND'|'OR', not:false, children:[...]}
    // condition = {kind:'condition', field:'lockedTagCount', operator:'gte', value:11, not:false}
    //
    // 旧v11 conditions[] は parse() 時に root AND group へ自動移行する。
    var FIELD_META = {
      pageContributorCount: {
        label:'同じ投稿者の動画数（元の1ページ）', type:'number',
        operators:['gt','gte','lt','lte','eq','neq']
      },
      lockedTagCount: {
        label:'🔒 タグロック数', type:'number',
        operators:['gt','gte','lt','lte','eq','neq']
      },
      tagCount: {
        label:'タグ数', type:'number',
        operators:['gt','gte','lt','lte','eq','neq']
      },
      tag: {
        label:'タグ', type:'set',
        operators:['contains','notContains','exists','notExists']
      },
      lockedTag: {
        label:'🔒 タグロック', type:'set',
        operators:['contains','notContains','exists','notExists']
      },
      title: {
        label:'タイトル', type:'text',
        operators:['contains','notContains','eq','neq','exists','notExists']
      },
      description: {
        label:'説明文', type:'text',
        operators:['contains','notContains','eq','neq','exists','notExists']
      },
      contributorId: {
        label:'投稿者ID（ユーザー / チャンネル）', type:'numberOrMissing',
        operators:['eq','neq','gt','gte','lt','lte','exists','notExists']
      },
      userId: {
        label:'ユーザーID', type:'numberOrMissing',
        operators:['eq','neq','gt','gte','lt','lte','exists','notExists']
      },
      channelId: {
        label:'チャンネルID', type:'numberOrMissing',
        operators:['eq','neq','gt','gte','lt','lte','exists','notExists']
      },
      contributorName: {
        label:'投稿者名', type:'text',
        operators:['contains','notContains','eq','neq','exists','notExists']
      },
      movieId: {
        label:'動画ID', type:'text',
        operators:['contains','notContains','eq','neq']
      },
      selfAdIdMatch: {
        label:'広告：投稿者IDと広告者ID', type:'booleanFlag',
        operators:['isTrue','isFalse']
      },
      selfAdNameMatch: {
        label:'広告：投稿者名と広告者名', type:'booleanFlag',
        operators:['isTrue','isFalse']
      }
    }

    var OP_META = {
      gt:{label:'より大きい（>）', needsValue:true},
      gte:{label:'以上（≥）', needsValue:true},
      lt:{label:'未満（<）', needsValue:true},
      lte:{label:'以下（≤）', needsValue:true},
      eq:{label:'等しい（=）', needsValue:true},
      neq:{label:'等しくない（≠）', needsValue:true},
      contains:{label:'含む', needsValue:true},
      notContains:{label:'含まない', needsValue:true},
      exists:{label:'存在する', needsValue:false},
      notExists:{label:'存在しない', needsValue:false},
      isTrue:{label:'一致する', needsValue:false},
      isFalse:{label:'一致しない', needsValue:false}
    }

    var normalizeText = function(v) {
      return String(v == null ? '' : v).trim().toUpperCase()
    }

    var makeGroup = function(op) {
      return {kind:'group', op:op === 'OR' ? 'OR' : 'AND', not:false, children:[]}
    }

    var makeCondition = function(field) {
      field = FIELD_META[field] ? field : 'lockedTagCount'
      var meta = FIELD_META[field]
      return {
        kind:'condition',
        field:field,
        operator:meta.operators[0],
        value:field === 'lockedTagCount' ? 11 : '',
        not:false
      }
    }

    var legacyConditionToNode = function(c) {
      if (!c || typeof c !== 'object') return null
      var map = {
        lockedTagCountGte:{field:'lockedTagCount',operator:'gte'},
        tagEquals:{field:'tag',operator:'contains'},
        lockedTagEquals:{field:'lockedTag',operator:'contains'},
        titleContains:{field:'title',operator:'contains'},
        contributorMissing:{field:'contributorId',operator:'notExists'},
        userIdEquals:{field:'userId',operator:'eq'},
        channelIdEquals:{field:'channelId',operator:'eq'}
      }
      var m = map[c.type]
      if (!m) return null
      return {
        kind:'condition',
        field:m.field,
        operator:m.operator,
        value:c.value,
        not:false
      }
    }

    var sanitizeNode = function(node, depth) {
      depth = depth || 0
      if (!node || typeof node !== 'object' || depth > 12) return null

      if (node.kind === 'group') {
        var children = Array.isArray(node.children)
          ? node.children.map(function(child) {
              return sanitizeNode(child, depth + 1)
            }).filter(Boolean)
          : []
        return {
          kind:'group',
          op:node.op === 'OR' ? 'OR' : 'AND',
          not:Boolean(node.not),
          children:children
        }
      }

      if (node.kind === 'condition' && FIELD_META[node.field]) {
        var meta = FIELD_META[node.field]
        var operator = meta.operators.includes(node.operator)
          ? node.operator : meta.operators[0]
        return {
          kind:'condition',
          field:node.field,
          operator:operator,
          value:node.value,
          not:Boolean(node.not)
        }
      }
      return null
    }

    var parse = function(raw) {
      var value = raw
      try {
        if (typeof value === 'string') value = JSON.parse(value || '[]')
      } catch (e) {
        console.warn('[NicoNicoRankingNG AdvancedNG] ルールJSON解析失敗:', e)
        return []
      }
      if (!Array.isArray(value)) return []

      return value.map(function(rule, index) {
        if (!rule || typeof rule !== 'object') return null

        var expression = sanitizeNode(rule.expression, 0)
        // v11 migration
        if (!expression && Array.isArray(rule.conditions)) {
          var legacyChildren = rule.conditions
            .map(legacyConditionToNode).filter(Boolean)
          expression = {
            kind:'group', op:'AND', not:false, children:legacyChildren
          }
        }
        if (!expression) expression = makeGroup('AND')

        return {
          id:String(rule.id || ('rule-' + (index + 1))),
          name:String(rule.name || ('ルール ' + (index + 1))),
          enabled:rule.enabled !== false,
          expression:expression
        }
      }).filter(Boolean)
    }

    var usableContributor = function(movie) {
      var c = movie && movie.contributor
      if (!c || c.type === 'unknown') return null
      var id = Number(c.id)
      if (!Number.isFinite(id) || id <= 0) return null
      return c
    }

    var fieldValue = function(movie, field) {
      if (field === 'movieId') return movie.id || ''
      if (field === 'title') return movie.title || ''
      if (field === 'pageContributorCount') return Number.isFinite(movie.pageContributorCount)
        ? movie.pageContributorCount : {__notReady:true}

      // Partial metadata must not become an empty value under NOT / notExists.
      var requiredField = MetadataReadiness.ruleFields[field]
      if (movie.metadata ? (requiredField && movie.metadata[requiredField] !== 'known')
        : (!movie.thumbInfoDone || (movie.error && movie.error.type !== 'NO_ERROR'))) return {__notReady:true}

      if (field === 'description') return movie.description || ''
      if (field === 'lockedTagCount') {
        return (movie.tags || []).filter(function(t) { return Boolean(t.lock) }).length
      }
      if (field === 'tagCount') return (movie.tags || []).length
      if (field === 'tag') return (movie.tags || []).map(function(t) { return t.name })
      if (field === 'lockedTag') {
        return (movie.tags || []).filter(function(t) {
          return Boolean(t.lock)
        }).map(function(t) { return t.name })
      }

      var c = usableContributor(movie)
      if (field === 'contributorId') return c ? Number(c.id) : null
      if (field === 'userId') return c && c.type === 'user' ? Number(c.id) : null
      if (field === 'channelId') return c && c.type === 'channel' ? Number(c.id) : null
      if (field === 'contributorName') return c ? (c.name || '') : ''
      if (field === 'selfAdIdMatch') {
        return movie.nicoadSelfAdChecked ? Boolean(movie.nicoadSelfAdIdMatch) : {__notReady:true}
      }
      if (field === 'selfAdNameMatch') {
        return movie.nicoadSelfAdChecked ? Boolean(movie.nicoadSelfAdNameMatch) : {__notReady:true}
      }
      return null
    }

    var existsValue = function(v) {
      if (v && typeof v === 'object' && v.__notReady) return false
      if (Array.isArray(v)) return v.length > 0
      return v !== null && v !== undefined && String(v).trim() !== ''
    }

    var compare = function(actual, operator, expected, fieldType) {
      if (actual && typeof actual === 'object' && actual.__notReady) return false

      if (operator === 'exists') return existsValue(actual)
      if (operator === 'notExists') return !existsValue(actual)

      if (fieldType === 'number' || fieldType === 'numberOrMissing') {
        if (actual == null || String(actual).trim() === ''
            || expected == null || String(expected).trim() === '') return false
        var a = Number(actual)
        var b = Number(expected)
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false
        if (operator === 'gt') return a > b
        if (operator === 'gte') return a >= b
        if (operator === 'lt') return a < b
        if (operator === 'lte') return a <= b
        if (operator === 'eq') return a === b
        if (operator === 'neq') return a !== b
        return false
      }

      if (fieldType === 'booleanFlag') {
        if (operator === 'isTrue') return actual === true
        if (operator === 'isFalse') return actual === false
        return false
      }
      if (fieldType === 'set') {
        var expectedText = normalizeText(expected)
        var values = Array.isArray(actual) ? actual.map(normalizeText) : []
        if (operator === 'contains') return Boolean(expectedText) && values.includes(expectedText)
        if (operator === 'notContains') return Boolean(expectedText) && !values.includes(expectedText)
        return false
      }

      var aText = normalizeText(actual)
      var bText = normalizeText(expected)
      if (operator === 'contains') return Boolean(bText) && aText.includes(bText)
      if (operator === 'notContains') return Boolean(bText) && !aText.includes(bText)
      if (operator === 'eq') return aText === bText
      if (operator === 'neq') return aText !== bText
      return false
    }

    // null is undecided: NOT must not turn unavailable metadata into a match.
    var evaluateState = function(movie, node, trace, depth) {
      depth = depth || 0
      if (!node || depth > 12) return null

      if (node.kind === 'condition') {
        var meta = FIELD_META[node.field]
        if (!meta) return null
        var actual = fieldValue(movie, node.field)
        var pending = Boolean(actual && actual.__notReady)
        var raw = pending ? null : compare(actual, node.operator, node.value, meta.type)
        var result = raw === null ? null : (node.not ? !raw : raw)
        if (trace) {
          trace.push({
            depth:depth,
            kind:'condition',
            field:node.field,
            fieldLabel:meta.label,
            operator:node.operator,
            operatorLabel:OP_META[node.operator] ? OP_META[node.operator].label : node.operator,
            expected:node.value,
            actual:Array.isArray(actual) ? actual.join(', ') : actual,
            not:Boolean(node.not),
            result:result
          })
        }
        return result
      }

      if (node.kind === 'group') {
        // An empty group remains undecided even underneath another NOT group.
        var children = Array.isArray(node.children) ? node.children : []
        if (!children.length) return null
        var childResults = children.map(function(child) {
          return evaluateState(movie, child, trace, depth + 1)
        })
        var rawGroup = node.op === 'OR'
          ? (childResults.includes(true) ? true : childResults.includes(null) ? null : false)
          : (childResults.includes(false) ? false : childResults.includes(null) ? null : true)
        var groupResult = rawGroup === null ? null : (node.not ? !rawGroup : rawGroup)
        if (trace) {
          trace.push({
            depth:depth,
            kind:'group',
            op:node.op,
            not:Boolean(node.not),
            childCount:children.length,
            result:groupResult
          })
        }
        return groupResult
      }
      return false
    }

    var evaluateNode = function(movie, node, trace, depth) {
      return evaluateState(movie, node, trace, depth) === true
    }

    var ruleCache = new Map()
    var match = function(movie, enabled, rawRules, withTrace) {
      if (!enabled) return []
      var rules
      if (typeof rawRules === 'string') {
        rules = ruleCache.get(rawRules)
        if (!rules) {
          rules = parse(rawRules)
          if (ruleCache.size >= 8) ruleCache.delete(ruleCache.keys().next().value)
          ruleCache.set(rawRules, rules)
        }
      } else rules = parse(rawRules)
      return rules.map(function(rule) {
        if (!rule.enabled) return null
        var trace = withTrace ? [] : null
        var matched = evaluateNode(movie, rule.expression, trace, 0)
        return matched ? {id:rule.id, name:rule.name, trace:trace} : null
      }).filter(Boolean)
    }

    var expressionText = function(node) {
      if (!node) return '(空)'
      if (node.kind === 'condition') {
        var f = FIELD_META[node.field]
        var o = OP_META[node.operator]
        var needs = o ? o.needsValue : true
        var operatorLabel = o ? o.label : node.operator

        if (node.field === 'tag') {
          if (node.operator === 'contains') operatorLabel = '指定したタグ名がある（完全一致）'
          else if (node.operator === 'notContains') operatorLabel = '指定したタグ名がない（完全一致）'
        } else if (node.field === 'lockedTag') {
          if (node.operator === 'contains') operatorLabel = '指定した🔒タグロック名がある（完全一致）'
          else if (node.operator === 'notContains') operatorLabel = '指定した🔒タグロック名がない（完全一致）'
        } else if (node.field === 'selfAdIdMatch') {
          if (node.operator === 'isTrue') operatorLabel = '一致する（高信頼）'
          else if (node.operator === 'isFalse') operatorLabel = '一致しない'
        } else if (node.field === 'selfAdNameMatch') {
          if (node.operator === 'isTrue') operatorLabel = '一致する（名前一致・参考）'
          else if (node.operator === 'isFalse') operatorLabel = '一致しない'
        } else if (['title','description','contributorName','movieId'].includes(node.field)) {
          if (node.operator === 'contains') operatorLabel = '文字列を含む（部分一致）'
          else if (node.operator === 'notContains') operatorLabel = '文字列を含まない（部分一致）'
          else if (node.operator === 'eq') operatorLabel = '文字列が完全一致（=）'
          else if (node.operator === 'neq') operatorLabel = '文字列が完全一致しない（≠）'
        }

        if (node.operator === 'exists') {
          if (node.field === 'userId' || node.field === 'channelId') operatorLabel = 'IDがある'
          else if (node.field === 'contributorId') operatorLabel = '投稿者IDがある'
        } else if (node.operator === 'notExists') {
          if (node.field === 'userId') operatorLabel = 'IDが取得できない'
          else if (node.field === 'contributorId') operatorLabel = '投稿者IDが取得できない'
          else if (node.field === 'channelId') operatorLabel = 'IDがない'
        }
        var core = (f ? f.label : node.field) + ' '
          + operatorLabel
          + (needs ? ' ' + String(node.value == null ? '' : node.value) : '')
        return node.not ? 'NOT (' + core + ')' : core
      }
      var children = (node.children || []).map(expressionText)
      var joined = '(' + children.join(' ' + node.op + ' ') + ')'
      return node.not ? 'NOT ' + joined : joined
    }

    return {
      parse:parse,
      match:match,
      evaluateNode:evaluateNode,
      evaluateState:evaluateState,
      expressionText:expressionText,
      makeGroup:makeGroup,
      makeCondition:makeCondition,
      FIELD_META:FIELD_META,
      OP_META:OP_META
    }
  })()
