import manifest from '../data/media-manifest.json';

type Entry = { width: number; height: number; widths: number[] };
const M = manifest as Record<string, Entry>;

// Same slug rule as scripts/images.mjs
const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/%2b|\+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "uuid/File+Name.webp" (Squarespace path) -> local media entry */
export function media(src: string): ({ width: number; height: number; widths: number[]; key: string; avif: string; webp: string; at: (w: number, fmt?: string) => string }) | null {
  const [dir, file] = src.split('/');
  const key = `${dir}/${slug(decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, ''))}`;
  const e = M[key];
  if (!e) return null;
  const set = (fmt: string) => e.widths.map((w) => `/media/${key}-${w}.${fmt} ${w}w`).join(', ');
  const at = (w: number, fmt = 'webp') => `/media/${key}-${e.widths.find((x) => x >= w) ?? e.widths.at(-1)}.${fmt}`;
  return { ...e, key, avif: set('avif'), webp: set('webp'), at };
}

/** Rewrite original <img alt=".." data-path=".."> tags into responsive self-hosted <picture> (alt kept verbatim). */
/** Display cap: never wider than the file itself (no blurry upscaling) and never taller than 85% of the screen. Proportions kept. */
export const capStyle = (w: number, h: number) => `max-width:min(100%,${w}px,calc(85vh * ${w} / ${h}))`;
import altFixes from '../data/alt-fixes.json';
/** A1 — documented alt text for meaningful images whose original alt is empty */
export const fixAlt = (path: string, alt: string) => alt || Object.entries(altFixes as Record<string, string>).find(([k]) => !k.startsWith('_') && path.includes(k))?.[1] || '';
export function pictures(html: string, sizes = '(min-width: 1000px) 50vw, 92vw') {
  let n = 0;
  html = html.replace(/<img([^>]*?)\sdata-ext="([^"]+)"([^>]*)\/?>/g, (_m, a, src, b) => `<img${a}${b.replace(/\/$/, '')} src="${src}" loading="lazy" decoding="async"/>`);
  return html.replace(/<img([^>]*?)\sdata-path="([^"]+)"([^>]*)\/?>/g, (_m, a, p, b) => {
    const attrs = a + b;
    const alt = fixAlt(p, (attrs.match(/alt="([^"]*)"/) || [, ''])[1]);
    const m = media(p.replace(/&amp;/g, '&'));
    const lazy = n++ > 0 ? 'lazy' : 'eager';
    if (!m) return `<img alt="${alt}" src="https://images.squarespace-cdn.com/content/v1/6911316472567617bebc28b5/${p}" loading="${lazy}" decoding="async"/>`;
    return `<picture><source type="image/avif" srcset="${m.avif}" sizes="${sizes}"/><img alt="${alt}" src="${m.at(1000)}" srcset="${m.webp}" sizes="${sizes}" width="${m.width}" height="${m.height}" style="${capStyle(m.width, m.height)}" loading="${lazy}" decoding="async"/></picture>`;
  });
}
