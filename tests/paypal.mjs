// PayPal (owner 2026-11-09): permanent method, 6 % fee on the deposit only, checkout impossible until the account is connected.
// Phase "off" (= production today): PAYPAL_PHASE=off node tests/paypal.mjs — wrangler dev WITHOUT PayPal variables.
// Phase "on" (account connected, sandbox, mock PayPal API on :8789 — no network, no money): PAYPAL_PHASE=on node tests/paypal.mjs
//   wrangler dev with the tests/booking.mjs variables + PAYPAL_CLIENT_ID:pp_client PAYPAL_CLIENT_SECRET:pp_secret
//   PAYPAL_WEBHOOK_ID:WH-TEST PAYPAL_ENV:sandbox PAYPAL_API_BASE:http://127.0.0.1:8789 (same --persist-to as phase off).
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
{ const f0 = globalThis.fetch; globalThis.fetch = async (...a) => { try { return await f0(...a); } catch (e) { if (e?.cause?.code === 'UND_ERR_SOCKET') return f0(...a); throw e; } }; }

const BASE = 'http://127.0.0.1:8787';
const PHASE = process.env.PAYPAL_PHASE || 'off';
const PERSIST = process.env.PERSIST || '/tmp/wpb';
const SHOTS = process.env.SHOTS || '/tmp/pp-shots';
const SNAP = '/tmp/pp-before.json';
const DEPOSITS = { 'boat-01': 100, 'boat-02': 200, 'boat-03': 200, 'boat-04': 200, 'boat-05': 300, 'boat-06': 400, 'boat-07': 400, 'boat-08': 500, 'boat-09': 500, 'boat-10': 1000 };
const PRICES = { 'boat-01': [350, null], 'boat-02': [550, 600], 'boat-03': [680, 800], 'boat-04': [640, 800], 'boat-05': [1500, 1800], 'boat-06': [1400, 1600], 'boat-07': [1600, 1900], 'boat-08': [2700, 3000], 'boat-09': [3000, 3500], 'boat-10': [4500, 5000] };
const COMBOS = Object.keys(PRICES).flatMap((id) => [6, 8].filter((h) => PRICES[id][h === 6 ? 0 : 1] != null).map((h) => [id, h]));
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${PHASE}] ${n}${!ok && i ? ' — ' + i : ''}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const clearRL = () => { try { sql('DELETE FROM rate_limits'); } catch {} };
const summaryApi = async (boat, hours) => { const r = await fetch(BASE + '/api/booking/summary', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-efc-quote': '1', 'cf-connecting-ip': `203.0.113.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ boat, hours }) }); return r.json(); };
const fmt = (d) => d.toISOString().slice(0, 10);
const todayLocal = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
const day = (k) => fmt(new Date(Date.parse(todayLocal + 'T00:00:00Z') + k * 864e5));
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
let ipN = 0;
const reserve = async (boat, date, payment = 'paypal', hours = 6) => { const r = await fetch(BASE + '/api/booking/reserve', { method: 'POST', headers: { origin: BASE, 'cf-connecting-ip': `198.18.0.${++ipN % 250}` }, body: form({ fname: 'Pay', lname: 'Pal', email: 'pp@example.test', phone: '+1 555 010 2222', date, people: 2, duration: hours, boat, message: 'PayPal test', payment }) }); return [r.status, await r.json().catch(() => ({}))]; };
const qs = (u) => Object.fromEntries(new URL(u, BASE).searchParams);
const res = (ref) => sql(`SELECT * FROM reservations WHERE ref = '${ref}'`)[0];
const COLS = 'id, ref, token, boat_id, date, hours, slot, holds_slot, hold_expires_at, status, payment_method, total_usd, deposit_usd, balance_usd, fee_cents, charge_cents, first_name, last_name, email, phone, people, message, consent_at, terms_version, lang, stripe_session_id, stripe_payment_intent, is_test, source, owner_notified_at, customer_notified_at, expiry_notified_at, admin_note, created_at, updated_at';

// ---------- browser helper: to the payment step ----------
async function toPayStep(p, boatId, hours) {
  await p.goto(`${BASE}/book-now?boat=${boatId}`, { waitUntil: 'networkidle' });
  if (boatId !== 'boat-01') await p.locator(`input[name=duration][value="${hours}"]`).check();
  await p.waitForSelector('#s-date:not([hidden]) .day.s-available');
  await p.locator('.bk-nav[data-m="1"]').click(); await p.waitForTimeout(400);
  await p.locator('.day.s-available').nth(Math.floor(Math.random() * 5)).click();
  await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
  await p.locator('#continue').click();
  await p.fill('input[name=fname]', 'Paula'); await p.fill('input[name=lname]', 'Pal'); await p.fill('input[name=email]', 'paula@example.test'); await p.fill('input[name=phone]', '+1 555 000 3333');
  await p.selectOption('select[name=people]', '2');
  await p.locator('#to-pay').click(); await p.waitForSelector('#s-pay:not([hidden])');
}
const money = (n) => `$${n.toLocaleString('en-US')} USD`;
const cents = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

if (PHASE === 'off') {
  // ---------- amounts (server) ----------
  clearRL();
  const bad = [];
  for (const [id, h] of COMBOS) {
    const j = await summaryApi(id, h); const dep = DEPOSITS[id], total = PRICES[id][h === 6 ? 0 : 1];
    const fee = Math.round(dep * 100 * 0.06);
    if (!(j.ok && j.paypalFeePct === 6 && j.paypalFeeCents === fee && j.paypalChargeCents === dep * 100 + fee && j.balance === total - dep && j.total === total && j.deposit === dep
      && j.cardChargeCents === Math.round(dep * 106) && j.wiseChargeCents === dep * 100 && j.paypalPayments === false)) bad.push(`${id}/${h}: ${JSON.stringify(j)}`);
  }
  t(`summary, all ${COMBOS.length} boat/duration combinations: PayPal fee = 6 % of the deposit (exact cents), PayPal total = deposit + fee, balance = total − deposit (unchanged), Stripe/Wise amounts unchanged`, bad.length === 0, bad.slice(0, 2).join(' | '));
  const boats = await (await fetch(BASE + '/api/booking/boats')).json();
  t('public API: paypalPayments = false (account not connected)', boats.paypalPayments === false && boats.cardPayments === true);
  // ---------- server refuses any PayPal attempt ----------
  clearRL();
  const n0 = sql('SELECT COUNT(*) n FROM reservations')[0].n;
  const [s, j] = await reserve('boat-04', day(40));
  t('reserve with PayPal → 503 PAYPAL_UNAVAILABLE, no reservation, date stays available', s === 503 && j.code === 'PAYPAL_UNAVAILABLE' && sql('SELECT COUNT(*) n FROM reservations')[0].n === n0, JSON.stringify(j));
  const rp = await fetch(`${BASE}/api/booking/paypal/return?ref=EFC-AAAAAA&t=${'a'.repeat(48)}&token=X`, { redirect: 'manual' });
  t('PayPal return URL with a fake booking → redirect to "not found", nothing captured', rp.status === 303 && /m=notfound/.test(rp.headers.get('location') || ''));
  const wh = await fetch(BASE + '/api/paypal/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }) });
  t('PayPal webhook while not connected → 503 (ignored)', wh.status === 503);
  const tbl = sql(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reservations'`)[0].sql;
  t('database untouched while PayPal is not connected (no table rebuild)', !tbl.includes("'paypal'") && !tbl.includes('paypal_order_id'));
  // snapshot for the migration check of phase "on"
  writeFileSync(SNAP, JSON.stringify(sql(`SELECT ${COLS} FROM reservations ORDER BY id`)));
  // ---------- browser: desktop + mobile ----------
  const b = await chromium.launch();
  for (const [label, opts, boat, hours] of [['desktop', { viewport: { width: 1440, height: 900 } }, 'boat-05', 8], ['mobile', { ...devices['Pixel 7'] }, 'boat-03', 6]]) {
    clearRL();
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    const reserveCalls = []; p.on('request', (r) => { if (r.url().includes('/api/booking/reserve')) reserveCalls.push(r.url()); });
    await toPayStep(p, boat, hours);
    const total = PRICES[boat][hours === 6 ? 0 : 1], dep = DEPOSITS[boat], fee = Math.round(dep * 6), charge = dep * 100 + fee;
    const body = await p.locator('body').innerText();
    t(`${label}: no "Coming Soon" anywhere on /book-now`, !/coming soon/i.test(body) && !/coming soon/i.test(await p.content()));
    const pp = p.locator('input[name=payment][value=paypal]');
    t(`${label}: PayPal is a normal, enabled payment option labelled "PayPal (+6% processing fee)"`, (await pp.isEnabled()) && (await p.locator('label[data-paypal]').innerText()).trim() === 'PayPal (+6% processing fee)' && !(await p.locator('label[data-paypal]').getAttribute('class')));
    t(`${label}: intro lists Stripe, PayPal and Wise`, /PayPal\s*\(\+6% processing fee\)/.test(await p.locator('.bk-facts').innerText()));
    await pp.check(); await p.waitForTimeout(200);
    const sum = (await p.locator('#sum').innerText()).replace(/\s+/g, ' ');
    const want = [`Total charter price ${money(total)}`, `Deposit ${money(dep)}`, `PayPal processing fee (6% of the deposit) ${cents(fee)}`, `Total payable through PayPal ${cents(charge)}`, `Remaining balance (cash on the fishing day) ${money(total - dep)}`, 'Payment method PayPal'];
    t(`${label}: PayPal summary — total ${money(total)}, deposit ${money(dep)}, fee ${cents(fee)}, payable via PayPal ${cents(charge)}, balance ${money(total - dep)} (unchanged)`, want.every((w) => sum.includes(w)), sum);
    t(`${label}: "PayPal checkout is not yet available" note shown, with Stripe and Wise choices`, (await p.locator('#paypal-note').isVisible()) && (await p.locator('#paypal-note [data-paywith=stripe]').isVisible()) && (await p.locator('#paypal-note [data-paywith=wise]').isVisible()));
    await p.screenshot({ path: `${SHOTS}/paypal-${label}-pay.png`, fullPage: false });
    await p.locator('.bk-go').click(); await p.waitForTimeout(600);
    const msg = await p.locator('#pmsg').innerText();
    t(`${label}: PAY DEPOSIT & BOOK with PayPal → clear message, no reservation request, still on the payment step`, /PayPal checkout is not yet available/.test(msg) && reserveCalls.length === 0 && (await p.locator('#s-pay').isVisible()));
    t(`${label}: booking progress kept (name, email, boat, date, price)`, (await p.inputValue('input[name=fname]')) === 'Paula' && (await p.inputValue('input[name=email]')) === 'paula@example.test' && (await p.locator(`input[name=boat][value=${boat}]`).isChecked()) && (await p.locator('#quote').isVisible()));
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#s-pay:not([hidden])', { timeout: 10000 }).catch(() => {});
    t(`${label}: after a reload the booking is restored at the payment step with PayPal still chosen`, (await p.locator('#s-pay').isVisible()) && (await p.locator('input[name=payment][value=paypal]').isChecked()) && (await p.inputValue('input[name=fname]')) === 'Paula');
    await p.locator('#paypal-note [data-paywith=wise]').click(); await p.waitForTimeout(200);
    const sw = (await p.locator('#sum').innerText()).replace(/\s+/g, ' ');
    t(`${label}: "PAY WITH WISE" switches to Wise, note hidden, Wise summary (no fee)`, (await p.locator('input[name=payment][value=wise]').isChecked()) && (await p.locator('#paypal-note').isHidden()) && sw.includes('None (Wise)') && sw.includes(`Total charged now ${cents(dep * 100)}`));
    await pp.check(); await p.locator('#paypal-note [data-paywith=stripe]').click(); await p.waitForTimeout(200);
    const sc = (await p.locator('#sum').innerText()).replace(/\s+/g, ' ');
    t(`${label}: "PAY BY CARD (STRIPE)" switches to Stripe with its own 6% summary`, (await p.locator('input[name=payment][value=stripe]').isChecked()) && sc.includes(`Card processing fee (6% of the deposit) ${cents(fee)}`) && sc.includes(`Total charged now ${cents(charge)}`) && (await p.inputValue('input[name=fname]')) === 'Paula');
    t(`${label}: no horizontal overflow, no JavaScript error`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) && errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await b.close();
} else {
  // ---------------- mock PayPal API ----------------
  const orders = new Map(), reqIds = new Map(); let n = 0, captures = 0; const mock = { wrongAmount: null };
  const srv = http.createServer((req, rs) => {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const send = (s, o, h = {}) => { rs.writeHead(s, { 'content-type': 'application/json', ...h }); rs.end(JSON.stringify(o)); };
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/v1/oauth2/token') return req.headers.authorization === 'Basic ' + Buffer.from('pp_client:pp_secret').toString('base64') ? send(200, { access_token: 'A21-test', expires_in: 3600 }) : send(401, { error: 'invalid_client' });
      const ap = u.pathname.match(/^\/approve\/(.+)$/);
      if (ap) { const o = orders.get(ap[1]); if (!o) return send(404, {}); if (o.status !== 'COMPLETED') o.status = 'APPROVED'; rs.writeHead(302, { location: `${o.ret}&token=${o.id}&PayerID=PAYER1` }); return rs.end(); }
      if (req.headers.authorization !== 'Bearer A21-test') return send(401, { name: 'AUTHENTICATION_FAILURE' });
      const rid = req.headers['paypal-request-id'];
      if (rid && reqIds.has(rid)) return send(...reqIds.get(rid));
      const done = (s, o) => { if (rid) reqIds.set(rid, [s, o]); send(s, o); };
      const j = body ? JSON.parse(body) : {};
      if (u.pathname === '/v2/checkout/orders' && req.method === 'POST') {
        const id = `ORD${++n}TEST`; const pu = j.purchase_units[0];
        const o = { id, status: 'PAYER_ACTION_REQUIRED', intent: j.intent, purchase_units: [{ ...pu }], ret: j.payment_source.paypal.experience_context.return_url, cancel: j.payment_source.paypal.experience_context.cancel_url, links: [{ rel: 'payer-action', href: `http://127.0.0.1:8789/approve/${id}` }] };
        orders.set(id, o); return done(200, o);
      }
      const cp = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
      if (cp) {
        const o = orders.get(cp[1]); if (!o) return done(404, { name: 'RESOURCE_NOT_FOUND' });
        if (o.status === 'COMPLETED') return done(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
        if (o.status !== 'APPROVED') return done(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] });
        captures++; o.status = 'COMPLETED';
        o.purchase_units[0].payments = { captures: [{ id: `CAP${captures}TEST`, status: 'COMPLETED', amount: mock.wrongAmount || o.purchase_units[0].amount, custom_id: o.purchase_units[0].custom_id }] };
        return done(201, o);
      }
      const go = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
      if (go && req.method === 'GET') { const o = orders.get(go[1]); return o ? send(200, o) : send(404, {}); }
      if (u.pathname === '/v1/notifications/verify-webhook-signature') return send(200, { verification_status: j.transmission_sig === 'good' && j.webhook_id === 'WH-TEST' ? 'SUCCESS' : 'FAILURE' });
      send(404, {});
    });
  });
  await new Promise((r) => srv.listen(8789, '127.0.0.1', r));
  const approve = async (orderId) => (await fetch(`http://127.0.0.1:8789/approve/${orderId}`, { redirect: 'manual' })).headers.get('location');
  const back = async (url) => { const r = await fetch(url, { redirect: 'manual' }); return r.headers.get('location') || ''; };
  const hook = async (ev, sig = 'good') => { const r = await fetch(BASE + '/api/paypal/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'paypal-transmission-sig': sig, 'paypal-transmission-id': 'tx', 'paypal-transmission-time': new Date().toISOString(), 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/cert' }, body: JSON.stringify(ev) }); return [r.status, await r.json().catch(() => ({}))]; };
  const orderOf = (redirect) => orders.get(redirect.split('/approve/')[1]);

  try {
    // ---------- migration (runs once the credentials exist) ----------
    await fetch(BASE + '/api/booking/boats');
    const tbl = sql(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reservations'`)[0].sql;
    const idx = sql(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reservations'`).map((x) => x.name);
    t('credentials installed → table accepts PayPal (CHECK + paypal_order_id/paypal_capture_id), all indexes present', tbl.includes("'paypal'") && tbl.includes('paypal_capture_id') && ['res_active_slot', 'res_date', 'res_status', 'res_hold', 'res_stripe_session', 'res_paypal_order', 'res_paypal_capture'].every((x) => idx.includes(x)), idx.join(','));
    if (existsSync(SNAP) && !process.env.NOSNAP) {
      const before = JSON.parse(readFileSync(SNAP, 'utf8')), after = sql(`SELECT ${COLS} FROM reservations ORDER BY id`).slice(0, before.length);
      t(`migration kept every existing reservation identical (${before.length} rows: Stripe, Wise, owner bookings…)`, before.length > 0 && JSON.stringify(before) === JSON.stringify(after));
    }
    t('migration logged once (audit schema_paypal)', sql(`SELECT COUNT(*) n FROM audit_log WHERE action = 'schema_paypal'`)[0].n === 1);
    const boats = await (await fetch(BASE + '/api/booking/boats')).json();
    t('public API: paypalPayments = true once connected (sandbox, tests only)', boats.paypalPayments === true);
    clearRL();

    // ---------- normal payment ----------
    let [s, j] = await reserve('boat-03', day(50));
    let o = j.redirect ? orderOf(j.redirect) : null; let r = j.ref ? res(j.ref) : null;
    t('reserve with PayPal → PayPal approval link; nothing captured yet', s === 200 && /^http:\/\/127\.0\.0\.1:8789\/approve\//.test(j.redirect || '') && captures === 0, JSON.stringify(j));
    t('PayPal order: USD 212.00 (= $200 deposit + $12.00 = 6 %), custom_id = reservation, invoice = booking ref', o && o.intent === 'CAPTURE' && o.purchase_units[0].amount.currency_code === 'USD' && o.purchase_units[0].amount.value === '212.00' && o.purchase_units[0].custom_id === r.id && o.purchase_units[0].invoice_id === j.ref);
    t('reservation: PayPal, AWAITING_PAYMENT, fee 1200 ¢, charge 21200 ¢, balance $480 unchanged (680 − 200)', r.payment_method === 'paypal' && r.status === 'AWAITING_PAYMENT' && r.fee_cents === 1200 && r.charge_cents === 21200 && r.balance_usd === 480 && r.deposit_usd === 200 && r.total_usd === 680 && r.holds_slot === 1 && r.paypal_order_id === o.id);
    // return without approval (forged) → nothing
    let loc = await back(o.ret + `&token=${o.id}`);
    t('return without approval → no capture, not confirmed, customer told "not completed"', /m=paypal_failed/.test(loc) && captures === 0 && res(j.ref).status === 'AWAITING_PAYMENT');
    // approve → return → capture → confirmed
    const retUrl = await approve(o.id);
    loc = await back(retUrl);
    r = res(j.ref);
    const pays = sql(`SELECT provider, amount_cents, status, external_id FROM payments WHERE reservation_id = '${r.id}'`);
    t('approved + return → captured server-side once, CONFIRMED, payment 21200 ¢ recorded', /\/book-now\/confirmation\?ref=/.test(loc) && !/m=/.test(loc) && r.status === 'CONFIRMED' && captures === 1 && pays.length === 1 && pays[0].provider === 'paypal' && pays[0].amount_cents === 21200 && r.paypal_capture_id === 'CAP1TEST', JSON.stringify({ loc, pays, st: r.status }));
    const st = await (await fetch(`${BASE}/api/booking/status?ref=${j.ref}&t=${qs(o.ret).t}`)).json();
    t('status page data: CONFIRMED, payment paypal, fee 1200 ¢, balance $480', st.status === 'CONFIRMED' && st.payment === 'paypal' && st.feeCents === 1200 && st.balance === 480);
    const mails = sql(`SELECT kind, body FROM email_log WHERE reservation_id = '${r.id}'`);
    t('owner + customer deposit emails logged once each, PayPal wording', mails.filter((m) => m.kind === 'owner_confirmed').length === 1 && mails.filter((m) => m.kind === 'customer_deposit_receipt').length === 1 && /PayPal payment of \$212\.00 USD including the \$12\.00 USD PayPal processing fee/.test(mails.find((m) => m.kind === 'customer_deposit_receipt')?.body || ''), JSON.stringify(mails.map((m) => m.kind)));
    // duplicates
    loc = await back(retUrl);
    t('second return (reload / back button) → no second capture, still one payment', captures === 1 && sql(`SELECT COUNT(*) n FROM payments WHERE reservation_id = '${r.id}'`)[0].n === 1);
    const ev = { id: 'WH-EV-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1TEST', status: 'COMPLETED', amount: { value: '212.00', currency_code: 'USD' }, custom_id: r.id, supplementary_data: { related_ids: { order_id: o.id } } } };
    let [ws, wj] = await hook(ev);
    t('webhook PAYMENT.CAPTURE.COMPLETED for the same capture → already processed', ws === 200 && wj.result === 'already_processed', JSON.stringify(wj));
    [ws, wj] = await hook(ev);
    t('same webhook event delivered twice → ignored (duplicate)', ws === 200 && wj.duplicate === true);
    [ws] = await hook({ ...ev, id: 'WH-EV-BAD' }, 'bad');
    t('webhook with an invalid PayPal signature → 400, nothing recorded', ws === 400 && sql(`SELECT COUNT(*) n FROM payment_events WHERE id = 'WH-EV-BAD'`)[0].n === 0);
    [ws, wj] = await hook({ ...ev, id: 'WH-EV-2', resource: { ...ev.resource, id: 'CAP-OTHER' } });
    t('a SECOND different capture for the same booking → PAYMENT_EXCEPTION for the owner (refund), never a silent double payment', ws === 200 && wj.result === 'payment_exception' && res(j.ref).status === 'PAYMENT_EXCEPTION', JSON.stringify(wj));
    // ---------- double booking ----------
    clearRL();
    [s, j] = await reserve('boat-07', day(51));
    const d51 = j;
    let [s2, j2] = await reserve('boat-07', day(51));
    t('same boat + date while a PayPal payment is pending → refused (UNAVAILABLE), no second reservation', s2 === 409 && j2.code === 'UNAVAILABLE');
    let [s3, j3] = await reserve('boat-07', day(51), 'stripe');
    t('…also refused for Stripe (one slot per boat per day)', s3 === 409);
    // ---------- cancel (back from PayPal) ----------
    const c = await (await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ ref: d51.ref, t: d51.t }) })).json();
    t('customer back from PayPal without paying → CANCELED, date free again, nothing captured', c.status === 'CANCELED' && res(d51.ref).holds_slot === 0 && captures === 1, JSON.stringify({ c, captures, d51 }));
    [s, j] = await reserve('boat-07', day(51), 'wise');
    t('the released date can be booked again (Wise)', s === 200 && j.ok);
    // ---------- approved, browser closed → webhook ORDER.APPROVED captures ----------
    clearRL();
    [s, j] = await reserve('boat-08', day(52)); o = orderOf(j.redirect); await approve(o.id);
    [ws, wj] = await hook({ id: 'WH-EV-3', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: o.id, status: 'APPROVED' } });
    t('customer approved then closed the browser → webhook CHECKOUT.ORDER.APPROVED captures and confirms', ws === 200 && wj.result === 'confirmed' && res(j.ref).status === 'CONFIRMED' && captures === 2, JSON.stringify({ ws, wj, captures }));
    // ---------- wrong amount ----------
    [s, j] = await reserve('boat-02', day(53)); o = orderOf(j.redirect);
    mock.wrongAmount = { value: '1.00', currency_code: 'USD' };
    loc = await back(await approve(o.id)); mock.wrongAmount = null;
    t('captured amount ≠ expected → PAYMENT_EXCEPTION (owner alerted), date released, not confirmed', res(j.ref).status === 'PAYMENT_EXCEPTION' && res(j.ref).holds_slot === 0);
    // ---------- expired + date taken by someone else → money NOT taken ----------
    clearRL();
    [s, j] = await reserve('boat-09', day(54)); o = orderOf(j.redirect); const late = j;
    sql(`UPDATE reservations SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE ref = '${late.ref}'`);
    [s2, j2] = await reserve('boat-09', day(54), 'wise');
    const capsBefore = captures;
    loc = await back(await approve(o.id));
    t('PayPal approved after the hold expired and the date was re-booked → NOT captured (no money taken), customer told the date is gone', s2 === 200 && captures === capsBefore && /m=paypal_date_gone/.test(loc) && res(late.ref).status !== 'CONFIRMED', JSON.stringify({ s2, loc }));
    // ---------- expired but date still free → taken back, captured ----------
    [s, j] = await reserve('boat-10', day(55)); o = orderOf(j.redirect);
    sql(`UPDATE reservations SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE ref = '${j.ref}'`);
    await fetch(BASE + `/api/booking/availability?boat=boat-10&month=${day(55).slice(0, 7)}`); // runs the sweep
    loc = await back(await approve(o.id));
    t('approved after the hold expired, date still free → slot taken back, captured, CONFIRMED (amount $1,060.00)', res(j.ref).status === 'CONFIRMED' && res(j.ref).charge_cents === 106000);
    // ---------- full browser flow ----------
    clearRL();
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await toPayStep(p, 'boat-06', 8);
    await p.locator('input[name=payment][value=paypal]').check(); await p.waitForTimeout(200);
    t('browser (connected): no "not yet available" note', await p.locator('#paypal-note').isHidden());
    await p.locator('.bk-go').click();
    await p.waitForURL(/\/book-now\/confirmation/, { timeout: 20000 }).catch(() => {});
    await p.waitForSelector('#bs h1:has-text("Deposit received")', { timeout: 20000 }).catch(() => {});
    const conf = await p.locator('#bs').innerText();
    t('browser: PayPal → approve → back on the site: "Deposit received", $400 + $24.00 PayPal fee, balance $1,200', /Deposit received/i.test(conf) && conf.includes('$400 USD + $24.00 USD PayPal fee') && conf.includes('$1,200 USD'), conf.replace(/\s+/g, ' '));
    await p.screenshot({ path: `${SHOTS}/paypal-connected-confirmation.png` });
    t('browser: no JavaScript error', errors.length === 0, errors.join(' | '));
    await b.close();
    t('mock PayPal: total captures = 5 (one per captured booking, never two for the same booking)', captures === 5, String(captures));
  } finally { srv.close(); }
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
