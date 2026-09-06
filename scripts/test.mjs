import { spawnSync } from 'node:child_process';
import { build, root } from './build.mjs';
await build();
const result = spawnSync(process.execPath, ['--test', 'tests/baseline.test.mjs', 'tests/core.test.mjs'], {
  cwd: root,
  env: { ...process.env, NRN_TEST_GENERATED: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
