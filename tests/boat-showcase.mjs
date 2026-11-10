// /fishing-boats showcases (owner 2026-11-09): 10 large showcases, authentic slideshows, ONE action per boat.
// Real browser against wrangler dev (staging build). Usage: node tests/boat-showcase.mjs [baseUrl] [shotsDir]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787', SHOTS = process.argv[3] || '';
const data = JSON.parse(readFileSync('src/data/boat-showcase.json', 'utf8'));
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const b = await chromium.launch();
const loadAll = async (p) => { for (let y = 0; y < 30000; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(80); } await p.evaluate(() => window.scrollTo(0, 0)); };

for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['Pixel 7'] }]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = []; p.on('requestfailed', (r) => failed.push(r.url())); p.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await p.goto(BASE + '/fishing-boats', { waitUntil: 'networkidle' });
  const info = await p.evaluate(() => ({
    showcases: document.querySelectorAll('section.showcase').length,
    view: [...document.querySelectorAll('a, button')].filter((a) => /^\s*(view|more details|details)\b/i.test(a.textContent || '')).map((a) => a.textContent.trim()),
    actions: [...document.querySelectorAll('section.showcase')].map((s) => [...s.querySelectorAll('a')].map((a) => a.getAttribute('href'))),
    slides: [...document.querySelectorAll('section.showcase')].map((s) => s.querySelectorAll('.ss-slide').length),
    boatLinksInShowcases: [...document.querySelectorAll('section.showcase a[href^="/fishing-boats/"]')].length,
    guides: [...document.querySelectorAll('.boat-guides a')].map((a) => a.getAttribute('href')),
    prices: [...document.querySelectorAll('section.showcase')].some((s) => /\$\s?\d/.test(s.textContent)),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  t(`${label}: 10 large showcases`, info.showcases === 10);
  t(`${label}: ZERO "View …" / "More details" buttons on the page`, info.view.length === 0, JSON.stringify(info.view));
  t(`${label}: each showcase has exactly ONE link — BOOK THIS BOAT → /book-now?boat=boat-NN (right boat)`, info.actions.every((a, k) => a.length === 1 && a[0] === `/book-now?boat=${data.boats[k].id}`), JSON.stringify(info.actions));
  t(`${label}: no link to an individual boat page inside the showcases; 10 discreet links in "Boat specifications"`, info.boatLinksInShowcases === 0 && info.guides.length === 10);
  t(`${label}: slides per boat = authentic photos of that boat (${info.slides.join(',')})`, JSON.stringify(info.slides) === JSON.stringify(data.boats.map((x) => x.photos.length)));
  t(`${label}: no price or deposit in the showcases`, !info.prices);
  t(`${label}: no horizontal overflow`, !info.overflow);
  // autoplay: first slideshow advances by itself after ~4.5 s once visible
  const ss0 = p.locator('[data-ss]').first(); await ss0.scrollIntoViewIfNeeded();
  const i0 = await ss0.getAttribute('data-index'); await p.waitForTimeout(5200);
  const i1 = await ss0.getAttribute('data-index'); await p.waitForTimeout(4700);
  const i2 = await ss0.getAttribute('data-index');
  const scrolled = await ss0.evaluate((el) => el.querySelector('.ss-track').scrollLeft);
  t(`${label}: automatic slideshow really advances (${i0} → ${i1} → ${i2})`, i0 === '0' && i1 === '1' && (i2 === '0' || i2 === '2') && (i2 !== '1') && (i1 === '1' ? true : scrolled > 0));
  // arrows / dots / counter and pause on interaction (boat #10: 8 photos)
  const ss = p.locator('#boat-10 [data-ss]'); await ss.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await ss.locator('.ss-next').click(); await p.waitForTimeout(700);
  const afterNext = await ss.getAttribute('data-index'); const counter = await ss.locator('.ss-count').innerText();
  await ss.locator('.ss-dot').nth(5).click(); await p.waitForTimeout(700);
  const afterDot = await ss.getAttribute('data-index');
  await ss.locator('.ss-prev').click(); await p.waitForTimeout(700);
  const afterPrev = await ss.getAttribute('data-index'); const auto = await ss.getAttribute('data-autoplay');
  await p.waitForTimeout(5000); const still = await ss.getAttribute('data-index');
  t(`${label}: next / dot / previous / counter work (${afterNext}, ${afterDot}, ${afterPrev}, "${counter}")`, afterNext === '1' && counter.replace(/\s/g, '') === '2/8' && afterDot === '5' && afterPrev === '4');
  t(`${label}: autoplay stops after the visitor interacts`, auto === 'off' && still === afterPrev);
  if (label === 'mobile') {
    const s7 = p.locator('#boat-7 [data-ss]'); await s7.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    const box = await s7.locator('.ss-track').boundingBox();
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await s7.locator('.ss-track').evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: 'auto' })); await p.waitForTimeout(600);
    t('mobile: swipe (scroll-snap) moves to the next photo and stops autoplay', (await s7.getAttribute('data-index')) === '1' && (await s7.getAttribute('data-autoplay')) === 'off');
  }
  // every photo loads (lazy-loaded) — scroll through and check
  await loadAll(p); await p.waitForTimeout(800);
  for (const s of await p.locator('[data-ss] .ss-track').all()) { await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); const n = await s.evaluate((el) => el.children.length); for (let k = 0; k < n; k++) { await s.evaluate((el, x) => el.scrollTo({ left: x * el.clientWidth, behavior: 'auto' }), k); await p.waitForTimeout(250); } }
  await p.waitForFunction(() => [...document.querySelectorAll('.ss-slide img')].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 }).catch(() => {});
  const broken = await p.evaluate(() => [...document.querySelectorAll('.ss-slide img')].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.currentSrc || i.src));
  t(`${label}: all ${data.boats.reduce((s, x) => s + x.photos.length, 0)} slideshow photos load`, broken.length === 0, broken.join(', '));
  t(`${label}: no JavaScript error, no failed request`, errors.length === 0 && failed.length === 0, [...errors, ...failed].join(' | '));
  if (SHOTS) {
    for (const k of label === 'desktop' ? [1, 2, 10] : [3]) { const s = p.locator(`#boat-${k}`); await s.scrollIntoViewIfNeeded(); await s.locator('.ss-track').evaluate((el) => el.scrollTo({ left: 0, behavior: 'auto' })); await p.waitForTimeout(500); await s.screenshot({ path: `${SHOTS}/showcase-${label}-boat${k}.png` }); }
    if (label === 'mobile') await p.screenshot({ path: `${SHOTS}/fishing-boats-mobile-full.png`, fullPage: true });
  }
  await ctx.close();
}
// reduced motion: no autoplay
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await ctx.newPage();
await p.goto(BASE + '/fishing-boats', { waitUntil: 'networkidle' }); const ss0 = p.locator('[data-ss]').first(); await ss0.scrollIntoViewIfNeeded(); await p.waitForTimeout(5500);
t('reduced motion: no automatic transitions (arrows still available)', (await ss0.getAttribute('data-index')) === '0' && (await ss0.getAttribute('data-autoplay')) === 'off' && (await ss0.locator('.ss-next').isVisible()));
// booking links really preselect the boat
const badBook = [];
for (const x of data.boats) {
  await p.goto(`${BASE}/fishing-boats#boat-${x.number}`); await p.locator(`#boat-${x.number} .sc-book`).click(); await p.waitForURL(/\/book-now/); await p.waitForTimeout(800);
  const ok = await p.evaluate((id) => document.querySelector(`input[name=boat][value="${id}"]`)?.checked, x.id);
  if (!ok || !p.url().endsWith(`/book-now?boat=${x.id}`)) badBook.push(x.number);
  await p.evaluate(() => sessionStorage.clear());
}
t('all 10 BOOK THIS BOAT buttons open /book-now with the right boat preselected', badBook.length === 0, JSON.stringify(badBook));
await ctx.close(); await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
