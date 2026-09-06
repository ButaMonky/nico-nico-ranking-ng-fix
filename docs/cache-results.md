# 詳細キャッシュのテストと分割

2026-09-06。main-inventory.mdの次回仕様を実施。

tests/cache.test.mjsで時刻・sessionStorageを代役にし、保存key/schema、再読込、同一サービス再利用/configure、削除/clear、TTLちょうどと超過、100件上限の古い項目削除、破損JSON/schema不一致、保存失敗後のメモリ内利用、設定上下限を原本/生成物で確認。先行コミットa3b397a。

src/data/detail-cache.jsへgetNnrSessionDetailCacheの全定義を無変換抽出。Main冒頭をsrc/legacy/main-prefix.jsへ保存し、元位置にcacheを連結。setupAutoFill以降はsrc/legacy/main.jsに保持。既存クロージャ・window singleton・保存タイミングを維持。cacheからMovieへの反映処理は今回変更していない。

変更前/後67件PASS、FAIL/SKIP 0。構文2件PASS。原本と生成物は463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で完全一致。末尾空行は元のまま保持する。

実ブラウザsessionStorage、実アカウント設定、cache復元→NG→AutoFill統合は未検証。今回のテストは保存サービスの契約に限定。Main全体の独立化は未完了。

次はSPAページ遷移監視を、履歴操作/URL変更/reload予約/設定OFFの模擬環境でテストして分割する。非同期とブラウザ状態を扱うため推奨はAstra中。原本と完全一致する機械的移設だけなら軽でも可能だが、次回は境界テスト作成を含む。今後も作業前に難度と推奨推論レベルを説明する（本プロジェクトでの運用方針）。

ユーザーの操作は次の続行依頼のみ。スクリプトの入れ替えは不要。dev0全体の実環境確認は後の工程で案内する。
