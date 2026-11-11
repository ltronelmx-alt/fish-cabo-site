// Google Calendar one-way mirror (owner 2026-11-10) against a MOCK Google API on :8790 (no network, no real calendar).
// wrangler dev must run with the tests/booking.mjs variables + GCAL_CLIENT_ID:gc_id GCAL_CLIENT_SECRET:gc_secret
// GCAL_REFRESH_TOKEN:gc_refresh GCAL_CALENDAR_ID:efc-bookings@group.calendar.google.com
// GCAL_API_BASE:http://127.0.0.1:8790/calendar/v3 GCAL_TOKEN_URL:http://127.0.0.1:8790/token
// Usage: PERSIST=/tmp/wpbX node tests/gcal.mjs
import http from 'node:http';
import { execFileSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:8787', PASS = 'test-admin-pass', PERSIST = process.env.PERSIST || '/tmp/wpb', CAL = 'efc-bookings@group.calendar.google.com';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { sql('DELETE FROM rate_limits'); } catch {}

// ---------- mock Google ----------
const events = new Map(); const log = []; const mock = { outage: false, tokenFail: false };
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/token') {
      const f = new URLSearchParams(body);
      if (mock.tokenFail || f.get('refresh_token') !== 'gc_refresh' || f.get('client_secret') !== 'gc_secret' || f.get('grant_type') !== 'refresh_token') return send(400, { error: 'invalid_grant' });
      return send(200, { access_token: 'ya29.test', expires_in: 3600 });
    }
    if (req.headers.authorization !== 'Bearer ya29.test' || mock.tokenFail) return send(401, { error: { message: 'auth' } });
    if (mock.outage) return send(503, { error: { message: 'Backend Error' } });
    const m = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m || decodeURIComponent(m[1]) !== CAL) return send(404, { error: { message: 'calendar not found' } });
    const id = m[2]; const j = body ? JSON.parse(body) : null;
    log.push(`${req.method} ${id || ''}`);
    if (req.method === 'GET' && !id) return send(200, { items: [] });
    if (req.method === 'POST' && !id) { if (events.has(j.id) && events.get(j.id).status !== 'cancelled') return send(409, { error: { message: 'duplicate' } }); if (events.has(j.id)) return send(409, { error: { message: 'duplicate' } }); events.set(j.id, { ...j }); return send(200, events.get(j.id)); }
    if (req.method === 'PUT') { if (!events.has(id)) return send(404, { error: { message: 'Not Found' } }); events.set(id, { ...j, id }); return send(200, events.get(id)); }
    if (req.method === 'DELETE') { if (!events.has(id) || events.get(id).status === 'cancelled') return send(410, { error: { message: 'deleted' } }); events.get(id).status = 'cancelled'; res.writeHead(204); return res.end(); }
    send(400, {});
  });
});
await new Promise((r) => srv.listen(8790, '127.0.0.1', r));
const isManual = (e) => String(e.id || '').startsWith('efcm'); // owner's manual bookings (all-day), tested separately
const live = () => [...events.values()].filter((e) => e.status !== 'cancelled' && !isManual(e));
const nBooking = () => [...events.values()].filter((e) => !isManual(e)).length;
const evOf = (resId) => events.get('efc' + resId.replace(/-/g, ''));

// ---------- admin session ----------
const lg = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-efc-admin': '1' }, body: JSON.stringify({ password: PASS }) });
const cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
const admin = async (path, body) => { const r = await fetch(BASE + '/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: BASE, cookie, 'x-efc-admin': '1' }, body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
t('admin login', lg.ok && !!cookie);
let ipN = 0; const D0 = 150 + Math.floor(Math.random() * 120);
const dayStr = (k) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
async function bookWise(boat, k, hours = 6, name = ['Dennis', 'Flavin']) {
  const f = new FormData();
  for (const [a, v] of Object.entries({ fname: name[0], lname: name[1], email: 'dennis@example.test', phone: '+1 555 010 4444', date: dayStr(k), people: '3', duration: String(hours), boat, payment: 'wise', message: 'gcal test', 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' })) f.set(a, v);
  const r = await fetch(BASE + '/api/booking/reserve', { method: 'POST', body: f, headers: { origin: BASE, 'cf-connecting-ip': `198.51.100.${++ipN}` } });
  const j = await r.json(); const ref = j.ref || new URL(j.redirect, BASE).searchParams.get('ref');
  return { ref, id: sql(`SELECT id FROM reservations WHERE ref='${ref}'`)[0].id, status: r.status };
}
const kick = async () => { await admin('action', { action: 'note', id: '00000000-0000-0000-0000-000000000000', note: 'x' }); await sleep(1500); };

// 1. Wise pending → no event
const W = await bookWise('boat-04', D0, 8);
await kick();
t('Wise booking pending verification → no calendar event', !evOf(W.id) && live().length === 0, log.join(','));
// 2. owner confirms Wise → event
let [s, j] = await admin('action', { action: 'confirm_wise', id: W.id, confirm: 'VERIFIED', amount: 200 }); await sleep(1500);
let e = evOf(W.id);
t('Wise verified by the owner → event created in the dedicated calendar', s === 200 && !!e && e.status === 'confirmed', JSON.stringify(j));
t('title "30ft Cuddy Cabin — 8h — Dennis Flavin" (model name, duration, client)', e?.summary === '30ft Cuddy Cabin — 8h — Dennis Flavin', e?.summary);
t('time: 06:30 → 14:30 America/Mazatlan (reference departure from settings)', e?.start?.dateTime === `${dayStr(D0)}T06:30:00` && e?.end?.dateTime === `${dayStr(D0)}T14:30:00` && e?.start?.timeZone === 'America/Mazatlan');
t('booking reference in the description + private extended property (reliable matching)', e?.description.includes(`Booking reference: ${W.ref}`) && e?.extendedProperties?.private?.efcRef === W.ref);
t('no email, phone, payment, card or price data in the event', !/@example|555 010|wise|stripe|deposit|\$|card/i.test(JSON.stringify({ s: e?.summary, d: e?.description, l: e?.location })), e?.description);
// 3. owner-recorded booking (deposit received directly) → event; boat #10 = customer-facing name
[s, j] = await admin('phone-booking', { boat: 'boat-10', hours: 8, date: dayStr(D0 + 1), fname: 'Ana', lname: 'Lopez', email: 'ana@example.test', phone: '+52 1 555 000 0000', people: 4, payment: 'received', confirm: 'VERIFIED', amount: 1000 }); await sleep(1500);
const M = { id: j.id, ref: j.ref }; e = M.id && evOf(M.id);
t('manual booking (deposit received) → event "37ft Offshore Catamaran — 8h — Ana Lopez"', s === 200 && e?.summary === '37ft Offshore Catamaran — 8h — Ana Lopez' && /Recorded by the owner/.test(e.description), JSON.stringify(j).slice(0, 200));
// 4. date change → same event updated
const posts0 = log.filter((x) => x.startsWith('POST')).length;
[s, j] = await admin('action', { action: 'move_date', id: M.id, date: dayStr(D0 + 3) }); await sleep(1500);
e = evOf(M.id);
t('date moved in /booking-admin → the SAME event is updated (no new event)', s === 200 && e?.start?.dateTime === `${dayStr(D0 + 3)}T06:30:00` && log.filter((x) => x.startsWith('POST')).length === posts0 && live().length === 2, JSON.stringify(j));
// 5. repeated / concurrent triggers → no duplicate
await Promise.all(Array.from({ length: 8 }, () => admin('action', { action: 'note', id: '00000000-0000-0000-0000-000000000000', note: 'x' }))); await sleep(2500);
t('8 simultaneous triggers → still exactly 2 events, nothing rewritten', live().length === 2 && nBooking() === 2);
// 6. lost local mapping (row deleted) → no duplicate thanks to the deterministic id
sql(`DELETE FROM calendar_sync WHERE reservation_id = '${W.id}'`); await kick();
t('local mapping lost → event found again by its id and updated, not duplicated', nBooking() === 2 && live().length === 2 && sql(`SELECT state FROM calendar_sync WHERE reservation_id='${W.id}'`)[0]?.state === 'synced');
// 7. cancel → event deleted
[s, j] = await admin('action', { action: 'cancel', id: M.id, confirm: 'CANCEL', reason: 'test', notify: false }); await sleep(1500);
t('booking cancelled → its event is removed from the calendar', s === 200 && evOf(M.id)?.status === 'cancelled' && live().length === 1, JSON.stringify(j));
// 8. Google outage: booking + confirmation still work, error logged, retried later
mock.outage = true;
const O = await bookWise('boat-06', D0 + 2, 6, ['Out', 'Age']);
[s, j] = await admin('action', { action: 'confirm_wise', id: O.id, confirm: 'VERIFIED', amount: 400 }); await sleep(1500);
const os = sql(`SELECT status FROM reservations WHERE id='${O.id}'`)[0].status, cs = sql(`SELECT state, last_error, attempts FROM calendar_sync WHERE reservation_id='${O.id}'`)[0];
t('Google down (503): booking created and confirmed normally, error recorded for retry', O.status === 200 && s === 200 && os === 'CONFIRMED' && cs?.state === 'error' && /503/.test(cs.last_error || ''), JSON.stringify(cs));
mock.outage = false; await kick();
t('Google back → the pending event is created on the next pass', evOf(O.id)?.status === 'confirmed' && sql(`SELECT state FROM calendar_sync WHERE reservation_id='${O.id}'`)[0].state === 'synced');
// 9. refresh token revoked: error visible, nothing blocked
mock.tokenFail = true;
const T = await bookWise('boat-07', D0 + 4, 6, ['Tok', 'En']);
[s] = await admin('action', { action: 'confirm_wise', id: T.id, confirm: 'VERIFIED', amount: 400 }); await sleep(1500);
const ts = sql(`SELECT state, last_error FROM calendar_sync WHERE reservation_id='${T.id}'`)[0];
t('refresh token revoked/expired: booking confirmed anyway, "oauth 400 invalid_grant" recorded', s === 200 && ts?.state === 'error' && /invalid_grant/.test(ts.last_error || ''), JSON.stringify(ts));
const [rs, rd] = await admin('readiness');
t('admin readiness: calendar configured, last errors shown, NO credential value in the response', rs === 200 && rd.readiness?.googleCalendar?.configured === true && rd.readiness?.googleCalendar?.recentErrors?.length >= 1 && !/gc_secret|gc_refresh|gc_id|ya29/.test(JSON.stringify(rd)), JSON.stringify(rd.readiness?.googleCalendar).slice(0, 300));
mock.tokenFail = false; await kick();
const [, rd2] = await admin('readiness');
t('token fixed → retried and synced; readiness "calendarAccess: ok"', evOf(T.id)?.status === 'confirmed' && rd2.readiness?.googleCalendar?.calendarAccess === 'ok');
// 10. calendar never drives the booking system
{ const src = (await import('node:fs')).readFileSync('worker/booking/gcal.ts', 'utf8');
  t('mirror is one-way: gcal.ts never writes reservations, blocks or availability, never reads events back into D1', !/(UPDATE|INSERT INTO|DELETE FROM)\s+(reservations|blocked_dates|boats|prices)/i.test(src) && !log.some((x) => /^GET \S/.test(x))); }
{ const man = [...events.values()].filter(isManual);
  t('manual bookings (owner) → 3 all-day events with the client name, nothing else', man.length === 3 && man.every((e) => e.start?.date && !e.start?.dateTime) && ['Bubenik', 'Guard', 'Rademacher'].every((n) => man.some((e) => e.summary.endsWith(n))) && man.some((e) => e.id === 'efcm2026112102' && e.start.date === '2026-11-21'), JSON.stringify(man.map((e) => [e.id, e.summary, e.start]))); }
console.log(`  (Google calls: ${log.length}, events: ${events.size})`);
srv.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
