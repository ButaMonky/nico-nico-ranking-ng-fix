import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const name = 'nico-nico-ranking-ng-v14.1-performance-pager-fix (2).user.js';
export const expectedHash = 'AF382AE50FCF8CDFDFC2AE178F3BE8861AC7ECF1611F30F4E3FB94439A87F371';
export const baseline = resolve(root, 'baseline', name);
export const output = resolve(root, 'dist', name);
export const sourceParts = ['src/legacy/prefix.js', 'src/core/events.js', 'src/core/storage.js', 'src/core/config.js', 'src/legacy/before-ng.js', 'src/ng/logic-rules.js', 'src/legacy/remainder.js'];
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
  // Mechanical extraction only: even whitespace must remain identical.
  if (!assembled.equals(bytes)) throw new Error('Assembly differs from approved baseline');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, assembled);
  verify(await readFile(destination));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log('Build PASS: source parts assembled byte-identically to v14.1.');
}
