# AutoFill source map — BRUSH-023

The build still concatenates source **bytes** in `scripts/build.mjs` order.
These files are ordered fragments of the existing `setupAutoFill` closure,
not independent ES modules. Do not execute or check each fragment alone.
This first split changes no runtime behavior; the before/after distribution
SHA-256 is recorded with the task verification. Further interface extraction
is incremental work, not a claim that shared closure dependencies disappeared.

| File in src/autofill | Responsibility |
|---|---|
| legacy-controller.js | Entry/lifecycle, self-ad helpers, state, status and waiting |
| snapshot-source.js | Search descriptor, Snapshot requests, validation and existing quick NG |
| pager-runtime.js | Page journey, native pager rendering and consumption |
| candidate-loader.js | Source fetching and candidate pool replenishment |
| candidate-evaluator.js | Detail cache bridge, card preparation and batch evaluation |
| run-loop.js | Refill orchestration, budgets, completion and fallback |
| developer-diagnostics.js | Optional diagnostic suite, not ordinary candidate processing |
| initialize.js | Initial-page evaluation, subscriptions and controller closure end |

Production build order is the single source of truth. Tests needing a source
slice must use `scripts/lib/autofill-source.mjs`, rather than reading only
`legacy-controller.js`. This avoids silently testing an obsolete partial copy.

BRUSH-049's Snapshot numeric fix is now in `snapshot-source.js`.
Do not treat display-only formatted counters as canonical model metadata.
