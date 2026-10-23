# 160.30: 原作者版との分離・自動更新・初回表示

[README](../README.md) · [配布・移行手順](distribution.md) · [変更履歴](../CHANGELOG.md)

## インストール時の識別

160.29以前は原作者版と同じ `@name` と `@namespace` を使っていたため、インストール時に既存の原作者版を置き換えていた。利用者の指示を受け、160.30からは次の専用識別情報に変更する。

- 名前: `Nico Nico Ranking NG Fix`
- namespace: `https://github.com/ButaMonky/nico-nico-ranking-ng-fix`
- 作者: `ButaMonky`、原作者クレジット: `kengo321 (original)`

原本baselineは変更しない。保存キー・形式は従来どおりだが、別スクリプトのGM保存値は自動移行しない。原作者版を残してFixを導入し、必要な設定を移してFixだけを有効にする。旧版のCSVは7種のみで、複合NG・ロックタグ・表示・補充設定の完全バックアップではない。実際の手順は[配布仕様](distribution.md#設定を保持して更新する)を参照。

## 自動更新

160.27で導入したGitHub `master` の自動更新先を継続する。`.meta.js` と本文・互換配布物を同じビルドから生成し、名前・namespace・版番号が一致する。以後のFixでは識別情報を固定して増番する。Tampermonkey側で更新確認・自動インストールを有効にする必要があり、実行間隔は拡張の設定に従う。

[Tampermonkeyの更新URL仕様](https://www.tampermonkey.net/documentation.php?q=update_url)と[名前・namespaceによる識別](https://violentmonkey.github.io/api/metadata-block/#name)を確認。原作者版の配布先、旧研究リポジトリ、作業ブランチは更新先に使わない。

## 初回表示

利用者の希望に合わせ、初回ページでは既に読み込まれた本家の動画カードを表示し、NGと判定されたものから非表示にする。判定が終わるまで全カードを一括で隠す方式を廃止する。未判定と非NGは区別し、追加補充の候補確認は維持する。

## 検証状況

配布物の識別衝突を検出する既存テストを更新し、変更前の失敗と変更後の成功を確認した。本文・メタデータ・互換ファイルの一致、原本ハッシュ・ライセンス通知も検査する。

- `node scripts/test.mjs`: 389件成功、失敗・skipなし。
- オフラインブラウザ7本成功: `test-initial-visibility`、`test-autofill-card-budget`、`test-autofill-early-stop`、`test-spa`、`test-metadata-readiness`、`test-diagnostics`、`test-pager-journey`。
- 新規初回表示試験は変更前の全件非表示で失敗し、変更後は3件表示→NG確定後2件→NG再表示で3件、通信失敗、SPA再入場を確認。
- 構文、現在ツリーの個人情報検査、差分の空白検査、文書内の相対リンク146件を確認。
- 配布先の本文・メタデータは認証なしでHTTP 200取得できることを確認。実拡張による自動インストールとは別の検証。
- 独立エージェントが識別情報・移行説明と、初回表示・補充の待機条件・SPAをレビューし、阻害事項なし。

履歴検査は既知のGitHub公式記録者 `GitHub <noreply@github.com>` の3件でexit 1となる。対象は `d12107b5c1e9a41a98f404da9a0e8650fd500152`、`6492ea503ee546fb3c4ee66febebb53fc25cec3b`、`9a5bc4fbac833cdafcd51e45b7062fd47501dd87` のみで、新たな例外はない。検査器は緩和せず、今回のコミットもGitHub noreplyを使用する。

Tampermonkey実拡張での新規導入・160.29以前からの識別変更・設定移行・次版の自動インストールは未検証。原作者版を既に上書きした状態を自動復元する機能はない。実サイトの全条件を確認したものでも、本家との完全一致を示すものでもない。
