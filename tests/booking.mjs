// End-to-end tests of the booking system against `wrangler dev` (local D1) + a mock Stripe API (no network, no real money).
// Usage: node tests/booking.mjs   (starts its own mock Stripe on :8788; expects wrangler dev on :8787 started with
//   --var ADMIN_PASSWORD:test-admin-pass STRIPE_SECRET_KEY:sk_test_local STRIPE_WEBHOOK_SECRET:whsec_local
//         STRIPE_API_BASE:http://127.0.0.1:8788 CONTACT_TO:owner@example.test --test-scheduled --persist-to $PERSIST)
import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const PERSIST = process.env.PERSIST || '/tmp/wpb';
const WHSEC = 'whsec_local';
const DEPOSITS = { 'boat-01': 100, 'boat-02': 200, 'boat-03': 200, 'boat-04': 200, 'boat-05': 300, 'boat-06': 400, 'boat-07': 400, 'boat-08': 500, 'boat-09': 500, 'boat-10': 1000 };
const CAP = { 'boat-01': 2, 'boat-02': 3, 'boat-03': 4, 'boat-04': 6, 'boat-05': 8, 'boat-06': 5, 'boat-07': 6, 'boat-08': 8, 'boat-09': 10, 'boat-10': 6 };

// ---------------- mock Stripe ----------------
const sessions = new Map(); const idem = new Map(); let n = 0;
const stripeSrv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const p = Object.fromEntries(new URLSearchParams(body));
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer sk_test_local') return send(401, { error: { message: 'bad key' } });
    if (req.url === '/v1/checkout/sessions') {
      const k = req.headers['idempotency-key']; if (k && idem.has(k)) return send(200, idem.get(k));
      const id = `cs_test_${++n}_${randomBytes(4).toString('hex')}`;
      const s = { id, url: `http://127.0.0.1:8788/pay/${id}`, status: 'open', params: p, amount_total: +p['line_items[0][price_data][unit_amount]'], currency: p['line_items[0][price_data][currency]'], metadata: { ref: p['metadata[ref]'], reservation_id: p['metadata[reservation_id]'] }, payment_intent: `pi_${randomBytes(6).toString('hex')}` };
      sessions.set(id, s); if (k) idem.set(k, s); return send(200, s);
    }
    const m = req.url.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/);
    if (m) { const s = sessions.get(m[1]); if (!s) return send(404, { error: { message: 'no such session' } }); if (s.status === 'complete') return send(400, { error: { message: 'Only Checkout Sessions with a status in open can be expired.' } }); s.status = 'expired'; return send(200, s); }
    send(404, {});
  });
});
await new Promise((r) => stripeSrv.listen(8788, '127.0.0.1', r));

// ---------------- helpers ----------------
const results = []; let section = '';
const t = (name, ok, info = '') => { results.push({ name: `${section} › ${name}`, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${section} › ${name}${!ok && info ? ' — ' + info : ''}`); };
const H = { origin: BASE };
let cookie = '';
const get = async (p, opt = {}) => { const r = await fetch(BASE + p, { redirect: 'manual', headers: { ...(opt.admin ? { cookie } : {}) } }); return [r.status, r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text(), r.headers]; };
const admin = async (p, body, extra = {}) => { const r = await fetch(BASE + '/api/admin/' + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', ...H, cookie, ...extra }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return [r.status, j, r.headers]; };
const fmt = (d) => d.toISOString().slice(0, 10);
const todayLocal = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); // America/Mazatlan = UTC−7
const day = (k) => fmt(new Date(Date.parse(todayLocal + 'T00:00:00Z') + k * 864e5));
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
const customer = (boat, date, duration = 6, payment = 'stripe', extra = {}) => ({ fname: 'Test', lname: 'Customer', email: 'customer@example.test', phone: '+1 555 010 0000', date, people: 2, duration, boat, message: 'Test booking', payment, consent: 'yes', ...extra });
let ipN = 0;
const reserve = async (o, headers = H, ip = `198.51.100.${++ipN % 250}`) => { const r = await fetch(BASE + '/api/booking/reserve', { method: 'POST', body: form(o), headers: { 'cf-connecting-ip': ip, ...headers } }); return [r.status, await r.json()]; };
const qs = (u) => Object.fromEntries(new URL(u, BASE).searchParams);
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const sign = (payload, ts = Math.floor(Date.now() / 1000), secret = WHSEC) => `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')}`;
const webhook = async (type, s, over = {}, sig) => {
  const ev = { id: `evt_${randomBytes(8).toString('hex')}`, type, livemode: false, data: { object: { object: 'checkout.session', id: s.id, payment_status: type.includes('completed') || type.includes('succeeded') ? 'paid' : 'unpaid', amount_total: s.amount_total, currency: s.currency, payment_intent: s.payment_intent, metadata: s.metadata, ...over } } };
  const payload = JSON.stringify(ev);
  const r = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig ?? sign(payload) }, body: payload });
  return [r.status, await r.json().catch(() => ({})), ev, payload];
};
const replay = async (payload) => { const r = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': sign(payload) }, body: payload }); return [r.status, await r.json()]; };
const status = async (url) => { const { ref, t: tok } = qs(url); return (await get(`/api/booking/status?ref=${ref}&t=${tok}`))[1]; };
const sessionOf = (redirect) => sessions.get(redirect.split('/pay/')[1]);
const emails = (ref, kind) => sql(`SELECT e.kind, e.recipient FROM email_log e JOIN reservations r ON r.id = e.reservation_id WHERE r.ref = '${ref}'${kind ? ` AND e.kind = '${kind}'` : ''}`);
const avail = async (boat, date) => (await get(`/api/booking/availability?boat=${boat}&month=${date.slice(0, 7)}`))[1].days[date];

try {
  // ---------------- catalogue & pages ----------------
  section = 'Catalogue';
  let [s, j] = await get('/api/booking/boats');
  t('10 boats served', s === 200 && j.boats.length === 10);
  t('deposits = owner-confirmed amounts (USD, same for 6 h and 8 h)', j.boats.every((b) => DEPOSITS[b.id] === b.deposit), JSON.stringify(j.boats.map((b) => b.deposit)));
  t('capacities match the boat pages', j.boats.every((b) => CAP[b.id] === b.capacity));
  t('no price invented: every price is "on request" until the owner sets it', j.boats.every((b) => b.prices[6] === null && b.prices[8] === null && !b.bookable));
  t('timezone reported = America/Mazatlan', j.timezone === 'America/Mazatlan' && j.today === todayLocal, j.today);
  [s, j] = await reserve(customer('boat-01', day(5)));
  t('price on request → online booking refused (no deposit)', s === 409 && /not available/i.test(j.error));

  section = 'Pages';
  let [ps, html, hd] = await get('/book-now');
  t('/book-now 200 with SEO title + H1', ps === 200 && html.includes('<title>Book a Fishing Charter in San Jose del Cabo | Exotic Fish Cabo</title>') && html.includes('Book Your San Jose del Cabo Fishing Charter'));
  t('/book-now has no price/availability schema', !/"@type":\s*"(Offer|Product|AggregateOffer)"/.test(html));
  [ps, html, hd] = await get('/book-now/confirmation');
  t('/book-now/confirmation noindex (meta + header)', ps === 200 && html.includes('content="noindex, nofollow"') && /noindex/.test(hd.get('x-robots-tag') || ''));
  [ps, html, hd] = await get('/book-now/canceled');
  t('/book-now/canceled noindex', html.includes('content="noindex, nofollow"'));
  [ps, html, hd] = await get('/admin/bookings');
  t('/admin/bookings noindex, no-store, frame-deny', ps === 200 && /noindex/.test(hd.get('x-robots-tag')) && hd.get('cache-control') === 'no-store' && hd.get('x-frame-options') === 'DENY');
  [ps, html] = await get('/fishing-boats/38ft-flybridge');
  t('boat page has BOOK THIS BOAT → /book-now?boat=boat-05', html.includes('href="/book-now?boat=boat-05"') && html.includes('BOOK THIS BOAT'));
  [ps, html] = await get('/fishing-boats');
  t('fleet listing has 10 BOOK THIS BOAT buttons', (html.match(/BOOK THIS BOAT/g) || []).length === 10);
  [ps, html] = await get('/');
  t('header BOOK NOW → /book-now', html.includes('href="/book-now" data-track="book_now_header"'));
  [ps, html] = await get('/contact');
  t('contact form carries the boat labels for prefill', html.includes('data-boats=') && html.includes('boat-03'));

  // ---------------- admin security ----------------
  section = 'Admin security';
  [s, j] = await get('/api/admin/overview');
  t('no session → 401', s === 401);
  [s, j] = await admin('login', { password: 'wrong' });
  t('wrong password → 401', s === 401);
  [s] = await admin('login', { password: 'test-admin-pass' }, { origin: 'https://evil.example' });
  t('login from another origin → 403 (CSRF)', s === 403);
  [s] = await admin('login', { password: 'test-admin-pass' }, { 'x-efc-admin': '' });
  t('POST without the custom header → 403 (CSRF)', s === 403);
  let [ls, lj, lh] = await admin('login', { password: 'test-admin-pass' });
  cookie = (lh.get('set-cookie') || '').split(';')[0];
  t('correct password → session cookie HttpOnly + SameSite=Strict', ls === 200 && /HttpOnly/.test(lh.get('set-cookie')) && /SameSite=Strict/.test(lh.get('set-cookie')));
  const forgedCookie = cookie.replace(/\.[a-f0-9]{4}/, '.0000');
  t('forged cookie → 401', (await fetch(BASE + '/api/admin/overview', { headers: { cookie: forgedCookie } })).status === 401);
  [s, j] = await get('/api/admin/overview', { admin: true });
  t('session works', s === 200 && j.boats.length === 10 && j.settings.min_lead_hours === 24 && j.settings.stripe_fee_pct === 6 && j.settings.wise_hold_hours === 24);

  // test prices (local database only — the owner sets the real ones)
  for (const id of Object.keys(DEPOSITS)) { const k = +id.slice(5); await admin('price', { boat: id, field: 'price6', value: 1000 + k }); await admin('price', { boat: id, field: 'price8', value: 1500 + k }); }
  [s, j] = await admin('price', { boat: 'boat-01', field: 'price6', value: 12.5 });
  t('price validation (whole USD)', s === 400);
  [s, j] = await get('/api/booking/boats');
  t('prices editable from the dashboard (history kept)', j.boats.every((b) => b.bookable) && sql(`SELECT COUNT(*) n FROM price_history`)[0].n >= 20);

  // ---------------- validation & lead time ----------------
  section = 'Validation';
  [s, j] = await reserve(customer('boat-01', day(-1)));
  t('past date refused', s === 409);
  [s, j] = await reserve(customer('boat-01', day(0)));
  t('today refused (24 h minimum notice)', s === 409 && /24 hours/.test(j.error));
  t('availability: yesterday=past, today=too_soon', (await avail('boat-01', day(-1))) === 'past' || day(-1).slice(0, 7) !== day(0).slice(0, 7));
  t('availability today = too_soon', (await avail('boat-01', day(0))) === 'too_soon');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { email: 'nope' })); t('bad email refused', s === 400 && j.field === 'email');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { people: 3 })); t('people > boat capacity refused (#1 = 2)', s === 400 && j.field === 'people');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { consent: '' })); t('terms consent required', s === 400 && j.field === 'consent');
  [s, j] = await reserve(customer('boat-01', day(6), 7)); t('duration must be 6 or 8', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { message: '' })); t('message required (same as contact form)', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { phone: 'abc' })); t('phone required', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { website: 'spam' })); t('honeypot refused', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6)), { origin: 'https://evil.example' }); t('cross-origin reserve → 403', s === 403);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'paypal')); t('unknown payment method refused', s === 400);
  t('no reservation created by refused attempts', sql(`SELECT COUNT(*) n FROM reservations`)[0].n === 0);

  // ---------------- 10 boats × Stripe, one trip per day ----------------
  section = 'Stripe — 10 boats × 6 h / 8 h';
  const confirmed = {};
  const SIZE = { 'boat-01': 23, 'boat-02': 26, 'boat-03': 27, 'boat-04': 30, 'boat-05': 38, 'boat-06': 31, 'boat-07': 29, 'boat-08': 35, 'boat-09': 44, 'boat-10': 37 };
  const TEMPLATE = readFileSync(new URL('./fixtures/customer-confirmation-template.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const body = (ref, kind) => sql(`SELECT e.body, e.subject FROM email_log e JOIN reservations r ON r.id = e.reservation_id WHERE r.ref = '${ref}' AND e.kind = '${kind}'`);
  for (const [i, id] of Object.keys(DEPOSITS).entries()) for (const hours of [6, 8]) {
    const k = +id.slice(5), date = hours === 6 ? day(10 + i) : day(110 + i);
    const total = (hours === 6 ? 1000 : 1500) + k, deposit = DEPOSITS[id], balance = total - deposit;
    const tag = `${id} ${hours} h`;
    [s, j] = await reserve(customer(id, date, hours));
    const sess = j.redirect && sessionOf(j.redirect);
    const charge = Math.round(deposit * 106);
    t(`${tag}: Stripe charge = deposit ${deposit} + 6% = ${(charge / 100).toFixed(2)} USD`, s === 200 && !!sess && sess.amount_total === charge && sess.currency === 'usd' && +sess.params.expires_at - Date.now() / 1000 >= 1790, JSON.stringify(j));
    if (!sess) continue;
    t(`${tag}: duration in Stripe metadata (session + payment)`, sess.params['metadata[trip_duration_hours]'] === String(hours) && sess.params['payment_intent_data[metadata][trip_duration_hours]'] === String(hours) && sess.params['line_items[0][price_data][product_data][name]'].includes(`${hours}-hour trip`));
    const st1 = await status(sess.params.success_url);
    const row = sql(`SELECT hours, total_usd, deposit_usd, balance_usd FROM reservations WHERE ref='${st1.ref}'`)[0];
    t(`${tag}: saved duration ${hours}, total ${total}, deposit ${deposit}, balance ${balance}`, row.hours === hours && row.total_usd === total && row.deposit_usd === deposit && row.balance_usd === balance, JSON.stringify(row));
    t(`${tag}: before payment → no email at all`, st1.status === 'AWAITING_PAYMENT' && emails(st1.ref).length === 0);
    const [s2, j2] = await reserve(customer(id, date, hours === 6 ? 8 : 6));
    t(`${tag}: same day, other duration → BOOKED + request-availability message`, s2 === 409 && j2.code === 'BOOKED' && j2.error === 'This boat already has a booking on your selected date. A second trip may be possible upon request. Please contact us to check availability.');
    const [w] = await webhook('checkout.session.completed', sess);
    const st2 = await status(sess.params.success_url);
    const em = emails(st2.ref);
    t(`${tag}: verified webhook → CONFIRMED, exactly 1 owner + 1 customer email`, w === 200 && st2.status === 'CONFIRMED' && em.filter((e) => e.kind === 'owner_confirmed' && e.recipient === 'owner@example.test').length === 1 && em.filter((e) => e.kind === 'customer_confirmed' && e.recipient === 'customer@example.test').length === 1 && em.length === 2, JSON.stringify(em));
    const ob = body(st2.ref, 'owner_confirmed')[0];
    t(`${tag}: owner email shows "${hours} HOURS" first + all contact-form fields + amounts`, ob.subject.includes(`${hours} HOURS`) && ob.body.includes(`TRIP DURATION: ${hours} HOURS`) && ob.body.indexOf(`TRIP DURATION: ${hours} HOURS`) < ob.body.indexOf('Booking reference') &&
      ['First name: Test', 'Last name: Customer', 'Email: customer@example.test', 'Phone: +1 555 010 0000', `Date: ${date}`, 'People aboard: 2', `Duration: ${hours === 6 ? '3/4 day (6 hours)' : 'Full day (8 hours)'}`, 'Message: Test booking', `Booking reference: ${st2.ref}`, `Total charter price: $${total.toLocaleString('en-US')} USD`, `Deposit paid: $${deposit.toLocaleString('en-US')}.00 USD`, `Remaining balance: $${balance.toLocaleString('en-US')} USD`, 'Payment method: Stripe (card)', 'Status: CONFIRMED'].every((x) => ob.body.includes(x)), ob.body);
    const cb = body(st2.ref, 'customer_confirmed')[0];
    const expected = TEMPLATE.replace("[Customer's Name]", 'Test').replace('[Date]', longDate(date)).replace('[X]', String(hours)).replace('[Size]', String(SIZE[id])).replace('[Amount]', '$' + balance.toLocaleString('en-US'));
    t(`${tag}: customer receives the EXACT owner template (name, date, ${hours}-hour, ${SIZE[id]} ft, balance $${balance})`, cb.subject === '[TEST] Your Fishing Trip Confirmation – Exotic Fish Cabo' && cb.body === expected, cb.body);
    t(`${tag}: availability shows "booked"`, (await avail(id, date)) === 'booked');
    if (hours === 6) confirmed[id] = { date, sess, url: sess.params.success_url, ref: st2.ref };
  }
  t('refused same-day attempts created no reservation', sql(`SELECT COUNT(*) n FROM reservations`)[0].n === 20);

  section = 'Webhook';
  const c1 = confirmed['boat-01'];
  let [w1, wj, ev, payload] = await webhook('checkout.session.completed', c1.sess);
  t('second event for an already confirmed booking → no new email', w1 === 200 && wj.result === 'already_processed' && emails(c1.ref, 'owner_confirmed').length === 1);
  let [rs, rj] = await replay(payload);
  t('exact retry of the same Stripe event → ignored (idempotent)', rs === 200 && rj.duplicate === true && emails(c1.ref, 'owner_confirmed').length === 1);
  [w1] = await webhook('checkout.session.completed', c1.sess, {}, 'v1=deadbeef,t=1');
  t('bad signature → 400', w1 === 400);
  [w1] = await webhook('checkout.session.completed', c1.sess, {}, sign('x', Math.floor(Date.now() / 1000) - 600));
  t('stale timestamp / wrong payload → 400', w1 === 400);
  [w1] = await webhook('checkout.session.completed', c1.sess, {}, sign('{}', undefined, 'whsec_other'));
  t('signature with another secret → 400', w1 === 400);
  [w1, wj] = await webhook('checkout.session.completed', c1.sess, { livemode: true });
  t('unknown event types ignored safely', (await webhook('payment_intent.created', c1.sess))[1].result === 'ignored');

  // amount mismatch
  [s, j] = await reserve(customer('boat-02', day(30)));
  let sx = sessionOf(j.redirect);
  [w1, wj] = await webhook('checkout.session.completed', sx, { amount_total: 100 });
  let stx = await status(sx.params.success_url);
  t('amount mismatch → PAYMENT_EXCEPTION, owner alerted, never "confirmed"', wj.result === 'payment_exception' && stx.status === 'PAYMENT_EXCEPTION' && emails(stx.ref, 'owner_exception').length === 1 && emails(stx.ref, 'owner_confirmed').length === 0);
  t('exception releases the date', (await avail('boat-02', day(30))) === 'available');

  section = 'Abandon / expiry / late payment';
  // customer leaves Stripe Checkout
  [s, j] = await reserve(customer('boat-03', day(31)));
  let sa = sessionOf(j.redirect); const qa = qs(sa.params.cancel_url);
  let r = await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: qa.ref, t: qa.t }) });
  let rjj = await r.json();
  t('cancel on Stripe → CANCELED, session expired, date released, no email', rjj.status === 'CANCELED' && sa.status === 'expired' && (await avail('boat-03', day(31))) === 'available' && emails(qa.ref).length === 0);
  // late payment while the date is still free → confirmed
  [w1, wj] = await webhook('checkout.session.completed', sa);
  t('late payment, date still free → re-acquired and CONFIRMED (+ emails once)', wj.result === 'confirmed' && (await status(sa.params.success_url)).status === 'CONFIRMED' && emails(qa.ref, 'owner_confirmed').length === 1);
  // late payment while someone else took the date → exception
  [s, j] = await reserve(customer('boat-04', day(32)));
  let sA = sessionOf(j.redirect); const qA = qs(sA.params.cancel_url);
  await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: qA.ref, t: qA.t }) });
  [s, j] = await reserve(customer('boat-04', day(32), 8));
  let sB = sessionOf(j.redirect);
  [w1, wj] = await webhook('checkout.session.completed', sA);
  const stB = await status(sB.params.success_url);
  t('late payment, date taken meanwhile → PAYMENT_EXCEPTION, other customer keeps the date', wj.result === 'payment_exception' && stB.status === 'AWAITING_PAYMENT' && emails(qA.ref, 'owner_confirmed').length === 0 && emails(qA.ref, 'owner_exception').length === 1);
  // checkout.session.expired webhook
  [w1, wj] = await webhook('checkout.session.expired', sB);
  t('checkout.session.expired → EXPIRED, date released, no email', wj.result === 'released' && (await status(sB.params.success_url)).status === 'EXPIRED' && (await avail('boat-04', day(32))) === 'available' && emails(stB.ref).length === 0);
  // hold timeout (no webhook)
  [s, j] = await reserve(customer('boat-05', day(33)));
  let sH = sessionOf(j.redirect);
  sql(`UPDATE reservations SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE stripe_session_id = '${sH.id}'`);
  t('expired hold → date available again', (await avail('boat-05', day(33))) === 'available');
  [s, j] = await reserve(customer('boat-05', day(33), 8));
  t('…and can be booked by the next customer', s === 200 && (await status(sH.params.success_url)).status === 'EXPIRED');

  section = 'Concurrency';
  const burst = await Promise.all(Array.from({ length: 8 }, (_, k) => reserve(customer('boat-06', day(40), k % 2 ? 8 : 6, k % 3 ? 'stripe' : 'wise'))));
  t('8 simultaneous attempts, same boat/day → exactly 1 succeeds', burst.filter(([x]) => x === 200).length === 1 && burst.filter(([x, y]) => x === 409 && y.code === 'BOOKED').length === 7, JSON.stringify(burst.map(([x]) => x)));
  t('database: one active reservation for that boat/day', sql(`SELECT COUNT(*) n FROM reservations WHERE boat_id='boat-06' AND date='${day(40)}' AND holds_slot=1`)[0].n === 1);

  section = 'Wise';
  [s, j] = await reserve(customer('boat-07', day(41), 8, 'wise'));
  const wq = qs(j.redirect); let wst = await status(j.redirect);
  t('Wise → AWAITING_PAYMENT_VERIFICATION, 24 h hold, deposit without fee', s === 200 && wst.status === 'AWAITING_PAYMENT_VERIFICATION' && wst.chargeCents === 40000 && wst.feeCents === 0 && Math.abs(Date.parse(wst.holdExpiresAt) - Date.now() - 24 * 3600e3) < 120e3 && wst.wiseUrl === 'https://wise.com/pay/me/loict92');
  t('Wise pending → customer instructions only, NO owner email', emails(wq.ref, 'customer_wise_pending').length === 1 && emails(wq.ref).every((e) => e.recipient !== 'owner@example.test'));
  t('Wise pending blocks the day', (await avail('boat-07', day(41))) === 'pending' && (await reserve(customer('boat-07', day(41))))[0] === 409);
  const wid = sql(`SELECT id FROM reservations WHERE ref='${wq.ref}'`)[0].id;
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'yes' });
  t('admin confirm without typing VERIFIED → refused', s === 409);
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 399, confirm: 'VERIFIED' });
  t('amount below the deposit → refused', s === 409);
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'VERIFIED', wiseRef: 'TR-1' });
  wst = await status(j.ok ? `/x?ref=${wq.ref}&t=${wq.t}` : '/x');
  t('owner verifies the Wise payment → CONFIRMED, 1 owner email + 1 customer email', s === 200 && wst.status === 'CONFIRMED' && emails(wq.ref, 'owner_confirmed').length === 1 && emails(wq.ref, 'customer_confirmed').length === 1);
  [s] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'VERIFIED' });
  t('confirming twice → refused, still one owner email', s === 409 && emails(wq.ref, 'owner_confirmed').length === 1);
  // Wise expiry + cron
  [s, j] = await reserve(customer('boat-08', day(42), 6, 'wise'));
  const wq2 = qs(j.redirect);
  sql(`UPDATE reservations SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE ref = '${wq2.ref}'`);
  await fetch(BASE + '/__scheduled?cron=17+*+*+*+*'); await fetch(BASE + '/__scheduled?cron=17+*+*+*+*');
  t('Wise not paid in 24 h → EXPIRED by the hourly job, customer told once, owner not emailed', (await status(j.redirect)).status === 'EXPIRED' && emails(wq2.ref, 'customer_wise_expired').length === 1 && emails(wq2.ref, 'owner_confirmed').length === 0);
  const wid2 = sql(`SELECT id FROM reservations WHERE ref='${wq2.ref}'`)[0].id;
  [s] = await admin('action', { id: wid2, action: 'confirm_wise', amount: 500, confirm: 'VERIFIED' });
  t('payment found after expiry, date still free → owner can still confirm', s === 200 && (await status(j.redirect)).status === 'CONFIRMED');

  // ---------------- second trip (owner override) ----------------
  section = 'Second trip override';
  const c9 = confirmed['boat-09'];
  const base2 = { boat: 'boat-09', date: c9.date, hours: 8, people: 4, total: 1509, payment: 'stripe', fname: 'Second', lname: 'Guest', email: 'second@example.test', phone: '+1 555 020 0000', message: 'Approved by owner' };
  [s, j] = await admin('second-trip', { ...base2, confirm: 'yes' });
  t('without typing SECOND TRIP → refused', s === 400);
  [s, j] = await admin('second-trip', { ...base2, date: day(60), confirm: 'SECOND TRIP' });
  t('on a free day → refused (customer can book online)', s === 400 && /book online/.test(j.error));
  [s, j] = await fetch(BASE + '/api/admin/second-trip', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', ...H }, body: JSON.stringify({ ...base2, confirm: 'SECOND TRIP' }) }).then(async (x) => [x.status, await x.json()]);
  t('without admin session → 401', s === 401);
  [s, j] = await admin('second-trip', { ...base2, confirm: 'SECOND TRIP' });
  const ov = j;
  const firstStill = await status(c9.url);
  t('override recorded as slot 2, AWAITING_PAYMENT (not confirmed)', s === 200 && ov.slot === 1 && ov.status === 'AWAITING_PAYMENT', JSON.stringify(j));
  t('existing confirmed trip untouched', firstStill.status === 'CONFIRMED' && sql(`SELECT slot FROM reservations WHERE ref='${c9.ref}'`)[0].slot === 0);
  t('customer gets a payment request; owner gets no confirmation yet', emails(ov.ref, 'customer_payment_request').length === 1 && emails(ov.ref, 'owner_confirmed').length === 0);
  t('audit log records the override', sql(`SELECT COUNT(*) n FROM audit_log a JOIN reservations r ON r.id=a.reservation_id WHERE r.ref='${ov.ref}' AND a.action='second_trip_override' AND a.actor='admin'`)[0].n === 1);
  t('public availability for that day still "booked" (no automatic second trip)', (await avail('boat-09', c9.date)) === 'booked' && (await reserve(customer('boat-09', c9.date)))[0] === 409);
  let [pst, , phd] = await get(new URL(ov.payUrl).pathname + new URL(ov.payUrl).search);
  const so = sessions.get((phd.get('location') || '').split('/pay/')[1]);
  t('payment link → Stripe Checkout for deposit + 6%', pst === 303 && so && so.amount_total === 53000);
  [w1, wj] = await webhook('checkout.session.completed', so);
  t('second trip confirmed only after the verified payment, owner + customer emailed once', wj.result === 'confirmed' && (await status(ov.statusUrl)).status === 'CONFIRMED' && emails(ov.ref, 'owner_confirmed').length === 1 && emails(ov.ref, 'customer_confirmed').length === 1);
  t('first trip still confirmed, 2 active trips that day', (await status(c9.url)).status === 'CONFIRMED' && sql(`SELECT COUNT(*) n FROM reservations WHERE boat_id='boat-09' AND date='${c9.date}' AND holds_slot=1 AND status='CONFIRMED'`)[0].n === 2);
  // override paid by Wise
  [s, j] = await admin('second-trip', { ...base2, boat: 'boat-10', date: confirmed['boat-10'].date, hours: 6, people: 3, total: 1010, payment: 'wise', confirm: 'SECOND TRIP' });
  const ovw = j;
  t('override with Wise → AWAITING_PAYMENT_VERIFICATION, no owner email', s === 200 && ovw.status === 'AWAITING_PAYMENT_VERIFICATION' && emails(ovw.ref, 'owner_confirmed').length === 0);
  const ovwid = sql(`SELECT id FROM reservations WHERE ref='${ovw.ref}'`)[0].id;
  [s] = await admin('action', { id: ovwid, action: 'confirm_wise', amount: 1000, confirm: 'VERIFIED' });
  t('…confirmed only when the owner verifies the Wise deposit', s === 200 && emails(ovw.ref, 'owner_confirmed').length === 1);
  // customer cancel link must not drop an override hold
  [s, j] = await admin('second-trip', { ...base2, boat: 'boat-03', date: confirmed['boat-03'].date, hours: 6, people: 2, total: 1003, confirm: 'SECOND TRIP' });
  const q3 = qs(j.statusUrl);
  rjj = await (await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: q3.ref, t: q3.t }) })).json();
  t('leaving Checkout does not cancel an owner-approved second trip', rjj.status === 'AWAITING_PAYMENT');

  // ---------------- admin operations ----------------
  section = 'Admin';
  const c2 = confirmed['boat-02'];
  const c2id = sql(`SELECT id FROM reservations WHERE ref='${c2.ref}'`)[0].id;
  [s] = await admin('action', { id: c2id, action: 'cancel', confirm: 'nope' });
  t('cancel requires typing CANCEL', s === 409);
  [s, j] = await admin('action', { id: c2id, action: 'cancel', confirm: 'CANCEL', reason: 'Weather', notify: true });
  t('cancel a paid booking → REFUND_PENDING, date released, customer told', s === 200 && j.status === 'REFUND_PENDING' && (await avail('boat-02', c2.date)) === 'available' && emails(c2.ref, 'customer_canceled').length === 1);
  [s, j] = await admin('action', { id: c2id, action: 'refunded' });
  t('mark refunded', s === 200 && j.status === 'REFUNDED');
  const c4 = confirmed['boat-04'];
  const c4id = sql(`SELECT id FROM reservations WHERE ref='${c4.ref}'`)[0].id;
  [s, j] = await admin('action', { id: c4id, action: 'move_date', date: confirmed['boat-04'].date === day(13) ? day(70) : day(70) });
  t('move date to a free day', s === 200 && (await avail('boat-04', day(70))) === 'booked' && (await avail('boat-04', c4.date)) === 'available');
  [s, j] = await admin('action', { id: c4id, action: 'move_date', date: day(32) === day(32) && confirmed['boat-04'] ? day(70) : day(70) });
  [s, j] = await reserve(customer('boat-04', day(71)));
  [s, j] = await admin('action', { id: c4id, action: 'move_date', date: day(71) });
  t('move onto a booked day → refused', s === 409);
  [s, j] = await admin('block', { boat: 'boat-01', date: day(80), block: true, reason: 'maintenance' });
  t('block a day → not bookable', s === 200 && (await avail('boat-01', day(80))) === 'blocked' && (await reserve(customer('boat-01', day(80))))[0] === 409);
  [s, j] = await admin('block', { boat: '*', date: day(81), block: true });
  t('block a day for all boats', (await avail('boat-07', day(81))) === 'blocked');
  [s, j] = await admin('block', { boat: 'boat-01', date: day(80), block: false });
  t('unblock', (await avail('boat-01', day(80))) === 'available');
  [s, j] = await admin('settings', { wise_hold_hours: 9999 });
  t('settings validated', s === 400);
  [s, j] = await admin('settings', { min_lead_hours: 48 });
  t('settings saved (minimum notice 48 h)', s === 200 && (await avail('boat-01', day(1))) === 'too_soon');
  await admin('settings', { min_lead_hours: 24 });
  [s, j] = await reserve(customer('boat-08', day(84), 6, 'stripe', { message: '=HYPERLINK("http://x")' }));
  const csv = await (await fetch(BASE + '/api/admin/export.csv', { headers: { cookie } })).text();
  t('CSV export with all bookings, formula injection neutralised', csv.includes('ref,boat_number') && csv.includes(`"'=HYPERLINK`) && csv.split('\r\n').length > 20);
  t('CSV requires the session', (await fetch(BASE + '/api/admin/export.csv')).status === 401);
  [s, j] = await get('/api/admin/audit', { admin: true });
  t('audit log lists admin + system actions', j.audit.some((a) => a.action === 'wise_verified') && j.audit.some((a) => a.action === 'cancel') && j.audit.some((a) => a.action === 'export_csv') && j.audit.some((a) => a.action === 'login_failed'));
  [s, j] = await get(`/api/booking/status?ref=${c1.ref}&t=${'0'.repeat(48)}`);
  t('status with a wrong token → 404 (no data leak)', s === 404);
  [s, j] = await get(`/api/admin/booking?id=${c2id}`, { admin: true });
  t('booking detail never exposes the customer token', s === 200 && !('token' in j.booking));

  section = 'Emails (global)';
  const all = sql(`SELECT r.status, e.kind FROM email_log e JOIN reservations r ON r.id = e.reservation_id WHERE e.kind = 'owner_confirmed'`);
  const perRes = sql(`SELECT reservation_id, COUNT(*) n FROM email_log WHERE kind='owner_confirmed' GROUP BY reservation_id HAVING n > 1`);
  t('owner confirmation emails exist only for paid+confirmed bookings', all.length > 0 && all.every((e) => ['CONFIRMED', 'REFUND_PENDING', 'REFUNDED'].includes(e.status)));
  t('never two owner confirmations for the same booking', perRes.length === 0);
  t('no owner email for pending / expired / canceled attempts', sql(`SELECT COUNT(*) n FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE e.recipient='owner@example.test' AND r.status IN ('EXPIRED','CANCELED','AWAITING_PAYMENT','AWAITING_PAYMENT_VERIFICATION','HELD') AND e.kind <> 'owner_exception'`)[0].n === 0);
  t('owner subjects all carry the trip duration', sql(`SELECT subject FROM email_log WHERE kind='owner_confirmed'`).every((m) => /CONFIRMED EFC-[A-Z0-9]{6} — [68] HOURS — /.test(m.subject)));

  section = 'Rate limit';
  let limited = false;
  for (let k = 0; k < 12; k++) { const [x] = await reserve(customer('boat-01', day(90 + k), 6, 'stripe', { email: 'x' }), H, '203.0.113.9'); if (x === 429) { limited = true; break; } }
  t('reserve rate-limited per IP', limited);
  for (let k = 0; k < 6; k++) await admin('login', { password: 'bad' });
  [s] = await admin('login', { password: 'test-admin-pass' });
  t('login rate-limited (5 / 15 min)', s === 429);
} catch (e) { console.log('ERROR', e); results.push({ ok: false }); }

stripeSrv.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
