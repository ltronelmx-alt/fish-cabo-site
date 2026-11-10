// /booking-admin — one-click Wise confirmation (owner, 2026-11-09): button → dialog (Cancel / Confirm Payment) → the
// existing confirm_wise action. Real browser (Playwright) against wrangler dev (staging vars, local D1). No email sent
// (no RESEND_API_KEY locally → dry run). Usage: node tests/admin-wise.mjs [baseUrl]   (PASS = ADMIN_PASSWORD of wrangler dev)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787', PASS = process.env.ADMIN_PASS || 'test-admin-pass', PERSIST = process.env.PERSIST || '/tmp/wpb';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
try { sql('DELETE FROM rate_limits'); } catch {}
let ipN = 0; const D0 = 140 + Math.floor(Math.random() * 150); // fresh dates on every run
async function book(boat, days, payment = 'wise') {
  const f = new FormData();
  const date = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries({ fname: 'Wise', lname: 'Owner', email: 'wise@example.test', phone: '+1 555 010 0000', date, people: '2', duration: '6', boat, payment, message: 'admin wise test', 'cf-turnstile-response': 'x' })) f.append(k, v);
  const r = await fetch(BASE + '/api/booking/reserve', { method: 'POST', body: f, headers: { origin: BASE, 'cf-connecting-ip': `192.0.2.${++ipN}` } });
  const j = await r.json(); const ref = j.ref || new URL(j.redirect, BASE).searchParams.get('ref');
  return { ref, id: sql(`SELECT id FROM reservations WHERE ref='${ref}'`)[0].id };
}
const row = (ref) => sql(`SELECT status, holds_slot FROM reservations WHERE ref='${ref}'`)[0];
const count = (ref, q) => sql(`SELECT COUNT(*) n FROM ${q} WHERE reservation_id=(SELECT id FROM reservations WHERE ref='${ref}')`)[0].n;

const A = await book('boat-03', D0), B = await book('boat-04', D0), C = await book('boat-05', D0);
const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
let requests = 0; p.on('request', (r) => { if (r.url().endsWith('/api/admin/action') && r.method() === 'POST') requests++; });
await p.goto(BASE + '/booking-admin'); await p.fill('#pw', PASS); await p.click('#lf button'); await p.waitForSelector('#nav:not(.hide)');
const pb = await p.evaluate((d) => api('phone-booking', { boat: 'boat-06', hours: 6, date: d, fname: 'Card', lname: 'Customer', email: 'card@example.test', phone: '+1 555 010 0001', people: 2, payment: 'stripe' }), new Date(Date.now() + (D0 + 1) * 864e5).toISOString().slice(0, 10));
const S = { ref: pb.ref, id: pb.id };
const open = async (id) => { await p.evaluate((x) => detail(x), id); await p.waitForSelector('#detail .actions'); };

// A — Cancel in the dialog changes nothing
await open(A.id);
t('Wise pending booking: "Confirm Wise Payment Received" button, no VERIFIED field, booking reference shown (not typed)', await p.locator('#wiseok').isVisible() && (await p.locator('#wv').count()) === 0 && (await p.locator('#detail .actions').innerText()).includes(A.ref));
await p.click('#wiseok');
t('dialog asks the exact question with Cancel / Confirm Payment', await p.locator('#wdlg').isVisible() && (await p.locator('#wdlg').innerText()).includes('Have you verified that the correct Wise deposit has been received in your Wise account?') && (await p.locator('#wdno').innerText()) === 'Cancel' && (await p.locator('#wdyes').innerText()) === 'Confirm Payment');
await p.click('#wdno');
t('Cancel → dialog closed, nothing sent, booking still pending', !(await p.locator('#wdlg').isVisible()) && requests === 0 && row(A.ref).status === 'AWAITING_PAYMENT_VERIFICATION');

// A — Confirm Payment, clicked twice very fast (double-click)
await p.click('#wiseok'); await p.locator('#wdyes').dblclick();
await p.waitForFunction(() => /CONFIRMED/.test(document.querySelector('#detail .kv')?.innerText || ''), null, { timeout: 8000 });
t('double-click on Confirm Payment → ONE request, booking CONFIRMED', requests === 1 && row(A.ref).status === 'CONFIRMED' && row(A.ref).holds_slot === 1, `requests=${requests}`);
t('exactly 1 payment (deposit, verified, reference taken from the booking), 1 wise_verified audit entry', count(A.ref, 'payments') === 1 && sql(`SELECT amount_cents a, status s, external_id x FROM payments WHERE reservation_id='${A.id}'`).every((r) => r.a === 20000 && r.s === 'verified' && r.x === `Wise · booking ${A.ref}`) && sql(`SELECT COUNT(*) n FROM audit_log WHERE reservation_id='${A.id}' AND action='wise_verified'`)[0].n === 1);
t('exactly 1 owner CONFIRMED email + 1 customer deposit receipt', sql(`SELECT COUNT(*) n FROM email_log WHERE reservation_id='${A.id}' AND kind='owner_confirmed'`)[0].n === 1 && sql(`SELECT COUNT(*) n FROM email_log WHERE reservation_id='${A.id}' AND kind='customer_deposit_receipt'`)[0].n === 1);
t('confirmed booking: the Wise button is gone', (await p.locator('#wiseok').count()) === 0);

// repeated request for an already confirmed booking (e.g. second tab) → refused, nothing duplicated
const rep = await p.evaluate((id) => api('action', { id, action: 'confirm_wise', amount: '200', wiseRef: 'x', confirm: 'VERIFIED' }), A.id);
t('repeated confirmation → refused, still 1 payment / 1 email each', !rep.ok && /CONFIRMED/.test(rep.error || '') && count(A.ref, 'payments') === 1 && sql(`SELECT COUNT(*) n FROM email_log WHERE reservation_id='${A.id}' AND kind='owner_confirmed'`)[0].n === 1, JSON.stringify(rep));

// B — the same booking open in two tabs: both confirm → only one wins
await open(B.id);
const [r1, r2] = await p.evaluate((id) => Promise.all([1, 2].map(() => api('action', { id, action: 'confirm_wise', amount: '200', wiseRef: 'Wise · booking', confirm: 'VERIFIED' }))), B.id);
t('two simultaneous confirmations → exactly one succeeds, 1 payment, 1 owner email', [r1, r2].filter((r) => r.ok).length === 1 && count(B.ref, 'payments') === 1 && sql(`SELECT COUNT(*) n FROM email_log WHERE reservation_id='${B.id}' AND kind='owner_confirmed'`)[0].n === 1, JSON.stringify([r1, r2]));

// C — server checks unchanged: amount below the deposit (edited in "Different amount") → refused, nothing changed
await open(C.id);
await p.locator('#detail fieldset:has(#wiseok) details summary').click(); await p.fill('#wa', '150');
await p.click('#wiseok'); await p.click('#wdyes');
await p.waitForFunction(() => /deposit/i.test(document.querySelector('#dmsg')?.textContent || ''), null, { timeout: 8000 });
t('amount below the deposit → refused with the server message, booking still pending, button usable again', row(C.ref).status === 'AWAITING_PAYMENT_VERIFICATION' && count(C.ref, 'payments') === 0 && !(await p.locator('#wiseok').isDisabled()));
const noWord = await p.evaluate((id) => api('action', { id, action: 'confirm_wise', amount: '300' }), C.id);
t('server still requires the confirmation token (request without it → refused)', !noWord.ok && row(C.ref).status === 'AWAITING_PAYMENT_VERIFICATION');

// invalid states
await open(S.id);
t('card (Stripe) booking: no Wise button', (await p.locator('#wiseok').count()) === 0);
const st = await p.evaluate((id) => api('action', { id, action: 'confirm_wise', amount: '400', confirm: 'VERIFIED' }), S.id);
t('confirm_wise on a card booking → refused ("Not a Wise booking")', !st.ok && /Not a Wise booking/.test(st.error || ''));
const anon = await fetch(BASE + '/api/admin/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE }, body: JSON.stringify({ id: C.id, action: 'confirm_wise', amount: '300', confirm: 'VERIFIED' }) });
t('without the admin session → 401, nothing changed', anon.status === 401 && row(C.ref).status === 'AWAITING_PAYMENT_VERIFICATION');
t('a customer submitting a Wise booking never marks it paid (pending + 0 payments until the owner confirms)', row(C.ref).status === 'AWAITING_PAYMENT_VERIFICATION' && count(C.ref, 'payments') === 0);
t('no JavaScript error in /booking-admin', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
