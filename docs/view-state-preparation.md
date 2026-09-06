# 表示状態の準備結果と次回仕様

2026-09-06。本体無変更。tests/view-state.test.mjsへ3シナリオを追加し、原本/生成物の両方で確認。scripts/test.mjsへ登録。

## 確認した動作

- 訪問済み縮小よりNG非表示が優先。NG表示を許可すると縮小に戻る。
- 訪問済み表示設定の変更と削除エラーを反映。一般ERRORだけでは非表示にしない（他の非表示条件がない場合）。
- 同じ状態への更新では変更通知なし。変更時の通知列を固定。
- 投稿者不明の非表示は詳細取得完了を待つ。user/channel/all設定に追従。
- MovieViewModesは同一Movieオブジェクトに同じ表示モデルを返す。同じIDでも別オブジェクトなら別扱い。
- sortは非表示を最後へ回し、各群の登録順を保持。縮小は通常表示と同じ群。集約通知の引数は状態文字列。

これはTile/List切替や実DOM描画の試験ではない。sortの結果はモデルの順序であり、サイトの表示順や取得順を変更したわけではない。

## 検証

既存37件＋3シナリオ×原本/生成物＝43件PASS、FAIL/SKIP 0。構文2ファイルPASS。buildは原本と全バイト一致（463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371）。VMにConfigDialog直前までの既存定義を読み、実際のモデル/設定/イベントで試験。通信・DOM処理は起動しない。

## 次回: 表示状態モデルの機械的抽出

MovieViewMode/MovieViewModes（原本1625～1718行）をsrc/ui/view-state.jsへバイトコピーする。src/legacy/remainder.jsはConfigDialog以降を保持。scripts/build.mjsで元位置へ連結。READMEと結果報告を更新する。

許可範囲は上記ファイルと対応テストのみ。NG判断、表示優先順位、通知、並び順、購読、CSS/DOM、Tile/List、AutoFill、設定保存、メタデータを変更しない。import/exportを導入せず元のIIFEスコープを維持する。

完了条件: 変更前43件PASS→一意なMovieViewMode/ConfigDialog境界を確認して分割→原本と生成物の完全一致→構文2件と43件PASS→差分レビュー・Git保存。改行/末尾空行を維持。

## 未実施

今回の分割は未実施。実ニコニコ画面、Tile/List切替、SPA/AutoFill統合、実GM保存は未検証。ユーザーの操作やスクリプト入れ替えは不要。dev0全体の合格ではない。
