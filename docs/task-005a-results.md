# Task 005A — 動画情報取得定義の抽出

2026-09-06。準備仕様に従いThumbInfoだけを機械的に分割した。

変更: src/data/thumb-info-source.jsへ原本688～848行をバイトコピー。src/legacy/before-ng.jsは原本849行以降のTag/Contributor等を維持。scripts/build.mjsの元位置へ新断片を挿入。READMEと本報告を更新。

通信URL、timeout、再試行、要求順、同時取得数、XML解析、通知処理、NG判定は変更していない。EventEmitter/createObjectへの依存とIIFEスコープも維持。baselineとテスト期待値は変更なし。

## 検証

変更前33件PASS。変更後33件PASS、FAIL/SKIP 0。baselineと生成物の構文2ファイルPASS。buildで連結後の全バイトが原本と一致することを確認。463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371。

新断片の末尾空行は原本の境界を保持したもの。Git空白検査が指摘しても変更しない。

実HTTP/GM API、ブラウザXML解析、実サイト、cache/AutoFill統合は未検証。模擬通信の試験を実通信の試験と扱わない。dev0全体の完了を意味しない。

## 次の準備

取得した情報を動画モデルへ反映するThumbInfoListenerと、Tag/Contributor/Movie/Moviesの責務・依存を確認する。詳細成功/失敗、共有タグ・投稿者、設定変更、重複動画ID、通知順を既存試験と照合し、不足試験を追加してから機械的抽出の範囲を決める。純粋モデル化やNG責務移動は行わない。

次の準備は今回未着手。ユーザー操作やスクリプト入れ替えは不要。
