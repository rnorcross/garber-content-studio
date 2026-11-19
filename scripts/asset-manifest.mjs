// Lists each body shop site's own images, share images and video (public/sites/<slug>/{img,og,video})
// so the studio can move them to Vercel Blob from the browser. Runs before every build.
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'public', 'sites');
const out = {};
if (existsSync(root)) {
  for (const slug of readdirSync(root)) {
    const files = [];
    for (const dir of ['img', 'og', 'video']) {
      const d = path.join(root, slug, dir);
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d)) {
        const s = statSync(path.join(d, f));
        if (s.isFile()) files.push({ path: `${dir}/${f}`, size: s.size });
      }
    }
    out[slug] = files;
  }
}
mkdirSync(path.join(process.cwd(), 'lib', 'generated'), { recursive: true });
writeFileSync(path.join(process.cwd(), 'lib', 'generated', 'asset-manifest.json'), JSON.stringify(out) + '\n');
console.log(`asset manifest: ${Object.entries(out).map(([k, v]) => `${k} ${v.length} files`).join(', ') || 'no sites'}`);
