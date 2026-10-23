# ニコニコランキングNG Fix

kengo321氏の[Nico Nico Ranking NG](https://greasyfork.org/ja/scripts/880-nico-nico-ranking-ng)を基に、
複合NGや検索結果の自動補充などを加えた非公式改変版です。
改変版の作者・保守者は **ButaMonky** です。

ニコニコ動画のランキング・検索結果で、見たくない動画を非表示にします。
Tampermonkeyなどのユーザースクリプト管理拡張で動作します。


## インストール

[Tampermonkey](https://www.tampermonkey.net/)をインストールした状態で、
以下のリンクを開いてください。

- **[ニコニコランキングNG Fixをインストール](https://github.com/ButaMonky/nico-nico-ranking-ng-fix/raw/refs/heads/master/dist/nico-nico-ranking-ng.user.js)**

160.30からは **Nico Nico Ranking NG Fix** という別の識別情報でインストールされ、原作者版を置き換えません。原作者版や160.29以前の改変版がある場合は、設定をバックアップしてから無効にし、Fixだけを有効にしてください。既存の設定は新しい項目へ自動移行されません。

インストール後、ニコニコ動画の対象ページを開き直すと利用できます。
ページ読み込み時は動画を表示した状態から始まり、NG判定が済んだ動画から非表示になります。
すでにお使いの場合は、下の「更新」を確認してください。

インストール画面が開かない場合は、[導入方法の補足](docs/usage.md#導入と最初の設定)を参照してください。
公開版はログインなしで取得できます。

## 主な機能

- 動画ID・タイトル・タグ・タグロック数・投稿者などによるNG
- 複数の条件や例外を組み合わせる複合NG。いいね数・再生数・コメント数・マイリスト数・動画時間にも対応
- NGで減った検索結果の自動補充
- 閲覧済み動画の表示切替、タグ・投稿者情報の表示、リスト／タイル表示への対応

設定は、対象ページに追加される「設定」から変更できます。
詳しくは[使い方と設定](docs/usage.md)を参照してください。

## 更新

Fixは、TampermonkeyがこのプロジェクトのGitHub `master` にある安定版メタデータを確認し、新しい `@version` が公開されたときに自動更新できます。Tampermonkey側の更新確認・自動インストール設定を有効にしてください。
160.29以前からは識別情報が変わるため、**最初の一度だけ**上のリンクからFixを導入し、必要な設定を移してください。原作者版の編集画面に新版を貼り付けて上書きしないでください。

開発途中の `integration/brush` や作業ブランチは更新先ではありません。検証して `master` に公開した版だけが自動更新対象です。
Fix導入後は同じ識別情報で自動更新します。更新前の設定バックアップも推奨します。
詳しくは[更新・移行手順](docs/distribution.md#設定を保持して更新する)を参照してください。

## 既知の制限

- ホバープレビューは試験機能で、初期設定はOFFです。
- 連続再生は一部対応です。
- 一部のランキング形式、ショート動画、モバイルでの動作は未確認です。

ニコニコ側の仕様変更によって動作が変わる場合があります。
[160.30の変更・検証範囲](docs/distribution-16030.md)も参照してください。

## 変更履歴

変更内容は[CHANGELOG](CHANGELOG.md)にまとめています。

## 原スクリプトについて

原作者は **kengo321氏**、原配布元は
[Nico Nico Ranking NG（Greasy Fork）](https://greasyfork.org/ja/scripts/880-nico-nico-ranking-ng)です。

この改変版は原配布版とは別系統で、更新先も異なります。
ニコニコ公式が提供する製品ではありません。

## ライセンス

この改変版で新たに作成したコードには[MIT License](LICENSE)を適用しています。
原スクリプトや同梱ライブラリなどは、それぞれの条件に従います。

ライセンスの適用範囲や、利用条件を確認中の部分については[LICENSING](LICENSING.md)、
第三者コードのライセンス・謝辞は[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)を参照してください。

## フィードバック

質問や使い方の相談は[Issues](https://github.com/ButaMonky/nico-nico-ranking-ng-fix/issues)へどうぞ。
不具合は[報告フォーム](https://github.com/ButaMonky/nico-nico-ranking-ng-fix/issues/new?template=bug_report.yml)を利用してください。

Cookie・Tokenなどの認証情報、HAR、保存ページ、個人情報は添付しないでください。
[診断情報の確認方法](docs/usage.md#不具合の情報を確認する)も用意しています。

## 開発

通常の利用にNode.jsやビルド作業は不要です。
開発する方は[CONTRIBUTING](CONTRIBUTING.md)を参照してください。

[開発タスク](docs/TASKS.md) · [配布仕様](docs/distribution.md) · [過去の版別資料](docs/version-history.md)
