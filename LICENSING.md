# ライセンスの適用範囲

## 本体

原スクリプトは、[kengo321氏のNico Nico Ranking NG](https://greasyfork.org/ja/scripts/880-nico-nico-ranking-ng)です。原配布ページとスクリプトのメタデータはMITを表示しています。本リポジトリの本体と独自に加えた変更も、[MIT License](LICENSE)で提供します。

MITは、条件のもとで利用・改変・再配布などを認めるライセンスです。配布時には著作権表示と許諾文・免責文を残してください。[SPDXのMIT本文](https://spdx.org/licenses/MIT.html)も参照できます。SPDXサイト自体のフッターやLinux Foundationの商標説明は、このスクリプトの著作権表示ではないためLICENSEへ取り込みません。

原作者の公開名をクレジットし、確認できない著作年を推定して書き足していません。この改変版について特定個人の継続保守を約束する表示は設けていません。原作者が本改変版を提供・承認・サポートしているという意味でもありません。

## 第三者のコード・表示

本体のMIT表記は、以下の部品を別のライセンスへ変更するものではありません。

| 部品 | 条件 | 収録場所 |
| --- | --- | --- |
| d3-dsv 1.0.0 | BSD-3-Clause | [LICENSE](vendor/d3-dsv/LICENSE) |
| HLS.js 1.6.19 | Apache-2.0、上流の帰属表示 | [上流通知](vendor/hls.js/LICENSE)・[全文](vendor/hls.js/Apache-2.0.txt) |
| HLS内包 eventemitter3 5.0.1 | MIT | [LICENSE](vendor/hls.js/dependencies/eventemitter3/LICENSE) |
| HLS内包 url-toolkit 2.2.5 | Apache-2.0 | [LICENSE](vendor/hls.js/dependencies/url-toolkit/LICENSE) |
| HLS内包 @svta/common-media-library 0.17.1 | Apache-2.0と同NOTICE内の各条件 | [LICENSE](vendor/hls.js/dependencies/common-media-library/LICENSE)・[NOTICE](vendor/hls.js/dependencies/common-media-library/NOTICE) |
| 同ライブラリのUTF変換部分 | 上流の独自の短い再配布・改変許諾文 | [配布時の表示](src/licenses/distribution-notice.txt) |

SVTAのNOTICEには、MITのstructured-field-values由来部分なども含まれます。ライブラリ全体の上流NOTICEを保存しているため、全項目の機能がこのスクリプトに入っていることを示す一覧ではありません。UTF変換の短い許諾をMITやApacheと同一とは扱いません。元の著作権者と許諾文を残し、連絡先のメールは収録していません。

単体の `.user.js` にも必要な本文と帰属表示を含めます。ビルドでライセンスの記録ファイルを照合して末尾のコメントへ収録し、HLS本体の既存通知も維持します。READMEの謝辞やリンクだけで配布時の表示を代用しません。[取得元・版・ハッシュ](vendor/third-party-manifest.json)

## 確認が残るもの

以下について、本リポジトリのMITで第三者の権利を許諾することはできません。公開資料を動作の参考にできることと、素材やコード断片の再配布条件が確認できたことは区別します。

- **ニコニコ公式由来のSVG・表示素材等**：`src/ui/card-actions.js` のアイコン定義、設定画面などのSVG、公式定義を照合した表示要素。動作や配置を再実装した部分と、形状等を取り込んだ部分の区分・利用条件の確認が残っています。
- **過去のスタイルの取り込み**：原配布元のv14の記録に「ニコニコ動画 ランキング ナンバリング」の取り込みがあります。その元条件と、現在も残る範囲の確認は未完了です。
- **継承したUTF変換の利用文**：再配布・改変可の記述は確認できましたが、独自文言と参照元を含めた整理を、配布物全体の権利確認完了と同一には扱いません。

この記載自体が未確認部分の再配布許諾になるわけではありません。確認は[NRN-009](docs/TASKS.md#nrn-009)で管理します。未確認部分を独断で別の絵やUIへ置き換えて、本来の動作・外観を変えることもしません。

比較原本 `baseline/` は受領時の内容とハッシュを保持します。今回追加した文書はその付属資料であり、原本の本文を書き換えるものではありません。
