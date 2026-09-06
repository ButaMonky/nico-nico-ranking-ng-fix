  var ConfigDialog = (function(_super) {
    var isValidStr = function(s) {
      return typeof s === 'string' && Boolean(s.trim().length)
    }
    var isPositiveInt = function(n) {
      return Number.isSafeInteger(n) && n > 0
    }
    var initCheckbox = function(config, doc, name) {
      var b = doc.getElementById(name)
      b.checked = config[name].value
      b.addEventListener('change', function() {
        config[name].value = b.checked
      })
    }
    var initNumberInput = function(config, doc, name, min, max) {
      var i = doc.getElementById(name)
      i.value = config[name].value
      i.addEventListener('change', function() {
        var n = Math.max(min, Math.trunc(Number(i.value)) || min)
        if (Number.isFinite(max)) n = Math.min(max, n)
        i.value = n
        config[name].value = n
      })
    }
    var initSelect = function(config, doc, name) {
      var s = doc.getElementById(name)
      s.value = config[name].value
      s.addEventListener('change', function() {
        config[name].value = s.value
      })
    }
    var optionOf = function(v) {
      return typeof v === 'object'
           ? new Option(v.value + ',' + v.text, v.value)
           : new Option(v, v)
    }
    var diffBy = function(target) {
      var SOMETHING_INPUT_TEXT = '何か入力して下さい。'
      var POSITIVE_INT_INPUT_TEXT = '1以上の整数を入力して下さい。'
      var movieUrlOf = function(movieId) {
        return 'https://www.nicovideo.jp/watch/' + movieId
      }
      return {
        'ng-movie-id': {
          targetText: 'NG動画ID',
          storeName: 'ngMovies',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf: movieUrlOf,
        },
        'ng-title': {
          targetText: 'NGタイトル',
          storeName: 'ngTitles',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(title) { return 'https://www.nicovideo.jp/search/' + title },
        },
        'ng-tag': {
          targetText: 'NGタグ',
          storeName: 'ngTags',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(tag) { return 'https://www.nicovideo.jp/tag/' + tag },
        },
        'ng-locked-tag': {
          targetText: 'NGタグ(ロック)',
          storeName: 'ngLockedTags',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(tag) { return 'https://www.nicovideo.jp/tag/' + tag },
        },
        'ng-user-id': {
          targetText: 'NGユーザーID',
          storeName: 'ngUserIds',
          convert: Math.trunc,
          isValid(v) { return isPositiveInt(Math.trunc(v)) },
          inputRequestText: POSITIVE_INT_INPUT_TEXT,
          urlOf(userId) { return 'https://www.nicovideo.jp/user/' + userId },
        },
        'ng-user-name': {
          targetText: 'NGユーザー名',
          storeName: 'ngUserNames',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf(userName) { return 'https://www.nicovideo.jp/search/' + userName },
        },
        'ng-channel-id': {
          targetText: 'NGチャンネルID',
          storeName: 'ngChannelIds',
          convert: Math.trunc,
          isValid(v) { return isPositiveInt(Math.trunc(v)) },
          inputRequestText: POSITIVE_INT_INPUT_TEXT,
          urlOf(channelId) { return 'https://ch.nicovideo.jp/ch' + channelId },
        },
        'visited-movie-id': {
          targetText: '閲覧済み動画ID',
          storeName: 'visitedMovies',
          convert(v) { return v },
          isValid: isValidStr,
          inputRequestText: SOMETHING_INPUT_TEXT,
          urlOf: movieUrlOf,
        },
      }[target]
    }
    var promptFor = async function(target, config, defaultValue) {
      var d = diffBy(target)
      var r = ''
      do {
        var msg = r ? `"${r}"は登録済みです。\n` : ''
        r = window.prompt(msg + d.targetText, r || defaultValue || '')
        if (r === null) return ''
        while (!d.isValid(r)) {
          r = window.prompt(d.inputRequestText + '\n' + d.targetText)
          if (r === null) return ''
        }
      } while (!(await config[d.storeName].addAsync(d.convert(r))))
      return r
    }

    var ConfigDialog = function(config, doc, openInTab) {
      _super.call(this)
      this.config = config
      this.doc = doc
      this.openInTab = openInTab
      for (var v of config.ngTitles.array) {
        this._e('list').add(new Option(v, v))
      }
      this._e('removeAllButton').disabled = !config.ngTitles.array.length
      initCheckbox(config, doc, 'openNewWindow')
      initCheckbox(config, doc, 'useGetThumbInfo')
      initCheckbox(config, doc, 'movieInfoTogglable')
      initCheckbox(config, doc, 'descriptionTogglable')
      initCheckbox(config, doc, 'addToNgLockedTags')
      initCheckbox(config, doc, 'unknownContributorMovieVisible')
      initCheckbox(config, doc, 'ngLockedTagCountEnabled')
      initNumberInput(config, doc, 'ngLockedTagCountThreshold', 1, 11)
      initCheckbox(config, doc, 'advancedNgRulesEnabled')
      initCheckbox(config, doc, 'autoFillEnabled')
      initNumberInput(config, doc, 'autoFillTargetCount', 1)
      initNumberInput(config, doc, 'autoFillMaxExtraPages', 0)
      initSelect(config, doc, 'autoFillInfoMode')
      initSelect(config, doc, 'autoFillAdMode')
      initCheckbox(config, doc, 'selfAdWarningEnabled')
      initNumberInput(config, doc, 'thumbInfoConcurrency', 1, 20)
      initCheckbox(config, doc, 'developerMode')
      initSelect(config, doc, 'statusPanelMode')
      initSelect(config, doc, 'detailUiTheme')
      var applyDialogTheme = function() {
        var requested = String(config.detailUiTheme.value || 'auto')
        var resolved = requested
        if (requested === 'auto') {
          var parentTheme = doc.defaultView && doc.defaultView.parent
            && doc.defaultView.parent.document
            && doc.defaultView.parent.document.documentElement.dataset.nrnUiTheme
          resolved = parentTheme || 'light'
        }
        doc.documentElement.dataset.nrnTheme = resolved
      }
      applyDialogTheme()
      config.detailUiTheme.on('changed', applyDialogTheme)
      initNumberInput(config, doc, 'autoFillDetailBatchMax', 8, 100)
      initCheckbox(config, doc, 'spaNavigationFix')
      initSelect(config, doc, 'autoFillPagerMode')
      initCheckbox(config, doc, 'sessionDetailCacheEnabled')
      initCheckbox(config, doc, 'statusAnimationEnabled')
      initSelect(config, doc, 'developerDiagnosticMode')
      initNumberInput(config, doc, 'pagerPreviewCount', 0, 6)
      initNumberInput(config, doc, 'sessionDetailCacheTtlMinutes', 1, 1440)
      initNumberInput(config, doc, 'sessionDetailCacheMaxEntries', 100, 4000)
      this._on('target', 'change', this._targetChanged.bind(this))
      this._on('addButton', 'click', this._addButtonClicked.bind(this))
      this._on('removeButton', 'click', this._removeButtonClicked.bind(this))
      this._on('removeAllButton', 'click', this._removeAllButtonClicked.bind(this))
      this._on('openButton', 'click', this._openButtonClicked.bind(this))
      this._on('closeButton', 'click', this._close.bind(this))
      this.doc.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') this._close()
      }.bind(this))
      this._on('runDeveloperDiagnostics', 'click', this._runDeveloperDiagnostics.bind(this))
      this._on('exportVisibleCheckbox', 'change', this._exportVisibleCheckboxChanged.bind(this))
      this._on('importVisibleCheckbox', 'change', this._importVisibleCheckboxChanged.bind(this))
      this._on('exportButton', 'click', this._exportButtonClicked.bind(this))
      this._on('importButton', 'click', this._importButtonClicked.bind(this))
      var updateButtonsDisabled = this._updateButtonsDisabled.bind(this)
      this._on('target', 'change', updateButtonsDisabled)
      this._on('list', 'change', updateButtonsDisabled)
      this._on('addButton', 'click', updateButtonsDisabled)
      this._on('removeButton', 'click', updateButtonsDisabled)
      this._on('removeAllButton', 'click', updateButtonsDisabled)
      this._initAdvancedNgRuleBuilder()
    }
    ConfigDialog.prototype = createObject(_super.prototype, {
      _e(id) { return this.doc.getElementById(id) },
      _close() {
        if (this._closed) return
        this._closed = true
        this.emit('closed')
      },
      _on(id, eventName, listener) {
        this._e(id).addEventListener(eventName, listener)
      },
      _diffBySelectedTarget() {
        return diffBy(this._e('target').value)
      },
      _updateList() {
        for (var o of Array.from(this._e('list').options)) o.remove()
        var d = this._diffBySelectedTarget()
        for (var val of this.config[d.storeName].arrayWithText) {
          this._e('list').add(optionOf(val))
        }
      },
      _targetChanged() {
        this._updateList()
      },
      _updateButtonsDisabled() {
        var l = this._e('list')
        var d = l.selectedIndex === -1
        this._e('removeButton').disabled = d
        this._e('openButton').disabled = d
        this._e('removeAllButton').disabled = !l.length
      },
      async _addButtonClicked() {
        var r = await promptFor(this._e('target').value, this.config)
        if (r) this._e('list').add(new Option(r, r))
      },
      async _removeButtonClicked() {
        var opts = Array.from(this._e('list').selectedOptions)
        var d = this._diffBySelectedTarget()
        await this.config[d.storeName]
          .removeAsync(opts.map(function(o) { return d.convert(o.value) }))
        for (var o of opts) o.remove()
      },
      _removeAllButtonClicked() {
        var d = this._diffBySelectedTarget()
        if (!window.confirm(`すべての"${d.targetText}"を削除しますか？`)) return
        this.config[d.storeName].clear()
        for (var o of Array.from(this._e('list').options)) o.remove()
      },
      _openButtonClicked() {
        var opts = Array.from(this._e('list').selectedOptions)
        var d = this._diffBySelectedTarget()
        for (var v of opts.map(function(o) { return o.value })) {
          this.openInTab(d.urlOf(v))
        }
      },
      _readAdvancedRules() {
        return AdvancedNgRules.parse(this.config.advancedNgRulesJson.value)
      },
      _saveAdvancedRules(rules) {
        this.config.advancedNgRulesJson.value = JSON.stringify(rules)
        this._renderAdvancedNgRules()
      },
      _lockSvgElement(className) {
        var span = this.doc.createElement('span')
        span.className = className || 'advancedLockSvg'
        span.setAttribute('aria-hidden', 'true')
        span.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M18 7h-1V5.98a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4V7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M9.53 17.16l1.14-1.97.51-.87a2 2 0 0 1 .83-3.82c.7 0 1.32.36 1.67.91q.32.48.33 1.09a2 2 0 0 1-1.17 1.82l1.64 2.84a.23.23 0 0 1-.2.34H9.74a.23.23 0 0 1-.2-.34zM9 5.98c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2V7H9z"></path></svg>'
        return span
      },
      _friendlyOperatorLabel(field, operator) {
        // タグ系は配列中の「タグ名1個」との完全一致。
        // タイトル/説明文/投稿者名/動画IDは通常の文字列比較。
        if (field === 'tag') {
          if (operator === 'contains') return '指定したタグ名がある（完全一致）'
          if (operator === 'notContains') return '指定したタグ名がない（完全一致）'
          if (operator === 'exists') return 'タグが1個以上ある'
          if (operator === 'notExists') return 'タグが1個もない'
        }

        if (field === 'lockedTag') {
          if (operator === 'contains') return '指定した🔒タグロック名がある（完全一致）'
          if (operator === 'notContains') return '指定した🔒タグロック名がない（完全一致）'
          if (operator === 'exists') return '🔒タグロックが1個以上ある'
          if (operator === 'notExists') return '🔒タグロックが1個もない'
        }

        if (field === 'title') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '文字列が完全一致（=）'
          if (operator === 'neq') return '文字列が完全一致しない（≠）'
          if (operator === 'exists') return 'タイトルが空ではない'
          if (operator === 'notExists') return 'タイトルが空'
        }

        if (field === 'description') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '文字列が完全一致（=）'
          if (operator === 'neq') return '文字列が完全一致しない（≠）'
          if (operator === 'exists') return '説明文が空ではない'
          if (operator === 'notExists') return '説明文が空'
        }

        if (field === 'contributorName') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '名前が完全一致（=）'
          if (operator === 'neq') return '名前が完全一致しない（≠）'
          if (operator === 'exists') return '投稿者名が取得できる'
          if (operator === 'notExists') return '投稿者名が取得できない'
        }

        if (field === 'movieId') {
          if (operator === 'contains') return '文字列を含む（部分一致）'
          if (operator === 'notContains') return '文字列を含まない（部分一致）'
          if (operator === 'eq') return '動画IDが完全一致（=）'
          if (operator === 'neq') return '動画IDが完全一致しない（≠）'
        }
        if (field === 'selfAdIdMatch') {
          if (operator === 'isTrue') return '一致する（高信頼）'
          if (operator === 'isFalse') return '一致しない'
        }
        if (field === 'selfAdNameMatch') {
          if (operator === 'isTrue') return '一致する（名前一致・参考）'
          if (operator === 'isFalse') return '一致しない'
        }

        if (operator === 'exists') {
          if (field === 'userId') return 'IDがある'
          if (field === 'channelId') return 'IDがある'
          if (field === 'contributorId') return '投稿者IDがある'
        }
        if (operator === 'notExists') {
          if (field === 'userId') return 'IDがない（退会済みなど）'
          if (field === 'channelId') return 'IDがない'
          if (field === 'contributorId') return '投稿者IDがない（退会済みなど）'
        }

        var generic = AdvancedNgRules.OP_META[operator]
          ? AdvancedNgRules.OP_META[operator].label : operator
        return generic
      },
      _operatorHelpText(field, operator) {
        if (field === 'tag' && operator === 'contains')
          return '動画に付いているタグの中に、入力したタグ名と完全に同じタグが1個以上ある場合に一致します。部分一致ではありません。'
        if (field === 'tag' && operator === 'notContains')
          return '入力したタグ名と完全に同じタグが1個もない場合に一致します。部分一致ではありません。'
        if (field === 'lockedTag' && operator === 'contains')
          return 'ロック済みタグだけを対象に、入力したタグ名と完全に同じ🔒タグロックがある場合に一致します。部分一致ではありません。'
        if (field === 'lockedTag' && operator === 'notContains')
          return 'ロック済みタグの中に、入力したタグ名と完全に同じ🔒タグロックがない場合に一致します。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'contains')
          return '入力した文字列が対象の文章・名前・IDの一部に含まれていれば一致します。これは部分一致です。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'notContains')
          return '入力した文字列が対象の文章・名前・IDのどこにも含まれていない場合に一致します。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'eq')
          return '先頭から末尾まで文字列全体が同じ場合だけ一致します。これは完全一致です。'
        if (['title','description','contributorName','movieId'].includes(field)
            && operator === 'neq')
          return '文字列全体が完全一致しない場合に一致します。'

        if (field === 'selfAdIdMatch' && operator === 'isTrue')
          return '広告者ユーザーIDと投稿者ユーザーIDが同じ場合に一致します。ID比較なので高信頼です。'
        if (field === 'selfAdNameMatch' && operator === 'isTrue')
          return '広告者名と投稿者名が同じ場合に一致します。表示名は重複・変更できるため参考条件です。'
        if ((field === 'selfAdIdMatch' || field === 'selfAdNameMatch') && operator === 'isFalse')
          return '一致が検出されなかった場合に一致します。通信エラー時は不一致と断定しません。'
        if (operator === 'gt') return '指定した値より大きい場合に一致します。記号では「>」です。'
        if (operator === 'gte') return '指定した値と同じ、またはそれより大きい場合に一致します。記号では「≥」です。'
        if (operator === 'lt') return '指定した値より小さい場合に一致します。記号では「<」です。'
        if (operator === 'lte') return '指定した値と同じ、またはそれより小さい場合に一致します。記号では「≤」です。'
        if (operator === 'eq') return '指定した値と完全に等しい場合に一致します。記号では「=」です。'
        if (operator === 'neq') return '指定した値と等しくない場合に一致します。記号では「≠」です。'
        if (operator === 'contains') return '指定した値を含む場合に一致します。'
        if (operator === 'notContains') return '指定した値を含まない場合に一致します。'

        if (operator === 'exists') {
          if (field === 'userId' || field === 'contributorId')
            return '投稿者のIDを正常に取得できる場合に一致します。'
          if (field === 'tag') return 'タグが1個以上付いている場合に一致します。タグ名の指定はしません。'
          if (field === 'lockedTag') return 'ロック済みタグが1個以上ある場合に一致します。タグ名の指定はしません。'
          return 'その情報が空ではなく、取得できている場合に一致します。'
        }
        if (operator === 'notExists') {
          if (field === 'userId' || field === 'contributorId')
            return '投稿者IDを取得できない場合に一致します。退会済みユーザーなどが該当します。通信エラーは一致扱いにしません。'
          if (field === 'tag') return 'タグが1個も付いていない場合に一致します。'
          if (field === 'lockedTag') return 'ロック済みタグが1個もない場合に一致します。'
          return 'その情報が空、または取得できない場合に一致します。'
        }
        return ''
      },
      _newAdvancedRule(enabled) {
        var root = AdvancedNgRules.makeGroup('AND')
        root.children.push(AdvancedNgRules.makeCondition('lockedTagCount'))
        return {
          id:'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
          name:'新しい論理NGルール',
          enabled:enabled !== false,
          expression:root
        }
      },
      _initAdvancedNgRuleBuilder() {
        var add = this._e('advancedRuleAddButton')
        var sample = this._e('advancedRuleSampleButton')
        if (!add || !sample) return

        add.addEventListener('click', function() {
          var rules = this._readAdvancedRules()
          rules.push(this._newAdvancedRule(true))
          this._saveAdvancedRules(rules)
        }.bind(this))

        sample.addEventListener('click', function() {
          var rules = this._readAdvancedRules()
          var root = AdvancedNgRules.makeGroup('AND')
          root.children = [
            {kind:'condition',field:'lockedTagCount',operator:'eq',value:11,not:false},
            {kind:'condition',field:'tag',operator:'contains',value:'ホモと見るシリーズ',not:false},
            {kind:'condition',field:'tag',operator:'contains',value:'本編改造淫夢',not:false},
            {kind:'condition',field:'contributorId',operator:'notExists',value:'',not:false}
          ]
          rules.push({
            id:'rule-' + Date.now() + '-sample',
            name:'例：検索妨害（編集して使用）',
            enabled:false,
            expression:root
          })
          this._saveAdvancedRules(rules)
        }.bind(this))

        this._renderAdvancedNgRules()
      },
      _renderAdvancedNgRules() {
        var container = this._e('advancedRuleList')
        var count = this._e('advancedRuleCount')
        if (!container) return

        var rules = this._readAdvancedRules()
        if (count) count.textContent = rules.length + '件'
        container.textContent = ''

        if (!rules.length) {
          var empty = this.doc.createElement('div')
          empty.className = 'advancedRuleEmpty'
          empty.textContent = '論理NGルールはまだありません。「ルールを追加」または「サンプルを追加」から作成できます。'
          container.appendChild(empty)
          return
        }

        var operatorOptionsFor = function(field) {
          var meta = AdvancedNgRules.FIELD_META[field]
          return meta ? meta.operators : []
        }

        var defaultValueFor = function(field) {
          if (field === 'lockedTagCount') return 11
          if (field === 'tagCount') return 1
          return ''
        }

        rules.forEach(function(rule, ruleIndex) {
          var card = this.doc.createElement('div')
          card.className = 'advancedRuleCard logicRuleCard'
          card.classList.toggle('disabled', !rule.enabled)

          var head = this.doc.createElement('div')
          head.className = 'advancedRuleHead'

          var enabled = this.doc.createElement('input')
          enabled.type = 'checkbox'
          enabled.checked = rule.enabled !== false
          enabled.title = 'このルールだけをON/OFFします。'

          var name = this.doc.createElement('input')
          name.type = 'text'
          name.value = rule.name
          name.className = 'advancedRuleName'
          name.placeholder = 'ルール名'

          var del = this.doc.createElement('button')
          del.type = 'button'
          del.textContent = '削除'
          del.className = 'danger'

          head.appendChild(enabled)
          head.appendChild(name)
          head.appendChild(del)
          card.appendChild(head)

          var preview = this.doc.createElement('div')
          preview.className = 'logicExpressionPreview'
          card.appendChild(preview)

          var rootHost = this.doc.createElement('div')
          rootHost.className = 'logicRootHost'
          card.appendChild(rootHost)

          var saveNow = function(renderAgain) {
            var all = this._readAdvancedRules()
            if (!all[ruleIndex]) return
            all[ruleIndex] = rule
            this.config.advancedNgRulesJson.value = JSON.stringify(all)
            preview.textContent = '式: ' + AdvancedNgRules.expressionText(rule.expression)
            if (renderAgain) renderRoot()
          }.bind(this)

          enabled.addEventListener('change', function() {
            rule.enabled = enabled.checked
            card.classList.toggle('disabled', !rule.enabled)
            saveNow(false)
          })
          name.addEventListener('change', function() {
            rule.name = name.value.trim() || ('ルール ' + (ruleIndex + 1))
            name.value = rule.name
            saveNow(false)
          })
          del.addEventListener('click', function() {
            if (!window.confirm('「' + rule.name + '」を削除しますか？')) return
            var all = this._readAdvancedRules()
            all.splice(ruleIndex, 1)
            this._saveAdvancedRules(all)
          }.bind(this))

          var renderCondition = function(node, parentGroup, index, depth) {
            var row = this.doc.createElement('div')
            row.className = 'logicConditionRow'
            row.style.setProperty('--logic-depth', String(depth))

            var notLabel = this.doc.createElement('label')
            notLabel.className = 'logicNotToggle'
            var notCheck = this.doc.createElement('input')
            notCheck.type = 'checkbox'
            notCheck.checked = Boolean(node.not)
            notLabel.appendChild(notCheck)
            notLabel.appendChild(this.doc.createTextNode('条件を反対にする（NOT）'))

            var field = this.doc.createElement('select')
            field.className = 'logicField'
            Object.keys(AdvancedNgRules.FIELD_META).forEach(function(key) {
              var meta = AdvancedNgRules.FIELD_META[key]
              field.add(new Option(meta.label, key))
            })
            field.value = node.field
            field.title = '比較したい情報を選びます。タグ名と文字列、個数は別の項目です。'

            var lockSpot = this.doc.createElement('span')
            lockSpot.className = 'logicFieldIcon'
            var updateLockSpot = function() {
              lockSpot.textContent = ''
              if (field.value === 'lockedTag' || field.value === 'lockedTagCount') {
                lockSpot.appendChild(this._lockSvgElement('advancedLockSvg small'))
              }
            }.bind(this)
            updateLockSpot()

            var operator = this.doc.createElement('select')
            operator.className = 'logicOperator'

            var value = this.doc.createElement('input')
            value.className = 'logicValue'

            var remove = this.doc.createElement('button')
            remove.type = 'button'
            remove.className = 'logicRemove'
            remove.textContent = '×'
            remove.title = 'この条件を削除'

            var rebuildOperator = function() {
              operator.textContent = ''
              operatorOptionsFor(node.field).forEach(function(opKey) {
                operator.add(new Option(
                  this._friendlyOperatorLabel(node.field, opKey), opKey))
              }.bind(this))
              if (!operatorOptionsFor(node.field).includes(node.operator)) {
                node.operator = operatorOptionsFor(node.field)[0]
              }
              operator.value = node.operator
              operator.title = this._operatorHelpText(node.field, node.operator)

              var fm = AdvancedNgRules.FIELD_META[node.field]
              var om = AdvancedNgRules.OP_META[node.operator]
              var numeric = fm && (fm.type === 'number' || fm.type === 'numberOrMissing')
              value.type = numeric ? 'number' : 'text'
              if (node.field === 'lockedTagCount' || node.field === 'tagCount') {
                value.min = '0'
                value.max = '11'
              } else {
                value.removeAttribute('min')
                value.removeAttribute('max')
              }
              value.style.display = om && om.needsValue === false ? 'none' : ''
              value.value = node.value == null ? '' : node.value

              if (node.field === 'tag') value.placeholder = '例：本編改造淫夢'
              else if (node.field === 'lockedTag') value.placeholder = '例：ホモと見るシリーズ'
              else if (node.field === 'title') value.placeholder = 'タイトルに探す文字列'
              else if (node.field === 'description') value.placeholder = '説明文に探す文字列'
              else if (node.field === 'contributorName') value.placeholder = '投稿者名'
              else if (node.field === 'movieId') value.placeholder = '例：sm12345678'
              else if (node.field === 'lockedTagCount') value.placeholder = '例：11'
              else if (node.field === 'tagCount') value.placeholder = '例：5'
              else if (['userId','channelId','contributorId'].includes(node.field))
                value.placeholder = '数値ID'
              else value.placeholder = ''
            }.bind(this)
            rebuildOperator()

            notCheck.addEventListener('change', function() {
              node.not = notCheck.checked
              saveNow(false)
            })
            field.addEventListener('change', function() {
              node.field = field.value
              var ops = operatorOptionsFor(node.field)
              node.operator = ops[0]
              node.value = defaultValueFor(node.field)
              updateLockSpot()
              rebuildOperator()
              saveNow(false)
            })
            operator.addEventListener('change', function() {
              node.operator = operator.value
              rebuildOperator()
              saveNow(false)
            })
            value.addEventListener('change', function() {
              var fm = AdvancedNgRules.FIELD_META[node.field]
              if (fm && (fm.type === 'number' || fm.type === 'numberOrMissing')) {
                var n = Number(value.value)
                node.value = Number.isFinite(n) ? n : 0
              } else {
                node.value = value.value.trim()
              }
              value.value = node.value
              saveNow(false)
            })
            remove.addEventListener('click', function() {
              parentGroup.children.splice(index, 1)
              saveNow(true)
            })

            row.appendChild(notLabel)
            row.appendChild(lockSpot)
            row.appendChild(field)
            row.appendChild(operator)
            row.appendChild(value)
            row.appendChild(remove)
            return row
          }.bind(this)

          var renderGroup = function(group, parentGroup, index, depth, isRoot) {
            var box = this.doc.createElement('div')
            box.className = 'logicGroup'
            box.dataset.logicDepth = String(depth)

            var toolbar = this.doc.createElement('div')
            toolbar.className = 'logicGroupToolbar'

            var op = this.doc.createElement('select')
            op.className = 'logicGroupOp'
            op.add(new Option('すべて満たす（AND / 論理積）', 'AND'))
            op.add(new Option('どれか1つ以上満たす（OR / 論理和）', 'OR'))
            op.value = group.op === 'OR' ? 'OR' : 'AND'
            op.title = 'このグループ内の条件をAND/ORで結合します。'

            var notLabel = this.doc.createElement('label')
            notLabel.className = 'logicNotToggle groupNot'
            var notCheck = this.doc.createElement('input')
            notCheck.type = 'checkbox'
            notCheck.checked = Boolean(group.not)
            notLabel.appendChild(notCheck)
            notLabel.appendChild(this.doc.createTextNode('このグループを否定する（NOT / 論理否定）'))

            var addCondition = this.doc.createElement('button')
            addCondition.type = 'button'
            addCondition.textContent = '＋ 条件'
            addCondition.title = 'このグループに比較条件を追加'

            var addGroup = this.doc.createElement('button')
            addGroup.type = 'button'
            addGroup.textContent = '＋ AND/OR グループ'
            addGroup.title = 'AND/ORを入れ子にした新しい論理グループを追加'

            toolbar.appendChild(op)
            toolbar.appendChild(notLabel)
            toolbar.appendChild(addCondition)
            toolbar.appendChild(addGroup)

            if (!isRoot) {
              var removeGroup = this.doc.createElement('button')
              removeGroup.type = 'button'
              removeGroup.textContent = 'グループ削除'
              removeGroup.className = 'danger'
              removeGroup.addEventListener('click', function() {
                parentGroup.children.splice(index, 1)
                saveNow(true)
              })
              toolbar.appendChild(removeGroup)
            }

            box.appendChild(toolbar)

            var children = this.doc.createElement('div')
            children.className = 'logicChildren'
            box.appendChild(children)

            if (!group.children.length) {
              var blank = this.doc.createElement('div')
              blank.className = 'logicEmptyGroup'
              blank.textContent = '条件なし（安全のためこのグループはFALSE扱い）'
              children.appendChild(blank)
            }

            group.children.forEach(function(child, childIndex) {
              if (child.kind === 'group') {
                children.appendChild(renderGroup(
                  child, group, childIndex, depth + 1, false))
              } else {
                children.appendChild(renderCondition(
                  child, group, childIndex, depth + 1))
              }
            })

            op.addEventListener('change', function() {
              group.op = op.value
              saveNow(false)
            })
            notCheck.addEventListener('change', function() {
              group.not = notCheck.checked
              saveNow(false)
            })
            addCondition.addEventListener('click', function() {
              group.children.push(AdvancedNgRules.makeCondition('tag'))
              saveNow(true)
            })
            addGroup.addEventListener('click', function() {
              var g = AdvancedNgRules.makeGroup('AND')
              g.children.push(AdvancedNgRules.makeCondition('lockedTagCount'))
              group.children.push(g)
              saveNow(true)
            })

            return box
          }.bind(this)

          var renderRoot = function() {
            rootHost.textContent = ''
            rootHost.appendChild(renderGroup(
              rule.expression, null, -1, 0, true))
            preview.textContent = '式: ' + AdvancedNgRules.expressionText(rule.expression)
          }

          renderRoot()
          container.appendChild(card)
        }.bind(this))
      },
      _runDeveloperDiagnostics() {
        var status = this._e('developerDiagnosticStatus')
        status.textContent = '診断を開始しました。結果はConsoleと右下ステータスに出力されます。'
        status.className = 'statusNote running'
        if (typeof this.config._nrnDiagnosticHook === 'function') {
          this.config._nrnDiagnosticHook('manual-developer-suite', {from: 'config-dialog'})
        } else {
          status.textContent = '現在のページでは診断コントローラーがまだ準備できていません。'
          status.className = 'statusNote warning'
        }
      },
      _exportVisibleCheckboxChanged() {
        var n = this._e('exportVisibleCheckbox').checked ? 'remove' : 'add'
        this._e('exportContainer').classList[n]('isHidden')
      },
      _importVisibleCheckboxChanged() {
        var n = this._e('importVisibleCheckbox').checked ? 'remove' : 'add'
        this._e('importContainer').classList[n]('isHidden')
      },
      async _exportButtonClicked() {
        var textarea = this._e('exportTextarea')
        textarea.value = await this.config.toCSV({
          ngMovieId: this._e('exportNgMovieIdCheckbox').checked,
          ngTitle: this._e('exportNgTitleCheckbox').checked,
          ngTag: this._e('exportNgTagCheckbox').checked,
          ngUserId: this._e('exportNgUserIdCheckbox').checked,
          ngUserName: this._e('exportNgUserNameCheckbox').checked,
          ngChannelId: this._e('exportNgChannelIdCheckbox').checked,
          visitedMovieId: this._e('exportVisitedMovieIdCheckbox').checked,
        })
        textarea.focus()
        textarea.select()
      },
      async _importButtonClicked() {
        await this.config.addFromCSV(this._e('importTextarea').value)
        this._updateList()
        this._e('importTextarea').value = ''
      },
    })
    ConfigDialog.promptNgTitle = function(config, defaultValue) {
      promptFor('ng-title', config, defaultValue)
    }
    ConfigDialog.promptNgUserName = function(config, defaultValue) {
      promptFor('ng-user-name', config, defaultValue)
    }
    ConfigDialog.SRCDOC = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root {
    color-scheme: light dark;
    --bg: #f5f6f8;
    --panel: #ffffff;
    --panel2: #f8f9fb;
    --text: #202124;
    --muted: #67707a;
    --line: #dde1e6;
    --accent: #246bfd;
    --accent-soft: #eaf0ff;
    --danger: #c53b3b;
    --ok: #238636;
    --warn: #9a6700;
    --shadow: 0 12px 36px rgba(0,0,0,.18);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-nrn-theme]) {
      --bg: #17191c;
      --panel: #22252a;
      --panel2: #292d33;
      --text: #f2f3f5;
      --muted: #aeb5bf;
      --line: #3a4048;
      --accent: #7aa2ff;
      --accent-soft: #243252;
      --danger: #ff7b72;
      --ok: #56d364;
      --warn: #e3b341;
      --shadow: 0 12px 40px rgba(0,0,0,.45);
    }
  }
  :root[data-nrn-theme=dark] {
    color-scheme: dark;
    --bg: #1d2126;
    --panel: #24292f;
    --panel2: #2a3037;
    --text: #d9dfe7;
    --muted: #9fa9b5;
    --line: #3b434d;
    --accent: #7fa9ee;
    --accent-soft: #273650;
    --danger: #e9827c;
    --ok: #68c982;
    --warn: #d5b467;
    --shadow: 0 12px 40px rgba(0,0,0,.38);
  }
  :root[data-nrn-theme=light] { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin:0; min-height:100%; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); background:transparent; }
  body { display:flex; align-items:center; justify-content:center; padding:24px; }
  .dialog {
    width:min(920px, calc(100vw - 32px));
    max-height:calc(100vh - 32px);
    overflow:auto;
    background:var(--bg);
    border:1px solid var(--line);
    border-radius:16px;
    box-shadow:var(--shadow);
  }
  .header {
    position:sticky; top:0; z-index:5;
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:16px 20px;
    background:color-mix(in srgb, var(--panel) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom:1px solid var(--line);
  }
  .title { font-size:18px; font-weight:700; }
  .subtitle { color:var(--muted); font-size:12px; margin-top:2px; }
  .tabbar {
    position:sticky; top:65px; z-index:4;
    display:flex; gap:6px; padding:10px 16px;
    overflow-x:auto; background:color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter:blur(10px); border-bottom:1px solid var(--line);
  }
  .tabButton {
    white-space:nowrap; border-radius:999px; padding:7px 12px; font-size:13px;
  }
  .tabButton.active {
    background:var(--accent); color:#fff; border-color:var(--accent); font-weight:700;
  }
  [data-tab-panel] { display:none; }
  [data-tab-panel].active { display:block; }
  .content { padding:16px; display:grid; gap:12px; }
  details.card, .card {
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:12px;
    overflow:hidden;
  }
  details.card > summary {
    cursor:pointer; list-style:none; padding:14px 16px; font-weight:700;
    display:flex; align-items:center; gap:8px;
    user-select:none;
  }
  details.card > summary::-webkit-details-marker { display:none; }
  details.card > summary::before { content:'›'; font-size:20px; transition:.15s; color:var(--muted); }
  details.card[open] > summary::before { transform:rotate(90deg); }
  .sectionBody { padding:0 16px 16px; display:grid; gap:10px; }
  .row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; min-height:32px; }
  .row.stack { align-items:flex-start; flex-direction:column; }
  .row > label { display:flex; align-items:center; gap:7px; }
  .muted, small { color:var(--muted); }
  .hint { background:var(--panel2); border-left:3px solid var(--accent); padding:9px 11px; border-radius:7px; color:var(--muted); font-size:12px; line-height:1.55; }
  .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .grid2 > .row {
    min-width:0; align-items:stretch; padding:10px 12px;
    background:var(--panel2); border:1px solid var(--line); border-radius:10px;
  }
  .grid2 > .row > label { width:100%; min-width:0; }
  .grid2 > .row > label:has(select),
  .grid2 > .row > label:has(input[type=number]) {
    display:grid; grid-template-columns:minmax(118px,auto) minmax(0,1fr);
    align-items:center; gap:10px;
  }
  .grid2 > .row select { width:100%; min-width:0; }
  .grid2 > .row input[type=number] { justify-self:start; }
  .row.stack {
    padding:10px 12px; background:var(--panel2);
    border:1px solid var(--line); border-radius:10px;
  }
  .row.stack > label {
    width:100%; display:grid; grid-template-columns:140px minmax(0,1fr); gap:10px;
  }
  .row.stack select { width:100%; }
  .settingHelp {
    display:inline-flex; align-items:center; justify-content:center;
    width:18px; height:18px; margin-left:4px; border-radius:50%;
    border:1px solid var(--line); color:var(--muted); font-size:11px;
    cursor:help; vertical-align:middle; background:var(--panel);
  }
  .settingHelp:hover { color:var(--accent); border-color:var(--accent); }
  .sectionTitle {
    margin:4px 0 -2px; color:var(--muted); font-size:11px;
    font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  }
  .advancedRuleList { display:grid; gap:10px; }
  .advancedRuleEmpty {
    padding:14px; border:1px dashed var(--line); border-radius:10px;
    color:var(--muted); text-align:center; background:var(--panel2);
  }
  .advancedRuleCard {
    padding:12px; border:1px solid var(--line); border-radius:12px;
    background:var(--panel2); display:grid; gap:9px;
  }
  .advancedRuleCard.disabled { opacity:.58; }
  .advancedRuleHead {
    display:grid; grid-template-columns:auto minmax(0,1fr) auto;
    align-items:center; gap:8px;
  }
  .advancedRuleName {
    width:100%; font-weight:700; background:var(--panel);
    color:var(--text); border:1px solid var(--line); border-radius:7px; padding:7px 9px;
  }
  .advancedRuleLogic { font-size:11px; color:var(--muted); }
  .advancedConditions { display:grid; gap:7px; }
  .advancedConditionRow {
    display:grid; grid-template-columns:minmax(180px,.9fr) minmax(180px,1.2fr) auto;
    gap:7px; align-items:center;
  }
  .advancedConditionRow select, .advancedConditionRow input { width:100%; min-width:0; }
  .advancedAddCondition { justify-self:start; }
  .inlineLockIcon, .advancedLockSvg {
    display:inline-flex; align-items:center; justify-content:center;
    vertical-align:-3px; fill:currentColor;
  }
  .inlineLockIcon { margin-right:5px; }
  .advancedLockSvg.small svg { width:15px; height:15px; }
  .lockText { white-space:nowrap; font-weight:700; }
  .logicExpressionPreview {
    font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
    font-size:11px; line-height:1.5; color:var(--muted);
    padding:7px 9px; border-radius:8px; background:var(--panel);
    border:1px solid var(--line); overflow-wrap:anywhere;
  }
  .logicGroup {
    --logic-accent: color-mix(in srgb, var(--accent) 42%, var(--line));
    border:1px solid var(--logic-accent); border-left-width:4px;
    border-radius:10px; padding:9px; background:var(--panel);
    display:grid; gap:8px;
  }
  .logicGroup[data-logic-depth="1"] { margin-left:14px; }
  .logicGroup[data-logic-depth="2"] { margin-left:28px; }
  .logicGroup[data-logic-depth="3"] { margin-left:42px; }
  .logicGroupToolbar {
    display:flex; flex-wrap:wrap; gap:6px; align-items:center;
  }
  .logicGroupOp { min-width:170px; font-weight:700; }
  .logicNotToggle {
    display:inline-flex !important; width:auto !important;
    align-items:center !important; gap:4px !important;
    grid-template-columns:none !important; white-space:nowrap;
    padding:4px 7px; border:1px solid var(--line); border-radius:7px;
    background:var(--panel2);
  }
  .logicNotToggle.groupNot { font-weight:700; }
  .logicChildren { display:grid; gap:7px; }
  .logicConditionRow {
    display:grid;
    grid-template-columns:auto 20px minmax(155px,1fr) minmax(135px,.9fr) minmax(120px,1fr) auto;
    gap:6px; align-items:center;
    padding:7px; border-radius:8px; background:var(--panel2);
    border:1px solid var(--line);
  }
  .logicFieldIcon { display:flex; width:20px; justify-content:center; color:var(--accent); }
  .logicConditionRow select, .logicConditionRow input { width:100%; min-width:0; }
  .logicRemove { min-width:34px; }
  .logicEmptyGroup {
    color:var(--muted); font-size:11px; padding:8px;
    border:1px dashed var(--line); border-radius:7px;
  }
  .logicHelpDetails {
    border:1px solid var(--line); border-radius:10px; background:var(--panel2);
  }
  .logicHelpDetails > summary {
    cursor:pointer; padding:10px 12px; font-weight:700; color:var(--text);
  }
  .logicHelpBody {
    padding:0 14px 12px; color:var(--muted); font-size:12px; line-height:1.65;
  }
  .logicHelpBody p { margin:7px 0; }
  .logicHelpBody ul { margin:7px 0 7px 22px; padding:0; }
  .logicHelpBody hr { border:0; border-top:1px solid var(--line); margin:12px 0; }
  .logicExample {
    padding:11px 13px; border-radius:10px; background:var(--accent-soft);
    border:1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    line-height:1.7; font-size:12px;
  }
  @media(max-width:700px) {
    .advancedConditionRow { grid-template-columns:1fr auto; }
    .advancedConditionRow select { grid-column:1 / -1; }
    .logicConditionRow {
      grid-template-columns:auto 20px minmax(0,1fr) auto;
    }
    .logicConditionRow .logicOperator,
    .logicConditionRow .logicValue { grid-column:3 / 5; }
  }
  @media(max-width:700px){ .grid2{grid-template-columns:1fr;} body{padding:8px;} .dialog{width:100%;max-height:calc(100vh - 16px);} }
  input[type=number], select, textarea {
    background:var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:7px;
    padding:6px 8px; font:inherit;
  }
  input[type=number] { width:74px; }
  select { max-width:100%; }
  textarea { width:100%; min-height:76px; resize:vertical; }
  button, input[type=button] {
    border:1px solid var(--line); background:var(--panel2); color:var(--text);
    border-radius:8px; padding:7px 11px; cursor:pointer; font:inherit;
  }
  button:hover, input[type=button]:hover { border-color:var(--accent); }
  .primary { background:var(--accent); color:white; border-color:var(--accent); font-weight:700; }
  .danger { color:var(--danger); }
  .listButtonsWrap { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
  .listButtonsWrap .list select { width:100%; min-height:220px; }
  .listButtonsWrap .buttons { display:flex; flex-direction:column; gap:6px; }
  .isHidden { display:none; }
  .statusNote { font-size:12px; color:var(--muted); padding:8px 10px; border-radius:7px; background:var(--panel2); }
  .statusNote.running { color:var(--accent); }
  .statusNote.warning { color:var(--warn); }
  .pill { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; color:var(--muted); }
  .footer { padding:12px 16px 18px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
  a { color:var(--accent); }
</style></head><body>
  <div class=dialog>
    <div class=header>
      <div><div class=title>Nico Nico Ranking NG</div><div class=subtitle>フィルター・自動継ぎ足し・診断設定</div></div>
      <input class=primary type=button value="閉じる" id=closeButton>
    </div>
    <div class=tabbar role=tablist>
      <button class="tabButton active" type=button data-tab=filter>NG・フィルター</button>
      <button class=tabButton type=button data-tab=autofill>自動継ぎ足し</button>
      <button class=tabButton type=button data-tab=display>表示・操作</button>
      <button class=tabButton type=button data-tab=developer>開発者・診断</button>
      <button class=tabButton type=button data-tab=data>データ管理</button>
    </div>
    <div class=content>
      <div data-tab-panel=filter class=active><details class=card open>
        <summary>NGリスト</summary>
        <div class=sectionBody>
          <div class=row><label>種類 <select id=target>
            <option value=ng-movie-id>NG動画ID</option><option value=ng-title selected>NGタイトル</option>
            <option value=ng-tag>NGタグ</option><option value=ng-locked-tag>NGタグ(ロック)</option>
            <option value=ng-user-id>NGユーザーID</option><option value=ng-user-name>NGユーザー名</option>
            <option value=ng-channel-id>NGチャンネルID</option><option value=visited-movie-id>閲覧済み動画ID</option>
          </select></label></div>
          <div class=listButtonsWrap>
            <div class=list><select multiple size=10 id=list></select></div>
            <div class=buttons>
              <input type=button value=追加 id=addButton>
              <input type=button value=削除 disabled id=removeButton>
              <input type=button class=danger value=全削除 disabled id=removeAllButton>
              <input type=button value=開く disabled id=openButton>
            </div>
          </div>
        </div>
      </details>

      <details class=card open>
        <summary>NG判定</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=unknownContributorMovieVisible>削除された投稿者の動画を表示する</label></div>
          <div class=row><label><input type=checkbox id=addToNgLockedTags>ロックタグを[+]で登録するとき「NGタグ(ロック)」へ追加</label></div>
          <div class=row><label><input type=checkbox id=ngLockedTagCountEnabled>🔒 タグロックが <input type=number id=ngLockedTagCountThreshold min=1 max=11> 個以上ならNG</label><span class=pill>1～11</span></div>
          <div class=hint>従来の単独NG条件です。「ロックタグ11個だけでは正常動画も巻き込む」場合は、下の複合NGルールを使うと条件をANDで組み合わせられます。</div>
        </div>
      </details>

      <details class=card open>
        <summary><span class=inlineLockIcon aria-hidden=true><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M18 7h-1V5.98a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4V7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M9.53 17.16l1.14-1.97.51-.87a2 2 0 0 1 .83-3.82c.7 0 1.32.36 1.67.91q.32.48.33 1.09a2 2 0 0 1-1.17 1.82l1.64 2.84a.23.23 0 0 1-.2.34H9.74a.23.23 0 0 1-.2-.34zM9 5.98c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2V7H9z"></path></svg></span>論理NGルール <span id=advancedRuleCount class=pill>0件</span></summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=advancedNgRulesEnabled>複合NGルールを有効にする</label></div>
          <div class=hint>
            <b>論理NGルール</b>は、複数の条件を組み合わせて「この条件に当てはまる動画だけNG」にする機能です。<br>
            <b>AND（論理積）</b> = すべて満たす / <b>OR（論理和）</b> = どれか1つ以上満たす / <b>NOT（論理否定）</b> = 条件の結果を反対にする、という意味です。<br>
            タイトル・説明文などは<b>文字列の部分一致 / 完全一致</b>、タグ・🔒タグロックは<b>タグ名1個との完全一致</b>、タグ数は<b>数値比較</b>として扱います。普通はまず <b>AND（すべて満たす）</b> を使えば十分です。
          </div>

          <details class=logicHelpDetails>
            <summary>📘 論理ルールの詳しい使い方・用語解説</summary>
            <div class=logicHelpBody>
              <p><b>条件式</b>：1つの判定です。例「🔒 タグロック数が 11以上」。</p>
              <p><b>条件グループ</b>：複数の条件式を AND / OR でまとめたものです。</p>
              <p><b>AND（論理積）</b>：グループ内の条件をすべて満たしたときだけ成立します。</p>
              <p><b>OR（論理和）</b>：グループ内の条件を1つ以上満たせば成立します。</p>
              <p><b>NOT（論理否定）</b>：条件やグループの結果を反転します。初心者の方はまず「含まない」「IDがない」などの直接的な条件を使う方が分かりやすいです。</p>
              <p><b>入れ子（ネスト）</b>：条件グループの中へさらに別の条件グループを入れることです。例：A AND (B OR C)。</p>
              <hr>
              <p><b>文字列</b>：タイトル・説明文・投稿者名・動画IDなど、文字の並びとして扱う値です。</p>
              <p><b>部分一致</b>：入力した文字列が、対象の文字列の一部分に含まれていれば一致します。例：「改造」を検索すると「本編改造淫夢」に一致します。</p>
              <p><b>完全一致</b>：先頭から末尾まで文字列全体が同じ場合だけ一致します。例：「本編改造淫夢」は「本編改造淫夢」に一致しますが、「改造淫夢」には一致しません。</p>
              <p><b>タグ / 🔒タグロックの文字列比較</b>：タグは1個ずつ独立した名前として比較します。「指定したタグ名がある」は<b>タグ名の完全一致</b>です。タグ名の一部分だけでは一致しません。</p>
              <p><b>タグ数 / 🔒タグロック数</b>：タグの名前ではなく、何個付いているかを数値で比較する項目です。</p>
              <hr>
              <p><b>比較演算子</b></p>
              <ul>
                <li><b>より大きい（&gt;）</b>：指定値より大きい</li>
                <li><b>以上（≥）</b>：指定値と同じ、または大きい</li>
                <li><b>未満（&lt;）</b>：指定値より小さい</li>
                <li><b>以下（≤）</b>：指定値と同じ、または小さい</li>
                <li><b>等しい（=）</b>：指定値と同じ</li>
                <li><b>等しくない（≠）</b>：指定値と異なる</li>
              </ul>
              <hr>
              <p><b>ユーザーID / 投稿者IDについて</b></p>
              <p><b>IDがない（退会済みなど）</b>：投稿者IDを取得できない動画に一致します。退会済みユーザーの動画などが該当します。通信エラーは「IDがない」とは判定しません。</p>
              <p><b>IDがある</b>：投稿者IDを正常に取得できる動画に一致します。</p>
              <p>IDは数値なので、<b>以上 / 以下 / より大きい / 未満</b>も使えます。たとえば「ユーザーIDが 50000000以上」のように、特定時期以降に作られたID帯を条件として組み合わせる用途にも使えます。</p>
              <hr>
              <p><b>タイトル・説明文</b>：文章そのものを文字列として比較します。「文字列を含む（部分一致）」と「文字列が完全一致」を使い分けられます。</p>
              <p><b>タグ</b>：動画に付いているタグ名を1個ずつ比較します。「指定したタグ名がある（完全一致）」を使います。</p>
              <p><b>🔒 タグロック</b>：投稿者がロックしたタグです。鍵アイコンが付くタグを意味します。こちらもタグ名1個との完全一致です。</p>
              <p><b>🔒 タグロック数</b>：ロックされているタグの個数です。1～11の範囲で比較できます。</p>
              <p><b>広告：投稿者IDと広告者ID</b>：ニコニ広告の広告者ユーザーIDと投稿者ユーザーIDを比較します。ID一致は高信頼です。</p>
              <p><b>広告：投稿者名と広告者名</b>：表示名同士を比較します。同名や名前変更があり得るため参考条件です。可能ならID一致を優先してください。</p>
            </div>
          </details>
          <div class=logicExample>
            <b>例：検索妨害だけを狙ってNG</b>
            <div>🔒 タグロック数 <b>以上（≥） 11</b></div>
            <div>AND タグ <b>含む「ホモと見るシリーズ」</b></div>
            <div>AND タグ <b>含む「本編改造淫夢」</b></div>
            <div>AND ユーザーID <b>IDがない（退会済みなど）</b></div>
          </div>
          <div class=row>
            <button type=button id=advancedRuleAddButton class=primary>＋ 論理ルールを追加</button>
            <button type=button id=advancedRuleSampleButton>サンプルを追加</button>
          </div>
          <div id=advancedRuleList class=advancedRuleList></div>
        </div>
      </details></div>

      <div data-tab-panel=autofill><details class=card open>
        <summary>自動継ぎ足し</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=autoFillEnabled>表示動画数が目標に達するまで自動追加</label></div>
          <div class=grid2>
            <div class=row><label>表示動画数の目標 <input type=number id=autoFillTargetCount min=1> 件</label></div>
            <div class=row><label>追加取得上限 <input type=number id=autoFillMaxExtraPages min=0> 単位</label><small>0=無制限</small></div>
          </div>
          <div class=row stack><label>候補取得方式
            <select id=autoFillInfoMode>
              <option value=legacy>従来方式（ページHTML＋詳細情報）</option>
              <option value=hybrid>API併用（検索API＋完全NG判定）</option>
              <option value=snapshot>API高速（API事前NG＋必要分だけ完全判定）</option>
            </select></label>
          </div>
          <div class=grid2>
            <div class=row><label>詳細情報の同時取得 <input type=number id=thumbInfoConcurrency min=1 max=20> 件</label></div>
            <div class=row><label>1回の詳細判定上限 <input type=number id=autoFillDetailBatchMax min=8 max=100> 件</label></div>
          </div>
          <div class=sectionTitle>表示とページ移動</div>
          <div class=grid2>
            <div class=row><label>右下ステータス
              <select id=statusPanelMode><option value=compact>コンパクト</option><option value=detailed>詳細</option><option value=hidden>非表示</option></select>
            </label></div>
            <div class=row><label>ページ番号の扱い
              <select id=autoFillPagerMode>
                <option value=off>変更しない</option>
                <option value=mark>取得済みページに斜線だけ付ける</option>
                <option value=compactSkip>取得済みをまとめて未取得ページへ送る（推奨）</option>
              </select>
            </label></div>
            <div class=row><label>取得済み範囲の後に表示 <input type=number id=pagerPreviewCount min=0 max=6> ページ（標準 2）</label></div>
            <div class=row><label><input type=checkbox id=statusAnimationEnabled>処理中ステータスをアニメーション表示</label></div>
          </div>
          <div class=sectionTitle>通信・キャッシュ</div>
          <div class=grid2>
            <div class=row><label><input type=checkbox id=sessionDetailCacheEnabled>同一タブ内の動画詳細を再利用する</label></div>
            <div class=row><label>キャッシュ保持時間 <input type=number id=sessionDetailCacheTtlMinutes min=1 max=1440> 分</label></div>
            <div class=row><label>キャッシュ最大件数 <input type=number id=sessionDetailCacheMaxEntries min=100 max=4000> 件</label></div>
            <div class=row><label>追加動画のニコニコ広告
              <select id=autoFillAdMode><option value=all>候補すべて取得</option><option value=visible>表示動画のみ（推奨）</option><option value=none>取得しない</option></select>
            </label></div>
            <div class=row><label><input type=checkbox id=selfAdWarningEnabled>自演広告の可能性を警告する（実験的）</label></div>
          </div>
          <div class=hint>APIが現在の検索条件・並びを再現できない場合は自動で従来方式へ戻ります。🔒 タグロック数NGは完全判定が必要です。採用率が低くても異常とは扱いません。ページ番号は「取得済み範囲＋未取得の先頭数ページ＋最終ページ＋次矢印」の順で表示します。詳細キャッシュは同一タブの再読み込みを跨いで再利用し、保存するのはタグ・ロック状態・投稿者などの詳細情報です。NG設定変更時は保存済みの最終判定を使わず、現在の設定で再判定します。</div>
        </div>
      </details></div>

      <div data-tab-panel=developer><details class=card open>
        <summary>開発者・診断</summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=developerMode>開発者モード</label><span class=pill>再読み込み不要</span></div>
          <div class=row><label>自動診断の量
            <select id=developerDiagnosticMode>
              <option value=light>軽量（設定・DOM・NG-ID・ページャー）</option>
              <option value=full>完全（3方式/API通信まで毎回実行）</option>
              <option value=manual>手動のみ</option>
            </select>
          </label></div>
          <div class=hint>通常利用は「軽量」推奨です。完全診断はSnapshot API通信まで行うため数秒余計にかかる場合があります。「診断を今すぐ実行」は設定に関係なく完全診断を実行します。</div>
          <div class=row><input class=primary type=button id=runDeveloperDiagnostics value="診断を今すぐ実行"></div>
          <div id=developerDiagnosticStatus class=statusNote>開発者モードをONにするとページ初期化後にも自動実行します。</div>
        </div>
      </details></div>

      <div data-tab-panel=display><details class=card open>
        <summary>表示・操作</summary>
        <div class=sectionBody>
          <div class=row><label>スクリプトUIの配色
            <select id=detailUiTheme>
              <option value=auto>自動（ニコニコ画面に合わせる・推奨）</option>
              <option value=light>ライト</option>
              <option value=dark>ダーク（低コントラスト）</option>
            </select>
          </label></div>
          <div class=hint>「自動」はニコニコ画面の実際の背景色を見てライト/ダークを判定します。ダーク配色は真っ黒・真っ白を避け、暗い青灰色の背景と少し抑えた文字色にして長時間見ても眩しすぎない配色にしています。</div>
          <div class=row><label><input type=checkbox id=openNewWindow>動画を新しいタブで開く</label></div>
          <div class=row><label><input type=checkbox id=spaNavigationFix>検索・タグ・ページ番号の移動時に確実に再検索する（推奨）</label></div>
          <div class=hint>現行ニコニコは検索画面内でURLだけを切り替えるSPA遷移を行います。ONではタグ・検索語・ページ番号・並び順などが変わったとき、新しいURLを保ったまま1回だけ再読み込みし、NG判定と自動継ぎ足しを新しい検索結果で最初から実行します。</div>
          <div class=row><label><input type=checkbox id=useGetThumbInfo>動画詳細情報を取得する</label></div>
          <div class=row><label><input type=checkbox id=movieInfoTogglable>タグ・ユーザー・チャンネルの表示切替</label></div>
          <div class=row><label><input type=checkbox id=descriptionTogglable>動画説明の表示切替</label></div>
        </div>
      </details></div>

      <div data-tab-panel=data><details class=card open>
        <summary>インポート・エクスポート</summary>
        <div class=sectionBody>
          <div class=row><label><input id=exportVisibleCheckbox type=checkbox>エクスポートを表示</label></div>
          <div id=exportContainer class=isHidden>
            <div class=row><label><input id=exportNgMovieIdCheckbox type=checkbox checked>動画ID</label><label><input id=exportNgTitleCheckbox type=checkbox checked>タイトル</label><label><input id=exportNgTagCheckbox type=checkbox checked>タグ</label><label><input id=exportNgUserIdCheckbox type=checkbox checked>ユーザーID</label><label><input id=exportNgUserNameCheckbox type=checkbox checked>ユーザー名</label><label><input id=exportNgChannelIdCheckbox type=checkbox checked>チャンネルID</label><label><input id=exportVisitedMovieIdCheckbox type=checkbox checked>閲覧済み</label></div>
            <div class=row><input type=button id=exportButton value=エクスポート></div><textarea id=exportTextarea rows=4></textarea>
          </div>
          <div class=row><label><input id=importVisibleCheckbox type=checkbox>インポートを表示</label></div>
          <div id=importContainer class=isHidden><textarea id=importTextarea rows=4></textarea><div class=row><input type=button id=importButton value=インポート></div></div>
        </div>
      </details></div>
    </div>
    <div class=footer><small>設定は変更時に保存されます。Escキーでも閉じられます。</small><small>Nico Nico Ranking NG / Umonky</small></div>
  </div>
<script>
(function(){
  var buttons = Array.from(document.querySelectorAll('.tabButton'));
  var panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  function activate(name) {
    buttons.forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
    panels.forEach(function(p){ p.classList.toggle('active', p.dataset.tabPanel === name); });
  }
  buttons.forEach(function(b){
    b.addEventListener('click', function(){ activate(b.dataset.tab); });
  });

  var help = {
    autoFillEnabled: 'NG判定後に表示できる動画が目標件数へ達するまで後続候補を取得します。',
    autoFillTargetCount: '画面上に実際に表示する非NG動画の目標件数です。',
    autoFillMaxExtraPages: '追加取得する上限です。0なら最終ページまで制限しません。',
    autoFillInfoMode: '従来方式は互換性優先。API併用/高速は検索APIを使いますが、再現できない検索条件では自動的に従来方式へ戻ります。',
    thumbInfoConcurrency: 'GetThumbInfoを同時に取得する本数です。大きすぎると通信失敗が増える場合があります。',
    autoFillDetailBatchMax: '1回に完全NG判定へ送る最大候補数です。低NG率では小さめ、高NG率では大きめが効率的です。',
    statusPanelMode: '右下の進捗パネルの表示量を選択します。',
    detailUiTheme: 'タグ・投稿者情報、操作ボタン、設定画面などスクリプト独自UIの配色です。自動はニコニコ本体の実背景色から判定します。',
    autoFillPagerMode: '自動取得済みのページを斜線・圧縮し、次矢印を最初の未取得ページへ変更できます。',
    pagerPreviewCount: '取得済み範囲の直後に通常リンクとして残す未取得ページ数です。2なら 20–31 32 33 … 157 → のように表示します。',
    statusAnimationEnabled: '処理中だけ右下ステータスに回転インジケーターを表示します。',
    sessionDetailCacheEnabled: '同じタブで一度取得したタグ・タグロック・投稿者情報をsessionStorageへ保存し、ページ移動後の再取得を省略します。',
    sessionDetailCacheTtlMinutes: 'キャッシュを何分まで有効とみなすかです。期限切れは自動削除します。',
    sessionDetailCacheMaxEntries: 'キャッシュ件数の上限です。古いものから削除します。',
    autoFillAdMode: '自動追加動画に対してニコニコ広告情報を取得する範囲です。',
    selfAdWarningEnabled: '広告者一覧を確認し、投稿者本人によるニコニ広告の可能性を警告します。追加通信が発生します。',
    spaNavigationFix: 'ニコニコのSPAページ移動で古いスクリプト状態が残るのを防ぐため、新URLで安全に再読み込みします。',
    developerMode: '診断ログを増やします。通常利用は軽量またはOFFで十分です。',
    developerDiagnosticMode: '軽量はローカル監査のみ、完全はAPI通信を含む3方式比較、手動のみはボタンを押した時だけ診断します。',
    ngLockedTagCountEnabled: 'ロックされたタグ数がしきい値以上の動画をNGにします。',
    ngLockedTagCountThreshold: 'ニコニコのタグ上限に合わせ1～11で指定します。',
    advancedNgRulesEnabled: 'AND / OR / NOT を自由に入れ子にし、比較演算子まで指定できる論理NG判定を有効にします。',
    openNewWindow: '動画のサムネイルやタイトルを左クリックしたとき、新しいタブで開きます。Ctrl/Cmd/中クリックなどブラウザ標準操作も維持します。Consoleの [new-tab] で動作監査できます。',
    useGetThumbInfo: 'タグのロック状態・投稿者など完全NG判定に必要な詳細情報を取得します。'
  };
  Object.keys(help).forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var row = el.closest('.row') || el.parentElement;
    if (!row) return;
    row.title = help[id];
    var icon = document.createElement('span');
    icon.className = 'settingHelp';
    icon.textContent = '?';
    icon.title = help[id];
    row.appendChild(icon);
  });
})();
</script>
</body></html>`
    return ConfigDialog
  })(EventEmitter)

  // ============================================================
  // v12.5 DetailUiTheme
  // ニコニコ本体のライト/ダークとスクリプト独自UIを自然に合わせる。
  // autoはOS設定だけでなく、実際のページ背景色も見る。
  // ============================================================
  var DetailUiTheme = (function() {
    var parseRgb = function(value) {
      var m = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i)
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
    }
    var luminance = function(rgb) {
      if (!rgb) return null
      var f = function(v) {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    var elementBackground = function(doc, el) {
      if (!el) return null
      try {
        var style = doc.defaultView.getComputedStyle(el)
        var color = style && style.backgroundColor
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null
        return parseRgb(color)
      } catch (e) { return null }
    }
    var detect = function(doc) {
      doc = doc || document
      var candidates = [
        doc.body,
        doc.documentElement,
        doc.querySelector('main'),
        doc.querySelector('[data-anchor-area="main"]') && doc.querySelector('[data-anchor-area="main"]').parentElement
      ].filter(Boolean)
      for (var el of candidates) {
        var rgb = elementBackground(doc, el)
        var lum = luminance(rgb)
        if (lum != null) {
          return {
            theme: lum < 0.18 ? 'dark' : 'light',
            luminance: Number(lum.toFixed(4)),
            rgb: rgb,
            source: el === doc.body ? 'body-background'
              : el === doc.documentElement ? 'html-background' : 'page-background'
          }
        }
      }
      var mediaDark = Boolean(doc.defaultView && doc.defaultView.matchMedia
        && doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches)
      return {
        theme: mediaDark ? 'dark' : 'light',
        luminance: null,
        rgb: null,
        source: 'prefers-color-scheme'
      }
    }
    var resolve = function(config, doc) {
      var requested = config && config.detailUiTheme
        ? String(config.detailUiTheme.value || 'auto') : 'auto'
      if (requested === 'dark' || requested === 'light') {
        return {requested:requested, resolved:requested, source:'setting'}
      }
      var detected = detect(doc)
      return Object.assign({requested:'auto', resolved:detected.theme}, detected)
    }
    var apply = function(config, doc, reason) {
      doc = doc || document
      var result = resolve(config, doc)
      doc.documentElement.dataset.nrnUiTheme = result.resolved
      if (doc.body) doc.body.dataset.nrnUiTheme = result.resolved
      window.__nrnDetailUiTheme = result
      console.log('[NicoNicoRankingNG theme]', reason || 'apply', result)
      return result
    }
    var watch = function(config, doc) {
      doc = doc || document
      if (window.__nrnDetailUiThemeWatcherInstalled) return
      window.__nrnDetailUiThemeWatcherInstalled = true
      var scheduled = false
      var schedule = function(reason) {
        if (String(config.detailUiTheme.value || 'auto') !== 'auto') return
        if (scheduled) return
        scheduled = true
        setTimeout(function() {
          scheduled = false
          apply(config, doc, reason)
        }, 80)
      }
      var observer = new MutationObserver(function() { schedule('page-theme-mutation') })
      if (doc.documentElement) observer.observe(doc.documentElement, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.body) observer.observe(doc.body, {
        attributes:true,
        attributeFilter:['class','style','data-theme','data-color-scheme','data-mode']
      })
      if (doc.defaultView && doc.defaultView.matchMedia) {
        var media = doc.defaultView.matchMedia('(prefers-color-scheme: dark)')
        if (media.addEventListener) media.addEventListener('change', function() { schedule('system-theme-change') })
      }
    }
    var CSS = `
html[data-nrn-ui-theme="dark"] {
  --nrn-bg: #202429;
  --nrn-panel: #252a30;
  --nrn-panel-soft: #2b3037;
  --nrn-text: #d8dee8;
  --nrn-muted: #9fa9b6;
  --nrn-border: #3b424c;
  --nrn-link: #91b9f8;
  --nrn-hover: #333943;
  --nrn-lock-bg: #393522;
  --nrn-lock-border: #756a3d;
  --nrn-lock-text: #e6d99a;
}
html[data-nrn-ui-theme="dark"] #nrn-config-bar {
  color: var(--nrn-text) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle {
  color: var(--nrn-text) !important;
  background: var(--nrn-panel-soft) !important;
  border-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] #nrn-open-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] #nrn-close-all-movie-info:hover,
html[data-nrn-ui-theme="dark"] .nrn-movie-info-toggle:hover {
  background: var(--nrn-hover) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-detail-bulk-label,
html[data-nrn-ui-theme="dark"] .nrn-config-separator,
html[data-nrn-ui-theme="dark"] .nrn-info-section-title {
  color: var(--nrn-muted) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-info-container {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-top-color: var(--nrn-border) !important;
  box-shadow: none !important;
}
html[data-nrn-ui-theme="dark"] .nrn-info-section + .nrn-info-section {
  border-top-color: var(--nrn-border) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag {
  color: var(--nrn-text) !important;
  background: transparent !important;
  border-bottom-color: #353c45 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag:hover {
  background: #2a3037 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag.nrn-locked-tag {
  color: var(--nrn-lock-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-movie-tag-link,
html[data-nrn-ui-theme="dark"] .nrn-contributor-link {
  color: var(--nrn-link) !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor {
  color: var(--nrn-text) !important;
  background: transparent !important;
}
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #c3cad4 !important;
  background: #353b44 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #c9d0da !important;
  background: #30363e !important;
  border-color: #48515d !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #e4e9ef !important;
  background: #39414b !important;
  border-color: #626e7d !important;
}

html[data-nrn-ui-theme="dark"] .nrn-info-section-title,
html[data-nrn-ui-theme="dark"] .nrn-contributor-kind {
  color: #aab3bf !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-lock-indicator {
  color: #d0ad55 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-warning {
  background: #3a3020 !important;
  border-left-color: #d4a24b !important;
  color: #ead7ab !important;
}
html[data-nrn-ui-theme="dark"] .nrn-self-ad-inline-badge {
  display: inline-block;
  margin: 0 5px 3px 0;
  padding: 1px 5px;
  border: 1px solid #b56a00;
  border-radius: 4px;
  background: #fff0cf;
  color: #7a4700;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 800;
  vertical-align: baseline;
  white-space: nowrap;
}
.nrn-self-ad-inline-badge[data-confidence="name"] {
  border-color: #9a7a3b;
  background: #f7f0dd;
  color: #66501f;
}
.nrn-self-ad-card-badge {
  background: rgba(76, 55, 19, .94) !important;
  color: #ead7ab !important;
  outline: 1px solid rgba(212,162,75,.45);
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button {
  color: #91b9f8 !important;
  background: transparent !important;
  border: 0 !important;
}
html[data-nrn-ui-theme="dark"] .nrn-tag-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-id-button:hover,
html[data-nrn-ui-theme="dark"] .nrn-contributor-ng-name-button:hover {
  color: #b7d2ff !important;
  background: transparent !important;
}
`
    return {detect:detect, resolve:resolve, apply:apply, watch:watch, CSS:CSS}
  })()

  var NicoPage = (function() {
    var TOGGLE_OPEN_TEXT = '▼'
    var TOGGLE_CLOSE_TEXT = '▲'
    var emphasizeMatchedText = function(e, text, createMatchedElem) {
      var t = e.textContent
      if (!text) {
        e.textContent = t
        return
      }
      var i = t.toUpperCase().indexOf(text)
      if (i === -1) {
        e.textContent = t
        return
      }
      while (e.hasChildNodes()) e.removeChild(e.firstChild)
      var d = e.ownerDocument
      if (i !== 0) e.appendChild(d.createTextNode(t.slice(0, i)))
      e.appendChild(createMatchedElem(t.slice(i, i + text.length)))
      if (i + text.length !== t.length) {
        e.appendChild(d.createTextNode(t.slice(i + text.length)))
      }
    }

    var MovieTitle = (function() {
      var MovieTitle = function(elem) {
        this.elem = elem
        this._ngTitle = ''
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngTitleChanged: set(this, 'ngTitle'),
        })
      }
      MovieTitle.prototype = {
        get ngId() {
          return this.elem.classList.contains('nrn-ng-movie-title')
        },
        set ngId(ngId) {
          var n = ngId ? 'add' : 'remove'
          this.elem.classList[n]('nrn-ng-movie-title')
        },
        _createNgTitleElem(textContent) {
          var result = this.elem.ownerDocument.createElement('span')
          result.className = 'nrn-matched-ng-title'
          result.textContent = textContent
          return result
        },
        get ngTitle() { return this._ngTitle },
        set ngTitle(ngTitle) {
          this._ngTitle = ngTitle
          emphasizeMatchedText(this.elem, ngTitle, this._createNgTitleElem.bind(this))
        },
        bindToMovie(movie) {
          this.ngId = movie.ngId
          this.ngTitle = movie.ngTitle
          this._listeners.bind(movie)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return MovieTitle
    })()

    var ActionPane = (function() {
      var createVisitButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-visit-button'
        result.textContent = '閲覧済み'
        result.dataset.movieId = movie.id
        result.dataset.type = 'add'
        result.dataset.movieTitle = movie.title
        return result
      }
      var createMovieNgButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-movie-ng-button'
        result.textContent = 'NG動画'
        result.dataset.movieId = movie.id
        result.dataset.type = 'add'
        result.dataset.movieTitle = movie.title
        return result
      }
      var createTitleNgButton = function(doc, movie) {
        var result = doc.createElement('span')
        result.className = 'nrn-title-ng-button'
        result.textContent = 'NGタイトル追加'
        result.dataset.movieTitle = movie.title
        result.dataset.ngTitle = ''
        return result
      }
      var createPane = function(doc) {
        var result = doc.createElement('div')
        result.className = 'nrn-action-pane'
        for (var c of Array.from(arguments).slice(1)) result.appendChild(c)
        return result
      }
      var ActionPane = function(doc, movie) {
        this.elem = createPane(doc
                             , createVisitButton(doc, movie)
                             , createMovieNgButton(doc, movie)
                             , createTitleNgButton(doc, movie))
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngTitleChanged: set(this, 'ngTitle'),
          visitedChanged: set(this, 'visited'),
        })
      }
      ActionPane.prototype = {
        get _visitButton() {
          return this.elem.querySelector('.nrn-visit-button')
        },
        get visited() {
          return this._visitButton.dataset.type === 'remove'
        },
        set visited(visited) {
          var b = this._visitButton
          b.textContent = visited ? '未閲覧' : '閲覧済み'
          b.dataset.type = visited ? 'remove' : 'add'
        },
        get _movieNgButton() {
          return this.elem.querySelector('.nrn-movie-ng-button')
        },
        get ngId() {
          return this._movieNgButton.dataset.type === 'remove'
        },
        set ngId(ngId) {
          var b = this._movieNgButton
          b.textContent = ngId ? 'NG解除' : 'NG登録'
          b.dataset.type = ngId ? 'remove' : 'add'
        },
        get _titleNgButton() {
          return this.elem.querySelector('.nrn-title-ng-button')
        },
        get ngTitle() {
          return this._titleNgButton.dataset.ngTitle
        },
        set ngTitle(ngTitle) {
          var b = this._titleNgButton
          b.textContent = ngTitle ? 'NGタイトル削除' : 'NGタイトル追加'
          b.dataset.type = ngTitle ? 'remove' : 'add'
          b.dataset.ngTitle = ngTitle
        },
        bindToMovie(movie) {
          this.ngId = movie.ngId
          this.ngTitle = movie.ngTitle
          this.visited = movie.visited
          this._listeners.bind(movie)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return ActionPane
    })()

    // --------------------------------------------------------------------
    // Detail UI views: tags / contributor / description
    // --------------------------------------------------------------------
    var TagView = (function() {
      var createElem = function(doc, tag) {
        var a = doc.createElement('a')
        a.className = 'nrn-movie-tag-link'
        a.target = '_blank'
        a.textContent = tag.name
        a.href = 'https://www.nicovideo.jp/tag/' + tag.name
        const key = doc.createElement('span');
        key.className = 'nrn-tag-lock-indicator'
        key.textContent = tag.lock ? '🔒' : '';
        key.setAttribute('aria-hidden', 'true')
        if (tag.lock) key.title = '投稿者がロックしているタグ（タグロック）'
        var b = doc.createElement('span')
        b.className = 'nrn-tag-ng-button'
        b.textContent = '[+]'
        b.title = 'このタグをNGリストへ追加'
        b.dataset.type = 'add'
        b.dataset.tagName = tag.name
        if (tag.lock) b.dataset.lock = 'true';
        var result = doc.createElement('span')
        result.className = 'nrn-movie-tag'
        if (tag.lock) result.classList.add('nrn-locked-tag')
        result.appendChild(a)
        if (tag.lock) result.appendChild(key)
        result.appendChild(b)
        return result
      }
      var TagView = function(doc, tag) {
        this.tagName = tag.name;
        this.locked = Boolean(tag.lock);
        this.elem = createElem(doc, tag);
        this._listeners = new Listeners({ngChanged: set(this, 'ng')})
      }
      TagView.prototype = {
        get _link() {
          return this.elem.querySelector('.nrn-movie-tag-link')
        },
        get ng() {
          return this._link.classList.contains('nrn-movie-ng-tag-link')
        },
        set ng(ng) {
          this._link.classList[ng ? 'add' : 'remove']('nrn-movie-ng-tag-link')
          var b = this.elem.querySelector('.nrn-tag-ng-button')
          b.textContent = ng ? '[x]' : '[+]'
          b.title = ng ? 'このタグをNGリストから解除' : 'このタグをNGリストへ追加'
          b.dataset.type = ng ? 'remove' : 'add'
        },
        bindToTag(tag) {
          this.ng = tag.ng
          this._listeners.bind(tag)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return TagView
    })()

    var ContributorView = (function() {
      var ContributorView = function(doc, contributor) {
        this.contributor = contributor
        this.elem = this._createElem(doc)
      }
      ContributorView.prototype = {
        _createElem(doc) {
          var a = doc.createElement('a')
          a.className = 'nrn-contributor-link'
          a.target = '_blank'
          a.href = this.contributor.url
          a.textContent = this.contributor.name || '(名前不明)'
          var b = doc.createElement('span')
          this._setNgButton(b)
          var result = doc.createElement('span')
          result.className = 'nrn-contributor'
          var label = doc.createElement('span')
          label.className = 'nrn-contributor-kind'
          label.textContent = this._label
          result.appendChild(label)
          result.appendChild(a)
          result.appendChild(b)
          return result
        },
        _initContributorDataset(dataset) {
          dataset.contributorType = this.contributor.type
          dataset.id = this.contributor.id
          dataset.name = this.contributor.name
          dataset.type = 'add'
        },
        get _label() {
          throw new Error('must be implemented')
        },
        _setNgButton() {
          throw new Error('must be implemented')
        },
        _bindToContributor() {
          throw new Error('must be implemented')
        },
      }

      var UserView = function UserView(doc, contributor) {
        ContributorView.call(this, doc, contributor)
        this._listeners = new Listeners({
          ngIdChanged: set(this, 'ngId'),
          ngNameChanged: set(this, 'ngName'),
        })
        this._bindToContributor()
      }
      UserView.prototype = createObject(ContributorView.prototype, {
        get _label() {
          return 'ユーザー:'
        },
        _setNgButton(b) {
          var d = b.ownerDocument
          var ngIdButton = d.createElement('span')
          ngIdButton.className = 'nrn-contributor-ng-id-button'
          ngIdButton.textContent = '+ID'
          this._initContributorDataset(ngIdButton.dataset)
          var ngNameButton = d.createElement('span')
          ngNameButton.className = 'nrn-contributor-ng-name-button'
          ngNameButton.textContent = '+名'
          this._initContributorDataset(ngNameButton.dataset)
          b.className = 'nrn-user-ng-button'
          b.appendChild(ngIdButton)
          if (this.contributor.name) {
          } else {
            ngNameButton.style.display = 'none'
          }
          b.appendChild(ngNameButton)
        },
        get ngId() {
          return this.elem.querySelector('.nrn-contributor-link')
            .classList.contains('nrn-ng-id-contributor-link')
        },
        set ngId(ngId) {
          var a = this.elem.querySelector('.nrn-contributor-link')
          a.classList[ngId ? 'add' : 'remove']('nrn-ng-id-contributor-link')
          var b = this.elem.querySelector('.nrn-contributor-ng-id-button')
          b.textContent = ngId ? 'xID' : '+ID'
          b.dataset.type = ngId ? 'remove' : 'add'
        },
        get ngName() {
          var e = this.elem.querySelector('.nrn-matched-ng-contributor-name')
          return e ? e.textContent : ''
        },
        set ngName(ngName) {
          var b = this.elem.querySelector('.nrn-contributor-ng-name-button')
          b.textContent = ngName ? 'x名' : '+名'
          b.dataset.type = ngName ? 'remove' : 'add'
          b.dataset.matched = ngName
          emphasizeMatchedText(
            this.elem.querySelector('.nrn-contributor-link'),
            ngName,
            function(text) {
              var result = this.elem.ownerDocument.createElement('span')
              result.className = 'nrn-matched-ng-contributor-name'
              result.textContent = text
              return result
            }.bind(this))
        },
        _bindToContributor() {
          this.ngId = this.contributor.ngId
          this.ngName = this.contributor.ngName
          this._listeners.bind(this.contributor)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      })

      var ChannelView = function ChannelView(doc, contributor) {
        ContributorView.call(this, doc, contributor)
        this._listeners = new Listeners({ngChanged: set(this, 'ng')})
        this._bindToContributor()
      }
      ChannelView.prototype = createObject(ContributorView.prototype, {
        get _label() {
          return 'チャンネル:'
        },
        _setNgButton(e) {
          e.className = 'nrn-contributor-ng-button'
          e.textContent = '[+]'
          this._initContributorDataset(e.dataset)
        },
        get ng() {
          return this.elem.querySelector('.nrn-contributor-link')
            .classList.contains('nrn-ng-contributor-link')
        },
        set ng(ng) {
          var a = this.elem.querySelector('.nrn-contributor-link')
          a.classList[ng ? 'add' : 'remove']('nrn-ng-contributor-link')
          var b = this.elem.querySelector('.nrn-contributor-ng-button')
          b.textContent = ng ? '[x]' : '[+]'
          b.dataset.type = ng ? 'remove' : 'add'
        },
        _bindToContributor() {
          this.ng = this.contributor.ng
          this._listeners.bind(this.contributor)
          return this
        },
        unbind() {
          this._listeners.unbind()
        },
      })

      ContributorView.new = function(doc, contributor) {
        switch (contributor.type) {
          case 'user': return new UserView(doc, contributor)
          case 'channel': return new ChannelView(doc, contributor)
          default: throw new Error(contributor.type)
        }
      }
      return ContributorView
    })()

    var MovieInfo = (function() {
      var createElem = function(doc) {
        var e = doc.createElement('P')
        e.className = 'nrn-error'
        var tagSection = doc.createElement('section')
        tagSection.className = 'nrn-info-section nrn-tag-section'
        var tagHead = doc.createElement('div')
        tagHead.className = 'nrn-info-section-title'
        tagHead.textContent = 'タグ'
        var t = doc.createElement('div')
        t.className = 'nrn-tag-container'
        tagSection.appendChild(tagHead)
        tagSection.appendChild(t)

        var contributorSection = doc.createElement('section')
        contributorSection.className = 'nrn-info-section nrn-contributor-section'
        var contributorHead = doc.createElement('div')
        contributorHead.className = 'nrn-info-section-title'
        contributorHead.textContent = '投稿者情報'
        var c = doc.createElement('div')
        c.className = 'nrn-contributor-container'
        contributorSection.appendChild(contributorHead)
        contributorSection.appendChild(c)

        var result = doc.createElement('div')
        result.className = 'nrn-movie-info-container'
        result.appendChild(e)
        result.appendChild(tagSection)
        result.appendChild(contributorSection)
        return result
      }
      var createToggle = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-movie-info-toggle'
        result.textContent = TOGGLE_OPEN_TEXT
        return result
      }
      var MovieInfo = function(doc) {
        this.elem = createElem(doc)
        this.toggle = createToggle(doc)
        this.togglable = true
        this._tagViews = []
        this._contributorView = null
        this._error = Movie.NO_ERROR
        this._actionPane = null
        this._listeners = new Listeners({
          tagsChanged: this._createAndSetTagViews.bind(this),
          contributorChanged: this._createAndSetContributorView.bind(this),
          errorChanged: set(this, 'error'),
        })
      }
      MovieInfo.prototype = {
        set actionPane(actionPane) {
          this._actionPane = actionPane
          this.elem.insertBefore(actionPane.elem, this.elem.firstChild)
        },
        get tagViews() { return this._tagViews },
        set tagViews(tagViews) {
          this._tagViews = tagViews
          var e = this.elem.querySelector('.nrn-tag-container')
          e.textContent = ''
          for (var v of tagViews) e.appendChild(v.elem)

          var title = this.elem.querySelector('.nrn-tag-section .nrn-info-section-title')
          if (title) {
            var lockedCount = tagViews.filter(function(v) { return v.locked }).length
            title.textContent = '🔒' + lockedCount + ' / ' + tagViews.length
            title.title = 'ロック済みタグ数 / 全タグ数'
          }
        },
        get contributorView() { return this._contributorView },
        set contributorView(contributorView) {
          if (this._contributorView && this._contributorView !== contributorView) {
            try { this._contributorView.unbind() } catch (e) {}
          }
          this._contributorView = contributorView
          var container = this.elem.querySelector('.nrn-contributor-container')
          container.textContent = ''
          var title = this.elem.querySelector('.nrn-contributor-section .nrn-info-section-title')
          if (contributorView) {
            container.appendChild(contributorView.elem)
            if (title) title.textContent = '投稿者情報'
          } else {
            if (title) title.textContent = '投稿者情報（取得できません）'
          }
        },
        get error() { return this._error },
        set error(error) {
          if (this._error === error) return
          this._error = error
          this.elem.querySelector('.nrn-error').textContent = error.message
        },
        hasAny() {
          return Boolean(this.elem.querySelector('.nrn-action-pane')
                      || this.elem.querySelector('.nrn-movie-tag')
                      || this.elem.querySelector('.nrn-contributor')
                      || this.error !== Movie.NO_ERROR)
        },
        _createAndSetTagViews(tags) {
          var d = this.elem.ownerDocument
          this.tagViews = tags.map(function(tag) {
            return new TagView(d, tag).bindToTag(tag)
          })
        },
        _createAndSetContributorView(contributor) {
          if (contributor === Contributor.NULL) return
          var d = this.elem.ownerDocument
          this.contributorView = ContributorView.new(d, contributor)
        },
        bindToMovie(movie) {
          this._createAndSetTagViews(movie.tags)
          this._createAndSetContributorView(movie.contributor)
          this.error = movie.error
          if (!movie.thumbInfoDone) this._listeners.bind(movie)
        },
        unbind() {
          this._listeners.unbind()
          this.tagViews.forEach(function(v) { v.unbind() })
          if (this.contributorView) this.contributorView.unbind()
          if (this._actionPane) this._actionPane.unbind()
        },
      }
      return MovieInfo
    })()

    var Description = (function() {
      var re = /(sm|so|nm|co|ar|im|lv|mylist\/|watch\/|user\/)(?:\d+)/g
      var typeToHRef = {
        sm: 'https://www.nicovideo.jp/watch/',
        so: 'https://www.nicovideo.jp/watch/',
        nm: 'https://www.nicovideo.jp/watch/',
        co: 'https://com.nicovideo.jp/community/',
        ar: 'https://ch.nicovideo.jp/article/',
        im: 'https://seiga.nicovideo.jp/seiga/',
        lv: 'http://live.nicovideo.jp/watch/',
        'mylist/': 'https://www.nicovideo.jp/',
        'watch/': 'https://www.nicovideo.jp/',
        'user/': 'https://www.nicovideo.jp/',
      }
      var createAnchor = function(doc, href, text) {
        var a = doc.createElement('a')
        a.target = '_blank'
        a.href = href
        a.textContent = text
        return a
      }
      var createCloseButton = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-description-close-button'
        result.textContent = TOGGLE_CLOSE_TEXT
        return result
      }
      var createElem = function(doc, closeButton) {
        var text = doc.createElement('span')
        text.className = 'nrn-description-text'
        var result = doc.createElement('p')
        result.className = 'itemDescription ranking nrn-description'
        result.appendChild(text)
        result.appendChild(closeButton)
        return result
      }
      var createOpenButton = function(doc) {
        var result = doc.createElement('span')
        result.className = 'nrn-description-open-button'
        result.textContent = TOGGLE_OPEN_TEXT
        return result
      }
      var Description = function(doc) {
        this.closeButton = createCloseButton(doc)
        this.elem = createElem(doc, this.closeButton)
        this.openButton = createOpenButton(doc)
        this.original = null
        this.text = ''
        this.linkified = false
        this.togglable = true
        this._listeners = new Listeners({
          'descriptionChanged': set(this, 'text'),
        })
      }
      Description.prototype = {
        linkify() {
          if (this.linkified) return
          this.linkified = true
          var t = this.text
          var d = this.elem.ownerDocument
          var f = d.createDocumentFragment()
          var lastIndex = 0
          for (var r; r = re.exec(t);) {
            f.appendChild(d.createTextNode(t.slice(lastIndex, r.index)))
            f.appendChild(createAnchor(d, typeToHRef[r[1]] + r[0], r[0]))
            lastIndex = re.lastIndex
          }
          f.appendChild(d.createTextNode(t.slice(lastIndex)))
          f.normalize()
          this.elem.firstChild.appendChild(f)
        },
        bindToMovie(movie) {
          this.text = movie.description
          this._listeners.bind(movie)
        },
        unbind() {
          this._listeners.unbind()
        },
      }
      return Description
    })()

    // --------------------------------------------------------------------
    // Movie card adapter: DOM representation only
    // Global policies (new-tab, diagnostics) live in Runtime services.
    // --------------------------------------------------------------------
    var MovieRoot = (function() {
      var MovieRoot = function(elem) {
        this.elem = elem
        var d = elem.ownerDocument
        this.movieInfo = new MovieInfo(d)
        this.description = new Description(d)
        this._openNewWindow = false
        this.movieTitle = null
        this._movieListeners = new Listeners({
          thumbInfoDone: this.setThumbInfoDone.bind(this),
        })
        this._movieViewModeListeners = new Listeners({
          changed: set(this, 'viewMode'),
        })
        this._configOpenNewWindowListeners = new Listeners({
          changed: set(this, 'openNewWindow'),
        })
        this._nrnBaselineRect = null
        this._nrnManualMovieInfoVisible = null
        this._nrnMovieInfoInteractionSeq = 0
        requestAnimationFrame(function() {
          if (!this.elem || !this.elem.isConnected) return
          var r = this.elem.getBoundingClientRect()
          if (r && r.width > 0 && r.height > 0) {
            this._nrnBaselineRect = {width:r.width, height:r.height}
          }
        }.bind(this))
      }
      MovieRoot.prototype = {
        markMovieAnchor() {
          for (var a of this._movieAnchors) a.dataset.nrnMovieAnchor = 'true'
        },
        set id(id) {
          for (var a of this._movieAnchors) a.dataset.nrnMovieId = id
        },
        get titleElem() {
          throw new Error('must be implemented')
        },
        set title(title) {
          this.titleElem.textContent = title
          for (var a of this._movieAnchors) a.dataset.nrnMovieTitle = title
        },
        get _reduced() {
          return this.elem.classList.contains('nrn-reduce')
        },
        _halfThumb() {},
        _restoreThumb() {},
        _reduce() {
          this.elem.classList.add('nrn-reduce')
          this._halfThumb()
        },
        _unreduce() {
          this.elem.classList.remove('nrn-reduce')
          this._restoreThumb()
        },
        get _hidden() {
          return this.elem.classList.contains('nrn-hide')
        },
        _hide() {
          if (this._movieInfoVisible) this._movieInfoVisible = false
          this.elem.classList.add('nrn-hide')
        },
        _show() {
          this.elem.classList.remove('nrn-hide')
        },
        get viewMode() {
          if (this.elem.classList.contains('nrn-reduce')) return 'reduce'
          if (this.elem.classList.contains('nrn-hide')) return 'hide'
          return 'doNothing'
        },
        set viewMode(viewMode) {
          if (this._reduced) this._unreduce()
          else if (this._hidden) this._show()
          switch (viewMode) {
            case 'reduce': this._reduce(); break
            case 'hide': this._hide(); break
            case 'doNothing': break
            default: throw new Error(viewMode)
          }
        },
        get _movieAnchorSelectors() {
          throw new Error('must be implemented')
        },
        get _movieAnchors() {
          var result = []
          for (var s of this._movieAnchorSelectors) {
            var a = this.elem.querySelector(s)
            if (a) result.push(a)
          }
          return result
        },
        get openNewWindow() { return this._openNewWindow },
        set openNewWindow(openNewWindow) {
          this._openNewWindow = Boolean(openNewWindow)
          var anchors = this._movieAnchors
          for (var a of anchors) {
            if (this._openNewWindow) {
              a.target = '_blank'
              a.rel = 'noopener noreferrer'
              a.dataset.nrnOpenNewTab = 'true'
            } else {
              if (a.dataset.nrnOpenNewTab === 'true') {
                a.removeAttribute('target')
                a.removeAttribute('rel')
                delete a.dataset.nrnOpenNewTab
              }
            }
          }
          if (typeof NewTabService !== 'undefined') {
            NewTabService.decorateWithin(this.elem, this._openNewWindow)
          }
        },
        get _movieInfoVisible() {
          return Boolean(this.movieInfo.elem.parentNode)
        },
        set _movieInfoVisible(visible) {
          if (visible) {
            this._pinMovieInfoTogglePosition()
            this._addMovieInfo()
            this.elem.classList.add('nrn-info-expanded')
            this.movieInfo.toggle.textContent = TOGGLE_CLOSE_TEXT
            this._startMovieInfoReserve()
            requestAnimationFrame(function() {
              this._auditMovieInfoLayout('opened')
            }.bind(this))
          } else {
            this._stopMovieInfoReserve()
            this.movieInfo.elem.remove()
            this.elem.classList.remove('nrn-info-expanded')
            this.movieInfo.toggle.textContent = TOGGLE_OPEN_TEXT
            requestAnimationFrame(function() {
              this._auditMovieInfoLayout('closed')
            }.bind(this))
          }
        },
        toggleMovieInfo() {
          if (!this.movieInfo || !this.movieInfo.hasAny()) return false
          var next = !this._movieInfoVisible
          this._nrnManualMovieInfoVisible = next
          this._nrnMovieInfoInteractionSeq++
          this._movieInfoVisible = next
          console.log('[NicoNicoRankingNG detail] ユーザー開閉:', {
            movieId:this.movieId || null,
            visible:next,
            seq:this._nrnMovieInfoInteractionSeq,
            pending:this.elem.classList.contains('nrn-autofill-pending'),
            hidden:this.elem.classList.contains('nrn-hide')
          })
          return true
        },
        setMovieInfoVisible(visible, source) {
          if (!this.movieInfo.hasAny()) return false
          var requested = Boolean(visible)
          if (source === 'user-bulk') {
            this._nrnManualMovieInfoVisible = requested
            this._nrnMovieInfoInteractionSeq++
          }
          this.setMovieInfoToggleIfRequired()
          this._pinMovieInfoTogglePosition()
          this._movieInfoVisible = requested
          return true
        },
        _pinMovieInfoTogglePosition(force) {
          if (!this.elem || !this.elem.isConnected) return false
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected) return false
          if (!force && toggle.dataset.nrnPinned === 'true') return true

          var win = this.elem.ownerDocument.defaultView
          var rootStyle = win.getComputedStyle(this.elem)
          var toggleStyle = win.getComputedStyle(toggle)
          var rootRectBefore = this.elem.getBoundingClientRect()

          // 自動追加カードはNG判定中に display:none になる。
          // 非表示中に座標を測ると top=0 などを誤記録するため、表示後まで保留する。
          if (this.elem.classList.contains('nrn-autofill-pending')
              || rootStyle.display === 'none'
              || rootStyle.visibility === 'hidden'
              || toggleStyle.display === 'none'
              || rootRectBefore.width < 2
              || rootRectBefore.height < 2) {
            toggle.dataset.nrnPinWaiting = 'true'
            toggle.dataset.nrnPinned = 'false'
            toggle.classList.remove('nrn-toggle-pinned')
            toggle.style.removeProperty('--nrn-toggle-top')
            return false
          }

          // Measure the arrow in NicoNico's original card layout.
          // The detail panel must not affect this coordinate.
          var wasPinned = toggle.classList.contains('nrn-toggle-pinned')
          if (wasPinned) toggle.classList.remove('nrn-toggle-pinned')
          toggle.style.removeProperty('--nrn-toggle-top')

          var rootRect = this.elem.getBoundingClientRect()
          var toggleRect = toggle.getBoundingClientRect()
          var top = toggleRect.top - rootRect.top

          if (Number.isFinite(top) && top >= 0
              && toggleRect.width > 0 && toggleRect.height > 0) {
            toggle.style.setProperty('--nrn-toggle-top', (Math.round(top * 100) / 100) + 'px')
            toggle.dataset.nrnPinned = 'true'
            toggle.dataset.nrnPinWaiting = 'false'
            toggle.dataset.nrnBaselineTop = String(Math.round(top * 100) / 100)
            toggle.classList.add('nrn-toggle-pinned')
            return true
          }

          toggle.dataset.nrnPinWaiting = 'true'
          if (wasPinned) toggle.classList.add('nrn-toggle-pinned')
          return false
        },
        _scheduleMovieInfoTogglePin() {
          if (this._nrnTogglePinScheduled) return
          this._nrnTogglePinScheduled = true
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              this._nrnTogglePinScheduled = false
              this._pinMovieInfoTogglePosition(false)
            }.bind(this))
          }.bind(this))
        },
        _refreshMovieInfoToggleAfterReveal() {
          if (!this.elem || !this.elem.isConnected) return false
          this.setMovieInfoToggleIfRequired()
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected) {
            console.warn('[NicoNicoRankingNG detail] 自動追加動画の▲▼生成失敗:', {
              movieId:this.movieId || null
            })
            return false
          }
          var ok = this._pinMovieInfoTogglePosition(true)
          if (!ok) this._scheduleMovieInfoTogglePin()
          return ok
        },
        _auditMovieInfoTogglePosition(reason) {
          var toggle = this.movieInfo && this.movieInfo.toggle
          if (!toggle || !toggle.isConnected || toggle.dataset.nrnPinned !== 'true') return null
          var baselineTop = Number(toggle.dataset.nrnBaselineTop)
          var rootRect = this.elem.getBoundingClientRect()
          var toggleRect = toggle.getBoundingClientRect()
          var currentTop = toggleRect.top - rootRect.top
          var delta = Math.abs(currentTop - baselineTop)
          var result = {
            reason: reason || 'audit',
            movieId: this.movieId || null,
            baselineTop: Math.round(baselineTop * 100) / 100,
            currentTop: Math.round(currentTop * 100) / 100,
            delta: Math.round(delta * 100) / 100,
            expanded: this._movieInfoVisible
          }
          if (delta > 1.5) {
            console.warn('[NicoNicoRankingNG detail] ▲▼位置ずれを検出:', result)
          }
          return result
        },
        _auditMovieInfoLayout(reason) {
          if (!this.elem || !this.elem.isConnected) return null
          var cardRect = this.elem.getBoundingClientRect()
          var detail = this.movieInfo && this.movieInfo.elem
          var detailRect = detail && detail.isConnected ? detail.getBoundingClientRect() : null
          var reserve = Number(this.elem.dataset.nrnDetailReserve || 0)
          var toggleAudit = this._auditMovieInfoTogglePosition(reason)
          var overlaps = []
          if (detailRect && detailRect.width > 0 && detailRect.height > 0) {
            Array.from(this.elem.ownerDocument.querySelectorAll('.nrn-parsed')).forEach(function(other) {
              if (other === this.elem || !other.isConnected) return
              var r = other.getBoundingClientRect()
              var x = Math.min(detailRect.right, r.right) - Math.max(detailRect.left, r.left)
              var y = Math.min(detailRect.bottom, r.bottom) - Math.max(detailRect.top, r.top)
              if (x > 2 && y > 2) overlaps.push({
                id:other.getAttribute('data-decoration-video-id')
                  || (other.querySelector('[data-decoration-video-id]')
                    && other.querySelector('[data-decoration-video-id]').getAttribute('data-decoration-video-id'))
                  || '',
                overlapX:Math.round(x), overlapY:Math.round(y)
              })
            }.bind(this))
          }
          var result = {
            reason:reason || 'audit', movieId:this.movieId || null,
            expanded:Boolean(this._movieInfoVisible),
            cardWidth:Math.round(cardRect.width * 10) / 10,
            cardHeight:Math.round(cardRect.height * 10) / 10,
            detailWidth:detailRect ? Math.round(detailRect.width * 10) / 10 : 0,
            detailHeight:detailRect ? Math.round(detailRect.height * 10) / 10 : 0,
            reserve:reserve,
            toggleDelta:toggleAudit ? toggleAudit.delta : null,
            overlaps:overlaps.length,
            ok:(!toggleAudit || toggleAudit.delta <= 1.5) && overlaps.length === 0
          }
          if (!result.ok) {
            console.warn('[NicoNicoRankingNG detail] レイアウト異常を検出:', result)
            if (overlaps.length) console.table(overlaps)
          } else {
            console.log('[NicoNicoRankingNG detail] レイアウト監査:', result)
          }
          window.__nrnLastLayoutAudit = result
          return result
        },
        _syncMovieInfoReserve() {
          if (!this.elem || !this.elem.isConnected || !this._movieInfoVisible) return
          var info = this.movieInfo && this.movieInfo.elem
          if (!info || !info.isConnected) return
          var rect = info.getBoundingClientRect()
          var height = Math.max(
            Number(rect && rect.height) || 0,
            Number(info.scrollHeight) || 0,
            Number(info.offsetHeight) || 0
          )
          var reserve = Math.ceil(height + 10)
          if (reserve < 10) reserve = 10
          this.elem.style.setProperty('--nrn-detail-reserve', reserve + 'px')
          this.elem.dataset.nrnDetailReserve = String(reserve)

          if (this._nrnBaselineRect) {
            var current = this.elem.getBoundingClientRect()
            var widthDelta = Math.abs(current.width - this._nrnBaselineRect.width)
            this.elem.dataset.nrnDetailWidthDelta = String(Math.round(widthDelta * 100) / 100)
            if (widthDelta > 1.5) {
              console.warn('[NicoNicoRankingNG detail] カード幅が変化しました（本来は0pxのはず）', {
                id:this.movieInfo && this.movieInfo.movieId,
                before:this._nrnBaselineRect.width,
                after:current.width,
                delta:widthDelta,
                reserve:reserve
              })
            }
          }
        },
        _startMovieInfoReserve() {
          this._stopMovieInfoReserve()
          var sync = function() {
            this._syncMovieInfoReserve()
          }.bind(this)
          this._nrnMovieInfoReserveSync = sync
          requestAnimationFrame(function() {
            sync()
            requestAnimationFrame(sync)
          })
          if (typeof ResizeObserver !== 'undefined') {
            this._nrnMovieInfoReserveObserver = new ResizeObserver(sync)
            this._nrnMovieInfoReserveObserver.observe(this.movieInfo.elem)
          }
        },
        _stopMovieInfoReserve() {
          if (this._nrnMovieInfoReserveObserver) {
            try { this._nrnMovieInfoReserveObserver.disconnect() } catch (e) {}
            this._nrnMovieInfoReserveObserver = null
          }
          this._nrnMovieInfoReserveSync = null
          if (this.elem) {
            this.elem.style.removeProperty('--nrn-detail-reserve')
            delete this.elem.dataset.nrnDetailReserve
          }
        },
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          throw new Error('must be implemented')
        },
        _addMovieInfoToggle() {
          this.elem.querySelector('.itemData')
            .appendChild(this.movieInfo.toggle)
          this._scheduleMovieInfoTogglePin()
        },
        setMovieInfoToggleIfRequired() {},
        _updateByMovieInfoTogglable() {
          if (!this.movieInfo.hasAny()) return
          if (this.movieInfo.togglable) {
            this._addMovieInfoToggle()
            var desired = this._nrnManualMovieInfoVisible
            if (desired == null) desired = false
            if (this._movieInfoVisible !== desired) this._movieInfoVisible = desired
          } else {
            this.movieInfo.toggle.remove()
            if (!this._movieInfoVisible) this._movieInfoVisible = true
          }
        },
        get movieInfoTogglable() {
          return this.movieInfo.togglable
        },
        set movieInfoTogglable(movieInfoTogglable) {
          this.movieInfo.togglable = movieInfoTogglable
          this._updateByMovieInfoTogglable()
        },
        _queryOriginalDescriptionElem() {
          return this.elem.querySelector('.itemDescription')
        },
        get _originalDescriptionElem() {
          var result = this.description.original
          if (!result) {
            result
              = this.description.original
              = this._queryOriginalDescriptionElem()
          }
          return result
        },
        get _descriptionExpanded() {
          return Boolean(this.description.elem.parentNode)
        },
        set _descriptionExpanded(expanded) {
          var o = this._originalDescriptionElem
          var d = this.description
          if (expanded && o.parentNode) {
            d.linkify()
            o.parentNode.replaceChild(d.elem, o)
          } else if (!expanded && d.elem.parentNode) {
            d.elem.parentNode.replaceChild(o, d.elem)
          }
        },
        _updateByDescriptionTogglable() {
          if (!this.description.text) return
          if (this.description.togglable) {
            this._originalDescriptionElem?.appendChild(this.description.openButton)
            this.description.elem.appendChild(this.description.closeButton)
          } else {
            this.description.closeButton.remove()
          }
          this._descriptionExpanded = !this.description.togglable
        },
        toggleDescription() {
          this._descriptionExpanded = !this._descriptionExpanded
        },
        get descriptionTogglable() {
          return this.description.togglable
        },
        set descriptionTogglable(descriptionTogglable) {
          this.description.togglable = descriptionTogglable
          this._updateByDescriptionTogglable()
        },
        setThumbInfoDone() {
          this.elem.classList.add('nrn-thumb-info-done')
        },
        get thumbInfoDone() {
          return this.elem.classList.contains('nrn-thumb-info-done')
        },
        bindToMovie(movie) {
          this.movieInfo.bindToMovie(movie)
          this.description.bindToMovie(movie)
          if (movie.thumbInfoDone) this.setThumbInfoDone()
          else this._movieListeners.bind(movie)
        },
        bindToMovieViewMode(movieViewMode) {
          this.viewMode = movieViewMode.value
          this._movieViewModeListeners.bind(movieViewMode)
        },
        bindToConfig(config) {
          this.openNewWindow = config.openNewWindow.value
          this._configOpenNewWindowListeners.bind(config.openNewWindow)
        },
        unbind() {
          this.movieInfo.unbind()
          this.description.unbind()
          this._movieListeners.unbind()
          this._movieViewModeListeners.unbind()
          this._configOpenNewWindowListeners.unbind()
          if (this.movieTitle) this.movieTitle.unbind()
        },
        preventPageTransition(config) {},
      }
      return MovieRoot
    })()

    var ConfigBar = (function() {
      var createConfigBar = function(doc) {
        var html = `<div id=nrn-config-bar>
    <label>
      閲覧済みの動画を
      <select id=nrn-visited-movie-view-mode-select>
        <option value=reduce>縮小</option>
        <option value=hide>非表示</option>
        <option value=doNothing>通常表示</option>
      </select>
    </label>
    |
    <label>
      投稿者
      <select id=nrn-visible-contributor-type-select>
        <option value=all>全部</option>
        <option value=user>ユーザー</option>
        <option value=channel>チャンネル</option>
      </select>
    </label>
    |
    <label><input type=checkbox id=nrn-ng-movie-visible-checkbox> NG動画を表示</label>
    <span class=nrn-config-separator>|</span>
    <span class=nrn-detail-bulk-label>タグ・投稿者情報</span>
    <button type=button id=nrn-open-all-movie-info>全て開く</button>
    <button type=button id=nrn-close-all-movie-info>全て閉じる</button>
    <span class=nrn-config-separator>|</span>
    <span id=nrn-config-button>設定</span>
  </div>`
        var e = doc.createElement('div')
        e.innerHTML = html
        var result = e.firstChild
        result.remove()
        return result
      }
      var ConfigBar = function(doc) {
        this.elem = createConfigBar(doc)
      }
      ConfigBar.prototype = {
        get _viewModeSelect() {
          return this.elem.querySelector('#nrn-visited-movie-view-mode-select')
        },
        get visitedMovieViewMode() {
          return this._viewModeSelect.value
        },
        set visitedMovieViewMode(viewMode) {
          this._viewModeSelect.value = viewMode
        },
        get _visibleContributorTypeSelect() {
          return this.elem.querySelector('#nrn-visible-contributor-type-select')
        },
        get visibleContributorType() {
          return this._visibleContributorTypeSelect.value
        },
        set visibleContributorType(type) {
          this._visibleContributorTypeSelect.value = type
        },
        get _ngMovieVisibleCheckbox() {
          return this.elem.querySelector('#nrn-ng-movie-visible-checkbox')
        },
        get ngMovieVisible() {
          return this._ngMovieVisibleCheckbox.checked
        },
        set ngMovieVisible(visible) {
          this._ngMovieVisibleCheckbox.checked = visible
        },
        bindToConfig(config) {
          this.visitedMovieViewMode = config.visitedMovieViewMode.value
          this.visibleContributorType = config.visibleContributorType.value
          this.ngMovieVisible = config.ngMovieVisible.value
          config.visitedMovieViewMode.on('changed', set(this, 'visitedMovieViewMode'))
          config.visibleContributorType.on('changed', set(this, 'visibleContributorType'))
          config.ngMovieVisible.on('changed', set(this, 'ngMovieVisible'))
          return this
        },
      }
      return ConfigBar
    })()

    var NicoPage = function(doc) {
      this.doc = doc
      this._toggleToMovieRoot = new Map()
    }
    NicoPage.prototype = {
      createConfigBar() {
        return new ConfigBar(this.doc)
      },
      createTables() { return [] },
      createMovieRoot() {
        throw new Error('must be implemented')
      },
      get _configBarContainer() {
        throw new Error('must be implemented')
      },
      addConfigBar(bar) {
        var target = this._configBarContainer
        if (target) {
          target.insertBefore(bar.elem, target.firstChild);
        }
      },
      parse() {
        throw new Error('must be implemented')
      },
      mapToggleTo(movieRoot) {
        var m = this._toggleToMovieRoot
        m.set(movieRoot.movieInfo.toggle, movieRoot)
        m.set(movieRoot.description.openButton, movieRoot)
        m.set(movieRoot.description.closeButton, movieRoot)
      },
      unmapToggleFrom(movieRoot) {
        var m = this._toggleToMovieRoot
        m.delete(movieRoot.movieInfo.toggle)
        m.delete(movieRoot.description.openButton)
        m.delete(movieRoot.description.closeButton)
      },
      getMovieRootBy(toggle) {
        return this._toggleToMovieRoot.get(toggle)
      },
      _configDialogLoaded() {},
      showConfigDialog(config) {
        var back = this.doc.createElement('div')
        back.style.backgroundColor = 'black'
        back.style.opacity = '0.58'
        back.style.zIndex = '10000'
        back.style.backdropFilter = 'blur(3px)'
        back.style.position = 'fixed'
        back.style.top = '0'
        back.style.left = '0'
        back.style.width = '100%'
        back.style.height = '100%'
        this.doc.body.appendChild(back)

        var f = this.doc.createElement('iframe')
        f.style.position = 'fixed'
        f.style.top = '0'
        f.style.left = '0'
        f.style.width = '100%'
        f.style.height = '100%'
        f.style.zIndex = '10001'
        f.srcdoc = ConfigDialog.SRCDOC
        f.addEventListener('load', function loaded() {
          this._configDialogLoaded(f.contentDocument)
          var themeResult = DetailUiTheme.resolve(config, this.doc)
          f.contentDocument.documentElement.dataset.nrnTheme = themeResult.resolved
          const openInTab = typeof GM_openInTab === 'undefined'
                            ? GM.openInTab : GM_openInTab
          new ConfigDialog(config, f.contentDocument, openInTab)
            .on('closed', function() {
              if (f.isConnected) f.remove()
              if (back.isConnected) back.remove()
            })
        }.bind(this))
        this.doc.body.appendChild(f)
      },
      bindToConfig() {},
      get css() {
        throw new Error('must be implemented')
      },
      observeMutation() {},
    }
    Object.assign(NicoPage, {
      MovieTitle,
      ActionPane,
      TagView,
      ContributorView,
      MovieInfo,
      Description,
      MovieRoot,
      ConfigBar,
    })
    return NicoPage
  })()

  var ListPage = (function(_super) {

    const wrapTitleTextNodeInElement = parentOfTitleTextNode => {
      const e = document.createElement('span');
      e.classList.add('nrn-movie-title');
      if (!parentOfTitleTextNode) return e;
      const s = parentOfTitleTextNode.querySelector('span');
      if (s) {
        // 有料動画、プレミアム限定動画のタイトルの先頭にタグがつくので、それに対する場合分け
        e.textContent = parentOfTitleTextNode.lastChild?.textContent ?? '';
        parentOfTitleTextNode.replaceChildren(s, e);
      } else {
        e.textContent = parentOfTitleTextNode.textContent;
        parentOfTitleTextNode.replaceChildren(e);
      }
      return e;
    };

    const formatSecondsAsDuration = seconds => {
      seconds = Math.max(0, Math.trunc(seconds || 0));
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + ':' + (s < 10 ? '0' + s : s);
    };

    const formatRelativeOrDate = isoString => {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMin < 60) return Math.max(diffMin, 0) + '分前';
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return diffHour + '時間前';
      return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
    };

    const VIEW_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" class="w_font h_font"><path fill-rule="evenodd" d="M35.18 16.92 8.01 2.94C5.56 1.68 2.5 3.26 2.5 5.78v27.96c0 2.52 3.06 4.1 5.51 2.84L35.18 22.6c2.45-1.26 2.45-4.42 0-5.68" clip-rule="evenodd"></path></svg>';
    const COMMENT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" class="w_font h_font"><path fill-rule="evenodd" d="M5.38 1.67A2.9 2.9 0 0 0 2.5 4.53v20.65c0 1.58 1.3 2.87 2.88 2.87h5.75v9.31c0 1.58 1 2.04 2.2 1.03l10.75-10.34h10.06a2.9 2.9 0 0 0 2.88-2.87V4.53c0-1.57-1.3-2.86-2.88-2.86z" clip-rule="evenodd"></path></svg>';
    const NICOAD_RIBBON = {
      gold: "data:image/svg+xml,%3csvg%20width='50'%20height='50'%20viewBox='0%200%2050%2050'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M48.9979%200H3.00073H1.00024C0.448108%200%200%200.448108%200%201.00024V3.00073V48.9979C0%2049.8911%201.08126%2050.3362%201.71041%2049.702L3.7109%2047.6855C3.89694%2047.4975%204.00097%2047.2444%204.00097%2046.9814V40.0097L40.0097%204.00097H46.9814C47.2454%204.00097%2047.4985%203.89694%2047.6855%203.7109L49.702%201.71041C50.3362%201.08126%2049.8911%200%2048.9979%200Z'%20fill='%23FFD700'/%3e%3cg%20clip-path='url(%23clip0_597_346)'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M10.6963%205.59039C11.2495%205.04209%2012.4718%205.27496%2013.9554%206.08324L13.7742%207.09236C13.0017%206.72641%2012.4028%206.64263%2012.1231%206.92109C11.4725%207.57042%2012.7897%209.93858%2015.0717%2012.2119C17.3524%2014.4839%2019.7293%2015.8011%2020.3811%2015.1505C20.662%2014.8794%2020.5758%2014.2745%2020.2086%2013.5044L21.2141%2013.3245C22.0261%2014.8055%2022.2602%2016.0204%2021.7106%2016.5699C21.5862%2016.687%2021.4321%2016.7695%2021.2658%2016.8102L21.267%2016.8127L9.91263%2019.8486L9.34337%2021.9679C9.32858%2022.032%209.29654%2022.0911%209.24972%2022.1392C8.86405%2022.515%207.63435%2021.9051%206.4909%2020.7641C5.34745%2019.6219%204.7326%2018.3935%205.11211%2018.014C5.16016%2017.9684%205.21931%2017.9364%205.28461%2017.9216L7.4101%2017.3536L10.4499%206.03395C10.4917%205.86638%2010.5768%205.7136%2010.6963%205.59039ZM21.558%2010.6172C21.8389%2010.5421%2022.1272%2010.7084%2022.2024%2010.9881L22.2319%2011.099C22.3071%2011.3787%2022.1408%2011.6658%2021.8598%2011.7409L18.1757%2012.7254C17.8947%2012.8006%2017.6076%2012.6342%2017.5312%2012.3546L17.5017%2012.2437C17.4265%2011.964%2017.5928%2011.6769%2017.8738%2011.6017L21.558%2010.6172ZM19.2388%207.22949C19.4445%207.02496%2019.7772%207.02496%2019.983%207.22949L20.0643%207.31205C20.2701%207.51658%2020.2701%207.84802%2020.0643%208.05256L16.9556%2011.1526C16.7498%2011.3571%2016.4171%2011.3571%2016.2113%2011.1526L16.13%2011.0713C15.9242%2010.8655%2015.9242%2010.5341%2016.13%2010.3295L19.2388%207.22949ZM16.0671%205.00177L16.1607%205.01806L16.2728%205.04763C16.5538%205.12279%2016.7201%205.41111%2016.6449%205.6908L15.6567%209.36256C15.5828%209.64226%2015.2932%209.80859%2015.0135%209.73343L14.9014%209.70386C14.6205%209.6287%2014.4541%209.34162%2014.5293%209.06192L15.5175%205.38893C15.5927%205.10924%2015.8798%204.9429%2016.1607%205.01806L16.0671%205.00177Z'%20fill='%23DCA000'/%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_597_346'%3e%3crect%20width='18'%20height='18'%20fill='white'%20transform='translate(5%205)'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e",
      silver: "data:image/svg+xml,%3csvg%20width='50'%20height='50'%20viewBox='0%200%2050%2050'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M48.9979%200H3.00073H1.00024C0.448108%200%200%200.448108%200%201.00024V3.00073V48.9979C0%2049.8911%201.08126%2050.3362%201.71041%2049.702L3.7109%2047.6855C3.89694%2047.4975%204.00097%2047.2444%204.00097%2046.9814V40.0097L40.0097%204.00097H46.9814C47.2454%204.00097%2047.4985%203.89694%2047.6855%203.7109L49.702%201.71041C50.3362%201.08126%2049.8911%200%2048.9979%200Z'%20fill='%23BEC8C8'/%3e%3cg%20clip-path='url(%23clip0_597_345)'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M10.6963%205.59039C11.2495%205.04209%2012.4718%205.27496%2013.9554%206.08324L13.7742%207.09236C13.0017%206.72641%2012.4028%206.64263%2012.1231%206.92109C11.4725%207.57042%2012.7897%209.93858%2015.0717%2012.2119C17.3524%2014.4839%2019.7293%2015.8011%2020.3811%2015.1505C20.662%2014.8794%2020.5758%2014.2745%2020.2086%2013.5044L21.2141%2013.3245C22.0261%2014.8055%2022.2602%2016.0204%2021.7106%2016.5699C21.5862%2016.687%2021.4321%2016.7695%2021.2658%2016.8102L21.267%2016.8127L9.91263%2019.8486L9.34337%2021.9679C9.32858%2022.032%209.29654%2022.0911%209.24972%2022.1392C8.86405%2022.515%207.63435%2021.9051%206.4909%2020.7641C5.34745%2019.6219%204.7326%2018.3935%205.11211%2018.014C5.16016%2017.9684%205.21931%2017.9364%205.28461%2017.9216L7.4101%2017.3536L10.4499%206.03395C10.4917%205.86638%2010.5768%205.7136%2010.6963%205.59039ZM21.558%2010.6172C21.8389%2010.5421%2022.1272%2010.7084%2022.2024%2010.9881L22.2319%2011.099C22.3071%2011.3787%2022.1408%2011.6658%2021.8598%2011.7409L18.1757%2012.7254C17.8947%2012.8006%2017.6076%2012.6342%2017.5312%2012.3546L17.5017%2012.2437C17.4265%2011.964%2017.5928%2011.6769%2017.8738%2011.6017L21.558%2010.6172ZM19.2388%207.22949C19.4445%207.02496%2019.7772%207.02496%2019.983%207.22949L20.0643%207.31205C20.2701%207.51658%2020.2701%207.84802%2020.0643%208.05256L16.9556%2011.1526C16.7498%2011.3571%2016.4171%2011.3571%2016.2113%2011.1526L16.13%2011.0713C15.9242%2010.8655%2015.9242%2010.5341%2016.13%2010.3295L19.2388%207.22949ZM16.0671%205.00177L16.1607%205.01806L16.2728%205.04763C16.5538%205.12279%2016.7201%205.41111%2016.6449%205.6908L15.6567%209.36256C15.5828%209.64226%2015.2932%209.80859%2015.0135%209.73343L14.9014%209.70386C14.6205%209.6287%2014.4541%209.34162%2014.5293%209.06192L15.5175%205.38893C15.5927%205.10924%2015.8798%204.9429%2016.1607%205.01806L16.0671%205.00177Z'%20fill='%23889C9C'/%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_597_345'%3e%3crect%20width='18'%20height='18'%20fill='white'%20transform='translate(5%205)'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e"
    };
    const NICOAD_POINT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="w_font h_font"><path fill-rule="evenodd" d="M8.6 2.68c.65-.63 2.06-.36 3.78.58l-.2 1.17c-.9-.43-1.6-.53-1.92-.2-.76.75.77 3.5 3.42 6.13 2.64 2.64 5.4 4.16 6.15 3.4.33-.3.23-1-.2-1.9l1.17-.2c.94 1.7 1.21 3.12.57 3.75q-.22.21-.51.28L7.7 19.23l-.66 2.45a.4.4 0 0 1-.11.2c-.45.44-1.88-.27-3.2-1.6-1.33-1.32-2.04-2.74-1.6-3.18a.4.4 0 0 1 .2-.1l2.46-.67L8.32 3.2q.08-.3.28-.52m12.6 5.83c.32-.08.66.1.74.43l.04.13a.6.6 0 0 1-.43.75l-4.27 1.14a.6.6 0 0 1-.75-.43l-.04-.13a.6.6 0 0 1 .44-.75zm-2.7-3.93a.6.6 0 0 1 .87 0l.1.1a.6.6 0 0 1 0 .86l-3.6 3.6a.6.6 0 0 1-.87 0l-.1-.1a.6.6 0 0 1 0-.86zM14.84 2l.11.02.13.04a.6.6 0 0 1 .43.74l-1.14 4.26a.6.6 0 0 1-.75.43l-.13-.04a.6.6 0 0 1-.43-.74l1.14-4.26a.6.6 0 0 1 .75-.43z" clip-rule="evenodd"></path></svg>';

    var MovieRoot = (function(_super) {
      var MovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-parsed');
      }
      MovieRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          let e = this.elem.querySelector('.nrn-movie-title');
          if (!e) {
            const a = this.elem.querySelector('div:not(.pos_relative) > a[data-anchor-area][href^="/watch/"]');
            e = wrapTitleTextNodeInElement(a);
          }
          return e;
        },
        get _movieAnchorSelectors() {
          // 投稿者やタグへのリンクではなく、動画ページへのリンクだけを対象にする。
          return [
            'a[href^="/watch/"]',
            'a[href^="https://www.nicovideo.jp/watch/"]'
          ];
        },
        set actionPane(actionPane) {
          this._actionPane = actionPane;
          this.elem.appendChild(actionPane.elem);
        },
        _addMovieInfo() {
          this.movieInfo.elem.dataset.nrnLayout = 'reserved-below-card'
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this);
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle);
          }
          this._scheduleMovieInfoTogglePin()
        },
        preventPageTransition(controller) {
          const f = e => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target.classList.contains('nrn-movie-tag-link') || e.target.classList.contains('nrn-contributor-link')) {
              NewTabService.open(e.target.href)
            } else {
              controller._clicked(e)
            }
          };
          this.movieInfo.elem.addEventListener('click', f);
          this.movieInfo.toggle.addEventListener('click', f);
          this._actionPane?.elem.addEventListener('click', f);
        },
      })
      return MovieRoot
    })(_super.MovieRoot)

    const AdsRoot = (function(_super) {
      const AdsRoot = function(elem) {
        _super.call(this, elem)
      }
      AdsRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          let e = this.elem.querySelector('.nrn-movie-title');
          if (!e) {
            const a = this.elem.querySelector('a[data-anchor-area][href^="/watch/"] > div > p');
            e = wrapTitleTextNodeInElement(a);
          }
          return e;
        },
      })
      return AdsRoot
    })(MovieRoot);

    const isTargetPage = () => {
      return ListPage.is(location) || SearchPage.is(location);
    };
    var parent = function(className, child) {
      for (var e = child; e; e = e.parentNode) {
        if (e.classList.contains(className)) return e
      }
      return null
    }
    var ListPage = function(doc) {
      _super.call(this, doc)
      this.movieRoots = [];
    }
    ListPage.prototype = createObject(_super.prototype, {
      createTables() { return [] },
      _createMovieRoot(resultOfParsing) {
        switch (resultOfParsing.type) {
          case 'main': return new MovieRoot(resultOfParsing.rootElem)
          case 'ads': return new AdsRoot(resultOfParsing.rootElem)
          default: throw new Error(resultOfParsing.type)
        }
      },
      createMovieRoot(resultOfParsing) {
        const res = this._createMovieRoot(resultOfParsing);
        this.movieRoots.push(res);
        return res;
      },
      get _currentPageNumber() {
        return parseInt(new URLSearchParams(location.search).get('page') || '1', 10) || 1
      },
      _paginationSnapshot() {
        var current = this._currentPageNumber
        var pathname = location.pathname
        var rows = []
        var pageNumbers = []
        var itemElements = Array.from(this.doc.querySelectorAll(
          '[data-scope="pagination"] [data-part="item"]'
        ))

        itemElements.forEach(function(el) {
          var href = el.getAttribute('href') || ''
          var n = parseInt(el.getAttribute('data-index'),10)
          var parsedHref = null
          var samePath = true
          if (href) {
            try {
              parsedHref = new URL(href,location.href)
              samePath = parsedHref.origin === location.origin && parsedHref.pathname === pathname
              if (isNaN(n) && samePath) n = parseInt(parsedHref.searchParams.get('page'),10)
            } catch(e) { samePath = false }
          }
          if (!samePath || isNaN(n) || n < 1) return
          pageNumbers.push(n)
          rows.push({
            page:n,
            href:parsedHref ? parsedHref.href : href,
            text:String(el.textContent || '').trim().slice(0,40),
            ariaLabel:el.getAttribute('aria-label') || '',
            selected:el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page',
            dataIndex:el.getAttribute('data-index')
          })
        })

        var uniquePages = [...new Set(pageNumbers)].sort(function(a,b){return a-b})
        var selectedLast = itemElements.find(function(el) {
          var label = String(el.getAttribute('aria-label') || '').toLowerCase()
          return (el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page')
            && label.indexOf('last page') !== -1
        })
        var selectedLastPage = null
        if (selectedLast) {
          selectedLastPage = parseInt(selectedLast.getAttribute('data-index'),10)
          if (isNaN(selectedLastPage)) {
            try {
              selectedLastPage = parseInt(new URL(selectedLast.getAttribute('href'),location.href)
                .searchParams.get('page'),10)
            } catch(e) {}
          }
          if (isNaN(selectedLastPage)) selectedLastPage = null
        }

        var nextControl = this.doc.querySelector(
          '[data-scope="pagination"] [data-part="next-trigger"],'
          + '[data-scope="pagination"] [aria-label="next page"]'
        )
        var nextDisabled = Boolean(nextControl && (
          nextControl.hasAttribute('data-disabled')
          || nextControl.getAttribute('aria-disabled') === 'true'
        ))

        var maxPage = selectedLastPage != null
          ? selectedLastPage
          : (uniquePages.length ? Math.max.apply(Math,uniquePages) : null)
        var isFinalPageEvidence = Boolean(
          selectedLastPage === current
          || (nextDisabled && uniquePages.indexOf(current) !== -1)
        )
        if (isFinalPageEvidence) maxPage = current

        return {
          currentPage:current,
          maxPage:maxPage,
          pageNumbers:uniquePages,
          rows:rows,
          linkCount:rows.length,
          hasHigherPage:!isFinalPageEvidence
            && uniquePages.some(function(n){return n > current}),
          hasLowerPage:uniquePages.some(function(n){return n < current}),
          hasPaginationEvidence:uniquePages.length > 0,
          selectedLastPage:selectedLastPage,
          nextDisabled:nextDisabled,
          isFinalPageEvidence:isFinalPageEvidence
        }
      },
      _lastPageNumber() {
        var snapshot = this._paginationSnapshot()
        // v9.9の不具合修正:
        // ページャー未描画時に currentPage を最終ページとして返してはいけない。
        return snapshot.hasPaginationEvidence ? snapshot.maxPage : null
      },
      async fetchPageItems(pageNumber, options) {
        options = options || {}
        var timingStart = performance.now()
        var url = new URL(location.href)
        url.searchParams.set('page', pageNumber)

        var fetchScope = String(options.scope || 'RUN').toUpperCase()
        var fetchRequestId = options.requestId
          || (fetchScope + '-p' + pageNumber + '-' + Math.random().toString(36).slice(2, 7))
        var fetchLog = '[NicoNicoRankingNG autoFill][' + fetchScope + '][' + fetchRequestId + ']'

        console.log(fetchLog, '取得開始:', {
          page: pageNumber,
          url: url.toString(),
          scope: fetchScope,
          requestId: fetchRequestId
        })

        var networkStart = performance.now()
        var res = await fetch(url.toString(), {
          credentials: 'same-origin',
          cache: 'no-store'
        })
        if (!res.ok) {
          var httpError = new Error('HTTP ' + res.status)
          httpError.status = res.status
          httpError.pageNumber = pageNumber
          httpError.url = url.toString()
          throw httpError
        }

        var responseReceivedAt = performance.now()
        var html = await res.text()
        var bodyReadAt = performance.now()
        var doc = new DOMParser().parseFromString(html, 'text/html')
        var parsedAt = performance.now()

        var items = []
        var maxPage = null
        var hasNextPage = null

        // まず NicoNico の server-response JSON を試す。
        var metaElem = doc.querySelector('meta[name="server-response"]')
        if (metaElem) {
          try {
            var parsed = JSON.parse(metaElem.getAttribute('content'))
            var searchData = parsed
              && parsed.data
              && parsed.data.response
              && parsed.data.response['$getSearchVideoV2']
              && parsed.data.response['$getSearchVideoV2'].data

            var jsonMaxPage = parsed
              && parsed.data
              && parsed.data.response
              && parsed.data.response.page
              && parsed.data.response.page.pagination
              && parsed.data.response.page.pagination.maxPage

            if (Number.isFinite(Number(jsonMaxPage))) {
              maxPage = Number(jsonMaxPage)
            }
            if (searchData && Array.isArray(searchData.items)) {
              items = searchData.items
            }
          } catch (e) {
            console.warn(fetchLog, 'server-response JSON解析失敗。DOM解析へ切り替えます。', e)
          }
        }

        // JSON側の構造が変更されていた場合は、実際の現行タイルDOMを直接読む。
        if (!items.length) {
          var roots = Array.from(doc.querySelectorAll('[data-decoration-video-id]'))
          var seen = new Set()

          items = roots.map(function(root) {
            var id = root.getAttribute('data-decoration-video-id')
            if (!id || seen.has(id)) return null
            seen.add(id)

            var titleAnchor =
              root.querySelector('a[href^="/watch/"].fw_bold') ||
              Array.from(root.querySelectorAll('a[href^="/watch/"]')).find(function(a) {
                return a.textContent && a.textContent.trim()
              })
            var thumb = root.querySelector('img[src*="/nicovideo/thumbnails/"]')
            var times = root.querySelectorAll('time')
            var durationSpan = root.querySelector('.pos_absolute time span')
            var ownerAnchor = root.querySelector('a[href*="/user/"]')
            var ownerImg = ownerAnchor && ownerAnchor.querySelector('img')
            var ownerNameElem = ownerAnchor && ownerAnchor.querySelector('p')
            var metaSpans = root.querySelectorAll('.ff_metaNumber span')

            var duration = 0
            if (durationSpan) {
              var parts = durationSpan.textContent.trim().split(':').map(Number)
              if (parts.length === 2 && parts.every(Number.isFinite)) {
                duration = parts[0] * 60 + parts[1]
              } else if (parts.length === 3 && parts.every(Number.isFinite)) {
                duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
              }
            }

            var ownerId = null
            if (ownerAnchor) {
              var m = ownerAnchor.getAttribute('href').match(/\/user\/(\d+)/)
              if (m) ownerId = Number(m[1])
            }

            var registeredAt = ''
            for (var i = 0; i < times.length; i++) {
              if (times[i].getAttribute('datetime')) {
                registeredAt = times[i].getAttribute('datetime')
                break
              }
            }

            var parseCount = function(s) {
              if (!s) return 0
              var n = Number(String(s).replace(/[^\d]/g, ''))
              return Number.isFinite(n) ? n : 0
            }

            return {
              id: id,
              title: titleAnchor ? titleAnchor.textContent.trim() : id,
              thumbnail: {
                listingUrl: thumb ? thumb.getAttribute('src') : ''
              },
              duration: duration,
              registeredAt: registeredAt,
              count: {
                view: metaSpans[0] ? parseCount(metaSpans[0].textContent) : 0,
                comment: metaSpans[1] ? parseCount(metaSpans[1].textContent) : 0
              },
              owner: {
                id: ownerId,
                name: ownerNameElem ? ownerNameElem.textContent.trim() : '',
                iconUrl: ownerImg ? ownerImg.getAttribute('src') : ''
              }
            }
          }).filter(Boolean)

          // ページネーションDOMから最大ページを読む
          Array.from(doc.querySelectorAll(
            '[data-scope="pagination"] [data-part="item"], a[href*="page="]'
          )).forEach(function(el) {
            var n = parseInt(
              el.getAttribute('data-index') ||
              (function() {
                try {
                  return new URL(el.getAttribute('href'), location.origin).searchParams.get('page')
                } catch (e) {
                  return ''
                }
              })(),
              10
            )
            if (!isNaN(n) && n > maxPage) maxPage = n
          })

          console.log(fetchLog, 'DOMから', items.length, '件取得')
        } else {
          console.log(fetchLog, 'server-responseから', items.length, '件取得')
        }

        // SSR HTML のページネーションと <link rel=next> から終端を判定する。
        // maxPage が読めないときに「今取得したページ=最終ページ」とは絶対にみなさない。
        var paginationItems = Array.from(doc.querySelectorAll(
          '[data-scope="pagination"] [data-part="item"]'
        ))
        var pageNumbers = []
        paginationItems.forEach(function(el) {
          var n = parseInt(el.getAttribute('data-index'),10)
          if (isNaN(n)) {
            try {
              var href = el.getAttribute('href')
              if (href) n = parseInt(new URL(href,location.origin).searchParams.get('page'),10)
            } catch(e) {}
          }
          if (!isNaN(n)) pageNumbers.push(n)
        })

        var selectedLast = paginationItems.find(function(el) {
          var label = String(el.getAttribute('aria-label') || '').toLowerCase()
          return (el.hasAttribute('data-selected') || el.getAttribute('aria-current') === 'page')
            && label.indexOf('last page') !== -1
        })
        var selectedLastPage = null
        if (selectedLast) {
          selectedLastPage = parseInt(selectedLast.getAttribute('data-index'),10)
          if (isNaN(selectedLastPage)) {
            try {
              selectedLastPage = parseInt(new URL(selectedLast.getAttribute('href'),location.origin)
                .searchParams.get('page'),10)
            } catch(e) {}
          }
          if (isNaN(selectedLastPage)) selectedLastPage = null
        }

        var nextTrigger = doc.querySelector(
          '[data-scope="pagination"] [data-part="next-trigger"],'
          + '[data-scope="pagination"] [aria-label="next page"]'
        )
        var nextDisabled = Boolean(nextTrigger && (
          nextTrigger.hasAttribute('data-disabled')
          || nextTrigger.getAttribute('aria-disabled') === 'true'
        ))

        if (selectedLastPage != null) {
          maxPage = selectedLastPage
        } else if (pageNumbers.length) {
          var domMaxPage = Math.max.apply(Math,pageNumbers)
          if (!Number.isFinite(Number(maxPage)) || domMaxPage > Number(maxPage)) maxPage = domMaxPage
        }

        if (selectedLastPage === pageNumber || nextDisabled) {
          hasNextPage = false
          maxPage = pageNumber
        } else {
          var nextLink = doc.querySelector('link[rel="next"], a[rel="next"]')
          if (nextLink) hasNextPage = true
          else {
            hasNextPage = pageNumbers.some(function(n){return n > pageNumber})
            if (!hasNextPage && pageNumbers.length) hasNextPage = false
          }
        }

        var timingEnd = performance.now()
        var timings = {
          networkMs: Math.round(responseReceivedAt - networkStart),
          bodyReadMs: Math.round(bodyReadAt - responseReceivedAt),
          htmlParseMs: Math.round(parsedAt - bodyReadAt),
          itemParseAndPaginationMs: Math.round(timingEnd - parsedAt),
          totalMs: Math.round(timingEnd - timingStart)
        }

        console.log(fetchLog, '取得ページ解析:', {
          scope: fetchScope,
          requestId: fetchRequestId,
          page: pageNumber,
          items: items.length,
          maxPage: maxPage,
          hasNextPage: hasNextPage,
          timings: timings,
          finalPageEvidence:{
            selectedLastPage:selectedLastPage,
            nextDisabled:nextDisabled,
            hasNextPage:hasNextPage
          }
        })

        return {
          items: items,
          maxPage: maxPage,
          hasNextPage: hasNextPage,
          pageNumber: pageNumber,
          timings: timings
        }
      },
      _nextInsertAnchor() {
        if (this._injectAnchor && this._injectAnchor.isConnected) {
          return this._injectAnchor
        }

        // movieRoots の配列順ではなく、実際のDOM上で最後のメイン動画を基準にする。
        var mainCards = Array.from(this.doc.querySelectorAll(
          '[data-decoration-video-id][data-anchor-area="main"]:not([data-nrn-autofill="true"])'
        )).filter(function(el) {
          return el.isConnected
        })

        if (!mainCards.length) {
          mainCards = Array.from(this.doc.querySelectorAll(
            '[data-decoration-video-id]:not([data-nrn-autofill="true"])'
          )).filter(function(el) {
            return el.isConnected
          })
        }

        if (mainCards.length) {
          this._injectAnchor = mainCards[mainCards.length - 1]
          console.log(
            '[NicoNicoRankingNG autoFill] 初回挿入アンカー:',
            this._injectAnchor.getAttribute('data-decoration-video-id'),
            'DOM候補数=' + mainCards.length
          )
          return this._injectAnchor
        }

        return null
      },
      _appendInjectedTile(tileElem) {
        var anchor = this._nextInsertAnchor()
        if (anchor && anchor.parentNode) {
          anchor.insertAdjacentElement('afterend', tileElem)
        } else {
          console.warn('[NicoNicoRankingNG] 本物のタイルが見つからないため、独立した領域に追加しました')
          this._fallbackContainer().appendChild(tileElem)
        }
        this._injectAnchor = tileElem
      },
      _fallbackContainer() {
        // 本物のタイルが1件も見つからない場合のみ使う最終手段
        var existing = this.doc.getElementById('nrn-autofill-container')
        if (existing) return existing
        var label = this.doc.createElement('div')
        label.id = 'nrn-autofill-label'
        label.textContent = '↓ ここから自動継ぎ足し（次ページ以降の動画）'
        label.style.cssText = 'width:100%;font-size:80%;color:#999;margin:12px 0 4px;border-top:1px dashed #999;padding-top:8px;'
        var wrap = this.doc.createElement('div')
        wrap.className = 'cq-t_inline-size'
        var container = this.doc.createElement('div')
        container.id = 'nrn-autofill-container'
        container.className = 'd_grid grid-tc_repeat(5,_1fr) rg_x4 cg_x2 [@container_(max-width:_968px)]:grid-tc_repeat(3,_1fr) [@container_(max-width:_1296px)]:grid-tc_repeat(4,_1fr)'
        wrap.appendChild(container)
        var host = this.doc.querySelector('[aria-label="nicovideo-content"]') || this.doc.body
        host.appendChild(label)
        host.appendChild(wrap)
        return container
      },
      _createInjectedTile(item) {
        var doc = this.doc
        var thumbUrl = (item.thumbnail && (item.thumbnail.listingUrl || item.thumbnail.middleUrl || item.thumbnail.url)) || ''
        var watchUrl = 'https://www.nicovideo.jp/watch/' + item.id
        var view = (item.count && item.count.view) || 0
        var comment = (item.count && item.count.comment) || 0
        var owner = item.owner || {}
        var ownerName = owner.name || (owner.visibility === 'hidden' ? '(投稿者非公開)' : '不明')
        var ownerIcon = owner.iconUrl || 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
        var ownerUrl = owner.id ? ('https://www.nicovideo.jp/user/' + owner.id) : ''
        var root = doc.createElement('div')
        root.className = 'Pressable cursor_pointer d_flex cq-t_inline-size min-w_thumbnail.min max-w_thumbnail.max w_100% nrn-autofill-pending'
        root.setAttribute('data-decoration-video-id', item.id)
        root.setAttribute('data-nrn-autofill', 'true')
        root.setAttribute('data-anchor-area', 'main')
        root.setAttribute('data-anchor-page',
          location.pathname.startsWith('/tag/') ? 'tag' :
          location.pathname.startsWith('/search/') ? 'search' : 'main')
        if (item.__nrnSourcePage != null) {
          root.setAttribute('data-nrn-source-page', String(item.__nrnSourcePage))
        }
        if (item.__nrnSourceIndex != null) {
          root.setAttribute('data-nrn-source-index', String(item.__nrnSourceIndex))
        }
        root.innerHTML =
          '<div class="d_flex flex-d_column w_100% min-h_[calc(_100cqi_*_9_/_16_+_{lineHeights.base}_*_2_*_{fontSizes.l}_+_{sizes.base}_+_{sizes.x0_5}_+_{lineHeights.base}_*_{fontSizes.s}_+_{sizes.base}_+_{sizes.x3}_)]">' +
            '<div class="pos_relative nrn-thumb-anchor-wrap">' +
              '<a href="' + watchUrl + '" class="hover:c_action.primaryAzure">' +
                '<div class="pos_relative asp_16:9 bg-c_layer.surfaceHighEmBlack bdr_m ov_hidden content-visibility_auto contain_content w_100% min-w_100% [&_>_img]:obj-f_contain [&_>_img]:h_100%">' +
                  '<img alt="" class="mx_auto bdr_s" loading="lazy" decoding="async" src="' + thumbUrl + '">' +
                  '<div class="pos_absolute bottom_x0_5 right_x0_5 z_forward p_x0_5 ff_metaNumber fs_s fw_bold lh_1 c_textOnLayer.highEmWhite bg-c_layer.surfaceOverlayBlack bdr_s">' +
                    '<time><span class="white-space_nowrap">' + formatSecondsAsDuration(item.duration) + '</span></time>' +
                  '</div>' +
                '</div>' +
              '</a>' +
            '</div>' +
            '<a href="' + watchUrl + '" class="hover:c_action.primaryAzure fs_l mt_x0_5 mb_base fw_bold lc_2 visited:text-layer_visited groupHover:text-layer_accentAzure [@container_(max-width:_320px)]:fs_base h_[calc({lineHeights.base}_*_2em)] nrn-title-anchor"></a>' +
            '<div class="fs_s flex-wrap_wrap d_flex gap_base mb_base text-layer_lowEm [&_>_*]:d_flex [&_>_*]:ai_center [&_>_*]:gap_x0_5 [&_>_*]:lh_1 [&_>_*]:ff_metaNumber [&_>_*]:fs_s [&_>_*]:white-space_nowrap">' +
              '<time>' + formatRelativeOrDate(item.registeredAt) + '</time>' +
              '<p>' + VIEW_ICON_SVG + '<span class="white-space_nowrap">' + view.toLocaleString() + '</span></p>' +
              '<p>' + COMMENT_ICON_SVG + '<span class="white-space_nowrap">' + comment.toLocaleString() + '</span></p>' +
            '</div>' +
            (ownerUrl ?
              '<a href="' + ownerUrl + '" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center text-layer_mediumEm w_fit-content fs_base [@container_(max-width:_320px)]:fs_s">' +
                '<img alt="" class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3" loading="lazy" decoding="async" src="' + ownerIcon + '">' +
                '<p class="fw_bold lc_1"></p>' +
              '</a>' : '<span class="fs_base text-layer_mediumEm">' + ownerName + '</span>') +
          '</div>'
        // XSS対策のためテキストはDOM APIで設定する（タイトル・投稿者名にHTMLを解釈させない）
        root.querySelector('img.mx_auto').alt = item.title || ''
        var titleA = root.querySelector('.nrn-title-anchor')
        titleA.textContent = item.title || ''
        titleA.classList.add('nrn-movie-title')
        titleA.classList.remove('nrn-title-anchor')
        if (ownerUrl) {
          root.querySelector('img.bdr_full').alt = ownerName
          root.querySelector('p.fw_bold.lc_1').textContent = ownerName
        }
        this._appendInjectedTile(root)
        // 自動追加分では1本ごとのニコニコ広告API通信を省略して高速化する。
        // 元ページ側の広告表示には影響しない。
        return root
      },
      async _applyAdDecoration(root, videoId) {
        try {
          var res = await fetch('https://api.nicoad.nicovideo.jp/v1/contents/video/' + videoId, {credentials: 'omit'})
          if (!res.ok) return
          var json = await res.json()
          var data = json && json.data
          var decoration = data && data.decoration
          if (decoration !== 'gold' && decoration !== 'silver') return
          var thumbWrap = root.querySelector('.nrn-thumb-anchor-wrap')
          if (thumbWrap) {
            var ribbon = this.doc.createElement('img')
            ribbon.alt = ''
            ribbon.className = 'pos_absolute top_-x0_5 left_-x0_5'
            ribbon.loading = 'lazy'
            ribbon.src = decoration === 'gold' ? NICOAD_RIBBON.gold : NICOAD_RIBBON.silver
            thumbWrap.appendChild(ribbon)
          }
          var colorClass = decoration === 'gold' ? 'c_serviceColor.nicoadGold fill_serviceColor.nicoadGold' : 'c_serviceColor.nicoadGray fill_serviceColor.nicoadGray'
          var sponsorDiv = this.doc.createElement('div')
          sponsorDiv.className = 'd_flex flex-d_column ' + colorClass
          var nameSpan = this.doc.createElement('span')
          nameSpan.className = 'fs_s fw_bold lc_1 min-h_font'
          nameSpan.textContent = '提供：' + (data.ownerName || '')
          var pointSpan = this.doc.createElement('span')
          pointSpan.className = 'd_inline-flex ai_center gap_x0_5 fs_s min-h_font'
          pointSpan.innerHTML = NICOAD_POINT_ICON_SVG
          pointSpan.appendChild(this.doc.createTextNode((data.totalPoint || 0).toLocaleString() + 'pt'))
          sponsorDiv.appendChild(nameSpan)
          sponsorDiv.appendChild(pointSpan)
          root.firstElementChild.appendChild(sponsorDiv)
        } catch (e) {
          // 広告枠の判定に失敗しても致命的ではないため無視する（CORS等でブロックされる場合がある）
        }
      },
      unbindUnconnectedMovieRoots() {
        const a = [];
        for (const r of this.movieRoots) {
          if (r.elem.isConnected) {
            a.push(r);
          } else {
            this.unmapToggleFrom(r);
            r.unbind();
          }
        }
        this.movieRoots = a;
      },
      addConfigBar(bar) {
        if (bar) {
          this.configBar = bar;
        } else if (this.configBar) {
          bar = this.configBar;
        } else {
          return;
        }
        if (bar.elem.isConnected) {
          return;
        }
        const e = this.doc.querySelector('[aria-label="nicovideo-content"] section > div:first-of-type');
        if (e) {
          e.after(bar.elem);
          return;
        }
        this.doc.querySelector('[aria-label="nicovideo-content"] .grid-area_header')?.append(bar.elem);
      },
      parse(target) {
        if (!isTargetPage()) return [];
        target = target || this.doc
        return this._parseMain(target).concat(this._parseAds(target));
      },
      _parseMain(target) {
        return Array.from(target.querySelectorAll('div[data-anchor] > div:not(.pos_relative) > a[data-anchor-area][href^="/watch/"]'))
          .map(function(item) {
            return {
              type: 'main',
              movie: {
                id: movieIdOf(item.href),
                title: item.lastChild?.textContent,
              },
              rootElem: SearchPage.is(location)
                      ? item.parentNode.parentNode
                      : item.parentNode.parentNode.parentNode.parentNode,
            }
          }).filter(e => e.movie.id && e.movie.title && !e.rootElem.classList.contains('nrn-parsed'));
      },
      _parseAds(target) {
        return Array.from(target.querySelectorAll('a[data-anchor-area][href^="/watch/"]:has(> div > p)'))
          .map(function(item) {
            return {
              type: 'ads',
              movie: {
                id: movieIdOf(item.href),
                title: item.querySelector(':scope > div > p')?.lastChild?.textContent,
              },
              rootElem: SearchPage.is(location)
                      ? item
                      : item.parentNode.parentNode,
            }
          }).filter(e => e.movie.id && e.movie.title && !e.rootElem.classList.contains('nrn-parsed'));
      },
      _configDialogLoaded(doc) {
        // 旧UIでは #togglable が存在したが、v9.3以降の新UIでは廃止。
        // null参照でConfigDialog生成前に例外を起こさないよう互換ガード。
        var togglable = doc.getElementById('togglable')
        if (togglable) togglable.hidden = true
      },
      observeMutation(callback) {
        new MutationObserver((records, observer) => {
          if (!isTargetPage()) return;
          const parsed = this.parse();
          if (parsed.length > 0) {
            callback(parsed, true);
            this.unbindUnconnectedMovieRoots();
          }
          this.addConfigBar();
        }).observe(this.doc.body, {childList: true, subtree: true});
      },
      get css() {
        return `#nrn-config-button,
.nrn-visit-button:hover,
.nrn-movie-ng-button:hover,
.nrn-title-ng-button:hover,
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-movie-info-toggle:hover {
  text-decoration: none;
  cursor: pointer;
  background: #f3f5f7;
}
#nrn-open-all-movie-info,
#nrn-close-all-movie-info {
  margin-left: 4px;
  padding: 2px 7px;
  border: 1px solid #ccd1d8;
  border-radius: 6px;
  background: #fff;
  color: #4e5661;
  font: inherit;
  cursor: pointer;
}
#nrn-open-all-movie-info:hover,
#nrn-close-all-movie-info:hover {
  background: #eef2f6;
}
.nrn-detail-bulk-label {
  color: #6c737d;
  font-size: .92em;
}
.nrn-config-separator {
  margin: 0 4px;
  color: #b0b5bc;
}
.nrn-movie-tag {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: start;
  gap: 5px;
  min-width: 0;
  margin: 0;
  padding: 6px 2px;
  border: 0;
  border-bottom: 1px solid #edf0f2;
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  line-height: 1.55;
}
.nrn-movie-tag:last-child {
  border-bottom: 0;
}
.nrn-movie-tag:hover {
  background: #f6f7f8;
}
.nrn-movie-tag.nrn-locked-tag {
  background: transparent;
}
.nrn-tag-lock-indicator {
  display: inline-flex;
  width: 18px;
  min-width: 18px;
  justify-content: center;
  color: #9b7c23;
  font-size: 12px;
  line-height: 1.55;
  filter: saturate(.72);
}
.nrn-tag-lock-placeholder {
  visibility: hidden;
}
.nrn-movie-tag-link {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.nrn-movie-tag-link,
.nrn-contributor-link {
  color: #272a2f;
  text-decoration: none;
}
.nrn-movie-tag-link:hover,
.nrn-contributor-link:hover {
  text-decoration: underline;
}
.nrn-tag-ng-button,
.nrn-contributor-ng-button,
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 6px;
  border: 1px solid #d3d7dc;
  border-radius: 6px;
  background: transparent;
  color: #6f7781;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}
.nrn-tag-ng-button {
  align-self: center;
  white-space: nowrap;
  opacity: .78;
  transition: opacity .12s ease, background-color .12s ease, border-color .12s ease;
}
.nrn-movie-tag:hover .nrn-tag-ng-button,
.nrn-tag-ng-button:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .nrn-tag-ng-button { opacity: 1; }
}
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover {
  border-color: #8d96a3;
  background: #eef1f5;
  text-decoration: none;
}
.nrn-movie-tag-link.nrn-movie-ng-tag-link,
.nrn-contributor-link.nrn-ng-contributor-link,
.nrn-matched-ng-contributor-name,
.nrn-matched-ng-title {
  color: white;
  background-color: fuchsia;
}
.nrn-movie-info-container {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 12;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px 0 4px;
  color: #262b31;
  background: transparent;
  border: 0;
  border-top: 1px solid #e1e4e8;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
}
.nrn-parsed {
  align-self: start !important;
}
.nrn-parsed.nrn-info-expanded {
  position: relative !important;
  margin-bottom: var(--nrn-detail-reserve, 0px) !important;
  overflow: visible !important;
}
/* v13.0: 動画カード・サムネイル・タイトル等の幅/高さは変更しない。
   変更するのは下方向の予約スペース(margin-bottom)だけ。 */
.nrn-info-section + .nrn-info-section {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid #eceef1;
}
.nrn-info-section-title {
  margin-bottom: 4px;
  color: #737b86;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .01em;
}
.nrn-tag-container {
  display: block;
  min-width: 0;
}
.nrn-contributor-container {
  display: block;
}
.nrn-contributor {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 7px 8px;
  min-width: 0;
  padding: 7px 2px;
  font-size: 13px;
  line-height: 1.5;
  border-radius: 0;
  background: transparent;
}
.nrn-contributor .nrn-user-ng-button,
.nrn-contributor > .nrn-contributor-ng-button {
  grid-column: 1 / -1;
  justify-self: start;
}
.nrn-contributor-link {
  min-width: 0;
  overflow-wrap: anywhere;
}
.nrn-contributor-kind {
  display: inline-flex;
  padding: 2px 6px;
  border-radius: 999px;
  background: #e9edf2;
  color: #626a75;
  font-size: 11px;
  font-weight: 700;
}
.nrn-user-ng-button {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
}
.nrn-autofill-pending,
.nrn-autofill-overflow {
  display: none !important;
}
.nrn-hide {
  display: none;
}
.nrn-user-ng-button {
  display: inline-block;
}
.nrn-ng-movie-title,
.nrn-contributor-link.nrn-ng-id-contributor-link {
  text-decoration: line-through;
}
.nrn-parsed {
  position: relative;
}
.nrn-action-pane {
  display: none;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 3px;
  color: #999;
  background-color: rgb(105, 105, 105);
  z-index: 11;

  .d_grid > [data-anchor] > & { /* 新検索ページ タイル表示 */
    top: -1.8em;
    white-space: nowrap;
  }
}
/* 詳細情報はクリックで開閉する。マウスがカード外へ移動しても閉じない。 */
.nrn-parsed {
  &:hover {
    & .nrn-action-pane {
      display: block;
    }
  }
}
.nrn-visit-button, .nrn-movie-ng-button, .nrn-title-ng-button {
  color: white;
}
.nrn-movie-ng-button, .nrn-title-ng-button {
  margin-left: 5px;
  border-left: solid thin;
  padding-left: 5px;
}
.nrn-movie-info-toggle {
  position: absolute;
  display: block;
  inset: auto 0 0 auto;
  width: 22px;
  min-width: 22px;
  height: 20px;
  padding: 0;
  color: #777f89;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  user-select: none;
}
.nrn-movie-info-toggle.nrn-toggle-pinned {
  top: var(--nrn-toggle-top) !important;
  right: 0 !important;
  bottom: auto !important;
  left: auto !important;
}
.nrn-self-ad-warning {
  margin: 0 0 7px;
  padding: 5px 7px;
  border-left: 3px solid #c77c12;
  background: #fff4dd;
  color: #704500;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}
.nrn-self-ad-inline-badge {
  display: inline-block;
  margin: 0 5px 3px 0;
  padding: 1px 5px;
  border: 1px solid #b56a00;
  border-radius: 4px;
  background: #fff0cf;
  color: #7a4700;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 800;
  vertical-align: baseline;
  white-space: nowrap;
}
.nrn-self-ad-inline-badge[data-confidence="name"] {
  border-color: #9a7a3b;
  background: #f7f0dd;
  color: #66501f;
}
.nrn-self-ad-card-badge {
  position: absolute !important;
  left: 4px !important;
  top: 4px !important;
  bottom: auto !important;
  z-index: 80 !important;
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(104, 62, 0, .90);
  color: #fff4d6;
  font-size: 10px;
  line-height: 1.35;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,.65);
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.nrn-self-ad-card-badge[data-confidence="name"] {
  background: rgba(103, 76, 25, .88);
}
.nrn-error {
  color: red;
}

/* ============================================================
 * v12.9 Classic Functional Detail
 * 「タグ名 🔒 [+]」を基準にした、常時見えるシンプルUI。
 * ============================================================ */
.nrn-movie-info-container {
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-info-section-title {
  margin: 0 0 5px !important;
  color: #6c737d !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}
.nrn-tag-container {
  display: block !important;
}
.nrn-movie-tag {
  display: block !important;
  margin: 0 !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  white-space: normal !important;
}
.nrn-movie-tag:hover {
  background: transparent !important;
}
.nrn-movie-tag-link {
  display: inline !important;
  overflow-wrap: anywhere;
  word-break: normal;
}
.nrn-tag-lock-indicator {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-left: 4px !important;
  color: #a67818 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  vertical-align: baseline !important;
}
.nrn-tag-lock-placeholder {
  display: none !important;
}
.nrn-tag-ng-button {
  display: inline !important;
  margin-left: 4px !important;
  padding: 0 !important;
  min-height: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  opacity: 1 !important;
  cursor: pointer !important;
}
.nrn-tag-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}
.nrn-contributor {
  display: block !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-contributor-kind {
  display: inline !important;
  margin: 0 4px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #555e68 !important;
  font-size: 13px !important;
  font-weight: 400 !important;
}
.nrn-contributor-link {
  display: inline !important;
}
.nrn-user-ng-button {
  display: inline !important;
  margin-left: 4px !important;
}
.nrn-user-ng-button::before {
  content: '[';
  color: #727b85;
}
.nrn-user-ng-button::after {
  content: ']';
  color: #727b85;
}
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button,
.nrn-contributor-ng-button {
  display: inline !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  cursor: pointer !important;
}
.nrn-contributor-ng-name-button::before {
  content: '/';
  color: #727b85;
  margin: 0 1px;
}
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-contributor-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}

.nrn-reduce {
  & :is(img[src^="https://nicovideo.cdn.nimg.jp/thumbnails/"], img[src^="https://img.cdn.nimg.jp/s/nicovideo/thumbnails/"]) {
    div:has(> &) {
      height: 63px;
    }
  }
  & div:not(.pos_relative) > a[href^="/watch/"] ~ * {
    display: none;
  }
}
`
      },
    })
    Object.assign(ListPage, {
      MovieRoot,
      is(location) {
        return location.pathname.startsWith('/ranking/genre');
      },
      pendingMoviesInvisibleCss() {
        return `div:has(> :not(.pos_relative) > [data-anchor-page="ranking_genre"] > :not(.pos_relative) > [data-anchor-page="ranking_genre"][href^="/watch/"]),
div:has(> div > a[data-anchor-page="ranking_genre"][href^="/watch/"] > div > p),
[data-anchor-page="tag"]:has(> :not(.pos_relative) > [data-anchor-page="tag"][href^="/watch/"]),
[data-anchor-page="search"]:has(> :not(.pos_relative) > [data-anchor-page="search"][href^="/watch/"]) {
  visibility: hidden;
  &.nrn-thumb-info-done {
    visibility: inherit;
  }
}
`;
      },
    })
    return ListPage
  })(NicoPage)

  var SearchPage = (function(_super) {

    var AbstractMovieRoot = (function(_super) {
      var AbstractMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      AbstractMovieRoot.prototype = createObject(_super.prototype, {
        get titleElem() {
          return this.elem.querySelector('.itemTitle a')
        },
        get _movieAnchorSelectors() {
          return ['.itemTitle a', '.itemThumbWrap']
        },
        bindToConfig(config) {
          _super.prototype.bindToConfig.call(this, config)
          this.movieInfoTogglable = config.movieInfoTogglable.value
          config.movieInfoTogglable.on('changed', set(this, 'movieInfoTogglable'))
          this.descriptionTogglable = config.descriptionTogglable.value
          config.descriptionTogglable.on('changed', set(this, 'descriptionTogglable'))
        },
      })
      return AbstractMovieRoot
    })(_super.MovieRoot)

    var FixedThumbMovieRoot = (function(_super) {
      var FixedThumbMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      FixedThumbMovieRoot.prototype = createObject(_super.prototype, {
        _getThumbElement() {
          const e = this.elem.querySelector('.thumb')
          return e ? e : this.elem.querySelector('.backgroundThumbnail')
        },
        _halfThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-9px'
          s.width = '80px'
          s.height = '63px'
        },
        _restoreThumb() {
          var e = this._getThumbElement()
          if (!e) return
          var s = e.style
          if (!s.marginTop) return
          s.marginTop = '-15px'
          s.width = '160px'
          s.height = ''
        },
      })
      return FixedThumbMovieRoot
    })(AbstractMovieRoot)

    var TwoColumnMovieRoot = (function(_super) {
      var TwoColumnMovieRoot = function(elem) {
        _super.call(this, elem)
      }
      TwoColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return TwoColumnMovieRoot
    })(FixedThumbMovieRoot)

    var FourColumnMovieRoot = (function(_super) {
      var FourColumnMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-4-column-item')
      }
      FourColumnMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return FourColumnMovieRoot
    })(FixedThumbMovieRoot)

    var MovieRoot = (function(_super) {
      var MovieRoot = function(elem) {
        _super.call(this, elem)
      }
      MovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.elem.appendChild(actionPane.elem)
        },
        _addMovieInfo() {
          this.elem.querySelector('.itemContent')
            .appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
      })
      return MovieRoot
    })(FixedThumbMovieRoot)

    var SubMovieRoot = (function(_super) {
      var SubMovieRoot = function(elem) {
        _super.call(this, elem)
        elem.classList.add('nrn-sub-movie-root')
      }
      SubMovieRoot.prototype = createObject(_super.prototype, {
        set actionPane(actionPane) {
          this.movieInfo.actionPane = actionPane
        },
        _addMovieInfo() {
          this.elem.appendChild(this.movieInfo.elem)
        },
        setThumbInfoDone() {
          _super.prototype.setThumbInfoDone.call(this)
          this._updateByMovieInfoTogglable()
          this._updateByDescriptionTogglable()
        },
        setMovieInfoToggleIfRequired() {
          if (!this.movieInfo.toggle.parentNode) {
            this.elem.appendChild(this.movieInfo.toggle)
          }
          this._scheduleMovieInfoTogglePin()
        },
      })
      return SubMovieRoot
    })(AbstractMovieRoot)

    var createMainMovieRoot = function(rootElem) {
      var singleColumnView = Boolean(rootElem.getElementsByClassName('videoList01Wrap').length)
      if (singleColumnView) return new MovieRoot(rootElem)
      var twoColumnView = Boolean(rootElem.getElementsByClassName('videoList02Wrap').length)
      if (twoColumnView) return new TwoColumnMovieRoot(rootElem)
      return new FourColumnMovieRoot(rootElem)
    }
    var SearchPage = function(doc) {
      _super.call(this, doc)
    }
    SearchPage.prototype = createObject(_super.prototype, {
      removeEmbeddedStyle() {
        const nodeList = document.querySelectorAll('.itemContent[style="visibility: visible;"]');
        for (const node of Array.from(nodeList)) {
          node.style.visibility = '';
        }
      },
      parse(target) {
        target = target || this.doc
        return this._parseMain(target).concat(this._parseSub(target))
      },
      _parseItem(item) {
        return {
          type: 'main',
          movie: {
            id: item.dataset.videoId,
            title: item.querySelector('.itemTitle a').title,
          },
          rootElem: item,
        }
      },
      parseAutoPagerizedNodes(target) {
        return [this._parseItem(target)]
      },
      _parseMain(target) {
        return Array.from(target.querySelectorAll('.contentBody.video.uad .item[data-video-item]'))
          .map(item => this._parseItem(item))
      },
      _parseSub(target) {
        return Array.from(target.querySelectorAll('#tsukuaso .item'))
          .map(function(item) {
            return {
              type: 'sub',
              movie: {
                id: item.querySelector('.itemThumb').dataset.id,
                title: item.querySelector('.itemTitle a').textContent,
              },
              rootElem: item,
            }
          })
      },
      get _configBarContainer() {
        return this.doc.querySelector('.column.main')
      },
      createMovieRoot(resultOfParsing) {
        switch (resultOfParsing.type) {
          case 'main':
          case 'ad':
            return createMainMovieRoot(resultOfParsing.rootElem)
          case 'sub':
            return new SubMovieRoot(resultOfParsing.rootElem)
          default:
            throw new Error(resultOfParsing.type)
        }
      },
      observeMutation(callback) {
        const nodeList = document.querySelectorAll('.contentBody.video.uad .item.nicoadVideoItem .itemContent')
        for (const node of Array.from(nodeList)) {
          new MutationObserver((records, observer) => {
            for (const r of records) {
              if (SearchPage._isGettingAdDone(r)) {
                observer.disconnect()
                r.target.style.visibility = ''
                const item = ancestor(r.target, '.item.nicoadVideoItem')
                callback([SearchPage._parseAdItem(item)])
                return
              }
            }
          }).observe(node, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['style'],
          })
        }
      },
      get css() {
        return `#nrn-config-bar {
  margin: 10px 0;
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:6px;
}
#nrn-open-all-movie-info,
#nrn-close-all-movie-info {
  padding:2px 7px;
  border:1px solid #ccd1d8;
  border-radius:6px;
  background:#fff;
  color:#4e5661;
  cursor:pointer;
}
#nrn-open-all-movie-info:hover,
#nrn-close-all-movie-info:hover { background:#eef2f6; }
.nrn-detail-bulk-label { color:#6c737d; font-size:.92em; }
.nrn-config-separator { color:#b0b5bc; }
#nrn-config-button,
.nrn-visit-button:hover,
.nrn-movie-ng-button:hover,
.nrn-title-ng-button:hover,
.nrn-tag-ng-button:hover,
.nrn-contributor-ng-button:hover,
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-movie-info-toggle:hover,
.nrn-description-open-button:hover,
.nrn-description-close-button:hover {
  text-decoration: underline;
  cursor: pointer;
}
.nrn-description-open-button {
  position: absolute;
  bottom: 0;
  right: 0;
  background-color: white;
}
.nrn-description-text,
.nrn-description-close-button {
  display: block;
}
.nrn-description-close-button {
  text-align: right;
}
.itemData,
.itemDescription,
.nicoadVideoItemWrapper {
  position: relative;
}
.nrn-movie-tag {
  display:grid;
  grid-template-columns:18px minmax(0,1fr) auto;
  align-items:start;
  gap:5px;
  min-width:0;
  margin:0;
  padding:6px 2px;
  border:0;
  border-bottom:1px solid #edf0f2;
  border-radius:0;
  background:transparent;
  font-size:13px;
  line-height:1.55;
}
.nrn-movie-tag:last-child { border-bottom:0; }
.nrn-movie-tag:hover { background:#f6f7f8; }
.nrn-movie-tag.nrn-locked-tag { background:transparent; }
.nrn-tag-lock-indicator { display:inline-flex; width:18px; min-width:18px; justify-content:center; color:#9b7c23; font-size:12px; line-height:1.55; filter:saturate(.72); }
.nrn-tag-lock-placeholder { visibility:hidden; }
.nrn-movie-tag-link { min-width:0; overflow-wrap:anywhere; word-break:break-word; }
.nrn-description-open-button,
.nrn-description-close-button,
.nrn-movie-tag-link,
.nrn-contributor-link {
  color: #333333;
}
.nrn-tag-ng-button,
.nrn-contributor-ng-button,
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button {
  display:inline-flex;
  align-items:center;
  min-height:20px;
  padding:1px 6px;
  border:1px solid #d3d7dc;
  border-radius:6px;
  background:transparent;
  color:#6f7781;
  font-size:11px;
  line-height:1.4;
  cursor:pointer;
}
.nrn-tag-ng-button { align-self:center; white-space:nowrap; opacity:.78; transition:opacity .12s ease,background-color .12s ease,border-color .12s ease; }
.nrn-movie-tag:hover .nrn-tag-ng-button,
.nrn-tag-ng-button:focus-visible { opacity:1; }
@media (hover:none) { .nrn-tag-ng-button { opacity:1; } }
.nrn-info-section + .nrn-info-section { margin-top:9px; padding-top:9px; border-top:1px solid #eceef1; }
.nrn-info-section-title { margin-bottom:5px; color:#717782; font-size:11px; font-weight:700; }
.nrn-tag-container { display:block; min-width:0; }
.nrn-contributor { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:7px 8px; min-width:0; padding:7px 2px; font-size:13px; line-height:1.5; border-radius:0; background:transparent; }
.nrn-contributor .nrn-user-ng-button,.nrn-contributor > .nrn-contributor-ng-button { grid-column:1 / -1; justify-self:start; }
.nrn-contributor-link { min-width:0; overflow-wrap:anywhere; }
.nrn-contributor-kind { padding:2px 6px; border-radius:999px; background:#e9edf2; color:#626a75; font-size:10px; font-weight:700; }
.nrn-user-ng-button { display:inline-flex; flex-wrap:wrap; gap:4px; margin-left:auto; }
.nrn-movie-tag-link.nrn-movie-ng-tag-link,
.nrn-contributor-link.nrn-ng-contributor-link,
.nrn-matched-ng-contributor-name,
.nrn-matched-ng-title {
  color: white;
  background-color: fuchsia;
}
.nrn-movie-info-container {
  position:absolute;
  left:0;
  top:calc(100% + 4px);
  z-index:12;
  box-sizing:border-box;
  width:100%;
  margin:0;
  padding:8px 0 4px;
  background:transparent;
  color:#262b31;
  border:0;
  border-top:1px solid #e1e4e8;
  border-radius:0;
  box-shadow:none;
  overflow:visible;
}
.nrn-parsed {
  align-self: start !important;
}
.nrn-parsed.nrn-info-expanded {
  position:relative !important;
  margin-bottom:var(--nrn-detail-reserve,0px) !important;
  overflow:visible !important;
}
.nrn-movie-info-container .nrn-action-pane {
  line-height: 1.3em;
  padding: 0 0 6px;
  margin-bottom: 7px;
  border-bottom: 1px dashed #e2e5e8;
}
.nrn-movie-info-container .nrn-tag-container,
.nrn-movie-info-container .nrn-contributor-container {
  line-height: 1.5em;
  padding-top: 4px;
}
.videoList01 .itemContent .itemDescription.ranking.nrn-description {
  height: auto;
  width: auto;
}
.nrn-movie-info-toggle {
  color: #333333;
  font-size: 85%;
}
.videoList01 .nrn-movie-info-toggle {
  position: absolute;
  right: 0;
  top: 0;
}
.videoList02 .nrn-movie-info-toggle,
.nrn-4-column-item .nrn-movie-info-toggle {
  display: block;
  text-align: right;
}
.videoList02 .nrn-movie-info-container {
  clear: both;
}
.nrn-hide,
.videoList02 .item.nrn-hide,
.video .item.nrn-4-column-item.nrn-hide,
.uad .nicoadVideoItemWrapper .nicoadVideoItem.nrn-hide,
.item[data-video-item-muted] {
  display: none;
}
.item.nrn-reduce .videoList01Wrap,
.item.nrn-reduce .videoList02Wrap {
  width: 80px;
}
.item.nrn-reduce .itemThumbBox,
.item.nrn-reduce .itemThumbBox .itemThumb,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap,
.item.nrn-reduce .itemThumbBox .itemThumb .itemThumbWrap img,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap,
.nicoadVideoItemWrapper.nrn-reduce .item .itemThumbBox .itemThumb .itemThumbWrap img {
  width: 80px;
  height: 45px;
}
.videoList01 .nrn-action-pane,
.videoList02 .nrn-action-pane {
  display: none;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 3px;
  color: #999;
  background-color: rgb(105, 105, 105);
  z-index: 11;
}
.videoList02 .nrn-action-pane {
  font-size: 85%;
}
.videoList01 .item:hover .nrn-action-pane,
.videoList02 .item:hover .nrn-action-pane,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane {
  display: block;
}
.videoList01 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-visit-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  color: white;
}
.videoList01 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .item:hover .nrn-action-pane .nrn-title-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList01 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-movie-ng-button,
.videoList02 .nicoadVideoItemWrapper:hover .nrn-action-pane .nrn-title-ng-button {
  margin-left: 5px;
  border-left: solid thin;
  padding-left: 5px;
}
.nrn-user-ng-button,
.nrn-tag-ng-button {
  display: inline-block;
}
.nrn-ng-movie-title,
.nrn-contributor-link.nrn-ng-id-contributor-link {
  text-decoration: line-through;
}
.nrn-sub-movie-root {
  position: relative;
}
.nrn-sub-movie-root .nrn-movie-info-toggle {
  display: block;
  text-align: right;
  background-color: white;
}
.nrn-sub-movie-root .nrn-movie-info-container {
  clear: left;
  padding: 10px 0 15px 0;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-title-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-title-ng-button {
  display: inline-block;
  color: #333333;
}
.nrn-sub-movie-root .nrn-action-pane .nrn-visit-button,
.nrn-sub-movie-root .nrn-action-pane .nrn-movie-ng-button,
.nrn-4-column-item .nrn-action-pane .nrn-visit-button,
.nrn-4-column-item .nrn-action-pane .nrn-movie-ng-button {
  margin-right: 0.5em;
}
.nrn-movie-info-toggle.nrn-toggle-pinned {
  top: var(--nrn-toggle-top) !important;
  right: 0 !important;
  bottom: auto !important;
  left: auto !important;
}
.nrn-self-ad-warning {
  margin: 0 0 7px;
  padding: 5px 7px;
  border-left: 3px solid #c77c12;
  background: #fff4dd;
  color: #704500;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}
.nrn-self-ad-card-badge {
  position: absolute !important;
  left: 4px !important;
  top: 4px !important;
  bottom: auto !important;
  z-index: 80 !important;
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(104, 62, 0, .90);
  color: #fff4d6;
  font-size: 10px;
  line-height: 1.35;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,.65);
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.nrn-self-ad-card-badge[data-confidence="name"] {
  background: rgba(103, 76, 25, .88);
}
.nrn-error {
  color: red;
}

/* ============================================================
 * v12.9 Classic Functional Detail
 * 「タグ名 🔒 [+]」を基準にした、常時見えるシンプルUI。
 * ============================================================ */
.nrn-movie-info-container {
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-info-section-title {
  margin: 0 0 5px !important;
  color: #6c737d !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}
.nrn-tag-container {
  display: block !important;
}
.nrn-movie-tag {
  display: block !important;
  margin: 0 !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  white-space: normal !important;
}
.nrn-movie-tag:hover {
  background: transparent !important;
}
.nrn-movie-tag-link {
  display: inline !important;
  overflow-wrap: anywhere;
  word-break: normal;
}
.nrn-tag-lock-indicator {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-left: 4px !important;
  color: #a67818 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  vertical-align: baseline !important;
}
.nrn-tag-lock-placeholder {
  display: none !important;
}
.nrn-tag-ng-button {
  display: inline !important;
  margin-left: 4px !important;
  padding: 0 !important;
  min-height: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  opacity: 1 !important;
  cursor: pointer !important;
}
.nrn-tag-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}
.nrn-contributor {
  display: block !important;
  padding: 2px 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
}
.nrn-contributor-kind {
  display: inline !important;
  margin: 0 4px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #555e68 !important;
  font-size: 13px !important;
  font-weight: 400 !important;
}
.nrn-contributor-link {
  display: inline !important;
}
.nrn-user-ng-button {
  display: inline !important;
  margin-left: 4px !important;
}
.nrn-user-ng-button::before {
  content: '[';
  color: #727b85;
}
.nrn-user-ng-button::after {
  content: ']';
  color: #727b85;
}
.nrn-contributor-ng-id-button,
.nrn-contributor-ng-name-button,
.nrn-contributor-ng-button {
  display: inline !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #4777a8 !important;
  font-size: 12px !important;
  line-height: inherit !important;
  cursor: pointer !important;
}
.nrn-contributor-ng-name-button::before {
  content: '/';
  color: #727b85;
  margin: 0 1px;
}
.nrn-contributor-ng-id-button:hover,
.nrn-contributor-ng-name-button:hover,
.nrn-contributor-ng-button:hover {
  color: #245b91 !important;
  background: transparent !important;
  text-decoration: underline !important;
}

.videoList02 .item,
.video .item.nrn-4-column-item {
  float: none;
  display: inline-block;
  vertical-align: top;
}
.video .item.nrn-4-column-item:nth-child(4n+1) {
  clear: none;
}
.nrn-4-column-item .nrn-movie-tag {
  display: block;
}
`
      },
    })
    Object.assign(SearchPage, {
      TwoColumnMovieRoot,
      FourColumnMovieRoot,
      is(location) {
        var p = location.pathname
        return p.startsWith('/search/') || p.startsWith('/tag/')
      },
      _isGettingAdDone(mutationRecord) {
        const r = mutationRecord
        return r.attributeName === 'style'
            && r.oldValue.includes('visibility: hidden;')
            && r.target.getAttribute('style').includes('visibility: visible;')
      },
      _parseAdItem(item) {
        const p = item.querySelector('.count.ads .value a').pathname
        return {
          type: 'ad',
          movie: {
            id: p.slice(p.lastIndexOf('/') + 1),
            title: item.querySelector('.itemTitle a').textContent,
          },
          rootElem: ancestor(item, '.nicoadVideoItemWrapper'),
        }
      },
      pendingMoviesInvisibleCss() {
        return `.contentBody.video.uad .item,
#tsukuaso .item,
.contentBody.video.uad .nicoadVideoItemWrapper {
  visibility: hidden;
}
.contentBody.video.uad .item[data-video-item-muted],
.contentBody.video.uad .item[data-video-item-sensitive],
.contentBody.video.uad .item.nrn-thumb-info-done,
#tsukuaso .item.nrn-thumb-info-done,
.contentBody.video.uad.searchUad .item,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done,
.contentBody.video.uad .nicoadVideoItemWrapper.nrn-thumb-info-done .item {
  visibility: inherit;
}
`
      },
    })
    return SearchPage
  })(NicoPage)

  // ========================================================================
  // Runtime services (v14.0)
  // Cross-cutting behavior belongs here instead of individual card classes.
  // ========================================================================

