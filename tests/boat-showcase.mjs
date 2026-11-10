// /fishing-boats showcases (owner 2026-11-09): 10 large showcases, authentic slideshows, ONE action per boat.
// Real browser against wrangler dev (staging build). Usage: node tests/boat-showcase.mjs [baseUrl] [shotsDir]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787', SHOTS = process.argv[3] || '';
const data = JSON.parse(readFileSync('src/data/boat-showcase.json', 'utf8'));
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const b = await chromium.launch();
const loadAll = async (p) => { for (let y = 0; y < 30000; y += 500) { await p.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y); await p.waitForTimeout(80); } await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); };

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
    specText: /boat specifications/i.test(document.body.innerText),
    boatPageLinks: document.querySelectorAll('a[href^="/fishing-boats/"], a[href*="fish-cabo.com/fishing-boats/"]').length,
    prices: [...document.querySelectorAll('section.showcase')].some((s) => /\$\s?\d/.test(s.textContent)),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  t(`${label}: 10 large showcases`, info.showcases === 10);
  t(`${label}: ZERO "View …" / "More details" buttons on the page`, info.view.length === 0, JSON.stringify(info.view));
  t(`${label}: each showcase has exactly ONE link — BOOK THIS BOAT → /book-now?boat=boat-NN (right boat)`, info.actions.every((a, k) => a.length === 1 && a[0] === `/book-now?boat=${data.boats[k].id}`), JSON.stringify(info.actions));
  t(`${label}: no "Boat specifications" section and no link to an individual boat page anywhere on the page (owner 2026-11-09)`, info.boatLinksInShowcases === 0 && info.guides.length === 0 && !info.specText && info.boatPageLinks === 0);
  t(`${label}: slides per boat = authentic photos of that boat (${info.slides.join(',')})`, JSON.stringify(info.slides) === JSON.stringify(data.boats.map((x) => x.photos.length)));
  t(`${label}: no price or deposit in the showcases`, !info.prices);
  t(`${label}: no horizontal overflow`, !info.overflow);
  // Boat #10: one visible model name on the page (the specs list with the other name is gone)
  const txt = await p.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);
  t(`${label}: Boat #10 shown only as "${data.boats[9].title}" (no "Ultimate Fishing Machine" visible)`, txt.toLowerCase().includes(data.boats[9].title.toLowerCase()) && !/ultimate fishing machine/i.test(txt));
  // ALL 10 slideshows: each advances on its own every ~3 s while on screen (2 transitions each)
  const all = await p.locator('[data-ss]').all();
  const bad = [];
  for (const [k, ss] of all.entries()) {
    await ss.evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(150);
    const t0 = Date.now(); const a0 = await ss.getAttribute('data-index');
    await ss.evaluate((el) => new Promise((r) => { const s = el.dataset.index; const o = new MutationObserver(() => { if (el.dataset.index !== s) { o.disconnect(); r(); } }); o.observe(el, { attributes: true }); setTimeout(r, 4500); }));
    const t1 = Date.now(); const a1 = await ss.getAttribute('data-index');
    await ss.evaluate((el) => new Promise((r) => { const s = el.dataset.index; const o = new MutationObserver(() => { if (el.dataset.index !== s) { o.disconnect(); r(); } }); o.observe(el, { attributes: true }); setTimeout(r, 4500); }));
    const t2 = Date.now(); const a2 = await ss.getAttribute('data-index');
    const n = await ss.locator('.ss-slide').count();
    const gap = t2 - t1; const sl = await ss.evaluate((el) => Math.round(el.querySelector('.ss-track').scrollLeft / el.querySelector('.ss-track').clientWidth));
    const ok = +a1 === (+a0 + 1) % n && +a2 === (+a1 + 1) % n && gap > 2600 && gap < 3500 && t1 - t0 < 3500;
    if (!ok) bad.push(`#${k + 1}: ${a0}→${a1}→${a2} gap ${gap}ms`);
    if (k === 0) t(`${label}: slideshow #1 timing ${a0}→${a1}→${a2}, interval ${gap} ms, photo shown = ${sl}`, ok && sl === +a2);
  }
  t(`${label}: all 10 slideshows advance automatically, one photo every ~3 s`, bad.length === 0, bad.join('; '));
  // out of view → stops; back in view → resumes
  const s1 = p.locator('#boat-1 [data-ss]'); await s1.evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(300);
  await p.locator('#boat-6').evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(300);
  const offState = await s1.getAttribute('data-autoplay'); const offIdx = await s1.getAttribute('data-index'); await p.waitForTimeout(4000);
  const offIdx2 = await s1.getAttribute('data-index');
  await s1.evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(200);
  const backState = await s1.getAttribute('data-autoplay'); await p.waitForTimeout(3300); const backIdx = await s1.getAttribute('data-index');
  t(`${label}: out of view = stopped (${offState}, ${offIdx}→${offIdx2}); back in view = resumes (${backState}, →${backIdx})`, offState === 'off' && offIdx === offIdx2 && backState === 'on' && backIdx !== offIdx2);
  // arrows / dots / counter + 8 s pause then resume (boat #10: 8 photos)
  const ss = p.locator('#boat-10 [data-ss]'); await ss.evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(300);
  await ss.locator('.ss-dot').nth(0).click(); await p.waitForTimeout(300);
  await ss.locator('.ss-next').click(); await p.waitForTimeout(700);
  const afterNext = await ss.getAttribute('data-index'); const counter = await ss.locator('.ss-count').innerText();
  await ss.locator('.ss-dot').nth(5).click(); await p.waitForTimeout(700);
  const afterDot = await ss.getAttribute('data-index');
  await ss.locator('.ss-prev').click(); const tPrev = Date.now(); await p.waitForTimeout(700);
  const afterPrev = await ss.getAttribute('data-index'); const auto = await ss.getAttribute('data-autoplay');
  t(`${label}: next / dot / previous / counter work (${afterNext}, ${afterDot}, ${afterPrev}, "${counter}")`, afterNext === '1' && counter.replace(/\s/g, '') === '2/8' && afterDot === '5' && afterPrev === '4');
  await p.waitForTimeout(7900 - (Date.now() - tPrev) - 400); const during = await ss.getAttribute('data-index');
  await p.waitForTimeout(1500); const resumed = await ss.getAttribute('data-index'); const st = await ss.getAttribute('data-autoplay');
  t(`${label}: manual interaction pauses 8 s (still ${during}) then resumes (${resumed}, ${st})`, auto === 'hold' && during === '4' && resumed === '5' && st === 'on');
  // Pause / Play button
  const btn = ss.locator('.ss-play');
  const lbl0 = await btn.getAttribute('aria-label'); await btn.click(); const pi = await ss.getAttribute('data-index');
  await p.waitForTimeout(3800); const pi2 = await ss.getAttribute('data-index');
  const lbl1 = await btn.getAttribute('aria-label'); const pr = await btn.getAttribute('aria-pressed'); const pst = await ss.getAttribute('data-autoplay');
  await btn.click(); await p.waitForTimeout(3400); const pi3 = await ss.getAttribute('data-index');
  t(`${label}: Pause/Play — "${lbl0}" stops (${pi}→${pi2}, ${pst}, aria-pressed=${pr}), "${lbl1}" restarts (→${pi3})`, lbl0 === 'Pause slideshow' && pi === pi2 && pst === 'off' && pr === 'true' && lbl1 === 'Play slideshow' && pi3 !== pi2 && (await btn.getAttribute('aria-pressed')) === 'false');
  // tab hidden → stops
  const hid = await ss.evaluate(async (el) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); const a = el.dataset.autoplay, i0 = el.dataset.index; await new Promise((r) => setTimeout(r, 3600)); const i1 = el.dataset.index; delete document.hidden; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); return { a, same: i0 === i1, back: el.dataset.autoplay }; });
  t(`${label}: hidden tab = stopped (${hid.a}), visible again = ${hid.back}`, hid.a === 'off' && hid.same && hid.back === 'on');
  // no duplicate timers: count autoplay ticks over 10 s on one slideshow (expected 3, never more)
  const ticks = await ss.evaluate(async (el) => { const s = +(el.dataset.autoTicks || 0); await new Promise((r) => setTimeout(r, 10000)); return +(el.dataset.autoTicks || 0) - s; });
  t(`${label}: one timer only — ${ticks} automatic moves in 10 s`, ticks === 3);
  if (label === 'mobile') {
    const s7 = p.locator('#boat-7 [data-ss]'); await s7.evaluate((el) => el.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(300);
    await s7.locator('.ss-dot').nth(0).click(); await p.waitForTimeout(8600);
    // real touch swipe
    await p.evaluate(() => scrollBy({ top: -250, behavior: 'instant' })); await p.waitForTimeout(300); // track clear of the fixed header
    const box = await s7.locator('.ss-track').boundingBox(); const y = Math.round(box.y + box.height / 2), x0 = Math.round(box.x + box.width * 0.85);
    const cdp = await ctx.newCDPSession(p); const i0 = +(await s7.getAttribute('data-index'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - k * 25, y }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(700);
    const i1 = +(await s7.getAttribute('data-index')); const st7 = await s7.getAttribute('data-autoplay');
    t(`mobile: touch swipe moves to the next photo (${i0}→${i1}) and holds autoplay (${st7})`, i1 === (i0 + 1) % 5 && st7 === 'hold');
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
t('reduced motion: no automatic transitions, Pause button hidden, arrows still work', (await ss0.getAttribute('data-index')) === '0' && (await ss0.getAttribute('data-autoplay')) === 'off' && !(await ss0.locator('.ss-play').isVisible()) && (await ss0.locator('.ss-next').click().then(() => p.waitForTimeout(400)).then(() => ss0.getAttribute('data-index'))) === '1');
// booking links really preselect the boat
const badBook = [];
for (const x of data.boats) {
  await p.goto(`${BASE}/fishing-boats#boat-${x.number}`); await p.locator(`#boat-${x.number} .sc-book`).click(); await p.waitForURL(/\/book-now/); await p.waitForTimeout(800);
  const ok = await p.evaluate((id) => document.querySelector(`input[name=boat][value="${id}"]`)?.checked, x.id);
  if (!ok || !p.url().endsWith(`/book-now?boat=${x.id}`)) badBook.push(x.number);
  await p.evaluate(() => sessionStorage.clear());
}
const catalogue = JSON.parse(readFileSync('src/data/boats.json', 'utf8'));
const pages = [];
for (const x of catalogue.boats) { const r = await p.goto(BASE + x.url); const h = await p.evaluate(() => ({ c: document.querySelector('link[rel=canonical]')?.href, r: document.querySelector('meta[name=robots]')?.content || '' })); pages.push({ u: x.url, s: r.status(), ok: r.status() === 200 && !!h.c && !/noindex/i.test(h.r) }); }
t(`all 10 individual boat pages still answer 200 (canonical/indexability checked on the production build)`, pages.length === 10 && pages.every((x) => x.s === 200), JSON.stringify(pages.filter((x) => x.s !== 200)));
t('all 10 BOOK THIS BOAT buttons open /book-now with the right boat preselected', badBook.length === 0, JSON.stringify(badBook));
await ctx.close(); await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
