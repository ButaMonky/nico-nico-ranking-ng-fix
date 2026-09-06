# Task 001 — イベント/保存処理の抽出結果

2026-09-06。Task 001の自動検証PASS。実サイトの手動試験は未実施。

## 実施順序

最初に変更前のv14.1へ5件の動作テストを実行し、全件成功した状態をコミット`3b05465`に保存。その後、バイト列を分割した。期待値を分割後の実装に合わせて変更していない。

## 変更と理由

- `src/core/events.js`: 原本224～273行。EventEmitterとListenersの定義をそのまま移設。
- `src/core/storage.js`: 原本274～441行。ArrayStoreとStoreの定義をそのまま移設。
- `src/legacy/prefix.js`: 原本1～223行。メタデータ、同梱d3-dsv、IIFE開始、createObject等を無変更で保持。
- `src/legacy/remainder.js`: 原本442行以降。Config・NG・DOM・AutoFill等すべてを無変更で保持。
- `scripts/build.mjs`: baselineをコピーする方式から上記4断片の順次連結へ変更。生成バイト列が原本と異なれば、出力前に失敗する。
- `.gitattributes`: src断片にも改行変換禁止を指定。
- `tests/core.test.mjs`: 原本と生成物の両方に同じ期待値を適用する動作テスト。
- `scripts/test.mjs` / `package.json`: build後に基盤と動作テストをまとめて実行。
- `README.md` / 本報告: 実行方法、範囲、制約を更新。

remainderは大きいが、このTaskでは対象外コードを編集しないため、丸ごと保持する。ES module化は行わず、元のIIFEスコープを連結で維持する。断片単独ではなく、組み立てたuserscriptに対して構文チェックする。依存補助関数createObjectはprefixに残す。

## 検証結果

- 分割前の原本: 動作5件PASS。
- 分割後: 基盤3件 + 原本動作5件 + 生成物動作5件 = 13件PASS、FAIL/SKIP 0。
- 構文チェック: baseline・distの2ファイルPASS。
- 原本と生成物: 463,894 bytes、SHA-256 `AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371`で一致。
- 保存キー、既定値、CSV7種・引用符・ID数値化を維持。NG、DOM、AutoFill、Config本体に変更なし。
- 外部依存追加なし。npm不在のためNode v24.19.0で直接実行。

動作テストは原本/生成物からThumbInfo定義直前までを読み、テスト専用VMで実行する。本体へテスト用exportやフックを追加せず、Main・DOM・外部APIは実行しない。同梱d3-dsvとConfigもそのまま使いCSV往復を検証する。

## 固定した現行挙動

通知の登録順、重複登録抑止、解除、通知例外の伝播、保存後の変更通知、syncの無通知、ID/大小文字正規化、remove/clear、失敗後も進む非同期キュー、CSV往復を検証。

一括追加内の同値重複が残ること、非同期変更で保存が2回呼ばれることも現行互換として固定した。これらを今回修正していない。

## 未実施と次段階

実ニコニコ画面、実managerでのGM API、NG全般の回帰は未実施。生成物は原本そのものであり新しい機能版ではない。既存スクリプトの入れ替えは不要。これだけでdev0全体の合格とはしない。

Task 002以降へ自動的には進まない。次はConfigを抽出する前に、全保存キー・既定値・sync対象のテストを追加する。stable-v14.1 tagは動かさない。
