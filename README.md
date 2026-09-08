最新160.5: [詳細ボタン・診断ログの修正](docs/toggle-console-1605.md)。自動テスト96件。

160.4: [通信・安定性の改善報告](docs/network-stability-1604.md)。自動テスト95件。

# Nico Nico Ranking NG — リスト／タイル表示修正版

160.3: [論理式NG・先読み終端の見直し](docs/logic-pagination-fix.md)。自動テスト85件。生成物は前回と同じファイル名です。

160.2: [ZenzaWatchを閉じた際の再読み込み修正](docs/zenza-history-fix.md)。自動テスト76件とリスト／タイルのブラウザー試験を実施。

最新: [リスト／タイル表示修正と導入手順](docs/list-tile-fix.md)。ユーザーの表示修正依頼を受け、dev0の機械的分割から機能修正へ進みました。従来のテスト71件に加え、提供されたHTMLを使うBraveの表示切替試験を用意しています。

分割時点の記録: [dev0チェックポイント](docs/dev0-checkpoint.md)。これは当時の記録です。現在の生成物はv14.1とのバイト一致を要求しません。

v14.1の主要定義を24個の断片へ分けています。元の順で連結し、生成物が原本とバイト単位で完全一致することを強制します。baselineは比較専用、srcがビルド入力です。各区分内部の責務分離は未完了です。

## 再現手順

Node.js **24.19.0** を用意し、このフォルダーで次を順に実行します。追加パッケージやインストール作業は不要です。

```powershell
node --version
node scripts/build.mjs
node scripts/check.mjs
node scripts/test.mjs
```

npmが利用できる環境では同じ処理を `npm run build`、`npm run check`、`npm test` で実行できます。この作業環境にはnpmがなく、上記Node.js直接実行を検証します。npm経由の実行は未検証です。

生成物は `dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js`（メタデータ版番号160.4）です。baselineは編集しないでください。原本のSHA-256検証は引き続き必須です。ビルドは分割ソースの順序どおりの連結と出力一致を検証します。

Git保存後は別フォルダーへ `git clone --no-hardlinks <このリポジトリの絶対パス> <新しい作業フォルダー>` を実行し、上記手順を繰り返します。distやTempの元ファイルをコピーする必要はありません。

検証の範囲と残作業は [Task 003結果](docs/task-003-results.md)、以前の基盤準備は [Task 000結果](docs/task-000-results.md)、今後の動作試験は [回帰計画](docs/regression-matrix.md) を参照してください。
