// Runs after `astro build`. Writes _headers, robots.txt and sitemap.xml.
// Staging (default): everything is noindex and robots.txt blocks all crawlers.
// Production: only when PUBLIC_SITE_ENV=production is set explicitly.
import { readdirSync, statSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const SITE = 'https://fish-cabo.com';
const isProd = process.env.PUBLIC_SITE_ENV === 'production';
// PUBLIC LAUNCH SWITCH (src/data/launch.json): a production build made while online booking is closed carries NO
// /book-now pages (they answer 404 like any unknown URL) and no /book-now sitemap entry.
const bookingOpen = !isProd || JSON.parse(readFileSync('src/data/launch.json', 'utf8')).PUBLIC_BOOKING_LAUNCHED === true;
if (!bookingOpen) { rmSync(join(DIST, 'book-now.html'), { force: true }); rmSync(join(DIST, 'book-now'), { recursive: true, force: true }); console.log('postbuild: online booking CLOSED (launch.json) — /book-now pages removed from the production build'); }

const csp = [
  "default-src 'self'",
  "img-src 'self' data: https://i.ytimg.com",
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

/book-now/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store

/deploy-info.json
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
// Booking page (new URL, indexable). Its private sub-pages (/book-now/confirmation, /book-now/canceled) are noindex.
try { readFileSync(join(DIST, 'book-now.html')); if (!known.has('/book-now')) extra.push(`<url><loc>${SITE}/book-now</loc></url>`); } catch {}
// F7 — /cabo-fishing is a duplicate of the homepage and canonicalises to "/": list the canonical homepage URL instead
const fixed = orig.replace(`<loc>${SITE}/cabo-fishing</loc>`, `<loc>${SITE}/</loc>`);
// F9 — sitemap <image:loc>: the exact same files, self-hosted (all 102 references have a local copy in /media)
const manifestS = JSON.parse(readFileSync('src/data/media-manifest.json', 'utf8'));
const mkeyS = (p) => { const d = decodeURIComponent(p.replace(/\+/g, ' ')).replace(/\/$/, ''); const [id, ...r] = d.split('/'); return `${id}/${r.join('/').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`; };
const fixedImg = fixed.replace(/<image:loc>https?:\/\/images\.squarespace-cdn\.com\/content\/v1\/6911316472567617bebc28b5\/([^<?]+)(?:\?[^<]*)?<\/image:loc>/g, (m, p) => {
  const k = mkeyS(p); const e = manifestS[k];
  return e ? `<image:loc>${SITE}/media/${k}-${e.widths.at(-1)}.webp</image:loc>` : m;
});
// Images removed from the pages at the owner's request (src/data/removed-images.json) are removed from the image sitemap too
const removedImgs = JSON.parse(readFileSync('src/data/removed-images.json', 'utf8')).paths.map((p) => p.split('/')[0]);
const cleanImg = removedImgs.reduce((x, id) => x.replace(new RegExp(`\\s*<image:image>\\s*<image:loc>[^<]*${id}[^<]*</image:loc>[\\s\\S]*?</image:image>`, 'g'), ''), fixedImg);
const sitemap = extra.length ? cleanImg.replace('</urlset>', extra.join('') + '</urlset>') : cleanImg;
const pages = [...known];
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

writeFileSync(
  join(DIST, 'robots.txt'),
  isProd ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
);
console.log(`postbuild: ${pages.length} pages, mode=${isProd ? 'PRODUCTION' : 'staging (noindex)'}`);

// Deployment proof for the publish-notification workflow: which commit this build comes from, in which mode,
// and which Fishing Reports it contains. Not linked, not in the sitemap, served noindex + no-store.
import { execSync } from 'node:child_process';
const ciBranch = process.env.WORKERS_CI_BRANCH || '';
// Safety: a Cloudflare build of `main` must be a production build (`npm run build:prod`). A staging build there
// would publish noindex pages on fish-cabo.com, so it fails here and Cloudflare keeps the current live version.
if (ciBranch === 'main' && !isProd) {
  console.error('postbuild: Cloudflare build of main without PUBLIC_SITE_ENV=production — use `npm run build:prod`. Build stopped.');
  process.exit(1);
}
let commit = process.env.WORKERS_CI_COMMIT_SHA || '';
if (!commit) { try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {} }
const reportsDir = 'src/content/fishing-reports';
const reportsInfo = readdirSync(reportsDir).filter((f) => f.endsWith('.md')).map((f) => {
  const src = readFileSync(join(reportsDir, f), 'utf8');
  const get = (k) => ((src.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
  return { slug: f.replace(/\.md$/, ''), title: get('title'), date: get('date').slice(0, 10), category: get('category'), draft: /^draft:\s*true\s*$/m.test(src) };
}).filter((r) => !r.draft).map(({ draft, ...r }) => r).sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(join(DIST, 'deploy-info.json'), JSON.stringify({ commit, branch: ciBranch || null, mode: isProd ? 'production' : 'staging', builtAt: new Date().toISOString(), reports: reportsInfo }, null, 1));
console.log(`postbuild: deploy-info.json commit=${commit.slice(0, 7) || '?'} reports=${reportsInfo.length}`);
