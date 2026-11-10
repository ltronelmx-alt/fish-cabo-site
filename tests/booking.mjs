// End-to-end tests of the booking system against `wrangler dev` (local D1) + a mock Stripe API (no network, no real money).
// Usage: node tests/booking.mjs   (starts its own mock Stripe on :8788; expects wrangler dev on :8787 started with
//   --var ADMIN_PASSWORD:test-admin-pass STRIPE_SECRET_KEY:sk_test_local STRIPE_WEBHOOK_SECRET:whsec_local
//         STRIPE_API_BASE:http://127.0.0.1:8788 CONTACT_TO:owner@example.test SITE_ENV:staging SITE_URL:http://127.0.0.1:8787 --test-scheduled --persist-to $PERSIST)
import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// The synchronous `wrangler d1 execute` checks can leave the HTTP client idle long enough for the local server to close
// its keep-alive socket; a request that fails on such a stale socket never reached the Worker, so it is sent once more.
{ const f0 = globalThis.fetch; globalThis.fetch = async (...a) => { try { return await f0(...a); } catch (e) { if (e?.cause?.code === 'UND_ERR_SOCKET') return f0(...a); throw e; } }; }

const BASE = 'http://127.0.0.1:8787';
const PERSIST = process.env.PERSIST || '/tmp/wpb';
const WHSEC = 'whsec_local';
const DEPOSITS = { 'boat-01': 100, 'boat-02': 200, 'boat-03': 200, 'boat-04': 200, 'boat-05': 300, 'boat-06': 400, 'boat-07': 400, 'boat-08': 500, 'boat-09': 500, 'boat-10': 1000 };
// Owner-approved prices (2026-11-08) — the test's own copy, compared with what the server answers. null = not offered.
const PRICES = { 'boat-01': [350, null], 'boat-02': [550, 600], 'boat-03': [680, 800], 'boat-04': [640, 800], 'boat-05': [1500, 1800], 'boat-06': [1400, 1600], 'boat-07': [1600, 1900], 'boat-08': [2700, 3000], 'boat-09': [3000, 3500], 'boat-10': [4500, 5000] };
const price = (id, h) => PRICES[id][h === 6 ? 0 : 1];
const COMBOS = Object.keys(PRICES).flatMap((id) => [6, 8].filter((h) => price(id, h) != null).map((h) => [id, h]));
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
const customer = (boat, date, duration = 6, payment = 'stripe', extra = {}) => ({ fname: 'Test', lname: 'Customer', email: 'customer@example.test', phone: '+1 555 010 0000', date, people: 2, duration, boat, message: 'Test booking', payment, ...extra });
const quote = async (body, headers = { origin: BASE, 'x-efc-quote': '1' }, ip = '192.0.2.10') => { const r = await fetch(BASE + '/api/booking/quote', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers }, body: JSON.stringify(body) }); return [r.status, await r.json().catch(() => ({}))]; };
const summaryApi = async (body) => { const r = await fetch(BASE + '/api/booking/summary', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-efc-quote': '1', 'cf-connecting-ip': '192.0.2.11' }, body: JSON.stringify(body) }); return [r.status, await r.json().catch(() => ({}))]; };
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
  t('public catalogue has NO prices and NO deposits', !/price|deposit|total/i.test(JSON.stringify(j.boats)), JSON.stringify(j.boats[0]));
  t('durations: Boat #1 = 6 h only, #2–#10 = 6 h and 8 h', j.boats.every((b) => JSON.stringify(b.durations) === (b.id === 'boat-01' ? '[6]' : '[6,8]')));
  t('exactly 19 bookable boat/duration combinations', j.boats.reduce((n, b) => n + b.durations.length, 0) === 19 && COMBOS.length === 19);
  t('capacities match the boat pages', j.boats.every((b) => CAP[b.id] === b.capacity));
  t('timezone reported = America/Mazatlan', j.timezone === 'America/Mazatlan' && j.today === todayLocal, j.today);

  section = 'SHOW MY PRICE (quote)';
  let qok = true, qinfo = '';
  for (const [id, h] of COMBOS) { const [qs1, qj] = await quote({ boat: id, hours: h, date: day(200) }, undefined, `192.0.2.${100 + COMBOS.findIndex((c) => c[0] === id && c[1] === h)}`); if (qs1 !== 200 || qj.total !== price(id, h) || 'deposit' in qj || 'prices' in qj) { qok = false; qinfo += `${id}/${h}: ${qs1} ${JSON.stringify(qj)} `; } }
  t('19 quotes = approved total price, one combination per answer, no deposit/grid', qok, qinfo);
  [s, j] = await quote({ boat: 'boat-01', hours: 8, date: day(200) });
  t('Boat #1 8 hours → refused (not offered)', s === 409 && j.code === 'DURATION' && !('total' in j));
  [s, j] = await quote({ boat: 'boat-02', hours: 7, date: day(200) });
  t('invalid duration → 400', s === 400);
  [s, j] = await quote({ boat: 'boat-02', hours: 6, date: day(200) }, { origin: BASE });
  t('quote without the page header → 403 (no plain API scraping)', s === 403);
  [s, j] = await quote({ boat: 'boat-02', hours: 6, date: day(200) }, { origin: 'https://evil.example', 'x-efc-quote': '1' });
  t('cross-origin quote → 403', s === 403);
  [s, j] = await quote({ boat: 'boat-02', hours: 6, date: day(0) });
  t('quote for a date less than 24 h away → refused, no price', s === 409 && !('total' in j));
  let sumOk = true, sumInfo = '';
  for (const [id, h] of COMBOS) {
    const [, sj] = await summaryApi({ boat: id, hours: h });
    const dep = DEPOSITS[id], tot = price(id, h), fee = Math.round(dep * 6), charge = dep * 100 + fee;
    if (!(sj.ok && sj.total === tot && sj.deposit === dep && sj.balance === tot - dep && sj.cardFeeCents === fee && sj.cardChargeCents === charge && sj.wiseChargeCents === dep * 100 && sj.cardFeePct === 6)) { sumOk = false; sumInfo += `${id}/${h} ${JSON.stringify(sj)} `; }
  }
  t('final summary for all 19: deposit, balance = total − deposit, card fee = 6% of the deposit (cents), Wise = deposit', sumOk, sumInfo);
  [s, j] = await summaryApi({ boat: 'boat-01', hours: 8 });
  t('summary refuses Boat #1 8 hours', s === 400);

  section = 'Pages';
  let [ps, html, hd] = await get('/book-now');
  t('/book-now 200 with SEO title + H1', ps === 200 && html.includes('<title>Book a Fishing Charter in San Jose del Cabo | Exotic Fish Cabo</title>') && html.includes('Book Your San Jose del Cabo Fishing Charter'));
  t('/book-now has no price/availability schema', !/"@type":\s*"(Offer|Product|AggregateOffer)"/.test(html));
  t('/book-now HTML contains no price or deposit amount', !/\$\s?\d/.test(html) && !/depositUsd|price6|price8/.test(html));
  t('/book-now: SHOW MY PRICE, exact card label, legal statement (no checkbox), WhatsApp request', html.includes('SHOW MY PRICE') && html.includes('Card via Stripe (+6% processing fee)') && html.includes('By completing your booking, you agree to our <a href="/terms-conditions"') && html.includes('acknowledge our <a href="/privacy-policy"') && !/name="consent"/.test(html) && /id="req" href="https:\/\/wa\.me\/526241223506"/.test(html));
  [ps, html, hd] = await get('/book-now/confirmation');
  t('/book-now/confirmation noindex (meta + header)', ps === 200 && html.includes('content="noindex, nofollow"') && /noindex/.test(hd.get('x-robots-tag') || ''));
  [ps, html, hd] = await get('/book-now/canceled');
  t('/book-now/canceled noindex', html.includes('content="noindex, nofollow"'));
  [ps, html, hd] = await get('/booking-admin');
  t('/booking-admin noindex, no-store, frame-deny', ps === 200 && /noindex/.test(hd.get('x-robots-tag')) && hd.get('cache-control') === 'no-store' && hd.get('x-frame-options') === 'DENY');
  [ps, html] = await get('/admin/');
  t('/admin/ is still Sveltia CMS (not the booking dashboard)', ps === 200 && /sveltia/i.test(html) && !html.includes('EXOTIC FISH CABO · BOOKINGS'));
  [ps, html] = await get('/admin/bookings');
  t('old /admin/bookings path is not a booking route', !html.includes('EXOTIC FISH CABO · BOOKINGS'));
  let leak = [];
  for (const slug of ['23ft-panga', '26ft-super-panga', '27ft-premium-center-console', '30ft-cuddy-cabin', '31ft-premium-center-console', '29-ft-catamaran-center-console', '35ft-premium-cuddy-cabin', '37ft-ultimate-fishing-machine', '38ft-flybridge', '44ft-premium-flybridge']) {
    const [, h] = await get('/fishing-boats/' + slug);
    const vis = h.replace(/<script[\s\S]*?<\/script>/g, '');
    if (/From \$\d|starting from \$\d|Contact Us for Pricing|\$\d{3,}[^-]/.test(vis)) leak.push(slug);
  }
  t('no per-boat price on the 10 boat pages (text, title, meta)', leak.length === 0, leak.join(','));
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
  t('session works; holds 35 min / 24 h / 48 h, notice 24 h, departure 6:30', s === 200 && j.boats.length === 10 && j.settings.min_lead_hours === 24 && j.settings.stripe_fee_pct === 6 && j.settings.wise_hold_hours === 24 && j.settings.stripe_hold_minutes === 35 && j.settings.override_hold_hours === 48 && j.settings.departure_hour_local === 6 && j.settings.departure_minute_local === 30);
  t('database seeded with the approved prices and deposits (19 combinations)', j.boats.every((b) => b.p6 === price(b.id, 6) && b.p8 === price(b.id, 8) && b.deposit_usd === DEPOSITS[b.id]), JSON.stringify(j.boats.map((b) => [b.id, b.p6, b.p8, b.deposit_usd])));
  [s, j] = await admin('price', { boat: 'boat-01', field: 'price6', value: 12.5 });
  t('price validation (whole USD)', s === 400);
  await admin('price', { boat: 'boat-02', field: 'price6', value: 551 }); await admin('price', { boat: 'boat-02', field: 'price6', value: 550 });
  t('price edits from the dashboard are recorded (history)', sql(`SELECT COUNT(*) n FROM price_history WHERE boat_id='boat-02'`)[0].n === 2 && (await quote({ boat: 'boat-02', hours: 6, date: day(201) }))[1].total === 550);

  // ---------------- validation & lead time ----------------
  section = 'Public calendar privacy';
  const pm = day(-35).slice(0, 7);
  [s, j] = await get(`/api/booking/availability?boat=boat-02&month=${pm}`);
  t('past month → refused (400), nothing returned', s === 400 && !j.days);
  [s, j] = await get(`/api/booking/availability?boat=boat-02&month=${todayLocal.slice(0, 7)}`);
  t('current month: no day before today is returned', s === 200 && Object.keys(j.days).every((k) => k >= todayLocal) && Object.keys(j.days)[0] === todayLocal);
  t('only "available" / "unavailable", no reason, no counts, no identities', Object.values(j.days).every((v) => v === 'available' || v === 'unavailable') && !/ref|status|name|email|booked|pending|blocked|too_soon|count|total/i.test(JSON.stringify(j.days)));
  [s, j] = await get(`/api/booking/availability?boat=boat-02&month=${day(400).slice(0, 7)}`);
  t('beyond the booking window → refused', s === 400);
  [s, j] = await get('/book-now');
  t('/book-now legend: Available / Unavailable only', /Available <i class="l-bk"><\/i>Unavailable/.test(j) && !/>Booked</.test(j));

  section = 'Imported manual bookings';
  const MANUAL = [['boat-02', '2026-11-26'], ['boat-04', '2026-12-15'], ['boat-06', '2027-01-19']];
  for (const [b, d] of MANUAL) {
    const pub = d >= todayLocal ? await avail(b, d) : 'past';
    const [qs2, qj2] = d >= todayLocal ? await quote({ boat: b, hours: 6, date: d }) : [409, {}];
    const [, cal] = await get(`/api/admin/calendar?month=${d.slice(0, 7)}`, { admin: true });
    const blk = (cal.blocks || []).find((x) => x.boat_id === b && x.date === d);
    t(`#${+b.slice(5)} ${d}: unavailable on /book-now, quote refused, visible in /booking-admin as MANUAL BOOKING`, (pub === 'unavailable' || pub === 'past') && qs2 === 409 && !!blk && /^MANUAL BOOKING/.test(blk.reason) && cal.states[b][d] === 'blocked', JSON.stringify({ pub, qs2, blk }));
  }
  t('imported once (no duplicates), no customer/price/payment invented, no reservation, no email', sql(`SELECT COUNT(*) n FROM blocked_dates WHERE reason LIKE 'MANUAL BOOKING%'`)[0].n === 3 && sql(`SELECT COUNT(*) n FROM reservations`)[0].n === 0 && sql(`SELECT COUNT(*) n FROM email_log`)[0].n === 0 && sql(`SELECT COUNT(*) n FROM audit_log WHERE action='import_manual_bookings'`)[0].n === 1);
  t('other boats stay available on those dates', (await avail('boat-03', '2026-12-15')) === 'available');

  section = 'Validation';
  [s, j] = await reserve(customer('boat-01', day(-1)));
  t('past date refused', s === 409);
  [s, j] = await reserve(customer('boat-01', day(0)));
  t('today refused (24 h minimum notice), neutral message', s === 409 && j.code === 'UNAVAILABLE');
  t('availability today (< 24 h) = unavailable, reason not disclosed', (await avail('boat-01', day(0))) === 'unavailable');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { email: 'nope' })); t('bad email refused', s === 400 && j.field === 'email');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { people: 3 })); t('people > boat capacity refused (#1 = 2)', s === 400 && j.field === 'people');
  [s, j] = await reserve(customer('boat-01', day(6), 7)); t('duration must be 6 or 8', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6), 8)); t('Boat #1 8 hours refused at booking too', s === 400 && j.field === 'duration');
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { phone: 'abc' })); t('phone required', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'stripe', { website: 'spam' })); t('honeypot refused', s === 400);
  [s, j] = await reserve(customer('boat-01', day(6)), { origin: 'https://evil.example' }); t('cross-origin reserve → 403', s === 403);
  [s, j] = await reserve(customer('boat-01', day(6), 6, 'bitcoin')); t('unknown payment method refused', s === 400);
  if (!(await (await fetch(BASE + '/api/booking/boats')).json()).paypalPayments) { const before = sql(`SELECT COUNT(*) n FROM reservations`)[0].n; // PayPal account not connected (production today); connected → tests/paypal.mjs
    [s, j] = await reserve(customer('boat-01', day(6), 6, 'paypal'));
    t('PayPal (account not connected) → 503 PAYPAL_UNAVAILABLE, nothing reserved, no charge possible', s === 503 && j.code === 'PAYPAL_UNAVAILABLE' && /not yet available/.test(j.error) && sql(`SELECT COUNT(*) n FROM reservations`)[0].n === before, JSON.stringify(j)); }
  t('no reservation created by refused attempts', sql(`SELECT COUNT(*) n FROM reservations`)[0].n === 0);

  // ---------------- 10 boats × Stripe, one trip per day ----------------
  section = 'Stripe — 19 boat/duration combinations';
  const confirmed = {};
  const SIZE = { 'boat-01': 23, 'boat-02': 26, 'boat-03': 27, 'boat-04': 30, 'boat-05': 38, 'boat-06': 31, 'boat-07': 29, 'boat-08': 35, 'boat-09': 44, 'boat-10': 37 };
  const TEMPLATE = readFileSync(new URL('./fixtures/customer-confirmation-template.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const body = (ref, kind) => sql(`SELECT e.body, e.subject FROM email_log e JOIN reservations r ON r.id = e.reservation_id WHERE r.ref = '${ref}' AND e.kind = '${kind}'`);
  for (const [id, hours] of COMBOS) {
    const i = +id.slice(5) - 1, date = hours === 6 ? day(10 + i) : day(110 + i);
    const total = price(id, hours), deposit = DEPOSITS[id], balance = total - deposit;
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
    const other = price(id, hours === 6 ? 8 : 6) != null ? (hours === 6 ? 8 : 6) : hours; // Boat #1: 6 h only → same duration again
    const [s2, j2] = await reserve(customer(id, date, other));
    t(`${tag}: same day, ${other} h → refused with the neutral "not available online" message (reason not disclosed)`, s2 === 409 && j2.code === 'UNAVAILABLE' && j2.error === 'This date is not available online for this boat. A trip may still be possible upon request — please contact us to check availability.');
    const [w] = await webhook('checkout.session.completed', sess);
    const st2 = await status(sess.params.success_url);
    const em = emails(st2.ref);
    t(`${tag}: verified webhook → CONFIRMED, exactly 1 owner email + 1 customer deposit receipt`, w === 200 && st2.status === 'CONFIRMED' && em.filter((e) => e.kind === 'owner_confirmed' && e.recipient === 'owner@example.test').length === 1 && em.filter((e) => e.kind === 'customer_deposit_receipt' && e.recipient === 'customer@example.test').length === 1 && em.length === 2, JSON.stringify(em));
    const ob = body(st2.ref, 'owner_confirmed')[0];
    t(`${tag}: owner email shows "${hours} HOURS" first + all contact-form fields + amounts`, ob.subject.includes(`${hours} HOURS`) && ob.body.includes(`TRIP DURATION: ${hours} HOURS`) && ob.body.indexOf(`TRIP DURATION: ${hours} HOURS`) < ob.body.indexOf('Booking reference') &&
      ['First name: Test', 'Last name: Customer', 'Email: customer@example.test', 'Phone: +1 555 010 0000', `Date: ${date}`, 'People aboard: 2', `Duration: ${hours === 6 ? '3/4 day (6 hours)' : 'Full day (8 hours)'}`, 'Message: Test booking', `Booking reference: ${st2.ref}`, `Boat: Boat #${i + 1} (${SIZE[id]} ft)`, `Total charter price: $${total.toLocaleString('en-US')} USD`, `Required deposit: $${deposit.toLocaleString('en-US')}.00 USD`, `Deposit verified: $${deposit.toLocaleString('en-US')}.00 USD`,
        `Card processing fee: $${(deposit * 0.06).toFixed(2)} USD`, `Total charged to the customer: $${(deposit * 1.06).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, `Remaining balance (cash on the fishing day): $${balance.toLocaleString('en-US')} USD`,
        'Payment method: Card via Stripe', 'Payment status: VERIFIED', 'Verified at: ', `Transaction reference: ${sess.payment_intent}`, 'Status: CONFIRMED', 'People aboard: 2', 'Special requests / notes: Test booking'].every((x) => ob.body.includes(x)), ob.body);
    t(`${tag}: no vessel name in customer-facing texts (Stripe line item, customer email)`, sess.params['line_items[0][price_data][product_data][name]'].includes(`Boat #${i + 1} (${SIZE[id]} ft)`) && !/Panga|Console|Cuddy|Flybridge|Catamaran|Machine/.test(sess.params['line_items[0][price_data][product_data][name]'] + sess.params['metadata[boat]']));
    const cb = body(st2.ref, 'customer_deposit_receipt')[0];
    const fee = (deposit * 0.06).toFixed(2), chargeTxt = (deposit * 1.06).toLocaleString('en-US', { minimumFractionDigits: 2 });
    t(`${tag}: customer gets the DEPOSIT RECEIPT (subject, name, ref, Boat #${i + 1}, date, ${hours} hours, total, deposit received, balance, wait-for-neutral "our team" text, 2026-11-09)`,
      cb.subject === '[TEST] Exotic Fish Cabo — Deposit Received' && cb.body.startsWith('Dear Test,') &&
      ['Thank you for your deposit. Your booking has been received and your fishing date has been reserved.', `Booking reference: ${st2.ref}`, `Boat: Boat #${i + 1}`, `Trip date: ${longDate(date)}`, `Trip duration: ${hours} hours`,
        `Total charter price: $${total.toLocaleString('en-US')} USD`, `Deposit received: $${deposit.toLocaleString('en-US')}.00 USD (card payment of $${chargeTxt} USD including the $${fee} USD processing fee)`, `Remaining balance: $${balance.toLocaleString('en-US')} USD`,
        'Our team will personally send you a separate official booking confirmation email, including your departure time, meeting point, marina directions, and all necessary information for your fishing trip.',
        'Please wait for this personal confirmation email before making your way to the marina.'].every((x) => cb.body.includes(x)), cb.body);
    t(`${tag}: the automatic receipt is NOT the official confirmation (no marina link, no meeting time, no TORO)`, !cb.body.includes('maps.app.goo.gl') && !/6:30am|TORO|Logistics:/.test(cb.body) && emails(st2.ref).every((e) => e.kind !== 'customer_confirmed'));
    t(`${tag}: owner email shows the customer email address at the top`, ob.body.split('\n').slice(0, 4).join('\n').includes('CUSTOMER EMAIL: customer@example.test') && ob.body.includes('Phone / WhatsApp: +1 555 010 0000'));
    t(`${tag}: public calendar shows the day as "unavailable"`, (await avail(id, date)) === 'unavailable');
    if (id === 'boat-03' && hours === 6) {
      const bid = sql(`SELECT id FROM reservations WHERE ref='${st2.ref}'`)[0].id;
      const [, dj] = await get(`/api/admin/booking?id=${bid}`, { admin: true });
      const expected = TEMPLATE.replace("[Customer's Name]", 'Test').replace('[Date]', longDate(date)).replace('[X]', String(hours)).replace('[Size]', String(SIZE[id])).replace('[Amount]', '$' + balance.toLocaleString('en-US'));
      t('owner-approved official confirmation kept word for word, offered pre-filled in /booking-admin (never sent automatically)', dj.official?.text === expected && dj.official.subject === 'Your Fishing Trip Confirmation – Exotic Fish Cabo', dj.official?.text);
    }
    if (hours === 6) confirmed[id] = { date, sess, url: sess.params.success_url, ref: st2.ref };
  }
  t('refused same-day attempts created no reservation', sql(`SELECT COUNT(*) n FROM reservations`)[0].n === 19);
  t('terms acceptance recorded (version + time), no checkbox', sql(`SELECT COUNT(*) n FROM reservations WHERE terms_version = 'terms:2026-03;privacy:2026-02' AND consent_at IS NOT NULL`)[0].n === 19);

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
  const exm = sql(`SELECT e.subject, e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${stx.ref}' AND e.kind='owner_exception'`)[0];
  t('exception email = clearly "ACTION REQUIRED … NOT confirmed", no receipt to the customer, no refund made', /ACTION REQUIRED — payment received, booking NOT confirmed/.test(exm.subject) && /NOT confirmed/.test(exm.body) && /No automatic refund/.test(exm.body) && emails(stx.ref, 'customer_deposit_receipt').length === 0 && sql(`SELECT COUNT(*) n FROM payments p JOIN reservations r ON r.id=p.reservation_id WHERE r.ref='${stx.ref}' AND p.status='paid'`)[0].n === 1);
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

  section = 'Payment recovery';
  [s, j] = await reserve(customer('boat-08', day(35)));
  t('card reservation returns the customer token (page can retry cleanly)', s === 200 && /^[a-f0-9]{48}$/.test(j.t || ''));
  let rr = await (await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: j.ref, t: j.t }) })).json();
  const [s3, j3] = await reserve(customer('boat-08', day(35)));
  t('back from Stripe / declined → retry on the same date works, the old session is closed (no 2nd open payment)', rr.status === 'CANCELED' && s3 === 200 && sql(`SELECT COUNT(*) n FROM reservations WHERE boat_id='boat-08' AND date='${day(35)}' AND holds_slot=1`)[0].n === 1);
  const sP = sessionOf(j3.redirect); await webhook('checkout.session.completed', sP);
  rr = await (await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: j3.ref, t: j3.t }) })).json();
  t('a paid checkout can never be canceled by a later retry (no double charge)', rr.status === 'CONFIRMED' && (await reserve(customer('boat-08', day(35))))[0] === 409);

  section = 'Concurrency';
  const burst = await Promise.all(Array.from({ length: 8 }, (_, k) => reserve(customer('boat-06', day(40), k % 2 ? 8 : 6, k % 3 ? 'stripe' : 'wise'))));
  t('8 simultaneous attempts, same boat/day → exactly 1 succeeds', burst.filter(([x]) => x === 200).length === 1 && burst.filter(([x, y]) => x === 409 && y.code === 'UNAVAILABLE').length === 7, JSON.stringify(burst.map(([x]) => x)));
  t('database: one active reservation for that boat/day', sql(`SELECT COUNT(*) n FROM reservations WHERE boat_id='boat-06' AND date='${day(40)}' AND holds_slot=1`)[0].n === 1);

  section = 'Wise';
  [s, j] = await reserve(customer('boat-07', day(41), 8, 'wise'));
  const wq = qs(j.redirect); let wst = await status(j.redirect);
  t('Wise → AWAITING_PAYMENT_VERIFICATION, 24 h hold, deposit without fee', s === 200 && wst.status === 'AWAITING_PAYMENT_VERIFICATION' && wst.chargeCents === 40000 && wst.feeCents === 0 && Math.abs(Date.parse(wst.holdExpiresAt) - Date.now() - 24 * 3600e3) < 120e3 && wst.wiseUrl === 'https://wise.com/pay/me/loict92');
  t('Wise pending → customer instructions + ONE "WISE — PENDING PAYMENT" owner alert, no confirmation/receipt', emails(wq.ref, 'customer_wise_pending').length === 1 && emails(wq.ref, 'owner_wise_pending').length === 1 && emails(wq.ref, 'owner_wise_pending')[0].recipient === 'owner@example.test' && emails(wq.ref, 'owner_confirmed').length === 0 && emails(wq.ref, 'customer_deposit_receipt').length === 0);
  {
    const ob = sql(`SELECT e.subject, e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${wq.ref}' AND e.kind='owner_wise_pending'`)[0] || {};
    const rr = sql(`SELECT * FROM reservations WHERE ref='${wq.ref}'`)[0];
    t('Wise owner alert: label, NOT verified/NOT confirmed, all fields, deadline, dashboard link', ob.subject?.includes('WISE — PENDING PAYMENT') && ob.subject.includes(wq.ref)
      && ob.body.includes('Payment has NOT been verified. This booking is NOT confirmed.') && ob.body.includes(`Booking reference: ${wq.ref}`)
      && ob.body.includes(`CUSTOMER EMAIL: ${rr.email}`) && ob.body.includes(`Phone / WhatsApp: ${rr.phone}`) && ob.body.includes(`${rr.first_name} ${rr.last_name}`)
      && ob.body.includes('Boat: Boat #7') && ob.body.includes('TRIP DURATION: 8 HOURS') && ob.body.includes('Total charter price: $1,900 USD')
      && ob.body.includes('Expected Wise deposit: $400 USD') && ob.body.includes('Remaining balance (cash on the fishing day): $1,500 USD')
      && /Verify the payment before: .+\(24-hour hold/.test(ob.body) && ob.body.includes(BASE + '/booking-admin') && !/CONFIRMED —|VERIFIED\b/.test(ob.subject), (ob.body || '').slice(0, 400));
    t('Wise status: instructionsEmailed false while the email was not actually accepted (local dry run)', wst.instructionsEmailed === false);
    sql(`UPDATE email_log SET status='sent' WHERE kind='customer_wise_pending' AND reservation_id='${rr.id}'`);
    t('Wise status: instructionsEmailed true once the sending service accepted it', (await status(j.redirect)).instructionsEmailed === true);
    sql(`UPDATE email_log SET status='dry_run' WHERE kind='customer_wise_pending' AND reservation_id='${rr.id}'`);
  }
  t('Wise pending blocks the day', (await avail('boat-07', day(41))) === 'unavailable' && (await reserve(customer('boat-07', day(41))))[0] === 409);
  const wid = sql(`SELECT id FROM reservations WHERE ref='${wq.ref}'`)[0].id;
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'yes' });
  t('admin confirm without typing VERIFIED → refused', s === 409);
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 399, confirm: 'VERIFIED' });
  t('amount below the deposit → refused', s === 409);
  [s, j] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'VERIFIED', wiseRef: 'TR-1' });
  wst = await status(j.ok ? `/x?ref=${wq.ref}&t=${wq.t}` : '/x');
  const wob = sql(`SELECT e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${wq.ref}' AND e.kind='owner_confirmed'`)[0]?.body || '';
  t('Wise owner email: verified amount, no card fee, Wise reference, VERIFIED', ['Deposit verified: $400.00 USD', 'Card processing fee: none', 'Total charged to the customer: $400.00 USD', 'Payment method: Wise', 'Payment status: VERIFIED', 'Transaction reference: TR-1'].every((x) => wob.includes(x)), wob);
  t('owner verifies the Wise payment → CONFIRMED, 1 owner email + 1 customer deposit receipt', s === 200 && wst.status === 'CONFIRMED' && emails(wq.ref, 'owner_confirmed').length === 1 && emails(wq.ref, 'customer_deposit_receipt').length === 1);
  [s] = await admin('action', { id: wid, action: 'confirm_wise', amount: 400, confirm: 'VERIFIED' });
  t('confirming twice → refused, still one owner email', s === 409 && emails(wq.ref, 'owner_confirmed').length === 1);
  t('after verification: still exactly ONE Wise pending alert (no duplicate), separate final owner email kept', emails(wq.ref, 'owner_wise_pending').length === 1 && emails(wq.ref, 'owner_confirmed').length === 1);
  {
    const [ls, lj] = await reserve(customer('boat-09', day(43), 6, 'wise', { email: 'Mixed.Case@Example.TEST' }));
    const lr = ls === 200 ? sql(`SELECT email FROM reservations WHERE ref='${qs(lj.redirect).ref}'`)[0] : {};
    t('new booking: customer email stored in lowercase', ls === 200 && lr.email === 'mixed.case@example.test', JSON.stringify([ls, lr]));
    if (ls === 200) t('lowercase address used for the Wise instructions', emails(qs(lj.redirect).ref, 'customer_wise_pending')[0]?.recipient === 'mixed.case@example.test');
  }
  // Wise expiry + cron
  [s, j] = await reserve(customer('boat-08', day(42), 6, 'wise'));
  const wq2 = qs(j.redirect);
  sql(`UPDATE reservations SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE ref = '${wq2.ref}'`);
  await fetch(BASE + '/__scheduled?cron=17+*+*+*+*'); await fetch(BASE + '/__scheduled?cron=17+*+*+*+*');
  t('Wise not paid in 24 h → EXPIRED by the hourly job, customer told once, owner "WISE — EXPIRED" once, no CONFIRMED email', (await status(j.redirect)).status === 'EXPIRED' && emails(wq2.ref, 'customer_wise_expired').length === 1 && emails(wq2.ref, 'owner_wise_expired').length === 1 && emails(wq2.ref, 'owner_wise_expired')[0].recipient === 'owner@example.test' && emails(wq2.ref, 'owner_confirmed').length === 0);
  {
    const oe = sql(`SELECT e.subject, e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${wq2.ref}' AND e.kind='owner_wise_expired'`)[0] || {};
    t('owner expiry email: subject "[TEST] WISE — EXPIRED EFC-… — DATE RELEASED", no payment verified, date released, all fields', oe.subject === `[TEST] WISE — EXPIRED ${wq2.ref} — DATE RELEASED`
      && oe.body.includes('No payment was verified.') && oe.body.includes('the date has been released') && oe.body.includes(`Booking reference: ${wq2.ref}`) && oe.body.includes('Customer: Test Customer')
      && oe.body.includes('CUSTOMER EMAIL: customer@example.test') && oe.body.includes('Boat: Boat #8') && oe.body.includes('Expected Wise deposit: $') && oe.body.includes('Expired at (payment deadline):'), (oe.subject || '') + ' | ' + (oe.body || '').slice(0, 300));
    const ae = sql(`SELECT a.at, a.actor, a.details FROM audit_log a JOIN reservations r ON r.id=a.reservation_id WHERE r.ref='${wq2.ref}' AND a.action='hold_expired'`);
    const ad = ae[0] ? JSON.parse(ae[0].details) : {};
    t('expiration recorded once in the audit log (time, reference, reason)', ae.length === 1 && ae[0].actor === 'system' && !!ae[0].at && ad.ref === wq2.ref && /No Wise deposit verified before the 24-hour deadline/.test(ad.reason) && ad.deadline === '2000-01-01T00:00:00.000Z', JSON.stringify(ae));
    t('the date is available again after the expiry', (await avail('boat-08', day(42))) === 'available');
  }
  section = 'Staging hourly-job button';
  {
    // a Wise hold NOT yet due must never be touched; an overdue one is expired + notified once, even if run twice
    const [, nj] = await reserve(customer('boat-09', day(44), 6, 'wise')); const notDue = qs(nj.redirect);
    const [, oj] = await reserve(customer('boat-10', day(44), 8, 'wise')); const due = qs(oj.redirect);
    sql(`UPDATE reservations SET hold_expires_at = '${new Date(Date.now() - 60e3).toISOString()}' WHERE ref = '${due.ref}'`);
    t('run-hourly-job without the admin session → 401', (await fetch(BASE + '/api/admin/run-hourly-job', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', ...H }, body: '{}' })).status === 401);
    t('run-hourly-job without the CSRF header → 403', (await admin('run-hourly-job', {}, { 'x-efc-admin': '0' }))[0] === 403);
    const [r1s, r1] = await admin('run-hourly-job', {});
    const [r2s, r2] = await admin('run-hourly-job', {});
    t('run-hourly-job (staging): runs the existing job and reports it', r1s === 200 && r1.ok && r1.summary.ownerExpiryEmails >= 1 && r1.summary.customerExpiryEmails >= 1, JSON.stringify(r1));
    t('second run: nothing expired or sent again', r2s === 200 && r2.summary.expired === 0 && r2.summary.ownerExpiryEmails === 0 && r2.summary.customerExpiryEmails === 0, JSON.stringify(r2));
    t('overdue Wise hold → EXPIRED, exactly 1 customer + 1 owner expiry email, 1 audit entry', sql(`SELECT status FROM reservations WHERE ref='${due.ref}'`)[0].status === 'EXPIRED' && emails(due.ref, 'customer_wise_expired').length === 1 && emails(due.ref, 'owner_wise_expired').length === 1
      && sql(`SELECT COUNT(*) n FROM audit_log a JOIN reservations r ON r.id=a.reservation_id WHERE r.ref='${due.ref}' AND a.action='hold_expired'`)[0].n === 1);
    t('hold not yet due → untouched (still awaiting verification, date still held, no expiry email)', sql(`SELECT status, holds_slot FROM reservations WHERE ref='${notDue.ref}'`)[0].status === 'AWAITING_PAYMENT_VERIFICATION' && emails(notDue.ref, 'customer_wise_expired').length === 0 && emails(notDue.ref, 'owner_wise_expired').length === 0 && (await avail('boat-09', day(44))) === 'unavailable');
    t('manual runs are logged in the audit log', sql(`SELECT COUNT(*) n FROM audit_log WHERE action='hourly_job_run_manually'`)[0].n >= 2);
  }
  const wid2 = sql(`SELECT id FROM reservations WHERE ref='${wq2.ref}'`)[0].id;
  [s] = await admin('action', { id: wid2, action: 'confirm_wise', amount: 500, confirm: 'VERIFIED' });
  t('payment found after expiry, date still free → owner can still confirm', s === 200 && (await status(j.redirect)).status === 'CONFIRMED');

  // ---------------- second trip (owner override) ----------------
  section = 'Second trip override';
  const c9 = confirmed['boat-09'];
  const base2 = { boat: 'boat-09', date: c9.date, hours: 8, people: 4, payment: 'stripe', fname: 'Second', lname: 'Guest', email: 'second@example.test', phone: '+1 555 020 0000', message: 'Approved by owner' };
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
  t('override uses the approved price (no hand-typed total)', sql(`SELECT total_usd, balance_usd FROM reservations WHERE ref='${ov.ref}'`)[0].total_usd === 3500);
  t('existing confirmed trip untouched', firstStill.status === 'CONFIRMED' && sql(`SELECT slot FROM reservations WHERE ref='${c9.ref}'`)[0].slot === 0);
  t('customer gets a payment request; owner gets no confirmation yet', emails(ov.ref, 'customer_payment_request').length === 1 && emails(ov.ref, 'owner_confirmed').length === 0);
  t('audit log records the override', sql(`SELECT COUNT(*) n FROM audit_log a JOIN reservations r ON r.id=a.reservation_id WHERE r.ref='${ov.ref}' AND a.action='second_trip_override' AND a.actor='admin'`)[0].n === 1);
  t('public availability for that day still unavailable (no automatic second trip)', (await avail('boat-09', c9.date)) === 'unavailable' && (await reserve(customer('boat-09', c9.date)))[0] === 409);
  let [pst, , phd] = await get(new URL(ov.payUrl).pathname + new URL(ov.payUrl).search);
  const so = sessions.get((phd.get('location') || '').split('/pay/')[1]);
  t('payment link → Stripe Checkout for deposit + 6%', pst === 303 && so && so.amount_total === 53000);
  [w1, wj] = await webhook('checkout.session.completed', so);
  t('second trip confirmed only after the verified payment, owner + customer emailed once', wj.result === 'confirmed' && (await status(ov.statusUrl)).status === 'CONFIRMED' && emails(ov.ref, 'owner_confirmed').length === 1 && emails(ov.ref, 'customer_deposit_receipt').length === 1);
  t('first trip still confirmed, 2 active trips that day', (await status(c9.url)).status === 'CONFIRMED' && sql(`SELECT COUNT(*) n FROM reservations WHERE boat_id='boat-09' AND date='${c9.date}' AND holds_slot=1 AND status='CONFIRMED'`)[0].n === 2);
  // override paid by Wise
  [s, j] = await admin('second-trip', { ...base2, boat: 'boat-01', date: confirmed['boat-01'].date, hours: 8, people: 2, confirm: 'SECOND TRIP' });
  t('second trip cannot create Boat #1 8 hours', s === 400);
  [s, j] = await admin('second-trip', { ...base2, boat: 'boat-10', date: confirmed['boat-10'].date, hours: 6, people: 3, payment: 'wise', confirm: 'SECOND TRIP' });
  const ovw = j;
  t('override with Wise → AWAITING_PAYMENT_VERIFICATION, no owner email', s === 200 && ovw.status === 'AWAITING_PAYMENT_VERIFICATION' && emails(ovw.ref, 'owner_confirmed').length === 0);
  const ovwid = sql(`SELECT id FROM reservations WHERE ref='${ovw.ref}'`)[0].id;
  [s] = await admin('action', { id: ovwid, action: 'confirm_wise', amount: 1000, confirm: 'VERIFIED' });
  t('…confirmed only when the owner verifies the Wise deposit', s === 200 && emails(ovw.ref, 'owner_confirmed').length === 1);
  // customer cancel link must not drop an override hold
  [s, j] = await admin('second-trip', { ...base2, boat: 'boat-03', date: confirmed['boat-03'].date, hours: 6, people: 2, confirm: 'SECOND TRIP' });
  const q3 = qs(j.statusUrl);
  rjj = await (await fetch(BASE + '/api/booking/cancel-checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ ref: q3.ref, t: q3.t }) })).json();
  t('leaving Checkout does not cancel an owner-approved second trip', rjj.status === 'AWAITING_PAYMENT');

  // ---------------- telephone bookings (owner) ----------------
  section = 'Phone booking';
  const pb = { boat: 'boat-05', date: day(120 + 40), hours: 8, people: 6, fname: 'Phone', lname: 'Customer', phone: '+52 624 000 0000', email: 'phone@example.test' };
  [s, j] = await admin('phone-booking', { ...pb, payment: 'received', amount: 300, confirm: 'nope' });
  t('deposit received requires typing VERIFIED', s === 400);
  [s, j] = await admin('phone-booking', { ...pb, payment: 'received', amount: 299, confirm: 'VERIFIED' });
  t('amount below the deposit refused', s === 400);
  [s, j] = await admin('phone-booking', { ...pb, boat: 'boat-01', hours: 8, people: 2, payment: 'received', amount: 100, confirm: 'VERIFIED' });
  t('Boat #1 8 hours refused for phone bookings too', s === 400);
  [s, j] = await admin('phone-booking', { ...pb, payment: 'received', amount: 300, confirm: 'VERIFIED', payRef: 'cash' });
  const pr = j;
  t('deposit received → CONFIRMED at the approved price, balance computed', s === 200 && pr.status === 'CONFIRMED' && pr.total === 1800 && pr.balance === 1500, JSON.stringify(j));
  t('…owner record email + customer deposit receipt, once each', emails(pr.ref, 'owner_confirmed').length === 1 && emails(pr.ref, 'customer_deposit_receipt').length === 1);
  t('…the day is now unavailable for customers', (await avail('boat-05', pb.date)) === 'unavailable' && (await reserve(customer('boat-05', pb.date, 6)))[0] === 409);
  [s, j] = await admin('phone-booking', { ...pb, hours: 6, payment: 'received', amount: 300, confirm: 'VERIFIED' });
  t('same boat/day again → refused (second trip needs the explicit override)', s === 409 && /SECOND TRIP|second trip/i.test(j.error));
  [s, j] = await admin('phone-booking', { ...pb, date: day(161), email: '', payment: 'received', amount: 300, confirm: 'VERIFIED' });
  const nob = sql(`SELECT e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${j.ref}' AND e.kind='owner_confirmed'`)[0]?.body || '';
  t('missing optional fields shown honestly in the owner email (no invented data)', nob.includes('CUSTOMER EMAIL: (no email given)') && nob.includes('Special requests / notes: (telephone booking)') && nob.includes('Deposit verified: $300.00 USD'), nob.slice(0, 300));
  t('no email given → confirmed, owner record only (no customer email)', s === 200 && emails(j.ref, 'customer_deposit_receipt').length === 0 && emails(j.ref, 'owner_confirmed').length === 1);
  [s, j] = await admin('phone-booking', { ...pb, date: day(162), payment: 'stripe' });
  const pst2 = j;
  t('card link → AWAITING_PAYMENT, payment request sent, nothing confirmed', s === 200 && pst2.status === 'AWAITING_PAYMENT' && !!pst2.payUrl && emails(pst2.ref, 'customer_payment_request').length === 1 && emails(pst2.ref, 'owner_confirmed').length === 0);
  [s, j] = await admin('phone-booking', { ...pb, date: day(163), payment: 'wise' });
  t('Wise → AWAITING_PAYMENT_VERIFICATION, instructions sent, nothing confirmed', s === 200 && j.status === 'AWAITING_PAYMENT_VERIFICATION' && emails(j.ref, 'customer_wise_pending').length === 1 && emails(j.ref, 'owner_confirmed').length === 0);
  await admin('block', { boat: 'boat-05', date: day(164), block: true });
  [s, j] = await admin('phone-booking', { ...pb, date: day(164), payment: 'received', amount: 300, confirm: 'VERIFIED' });
  t('blocked day refused', s === 409);
  t('phone booking requires the admin session', (await fetch(BASE + '/api/admin/phone-booking', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', ...H }, body: JSON.stringify(pb) }).then(async (r) => (await r.text(), r.status))) === 401);

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
  t('move date to a free day', s === 200 && (await avail('boat-04', day(70))) === 'unavailable' && (await avail('boat-04', c4.date)) === 'available');
  [s, j] = await admin('action', { id: c4id, action: 'move_date', date: day(32) === day(32) && confirmed['boat-04'] ? day(70) : day(70) });
  [s, j] = await reserve(customer('boat-04', day(71)));
  [s, j] = await admin('action', { id: c4id, action: 'move_date', date: day(71) });
  t('move onto a booked day → refused', s === 409);
  [s, j] = await admin('block', { boat: 'boat-01', date: day(80), block: true, reason: 'maintenance' });
  t('block a day → not bookable', s === 200 && (await avail('boat-01', day(80))) === 'unavailable' && (await reserve(customer('boat-01', day(80))))[0] === 409);
  [s, j] = await admin('block', { boat: '*', date: day(81), block: true });
  t('block a day for all boats', (await avail('boat-07', day(81))) === 'unavailable');
  [s, j] = await admin('block', { boat: 'boat-01', date: day(80), block: false });
  t('unblock', (await avail('boat-01', day(80))) === 'available');
  [s, j] = await admin('settings', { wise_hold_hours: 9999 });
  t('settings validated', s === 400);
  [s, j] = await admin('settings', { min_lead_hours: 48 });
  t('settings saved (minimum notice 48 h)', s === 200 && (await avail('boat-01', day(1))) === 'unavailable');
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

  section = 'Clients list';
  [s, j] = await get('/api/admin/clients', { admin: true });
  t('clients list: exactly two fields (name, email)', s === 200 && j.clients.length > 0 && j.clients.every((c) => JSON.stringify(Object.keys(c)) === '["name","email"]'));
  t('one line per email address (no duplicates, case-insensitive)', new Set(j.clients.map((c) => c.email)).size === j.clients.length && j.clients.filter((c) => c.email === 'customer@example.test').length === 1 && j.clients.find((c) => c.email === 'customer@example.test').name === 'Test Customer');
  t('phone bookings without an email are not listed; no phone numbers anywhere', !j.clients.some((c) => !c.email) && !/\+1 555|\+52 624/.test(JSON.stringify(j)));
  t('clients list requires the admin session', (await fetch(BASE + '/api/admin/clients').then(async (r) => (await r.text(), r.status))) === 401);

  section = 'Emails (global)';
  const all = sql(`SELECT r.status, e.kind FROM email_log e JOIN reservations r ON r.id = e.reservation_id WHERE e.kind = 'owner_confirmed'`);
  const perRes = sql(`SELECT reservation_id, COUNT(*) n FROM email_log WHERE kind='owner_confirmed' GROUP BY reservation_id HAVING n > 1`);
  t('owner confirmation emails exist only for paid+confirmed bookings', all.length > 0 && all.every((e) => ['CONFIRMED', 'REFUND_PENDING', 'REFUNDED'].includes(e.status)));
  t('never two owner confirmations for the same booking', perRes.length === 0);
  t('no owner email for pending / expired / canceled attempts (except the "WISE — PENDING PAYMENT" alert and the "WISE — EXPIRED" notice)', sql(`SELECT COUNT(*) n FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE e.recipient='owner@example.test' AND r.status IN ('EXPIRED','CANCELED','AWAITING_PAYMENT','AWAITING_PAYMENT_VERIFICATION','HELD') AND e.kind NOT IN ('owner_exception','owner_wise_pending','owner_wise_expired')`)[0].n === 0);
  t('"WISE — PENDING PAYMENT" alerts: Wise website bookings only, never twice for one booking', sql(`SELECT COUNT(*) n FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE e.kind='owner_wise_pending' AND (r.payment_method <> 'wise' OR r.source <> 'online')`)[0].n === 0
    && sql(`SELECT COUNT(*) n FROM (SELECT reservation_id FROM email_log WHERE kind='owner_wise_pending' GROUP BY reservation_id HAVING COUNT(*) > 1)`)[0].n === 0
    && sql(`SELECT COUNT(*) n FROM email_log WHERE kind='owner_wise_pending'`)[0].n > 0);
  t('owner subjects all carry the trip duration and the boat number', sql(`SELECT subject FROM email_log WHERE kind='owner_confirmed'`).every((m) => /CONFIRMED EFC-[A-Z0-9]{6} — [68] HOURS — Boat #\d+, /.test(m.subject)));
  t('no vessel names in any email sent to a customer', sql(`SELECT body FROM email_log WHERE recipient <> 'owner@example.test'`).every((m) => !/Panga|Center Console|Cuddy|Flybridge|Catamaran|Fishing Machine/.test(m.body)));
  t('no automatic email ever contains the official confirmation (TORO / marina directions)', sql(`SELECT body FROM email_log`).every((m) => !m.body.includes('just ask for TORO') && !m.body.includes('maps.app.goo.gl/CXbVM7vW1abnT1cbA')));
  t('the full confirmation template is never sent automatically', sql(`SELECT COUNT(*) n FROM email_log WHERE kind LIKE 'customer_confirmed%'`)[0].n === 0);

  section = 'Rate limit';
  let qlimited = false;
  for (let k = 0; k < 45; k++) { const [x] = await quote({ boat: 'boat-02', hours: 6, date: day(200) }, undefined, '203.0.113.50'); if (x === 429) { qlimited = k >= 40; break; } }
  t('price quotes: 40 per hour per IP pass, then refused (bulk collection)', qlimited);
  t('…a normal visitor on another IP is not affected', (await quote({ boat: 'boat-02', hours: 6, date: day(200) }, undefined, '203.0.113.51'))[0] === 200);
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
