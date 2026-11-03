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
export function mirroredOg(url: string): string {
  const k = url.replace(/^https?:/, '').split('?')[0];
  const local = (ogMirror as Record<string, string>)[k];
  return local ? `${SITE}${local}` : url;
}

export function fixHead(tags: string[], opts: { canonical?: string } = {}): string[] {
  return tags
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
      }
      return t;
    });
}

/** F4/F5 — one H1 per page. Visible text, order and look unchanged (CSS classes keep the size). */
export function videoH1(html: string): string {
  let done = false;
  return html.replace(/<h2>([\s\S]*?)<\/h2>/, (m, inner) => (done ? m : ((done = true), `<h1 class="as-h2">${inner}</h1>`)));
}
export const demoteBodyH1 = (html: string) => html.replace(/<h1(\s[^>]*)?>([\s\S]*?)<\/h1>/g, '<h2 class="as-h1"$1>$2</h2>');
