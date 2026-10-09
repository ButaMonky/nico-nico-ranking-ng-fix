# 160.33 Ranking and safety integration audit

Date: 2026-10-10. Status: local integration candidate (not installed-site verified).

## Changes and source
- BRUSH-060, original isolated commit `3cc083a`: encode tags as one URL path segment; preserve NG labels.
- BRUSH-062, original isolated commit `b5d501c`: detach stale Movie-to-Tag listeners and retain one callback per Movie.
- Independent ranking review: genre `server-response` contains `$getTeibanRanking.data.items`, not search `$getSearchVideoV2`.
- A genre response reporting a different served page is treated as a safe stop, not as a fresh page. Some ranking pages ignore `?page=N`.
- AutoFill card building no longer inserts dynamic author names or media URLs into HTML markup.
- History privacy checks allow GitHub's explicitly known platform committer addresses without allowing unrelated emails.

## Evidence and limitations
- Frozen baseline remains immutable; registered Node tests are mandatory.
- New offline browser tests cover genre/search contracts (including repeated page1) and synthetic HTML injection.
- Original custom-ranking lane order, native ad frames and no-AutoFill capability must remain intact.
- **Do not** interpret successful synthetic checks as installed extension acceptance or proof of all ranking API semantics.
- Full offline Edge/Playwright browser suite: 34/34 PASS (2026-10-10), including the new ranking and injected-card security regressions. Registered Node: 416/416 PASS; build/syntax/privacy checks PASS.
- Scope excludes BRUSH-061 (separate uncommitted reserved WIP) and unfinished dictionary/content-tree UI.

## Privacy and distribution
- No private HAR, local user path, personal search term, browsing trace, tracking key, Cookie or raw response is stored here.
- Push target is `integration/brush` on the updater's current `nico-nico-ranking-ng-fix` repository.
- Public `master` and Tampermonkey update URLs are unchanged; this integration push is **not** a public userscript release.
- Both executable output and metadata are built from checked-in source in the same build and require identical version `160.33`.
