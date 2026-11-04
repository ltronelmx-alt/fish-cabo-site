// Runs after `astro build`. Writes _headers, robots.txt and sitemap.xml.
// Staging (default): everything is noindex and robots.txt blocks all crawlers.
// Production: only when PUBLIC_SITE_ENV=production is set explicitly.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const SITE = 'https://fish-cabo.com';
const isProd = process.env.PUBLIC_SITE_ENV === 'production';

const csp = [
  "default-src 'self'",
  "img-src 'self' data: https://i.ytimg.com https://www.tripadvisor.com",
  "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
${isProd ? '' : '  X-Robots-Tag: noindex, nofollow\n'}
/admin/*
  ! Content-Security-Policy
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.github.com https://github.com https://unpkg.com https://*.githubusercontent.com; frame-src 'self' blob:; font-src 'self' data: https://unpkg.com; frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/media/*
  Cache-Control: public, max-age=31536000, immutable

/og/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=86400

/favicon.ico
  Cache-Control: public, max-age=86400
`;
writeFileSync(join(DIST, '_headers'), headers);

// F10 — any image still referenced on a Squarespace host (body images such as Brooke.webp or the author avatar) is
// served from the byte-for-byte copy made by .github/workflows/mirror-og.yml, when that copy exists.
{
  const mirror = JSON.parse(readFileSync('src/data/og-mirror.json', 'utf8'));
  const walkH = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walkH(p) : p.endsWith('.html') ? [p] : []; });
  let n = 0;
  for (const f of walkH(DIST)) {
    const html = readFileSync(f, 'utf8');
    const out = html.replace(/(src="|content=")?((?:https?:)?\/\/(?:static1\.squarespace\.com|images\.squarespace-cdn\.com)\/[^"\s)]+)/g, (m, attr, url) => {
      const key = url.replace(/^https?:/, '').split('?')[0];
      const local = mirror[key];
      if (!local) return m;
      n++;
      return (attr || '') + (attr === 'src="' ? local : SITE + local);
    });
    if (out !== html) writeFileSync(f, out);
  }
  console.log(`postbuild: ${n} Squarespace-hosted image references replaced by self-hosted copies`);
}

// Sitemap: the ORIGINAL Squarespace sitemap (same URLs, same lastmod), plus Fishing Reports created later in the CMS.
const orig = readFileSync('src/data/original-sitemap.xml', 'utf8');
const known = new Set([...orig.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, '') || '/'));
const extra = [];
try {
  for (const f of readdirSync(join(DIST, 'fishing-reports'))) {
    if (!f.endsWith('.html')) continue;
    const path = '/fishing-reports/' + f.replace(/\.html$/, '');
    if (path === '/fishing-reports/older' || known.has(path)) continue;
    // lastmod = the post's own publication date from the CMS (never the build time)
    let date = '';
    try { date = (readFileSync(join('src/content/fishing-reports', f.replace(/\.html$/, '.md')), 'utf8').match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m) || [])[1] || ''; } catch {}
    extra.push(`<url><loc>${SITE}${path}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`);
  }
} catch {}
// F7 — /cabo-fishing is a duplicate of the homepage and canonicalises to "/": list the canonical homepage URL instead
const fixed = orig.replace(`<loc>${SITE}/cabo-fishing</loc>`, `<loc>${SITE}/</loc>`);
// F9 — sitemap <image:loc>: the exact same files, self-hosted (all 102 references have a local copy in /media)
const manifestS = JSON.parse(readFileSync('src/data/media-manifest.json', 'utf8'));
const mkeyS = (p) => { const d = decodeURIComponent(p.replace(/\+/g, ' ')).replace(/\/$/, ''); const [id, ...r] = d.split('/'); return `${id}/${r.join('/').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`; };
const fixedImg = fixed.replace(/<image:loc>https?:\/\/images\.squarespace-cdn\.com\/content\/v1\/6911316472567617bebc28b5\/([^<?]+)(?:\?[^<]*)?<\/image:loc>/g, (m, p) => {
  const k = mkeyS(p); const e = manifestS[k];
  return e ? `<image:loc>${SITE}/media/${k}-${e.widths.at(-1)}.webp</image:loc>` : m;
});
const sitemap = extra.length ? fixedImg.replace('</urlset>', extra.join('') + '</urlset>') : fixedImg;
const pages = [...known];
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

writeFileSync(
  join(DIST, 'robots.txt'),
  isProd ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
);
console.log(`postbuild: ${pages.length} pages, mode=${isProd ? 'PRODUCTION' : 'staging (noindex)'}`);
