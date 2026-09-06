# Nico Nico Ranking NG — Task 000

v14.1を変更せず保存・検証する開発基盤です。本体の分割はまだ行っていません。

## 再現手順

Node.js **24.19.0** を用意し、このフォルダーで次を順に実行します。追加パッケージやインストール作業は不要です。

```powershell
node --version
node scripts/build.mjs
node scripts/check.mjs
node --test tests/baseline.test.mjs
```

npmが利用できる環境では同じ処理を `npm run build`、`npm run check`、`npm test` で実行できます。この作業環境にはnpmがなく、上記Node.js直接実行を検証します。npm経由の実行は未検証です。

生成物はdistにあります。原本とバイト単位で同じv14.1であり、新版ではありません。baselineは編集しないでください。SHA-256は確定仕様に固定されており、不一致ならbuildは失敗します。

Git保存後は別フォルダーへ `git clone --no-hardlinks <このリポジトリの絶対パス> <新しい作業フォルダー>` を実行し、上記手順を繰り返します。distやTempの元ファイルをコピーする必要はありません。

検証の範囲と残作業は [結果報告](docs/task-000-results.md)、今後の動作試験は [回帰計画](docs/regression-matrix.md) を参照してください。
