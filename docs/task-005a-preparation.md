# Task 005A準備 — ThumbInfo取得制御

2026-09-06。取得実装とソース断片は無変更。追加したtests/thumb-info.test.mjsをscripts/test.mjsに登録し、原本/生成物の双方で実行した。

## 確認した現行動作

- 同じインスタンスの同一ID要求を重複排除。失敗後に同じIDを再要求しても新しい要求は作らない。
- 初期同時取得数を守り、優先候補を待機列の先頭へ追加。
- エラー/HTTP応答時は次候補の要求を開始してから完了/失敗を通知。
- timeoutは同じIDを1回再試行し、2回目でTIMEOUT通知して次候補へ進む。
- 同時取得数の設定は1～20、0は5。実行中に2から1へ下げても終了枠へ次候補を補充し、一時的に2が続く現行動作を維持。
- 成功時のtitle/description/tags/lock/userId/name、削除エラー、HTTPエラー、解析例外の通知を確認。

入力と期待値はtests/thumb-info.test.mjs内に固定。原本をVM内でTag定義直前まで読み、ThumbInfo自体を実行する。httpRequestの代役は要求を記録するだけで、テストから応答callbackを手動実行する。実通信は発生しない。

DOMParserの代役はJSONから既知のノード情報を返す。これはXMLパーサーではなく、解析後データから通知までの経路の試験。実XML解析の正しさやブラウザ固有DOMParserの動作は検証していない。

## 結果

既存25件＋追加4シナリオ×原本/生成物＝33件PASS、FAIL/SKIP 0。構文2ファイルPASS。生成物は原本と463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で一致。Node v24.19.0使用。npm経由は未検証。

## 次回: Task 005A実装仕様

目的: ThumbInfo定義（原本688～847行と後続区切り）をsrc/data/thumb-info-source.jsへそのまま移す。Data Sourceの統一・API変更ではなく、dev0の機械的分割のみ。

許可: src/data/thumb-info-source.jsの新設、src/legacy/before-ng.jsから該当バイト列を取り出す、scripts/build.mjsの元位置へ連結指定、README/結果報告更新。

禁止: 通信API・URL・timeout値・再試行・同時実行・エラー文言・XML解析・通知順の変更。NG/cache/AutoFill/DOM処理の変更。baseline編集。今回確認した現行挙動の改善。

完了条件: 変更前33件確認→一意なThumbInfo/Tag境界で抽出→buildバイト完全一致→構文2件・テスト33件全PASS→差分確認・Git保存。元のスコープとEventEmitter/createObject依存を維持する。Tag/Contributorはまだ分離しない。

未検証: 実HTTP/GM API、実XML解析、channel/unknownの解析ケース、ブラウザ統合、cache・AutoFill。将来Data契約を変える前に試験を補う。今回の準備で実装分割は実施していない。ユーザー操作やスクリプト入れ替えは不要。
