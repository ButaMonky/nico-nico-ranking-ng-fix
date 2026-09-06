# 動画モデル反映の準備結果

2026-09-06。tests/ng.test.mjsに2シナリオを追加し、原本と生成物の双方で確認。本体は変更なし。

## 確認事項

- 成功通知の順序は説明文→タグ→投稿者→詳細完了。完了フラグは最後にtrue。
- 取得応答のタイトルでは既存Movie.titleを更新しない。
- 同名かつ同じlock状態のタグを共有。lock状態が違えば別オブジェクト。
- 同じ種別/IDの投稿者を共有し、最初の名前を保持。同じ数値IDでもuser/channelは分離。
- 通常タグNGは双方、ロックタグNGはlock=true側に反映。解除も反映。
- 同一動画IDを追加しても既存Movieを置き換えない。
- 失敗はerrorChanged→thumbInfoDoneの順。未登録IDの成功/失敗通知は例外となる現行挙動を記録。

入力・期待値はテスト内に固定し、v14.1実行で一致を確認。37件PASS、FAIL/SKIP 0。構文2件PASS。生成物は463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で原本と完全一致。

## 責務・依存

Tag/ContributorはイベントとNG状態を持つ。MovieはAdvancedNgRules/Tag/Contributorと設定変更に依存。Moviesは初期NG設定適用とID管理を担う。ThumbInfoListenerはMovies/Tag/ContributorとNG設定へ接続する。この時点で純粋Data/Coreへ移すと責務変更になるため、今回の次工程ではlegacy接続層として扱う。

## 次回の確定範囲: ThumbInfoListenerのみ抽出

目的: 原本1556～1624行のThumbInfoListener定義をsrc/legacy/thumb-info-listener.jsへバイトコピーする。Movie/Moviesは元の定義順を保つ前方断片へ、MovieViewMode以降はremainderへ残す。

許可変更: 上記新ファイル、src/legacyの前後断片、scripts/build.mjsの順次連結指定、READMEと結果報告。

禁止: 反映順、共有Mapの寿命、タイトルの扱い、未登録IDの挙動、設定接続、NG判定、通信、DOMを変更すること。Tag/Contributor/Movie/Moviesの責務移動や純粋化も今回の対象外。

完了条件: 変更前37件PASS→境界一意性確認→無変換分割→原本と生成物の完全一致→構文2件/全37件PASS→差分確認/Git保存。

## 未実施

今回分割は未実施。実通信、実ブラウザ、cacheサービス経由の復元、AutoFill/SPA統合は未検証。同じモデルへの再反映時の購読蓄積やライフサイクル改善も対象外。dev0全体の完了を意味しない。利用者操作やスクリプト入れ替えは不要。
