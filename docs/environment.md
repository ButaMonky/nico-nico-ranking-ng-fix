# 実行環境

- 確認日: 2026-09-06、Windows、PowerShell。
- Node.js: v24.19.0。`.node-version` とpackage.jsonで指定。
- Node実体: `%USERPROFILE%/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。
- Git: `C:/Program Files/Git/cmd/git.exe`。既存リポジトリがないことを確認しdevelopment内で初期化。
- Git版: 2.55.0.windows.5。作成者情報はユーザーの回答に基づきこのリポジトリ内だけへ設定。グローバル設定は変更していない。
- npm: PATH上および確認したランタイム内に見つからず。Node標準機能による同一処理を直接実行する。npm実行は未検証。
- 外部依存なし。package-lockやnpm installは不要。実装はNode標準テストランナー・ファイル操作・SHA-256・構文チェックのみ。
- ブラウザ、userscript manager、サイト上の挙動は今回未検証。

ランタイム配置は端末依存です。別端末では同じ版のnodeをPATHに用意してREADME手順を実行します。環境を変える場合は版を記録して再検証します。
