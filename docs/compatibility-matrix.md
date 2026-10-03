# 対応画面マトリクス（BRUSH-045）

作成: 2026-10-03 claude-code（Lane C）。対象: integration/brush 9952484 + Lane C（BRUSH-016 / 037 / 036）。

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
| ランキング（/ranking/genre…） | live未確認（offline はページ種別判定とSPA起動のみ） | pages.test（/ranking/genre/all を対象、/ranking 単体は対象外と判定）、navigation.test | ランキングのカードDOMを使ったブラウザ試験は無い。@match は *://www.nicovideo.jp/ranking*。For you・カスタムランキング等は未確認（distribution-16025） |
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
| hybrid（Snapshot一括＋getthumbinfo確定） | 部分対応（offline単体のみ）／live未確認 | network.test（Snapshot検証・不一致時 fallback）、snapshot-metadata.test（null/欠落を unknown） | ブラウザ試験なし。Snapshot候補の数値は `__nrnSearchItem` 経由のモデル反映が未配線で unknown のまま（FINAL-REPORT） |
| snapshot（API で事前NG、残りだけ getthumbinfo） | 部分対応（offline単体のみ）／live未確認 | 同上 | 同上。pageContributorCount 利用時の扱いは snapshot-source の分岐あり |

## NG 判定・条件

| 対象 | 状態 | 根拠 | 備考 |
|---|---|---|---|
| 基本NG（動画ID・タイトル・タグ・ロックタグ・投稿者ID/名・チャンネルID） | offline確認済み／live未確認 | core / ng / baseline（v14.1 互換）tests | |
| 複合NG（AND/OR/NOT・三値） | offline確認済み／live未確認 | logic-boundary、metadata-readiness、test-rule-editor | |
| 数値条件（いいね・再生・コメント・マイリスト・動画時間）BRUSH-016 | offline確認済み／live未確認 | numeric-ng.test（9）、rule-editor-numeric.test、test-rule-editor-numeric | 値は検索結果/サーバー応答由来のみ。無い動画は判定保留。Snapshot経由の追加カードは現在 unknown |
| 投稿日条件（registeredAtMs） | 未対応 | — | BRUSH-016b として保留 |
| 補完投稿者（nicoad / Snapshot）でのNG | offline確認済み／live未確認 | metadata-readiness（BRUSH-017 マトリクス）、owner-name-source、snapshot-owner-source | |
| 投稿者アイコン | offline確認済み／live未確認 | owner-icon.test、test-card-enhancements | blank.jpg 実在・実APIのURL形・lazy GET 数は live pending（BRUSH-012） |
| 自己広告警告（advertiser） | offline確認済み（単体）／live未確認 | ng.test（setNicoadSelfAdResult）、metadata-readiness | 実APIの /thanks は未確認 |

## 実サイト確認が必要なもの（優先順の提案）
1. ランキング・タグ・キーワード検索で、リスト/タイル各1ページの表示とNG（既定設定）
2. AutoFill（legacy）で追加カードの順序・NG・SPA遷移後の停止
3. hybrid / snapshot の候補取得と fallback
4. 数値条件（いいね数など）が通常カードで判定されること、AutoFill追加カードで保留になること
5. 投稿者アイコンの4項目（BRUSH-012 live pending）

## この表の根拠となる試験件数
Lane C（BRUSH-016 / 037 / 036）適用後: Node 単体 356 件、offline ブラウザ試験 24 本（Edge・通信遮断・合成データ）。いずれも実サイト確認ではない。
実サイトで確認した項目は、確認日・ブラウザ・拡張・ページURLの種類（検索語などの個人情報は書かない）を添えて「確認済み」に移す。
