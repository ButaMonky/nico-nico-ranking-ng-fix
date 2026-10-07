# 対応画面マトリクス（BRUSH-045）

作成: 2026-10-03 claude-code（Lane C）。更新: 2026-10-07 BRUSH-058。対象: local integration/brush a74efa3（160.30、BRUSH-050 / BRUSH-057 を含む）。

## 状態の定義

| 状態 | 意味 |
|---|---|
| 確認済み | 現行ビルドを実サイト（ログイン状態のブラウザ＋ユーザースクリプト管理拡張）で動かし、記録が残っているもの |
| offline確認済み | 固定HTML・合成データ・通信遮断のブラウザ試験、またはNode単体試験で確認済み。実サイトでは未確認 |
| live未確認 | 実装はあるが、現行ビルドの実サイト確認記録がない（offline試験も無いか、間接的） |
| 部分対応 | 一部の条件・形式だけ対応。範囲を備考に記載 |
| 未対応 | 対象外、または実装なし |

**現時点で「確認済み」の項目はありません。** 160.x までの公開版は利用されてきましたが、この協業（integration/brush）のビルドを実サイトで確認した記録はありません。過去版の記録（160.24 の模擬ブラウザ21本など）を現行ビルドの実サイト確認として流用しません（docs/distribution-16025.md / 16026.md と同じ方針）。

## 画面・表示形式

| 対象 | 状態 | 根拠（試験） | 備考 |
|---|---|---|---|
| ランキング（/ranking/genre…） | offline確認済み／live未確認 | pages.test、navigation.test | route判定とSPA遷移を回帰確認。genreカードそのものを使った専用offline browser fixtureはまだ無く、実サイト上のuserscript動作も未確認。 |
| カスタムランキング（/ranking/custom） | offline確認済み／live未確認 | test-ranking-custom、pages.test、navigation.test | BRUSH-057。通常動画カードだけを解析し、promoted/native枠を除外。5スロットの寸法を維持してNG非表示し、flat AutoFillは無効化。custom↔genre SPA遷移も回帰確認。 |
| タグ検索（/tag/…） | offline確認済み／live未確認 | navigation.test、test-spa、pages.test、test-pager-journey | |
| キーワード検索（/search/…） | offline確認済み／live未確認 | navigation.test、test-spa、pages.test | |
| リスト表示 | offline確認済み／live未確認 | test-result-layout（取得済みリストHTML、320px サムネイル、置換追従） | 実サイトCSS全体・旧UIは未確認（list-tile-fix.md） |
| タイル表示 | offline確認済み／live未確認 | test-result-layout（リスト⇔タイル切替） | 同上 |
| 通常カード | offline確認済み／live未確認 | test-card-enhancements、test-card-actions、test-card-interactions、test-card-tooltip | |
| ニコニ広告カード（decoration） | offline確認済み／live未確認 | test-card-enhancements（外側の広告アンカー）、network.test（装飾取得のSPA破棄） | 装飾判定は nicoad contents API。広告者一覧（/thanks）は Lane B 担当 |
| AutoFill追加カード | offline確認済み／live未確認 | test-autofill-prefilter、test-autofill-early-stop、autofill-* tests、benchmark-autofill（合成） | 速度・通信量は合成データの値（FINAL-REPORT） |
| SPA遷移後 | offline確認済み／live未確認 | test-spa、navigation.test、autofill-cancellation.test、test-metadata-readiness（旧SPA応答の無視） | サイトのルーター実装変更には追従確認が必要 |
| モバイル版サイト | 未対応 | — | @match は www.nicovideo.jp の ranking / search / tag のみ |
| ショート動画・個別形式のランキング | live未確認 | — | 対応確認していない（distribution-16025） |

## 取得方式（autoFillInfoMode）

| 方式 | 状態 | 根拠 | 備考 |
|---|---|---|---|
| legacy（ページHTML＋getthumbinfo） | offline確認済み／live未確認 | AutoFill browser試験・benchmark は legacy | 既定値 |
| hybrid（Snapshot一括＋getthumbinfo確定） | 部分対応（offline確認済み）／live未確認 | network.test（Snapshot検証・不一致時 fallback）、snapshot-metadata.test（null/欠落を unknown）、BRUSH-050 | 実サイト未確認。BRUSH-050でSnapshot候補の正規化済み数値metadataを `__nrnSearchItem` 経由でモデルへ反映する配線を追加済み。欠落値は引き続き unknown。 |
| snapshot（API で事前NG、残りだけ getthumbinfo） | 部分対応（offline確認済み）／live未確認 | 同上、BRUSH-050 | Snapshot候補の数値metadataはBRUSH-050でモデル配線済み。pageContributorCount利用時の扱いは snapshot-source の分岐あり。 |

## NG 判定・条件

| 対象 | 状態 | 根拠 | 備考 |
|---|---|---|---|
| 基本NG（動画ID・タイトル・タグ・ロックタグ・投稿者ID/名・チャンネルID） | offline確認済み／live未確認 | core / ng / baseline（v14.1 互換）tests | |
| 複合NG（AND/OR/NOT・三値） | offline確認済み／live未確認 | logic-boundary、metadata-readiness、test-rule-editor | |
| 数値条件（いいね・再生・コメント・マイリスト・動画時間）BRUSH-016 | offline確認済み／live未確認 | numeric-ng.test、rule-editor-numeric.test、test-rule-editor-numeric、BRUSH-050回帰 | 検索/サーバー応答に加え、BRUSH-050でSnapshot添付 `__nrnSearchItem` の正規化済み数値もモデルへ反映。値が欠落・不正なら判定保留（unknown）を維持。 |
| 投稿日条件（registeredAtMs） | 未対応 | — | BRUSH-016b として保留 |
| 補完投稿者（nicoad / Snapshot）でのNG | offline確認済み／live未確認 | metadata-readiness（BRUSH-017 マトリクス）、owner-name-source、snapshot-owner-source | |
| 投稿者アイコン | offline確認済み／live未確認 | owner-icon.test、test-card-enhancements | blank.jpg 実在・実APIのURL形・lazy GET 数は live pending（BRUSH-012） |
| 自己広告警告（advertiser） | offline確認済み（単体）／live未確認 | ng.test（setNicoadSelfAdResult）、metadata-readiness | 実APIの /thanks は未確認 |

## 実サイト確認が必要なもの（優先順の提案）
1. ランキング・タグ・キーワード検索で、リスト/タイル各1ページの表示とNG（既定設定）
2. AutoFill（legacy）で追加カードの順序・NG・SPA遷移後の停止
3. hybrid / snapshot の候補取得と fallback
4. 数値条件（いいね数など）が通常カードとSnapshot追加カードで正しく判定され、値が欠落した場合だけ保留になること
5. 投稿者アイコンの4項目（BRUSH-012 live pending）

## この表の根拠となる試験件数
160.30 / BRUSH-057 統合時点: full Node 374/374 PASS、offline ブラウザ試験 31/31 PASS（Edge・通信遮断・合成データ。初回にcard-budget timeout flake 1件を別記録し、完全rerunは31/31）。いずれも実サイト上のuserscript動作確認ではない。
実サイトで確認した項目は、確認日・ブラウザ・拡張・ページURLの種類（検索語などの個人情報は書かない）を添えて「確認済み」に移す。
