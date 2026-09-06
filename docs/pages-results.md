# ページ処理の機械的分割

2026-09-06。NicoPage/ListPage/SearchPageを既存定義の境界で分割。責務の再設計は行っていない。

## 変更

src/legacy/page-ui.jsの全バイトを、src/nico/page-adapter.js、list-page.js、search-page.jsへ元順で配置。旧断片を削除しbuildの参照を更新。CSS/DOM解析/取得/描画が混在する既存内部構造は維持。ListPageはリスト表示専用Rendererではない。SearchPageへの参照は元のIIFEスコープで解決する。

## テストと結果

tests/pages.test.mjsを先行追加（a39c6cc）。URL述語のranking/search/tag/watchと末尾スラッシュの差、詳細切替要素の登録/解除、広告の非表示→表示の判定を原本/生成物で確認。HTTP要求や実DOM解析は試験していない。

分割前/後59件PASS、FAIL/SKIP 0。構文2ファイルPASS。生成物は原本と463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で完全一致。既存区切り空行を維持するため、Git空白検査の末尾空行指摘は修正しない。

baseline/NG条件/保存形式/取得順/UIデザイン/テスト期待値は無変更。現行・旧検索ページの実ブラウザ操作、DOM全件解析、pager/AutoFill/SPA統合は未検証。URL述語テストだけでMainの実ページ選択を全面検証したとは扱わない。

## 次の作業

ControllerとMainの起動接続を確認する。まず既存境界での抽出可否と初期化順を調べ、限定的な自動検証と機械的抽出を行う。Main内部のAutoFill/cache/APIを即座に責務分離しない。これら巨大なクロージャ内部の整理と実環境確認は残る。

ユーザーは続行を依頼するだけでよい。利用中スクリプトを入れ替える必要はない。実画面の確認が必要な段階では、URL・操作・期待する結果を別途案内する。
