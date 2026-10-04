# 160.27 — Tampermonkey 自動更新対応

作成: 2026-10-04。これはローカルの配布候補記録であり、GitHub master への公開済みリリースを意味しません。

## 目的

- 改変版の作者・保守者を `ButaMonky` と明示する。
- 原作者 `kengo321` のクレジットを `@contributor` として残す。
- Tampermonkey がこの改変版の安定版だけを自動更新できるようにする。
- 大規模改修中の `integration/brush` や作業branchを自動配信しない。

## 更新経路

```text
@updateURL
https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.meta.js

@downloadURL
https://raw.githubusercontent.com/ButaMonky/nico-nico-ranking-ng-fix/refs/heads/master/dist/nico-nico-ranking-ng.user.js
```

Greasy Fork の script 880 は原配布版なので、この改変版の更新先には使わない。

## ビルド

`node scripts/build.mjs` は同じソースから次を生成する。

- `dist/nico-nico-ranking-ng.user.js` — インストール・更新本体
- `dist/nico-nico-ranking-ng.meta.js` — Userscript メタデータだけの更新確認用
- `dist/nico-nico-ranking-ng-v16-list-tile-fix.user.js` — 旧固定リンク互換用。本体と同一

`meta.js` は完成した `user.js` の `==UserScript==` ブロックをそのまま抽出するため、`@version`・更新URL・作者表記が本文とずれない。

## 識別と設定保持

`@name` と `@namespace` は変更しない。既存のGM保存キー・保存形式も自動更新対応では変更しない。

160.26以前はこの改変版の自動更新先を持たないため、160.27への移行だけは既存Tampermonkey項目へ一度手動で上書きする。その後はGitHub masterへ公開された、より大きい `@version` を更新対象にする。

## 公開前確認

- [x] GitHub master の既存 `dist/nico-nico-ranking-ng.user.js` は匿名HTTPで取得可能（2026-10-04、HTTP 200）。
- [x] 未公開の `dist/nico-nico-ranking-ng.meta.js` は現時点でHTTP 404。公開前なので正常。
- [x] ローカルbuildが `meta.js` を生成し、本文ヘッダーと一致する単体試験を追加。
- [ ] 大規模改修版そのものの全体回帰確認。
- [ ] Tampermonkey実拡張で160.26→160.27の設定保持を確認。
- [ ] テスト用の次版を使って、Tampermonkeyが `@updateURL` で新しい版を検出し `@downloadURL` から更新することを確認。
- [ ] 利用者の明示承認後にmasterへ公開。

## 安全ルール

- 同じ `@version` の本文を差し替えない。
- 公開のたびに `@version` と `NRN_VERSION` を同じ値へ増やす。
- integration / AI作業branch / private URL / token付きURLを自動更新先にしない。
- masterへのpush・公開は、全体確認と利用者の承認前には行わない。
