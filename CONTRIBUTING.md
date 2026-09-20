# 開発・変更の記録

## 作業単位

1. [タスク一覧](docs/TASKS.md) で対象と受け入れ条件を確認します。新規タスクには未使用の `NRN-` 番号を付け、一度付けた番号は変更・再利用しません。
2. 対象を絞ったブランチで変更し、`src/` をビルド入力として扱います。`baseline/` の原本は編集せず、生成物はビルドで更新します。
3. 下記の検証を実施し、実行した試験・結果・未確認事項をタスクまたは版別文書へ記録します。
4. 利用者向け変更を [CHANGELOG](CHANGELOG.md) の `Unreleased` にまとめます。版の確定後に既存の版番号で区切り、実際の公開を確認する前に公開済みと書かないでください。

## ローカル検証

基準は **Node.js 24.19.0** です。リポジトリのルートで実行します。基本検証はNode標準機能だけを使い、追加パッケージのインストールは不要です。

```powershell
node --version
node scripts/build.mjs
node scripts/check.mjs
node scripts/test.mjs
node scripts/check-privacy.mjs
node scripts/check-privacy-history.mjs HEAD
```

`build.mjs` は原本のSHA-256と連結した生成物の一致を、`check.mjs` は原本と生成物の構文を検査します。生成物は `dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js` です。npmが利用できる場合は `npm run build`、`npm run check`、`npm test` も定義されていますが、既存の記録で検証している経路はNode直接実行です。

基本試験の成功だけでブラウザや実サイトの動作を確認済みとはしません。UI・SPA・ページ送り等の変更では、該当する既存のブラウザ試験も実施します。

### 任意のブラウザ試験環境

既存の試験はPlaywrightとChromium系ブラウザを使います。Playwrightが通常のモジュール解決で見つからない場合は `NRN_PLAYWRIGHT` に読み込み可能なモジュールのパス、外部ブラウザを使う場合は `NRN_BROWSER` に実行ファイルのパスを指定します。以下の値は端末ごとに置き換えるプレースホルダーです。

```powershell
$env:NRN_PLAYWRIGHT = '<playwright-module-path>'
$env:NRN_BROWSER = '<browser-executable-path>'
node scripts/test-pager-journey.mjs
node scripts/test-result-layout.mjs
node scripts/test-spa.mjs
node scripts/test-hover-preview.mjs
node scripts/test-preview-boundaries.mjs
node scripts/test-preview-hls.mjs
node scripts/test-preview-failure-ui.mjs
node scripts/test-preview-official-contract.mjs
node scripts/test-preview-card-integration.mjs
node scripts/test-card-actions.mjs
node scripts/test-card-interactions.mjs
node scripts/test-preview-audio.mjs
node scripts/test-preview-hover-exit.mjs
node scripts/test-card-tooltip.mjs
node scripts/test-pager-native-style.mjs
```

投稿者表示・情報取得・診断の変更では `scripts/test-owner-names.mjs`、`scripts/test-owner-evidence.mjs`、`scripts/test-metadata-readiness.mjs`、`scripts/test-card-enhancements.mjs`、`scripts/test-diagnostics.mjs` を対象に応じて実行します。論理回路NGエディターのブラウザ試験は `scripts/test-rule-editor.mjs` です。環境が用意できず未実行の場合は、未実行とその理由を記録してください。

合成データ・模擬通信を使い、個人のログイン済みプロファイルを試験に流用しません。端末固有のパスをソースや結果文書に保存しないでください。実サイト確認は別に扱い、版・表示モード・再現手順・確認できた挙動を個人情報なしで記録します。

プレビューのHLS試験はリポジトリ内の単色映像・合成音を使い、実際のHLS.jsで別音声配信を再生します。すべての要求を置き換えるため、公式配信の認証・CORSの確認とは別です。ライブラリの版・ハッシュ・ライセンスは `vendor/hls.js/` に記録し、ビルド時にも検証します。ネットワークからコードを取得するビルド手順は不要です。

## 文書・コミット・Issueの役割

| 記録 | 内容 |
| --- | --- |
| `CHANGELOG.md` | 版ごとの利用者向け変更と既知の制限 |
| `docs/TASKS.md` | 安定したタスクID、受け入れ条件、検証、現在の状態 |
| `docs/BACKLOG.md` | 調査候補や優先順の詳しい背景 |
| 版別の `docs/*.md` | 問題、判断理由、検証結果、残作業 |
| Gitコミット | レビュー可能な変更単位。必要に応じて `NRN-001` 等を記載 |
| 将来のGitHub Issue / PR | 公開後の相談・レビュー・変更の追跡。作成時にタスクIDを相互参照 |

コミット件数をタスク完了数とは扱いません。コミットの短縮ハッシュは履歴整理で変わるため、タスクIDを主な参照にします。Issue番号は実際に作成されるまで付けません。テンプレートの追加はIssueやPRの作成・送信ではありません。

## プライバシーと公開前の確認

- fixtureには架空の名前・ID・検索条件を使います。利用者の画面資料・生HTML・HAR・生ログ・認証情報・署名付きメディアURL・閲覧履歴は追加しません。
- 不具合報告には再現手順と匿名診断を優先します。画像が必要なら問題箇所だけを切り出し、名前・ID・URL・検索語・アカウント情報を消してください。匿名診断も貼り付け前に内容を確認します。
- `check-privacy.mjs` は現在のファイルに対するパターン検査です。検出されない個人情報やGitの過去履歴まで安全であることは保証しません。差分・文書・fixtureも目視確認します。
- 公開前の履歴整理は [NRN-005](docs/TASKS.md#nrn-005) で管理します。現在の変更と共有履歴を保全しながら、承認済みの個人情報除去・再検証を完了させます。GitHubへの送信・公開設定変更はその後の最終工程です。

履歴整理後は新しいフォルダーへクローンし、基本検証と必要なブラウザ試験をやり直します。ローカル確認の例は `git clone --no-hardlinks . ../nrn-clean-check` です。プライバシー検査を通すために検査条件だけを弱める変更はしないでください。

送信前は `check-privacy-history.mjs` で送信する先端から到達する履歴・コミットのメールも検査します。対象を選ばず全ブランチやタグを送信しないでください。ローカルで判明した非公開語句は環境変数 `NRN_PRIVATE_TERMS` に改行区切りで渡して検査でき、語句そのものは出力しません。これも目視確認やGitHub側の旧参照・キャッシュ削除の代わりにはなりません。
