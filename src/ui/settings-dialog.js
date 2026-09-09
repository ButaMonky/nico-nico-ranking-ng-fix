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
      // The rule editor owns this checkbox; edits remain drafts until Apply.
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
        if (this.ruleEditor && !this.ruleEditor.canClose()) return
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
          if (field === 'userId') return 'IDが取得できない'
          if (field === 'channelId') return 'IDがない'
          if (field === 'contributorId') return '投稿者IDが取得できない'
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
            return '詳細情報の取得完了後もIDがない場合に一致します。退会済みかどうかは判定しません。通信エラー・詳細の未取得は保留します。'
          if (field === 'tag') return 'タグが1個も付いていない場合に一致します。'
          if (field === 'lockedTag') return 'ロック済みタグが1個もない場合に一致します。'
          return 'その情報が空、または取得できない場合に一致します。'
        }
        return ''
      },
      _initAdvancedNgRuleBuilder() {
        this.ruleEditor = RuleEditor.mount(this)
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
  .grid2 .row label:has(select) { display:block; min-width:0; width:100%; }
  .grid2 .row select { display:block; width:100%; min-width:0; max-width:100%; margin-top:4px; }
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
        <summary><span class=inlineLockIcon aria-hidden=true><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M18 7h-1V5.98a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4V7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M9.53 17.16l1.14-1.97.51-.87a2 2 0 0 1 .83-3.82c.7 0 1.32.36 1.67.91q.32.48.33 1.09a2 2 0 0 1-1.17 1.82l1.64 2.84a.23.23 0 0 1-.2.34H9.74a.23.23 0 0 1-.2-.34zM9 5.98c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2V7H9z"></path></svg></span>条件を組み合わせるNG <span id=advancedRuleCount class=pill>0件</span></summary>
        <div class=sectionBody>
          <div class=row><label><input type=checkbox id=advancedNgRulesEnabled>複合NGルールを有効にする</label></div>
          <div class=hint>条件を組み合わせて、隠したい動画を絞り込みます。「すべて」は条件が全部そろう動画、「どれか」は1つでも合う動画です。単独NGとは別に判定され、どちらかに一致すればNGになります。</div>
          <details class=logicHelpDetails><summary>初めて使うときのポイント</summary><div class=logicHelpBody>
            <p>まず例からルールを作り、言葉や個数を自分の好みに変えます。「動画で判定を試す」で結果を確認し、「このルールを使う」と全体の有効化を選んでから「変更を適用」を押してください。</p>
            <p>タイトル・投稿者名の「含む」は部分一致、タグ名は完全一致です。英字の大文字・小文字は区別しません。入力の前後の空白は比較から除かれます。</p>
            <p>例外はそのルールの対象から除くだけです。ほかのNG設定を取り消す効果はありません。情報の未取得・通信失敗は保留となり、反対の条件にしてもNGとは断定しません。</p>
            <p>同じ投稿者の動画数は広告を除く元の1ページごとの件数です。投稿者情報が欠ける場合は保留します。IDがないことから退会済みと断定することはできません。</p>
            <p>適用前なら削除も「元に戻す」で取り消せます。編集履歴はこの設定画面を開いている間の直近30操作までです。変更は適用するまで保存されません。</p>
          </div></details>
          <div class=row>
            <button type=button id=advancedRuleAddButton class=primary>＋ 白紙から作る</button>
            <button type=button id=advancedRuleSampleButton>タイトル＋タグの例</button>
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
                <option value=compactSkip>走査範囲を表示（SPA OFFでは圧縮・スキップ）</option>
              </select>
            </label></div>
            <div class=row><label>取得済み範囲の後に表示 <input type=number id=pagerPreviewCount min=0 max=6> ページ（標準 2）</label></div>
            <div class=row><label><input type=checkbox id=statusAnimationEnabled>処理中ステータスをアニメーション表示</label></div>
          </div>
          <div class=hint>取得方式の変更は、次の検索移動または再読み込みから反映されます。API高速でもタグロック・複合NGなどの詳細判定は省略しません。追加取得上限は、従来方式ではHTMLのページ数、API方式では最大100件の取得回数です。</div>
          <div class=sectionTitle>通信・キャッシュ</div>
          <div class=grid2>
            <div class=row><label><input type=checkbox id=sessionDetailCacheEnabled>同一タブ内の動画詳細を再利用する</label></div>
            <div class=row><label>キャッシュ保持時間 <input type=number id=sessionDetailCacheTtlMinutes min=1 max=1440> 分</label></div>
            <div class=row><label>キャッシュ最大件数 <input type=number id=sessionDetailCacheMaxEntries min=100 max=4000> 件</label></div>
            <div class=row><label>追加動画のニコニコ広告
              <select id=autoFillAdMode><option value=all>候補すべて取得</option><option value=visible>表示動画のみ（推奨）</option><option value=none>取得しない</option></select>
            </label></div>
            <div class=row><label><input type=checkbox id=selfAdWarningEnabled>自演広告の可能性を警告する（実験的）</label></div>
            <div class=hint>広告の見た目と広告者照合は別の通信です。「追加動画の広告」をOFFにしても、警告や広告関連の複合NGが有効なら広告者照合は行います。広告通信は全体で最大4件同時。広告者は最大100件を取得し、上限到達・取得失敗時は判定を保留します。</div>
          </div>
          <div class=hint>APIが現在の検索条件・並びを再現できない場合は自動で従来方式へ戻ります。🔒 タグロック数NGは完全判定が必要です。採用率が低くても異常とは扱いません。SPA対応がOFFのときはページ番号を「取得済み範囲＋未取得の番号＋最終ページ」に整理できます。ONでは元の番号を保ちます。詳細キャッシュは同一タブの再読み込みを跨いで再利用し、保存するのはタグ・ロック状態・投稿者などの詳細情報です。NG設定変更時は保存済みの最終判定を使わず、現在の設定で再判定します。</div>
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
          <div class=row><label><input type=checkbox id=spaNavigationFix>SPA移動に合わせてNG判定を更新する（推奨）</label></div>
          <div class=hint>タグ・検索語・ページ番号・並び順・絞り込みを変えたとき、画面を再読み込みせず新しい検索結果のNG判定を開始します。「戻る・進む」にも対応します。ページ番号の範囲圧縮は、サイトのSPA移動機能を利用できる場合に働きます。未表示の候補が残るページは飛ばしません。</div>
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
    autoFillEnabled: 'NGで減った分を、次のページから自動で補います。OFFでは現在のページだけをNG判定します。',
    autoFillTargetCount: '表示したい動画数です。例：60なら、NGを除いて60件になるまで補充します。検索結果の終わりでは60件未満になることがあります。',
    autoFillMaxExtraPages: '1回の検索で追加取得してよい上限です。少なくすると通信量を抑えられます。0は制限なしなので、NGが多い検索では取得が長く続くことがあります。',
    autoFillInfoMode: '従来方式はニコニコのページ順を使います。API方式はまとめて候補を取得しますが、検索条件や並び順を再現できない場合は従来方式に戻ります。「同じ投稿者の動画数」を使う場合も従来方式です。変更は次の検索移動または再読み込みから反映します。',
    thumbInfoConcurrency: 'GetThumbInfoを同時に取得する本数です。大きすぎると通信失敗が増える場合があります。',
    autoFillDetailBatchMax: '1回に完全NG判定へ送る最大候補数です。低NG率では小さめ、高NG率では大きめが効率的です。',
    statusPanelMode: '右下の進捗パネルの表示量を選択します。',
    detailUiTheme: 'タグ・投稿者情報、操作ボタン、設定画面などスクリプト独自UIの配色です。自動はニコニコ本体の実背景色から判定します。',
    autoFillPagerMode: '範囲圧縮では、全動画の表示またはNG判定を終えた追加ページを「4–8」のように斜線付きでまとめ、前後の矢印で飛ばします。未表示の候補が残るページは飛ばしません。SPA移動機能に接続できない場合は元のリンクと斜線だけを残します。検索条件・NG設定を変えると記録を分けます。OFFなら装飾しません。',
    pagerPreviewCount: '範囲圧縮のとき、現在ページの前後に表示する未処理ページ番号の数です。斜線の範囲は一つにまとめます。SPA移動機能に接続できない場合は元の番号を保ちます。',
    statusAnimationEnabled: '処理中だけ右下ステータスに回転インジケーターを表示します。',
    sessionDetailCacheEnabled: '取得済みのタグ・投稿者情報を同じタブに保存して、再読み込み後も再利用します。保存中に情報が変わると、有効期限まで古い情報で判定する場合があります。OFFでもSPA移動中は直近2分・最大512件をメモリに保持します。NG判定は常に現在の設定でやり直します。',
    sessionDetailCacheTtlMinutes: 'キャッシュを何分まで有効とみなすかです。期限切れは自動削除します。',
    sessionDetailCacheMaxEntries: 'キャッシュ件数の上限です。古いものから削除します。',
    autoFillAdMode: '追加動画の広告リボン・提供者表示の取得範囲です。広告者照合の警告・複合NGとは独立しています。無駄を抑えるには「表示動画のみ」を選んでください。',
    selfAdWarningEnabled: '広告者一覧を確認し、投稿者本人によるニコニ広告の可能性を警告します。追加通信が発生します。',
    spaNavigationFix: '画面を再読み込みせず、検索結果の切り替わりに合わせて古い処理を終了しNG判定を開始します。SPA利用時は本来のページ番号リンクを維持します。',
    developerMode: '不具合を調べるためのログをコンソールに表示します。通常はOFFで使えます。他の拡張機能やニコニコ本体のログには影響しません。',
    developerDiagnosticMode: '軽量はローカル監査のみ、完全はAPI通信を含む3方式比較、手動のみはボタンを押した時だけ診断します。',
    ngLockedTagCountEnabled: 'ロックされたタグ数がしきい値以上の動画をNGにします。',
    ngLockedTagCountThreshold: 'NGにするロックタグ数の境界です。例：11なら11個以上の動画が対象です。タグの内容は問いません。',
    advancedNgRulesEnabled: '複数の条件を組み合わせます。AND＝すべて満たす、OR＝どれか満たす、NOT＝結果を反転。例：タイトルに「実況」を含み、ロックタグが11個以上。必要な情報が取得できない条件は保留し、NOTでも勝手にNGにしません。',
    openNewWindow: '動画のタイトル・サムネイルをクリックすると新しいタブで開きます。▼、あとで見る、メニューなどのボタンには適用しません。Ctrlキーや中央ボタンの標準操作も使えます。',
    useGetThumbInfo: 'タグ・ロック状態・投稿者を取得して判定します。OFFでは、詳細情報が必要なNG条件を判定できません。通信を減らしたい場合は、まず広告照合や追加取得上限を見直してください。'
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
    var explanation = document.createElement('div');
    explanation.className = 'settingExplanation';
    explanation.id = id + '-explanation';
    explanation.textContent = help[id];
    explanation.style.cssText = 'font-size:12px;line-height:1.6;color:var(--muted);margin:3px 0 12px';
    if (row.parentElement.classList.contains('grid2')) {
      var field = document.createElement('div');
      row.replaceWith(field); field.append(row, explanation);
    } else row.after(explanation);
    el.setAttribute('aria-describedby', explanation.id);
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
