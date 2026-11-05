// A fingerprint of everything Setup loads (the seed folder plus the code that loads it).
// Auto-load stores it in app_flags as `seed:<hash>` after a successful run, so a deploy only
// re-runs Setup when the content actually changed.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function files(dir) {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export function seedVersion(root = process.cwd()) {
  const h = createHash('sha256');
  const list = [...files(path.join(root, 'seed')), ...['setup.mjs', 'dealer-pages.mjs', 'urls.mjs', 'schema.sql'].map((f) => path.join(root, 'lib', f))];
  for (const f of list) { h.update(path.relative(root, f)); h.update(readFileSync(f)); }
  return h.digest('hex').slice(0, 16);
}
