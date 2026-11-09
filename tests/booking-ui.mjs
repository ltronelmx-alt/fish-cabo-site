// Browser test of the /book-now customer flow (Playwright, desktop + mobile) against `wrangler dev` (local D1).
// Usage: node tests/booking-ui.mjs [baseUrl]   — needs a running Worker (see tests/booking.mjs header). Uses Wise (no Stripe call).
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // global install (same as tests/qa.mjs)

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || '/tmp/bk-shots';
const results = []; const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const browser = await chromium.launch();

async function run(label, ctxOpts, boatId, number, hours, total, deposit) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  const reqs = []; p.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(r.url()); });
  await p.goto(`${BASE}/book-now?boat=${boatId}`, { waitUntil: 'networkidle' });
  const html = await p.content();
  t(`${label}: page source has no price/deposit amount`, !/\$\s?\d/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));
  t(`${label}: boat #${number} preselected from the boat page link`, await p.locator(`input[name=boat][value=${boatId}]`).isChecked());
  const d6 = await p.locator('label[data-h="6"]').isVisible(), d8 = await p.locator('label[data-h="8"]').isVisible();
  t(`${label}: durations shown = ${number === 1 ? '6 h only' : '6 h and 8 h'}`, d6 && d8 === (number !== 1));
  if (number !== 1) await p.locator(`input[name=duration][value="${hours}"]`).check();
  await p.waitForSelector('#s-date:not([hidden]) .day.s-available');
  t(`${label}: SHOW MY PRICE hidden until a date is chosen`, await p.locator('#s-price').isHidden());
  // next month, first available day (well beyond the 24 h notice)
  await p.locator('.bk-nav[data-m="1"]').click(); await p.waitForTimeout(400);
  const day = p.locator('.day.s-available').first(); const date = await day.getAttribute('data-d'); await day.click();
  t(`${label}: no price displayed before SHOW MY PRICE`, (await p.locator('#quote').isHidden()) && !(await p.locator('body').innerText()).includes(`$${total.toLocaleString('en-US')}`));
  await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
  const qtxt = await p.locator('#quote').innerText();
  t(`${label}: quote = $${total.toLocaleString('en-US')} USD for that boat/duration/date, 6% card fee disclosed`, qtxt.includes(`$${total.toLocaleString('en-US')} USD`) && qtxt.includes(`Boat #${number}`) && qtxt.includes(`${hours}-hour`) && /6% processing fee/.test(qtxt), qtxt);
  t(`${label}: contact details not requested before the price`, await p.locator('#s-details').isHidden());
  if (ctxOpts.viewport?.width < 500 || ctxOpts.isMobile) await p.screenshot({ path: `${SHOTS}/${label}-quote.png`, fullPage: false });
  if (number !== 1) {
    // changing the duration invalidates the quote
    await p.locator(`input[name=duration][value="${hours === 6 ? 8 : 6}"]`).check(); await p.waitForTimeout(300);
    t(`${label}: changing the duration hides the old quote`, await p.locator('#quote').isHidden());
    await p.locator(`input[name=duration][value="${hours}"]`).check(); await p.waitForTimeout(400);
    await p.locator(`.day[data-d="${date}"]`).click(); // the calendar stays on the month being viewed
    await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
  }
  await p.locator('#continue').click();
  t(`${label}: details step after CONTINUE`, await p.locator('#s-details').isVisible());
  await p.fill('input[name=fname]', 'Ui'); await p.fill('input[name=lname]', 'Tester'); await p.fill('input[name=email]', 'ui@example.test'); await p.fill('input[name=phone]', '+1 555 000 1111');
  await p.selectOption('select[name=people]', '2');
  await p.locator('#to-pay').click(); await p.waitForSelector('#s-pay:not([hidden])');
  await p.locator('input[name=payment][value=stripe]').check();
  let sum = await p.locator('#sum').innerText();
  const fee = (deposit * 0.06).toFixed(2), charge = (deposit * 1.06).toLocaleString('en-US', { minimumFractionDigits: 2 });
  t(`${label}: card summary — total, deposit ${deposit}, fee $${fee}, charged now $${charge}, balance ${total - deposit} cash`, sum.includes(`$${total.toLocaleString('en-US')} USD`) && sum.includes(`$${deposit.toLocaleString('en-US')} USD`) && sum.includes(`$${fee} USD`) && sum.includes(`$${charge} USD`) && sum.includes(`$${(total - deposit).toLocaleString('en-US')} USD`), sum);
  await p.locator('input[name=payment][value=wise]').check();
  sum = await p.locator('#sum').innerText();
  t(`${label}: Wise summary — no fee, charged now = deposit`, sum.includes('None (Wise)') && sum.includes(`$${deposit.toLocaleString('en-US')}.00 USD`), sum);
  const legal = await p.locator('.bk-legal').innerText();
  t(`${label}: legal statement next to the pay button, no checkbox`, legal.startsWith('By completing your booking, you agree to our Terms & Conditions and acknowledge our Privacy Policy.') && (await p.locator('input[type=checkbox]').count()) === 0);
  if (ctxOpts.isMobile) await p.screenshot({ path: `${SHOTS}/${label}-summary.png`, fullPage: false });
  await p.locator('.bk-go').click(); await p.waitForURL(/\/book-now\/confirmation/, { timeout: 15000 });
  await p.waitForSelector('main h1'); const conf = await p.locator('main').innerText();
  t(`${label}: Wise booking → confirmation page (awaiting verification, not "confirmed")`, /Wise/i.test(conf) && !/booking is confirmed/i.test(conf), conf.slice(0, 200));
  t(`${label}: the price grid endpoint was never needed (only one quote per selection)`, reqs.filter((u) => u.includes('/api/booking/quote')).length <= 2);
  // same boat + date again → booked → WhatsApp request
  const p2 = await ctx.newPage(); await p2.goto(`${BASE}/book-now?boat=${boatId}`, { waitUntil: 'networkidle' });
  if (number !== 1) await p2.locator(`input[name=duration][value="${hours}"]`).check();
  await p2.waitForSelector('.day'); await p2.locator('.bk-nav[data-m="1"]').click(); await p2.waitForTimeout(400);
  await p2.locator(`.day[data-d="${date}"]`).click();
  const href = await p2.locator('#req').getAttribute('href'); const txt = decodeURIComponent(href.split('text=')[1] || '');
  t(`${label}: booked date → REQUEST AVAILABILITY opens WhatsApp +52 624 122 3506 with boat, date, duration`, (await p2.locator('#booked').isVisible()) && href.startsWith('https://wa.me/526241223506?text=') && txt.includes(`Boat #${number}`) && txt.includes(`Duration: ${hours} hours`) && txt.includes('Date: '), txt);
  t(`${label}: no SHOW MY PRICE on a booked date`, await p2.locator('#s-price').isHidden());
  await ctx.close();
}

import { mkdirSync } from 'node:fs'; mkdirSync(SHOTS, { recursive: true });
await run('desktop-boat1', { viewport: { width: 1366, height: 900 } }, 'boat-01', 1, 6, 350, 100);
await run('mobile-boat7', { ...devices['Pixel 7'] }, 'boat-07', 7, 8, 1900, 400);
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
