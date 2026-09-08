# ZenzaWatch終了時の再読み込み修正 — 160.2

ユーザー提供ログに `history.replaceState` による `/watch/sm90001003` から元のタグ検索への復帰をSPA検索として扱い、`location.reload()`を実行した記録がありました。

提供されたZenzaWatch 2.6.3-fix-playlist.55の `WatchPageHistory` は、再生時に動画URLへ置換し、終了時と30秒後の復元処理で元のURLへ戻します。検索結果のDOMはそのまま残ります。

NG側の `src/nico/navigation.js` を修正しました。初期化した検索URLと検索カードを記録し、同じURLへ戻ってそのカードも残っている場合は再初期化を省きます。リスト／タイルでカードが置換される場合に備え、動画URLへ移る直前にカード参照を更新します。ZenzaWatch側のスクリプトは変更していません。

別検索・並び順・ページ番号への変更や、元のカードが破棄された後の復帰は再初期化の対象です。また、120msの待機中に動画URLや元の検索へ移った場合、または設定をOFFにした場合は予約済みの再読み込みを中止します。

## 検証

自動テスト76件。新たに開閉反復・連続再生、URLポーリング、DOM破棄、別検索、待機中のURL変更／設定OFFを検証しました。添付スクリプトのWatchPageHistory部分を `tests/fixtures/zenza-watch-history.js` に抜き出し、実コードのopen/loadVideoInfo/closeおよび30秒後の復元も実行しています。DOMとタイマーはテスト用代替です。

既存のBraveヘッドレスによるリスト／タイル表示試験と構文チェックも実行。実サイトでZenzaWatchの動画・音声を再生する通し試験は未実施です。

## 導入と確認

前回と同じ `dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js` を再生成しました。版番号は160.2です。Tampermonkeyの既存NGスクリプトの全文をこのファイルで置き換えて保存し、ニコニコの検索ページを一度再読み込みしてください。

ZenzaWatchで動画を開き、閉じたときに検索ページが再読み込みされないことを確認してください。リスト／タイル切替の修正も含まれます。
