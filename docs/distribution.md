# 配布・自動更新の仕様

[利用者向けREADME](../README.md) · [開発手順](../CONTRIBUTING.md)

## 配布元と更新の考え方

本改変版の配布ファイルは `dist/nico-nico-ranking-ng.user.js` です。160.27からは、Tampermonkeyの更新確認用 `dist/nico-nico-ranking-ng.meta.js` も同じビルドから生成し、GitHub `master` の固定URLを自動更新先として使います。開発途中のbranchやintegrationは更新先にしません。

安定した配布対象は、検証してmasterへ反映した版です。作業途中のブランチを一般利用者へ案内しません。ファイル名とインストールURLは更新ごとに変えず、最新版の判定は `@version` とCHANGELOGを使います。

160.26から版番号を含まない固定名に統一しました。従来の `nico-nico-ranking-ng-v16-list-tile-fix.user.js` も互換用として同じビルドから同じ内容を生成します。二つを別々のスクリプトとしてインストールしないでください。原本のファイル名は変更しません。

新しいリポジトリには製品masterだけを移し、旧研究ブランチ・旧タグ・既存PRは含めません。旧タグ `stable-v14.1` は非公開バックアップ側に残し、最新版として案内したり付け替えたりしません。

## 160.30のメタデータ

| キー | 値・目的 |
| --- | --- |
| @name | `Nico Nico Ranking NG Fix`。原作者版と区別 |
| @namespace | `https://github.com/ButaMonky/nico-nico-ranking-ng-fix`。改変版専用の固定識別値 |
| @version | `160.30`。内部診断の `NRN_VERSION` も揃える |
| @author | `ButaMonky`。この改変版の作者・保守者 |
| @contributor | `kengo321 (original)`。原作者クレジット |
| @license | 本体MIT、同梱部品は別条件である旨を記載 |
| @updateURL | `https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.meta.js` |
| @downloadURL | `https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.user.js` |
| @homepageURL | `https://github.com/ButaMonky/nico-nico-ranking-ng-fix` |
| @supportURL | `https://github.com/ButaMonky/nico-nico-ranking-ng-fix/issues` |

根拠: [Tampermonkeyの更新URL仕様](https://www.tampermonkey.net/documentation.php?q=update_url)。`.meta.js` はビルド済み `user.js` のUserscriptメタデータブロックだけを取り出して生成し、版番号や更新URLが本文とずれないようにします。Greasy Fork 880 は原配布版なので、この改変版の更新先には使いません。

## 設定を保持して更新する

160.29以前の改変版は原作者版と同じ名前・namespaceで、インストールすると既存項目を上書きする問題がありました。160.30では両方を専用の値へ変更します。[名前・namespaceによる識別の仕様](https://violentmonkey.github.io/api/metadata-block/#name)。以後はFixの識別情報を固定し、このプロジェクトのGitHub `master` から自動更新します。

### 原作者版・160.29以前からの初回移行

1. Tampermonkeyの「ユーティリティ」で、スクリプト本体と保存データを含むバックアップを作成します。環境ごとに項目名は異なります。含まれる範囲を確認し、バックアップは自分の端末内に保存します。
2. 必要な設定を控え、旧版の設定画面からNGをCSV出力します。CSV対象外の複合NG・ロックタグ・表示・補充などの設定は、設定画面で内容を記録します。複合NGの内部保存形式はJSONですが、専用のJSON出力・入力UIはありません。
3. 旧項目は削除せず無効にして、READMEのリンクから新版をインストールします。名前が `Nico Nico Ranking NG Fix` の別項目になることを確認します。原作者版の編集画面へ新版を貼り付けないでください。保存用に残す旧改変版160.27〜160.29は同じGitHub更新先を持つため、その旧項目の更新確認も無効にします。
4. Fixの設定画面へCSVを取り込み、複合NGや対象外の設定を移して、NG各種・閲覧済み・補充・表示設定を確認します。別項目のGM保存値は自動的には引き継がれません。元の設定はバックアップと旧項目に残してください。
5. ページを開き直し、Fixだけが有効な状態で動作を確認します。原作者版・旧改変版との同時実行には対応していません。

既に原作者版を旧改変版で上書きしていた場合、この修正だけで原作者版が復元されるわけではありません。必要ならバックアップまたは原配布元から復元してください。160.27〜160.29で自動更新が設定されていた環境の識別変更時の挙動は実拡張で未検証のため、初回移行は上記手順で確認します。

設定はGM_getValue/GM_setValue（またはGM.*）の保存値を使います。160.30でもキー・保存形式は変更しません。CSV出力は従来の7種だけで、ロックタグ、複合NG JSON、表示・補充などの設定は対象外です。sessionStorageの詳細キャッシュは再取得できる一時情報で、設定とは別です。

### Fix導入後の自動更新

Tampermonkey側の更新確認と自動インストール設定を有効にします。スクリプト情報の更新先が `raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/` を指すことを確認してください。利用者が設定した独自URLがある場合は、同梱の更新先を使う設定へ戻します。原作者版のGreasy Fork 880はFixの更新先には使いません。

以後のFixは同じ名前・namespaceのまま増番します。更新間隔・インストールのタイミングは拡張側の設定に従います。更新前にバックアップを取り、更新後に版番号と設定を確認してください。

[Tampermonkeyのバックアップ手順](https://www.tampermonkey.net/faq.php?locale=en&q=Q106) · [保存値の確認](https://www.tampermonkey.net/faq.php?locale=en&q=Q400) · [5.5.0の変更](https://www.tampermonkey.net/changelog.php)

## 非公開リポジトリと一般向けの配布

GitHubが非公開の場合、リポジトリやファイルにはアクセス権が必要です。ブラウザでログインしていても、Tampermonkeyのバックグラウンド取得に同じ認証が使われるとは限りません。private Rawやprivate Releaseを一般向けの更新経路とは扱いません。

一般利用者がリンクから取得するには、配布ファイルを認証なしで取得できる状態が必要です。公開範囲を変更しても、この版が自動更新になるわけではありません。トークン付きURL、PAT、Cookie、期限付き認証URLをスクリプトや案内へ埋め込みません。

公開設定はリポジトリ単位であり、masterだけを公開する設定ではありません。旧研究ブランチ・旧タグ等の確認は製品masterの検査と分けます。非公開状態の変更は利用者の指示に従います。

## 自動更新の仕組み

160.27以降は、認証なしで取得できるGitHub `master` の固定配布先を使います。`@updateURL` はメタデータだけの `nico-nico-ranking-ng.meta.js`、`@downloadURL` は本文の `nico-nico-ranking-ng.user.js` を指します。

- 開発途中の `integration/brush` や作業ブランチは更新対象にしません。
- `meta.js` と `user.js` は同じ検証済みsrcから生成し、`@version` を必ず一致させます。
- 配布物が変わるたびに版番号を増やし、同じ版番号の中身だけを差し替えません。
- 160.29以前からは最初の一度だけ、識別情報を分離したFixの導入と設定移行を確認します。
- 実拡張での新規導入・旧版からの移行・次版検出・設定保持は、メタデータ・配布経路の検証とは区別して記録します。
- トークン、Cookie、PAT、期限付きURLは更新先に使いません。

公開は利用者の明示承認後に行い、未検証のintegrationを自動更新先へ出しません。

## 版番号と生成

- 更新時は `src/legacy/prefix.js` の `@version` と `NRN_VERSION` を同じ値へ増やします。メタデータや通知だけの変更でも、配布物が変われば新版にします。
- 160.xxの既存方式を維持し、1.0などへ戻したり、小数として計算したりしません。[Tampermonkeyの版比較](https://www.tampermonkey.net/documentation.php?q=version)
- src、LICENSE、同梱通知を編集し、`node scripts/build.mjs` で配布物を作ります。distだけを直接編集しません。
- ビルドはbaselineとHLS本体の固定ハッシュ、通知原文のハッシュを確認し、srcを順番に連結した後へライセンスコメントを追加します。ネットワーク接続は不要です。
- ライセンス原文を更新する場合は、その版の上流文書を再確認し、`vendor/third-party-manifest.json` の取得元・版・ハッシュも更新します。検査を通すためだけにハッシュを変更しません。
- 問題を修正した配布物は、同じ版を差し替えず増番します。戻す必要がある場合も、前の挙動へ戻す変更を新版として扱います。

## 配布前の確認

ビルド・構文・単体試験、影響する模擬ブラウザ試験、現在ツリーのプライバシー検査を行います。送信前には差分、コミットのnoreplyメール、送信する先端の履歴検査を確認します。[コマンドと環境](../CONTRIBUTING.md)

Tampermonkeyの実拡張による導入・保存値保持・自動更新検出の確認は、模擬ブラウザ試験とは別です。160.30の確認状況は[版別記録](distribution-16030.md)に残します。
