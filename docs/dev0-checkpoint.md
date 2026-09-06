# dev0機械的分割のチェックポイント

2026-09-07。細分化した確認待ちをやめ、ナビゲーション試験・Mainの大区分抽出・依存例外台帳・再現検証を一括実施する。

## 今回の変更

- tests/navigation.test.mjs: 原本/生成物それぞれで未armed、OFF、hashのみ、watchへの遷移、push/replace、連続遷移の1回reload、popstate、poll、二重installを確認。実ブラウザを操作せず仮想タイマー/履歴を使用。先行コミットe63c62f。
- src/nico/navigation.js: setupSpaNavigationGuardを元のまま抽出。
- src/autofill/legacy-controller.js: setupAutoFill全体を元のまま保持。後続の既存コメントも保持。
- src/app/bootstrap.js: domContentLoaded/getPage/非表示CSS/mainとMain IIFE末尾を保持。
- src/legacy/main.jsを上記で置換しbuild指定を更新。原本と通知順、変数スコープ、起動順は変更なし。

## 検証

分割前/後71件PASS、FAIL/SKIP 0。構文2件PASS。生成物は原本と完全一致: 463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371。末尾の区切り空行は原本の一部として維持する。コミット884e89fを../dev0-checkpoint-verificationへgit clone --no-hardlinksし、READMEどおりbuild/check/testを再実行して71件と構文2件が再成功。作業コピーのGit差分なし。

## 依存例外台帳

| 対象 | 現在残した依存 | 後続段階 |
|---|---|---|
| legacy/before-ng.js・movie-models.js | Tag/Contributor/Movie/MoviesにNG状態と設定購読が残る | dev1 |
| legacy/thumb-info-listener.js | 取得結果→共有モデル→NG設定接続 | dev1/2 |
| autofill/legacy-controller.js | DOM・API・広告・NG・ページャー・診断が同一クロージャ | dev2/3以降 |
| nico/page-adapter・list-page・search-page | DOM読込/生成、取得、表示責務が混在 | dev2/4/5 |
| app/controller.js | 操作・NG登録・レイアウト診断が混在 | 各対象stage |
| legacy/main-prefix.js | Main IIFE開始とカード生成、モデル接続、GM選択 | 接続層再設計時 |
| data/detail-cache.js・nico/navigation.js等 | ファイルは分離したがMainスコープ内へ連結 | 対応stage |
| diagnostics/logger.js | window/locationとログ履歴。能動診断はAutoFill内 | Diagnostics再設計時 |

ファイルが8区分のフォルダーにあるだけで、8区分が独立したとは扱わない。Mainが単なるbootstrapになったとも扱わない。巨大関数を小断片に切るだけで進捗を増やさない。

## 完了判定

主要定義とMainの大区分を元順序で別ファイルにした機械的整理は一区切り。dev0全体の合格はまだ保留。実環境ゲートと未検証機能の確認が必要。現行バイト一致は同じ実行コードを保つ強い証拠だが、ライブサイトで現在正常動作することの証明ではない。

次に必要なのは、独立RendererやNG純化へ急ぐことではなく、ユーザーの実行環境・再現可能なURL・既知症状を確認してmanual-checklistを具体化すること。現在の原本と生成物が同一なので、このチェックポイントのためだけにインストールを入れ替える必要はない。

## 実画面確認の入口

ユーザーにブラウザ名、userscript manager名（Tampermonkey等）、現在のv14.1に困る症状があるかを確認する。次に実際に使うranking/search/tagのURLを選び、NG/詳細/補充/遷移/表示切替の記録を作る。未提供の環境を推測して合格させない。

モデル: 次の統合確認・設計判断はAstra中を推奨。仕様確定後の単純な無変換移設は軽でよい。レベル変更の必要性は作業開始前に説明する。
