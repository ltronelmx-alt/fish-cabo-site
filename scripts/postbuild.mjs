// Runs after `astro build`. Writes _headers, robots.txt and sitemap.xml.
// Staging (default): everything is noindex and robots.txt blocks all crawlers.
// Production: only when PUBLIC_SITE_ENV=production is set explicitly.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const SITE = 'https://fish-cabo.com';
const isProd = process.env.PUBLIC_SITE_ENV === 'production';

const csp = [
  "default-src 'self'",
  "img-src 'self' data:",
  "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com",
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

// Sitemap from the generated HTML files (404 excluded).
const pages = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== '_astro') walk(p); continue; }
    if (!f.endsWith('.html') || f === '404.html') continue;
    let path = '/' + relative(DIST, p).replace(/\\/g, '/').replace(/\.html$/, '');
    path = path === '/index' ? '/' : path.replace(/\/index$/, '');
    pages.push({ path, mtime: statSync(p).mtime });
  }
};
walk(DIST);
pages.sort((a, b) => (a.path === '/' ? -1 : a.path.localeCompare(b.path)));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p.path === '/' ? '/' : p.path}</loc><lastmod>${p.mtime.toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

writeFileSync(
  join(DIST, 'robots.txt'),
  isProd ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
);
console.log(`postbuild: ${pages.length} pages, mode=${isProd ? 'PRODUCTION' : 'staging (noindex)'}`);
