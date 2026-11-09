// Guided scrolling on /book-now (owner, 2026-11-09): boat → duration → calendar → SHOW MY PRICE → price.
// Desktop, Pixel 7, and Pixel 7 with "reduce motion". Usage: node tests/booking-scroll.mjs [baseUrl] (needs wrangler dev).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
try { execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', process.env.PERSIST || '/tmp/wpb', '--command', 'DELETE FROM rate_limits'], { stdio: 'ignore' }); } catch {}
const results = []; const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const browser = await chromium.launch();

/** target fully below the fixed header, in the upper part of the screen, and the page no longer moving */
async function inView(p, sel, wait) {
  await p.waitForTimeout(wait);
  const a = await p.evaluate((s) => { const h = document.getElementById('header').getBoundingClientRect().bottom; const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, h, vh: innerHeight, y: scrollY }; }, sel);
  await p.waitForTimeout(500);
  const y2 = await p.evaluate(() => scrollY);
  return { ok: a.top >= a.h - 1 && a.top <= a.h + 40 && a.top < a.vh * 0.6 && Math.abs(y2 - a.y) < 2, info: JSON.stringify({ ...a, y2 }) };
}

for (const [label, opts, wait] of [['desktop', { viewport: { width: 1366, height: 860 } }, 1200], ['mobile', { ...devices['Pixel 7'] }, 1200], ['mobile reduced-motion', { ...devices['Pixel 7'], reducedMotion: 'reduce' }, 250]]) {
  const ctx = await browser.newContext(opts); const p = await ctx.newPage();
  await p.goto(`${BASE}/book-now`, { waitUntil: 'networkidle' });
  await p.evaluate(() => sessionStorage.clear()); await p.reload({ waitUntil: 'networkidle' });
  const y0 = await p.evaluate(() => scrollY);
  t(`${label}: no automatic jump on page load`, y0 === 0, String(y0));
  // Boat #1 → its single 6-hour option
  await p.locator('.bk-boat[data-id="boat-01"]').click();
  let v = await inView(p, '#s-dur', wait);
  t(`${label}: boat #1 → scrolled to the duration step`, v.ok, v.info);
  t(`${label}: boat #1 shows only the 6-hour option`, (await p.locator('label[data-h="6"]').isVisible()) && (await p.locator('label[data-h="8"]').isHidden()));
  // Boat #7 → duration → calendar → date → SHOW MY PRICE → price
  await p.locator('.bk-boat[data-id="boat-07"]').scrollIntoViewIfNeeded(); await p.locator('.bk-boat[data-id="boat-07"]').click();
  v = await inView(p, '#s-dur', wait); t(`${label}: boat #7 → duration step`, v.ok, v.info);
  await p.locator('label[data-h="8"]').click();
  await p.waitForSelector('.day.s-available');
  v = await inView(p, '#s-date', wait); t(`${label}: 8 hours → calendar (after it is drawn)`, v.ok, v.info);
  await p.locator('.day.s-available').nth(3).click();
  v = await inView(p, '#s-price', wait); t(`${label}: available date → SHOW MY PRICE`, v.ok, v.info);
  t(`${label}: SHOW MY PRICE fully visible (not under the bottom bar)`, await p.evaluate(() => { const r = document.getElementById('show-price').getBoundingClientRect(); return r.bottom < innerHeight - 90; }));
  await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
  v = await inView(p, '#quote', wait); t(`${label}: SHOW MY PRICE → the price`, v.ok && (await p.locator('#quote').innerText()).includes('$1,900 USD'), v.info);
  // backward: change the duration → back to the calendar, boat kept, old price gone
  await p.locator('#s-dur').scrollIntoViewIfNeeded(); await p.locator('label[data-h="6"]').click();
  v = await inView(p, '#s-date', wait);
  t(`${label}: going back (6 hours) → calendar again, boat #7 kept, old price hidden`, v.ok && (await p.locator('input[value=boat-07]').isChecked()) && (await p.locator('#quote').isHidden()), v.info);
  t(`${label}: no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
