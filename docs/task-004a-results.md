# Task 004A — 論理ルールの機械的抽出

2026-09-06。前回のTask 004準備仕様に従い、AdvancedNgRulesの定義を別ファイルへ移した。NGアルゴリズム・入力・戻り値・通知順は変更していない。

## 変更

- src/ng/logic-rules.js: 原本966～1357行をバイトコピー。
- src/legacy/before-ng.js: 原本688～965行（ThumbInfo/Tag/Contributorと既存コメント）を無変更で保持。
- src/legacy/remainder.js: 原本1358行以降を無変更で保持。
- scripts/build.mjs: 追加断片を元の位置・順番で連結。
- README.mdと本報告: 現在の構成と結果を記録。

import/exportは追加していない。元のIIFEスコープと定義順を維持し、Movieからの呼び出しも変更していない。baseline、イベント/保存/設定のソース、テスト期待値は無変更。

## 検証

変更前25件PASS。変更後25件PASS、FAIL/SKIP 0。baselineと生成物の構文2件PASS。build時に全断片の連結が原本とバイト一致することを確認。463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371。

Git空白検査でlogic-rules.jsの末尾空行が指摘される場合は、元の区切り空行を保持した結果として扱う。原本との一致を優先し削除しない。

実ニコニコ画面、実GM API、広告通信、cache/AutoFill統合は未検証。今回の合格は機械的抽出と既存自動試験の範囲であり、dev0全体の合格ではない。

## 次の作業

dev0では引き続き機械的分割を優先する。次はTask 005AとしてThumbInfo（動画詳細情報の取得）を対象に、要求重複抑止、同時実行上限、成功/失敗通知を通信の代役を使ってテストする準備と変更範囲の確定を行う。実通信や取得方式の改善は行わない。Data Source統一はdev2、Evaluator純化（004B）はdev1に残す。

利用中のスクリプトの入れ替えは不要。Task 005Aは未着手。
