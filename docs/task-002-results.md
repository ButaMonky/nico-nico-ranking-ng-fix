# Task 002 — Config抽出結果

2026-09-06。設定管理の機械的抽出と自動検証が完了。実サイト試験は未実施。

## 行ったこと

1. 分割前に、設定の全項目・保存キー・初期値・大小文字正規化対象・syncの読込順を固定するテストを追加した。
2. 保存値の復元、読み込み時に書込みや変更通知を行わないこと、読込失敗が伝わること、一時設定ngMovieVisibleが永続化されないことを追加確認した。
3. 原本に対して7件すべてPASSを確認し、先行コミット`63a8572`へテストを保存した。
4. Config全体（CSV処理を含む原本442～687行）を、内容を一切変更せず`src/core/config.js`へ移した。
5. ビルドをprefix→events→storage→config→remainderの順へ変更した。

## 変更ファイル

- tests/core.test.mjs: Configの動作試験2件追加。原本と生成物で同一期待値を使用。
- src/core/config.js: 設定管理を独立したソース断片として配置。
- src/legacy/remainder.js: Config部分を取り出した残り。ThumbInfo以降は無変更。
- scripts/build.mjs: 連結順の追加と検証メッセージ更新。
- README.md: 最新の構成と報告へのリンク。
- docs/task-002-results.md: 本報告。

## 検証結果

- 分割前の原本: 7件PASS。
- 分割後: 基盤3件＋原本7件＋生成物7件＝17件PASS、FAIL/SKIP 0。
- 構文チェック: baselineと生成物の2ファイルPASS。
- 生成物: 原本とバイト単位で一致。463,894 bytes、SHA-256 `AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371`。
- Node v24.19.0でbuild/check/testを直接実行。npm経由は環境にnpmがなく未実施。

原本は変更していない。設定名、既定値、保存形式、CSV形式、NG/通信/AutoFill/描画の動作変更なし。既存のCSV往復テストもPASS。Configのd3/Store/ArrayStore依存は、元のIIFEスコープと実行順を維持して解決する。

新しいconfig断片の末尾空行は原本の境界をそのまま保持するために必要。Git空白検査がこれを指摘しても削除しない。

## 次に行うこと

Task 003はNG判定の基準テストを作る。最低対象はロックタグ数11、タイトル「中国」、ユーザーID、ID欠損、同一投稿者の複数動画、AND/OR/NOT。未取得と取得完了を分け、v14.1の現在の結果をまず観測・固定する。この段階ではNG判定の実装を変更しない。

ブラウザ/実manager/実ニコニコ画面の試験は未実施であり、dev0全体の挙動合格を意味しない。利用中のスクリプトは入れ替え不要。Task 003は未着手。
