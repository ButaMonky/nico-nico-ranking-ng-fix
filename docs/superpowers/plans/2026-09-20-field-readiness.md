# 項目別取得状態と個別通信省略 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 信頼できる取得済み情報で現在のNG条件と表示を満たせる場合に、個別通信を省く。

**Architecture:** Movieに項目別のunknown/known/failed状態を持たせる。投稿者証拠の正規化と優先順位を維持し、ルールと表示から不足項目を計算する。取得終了と必要項目の充足は別に扱う。

**Tech Stack:** 既存JavaScript断片、Node.js 24のnode:test、既存ブラウザ試験。

**Spec:** 2026-09-20の利用者指示、および研究R25（1799cb7）のNG-UPDATE-READINESS / IMPLEMENTATION-HANDOFF。製品基準は43bc180（160.11）。研究ブランチの製品実装への取り込みは行わない。

## Global Constraints

- snapshot/playlist一括補完は次段階。外部APIの追加大量照会は行わない。
- hiddenは退会を意味しない。型不明・矛盾・無効ID・動画不一致は採用しない。
- unknownを空としない。三値AND/OR/NOTとnotExistsを維持する。
- 既存worktreeや未確定変更に触れない。認証情報・個人環境情報を成果物に保存しない。

## Review Focus

- ID既知でも名前null・タグ未知なら、その条件はunknown。
- 同じ数値のuser/channelを混同しない。
- 設定変更や詳細欄を開いた操作で必要になった項目を取得する。
- 破棄したSPA世代の応答をモデルにもキャッシュにも入れない。
- キャッシュの空値や投稿者競合を新しい確定情報として扱わない。

## Task 1: 項目の状態と投稿者証拠

- [x] `tests/metadata-readiness.test.mjs`にhidden/null、型矛盾、unknown/空/失敗、三値論理の失敗テストを追加する。
- [x] `src/data/owner-evidence.js`で型と表示状態を分離、`src/legacy/movie-models.js`で項目状態を保持する。
- [x] `src/legacy/thumb-info-listener.js`で既存の優先順位を保持し、`src/ng/logic-rules.js`の全体完了ゲートを項目ゲートにする。
- [x] `node --test --test-isolation=none tests/metadata-readiness.test.mjs tests/owner-evidence.test.mjs tests/logic-boundary.test.mjs`で検証する。

## Task 2: 必要項目と通信

- [x] 同じ試験に、投稿者のみ0通信、タグ必要時1通信、設定変更、表示要求、重複抑止、破棄応答の呼出数検証を追加する。
- [x] `src/data/metadata-readiness.js`の`required(movie,config)`と`ready(movie,config)`で必要項目を集約する。
- [x] `src/legacy/main-prefix.js`の要求処理で不足項目を判定し、設定変更を再評価する。
- [x] ThumbInfoの通信モックを使い、必要時の個別要求と不要時0要求を確認する。

## Task 3: 画面・継ぎ足し・キャッシュ

- [x] `src/nico/page-adapter.js`で詳細を開く操作を取得要求へ接続する。
- [x] `src/autofill/legacy-controller.js`で待機判定を必要項目の充足または取得終了へ切り替え、完全詳細のキャッシュ条件は維持する。
- [x] 全既存試験と回帰試験、可能な範囲の既存ブラウザ試験を実行する。
- [x] 結果・通信省略条件・未確認事項・次段階を文書化し、製品ブランチにコミットする。

## Baseline findings

改修前の全試験で、core.testの生成物参照先だけが旧ファイル名のため7件失敗。ビルドが公開するoutput定数へ統一して修正する。これは製品変更と分けて比較する。

## Decisions and review

Ruling: 古いセッションキャッシュの名前空文字と不明値を判別できないため、形式3へ更新して旧形式を再利用しない。初回の再取得を許容し、誤ったnotExists判定を防ぐ。

Ruling: 既存の型なし投稿者テストは明示的な型を与える契約に変更。不明な型は推測せず拒否する。取得終了だけの未知投稿者にnotExistsが成立する旧期待値も、新しい仕様の保留へ更新。

レビューで確認した遅延説明文・旧キャッシュ・広告照合の不明状態は、失敗する回帰試験で再現して修正。プライバシー修正は現在ツリーの環境パスとテスト資料に限定し、共有リポジトリの履歴はこのworktreeから書き換えない。
