import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const name = 'nico-nico-ranking-ng-v14.1-performance-pager-fix (2).user.js';
export const expectedHash = 'AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371';
export const baseline = resolve(root, 'baseline', name);
export const output = resolve(root, 'dist', 'nico-nico-ranking-ng-v16-list-tile-fix.user.js');
export const sourceParts = ['src/legacy/prefix.js', 'src/core/events.js', 'src/core/storage.js', 'src/core/config.js', 'src/data/network.js', 'src/data/thumb-info-source.js', 'src/legacy/before-ng.js', 'src/ng/logic-rules.js', 'src/legacy/movie-models.js', 'src/legacy/thumb-info-listener.js', 'src/ui/view-state.js', 'src/ui/settings-dialog.js', 'src/ui/rule-editor.js', 'src/services/theme.js', 'src/nico/page-adapter.js', 'src/ui/result-layout.js', 'src/nico/list-page.js', 'src/nico/search-page.js', 'src/diagnostics/logger.js', 'src/services/new-tab.js', 'src/app/controller.js', 'src/ui/card-enhancements.js', 'src/legacy/main-prefix.js', 'src/data/detail-cache.js', 'src/autofill/legacy-controller.js', 'src/nico/navigation.js', 'src/app/bootstrap.js', 'src/app/start.js'];
export function verify(bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (bytes.length !== 463894 || hash !== expectedHash) {
    throw new Error(`Baseline mismatch: ${bytes.length} bytes, SHA-256 ${hash}`);
  }
  return hash;
}
export async function build(source = baseline, destination = output) {
  const bytes = await readFile(source);
  verify(bytes);
  const assembled = Buffer.concat(await Promise.all(sourceParts.map(part => readFile(resolve(root, part)))));
  // Functional development: baseline remains immutable; output is the ordered source assembly.
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, assembled);
  if (!(await readFile(destination)).equals(assembled)) throw new Error('Output differs from source assembly');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log('Build PASS: source parts assembled; frozen v14.1 verified.');
}
