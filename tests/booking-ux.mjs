// Browser tests of the 5 booking UX requirements (owner, 2026-11-08) against `wrangler dev` (local D1) + a mock Stripe.
// Usage: PERSIST=/tmp/wpb node tests/booking-ux.mjs   (same wrangler dev command as tests/booking.mjs; port 8788 must be free)
//  1. CONTACT US + WHATSAPP at every step, no email / mailto, progress survives the detour
//  2. availability before payment, date taken during checkout → neutral message + alternative dates, details kept
//  3. exact summary (fee on the deposit only)   4. mobile: no overflow, 44 px targets, back navigation keeps data
//  5. back from Stripe → retry closes the old checkout (one reservation, one open payment)
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
// The synchronous `wrangler d1 execute` checks can leave the HTTP client idle long enough for the local server to close
// its keep-alive socket; a request that fails on such a stale socket never reached the Worker, so it is sent once more.
{ const f0 = globalThis.fetch; globalThis.fetch = async (...a) => { try { return await f0(...a); } catch (e) { if (e?.cause?.code === 'UND_ERR_SOCKET') return f0(...a); throw e; } }; }
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PERSIST = process.env.PERSIST || '/tmp/wpb';
const SHOTS = process.env.SHOTS || '/tmp/bk-shots'; mkdirSync(SHOTS, { recursive: true });
const results = []; const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;

// mock Stripe: sessions + a fake hosted checkout page
const sessions = new Map(); let n = 0;
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/pay/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Mock Stripe Checkout</title><h1>Mock Stripe Checkout</h1>'); }
    if (req.url === '/v1/checkout/sessions') { const id = `cs_test_ux_${++n}_${randomBytes(3).toString('hex')}`; const s = { id, url: `http://127.0.0.1:8788/pay/${id}`, status: 'open' }; sessions.set(id, s); return send(200, s); }
    const m = req.url.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/);
    if (m) { const s = sessions.get(m[1]); if (!s) return send(404, { error: { message: 'no such session' } }); s.status = 'expired'; return send(200, s); }
    send(404, {});
  });
});
await new Promise((r) => srv.listen(8788, '127.0.0.1', r));

sql('DELETE FROM rate_limits'); // all browser requests share one local IP: start each run with clean per-IP counters
const RUN = randomBytes(3).toString('hex'); // unique emails per run (the local database keeps earlier runs)
const browser = await chromium.launch();
const admin = async (path, body) => {
  const h = { 'content-type': 'application/json', origin: BASE, 'x-efc-admin': '1', 'cf-connecting-ip': '198.18.0.9' };
  const l = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: h, body: JSON.stringify({ password: 'test-admin-pass' }) });
  const cookie = (l.headers.get('set-cookie') || '').split(';')[0];
  return fetch(BASE + '/api/admin/' + path, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify(body) }).then((r) => r.json());
};
const helpOk = async (p, stepId) => {
  const st = p.locator(`#${stepId}`);
  const c = st.locator('.bk-help a[href="/contact"]'), w = st.locator('.bk-help a[href^="https://wa.me/526241223506"]');
  return (await c.isVisible()) && (await w.isVisible()) && (await c.innerText()) === 'CONTACT US' && (await w.innerText()) === 'WHATSAPP' && (await c.getAttribute('target')) === '_blank';
};
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function journey(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts); const p = await ctx.newPage();
  await p.goto(`${BASE}/book-now?boat=3`, { waitUntil: 'networkidle' });
  const steps = [];
  t(`${label}: no email address and no mailto: anywhere on /book-now`, !/mailto:|contact@fish-cabo\.com/i.test(await p.content()));
  steps.push(['s1', await p.locator('.bk-step').first().locator('.bk-help a[href="/contact"]').isVisible()]);
  steps.push(['s-dur', await helpOk(p, 's-dur')]);
  await p.locator('input[name=duration][value="8"]').check();
  await p.waitForSelector('.day.s-available'); await p.locator('.bk-nav[data-m="1"]').click(); await p.waitForTimeout(400);
  const date = await p.locator('.day.s-available').nth(2).getAttribute('data-d'); await p.locator(`.day[data-d="${date}"]`).click();
  steps.push(['s-date', await helpOk(p, 's-date')]); steps.push(['s-price', await helpOk(p, 's-price')]);
  await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
  t(`${label}: availability shown with the price ("Available ✓")`, (await p.locator('#quote').innerText()).includes('Available ✓'));
  await p.locator('#continue').click();
  steps.push(['s-details', await helpOk(p, 's-details')]);
  await p.fill('input[name=fname]', 'Ana'); await p.fill('input[name=lname]', 'Ux'); await p.fill('input[name=email]', `ana-${RUN}@example.test`); await p.fill('input[name=phone]', '+1 555 000 2222');
  await p.selectOption('select[name=people]', '3'); await p.fill('textarea[name=message]', 'Two kids aboard');
  await p.locator('#to-pay').click(); await p.waitForSelector('#s-pay:not([hidden])');
  steps.push(['s-pay', await helpOk(p, 's-pay')]);
  t(`${label}: CONTACT US + WHATSAPP visible at every step (6/6)`, steps.every(([, ok]) => ok), JSON.stringify(steps));
  const pp = p.locator('input[name=payment][value=paypal]');
  t(`${label}: PayPal shown as "PayPal — Coming Soon", disabled, no link`, (await pp.isDisabled()) && (await p.locator('.bk-payopts').innerText()).includes('PayPal — Coming Soon') && (await p.locator('.bk-payopts a').count()) === 0);
  t(`${label}: Wise notice hidden while no method / card is chosen`, await p.locator('#wise-note').isHidden());
  await p.locator('input[name=payment][value=wise]').check();
  const wn = p.locator('#wise-note'); const wtxt = (await wn.innerText()).replace(/\s+/g, ' ').trim();
  const wLinks = await wn.locator('a').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('href'), e.getAttribute('target')]));
  t(`${label}: Wise selected → "Wise Bank Transfer — Important" notice, exact owner text`, (await wn.isVisible()) && wtxt === 'Wise Bank Transfer — Important Wise deposits may take up to 24 hours to be received and verified. Your booking will only be confirmed once your deposit has been verified. Booking a last-minute fishing trip? Please contact us directly via WhatsApp or our Contact Form before proceeding.', wtxt);
  t(`${label}: notice links = WhatsApp (official number) + /contact, new tab, no email`, JSON.stringify(wLinks) === JSON.stringify([['WhatsApp', 'https://wa.me/526241223506', '_blank'], ['Contact Form', '/contact', '_blank']]) && !/@|mailto/.test(await wn.innerHTML()), JSON.stringify(wLinks));
  if (ctxOpts.isMobile) { await wn.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOTS}/${label}-wise-note.png` }); t(`${label}: Wise notice fits the screen (no overflow)`, await noOverflow(p)); }
  await p.locator('input[name=payment][value=stripe]').check();
  t(`${label}: switching back to card hides the Wise notice`, await p.locator('#wise-note').isHidden());
  const sum = await p.locator('#sum').innerText();
  t(`${label}: summary — Boat #3, date, availability, $800 total, $200 deposit, $12.00 fee, $212.00 now, $600 balance`, ['#3 (27 ft)', 'Available ✓', '8 hours', '$800 USD', '$200 USD', '$12.00 USD', '$212.00 USD', '$600 USD'].every((x) => sum.includes(x)), sum);
  if (ctxOpts.isMobile) {
    t(`${label}: no horizontal overflow on the payment step`, await noOverflow(p));
    const small = await p.$$eval('.bk-help a, .bk-alt, .day:not([disabled]), .bk-go, #to-pay', (els) => els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5).map((e) => e.textContent.trim()));
    t(`${label}: touch targets ≥ 44 px (help links, dates, buttons)`, small.length === 0, small.slice(0, 5).join(','));
    await p.screenshot({ path: `${SHOTS}/${label}-pay.png` });
  }
  // detour to /contact in the SAME tab, then back: everything is still there
  await p.goto(`${BASE}/contact`, { waitUntil: 'domcontentloaded' });
  await p.goBack({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const kept = { boat: await p.locator('input[name=boat][value=boat-03]').isChecked(), dur: await p.locator('input[name=duration][value="8"]').isChecked(), quote: await p.locator('#quote').isVisible(), name: await p.inputValue('input[name=fname]'), msg: await p.inputValue('textarea[name=message]'), people: await p.inputValue('select[name=people]'), pay: await p.locator('#s-pay').isVisible(), date: await p.inputValue('input[name=date]') };
  t(`${label}: progress survives a detour to /contact (boat, duration, date, price, details, payment step)`, kept.boat && kept.dur && kept.quote && kept.name === 'Ana' && kept.msg === 'Two kids aboard' && kept.people === '3' && kept.pay && kept.date === date, JSON.stringify(kept));
  // going back up the page: earlier steps stay editable, data kept
  await p.locator('#s-details').scrollIntoViewIfNeeded();
  t(`${label}: earlier steps stay open above (back navigation without data loss)`, (await p.locator('#s-details').isVisible()) && (await p.inputValue('input[name=email]')) === `ana-${RUN}@example.test`);
  return { ctx, p, date };
}

// ---- desktop: full journey, then the date is taken during checkout → alternatives ----
{
  const { ctx, p, date } = await journey('desktop', { viewport: { width: 1366, height: 900 } });
  await p.locator('input[name=payment][value=wise]').check();
  await p.goto(`${BASE}/contact`, { waitUntil: 'domcontentloaded' }); await p.goBack({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  t('Wise chosen, detour to /contact and back → Wise still selected, notice shown again, details kept', (await p.locator('input[name=payment][value=wise]').isChecked()) && (await p.locator('#wise-note').isVisible()) && (await p.inputValue('input[name=fname]')) === 'Ana');
  await admin('block', { boat: 'boat-03', date, block: true, reason: 'test: taken during checkout' });
  await p.locator('.bk-go').click(); await p.waitForSelector('#qalts:not([hidden])');
  const msg = await p.locator('#qmsg').innerText();
  const alts = await p.locator('#qalts [data-alt]').evaluateAll((els) => els.map((e) => e.getAttribute('data-alt')));
  t('date taken during checkout → neutral message (no reason), details kept, alternative dates offered', /not available online for this boat/.test(msg) && !/booked|blocked|reservation/i.test(msg) && alts.length > 0 && alts.every((d) => d !== date) && (await p.inputValue('input[name=fname]')) === 'Ana', `${msg} ${alts}`);
  await p.locator('#qalts [data-alt]').first().click(); await p.waitForSelector('#s-pay:not([hidden])'); await p.waitForTimeout(400);
  const sum = await p.locator('#sum').innerText(); const newDate = alts[0];
  t('picking an alternative re-checks it and goes straight back to the payment step with the same details', sum.includes(new Date(newDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })) && (await p.inputValue('input[name=email]')) === `ana-${RUN}@example.test`, sum);
  await p.locator('input[name=payment][value=wise]').check();
  await p.locator('.bk-go').click(); await p.waitForURL(/\/book-now\/confirmation/);
  const r = sql(`SELECT date, status, people, message FROM reservations WHERE email='ana-${RUN}@example.test'`);
  t('…and the booking is created on the new date only (one reservation)', r.length === 1 && r[0].date === newDate && r[0].status === 'AWAITING_PAYMENT_VERIFICATION' && r[0].people === 3 && r[0].message === 'Two kids aboard', JSON.stringify(r));
  await admin('block', { boat: 'boat-03', date, block: false });
  await ctx.close();
}

// ---- mobile: full journey, card → Stripe → back → retry ----
{
  const { ctx, p } = await journey('mobile', { ...devices['Pixel 7'] });
  await p.fill('input[name=email]', `ben-${RUN}@example.test`); await p.locator('input[name=email]').dispatchEvent('change');
  await p.locator('input[name=payment][value=stripe]').check();
  await p.locator('.bk-go').click(); await p.waitForURL(/127\.0\.0\.1:8788\/pay\//);
  const first = [...sessions.values()].at(-1);
  await p.goBack({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  t('mobile: back from Stripe → booking restored with a "previous payment not completed" note', (await p.locator('#s-pay').isVisible()) && /previous payment was not completed \(no deposit was taken\)/.test(await p.locator('#pmsg').innerText()) && (await p.inputValue('input[name=fname]')) === 'Ana');
  await p.locator('input[name=payment][value=stripe]').check();
  await p.locator('.bk-go').click(); await p.waitForURL(/127\.0\.0\.1:8788\/pay\//);
  const rows = sql(`SELECT status, holds_slot FROM reservations WHERE email='ben-${RUN}@example.test' ORDER BY created_at`);
  t('mobile: retry closes the first checkout (expired at Stripe, released) → exactly one active reservation, one open session', first.status === 'expired' && rows.length === 2 && rows[0].status === 'CANCELED' && rows[0].holds_slot === 0 && rows[1].holds_slot === 1 && [...sessions.values()].filter((s) => s.status === 'open').length === 1, JSON.stringify(rows));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
