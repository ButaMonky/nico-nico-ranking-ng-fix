# Task 000実行結果

2026-09-06。v14.1本体は無変更。原本・baseline・distは463,894 bytes、SHA-256 `AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371`。

## 検証

- コピー型build: PASS。
- 原本コピーと生成物の構文チェック: 2ファイルPASS。本体はNodeで実行していない。
- 基盤自動テスト: 3件PASS、FAIL/SKIP 0。
  - 固定ハッシュ・manifest一致。
  - 全バイト/メタデータ保持・再生成一致。
  - 改変入力を拒否し既存出力を上書きしない。
- npmコマンド経由: 未実施。npmが存在しないためREADMEのNode直接実行で同じスクリプトを検証。依存導入なし。
- 新しいGit作業コピーでの再現: 実行結果を最終追記する。
- Gitコミット/tag: 保存後に最終記録を追記する。
- NG動作・ブラウザ・サイト・実設定互換性試験: 未実施。計画をdocsへ作成済み。dev0の挙動合格ではない。

## 作成ファイルと理由

- baselineの原本コピー/manifest: 比較基準をTemp以外に固定。
- scripts/build.mjs・check.mjs: 無変換の生成と構文検証。
- tests/baseline.test.mjs: 保持・再現・改変拒否を検証。
- package.json・.node-version: 実行手順とNode版を固定。
- .gitattributes・.gitignore: 原本のGit改行変換を防ぎ生成物を履歴から除外。
- README.md・docs/environment.md: 外部依存なしの再現手順。
- docs/compatibility-inventory.md: 保存値/メタデータ/起動順の棚卸し。
- docs/regression-matrix.md・manual-checklist.md・tests/fixtures/README.md: 後続試験の入力・記録方法と未実施範囲。
- 本報告: 実行した検証と未実施事項を区別。

## 残る制約

npm入口自体は未検証だが、Nodeだけで基盤を使用できる。ブラウザ上のNG/表示回帰は未実施。原本の既知の表記差、仕様・不具合は変更していない。Gitは端末内の保存で、外部バックアップや公開は行っていない。Task 001は開始していない。
