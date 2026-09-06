# 表示状態分割・残作業の見通し

2026-09-06。MovieViewMode/MovieViewModes（原本1625～1718行）をsrc/ui/view-state.jsへ無変換で移設。remainderはConfigDialog以降。buildの連結位置とREADMEを更新。baseline・判断方法・通知・テスト期待値は無変更。

変更前/後43件PASS、FAIL/SKIP 0。構文2ファイルPASS。生成物は原本と463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で完全一致。実ブラウザ/Tile/List/SPA/AutoFill統合は未検証。新断片末尾の空行は原本から維持する。

## 残作業

現在はdev0の基礎部分の機械的分割。ConfigDialog（設定画面）、DetailUiTheme、NicoPage/ListPage/SearchPage、Diagnostics、NewTabService、Controller、Main内のAutoFill/cache/API/起動が残る。Tag/Contributor等も暫定legacy配置。残る大きなremainderは原本1719～11376行であり、行数は労力や進捗率そのものではない。

計画上の仮見積もりとして、dev0の残りを次の6～8作業群にまとめることを提案する。

1. Diagnostics・NewTabServiceの分割と必要な基準確認。
2. ConfigDialog・テーマの分割と保存/UI接続確認。
3. NicoPage/ListPage/SearchPageの既存境界抽出。
4. Controller・起動接続の既存境界抽出。
5. Main内のAutoFill/cache/APIの境界整理（依存次第で複数作業）。
6. 暫定配置/依存の棚卸しとビルド再現確認。
7. 実環境回帰確認と差分対応（必要に応じ分割）。

これは会話往復数や日数の保証ではない。特にMainのクロージャ依存と実DOM試験で増える可能性があり、実装調査前の所要時間は確定できない。v16完成にはdev0以降のNG純化、Data統一、AutoFill状態管理、独立Tile/List、切替、RCが残る。RCには設計キットの実使用1週間程度という目安もある。

## 次回提案

Diagnostics・NewTabServiceを読み、必要な試験→機械的分割→検証→報告を一つの作業として進める。許可外の責務変更や挙動改善は行わない。大きな方針変更または実環境でのユーザー操作が必要になった場合だけ区切る。今回その作業は未実施。

今使っているスクリプトの入れ替えは不要。v16全体はまだ完成していない。
