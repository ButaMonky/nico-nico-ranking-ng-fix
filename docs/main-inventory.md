# Main内部の棚卸しとdev0残作業

2026-09-06。src/legacy/main.jsの関数定義、共有状態、主な呼出経路を静的確認。本体・ビルド・テストは変更していない。以下の行番号はこの時点の同ファイルを指す。

## 結論

最初に詳細cache保存サービス、次にSPA監視を機械的抽出する。setupAutoFill内部のAPI/NG/描画を直ちに独立サービス化しない。そこは共有状態と副作用が強く、責務分離はdev1以降の設計変更として扱う。

ファイルを連結して同じクロージャを維持する方法なら、関数定義全体を移してもバイト一致を保てる。ただし独立モジュールになったわけではなく、依存禁止規則の最終達成とも区別する。

## 責務と依存

| 現行範囲 | 責務/状態 | 依存・注意 |
|---|---|---|
| 26～158 | カード/モデル/表示接続、GM API選択 | Movie等、NicoPage、page/controller、DOM。生成・購読順維持 |
| 159～193 | ステータスバッジ | doc.body、CSS、DOM。UI配置候補だが無変換で保持 |
| 194～324 | getNnrSessionDetailCache | config、window singleton、sessionStorage、Date、console。AutoFill状態には直接依存しない |
| 325～3959 | setupAutoFill全体 | model/page/controller、Main.setup、cache、status、GM、DOM、タイマー。巨大な共有クロージャ |
| 3968～4110 | SPA guard | window/document/location/history/URL、interval/timeout。初期化前設置・後からarmed |
| 4111～4179 | domContentLoaded | CSS→Config.sync→テーマ→model/controller→タブサービス→表示/ThumbInfo→Observer→AutoFill→SPA設定 |
| 4180～4198 | getPage | URLだけでなく現行/旧カードDOMで判別。現行search/tagもListPage |
| 4199～4235 | 未判定非表示CSSとmain | SPA監視設置→非表示CSS→ready判定/DOMContentLoaded。document-startの順を維持 |

## setupAutoFill内部

| 処理 | 主な位置 | 共有/副作用 |
|---|---|---|
| 広告取得・照合・警告 | 334～694 | GM、自己広告Map、Movie更新、DOM装飾、NG設定参照 |
| 状態/表示数 | 704～953 | badge、phase、original/known IDs、candidatePool、fetching/initialized/gaveUp、DOM可視性 |
| 診断/待機 | 954～1385 | 同じ状態の読み取り、ステータスDOM、タイマー、Movie完了待ち |
| Snapshot | 1427～1861 | URL条件翻訳、offset、検証結果、fallback、事前NG。取得だけではない |
| ページャー | 1862～2296 | 取得済みページSet、最終ページ、DOM href/属性の書換えと復元 |
| 候補取得 | 2297～2453 | page.fetchPageItems、Snapshot、candidatePool、重複/上限/順序 |
| cache適用 | 2498～2613 | Movie存在/完了確認、ThumbInfoListenerで反映、NG理由と統計 |
| 詳細判定batch | 2614～2824 | 判定前にpage._createInjectedTile→Main.setup→cache復元→ThumbInfo→広告→余剰調整 |
| 補充ループ | 2825～3048 | 可視数/目標/上限/最終ページで進行停止。UIと状態が相互依存 |
| 開発者診断 | 3049～3610 | 同じmodel/DOM/Source。診断用取得もあり、単なるloggerとは異なる |
| 初期化/設定購読 | 3611～3959 | 初期DOM待ち、詳細取得、広告、ページャー確定、設定変更、最後にinitializeを予約 |

候補状態はsetupAutoFillのローカル変数群（715～758）が所有する。そこからData/UIへ移すと、引数・公開API・寿命・再入制御の変更が必要になる。dev0で新しい状態機械を導入しない。

## キャッシュに関する重要な区別

保存サービス（194～324）と動画への復元/NG反映（2498～2613）は別。保存サービスだけを分割する。keyはNicoNicoRankingNG:detailCache:v2、schema 2。size/diagnosticsもtrimを実行し得るので完全な無副作用読み取りではない。get/hasの期限切れでは永続化も起こる。

cache hitでも動画未登録/既に詳細完了なら適用しない。適用時はThumbInfoListener経由で現在のモデルに情報を渡す。cached.ngをそのままMovieへ代入する経路とは異なる。これを今回変更しない。

## 次回確定仕様: 詳細cache保存のテストと分割

1. 保存サービスを原本からテスト専用VMへ読み込む。sessionStorageと時刻を代役にし、実アカウントデータを使わない。
2. key/schema、set/get/delete/clear、再読込、singleton再利用とconfigureを確認する。
3. TTLちょうど/超過、件数上限と古い項目削除、破損JSON/異なるschema、保存失敗の継続を確認。現在の挙動を期待値として固定。
4. getNnrSessionDetailCache定義全体をsrc/data/detail-cache.jsへ無変換抽出。Main前後断片を残し、同一スコープ・元位置へ連結する。
5. 原本と全バイト一致、構文2ファイル、既存61件と新規テスト全PASS、差分レビュー、Git保存。

変更許可: 新しいcache断片、Main前後断片、build指定、cacheテスト/登録、README/結果報告。禁止: cache復元呼出、NG結果/期限/件数/schema/key/保存タイミング/エラー処理を変更すること。新API/DI化/最適化も対象外。

## その後のdev0残作業ゲート

1. SPA guard: URL条件/一度だけreload/hash除外/設定OFF/履歴通知を模擬環境で固定し、関数丸ごと抽出。
2. AutoFill: 外部依存と既存イベントを保つ全体抽出を先に検討。内部区分は単なる連結断片と責務分離を明示的に区別。意味を変える変更が必要ならdev0に混ぜない。
3. 起動/残配置: 冒頭・起動末尾とlegacyモデルの配置、依存例外台帳、ビルド再現確認。bootstrap純化は必要なら後続stageへ。
4. 実環境回帰: ranking/search/tag、設定保存、NG、cache、補充、ページ遷移、Tile/Listをv14.1と比較。自動試験の未検証範囲を埋める。

dev0完了時は「機械的分割完了・既存依存例外あり」と表記し、最終8区分の独立性を達成したと主張しない。機能改善はまだ行っていない。

## 今回の確認範囲と利用者への案内

静的棚卸しのみ。テスト未追加・未再実行（実装変更なし）。前回の61件PASSを今回新たな動作保証へ拡張しない。全体進捗の約2割/dev0約6割という前回の粗い目安は据え置き、分析文書作成だけで進捗を水増ししない。

次は「キャッシュのテストと分割を進めてください」と依頼すればよい。ユーザーのスクリプト入替や実画面操作はまだ不要。実環境ゲートでは具体的な確認手順を提示する。
