// Review carousels — behaviour tests. Run against a build made with
//   REVIEWS_FIXTURE=$PWD/tests/fixtures/reviews-demo.json npm run build   (DEMO data, local only)
// Usage: node tests/reviews.mjs [baseUrl] [--small]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { mapGoogle, mapTripadvisor } from '../scripts/fetch-reviews.mjs';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:8787';
const SMALL = process.argv.includes('--small');
const results = [];
const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('/tmp/shots', { recursive: true });

// ---- 1. data mapping (pure functions of the sync script, API-shaped inputs) ----
{
  const g = mapGoogle([
    { reviewId: 'a', starRating: 'FIVE', reviewer: { displayName: 'Ana Maria Lopez' }, comment: 'Great day', createTime: '2026-05-01T00:00:00Z' },
    { reviewId: 'b', starRating: 'FOUR', reviewer: { displayName: 'X' }, comment: 'ok', createTime: '2026-09-01T00:00:00Z' },
    { reviewId: 'c', starRating: 'FIVE', reviewer: { displayName: 'Bob' }, comment: '', createTime: '2026-09-01T00:00:00Z' },
    { reviewId: 'd', starRating: 'FIVE', reviewer: { isAnonymous: true }, comment: '(Translated by Google) Super\n\n(Original)\nGenial', createTime: '2026-08-01T00:00:00Z' },
    ...[1, 2, 3, 4, 5].map((i) => ({ reviewId: 'e' + i, starRating: 'FIVE', reviewer: { displayName: 'P' + i }, comment: 'x', createTime: `2026-0${i}-15T00:00:00Z` })),
  ]);
  t('sync: Google keeps only FIVE stars with text, max 5', g.length === 5 && g.every((r) => r.rating === 5 && r.text) && !g.some((r) => r.id === 'b' || r.id === 'c'));
  t('sync: Google newest first', g.every((r, i) => i === 0 || Date.parse(g[i - 1].date) >= Date.parse(r.date)), g.map((r) => r.date.slice(0, 7)).join(','));
  t('sync: Google translated review keeps the original text, anonymous name', g.find((r) => r.id === 'd')?.text === 'Genial' && g.find((r) => r.id === 'd')?.author === 'Google user');
  const a = mapGoogle([{ reviewId: 'a', starRating: 'FIVE', reviewer: { displayName: 'Ana Maria Lopez' }, comment: 'Great', createTime: '2026-05-01T00:00:00Z' }]);
  t('sync: Google display name shortened ("Ana L.")', a[0].author === 'Ana L.');
  const ta = mapTripadvisor([
    { id: 1, rating: 5, title: 'T', text: 'Good', published_date: '2026-10-01T00:00:00Z', url: 'https://www.tripadvisor.com/x', user: { username: 'u1', user_location: { name: 'Texas' } } },
    { id: 2, rating: 4, text: 'meh', published_date: '2026-10-02T00:00:00Z', user: { username: 'u2' } },
    { id: 3, rating: 5, text: 'Nice', published_date: '2026-10-03T00:00:00Z', user: { username: 'u3' } },
  ]);
  t('sync: Tripadvisor keeps only rating 5, newest first, keeps review URL', ta.length === 2 && ta[0].id === '3' && ta[1].url === 'https://www.tripadvisor.com/x' && ta[1].authorMeta === 'Texas');
  t('sync: empty API answer gives empty list (no simulated data)', mapGoogle([]).length === 0 && mapTripadvisor([]).length === 0);
}

const browser = await chromium.launch();
const errors = [];
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: 900 }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference', hasTouch: !!opts.touch });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(BASE + '/', { waitUntil: 'load' });
  return { ctx, p };
}
const st = (p, i) => p.evaluate((i) => window.__efcReviews[i].state(), i);

if (SMALL) {
  const { ctx, p } = await open();
  t('small: only Google carousel rendered (Tripadvisor empty → hidden)', (await p.locator('[data-rv]').count()) === 1 && (await p.locator('.rv-tripadvisor').count()) === 0);
  const s = await st(p, 0);
  t('small: 2 reviews on 3-per-view desktop → static, no autoplay, controls hidden', !s.loop && !s.playing && (await p.locator('.rv-google [data-next]').isHidden()));
  await ctx.close();
} else {
  // ---- 2. structure ----
  const { ctx, p } = await open();
  const sec = p.locator('.rv-section');
  t('section rendered once', (await sec.count()) === 1);
  t('heading text exact', (await p.locator('#rv-h').textContent()) === 'Real Fishing Experiences. Real 5-Star Reviews.');
  t('subtitle text exact', (await p.locator('.rv-sub').textContent()) === 'See what our guests say about their fishing adventures with Exotic Fish Cabo.');
  const next = await p.evaluate(() => document.querySelector('.rv-section').nextElementSibling?.textContent || '');
  t('placed immediately before the final section with the "Book Now" CTA (FAQ)', /Frequently Asked Questions/.test(next) && /Book Now/.test(next));
  t('two independent carousels (Google, Tripadvisor)', (await p.locator('.rv-google').count()) === 1 && (await p.locator('.rv-tripadvisor').count()) === 1);
  t('5 real cards each', (await p.locator('.rv-google .rv-card:not(.rv-clone)').count()) === 5 && (await p.locator('.rv-tripadvisor .rv-card:not(.rv-clone)').count()) === 5);
  t('non-5-star review never displayed', !(await p.content()).includes('MUST NOT APPEAR'));
  const ld = await p.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => x.textContent).join(' '));
  t('no review / aggregateRating structured data', !/"(Review|AggregateRating)"|reviewRating|aggregateRating/i.test(ld));
  const clones = await p.$$eval('.rv-clone', (c) => c.every((x) => x.getAttribute('aria-hidden') === 'true' && x.hasAttribute('inert')));
  t('loop clones are aria-hidden + inert', clones && (await p.locator('.rv-clone').count()) === 12);
  const links = await p.$$eval('.rv-section a', (a) => a.map((x) => [x.target, x.rel, x.href]));
  t('all outbound links open in new tab with rel=noopener nofollow', links.length > 0 && links.every(([tg, rel]) => tg === '_blank' && /noopener/.test(rel) && /nofollow/.test(rel)));
  t('"See all" links point to the official listings', links.some(([, , h]) => h === 'https://g.page/r/CVkU9WoXqp_DEBM') && links.some(([, , h]) => /tripadvisor\.com\/Attraction_Review-g152516-d9569970/.test(h)));
  t('platform branding present (logos with accessible names)', (await p.locator('.rv-google .rv-card:not(.rv-clone) .rv-plat[aria-label="Google"]').count()) === 5 && (await p.locator('.rv-tripadvisor .rv-card:not(.rv-clone) .rv-plat[aria-label="Tripadvisor"]').count()) === 5);
  t('star / bubble ratings with text alternative', (await p.locator('.rv-google .rv-card:not(.rv-clone) [aria-label="5 out of 5 stars"]').count()) === 5 && (await p.locator('.rv-tripadvisor .rv-card:not(.rv-clone) [aria-label="5 of 5 bubbles"]').count()) === 5);

  // ---- 3. autoplay & pauses ----
  await p.locator('.rv-google').scrollIntoViewIfNeeded();
  await p.mouse.move(5, 5);
  await sleep(400);
  let s0 = await st(p, 0);
  t('desktop: 3 cards per view, loop on, autoplay running', s0.pv === 3 && s0.loop && s0.playing, JSON.stringify(s0));
  await sleep(5600);
  let s1 = await st(p, 0);
  t('autoplay advances after ~5 s', s1.idx === (s0.idx + 1) % 5, `${s0.idx}→${s1.idx}`);
  await p.locator('.rv-google .rv-viewport').hover();
  await sleep(300);
  const h0 = (await st(p, 0)).idx;
  await sleep(5600);
  const sh = await st(p, 0);
  t('pauses on hover', sh.idx === h0 && !sh.playing && sh.reasons.hover);
  await p.mouse.move(5, 5);
  await sleep(200);
  t('resumes when mouse leaves', (await st(p, 0)).playing);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  t('pauses when tab hidden', !(await st(p, 0)).playing && !(await st(p, 1)).playing);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  t('resumes when tab visible again', (await st(p, 0)).playing);
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  t('pauses when out of viewport', !(await st(p, 0)).playing && (await st(p, 0)).reasons.offscreen);
  await p.locator('.rv-google').scrollIntoViewIfNeeded();
  await sleep(500);
  t('resumes in viewport', (await st(p, 0)).playing);

  // ---- 4. controls ----
  const play = p.locator('.rv-google [data-play]');
  await play.click(); await p.mouse.move(5, 5); await sleep(200);
  t('pause button stops autoplay (aria-pressed=true, label "Play")', !(await st(p, 0)).playing && (await play.getAttribute('aria-pressed')) === 'true' && /^Play/.test(await play.getAttribute('aria-label')));
  t('Tripadvisor carousel independent (Google pause does not pause it)', !(await st(p, 1)).reasons.user);
  const tr = async () => p.evaluate(() => document.querySelector('.rv-google .rv-track').style.transform);
  let i0 = (await st(p, 0)).idx;
  await p.locator('.rv-google [data-next]').click(); await sleep(800);
  t('next arrow', (await st(p, 0)).idx === (i0 + 1) % 5);
  await p.locator('.rv-google [data-prev]').click(); await sleep(800);
  await p.locator('.rv-google [data-prev]').click(); await sleep(800);
  t('prev arrow', (await st(p, 0)).idx === (i0 + 4) % 5);
  // seamless loop: go to last, next → first, and the track is re-positioned on the real first card
  for (let k = 0; k < 10 && (await st(p, 0)).idx !== 4; k++) { await p.locator('.rv-google [data-next]').click(); await sleep(750); }
  await p.locator('.rv-google [data-next]').click(); await sleep(900);
  const step = await p.evaluate(() => { const c = document.querySelector('.rv-google .rv-card'); return c.getBoundingClientRect().width + 20; });
  const tx = parseFloat((await tr()).match(/-?[\d.]+/)[0]);
  t('seamless loop 5 → 1 (track snapped back onto real slide)', (await st(p, 0)).idx === 0 && Math.abs(tx + 3 * step) < 2, `tx=${tx} expected=${-3 * step}`);
  await p.locator('.rv-google .rv-viewport').focus();
  await p.keyboard.press('ArrowRight'); await sleep(800);
  t('keyboard ArrowRight', (await st(p, 0)).idx === 1);
  await p.keyboard.press('ArrowLeft'); await sleep(800);
  t('keyboard ArrowLeft', (await st(p, 0)).idx === 0);
  t('pauses while focused (keyboard users)', (await st(p, 0)).reasons.focus === true);
  const hidden = await p.$$eval('.rv-google .rv-card:not(.rv-clone)', (c) => c.map((x) => x.hasAttribute('inert')));
  t('off-screen real slides are inert (tab order = visible cards only)', hidden.filter((x) => !x).length === 3, JSON.stringify(hidden));

  // ---- 5. read more ----
  const more = p.locator('.rv-tripadvisor .rv-card:not(.rv-clone)').nth(1).locator('.rv-more');
  t('"Read more" shown only for long review', (await more.isVisible()) && (await p.locator('.rv-tripadvisor .rv-card:not(.rv-clone)').nth(0).locator('.rv-more').isHidden()));
  await p.evaluate(() => window.__efcReviews[1].root.querySelector('[data-play]').click()); // stop TA autoplay so the card stays put
  const hBefore = (await more.locator('xpath=..').boundingBox()).height;
  await more.click({ force: true }); await sleep(200);
  const hAfter = (await more.locator('xpath=..').boundingBox()).height;
  t('"Read more" expands the full text (aria-expanded=true)', hAfter > hBefore && (await more.getAttribute('aria-expanded')) === 'true', `${Math.round(hBefore)}→${Math.round(hAfter)}`);
  await more.click({ force: true });

  await p.locator('.rv-section').screenshot({ path: '/tmp/shots/reviews-1440.png' });
  await ctx.close();

  // ---- 6. tablet / mobile / swipe ----
  {
    const { ctx, p } = await open({ w: 1024 });
    await p.locator('.rv-google').scrollIntoViewIfNeeded();
    t('tablet 1024: 2 cards per view', (await st(p, 0)).pv === 2);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ w: 390, touch: true });
    await p.locator('.rv-google').scrollIntoViewIfNeeded(); await sleep(300);
    const s = await st(p, 0);
    const vw = await p.evaluate(() => ({ card: document.querySelector('.rv-google .rv-card:not(.rv-clone)').getBoundingClientRect().width, vp: document.querySelector('.rv-google .rv-viewport').clientWidth, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    t('mobile 390: exactly one card per view', s.pv === 1 && Math.abs(vw.card - vw.vp) < 10, JSON.stringify(vw));
    t('mobile: no horizontal page overflow', vw.sw <= vw.iw);
    const btns = await p.$$eval('.rv-google .rv-btn', (b) => b.map((x) => { const r = x.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    t('mobile: touch targets ≥ 44 px', btns.every((x) => x >= 44), btns.join(','));
    await p.locator('[data-play]').first().click(); // stop autoplay so only the swipe moves it
    const box = await p.locator('.rv-google .rv-viewport').boundingBox();
    const before = (await st(p, 0)).idx;
    await p.mouse.move(box.x + box.width * 0.8, box.y + 120); await p.mouse.down();
    for (let k = 1; k <= 8; k++) await p.mouse.move(box.x + box.width * (0.8 - k * 0.07), box.y + 122);
    await p.mouse.up(); await sleep(900);
    t('swipe left → next review', (await st(p, 0)).idx === (before + 1) % 5);
    await p.mouse.move(box.x + box.width * 0.2, box.y + 120); await p.mouse.down();
    for (let k = 1; k <= 8; k++) await p.mouse.move(box.x + box.width * (0.2 + k * 0.07), box.y + 122);
    await p.mouse.up(); await sleep(900);
    t('swipe right → previous review', (await st(p, 0)).idx === before);
    await p.locator('[data-play]').first().click();
    await p.locator('.rv-section').screenshot({ path: '/tmp/shots/reviews-390.png' });
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ reduce: true });
    await p.locator('.rv-google').scrollIntoViewIfNeeded(); await sleep(300);
    const s = await st(p, 0);
    t('prefers-reduced-motion: no autoplay, button shows "Play"', !s.playing && (await p.locator('.rv-google [data-play]').getAttribute('aria-pressed')) === 'true');
    await p.locator('.rv-google [data-next]').click(); await sleep(100);
    t('reduced motion: arrows still work, instantly', (await st(p, 0)).idx === 1);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(BASE + '/');
    const ok = await p.evaluate(() => getComputedStyle(document.querySelector('.rv-viewport')).overflowX === 'auto' && document.querySelectorAll('.rv-card').length === 10);
    t('without JavaScript: all reviews readable (native horizontal scroll, no clones)', ok);
    await ctx.close();
  }
}
t('no console / page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
