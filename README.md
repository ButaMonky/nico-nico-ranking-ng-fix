# Nico Nico Ranking NG — dev0機械的分割チェックポイント

最新: [一括整理の結果・依存例外・残る検証](docs/dev0-checkpoint.md)。テストは71件。主要定義の機械的分割は一区切りですが、実環境検証と責務再設計は未完了です。

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

生成物はdistにあります。原本とバイト単位で同じv14.1であり、新版ではありません。baselineは編集しないでください。SHA-256は確定仕様に固定されており、不一致ならbuildは失敗します。

Git保存後は別フォルダーへ `git clone --no-hardlinks <このリポジトリの絶対パス> <新しい作業フォルダー>` を実行し、上記手順を繰り返します。distやTempの元ファイルをコピーする必要はありません。

検証の範囲と残作業は [Task 003結果](docs/task-003-results.md)、以前の基盤準備は [Task 000結果](docs/task-000-results.md)、今後の動作試験は [回帰計画](docs/regression-matrix.md) を参照してください。
