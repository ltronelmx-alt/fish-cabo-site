// Documented technical SEO fixes applied on top of the ORIGINAL Squarespace head tags / markup.
// Every rule here is listed in docs/SEO-GEO-FINAL-AUDIT.md (before/after table) and mirrored in
// scripts/seo_fixes.py so the verbatim verifier accepts exactly these changes and nothing else.
import manifest from '../data/media-manifest.json';
import ogMirror from '../data/og-mirror.json';

const SITE = 'https://fish-cabo.com';
const SQS_CDN = /(?:https?:)?\/\/images\.squarespace-cdn\.com\/content\/v1\/6911316472567617bebc28b5\/([^"?\s)]+)(?:\?[^"\s)]*)?/g;
const norm = (p: string) => decodeURIComponent(p.replace(/\+/g, ' ')).replace(/\/$/, '');
const key = (p: string) => { const [id, ...rest] = norm(p).split('/'); return `${id}/${rest.join('/').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`; };

/** F6 — exact same file, self-hosted: images.squarespace-cdn.com/<path> → https://fish-cabo.com/media/<path>-<largest>.webp */
export function localImage(url: string): string {
  return url.replace(SQS_CDN, (m, p) => {
    const e = (manifest as any)[key(p)];
    return e ? `${SITE}/media/${key(p)}-${e.widths.at(-1)}.webp` : m;
  });
}
/** F6b — static1.squarespace.com social images mirrored byte-for-byte by .github/workflows/mirror-og.yml */
const byName: Record<string, string[]> = {};
for (const k of Object.keys(manifest)) (byName[k.split('/').slice(1).join('/')] ||= []).push(k);
export function mirroredOg(url: string): string {
  const k = url.replace(/^https?:/, '').split('?')[0];
  const local = (ogMirror as Record<string, string>)[k];
  if (local) return `${SITE}${local}`;
  // not mirrorable (404 on Squarespace already): use the self-hosted copy of the SAME file name, if exactly one exists
  const name = key('x/' + k.split('/').pop()).slice(2);
  const hits = byName[name] || [];
  return hits.length === 1 ? `${SITE}/media/${hits[0]}-${(manifest as any)[hits[0]].widths.at(-1)}.webp` : url;
}

/** F6c — the page's own hero photo (self-hosted), used only when the original social image is already 404 on Squarespace */
export function heroFallback(page: any): { url: string; w: number; h: number } | null {
  const first = page?.sections?.[0];
  const p = first?.bg?.path || first?.blocks?.find((b: any) => b.kind === 'img')?.path;
  const e = p && (manifest as any)[key(p)];
  return e ? { url: `${SITE}/media/${key(p)}-${e.widths.at(-1)}.webp`, w: e.widths.at(-1), h: Math.round((e.height * e.widths.at(-1)) / e.width) } : null;
}

export function fixHead(tags: string[], opts: { canonical?: string; fallback?: { url: string; w: number; h: number } | null } = {}): string[] {
  let usedFallback = false;
  const out = tags
    // F2 — legacy second LocalBusiness block ("Fish Cabo", www host, other coordinates, unverifiable rating) conflicts with the main @id entity
    .filter((t) => !(/application\/ld\+json/.test(t) && /"name"\s*:\s*"Fish Cabo"/.test(t) && !/"@id"/.test(t)))
    .map((t) => {
      // F1 — literal "<br/>" left inside the SEO title by the Squarespace editor
      if (/^<title>/.test(t) || /property="og:title"|name="twitter:title"|itemprop="name"/.test(t)) t = t.replace(/\s*(?:&lt;|<)br\s*\/?(?:&gt;|>)/gi, '');
      // F3 — canonical of the paginated archive must point to its own (Squarespace) URL, not to page one
      if (opts.canonical && /rel="canonical"/.test(t)) t = t.replace(/href="[^"]*"/, `href="${opts.canonical}"`);
      if (opts.canonical && /property="og:url"|name="twitter:url"/.test(t)) t = t.replace(/content="[^"]*"/, `content="${opts.canonical}"`);
      // F6 — durable social / structured-data images
      if (/og:image|twitter:image|itemprop="image"|thumbnailUrl|application\/ld\+json/.test(t)) {
        t = localImage(t);
        t = t.replace(/(?:https?:)?\/\/static1\.squarespace\.com\/[^"\s]+/g, (u) => mirroredOg(u.startsWith('//') ? 'https:' + u : u));
        if (/property="og:image"|name="twitter:image"|itemprop="(?:image|thumbnailUrl)"/.test(t) && /static1\.squarespace\.com/.test(t) && opts.fallback) {
          t = t.replace(/content="[^"]*"/, `content="${opts.fallback.url}"`); if (/og:image|twitter:image/.test(t)) usedFallback = true;
        }
      }
      // F12 — social previews: large image card, and the page's own photo instead of the small logo (owner request 2026-11-04)
      if (/name="twitter:card"/.test(t)) t = t.replace(/content="summary"/, 'content="summary_large_image"');
      if (/property="og:image"|name="twitter:image"/.test(t) && /logo-low-res-fishing-san-jose-del-cabo/.test(t) && opts.fallback) {
        t = t.replace(/content="[^"]*"/, `content="${opts.fallback.url}"`); if (/og:image/.test(t)) usedFallback = true;
      }
      return t;
    });
  // keep og:image:width/height true to the fallback picture
  return usedFallback && opts.fallback
    ? out.map((t) => /property="og:image:width"/.test(t) ? t.replace(/content="[^"]*"/, `content="${opts.fallback!.w}"`) : /property="og:image:height"/.test(t) ? t.replace(/content="[^"]*"/, `content="${opts.fallback!.h}"`) : t)
    : out;
}

/** F4/F5 — one H1 per page. Visible text, order and look unchanged (CSS classes keep the size). */
export function videoH1(html: string): string {
  let done = false;
  return html.replace(/<h2>([\s\S]*?)<\/h2>/, (m, inner) => (done ? m : ((done = true), `<h1 class="as-h2">${inner}</h1>`)));
}
export const demoteBodyH1 = (html: string) => html.replace(/<h1(\s[^>]*)?>([\s\S]*?)<\/h1>/g, '<h2 class="as-h1"$1>$2</h2>');
