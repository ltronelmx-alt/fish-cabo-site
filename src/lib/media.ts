import manifest from '../data/media-manifest.json';

type Entry = { width: number; height: number; widths: number[] };
const M = manifest as Record<string, Entry>;

// Same slug rule as scripts/images.mjs
const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/%2b|\+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "uuid/File+Name.webp" (Squarespace path) -> local media entry */
export function media(src: string) {
  const [dir, file] = src.split('/');
  const key = `${dir}/${slug(decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, ''))}`;
  const e = M[key];
  if (!e) throw new Error(`Image missing from media-src/: ${src} (key ${key})`);
  const set = (fmt: string) => e.widths.map((w) => `/media/${key}-${w}.${fmt} ${w}w`).join(', ');
  const at = (w: number, fmt = 'webp') => `/media/${key}-${e.widths.find((x) => x >= w) ?? e.widths.at(-1)}.${fmt}`;
  return { ...e, key, avif: set('avif'), webp: set('webp'), at };
}
