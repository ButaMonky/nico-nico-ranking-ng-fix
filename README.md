# ニコニコランキングNG

kengo321氏の[Nico Nico Ranking NG](https://greasyfork.org/ja/scripts/880-nico-nico-ranking-ng)を基に、
複合NGや検索結果の自動補充などを加えた非公式改変版です。

ニコニコ動画のランキング・検索結果で、見たくない動画を非表示にします。
Tampermonkeyなどのユーザースクリプト管理拡張で動作します。


## インストール

[Tampermonkey](https://www.tampermonkey.net/)をインストールした状態で、
以下のリンクを開いてください。

- **[ニコニコランキングNGをインストール](https://github.com/ButaMonky/nico-nico-ranking-ng/raw/refs/heads/master/dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js)**

インストール後、ニコニコ動画の対象ページを開き直すと利用できます。
すでにお使いの場合は、下の「更新」を確認してください。

インストール画面が開かない場合は、[導入方法の補足](docs/usage.md#導入と最初の設定)を参照してください。
非公開の間は、ファイルの取得にリポジトリの閲覧権限が必要です。

## 主な機能

- 動画ID・タイトル・タグ・タグロック数・投稿者などによるNG
- 複数の条件や例外を組み合わせる複合NG
- NGで減った検索結果の自動補充
- 閲覧済み動画の表示切替、タグ・投稿者情報の表示、リスト／タイル表示への対応

設定は、対象ページに追加される「設定」から変更できます。
詳しくは[使い方と設定](docs/usage.md)を参照してください。

## 更新

現在は自動更新に対応していません。新版は上のインストールリンクから更新できます。
160.24以前をお使いの場合も、一度手動での更新が必要です。

更新前に設定をバックアップし、**旧版を先に削除せず**上書きしてください。
詳しくは[更新・移行手順](docs/distribution.md#設定を保持して更新する)を参照してください。

## 既知の制限

- ホバープレビューは試験機能で、初期設定はOFFです。
- 連続再生は一部対応です。
- 一部のランキング形式、ショート動画、モバイルでの動作は未確認です。

ニコニコ側の仕様変更によって動作が変わる場合があります。
[詳しい対応状況と検証記録](docs/distribution-16025.md)も参照してください。

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

適用範囲と利用条件が未確認の部分は[LICENSING](LICENSING.md)、
第三者コードのライセンス・謝辞は[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)を参照してください。

## フィードバック

質問や使い方の相談は[Issues](https://github.com/ButaMonky/nico-nico-ranking-ng/issues)へどうぞ。
不具合は[報告フォーム](https://github.com/ButaMonky/nico-nico-ranking-ng/issues/new?template=bug_report.yml)を利用してください。

Cookie・Tokenなどの認証情報、HAR、保存ページ、個人情報は添付しないでください。
[診断情報の確認方法](docs/usage.md#不具合の情報を確認する)も用意しています。

## 開発

通常の利用にNode.jsやビルド作業は不要です。
開発する方は[CONTRIBUTING](CONTRIBUTING.md)を参照してください。

[開発タスク](docs/TASKS.md) · [配布仕様](docs/distribution.md) · [過去の版別資料](docs/version-history.md)
