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
  "img-src 'self' data: https://images.squarespace-cdn.com https://static1.squarespace.com https://i.ytimg.com",
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

/favicon.ico
  Cache-Control: public, max-age=86400
`;
writeFileSync(join(DIST, '_headers'), headers);

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
const sitemap = extra.length ? fixed.replace('</urlset>', extra.join('') + '</urlset>') : fixed;
const pages = [...known];
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

writeFileSync(
  join(DIST, 'robots.txt'),
  isProd ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
);
console.log(`postbuild: ${pages.length} pages, mode=${isProd ? 'PRODUCTION' : 'staging (noindex)'}`);
