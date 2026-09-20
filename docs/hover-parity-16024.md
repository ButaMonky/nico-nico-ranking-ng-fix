# 160.24 ホバー操作と公式非表示表示

2026-09-20。160.23を基点とする修正。GitHub未送信。

## 目的と根拠

利用者の指摘: メニューが離れても閉じない、先頭項目が常に強調される、公式カードと追加カードで音声ON/OFFが共有されない、読み込み中の小さなマウス移動で中断する、投稿者非表示後の表示が公式と異なる。非表示のAPI登録自体は利用者が成功を確認した。

提供された最新HARの公式JSを静的に読む。Buttonのhover関数はカードと関連portalを同一範囲とし、debounce200msでホバー状態を更新する。SearchVideoListSkeletonとMutedVideoThumbnailは非表示時に16:9の低強調背景・テレビSVG・固定文言を表示し、ホバー中の「…」に解除操作だけを出す。rootのPreviewVideoStoreはisMutedをメモリで共有し、localStorageには保存しない。

## 修正方針

- メニューをポインターで開くと先頭へ強制フォーカスしない。キーボードでは初期フォーカスと矢印操作を維持する。カードとメニューの両方から離れると200ms後に閉じ、戻ればタイマーを取り消す。
- 公式のテレビアイコン、背景、文言「この動画は非表示に設定されています」に揃える。元の詳細欄やバッジを隠してinertを維持し、解除は非表示カードの「…」から行う。
- 読み込み開始前の短時間ホバー待機は残す。開始済みの読み込みは同じカード内のマウス移動で破棄しない。カードから離れる・画面外・ページ終了などの既存中断条件は維持する。
- 音声状態は文書単位で共有する。公式カードの正確なプレビュー用ミュートボタンと既知SVGから状態を読み、追加カードでの明示的な切替は公式の同じボタン操作へ同期する。公式ボタンが未マウントなら意図を保持し、次回表示時に同期する。React内部・推測した保存キー・視聴ページのメディアを操作しない。
- 連続再生の詳細解析・実装は依頼どおりNRN-008に登録する。今回その再生キューの実装は拡張しない。

## 検証

新しいメニュー回帰試験は修正前に先頭項目への強制フォーカスで失敗、修正後に成功。カードからportalへの移動、範囲外での終了、短時間の復帰、キーボードによる非表示解除、テレビアイコンと16:9寸法を検査する。

プレビューは公式と追加の両方向、後から現れる公式ボタン、遅延した公式描画、SPA後の共有、対象外メディアの不変、読み込み中の同一要求維持を合成DOM・模擬メディアで検査する。

実サイトへのアクセス・アカウントへの試験書込みは行わない。音量同期は公式の既知DOMに依存するため、公式側のラベルやSVGが変更された場合は推測で他のボタンを押さず同期を行わない。実ログイン環境での最終確認は未実施。


## 追加指摘への対応

共有と広告について、独自画面・別タブに置き換えていた点を撤回。MutedVideoThumbnail、Format、Icon、Button、enumおよび保存CSSから、X/閉じるSVG、40pxの丸いボタンと24pxアイコン、共有の2行構成、URL入力の最小480px・コピーの横配置、16pxの余白と間隔を照合した。広告はtarget空文字、width428/height600/toolbar=no/scrollbars=1。Xはtarget_blank、width800/height500、screen寸法から中央位置を計算する。表示文言はSVG＋「共有」。

ダイアログは背景100msフェード、内容300msの48pxスライド＋フェード。終了中のDOMは操作不能にし、後片付けで残さない。共有中の無関係な投稿者状態GETの認証失敗で共有画面を置き換えない。

ツールチップはenumのRoot定義に従い、pointer200ms、keyboard focus即時、top/8px offset、closeDelay0、closeOnPointerDown:false、closeOnScroll:false、closeOnClick:false。Contentの8px余白・12px文字・4px角丸・tooltip色・300msフェードを採用する。button.disabledとTooltipRoot.disabledは別なので、更新中文字と実際のblur/leaveは分けて試験する。

プレビュー終了はButtonの200msホバーdebounceと、MutedVideoThumbnailのPresenceのfadeOutを比較する。保存CSSはmedium300ms/slow500ms。PreviewVideoPlayerはunmountでpause/disposeするため、フェード中も同じ映像を維持し、早い再入場と遅い再入場を区別する。関連メニュー・ダイアログはDOM識別子で元カードへ結び、別動画IDの取り違えやportal単独での再生開始を防ぐ。

音量の共有は公式DOMが初めて観測されるまで、過去の未観測な公式状態を読み出せない。正確な公式ボタンが初めて現れた時点で読み取り・同期する。これはprivate storeを直接共有できない境界として明記し、完全に同じ内部実装であるとは主張しない。

## 最終検証結果

- 再生成後の単体試験183件、構文検査、配布ツリーの個人情報パターン検査、差分の空白検査が成功。
- 外部通信を置き換えたブラウザ試験15本が成功: card-tooltip、card-interactions、card-actions、preview-card-integration、card-enhancements、result-layout、diagnostics、spa、preview-hls、hover-preview、preview-official-contract、preview-audio、preview-boundaries、preview-failure-ui、preview-hover-exit。
- 最後の内部フェードイン／外部フェードアウト分離後は、影響するpreview-hover-exit、preview-official-contract、preview-failure-uiを再実行し、生成版のpreview-card-integration、card-actions、card-interactionsも再確認した。初期フェードイン途中で退出しても不透明な映像が一瞬戻らない回帰条件を含む。
- テレビの非表示表示と共有ダイアログを合成ページで描画し確認。実際のアカウント操作や実サイトへの通信はしていない。
- 独立レビューで指摘された非表示解除時のキーボードフォーカスと、背景取得失敗による共有画面の置換を修正・回帰試験済み。最終差分に追加の重要指摘なし。
