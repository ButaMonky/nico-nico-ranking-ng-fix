import { spawnSync } from 'node:child_process';
import { build, root } from './build.mjs';
await build();
const result = spawnSync(process.execPath, ['--test', 'tests/baseline.test.mjs', 'tests/core.test.mjs', 'tests/ng.test.mjs', 'tests/thumb-info.test.mjs', 'tests/view-state.test.mjs', 'tests/services.test.mjs', 'tests/settings-theme.test.mjs', 'tests/pages.test.mjs', 'tests/controller.test.mjs', 'tests/cache.test.mjs', 'tests/navigation.test.mjs', 'tests/logic-boundary.test.mjs', 'tests/pagination-boundary.test.mjs', 'tests/network.test.mjs', 'tests/pager-journey.test.mjs', 'tests/owner-evidence.test.mjs'], {
  cwd: root,
  env: { ...process.env, NRN_TEST_GENERATED: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
