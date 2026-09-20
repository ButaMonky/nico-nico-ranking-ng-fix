  var Config = (function() {
    var ngMovieVisibleStore = function() {
      var value
      var getValue = function(_, defval) {
        return value === undefined ? defval : value
      }
      var setValue = function(_, v) { value = v }
      return new Store(getValue, setValue, 'ngMovieVisible', false)
    }
    var csv = (function() {
      var RECORD_LENGTH = 3
      var TYPE = 0
      var VALUE = 1
      var TEXT = 2
      var isObject = function(v) {
        return v === Object(v)
      }
      var csvToArray = function(csv) {
        /*
          パース対象の文字列最後の文字がカンマのとき、
          そのカンマが空のフィールドとしてパースされない。
          \n を追加して対処する。
        */
        return d3.csvParseRows(csv + '\n')
      }
      var createRecord = function(type, value, text) {
        var result = []
        result[TYPE] = type
        result[VALUE] = value
        result[TEXT] = text
        return result
      }
      var trimFields = function(record) {
        var r = record
        return createRecord(r[TYPE].trim(), r[VALUE].trim(), r[TEXT].trim())
      }
      var isIntValueType = function(type) {
        return ['ngUserId', 'ngChannelId'].indexOf(type) >= 0
      }
      var hasValidValue = function(record) {
        var v = record[VALUE]
        return v.length !== 0
            && !(isIntValueType(record[TYPE]) && Number.isNaN(Math.trunc(v)))
      }
      var valueToIntIfIntValueType = function(record) {
        var r = record
        return isIntValueType(r[TYPE])
             ? createRecord(r[TYPE], Math.trunc(r[VALUE]), r[TEXT])
             : r
      }
      var records = function(csv) {
        return csvToArray(csv)
          .filter(function(record) { return record.length === RECORD_LENGTH })
          .map(trimFields)
          .filter(hasValidValue)
          .map(valueToIntIfIntValueType)
      }
      var isValueOnlyType = function(type) {
        return ['ngTitle', 'ngTag', 'ngUserName'].indexOf(type) >= 0
      }
      var getValue = function(record) {
        var value = record[VALUE]
        if (isValueOnlyType(record[TYPE])) return value
        var text = record[TEXT]
        return text ? {value, text} : value
      }
      var createTypeToValuesMap = function() {
        return new Map([
          ['ngMovieId', []],
          ['ngTitle', []],
          ['ngTag', []],
          ['ngUserId', []],
          ['ngUserName', []],
          ['ngChannelId', []],
          ['visitedMovieId', []],
        ])
      }
      return {
        create(arrayStore, type) {
          return d3.csvFormatRows(arrayStore.arrayWithText.map(function(value) {
            return isObject(value)
                 ? createRecord(type, value.value, value.text)
                 : createRecord(type, value, '')
          }))
        },
        parse(csv) {
          var result = createTypeToValuesMap()
          for (var r of records(csv)) {
            var values = result.get(r[TYPE])
            if (values) values.push(getValue(r))
          }
          return result
        },
      }
    })()

    var Config = function(getValue, setValue) {
      var store = function(key, defaultValue) {
        return new Store(getValue, setValue, key, defaultValue)
      }
      var arrayStore = function(key, caseInsensitive) {
        return new ArrayStore(getValue, setValue, key, caseInsensitive)
      }
      this.visitedMovieViewMode = store('visitedMovieViewMode', 'reduce')
      this.visibleContributorType = store('visibleContributorType', 'all')
      this.openNewWindow = store('openNewWindow', true)
      this.useGetThumbInfo = store('useGetThumbInfo', true)
      this.movieInfoTogglable = store('movieInfoTogglable', true)
      this.descriptionTogglable = store('descriptionTogglable', true)
      this.visitedMovies = arrayStore('visitedMovies')
      this.ngMovies = arrayStore('ngMovies')
      this.ngTitles = arrayStore('ngTitles', true)
      this.ngTags = arrayStore('ngTags', true)
      this.ngLockedTags = arrayStore('ngLockedTags', true)
      this.ngUserIds = arrayStore('ngUserIds')
      this.ngUserNames = arrayStore('ngUserNames', true)
      this.ngChannelIds = arrayStore('ngChannelIds')
      this.ngMovieVisible = ngMovieVisibleStore()
      this.addToNgLockedTags = store('addToNgLockedTags', false);
      this.unknownContributorMovieVisible = store('unknownContributorMovieVisible', true);
      this.ngLockedTagCountEnabled = store('ngLockedTagCountEnabled', false);
      this.ngLockedTagCountThreshold = store('ngLockedTagCountThreshold', 5);
      // v11: 複合NGルール。ルール間OR / ルール内AND。
      this.advancedNgRulesEnabled = store('advancedNgRulesEnabled', false);
      this.advancedNgRulesJson = store('advancedNgRulesJson', '[]');
      this.autoFillEnabled = store('autoFillEnabled', false);
      this.autoFillTargetCount = store('autoFillTargetCount', 36);
      this.autoFillMaxExtraPages = store('autoFillMaxExtraPages', 5);
      // v9: 自動継ぎ足しの取得/判定方式
      // legacy   : 従来のページHTML + GetThumbInfo
      // hybrid   : Snapshot検索APIで候補を一括取得 + GetThumbInfoで完全判定
      // snapshot : APIで事前NGを落とし、残りだけGetThumbInfo
      this.autoFillInfoMode = store('autoFillInfoMode', 'legacy');
      // all / visible / none
      this.autoFillAdMode = store('autoFillAdMode', 'visible');
      this.selfAdWarningEnabled = store('selfAdWarningEnabled', false);
      this.hoverPreviewEnabled = store('hoverPreviewEnabled', false);
      // GetThumbInfo の同時取得数。従来は固定5だった。
      this.thumbInfoConcurrency = store('thumbInfoConcurrency', 12);
      // v9.2: 1回ONにすれば、各ページで診断スイートを自動実行する。
      this.developerMode = store('developerMode', false);
      // v9.4 UI/運用設定
      this.statusPanelMode = store('statusPanelMode', 'compact'); // compact / detailed / hidden
      // v12.5: スクリプト独自UIの配色。autoはニコニコ画面の実背景を判定。
      this.detailUiTheme = store('detailUiTheme', 'auto'); // auto / light / dark
      this.autoFillDetailBatchMax = store('autoFillDetailBatchMax', 48); // 8..100
      // 現行NicoNicoのSPA遷移時に古いModel/Observerを残さないため、
      // tag/search内のURL変更を検出したら新URLで安全に再読み込みする。
      this.spaNavigationFix = store('spaNavigationFix', true);
      // 自動取得済みページをページャーに反映する。
      // off / mark / compactSkip
      this.autoFillPagerMode = store('autoFillPagerMode', 'compactSkip');
      // 実験的: 同一タブ内で取得済み動画詳細/NG結果を再利用する。
      this.sessionDetailCacheEnabled = store('sessionDetailCacheEnabled', false);
      // 処理中の右下ステータスを視覚的に分かりやすくする。
      this.statusAnimationEnabled = store('statusAnimationEnabled', true);
      // 開発者モードの自動診断量。light / full / manual
      this.developerDiagnosticMode = store('developerDiagnosticMode', 'light');
      // 取得済み範囲の直後に通常ページリンクを何件見せるか。ニコニコ本来の見え方に合わせ既定値2。
      this.pagerPreviewCount = store('pagerPreviewCount', 2);
      // sessionStorageベースの詳細情報キャッシュ。SPA対策のreloadを跨いで同一タブ内で再利用。
      this.sessionDetailCacheTtlMinutes = store('sessionDetailCacheTtlMinutes', 360);
      this.sessionDetailCacheMaxEntries = store('sessionDetailCacheMaxEntries', 1500);
    }
    Config.prototype.sync = function() {
      return Promise.all([
        this.visitedMovieViewMode.sync(),
        this.visibleContributorType.sync(),
        this.openNewWindow.sync(),
        this.useGetThumbInfo.sync(),
        this.movieInfoTogglable.sync(),
        this.descriptionTogglable.sync(),
        this.visitedMovies.sync(),
        this.ngMovies.sync(),
        this.ngTitles.sync(),
        this.ngTags.sync(),
        this.ngLockedTags.sync(),
        this.ngUserIds.sync(),
        this.ngUserNames.sync(),
        this.ngChannelIds.sync(),
        this.addToNgLockedTags.sync(),
        this.unknownContributorMovieVisible.sync(),
        this.ngLockedTagCountEnabled.sync(),
        this.ngLockedTagCountThreshold.sync(),
        this.advancedNgRulesEnabled.sync(),
        this.advancedNgRulesJson.sync(),
        this.autoFillEnabled.sync(),
        this.autoFillTargetCount.sync(),
        this.autoFillMaxExtraPages.sync(),
        this.autoFillInfoMode.sync(),
        this.autoFillAdMode.sync(),
        this.selfAdWarningEnabled.sync(),
        this.hoverPreviewEnabled.sync(),
        this.thumbInfoConcurrency.sync(),
        this.developerMode.sync(),
        this.statusPanelMode.sync(),
        this.detailUiTheme.sync(),
        this.autoFillDetailBatchMax.sync(),
        this.spaNavigationFix.sync(),
        this.autoFillPagerMode.sync(),
        this.sessionDetailCacheEnabled.sync(),
        this.statusAnimationEnabled.sync(),
        this.developerDiagnosticMode.sync(),
        this.pagerPreviewCount.sync(),
        this.sessionDetailCacheTtlMinutes.sync(),
        this.sessionDetailCacheMaxEntries.sync(),
      ])
    }
    Config.prototype.toCSV = async function(targetTypes) {
      await this.sync()
      var csvTexts = []
      if (targetTypes['ngMovieId']) {
        csvTexts.push(csv.create(this.ngMovies, 'ngMovieId'))
      }
      if (targetTypes['ngTitle']) {
        csvTexts.push(csv.create(this.ngTitles, 'ngTitle'))
      }
      if (targetTypes['ngTag']) {
        csvTexts.push(csv.create(this.ngTags, 'ngTag'))
      }
      if (targetTypes['ngUserId']) {
        csvTexts.push(csv.create(this.ngUserIds, 'ngUserId'))
      }
      if (targetTypes['ngUserName']) {
        csvTexts.push(csv.create(this.ngUserNames, 'ngUserName'))
      }
      if (targetTypes['ngChannelId']) {
        csvTexts.push(csv.create(this.ngChannelIds, 'ngChannelId'))
      }
      if (targetTypes['visitedMovieId']) {
        csvTexts.push(csv.create(this.visitedMovies, 'visitedMovieId'))
      }
      return csvTexts.filter(Boolean).join('\n')
    }
    Config.prototype.addFromCSV = async function(csvText) {
      await this.sync()
      var map = csv.parse(csvText)
      this.ngMovies.addAll(map.get('ngMovieId'))
      this.ngTitles.addAll(map.get('ngTitle'))
      this.ngTags.addAll(map.get('ngTag'))
      this.ngUserIds.addAll(map.get('ngUserId'))
      this.ngUserNames.addAll(map.get('ngUserName'))
      this.ngChannelIds.addAll(map.get('ngChannelId'))
      this.visitedMovies.addAll(map.get('visitedMovieId'))
    }
    return Config
  })()
