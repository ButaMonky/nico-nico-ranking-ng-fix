# 原作者・同梱ライブラリ・帰属表示

原スクリプトと各ライブラリの作者・貢献者に感謝します。以下は出所と条件を確認するための一覧です。利用を推奨・承認しているという意味ではありません。

| 対象 | 版・著作権表示 | 根拠 |
| --- | --- | --- |
| Nico Nico Ranking NG | 原作者 kengo321 / MIT | [原配布元](https://greasyfork.org/ja/scripts/880-nico-nico-ranking-ng)、原スクリプトのMITメタデータ |
| d3-dsv | 1.0.0 / Copyright 2013–2016 Mike Bostock / BSD-3-Clause | [該当版LICENSE](https://github.com/d3/d3-dsv/blob/v1.0.0/LICENSE)、[同梱本文](vendor/d3-dsv/LICENSE) |
| HLS.js | 1.6.19 / Copyright 2017 Dailymotion、2013–2015 Brightcove / Apache-2.0 | [該当版](https://github.com/video-dev/hls.js/tree/v1.6.19)、[同梱案内](vendor/hls.js/README.md) |
| eventemitter3 | 5.0.1 / Copyright 2014 Arnout Kazemier / MIT | [同梱LICENSE](vendor/hls.js/dependencies/eventemitter3/LICENSE) |
| url-toolkit | 2.2.5 / Copyright 2016 Tom Jenkinson / Apache-2.0 | [同梱LICENSE](vendor/hls.js/dependencies/url-toolkit/LICENSE) |
| @svta/common-media-library | 0.17.1 / Copyright 2023 Streaming Video Technology Alliance / Apache-2.0ほか | [同梱LICENSE](vendor/hls.js/dependencies/common-media-library/LICENSE)、[上流NOTICE全文](vendor/hls.js/dependencies/common-media-library/NOTICE) |
| structured-field-values由来部分 | Copyright 2020 Jxck / MIT | 上記SVTA NOTICE。HLSに内包された構造化フィールドの処理に含まれる |
| UTF変換部分 | Copyright 1999 Masanao Izumo / 上流の独自許諾文 | [収録した表示](src/licenses/distribution-notice.txt)、[該当版のソース](https://cdn.jsdelivr.net/npm/@svta/common-media-library@0.17.1/dist/utils/utf8ArrayToStr.js) |

2026-09-20に、HLS.jsの公式配布物のSHA-256が本リポジトリの固定値と一致すること、および[同版のsource map](https://cdn.jsdelivr.net/npm/hls.js@1.6.19/dist/hls.min.js.map)にeventemitter3、url-toolkit、SVTAのソースが含まれることを確認しました。開発依存欄に記載されている部品でも、配布物に入るものは別に記録しています。source mapは製品へ同梱していません。

d3-dsvの同梱部分は、原配布元v67にある同版のブロックと改行の違いを除いて一致します。原配布v67と比較原本の全体が同じという意味ではありません。BSD本文は、現在の最新版ではなくv1.0.0から取得しました。

ライセンス原文の取得元とSHA-256は[manifest](vendor/third-party-manifest.json)で管理します。既存HLSファイルのハッシュは[同梱案内](vendor/hls.js/README.md)に記録しています。第三者の元の著作権表示は、利用者個人の作者・保守者紹介とは別に保持します。

ニコニコ・X等の名称、ロゴ、アイコン、サイト由来要素を、このプロジェクトが所有するものとは扱いません。未確認の条件と対象は[ライセンスの適用範囲](LICENSING.md#確認が残るもの)を参照してください。
