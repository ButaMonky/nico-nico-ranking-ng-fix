# 互換性棚卸し

## 保存形式・外部依存・起動

- CSV: ngMovieId / ngTitle / ngTag / ngUserId / ngUserName / ngChannelId / visitedMovieId の7種。type,value,textの3列。ID数値化はngUserIdとngChannelIdのMath.trunc。ロックタグと論理ルールは対象外（508～517、648～683行）。
- 論理ルールはadvancedNgRulesJsonに保存。旧conditionsからAND groupへのparse時変換がある（1130～1137行）。CSVとは別契約。
- sessionStorage: `NicoNicoRankingNG:detailCache:v2`、schema 2。保持既定360分、件数1500。期限設定は1～1440分、件数100～4000に制限（7333～7350行）。復元はThumbInfoListenerを介す。
- 同梱d3-dsv Version 1.0.0、Copyright 2016 Mike Bostock（29行）。UMD分岐を含む。本体メタデータのMIT License表記を含め全バイト保存。別の依存パッケージへ置き換えていない。
- document-startでSPA guard設置→未判定カード非表示CSS→DOMContentLoadedまたはready状態から起動（11363～11369行）。
- 起動内: ページ選択/CSS→Config.sync→テーマ→モデル/Controller→NewTabService→表示接続・初期ThumbInfo要求→MutationObserver→AutoFill→SPA設定反映（11250～11309行）。
- GM_getValue/GM_setValue/GM_xmlhttpRequestが未定義ならGM.getValue/GM.setValue/GM.xmlHttpRequestを選択する（7199～7203、7288～7296行）。新規タブも旧/新GM APIを扱うNewTabServiceを維持。
- メタデータは141-performance-pager-fix、DiagnosticsのPREFIXと一部起動ログは14.0、snapshotは14.1。表記差は修正していない。

## Config全宣言

原本の静的抽出。下記Config宣言はngMovieVisibleを除き、すべてConfig.sync対象。ArrayStoreの保存既定値はJSON文字列 []（399行）。ngMovieVisibleはfalseのメモリ内Storeで永続化もsyncもしない。

```javascript
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
this.advancedNgRulesEnabled = store('advancedNgRulesEnabled', false);
this.advancedNgRulesJson = store('advancedNgRulesJson', '[]');
this.autoFillEnabled = store('autoFillEnabled', false);
this.autoFillTargetCount = store('autoFillTargetCount', 36);
this.autoFillMaxExtraPages = store('autoFillMaxExtraPages', 5);
this.autoFillInfoMode = store('autoFillInfoMode', 'legacy');
this.autoFillAdMode = store('autoFillAdMode', 'visible');
this.selfAdWarningEnabled = store('selfAdWarningEnabled', false);
this.thumbInfoConcurrency = store('thumbInfoConcurrency', 12);
this.developerMode = store('developerMode', false);
this.statusPanelMode = store('statusPanelMode', 'compact'); // compact / detailed / hidden
this.detailUiTheme = store('detailUiTheme', 'auto'); // auto / light / dark
this.autoFillDetailBatchMax = store('autoFillDetailBatchMax', 48); // 8..100
this.spaNavigationFix = store('spaNavigationFix', true);
this.autoFillPagerMode = store('autoFillPagerMode', 'compactSkip');
this.sessionDetailCacheEnabled = store('sessionDetailCacheEnabled', false);
this.statusAnimationEnabled = store('statusAnimationEnabled', true);
this.developerDiagnosticMode = store('developerDiagnosticMode', 'light');
this.pagerPreviewCount = store('pagerPreviewCount', 2);
this.sessionDetailCacheTtlMinutes = store('sessionDetailCacheTtlMinutes', 360);
this.sessionDetailCacheMaxEntries = store('sessionDetailCacheMaxEntries', 1500);
```

## メタデータ全行
```
// ==UserScript==
// @name         Nico Nico Ranking NG
// @namespace    http://userscripts.org/users/121129
// @author       Umonky
// @description  ニコニコ動画のランキングとキーワード・タグ検索結果に NG 機能を追加
// @match        *://www.nicovideo.jp/ranking*
// @match        *://www.nicovideo.jp/search/*
// @match        *://www.nicovideo.jp/tag/*
// @version      141-performance-pager-fix
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @license      MIT License
// @noframes
// @run-at       document-start
// @connect      ext.nicovideo.jp
// @connect      snapshot.search.nicovideo.jp
// @connect      api.nicoad.nicovideo.jp
// @downloadURL https://update.greasyfork.org/scripts/880/Nico%20Nico%20Ranking%20NG.user.js
// @updateURL https://update.greasyfork.org/scripts/880/Nico%20Nico%20Ranking%20NG.meta.js
// ==/UserScript==
```
