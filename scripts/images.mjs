// Builds responsive AVIF + WebP versions of every original in media-src/ into public/media/.
// Originals are Exotic Fish Cabo's own photos (copied from the Squarespace CDN export).
// Re-running is fast: existing outputs are skipped.
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';

const SRC = 'media-src';
const OUT = 'public/media';
const STEPS = [300, 500, 750, 1000, 1500, 2000];
export const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/%2b|\+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const manifest = {};
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const file of walk(SRC).filter((f) => /\.(jpe?g|png|webp|gif|avif|tiff?)$/i.test(f))) {
  const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
  const key = `${dirname(rel)}/${slug(basename(rel, extname(rel)))}`;
  const meta = await sharp(file).metadata();
  const widths = [...STEPS.filter((w) => w < meta.width), Math.min(meta.width, 2400)];
  mkdirSync(join(OUT, dirname(key)), { recursive: true });
  for (const w of widths) {
    for (const [fmt, opts] of [['avif', { quality: 52, effort: 4 }], ['webp', { quality: 80 }]]) {
      const out = join(OUT, `${key}-${w}.${fmt}`);
      if (existsSync(out)) continue;
      await sharp(file).resize({ width: w, withoutEnlargement: true })[fmt](opts).toFile(out);
    }
  }
  manifest[key] = { width: meta.width, height: meta.height, widths };
}
writeFileSync('src/data/media-manifest.json', JSON.stringify(manifest, null, 1));
console.log(`images: ${Object.keys(manifest).length} originals processed`);
