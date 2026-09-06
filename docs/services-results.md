# Diagnostics / NewTabService 分割結果

2026-09-06。テスト準備から分割・検証を一作業として実施。

## テスト

tests/services.test.mjsに原本/生成物の各3シナリオを追加。診断履歴300件保持・snapshot直近30件・ログ種別、新規タブAPIの旧GM→新GM→window.open優先順位と失敗、対象カード内の同一origin動画リンクだけを装飾し解除することを確認。テスト先行コミット8e24d00。

実タブは開かず、VMへAPI/DOMの代役を注入。click capture、修飾キー、MutationObserver/フレームバッチ、install再実行、実ブラウザのpopup制限は未検証。公開APIの試験を全機能試験とみなさない。

## 分割

- src/legacy/page-ui.js: ConfigDialogからDiagnostics直前までを元のまま保持。
- src/diagnostics/logger.js: Diagnostics定義を抽出。
- src/services/new-tab.js: NewTabService定義と後続の既存区切りコメントを保持。
- src/legacy/remainder.js: Controller以降。
- scripts/build.mjs: 元位置・元順序に連結。

原本、動作、版表記、通知順、グローバル公開、通信/タブAPIは変更していない。末尾空行は原本を保つため維持。

変更前/後49件PASS、FAIL/SKIP 0。構文2件PASS。生成物は原本と完全一致: 463,894 bytes、SHA-256 AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371。実サイト試験は未実施。

## 次回

設定画面ConfigDialogとDetailUiThemeを対象に、依存確認・必要な試験・機械的分割・検証をまとめて進める。画面デザインや設定の意味は変えない。UIの実動作試験が困難な項目は未検証として区別する。

## 推論レベルの推奨（プロジェクト上の判断）

原本とバイト一致させる限定的な分割・テスト実行はAstra軽。NG/AutoFillの責務変更・非同期やDOMの不具合調査・設計レビューは中。中で解決できない複雑な問題や最終設計監査は高を検討。品質はレベル名ではなくテスト・差分・実環境確認で判断する。利用制限の減少率は未確認。

OpenAI公式モデルページはlow/medium/high等の推論設定を記載している: https://developers.openai.com/api/docs/models/gpt-6-astra 。上記作業別配分は公式の保証ではなく、このプロジェクトの範囲と検証方法に基づく推奨。
