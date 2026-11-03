// Mirrors every social-preview / structured-data image still hosted on static1.squarespace.com
// (og:image, twitter:image, itemprop image, JSON-LD) into public/og/, byte-for-byte, and writes
// src/data/og-mirror.json (key = URL without protocol/query → local path). Run where internet is available
// (GitHub Actions: .github/workflows/mirror-og.yml). Safe to re-run: existing files are kept.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const roots = ['src/data/original', 'src/content/fishing-reports'];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
roots.forEach(walk);
const urls = new Set();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/(?:https?:)?\/\/static1\.squarespace\.com\/[^"\s\\)]+/g)) urls.add(m[0].startsWith('//') ? 'https:' + m[0] : m[0].replace(/^http:/, 'https:'));
mkdirSync('public/og', { recursive: true });
const mapPath = 'src/data/og-mirror.json';
const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};
let ok = 0, fail = 0;
for (const u of urls) {
  const key = u.replace(/^https?:/, '').split('?')[0];
  if (map[key] && existsSync(join('public', map[key]))) { ok++; continue; }
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'fish-cabo-site og mirror' } });
    if (!r.ok) throw new Error(r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = ((r.headers.get('content-type') || '').match(/image\/(png|jpe?g|webp|gif)/) || [, 'jpg'])[1].replace('jpeg', 'jpg');
    const base = decodeURIComponent(key.split('/').pop() || 'image').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
    const name = `${base}-${createHash('sha1').update(key).digest('hex').slice(0, 8)}.${ext}`;
    writeFileSync(join('public/og', name), buf);
    map[key] = `/og/${name}`; ok++;
  } catch (e) { fail++; console.error('FAILED', u, e.message); }
}
writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log(`og mirror: ${ok} mirrored, ${fail} failed, ${urls.size} URLs`);
// failures (e.g. 404 already on Squarespace) are reported but do not block committing the images that worked
