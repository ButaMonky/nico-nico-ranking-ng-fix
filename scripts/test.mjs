import { spawnSync } from 'node:child_process';
import { build, root } from './build.mjs';
await build();
const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', 'tests/card-action-data.test.mjs', 'tests/preview-data.test.mjs', 'tests/initial-dom-wait.test.mjs', 'tests/owner-name-source.test.mjs', 'tests/diagnostics.test.mjs', 'tests/metadata-readiness.test.mjs', 'tests/numeric-ng.test.mjs', 'tests/rule-editor-numeric.test.mjs', 'tests/source-plan.test.mjs', 'tests/search-item-adapter.test.mjs', 'tests/owner-resolver.test.mjs', 'tests/snapshot-owner-source.test.mjs', 'tests/owner-id.test.mjs', 'tests/owner-icon.test.mjs', 'tests/baseline.test.mjs', 'tests/core.test.mjs', 'tests/ng.test.mjs', 'tests/thumb-info.test.mjs', 'tests/view-state.test.mjs', 'tests/services.test.mjs', 'tests/settings-theme.test.mjs', 'tests/pages.test.mjs', 'tests/controller.test.mjs', 'tests/cache.test.mjs', 'tests/navigation.test.mjs', 'tests/logic-boundary.test.mjs', 'tests/pagination-boundary.test.mjs', 'tests/network.test.mjs', 'tests/snapshot-metadata.test.mjs', 'tests/benchmark-rules.test.mjs', 'tests/autofill-fixture.test.mjs', 'tests/autofill-assembly.test.mjs', 'tests/candidate-filter.test.mjs', 'tests/autofill-cancellation.test.mjs', 'tests/autofill-batch-policy.test.mjs', 'tests/autofill-early-stop.test.mjs', 'tests/pager-journey.test.mjs', 'tests/owner-evidence.test.mjs'], {
  cwd: root,
  env: { ...process.env, NRN_TEST_GENERATED: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
