// Pre-launch audit B3/B5/B6: once-only notifications with bounded retries, Reply-To, admin links.
// Starts its own `wrangler dev` (port 8790) wired to a MOCK Resend on 127.0.0.1:8791 (no real email is sent; the
// override is ignored by a production Worker). Needs `npm run build` first. Usage: node tests/email-retry.mjs
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const PORT = 8790, MOCK = 8791, BASE = `http://127.0.0.1:${PORT}`, PERSIST = '/tmp/wp-mail', PASS = 'mail-test-pass', OWNER = 'owner@example.test';
const results = []; let section = '';
const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${section} › ${name}${!ok && info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock Resend: mode = 'ok' | 'fail500' | 'fail422'; every request is recorded
let mode = 'ok'; const sent = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const j = JSON.parse(b || '{}'); sent.push({ ...j, mode });
    const code = mode === 'ok' ? 200 : mode === 'fail422' ? 422 : 500;
    res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(code === 200 ? { id: 'mock_' + sent.length } : { name: 'mock_error' }));
  });
}).listen(MOCK, '127.0.0.1');

rmSync(PERSIST, { recursive: true, force: true });
const wr = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', PERSIST, '--test-scheduled',
  ...['ADMIN_PASSWORD:' + PASS, 'CONTACT_TO:' + OWNER, 'CONTACT_FROM:Exotic Fish Cabo TEST <bookings@example.test>', 'RESEND_API_KEY:re_mock_local',
    `RESEND_API_BASE:http://127.0.0.1:${MOCK}`, 'SITE_ENV:staging', `SITE_URL:${BASE}`].flatMap((v) => ['--var', v])], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/booking/boats')).ok) break; } catch {} await sleep(1000); }

const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const lh = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE }, body: JSON.stringify({ password: PASS }) });
const cookie = (lh.headers.get('set-cookie') || '').split(';')[0];
const admin = (path, body = {}) => fetch(BASE + '/api/admin/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE, cookie }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
const job = async () => (await admin('run-hourly-job'))[1].summary;
let ipN = 0, dayN = 50;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
async function wise(boat = 'boat-03') {
  const f = new FormData();
  for (const [k, v] of Object.entries({ fname: 'Mail', lname: 'Test', email: 'Customer@Example.TEST', phone: '+1 555 010 0000', date: day(++dayN), people: '2', duration: '6', boat, payment: 'wise', message: 'retry test', 'cf-turnstile-response': 'x' })) f.append(k, v);
  const r = await fetch(BASE + '/api/booking/reserve', { method: 'POST', body: f, headers: { origin: BASE, 'cf-connecting-ip': `203.0.113.${++ipN}` } });
  const j = await r.json(); const u = new URL(j.redirect, BASE);
  const ref = u.searchParams.get('ref'), tok = u.searchParams.get('t');
  return { ref, tok, id: sql(`SELECT id FROM reservations WHERE ref='${ref}'`)[0].id };
}
const log = (ref, kind) => sql(`SELECT e.kind, e.status, e.recipient, e.body FROM email_log e JOIN reservations r ON r.id=e.reservation_id WHERE r.ref='${ref}'${kind ? ` AND e.kind='${kind}'` : ''} ORDER BY e.id`);
const statuses = (ref, kind) => log(ref, kind).map((e) => e.status).join(',');
const mails = (ref, pred = () => true) => sent.filter((m) => m.subject?.includes(ref) || (m.text || '').includes(ref)).filter(pred);
const status = (b) => fetch(`${BASE}/api/booking/status?ref=${b.ref}&t=${b.tok}`).then((r) => r.json());

section = 'Wise pending: failure then retry';
mode = 'fail500';
const A = await wise();
t('provider failure recorded (customer instructions + owner alert = failed_500), booking status unchanged', statuses(A.ref, 'customer_wise_pending') === 'failed_500' && statuses(A.ref, 'owner_wise_pending') === 'failed_500' && (await status(A)).status === 'AWAITING_PAYMENT_VERIFICATION');
t('confirmation page does not claim the instructions were emailed', (await status(A)).instructionsEmailed === false);
mode = 'ok'; const n0 = sent.length;
let sum = await job();
t('hourly job retries both: each now has exactly one accepted send', statuses(A.ref, 'customer_wise_pending') === 'failed_500,sent' && statuses(A.ref, 'owner_wise_pending') === 'failed_500,sent' && sum.emailRetries >= 2, JSON.stringify(sum));
const custA = mails(A.ref, (m) => m.mode === 'ok' && m.to[0] === 'customer@example.test');
const ownA = mails(A.ref, (m) => m.mode === 'ok' && m.to[0] === OWNER);
t('B5: customer instructions — Reply-To = CONTACT_TO, lowercase recipient', custA.length === 1 && custA[0].reply_to === OWNER);
t('B6: owner alert links to THIS environment\'s /booking-admin (from SITE_URL), Reply-To = customer', ownA.length === 1 && ownA[0].text.includes(`${BASE}/booking-admin`) && !ownA[0].text.includes('fish-cabo.com/booking-admin') && ownA[0].reply_to === 'customer@example.test');
t('confirmation page now says the instructions were emailed', (await status(A)).instructionsEmailed === true);
const n1 = sent.length; await job(); await job();
t('repeated hourly runs: nothing re-sent', sent.length === n1 && n1 - n0 === 2);

section = 'Successful emails are never duplicated';
const B = await wise('boat-04'); const nb = mails(B.ref).length;
await job(); await job();
t('2 accepted at booking time, 0 more after 2 hourly runs', nb === 2 && mails(B.ref).length === 2 && statuses(B.ref) === 'sent,sent');

section = 'Bounded retries';
mode = 'fail500';
const C = await wise('boat-05');
for (let i = 0; i < 7; i++) await job();
const cc = log(C.ref, 'owner_wise_pending').length, ci = log(C.ref, 'customer_wise_pending').length;
t(`transient failures stop after 5 attempts per notification (no infinite loop): ${cc}/${ci}`, cc === 5 && ci === 5);
mode = 'fail422';
const D = await wise('boat-06');
mode = 'ok'; await job(); await job();
t('permanent rejection (422) is recorded and never retried', statuses(D.ref, 'owner_wise_pending') === 'rejected_422' && statuses(D.ref, 'customer_wise_pending') === 'rejected_422');

section = 'Wise expiry: recoverable after an ordinary request expired the booking';
const E = await wise('boat-07');
sql(`UPDATE reservations SET hold_expires_at='${new Date(Date.now() - 60e3).toISOString()}' WHERE ref='${E.ref}'`);
const se = await status(E); // ordinary customer request → sweep expires it (no email from a request)
t('expired by an ordinary request: EXPIRED, one audit entry, no expiry email yet', se.status === 'EXPIRED' && sql(`SELECT COUNT(*) n FROM audit_log WHERE reservation_id='${E.id}' AND action='hold_expired'`)[0].n === 1 && log(E.ref, 'customer_wise_expired').length === 0);
mode = 'fail500'; await job();
t('hourly job: expiry notices attempted, failures recorded', statuses(E.ref, 'customer_wise_expired') === 'failed_500' && statuses(E.ref, 'owner_wise_expired') === 'failed_500');
mode = 'ok'; sum = await job();
t('next hourly job: both expiry notices sent once', statuses(E.ref, 'customer_wise_expired') === 'failed_500,sent' && statuses(E.ref, 'owner_wise_expired') === 'failed_500,sent' && sum.customerExpiryEmails === 1 && sum.ownerExpiryEmails === 1, JSON.stringify(sum));
const ce = mails(E.ref, (m) => m.mode === 'ok' && m.to[0] === 'customer@example.test' && m.subject.includes('Reservation released'));
const oe = mails(E.ref, (m) => m.mode === 'ok' && m.subject.includes('WISE — EXPIRED'));
t('B5: customer expiry email Reply-To = CONTACT_TO', ce.length === 1 && ce[0].reply_to === OWNER, JSON.stringify(ce.map((m) => [m.subject, m.reply_to])));
t('B6: owner expiry notice links to this environment\'s /booking-admin', oe.length === 1 && oe[0].text.includes(`${BASE}/booking-admin`));
const ne = sent.length; await job(); await job();
t('repeated runs after success: nothing re-sent', sent.length === ne);

section = '"ACTION REQUIRED" retry';
mode = 'ok';
const F = await wise('boat-08');
sql(`UPDATE reservations SET status='PAYMENT_EXCEPTION', holds_slot=0, updated_at='${new Date().toISOString()}' WHERE id='${F.id}'`);
sql(`INSERT INTO audit_log (at, actor, action, reservation_id, details) VALUES ('${new Date().toISOString()}', 'system', 'payment_exception', '${F.id}', '{"problem":"Amount mismatch: received 100 usd, expected 21200 usd."}')`);
sql(`INSERT INTO email_log (reservation_id, kind, recipient, subject, status, at, body) VALUES ('${F.id}', 'owner_exception', '${OWNER}', 'x', 'failed_503', '${new Date().toISOString()}', 'x')`);
await job();
const fx = mails(F.ref, (m) => m.subject.includes('ACTION REQUIRED'));
t('failed ACTION REQUIRED is retried once with the recorded problem and the environment admin link', statuses(F.ref, 'owner_exception') === 'failed_503,sent' && fx.length === 1 && fx[0].text.includes('Amount mismatch') && fx[0].text.includes(`${BASE}/booking-admin`));
await job(); t('…and not again', mails(F.ref, (m) => m.subject.includes('ACTION REQUIRED')).length === 1);

section = 'Concurrent hourly runs';
mode = 'fail500'; const G = await wise('boat-09'); mode = 'ok';
await Promise.all([job(), job(), job()]);
t('three simultaneous runs → each notification sent exactly once', log(G.ref).filter((e) => e.status === 'sent').length === 2 && mails(G.ref, (m) => m.mode === 'ok').length === 2);

section = 'Existing CONFIRMED / receipt retries preserved';
mode = 'ok'; const Hb = await wise('boat-10'); mode = 'fail500';
const [cs] = await admin('action', { id: Hb.id, action: 'confirm_wise', amount: 1000, confirm: 'VERIFIED', wiseRef: 'TR-RETRY' });
t('owner verifies while the provider fails → booking CONFIRMED, both emails failed', cs === 200 && (await status(Hb)).status === 'CONFIRMED' && statuses(Hb.ref, 'owner_confirmed') === 'failed_500' && statuses(Hb.ref, 'customer_deposit_receipt') === 'failed_500');
mode = 'ok'; await job();
const rc = mails(Hb.ref, (m) => m.mode === 'ok' && m.subject.includes('Deposit Received'));
const oc = mails(Hb.ref, (m) => m.mode === 'ok' && m.subject.includes('CONFIRMED'));
t('hourly job sends them once; receipt Reply-To = CONTACT_TO; owner link = this environment', rc.length === 1 && oc.length === 1 && rc[0].reply_to === OWNER && oc[0].text.includes(`${BASE}/booking-admin`));
await job(); t('…and not again', mails(Hb.ref, (m) => m.mode === 'ok').length === 4); // 2 pending (at booking) + 2 confirmed

section = 'Cancellation email Reply-To';
mode = 'ok'; const K = await wise('boat-02');
const [ks] = await admin('action', { id: K.id, action: 'cancel', confirm: 'CANCEL', reason: 'test', notify: true });
const kc = mails(K.ref, (m) => /cancel/i.test(m.subject));
t('B5: customer cancellation email Reply-To = CONTACT_TO', ks === 200 && kc.length === 1 && kc[0].reply_to === OWNER, JSON.stringify([ks, kc.map((m) => m.reply_to)]));

try { process.kill(-wr.pid); } catch {}
mock.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
