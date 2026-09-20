import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const name = 'nico-nico-ranking-ng-v14.1-performance-pager-fix (2).user.js';
export const expectedHash = 'AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371';
export const baseline = resolve(root, 'baseline', name);
export const output = resolve(root, 'dist', 'nico-nico-ranking-ng.user.js');
export const compatibilityOutput = resolve(root, 'dist', 'nico-nico-ranking-ng-v16-list-tile-fix.user.js');
export const sourceParts = ['src/legacy/prefix.js', 'src/core/events.js', 'src/core/storage.js', 'src/core/config.js', 'src/data/network.js', 'src/data/thumb-info-source.js', 'src/legacy/before-ng.js', 'src/data/metadata-readiness.js', 'src/ng/logic-rules.js', 'src/legacy/movie-models.js', 'src/data/owner-evidence.js', 'src/legacy/thumb-info-listener.js', 'src/ui/view-state.js', 'src/ui/settings-dialog.js', 'src/ui/rule-editor.js', 'src/services/theme.js', 'src/nico/page-adapter.js', 'src/ui/result-layout.js', 'src/nico/list-page.js', 'src/nico/search-page.js', 'src/diagnostics/logger.js', 'src/services/new-tab.js', 'src/app/controller.js', 'src/ui/card-enhancements.js', 'src/data/owner-name-source.js', 'src/preview/hls-license.js', 'src/preview/hls-prefix.js', 'vendor/hls.js/hls.min.js', 'src/preview/hls-suffix.js', 'src/preview/preview-data.js', 'src/preview/preview-audio.js', 'src/preview/hover-preview.js', 'src/data/card-action-data.js', 'src/ui/card-tooltip.js', 'src/ui/card-actions.js', 'src/legacy/main-prefix.js', 'src/data/detail-cache.js', 'src/ui/pager-journey.js', 'src/autofill/legacy-controller.js', 'src/nico/navigation.js', 'src/app/bootstrap.js', 'src/app/start.js'];
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
  const hls = await readFile(resolve(root,'vendor/hls.js/hls.min.js'));
  if (createHash('sha256').update(hls).digest('hex').toUpperCase() !== '72B87A6E58DB623FECA73AB370970C1126EC06EB3DCD0A67FD14B47B6340B820') throw new Error('Vendored HLS.js fingerprint mismatch');
  const manifest = JSON.parse(await readFile(resolve(root, 'vendor/third-party-manifest.json'), 'utf8'));
  const notices = [await readFile(resolve(root, 'src/licenses/distribution-notice.txt'), 'utf8'), await readFile(resolve(root, 'LICENSE'), 'utf8')];
  for (const entry of manifest) {
    const content = await readFile(resolve(root, entry.path));
    if (createHash('sha256').update(content).digest('hex') !== entry.sha256) throw new Error(`License fingerprint mismatch: ${entry.path}`);
    notices.push(`${entry.name} ${entry.version} — ${entry.path}\n${content.toString('utf8')}`);
  }
  // Line comments preserve notice text without allowing embedded */ to end a comment.
  const appendix = '\n' + notices.join('\n\n').split(/\r?\n/).map(line => line.trimEnd() ? '// ' + line.trimEnd() : '//').join('\n') + '\n';
  const assembled = Buffer.concat([...await Promise.all(sourceParts.map(part => readFile(resolve(root, part)))), Buffer.from(appendix)]);
  // Baseline is immutable; runtime sources stay in order, followed by license comments.
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, assembled);
  if (!(await readFile(destination)).equals(assembled)) throw new Error('Output differs from source assembly');
  // Keep existing installation links valid without maintaining a second build.
  if (resolve(destination) === output) {
    await writeFile(compatibilityOutput, assembled);
    if (!(await readFile(compatibilityOutput)).equals(assembled)) throw new Error('Compatibility output differs');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log('Build PASS: source parts assembled; frozen v14.1 verified.');
}
