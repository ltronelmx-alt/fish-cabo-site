// Automated QA for the staging build (run against `wrangler dev`).
// Usage: node tests/qa.mjs [baseUrl]   (requires Playwright)
import { createRequire } from 'module';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = [];
const rec = (area, test, ok, detail = '') => { results.push({ area, test, ok, detail: String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${area} — ${test}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`); };

// All routes from the build output
const routes = [];
const walk = (d, pre = '') => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!['_astro', 'media', 'fonts', 'js', 'admin'].includes(f)) walk(p, pre + '/' + f); } else if (f.endsWith('.html') && f !== '404.html') routes.push((pre + '/' + f.replace(/\.html$/, '')).replace(/\/index$/, '') || '/'); } };
walk('dist');

// 1. HTTP status of every route + every internal link found in the pages
const links = new Map();
for (const r of routes) {
  const res = await fetch(BASE + encodeURI(r));
  rec('Routes', `GET ${r}`, res.status === 200, res.status);
  const html = await res.text();
  for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) { const h = m[1].replace(/&amp;/g, '&'); if (!h.startsWith('/_astro') && !h.startsWith('/fonts')) links.set(h, r); }
  for (const m of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) for (const part of m[1].split(',')) { const u = part.trim().split(' ')[0]; if (u.startsWith('/media/')) links.set(u, r); }
}
let broken = 0;
for (const [h, from] of links) {
  const res = await fetch(BASE + h, { redirect: 'manual' });
  const ok = res.status === 200 || (res.status >= 300 && res.status < 400);
  if (!ok) { broken++; rec('Links', `${h} (from ${from})`, false, res.status); }
}
rec('Links', `all ${links.size} internal links and images resolve`, broken === 0, `${broken} broken`);

// 2. Special routes
const r404 = await fetch(BASE + '/this-page-does-not-exist'); rec('Routing', '404 page for unknown URL', r404.status === 404, r404.status);
const rOff = await fetch(BASE + '/fishing-reports?offset=1784496649612'); const tOff = await rOff.text();
rec('Routing', 'Squarespace pagination ?offset= serves older posts', rOff.status === 200 && /Newer Posts/.test(tOff), rOff.status);
const rSlash = await fetch(BASE + '/fishing-boats/', { redirect: 'manual' }); rec('Routing', 'trailing slash redirects to canonical URL', [301, 307, 308].includes(rSlash.status), rSlash.status);
const hdr = (await fetch(BASE + '/')).headers;
for (const h of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'strict-transport-security', 'x-frame-options', 'x-robots-tag'])
  rec('Security headers', h, !!hdr.get(h), hdr.get(h)?.slice(0, 80));
rec('Staging protection', 'X-Robots-Tag noindex on pages', /noindex/.test(hdr.get('x-robots-tag') || ''));
rec('Staging protection', 'robots.txt blocks all crawlers', /Disallow: \//.test(await (await fetch(BASE + '/robots.txt')).text()));
const sm = await (await fetch(BASE + '/sitemap.xml')).text();
{ const locs = (x) => [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); const imgs = (x) => (x.match(/<image:loc>/g) || []).length;
  const orig = readFileSync('src/data/original-sitemap.xml', 'utf8').replace('<loc>https://fish-cabo.com/cabo-fishing</loc>', '<loc>https://fish-cabo.com/</loc>');
  rec('SEO', 'sitemap.xml: same page URLs as the original (F7: homepage instead of /cabo-fishing), same number of images, images self-hosted (F9)', JSON.stringify(locs(sm).slice(0, locs(orig).length)) === JSON.stringify(locs(orig)) && imgs(sm) === imgs(orig) && !/squarespace/.test(sm)); }
const apiEv = await fetch(BASE + '/api/event', { method: 'POST', body: JSON.stringify({ event: 'qa_test', page: '/' }) }); rec('Worker', '/api/event accepts click beacons', apiEv.status === 204, apiEv.status);
const apiBad = await fetch(BASE + '/api/contact', { method: 'POST', body: new URLSearchParams({ email: 'x' }) }); const jb = await apiBad.json();
rec('Contact form', 'server rejects incomplete submission', apiBad.status === 400 && !jb.ok, JSON.stringify(jb));
const apiBot = await fetch(BASE + '/api/contact', { method: 'POST', body: new URLSearchParams({ website: 'spam' }) }); rec('Contact form', 'honeypot silently drops bots', apiBot.status === 200);

// 3. Browser tests
const b = await chromium.launch();
const errors = [];
for (const [vw, label] of [[375, 'mobile'], [768, 'tablet'], [1440, 'desktop']]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${label} ${p.url()} ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/challenges\.cloudflare|turnstile|net::ERR|Failed to load resource/i.test(m.text())) errors.push(`${label} ${p.url()} console: ${m.text()}`); });
  let overflow = [];
  for (const r of routes) {
    await p.goto(BASE + encodeURI(r), { waitUntil: 'domcontentloaded' });
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(r);
  }
  rec('Layout', `no horizontal scrolling on ${routes.length} pages (${label} ${vw}px)`, overflow.length === 0, overflow.join(', '));
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (vw >= 801) {
    await p.hover('.dd-toggle'); await p.waitForTimeout(200);
    rec('Navigation', `dropdown opens on hover (${label})`, await p.isVisible('.dd-panel'));
    await p.mouse.move(5, 600); await p.click('.dd-toggle'); await p.waitForTimeout(150);
    rec('Navigation', `dropdown opens on click (${label})`, await p.isVisible('.dd-panel'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await p.mouse.move(5, 600); await p.waitForTimeout(150);
    rec('Accessibility', `Escape closes dropdown (${label})`, !(await p.evaluate(() => document.querySelector('.dd')?.classList.contains('open'))));
    const bookHref = await p.getAttribute('.hdr-cta .cta-book', 'href'); rec('Booking', 'header BOOK NOW → /fishing-boats', bookHref === '/fishing-boats', bookHref);
    const gps = await p.getAttribute('.hdr-cta .cta-gps', 'href'); rec('Directions', 'MARINA GPS → 23.060275,-109.670677', /23\.060275%2C-109\.670677/.test(gps), gps);
  } else {
    await p.click('.burger'); await p.waitForTimeout(200);
    rec('Navigation', `mobile menu opens (${label})`, await p.isVisible('#mobile-menu'));
    await p.click('.mmenu summary'); await p.waitForTimeout(150);
    rec('Navigation', `mobile "Explore Fishing" submenu expands (${label})`, await p.isVisible('.mmenu-sub a'));
    await p.click('.burger'); await p.waitForTimeout(150);
    rec('Navigation', `mobile menu closes (${label})`, !(await p.isVisible('#mobile-menu')));
    rec('Booking', `mobile bottom bar BOOK NOW visible (${label})`, await p.isVisible('.mbar .cta-book'));
  }
  // Chatbot: 3 languages
  if (label !== 'tablet') for (const [lang, q, expect] of [['en', 'How much does it cost?', /\$|USD|price/i], ['es', '¿Cuánto cuesta?', /\$|USD|precio/i], ['fr', 'Quel est le prix ?', /\$|USD|prix/i]]) {
    await p.goto(BASE + '/contact', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.clear());
    await p.click('#efc-chat-bubble'); await p.waitForTimeout(300);
    await p.click(`#btn-${lang}`); await p.waitForTimeout(200);
    await p.fill('#efc-input', q); await p.keyboard.press('Enter'); await p.waitForTimeout(1800);
    const last = await p.evaluate(() => [...document.querySelectorAll('#efc-messages .efc-bot')].pop()?.textContent || '');
    rec('Chatbot', `${lang.toUpperCase()} answers a price question (${label})`, expect.test(last), last.replace(/\s+/g, ' ').slice(0, 120));
    const wa = await p.evaluate(() => [...document.querySelectorAll('#efc-messages a')].map((a) => a.getAttribute('href')).find((h) => h?.includes('wa.me')) || '');
    if (lang === 'en' && label === 'desktop') rec('Chatbot', 'WhatsApp handoff link → +526241223506', !wa || /wa\.me\/526241223506/.test(wa), wa || '(no WhatsApp action in this answer)');
  }
  // Contact form client validation
  await p.goto(BASE + '/contact', { waitUntil: 'domcontentloaded' });
  await p.click('#contact-form button[type=submit]'); await p.waitForTimeout(200);
  rec('Contact form', `empty submit is blocked with a message (${label})`, /required/i.test(await p.textContent('.cf-msg') || ''));
  await ctx.close();
}
rec('Runtime', 'no JavaScript errors in the browser', errors.length === 0, errors.slice(0, 5).join(' | '));
// Latest log = newest "San Jose del Cabo Fishing Log"
const home = await (await fetch(BASE + '/')).text();
const latestTitle = (home.match(/class="ll-title"[^>]*>([^<]+)</) || [])[1];
const files = readdirSync('src/content/fishing-reports').map((f) => readFileSync('src/content/fishing-reports/' + f, 'utf8'));
const logs = files.filter((t) => /category: "San Jose del Cabo Fishing Log"/.test(t) && /draft: false/.test(t)).map((t) => ({ d: t.match(/^date: (.+)$/m)[1], t: JSON.parse(t.match(/^title: (.+)$/m)[1]) })).sort((a, b) => b.d.localeCompare(a.d));
rec('Fishing Logs', 'homepage shows the newest published Fishing Log', latestTitle?.trim() === logs[0].t, `${latestTitle} / expected ${logs[0].t}`);
await b.close();
const fails = results.filter((r) => !r.ok);
writeFileSync('docs/qa-results.json', JSON.stringify({ base: BASE, date: new Date().toISOString(), total: results.length, failed: fails.length, results }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
