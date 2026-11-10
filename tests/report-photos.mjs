// Fishing Reports photos (owner 2026-11-10): every article shows its original featured photo once; listings show thumbnails;
// every image answers 200 and is really decoded, desktop + mobile. Usage: node tests/report-photos.mjs [base]
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const slugs = readdirSync('src/content/fishing-reports').filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
const RESTORED = slugs.filter((s) => readFileSync(`src/content/fishing-reports/${s}.md`, 'utf8').includes('fishing-reports-original/'));
t(`16 historical articles carry their restored original photo (image + thumbnail)`, RESTORED.length === 16, String(RESTORED.length));
const b = await chromium.launch();
const pages = [...slugs.map((s) => '/fishing-reports/' + s), '/fishing-reports', '/fishing-reports/older', '/fishing-reports/category/Fishing%20Report', '/fishing-reports/category/San%20Jose%20del%20Cabo%20Fishing%20Log', '/fishing-reports/tag/Rosterfish%20fishing', '/fishing-reports/tag/Tuna%20Fishing'];
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['Pixel 7'] }]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  const errors = [], failed = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  p.on('requestfailed', (r) => { if (r.resourceType() === 'image') failed.push(`failed ${r.url()}`); });
  const bad = [], dup = [], over = [];
  let listingThumbs = {};
  for (const path of pages) {
    await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(async () => {
      const imgs = [...document.querySelectorAll('main img')].filter((i) => !/avatar|logo/i.test(i.currentSrc || i.src) && !/logo/i.test(i.alt));
      for (const i of imgs) { i.loading = 'eager'; i.scrollIntoView({ block: 'center', behavior: 'instant' }); if (!i.complete) await new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }); }
      return { n: imgs.length, broken: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src), lead: document.querySelectorAll('.art-lead img').length,
        sq: imgs.filter((i) => /squarespace/.test(i.currentSrc || i.src)).length, wide: imgs.filter((i) => i.getBoundingClientRect().width > innerWidth + 1).length, ratioOk: imgs.every((i) => !i.naturalWidth || Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - i.naturalWidth / i.naturalHeight) < 0.03) };
    });
    if (path.startsWith('/fishing-reports/') && slugs.includes(path.split('/').pop())) { if (r.n !== 1) dup.push(`${path}: ${r.n} photos`); }
    else listingThumbs[path] = r.n;
    if (r.broken.length || r.sq) bad.push(`${path}: ${r.broken.join(',')} sq=${r.sq}`);
    if (r.wide || !r.ratioOk) over.push(`${path} wide=${r.wide} ratio=${r.ratioOk}`);
  }
  t(`${label}: all ${slugs.length} articles show exactly one photo (no duplicate, none missing)`, dup.length === 0, dup.join(' | '));
  t(`${label}: every photo on articles + listings decoded, self-hosted (no Squarespace), HTTP < 400`, bad.length === 0 && failed.length === 0, [...bad, ...failed].slice(0, 5).join(' | '));
  t(`${label}: photos keep their proportions, never wider than the screen`, over.length === 0, over.join(' | '));
  t(`${label}: listing thumbnails — /fishing-reports ${listingThumbs['/fishing-reports']}, older ${listingThumbs['/fishing-reports/older']}, categories/tags ≥ 1`, Object.values(listingThumbs).every((n) => n >= 1) && listingThumbs['/fishing-reports/older'] >= 16, JSON.stringify(listingThumbs));
  // HTTP 200 for every restored file (all responsive widths + formats referenced by the 16 articles)
  if (label === 'desktop') {
    const urls = new Set();
    for (const s of RESTORED) { const h = await (await fetch(`${BASE}/fishing-reports/${s}`)).text(); for (const m of h.matchAll(/\/media\/fishing-reports-original\/[^"\s,]+/g)) urls.add(m[0]); }
    const codes = await Promise.all([...urls].map(async (u) => [u, (await fetch(BASE + u)).status]));
    t(`HTTP 200 for every restored photo file referenced (${urls.size} AVIF/WebP URLs)`, urls.size >= 16 * 4 && codes.every(([, c]) => c === 200), codes.filter(([, c]) => c !== 200).slice(0, 3).join(' | '));
    await p.goto(BASE + '/fishing-reports/roosterfish-fishing-san-jose-del-cabo-july2026-8zk48', { waitUntil: 'networkidle' });
    const pos = await p.evaluate(() => { const a = document.querySelector('.art-lead'), t = document.querySelector('main time'), h2 = document.querySelector('main h2'); return !!a && !!t && !!h2 && (t.compareDocumentPosition(a) & 4) && (a.compareDocumentPosition(h2) & 4) && document.querySelector('.art-lead img').alt === "Karim with his giant roosterfish, San José del Cabo"; });
    t('Karim: photo under the title/date/author, before the text, with its alt text', !!pos);
    await p.screenshot({ path: '/tmp/rp-karim-desktop.png' });
  } else {
    await p.goto(BASE + '/fishing-reports/roosterfish-fishing-san-jose-del-cabo-july2026-8zk48', { waitUntil: 'networkidle' }); await p.screenshot({ path: '/tmp/rp-karim-mobile.png' });
    await p.goto(BASE + '/fishing-reports/older', { waitUntil: 'networkidle' }); await p.screenshot({ path: '/tmp/rp-older-mobile.png', fullPage: false });
  }
  t(`${label}: no JavaScript error`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
