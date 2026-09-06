# Controller・起動境界の分割と全体進捗

2026-09-06。操作処理ControllerとMain、末尾のMain.main()呼出を既存境界で分割。

## 実施

tests/controller.test.mjsでchange/clickの購読と、3設定への入力振り分け・無関係入力の無視を原本/生成物で確認。先行コミット91535cf。

src/app/controller.jsへController、src/legacy/main.jsへMainをそのまま移設。src/app/start.jsは末尾の起動呼出と外側IIFE閉じを保持。remainderを削除しbuildの元順序へ連結。Main内部の起動順・関数・クロージャは変更なし。Mainを小さなbootstrapへ再設計したわけではない。

変更前/後61件PASS、FAIL/SKIP 0。構文2件PASS。原本と生成物は463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371で完全一致。baseline/期待値/保存形式/NG/DOMは変更なし。末尾区切り空行は維持。

## 限界

Main全体はNodeで実行していない。実ブラウザ起動、操作全般、SPA、AutoFill/cache/API統合は未検証。起動が実環境で合格したという報告ではない。Controllerのapp配置も暫定で、内部UI責務は現行のまま。

## 進捗の目安

厳密な工数見積もりは未作成。次の割合は作業項目に基づく粗い説明用目安であり、行数割合や納期保証ではない。

- dev0の整理・検証: 約6割を目安。主要定義の機械的抽出は進んだが、Main内のAutoFill/cache/API接続、legacy配置の棚卸し、実環境回帰が残る。
- v16全体: 約2割を目安。NG純化、Data統一、AutoFill状態機械、独立Tile/List、切替とRCが後続に残る。機能改善はまだ実施していない。

この数値は前回の6～8作業群という仮見積もりを達成率とみなしたものではない。Main調査と実環境試験で必要作業量が変わるため、次の節目で更新する。

## 次回

Main内を読み、キャッシュ・API・AutoFill・起動の依存と状態の所有者を棚卸しする。無変換で抽出できる部分と、後続stageの設計変更が必要な部分を区別してdev0残作業を確定する。巨大関数を一度に再設計しない。次回は設計判断を伴うためAstra中を推奨する（プロジェクト上の判断）。

ユーザーの操作/スクリプト入れ替えはまだ不要。次の棚卸しを依頼すればよい。実画面試験時には画面・操作・期待結果を別途示す。
