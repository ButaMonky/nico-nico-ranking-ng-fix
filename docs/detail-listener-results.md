# 取得情報の接続部分 — 分割結果

2026-09-06。detail-model-preparation.mdの確定範囲を実施。

## 変更

- src/legacy/thumb-info-listener.js: 原本1556～1624行を無変換で抽出。
- src/legacy/movie-models.js: 原本1358～1555行のMovie/Moviesを元の順で保持する前方断片。責務・実装は変更なし。
- src/legacy/remainder.js: 原本1625行以降のMovieViewMode以降を維持。
- scripts/build.mjs: 元の位置へ2断片を連結。
- READMEと本報告を更新。

legacy配置は意図的。Tag/Contributor/Movies/NG設定への既存依存を維持し、純粋Data/Core化は行わない。共有Mapの生成場所と寿命、成功/失敗通知順、タイトル保持、未登録IDの例外も無変更。

## 検証

変更前37件PASS、変更後37件PASS、FAIL/SKIP 0。構文はbaseline/生成物の2ファイルPASS。生成物は原本と全バイト一致し463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371。baselineとテスト期待値は変更なし。

抽出断片の末尾空行は原本の区切りを保持するため削除しない。Git空白検査の該当指摘は許容する。実ブラウザ、実通信、cache/AutoFill/SPA統合は未検証。dev0全体の合格ではない。

## 次の準備

MovieViewMode/MovieViewModesの表示状態（通常・縮小・非表示）を対象に、NG/訪問済み/投稿者種別の設定による優先順位、変更通知、表示順をテストで固定する。Tile/List切替とは別の既存モデルであり、混同しない。次回は試験と分割範囲の確定のみ。UI描画や判定方式は変えない。

次工程は未着手。利用者の操作やスクリプト入れ替えは不要。
