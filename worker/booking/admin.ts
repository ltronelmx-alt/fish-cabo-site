// Owner dashboard API (/booking-admin — separate from Sveltia CMS at /admin/). Password = Cloudflare secret ADMIN_PASSWORD (set by the owner, never in code).
// Session: signed HttpOnly cookie (Secure, SameSite=Strict, 12 h). POSTs also require same Origin + a custom header (CSRF).
// Every change is written to audit_log. An override never confirms a booking by itself: payment must still be verified.
import { getSettings } from './schema';
import { json, nowIso, newId, newRef, newToken, hmacHex, sha256Hex, safeEqual, rateLimit, isDate, localToday, addDays } from './util';
import { db, boats, audit, loadRes, sweepStmt, notifyConfirmed, sendLogged, chargeCents, dayStates, priceOf, durationsOf, BOOKED_MSG, TERMS_VERSION, type BEnv, type Boat } from './core';
import * as M from './emails';
import type { Res } from './emails';
import { ADMIN_HTML } from './admin-page';

const COOKIE = 'efc_admin';
const TTL = 12 * 3600;
const STATUSES = ['DRAFT', 'HELD', 'AWAITING_PAYMENT', 'AWAITING_PAYMENT_VERIFICATION', 'CONFIRMED', 'CANCELED', 'EXPIRED', 'PAYMENT_EXCEPTION', 'REFUND_PENDING', 'REFUNDED'];
const SETTING_RANGES: Record<string, [number, number]> = {
  min_lead_hours: [0, 240], departure_hour_local: [0, 23], departure_minute_local: [0, 59], booking_window_days: [7, 730], stripe_fee_pct: [0, 20],
  stripe_hold_minutes: [31, 120], wise_hold_hours: [1, 168], override_hold_hours: [1, 336],
};

const key = async (env: BEnv) => sha256Hex(`${env.ADMIN_PASSWORD}|efc-admin-session-v1`);
async function sessionOk(request: Request, env: BEnv) {
  if (!env.ADMIN_PASSWORD) return false;
  const c = (request.headers.get('cookie') || '').split(/;\s*/).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmacHex(await key(env), `admin|${exp}`));
}
const secure = (request: Request) => (new URL(request.url).protocol === 'https:' ? '; Secure' : '');

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
  'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
};

export async function adminPage(request: Request, env: BEnv) {
  if (!env.ADMIN_PASSWORD) return new Response('Booking dashboard not configured yet (ADMIN_PASSWORD secret missing).', { status: 503, headers: { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } });
  return new Response(ADMIN_HTML, { headers: PAGE_HEADERS });
}

export async function adminApi(request: Request, env: BEnv): Promise<Response> {
  const u = new URL(request.url);
  const path = u.pathname.replace('/api/admin/', '');
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'not configured' }, 503);
  if (request.method === 'POST') {
    const o = request.headers.get('origin');
    if (!o || new URL(o).host !== u.host || request.headers.get('x-efc-admin') !== '1') return json({ ok: false, error: 'Forbidden' }, 403);
  }
  const d = await db(env);
  if (path === 'login' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (!(await rateLimit(d, `login:${ip}`, 5, 900))) return json({ ok: false, error: 'Too many attempts. Wait 15 minutes.' }, 429);
    const { password = '' } = (await request.json().catch(() => ({}))) as { password?: string };
    const good = safeEqual(await sha256Hex(String(password)), await sha256Hex(env.ADMIN_PASSWORD));
    await audit(d, 'admin', good ? 'login' : 'login_failed', null, { ip: ip.replace(/\d+$/, 'x') }).run();
    if (!good) return json({ ok: false, error: 'Wrong password' }, 401);
    const exp = Math.floor(Date.now() / 1000) + TTL;
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=${exp}.${await hmacHex(await key(env), `admin|${exp}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL}${secure(request)}` });
  }
  if (!(await sessionOk(request, env))) return json({ ok: false, error: 'Not signed in' }, 401);
  if (path === 'logout') return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure(request)}` });
  await sweepStmt(d).run();

  if (path === 'overview' && request.method === 'GET') {
    const s = await getSettings(d);
    return json({ ok: true, today: localToday(), settings: s, boats: await boats(d), statuses: STATUSES });
  }
  if (path === 'bookings' && request.method === 'GET') {
    const where: string[] = [], args: unknown[] = [];
    const st = u.searchParams.get('status'); if (st && STATUSES.includes(st)) { where.push('r.status = ?'); args.push(st); }
    const boat = u.searchParams.get('boat'); if (boat) { where.push('r.boat_id = ?'); args.push(boat); }
    const from = u.searchParams.get('from'); if (from && isDate(from)) { where.push('r.date >= ?'); args.push(from); }
    const to = u.searchParams.get('to'); if (to && isDate(to)) { where.push('r.date <= ?'); args.push(to); }
    const q = (u.searchParams.get('q') || '').trim(); if (q) { where.push(`(r.ref LIKE ?1x OR r.email LIKE ?1x OR r.last_name LIKE ?1x OR r.first_name LIKE ?1x OR r.phone LIKE ?1x)`.replaceAll('?1x', '?')); for (let i = 0; i < 5; i++) args.push(`%${q}%`); }
    const { results } = await d.prepare(`SELECT r.id, r.ref, r.boat_id, b.name boat_name, b.number boat_number, r.date, r.hours, r.slot, r.status, r.payment_method, r.total_usd, r.deposit_usd,
        r.charge_cents, r.first_name, r.last_name, r.email, r.phone, r.people, r.source, r.is_test, r.hold_expires_at, r.created_at
      FROM reservations r JOIN boats b ON b.id = r.boat_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.date DESC, r.created_at DESC LIMIT 500`).bind(...args).all();
    return json({ ok: true, bookings: results });
  }
  if (path === 'booking' && request.method === 'GET') {
    const r = await loadRes(d, 'r.id = ?', u.searchParams.get('id'));
    if (!r) return json({ ok: false, error: 'Not found' }, 404);
    const [a, e, p] = await Promise.all([
      d.prepare(`SELECT at, actor, action, details FROM audit_log WHERE reservation_id = ? ORDER BY id`).bind(r.id).all(),
      d.prepare(`SELECT kind, recipient, subject, status, at, body FROM email_log WHERE reservation_id = ? ORDER BY id`).bind(r.id).all(),
      d.prepare(`SELECT provider, amount_cents, currency, status, external_id, created_at FROM payments WHERE reservation_id = ? ORDER BY id`).bind(r.id).all(),
    ]);
    const { token, ...safe } = r; void token;
    return json({ ok: true, booking: safe, audit: a.results, emails: e.results, payments: p.results });
  }
  if (path === 'calendar' && request.method === 'GET') {
    const month = u.searchParams.get('month') || localToday().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return json({ ok: false }, 400);
    const from = `${month}-01`, to = addDays(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 10), -1);
    const list = await boats(d);
    const [res, blocks] = await Promise.all([
      d.prepare(`SELECT id, ref, boat_id, date, slot, status, hours, first_name, last_name FROM reservations WHERE date BETWEEN ? AND ? AND (holds_slot = 1 OR status = 'PAYMENT_EXCEPTION')`).bind(from, to).all(),
      d.prepare(`SELECT boat_id, date, reason FROM blocked_dates WHERE date BETWEEN ? AND ?`).bind(from, to).all(),
    ]);
    const states: Record<string, unknown> = {};
    for (const b of list) states[b.id] = await dayStates(d, b.id, from, to);
    return json({ ok: true, month, from, to, boats: list.map((b) => ({ id: b.id, number: b.number, name: b.name })), reservations: res.results, blocks: blocks.results, states });
  }
  if (path === 'audit' && request.method === 'GET') {
    const { results } = await d.prepare(`SELECT a.at, a.actor, a.action, a.details, r.ref FROM audit_log a LEFT JOIN reservations r ON r.id = a.reservation_id ORDER BY a.id DESC LIMIT 300`).all();
    return json({ ok: true, audit: results });
  }
  if (path === 'export.csv' && request.method === 'GET') {
    const { results } = await d.prepare(`SELECT r.ref, b.number boat_number, b.name boat, r.date, r.hours, r.slot, r.status, r.payment_method, r.total_usd, r.deposit_usd, r.balance_usd,
        printf('%.2f', r.charge_cents / 100.0) charged_usd, r.first_name, r.last_name, r.email, r.phone, r.people, r.message, r.source, r.is_test, r.created_at, r.updated_at, r.admin_note
      FROM reservations r JOIN boats b ON b.id = r.boat_id ORDER BY r.date, b.number`).all<Record<string, unknown>>();
    const cols = ['ref', 'boat_number', 'boat', 'date', 'hours', 'slot', 'status', 'payment_method', 'total_usd', 'deposit_usd', 'balance_usd', 'charged_usd', 'first_name', 'last_name', 'email', 'phone', 'people', 'message', 'source', 'is_test', 'created_at', 'updated_at', 'admin_note'];
    // leading = + - @ neutralised (CSV formula injection)
    const cell = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const csv = [cols.join(','), ...results.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
    await audit(d, 'admin', 'export_csv', null, { rows: results.length }).run();
    return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bookings-${localToday()}.csv"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Not found' }, 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;

  if (path === 'action') return action(request, env, d, body);
  if (path === 'second-trip') return secondTrip(request, env, d, body);
  if (path === 'phone-booking') return phoneBooking(request, env, d, body);
  if (path === 'block') {
    const boat = String(body.boat || ''), date = String(body.date || ''), on = !!body.block;
    if (!(boat === '*' || /^boat-\d{2}$/.test(boat)) || !isDate(date)) return json({ ok: false, error: 'Bad request' }, 400);
    await d.batch([
      on ? d.prepare(`INSERT OR REPLACE INTO blocked_dates (boat_id, date, reason, created_at) VALUES (?, ?, ?, ?)`).bind(boat, date, String(body.reason || '').slice(0, 200), nowIso())
         : d.prepare(`DELETE FROM blocked_dates WHERE boat_id = ? AND date = ?`).bind(boat, date),
      audit(d, 'admin', on ? 'block_date' : 'unblock_date', null, { boat, date, reason: body.reason || null }),
    ]);
    const existing = await d.prepare(`SELECT COUNT(*) n FROM reservations WHERE date = ? AND holds_slot = 1 AND (boat_id = ? OR ? = '*')`).bind(date, boat, boat).first<{ n: number }>();
    return json({ ok: true, warning: on && existing?.n ? `${existing.n} existing booking(s) on that date are NOT canceled automatically.` : null });
  }
  if (path === 'price') {
    const boat = String(body.boat || ''), field = String(body.field || '');
    const v = body.value === '' || body.value == null ? null : Number(body.value);
    if (!/^boat-\d{2}$/.test(boat) || !['price6', 'price8', 'deposit', 'capacity', 'active'].includes(field)) return json({ ok: false, error: 'Bad request' }, 400);
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > 100000)) return json({ ok: false, error: 'Whole USD amount please' }, 400);
    const b = (await boats(d)).find((x) => x.id === boat);
    if (!b) return json({ ok: false }, 404);
    const now = nowIso();
    let old: number | null, stmt: D1PreparedStatement;
    if (field === 'price6' || field === 'price8') {
      if (v === 0) return json({ ok: false, error: 'Use an empty value for "price on request"' }, 400);
      old = field === 'price6' ? b.p6 : b.p8;
      stmt = d.prepare(`UPDATE prices SET price_usd = ?, updated_at = ? WHERE boat_id = ? AND hours = ?`).bind(v, now, boat, field === 'price6' ? 6 : 8);
    } else if (field === 'deposit') {
      if (!v) return json({ ok: false, error: 'Deposit required' }, 400);
      old = b.deposit_usd; stmt = d.prepare(`UPDATE boats SET deposit_usd = ? WHERE id = ?`).bind(v, boat);
    } else if (field === 'capacity') {
      if (!v || v > 20) return json({ ok: false, error: '1–20' }, 400);
      old = b.capacity; stmt = d.prepare(`UPDATE boats SET capacity = ? WHERE id = ?`).bind(v, boat);
    } else {
      old = b.active; stmt = d.prepare(`UPDATE boats SET active = ? WHERE id = ?`).bind(v ? 1 : 0, boat);
    }
    await d.batch([stmt, d.prepare(`INSERT INTO price_history (boat_id, field, old_value, new_value, changed_at, changed_by) VALUES (?, ?, ?, ?, ?, 'admin')`).bind(boat, field, old, v, now),
      audit(d, 'admin', 'edit_boat', null, { boat, field, old, new: v })]);
    return json({ ok: true });
  }
  if (path === 'settings') {
    const stmts: D1PreparedStatement[] = [];
    for (const [k, v] of Object.entries(body)) {
      const r = SETTING_RANGES[k]; const n = Number(v);
      if (!r || !Number.isFinite(n) || n < r[0] || n > r[1]) return json({ ok: false, error: `Invalid value for ${k} (${r ? r.join('–') : 'unknown'})` }, 400);
      stmts.push(d.prepare(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, String(n)));
    }
    if (!stmts.length) return json({ ok: false }, 400);
    stmts.push(audit(d, 'admin', 'settings', null, body));
    await d.batch(stmts);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}

async function action(request: Request, env: BEnv, d: D1Database, body: Record<string, any>) {
  const r = await loadRes(d, 'r.id = ?', String(body.id || ''));
  if (!r) return json({ ok: false, error: 'Not found' }, 404);
  const now = nowIso();
  const fail = (error: string) => json({ ok: false, error }, 409);
  switch (body.action) {
    case 'confirm_wise': {
      // explicit confirmation: the owner checked the money in Wise
      if (r.payment_method !== 'wise') return fail('Not a Wise booking');
      if (body.confirm !== 'VERIFIED') return fail('Type VERIFIED to confirm you checked the deposit in Wise.');
      const amount = Math.round(Number(body.amount) * 100);
      if (!Number.isFinite(amount) || amount < r.deposit_usd * 100) return fail(`Amount received must be at least the deposit (${r.deposit_usd} USD).`);
      let ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', hold_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'AWAITING_PAYMENT_VERIFICATION' AND holds_slot = 1 RETURNING id`).bind(now, r.id).first();
      if (!ok && r.status === 'EXPIRED') {
        try { ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', holds_slot = 1, hold_expires_at = NULL, updated_at = ? WHERE id = ? AND holds_slot = 0 RETURNING id`).bind(now, r.id).first(); }
        catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; return fail('The 24 h hold expired and this boat/date has been booked by someone else since. Refund the customer or record a second trip.'); }
      }
      if (!ok) return fail(`Cannot confirm a booking in status ${r.status}.`);
      await d.batch([
        d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'wise', ?, 'usd', 'verified', ?, ?)`).bind(r.id, amount, String(body.wiseRef || '').slice(0, 100) || null, now),
        audit(d, 'admin', 'wise_verified', r.id, { amount_cents: amount, wiseRef: body.wiseRef || null }),
      ]);
      await notifyConfirmed(env, d, r.id);
      return json({ ok: true });
    }
    case 'cancel': {
      if (body.confirm !== 'CANCEL') return fail('Type CANCEL to confirm.');
      if (['CANCELED', 'REFUNDED', 'EXPIRED'].includes(r.status)) return fail(`Already ${r.status}`);
      const paid = ['CONFIRMED', 'PAYMENT_EXCEPTION'].includes(r.status);
      const status = paid ? 'REFUND_PENDING' : 'CANCELED';
      await d.batch([
        d.prepare(`UPDATE reservations SET status = ?, holds_slot = 0, updated_at = ? WHERE id = ?`).bind(status, now, r.id),
        audit(d, 'admin', 'cancel', r.id, { from: r.status, to: status, reason: body.reason || null, notify: !!body.notify }),
      ]);
      if (body.notify) await sendLogged(env, d, r, 'customer_canceled', r.email, M.customerCanceled(r, String(body.reason || '').slice(0, 500)));
      return json({ ok: true, status });
    }
    case 'refund_pending':
    case 'refunded': {
      if (!['CONFIRMED', 'PAYMENT_EXCEPTION', 'REFUND_PENDING', 'CANCELED'].includes(r.status)) return fail(`Not possible from ${r.status}`);
      const status = body.action === 'refunded' ? 'REFUNDED' : 'REFUND_PENDING';
      await d.batch([d.prepare(`UPDATE reservations SET status = ?, holds_slot = 0, updated_at = ? WHERE id = ?`).bind(status, now, r.id), audit(d, 'admin', body.action, r.id, { from: r.status, note: body.reason || null })]);
      return json({ ok: true, status });
    }
    case 'note': {
      await d.batch([d.prepare(`UPDATE reservations SET admin_note = ?, updated_at = ? WHERE id = ?`).bind(String(body.note || '').slice(0, 2000), now, r.id), audit(d, 'admin', 'note', r.id)]);
      return json({ ok: true });
    }
    case 'move_date': {
      const date = String(body.date || '');
      if (!isDate(date) || date < localToday()) return fail('Choose a future date.');
      if (!r.holds_slot || !['CONFIRMED', 'AWAITING_PAYMENT', 'AWAITING_PAYMENT_VERIFICATION', 'HELD'].includes(r.status)) return fail(`Not possible from ${r.status}`);
      try {
        await d.batch([
          d.prepare(`UPDATE reservations SET date = ?, slot = 0, updated_at = ? WHERE id = ?`).bind(date, now, r.id),
          audit(d, 'admin', 'move_date', r.id, { from: r.date, to: date }),
        ]);
      } catch (e) { if (/UNIQUE/i.test(String(e))) return fail('That boat already has a booking on the new date (use “Record second trip” if you can do two).'); throw e; }
      return json({ ok: true });
    }
    case 'resend_confirmation': {
      if (r.status !== 'CONFIRMED') return fail('Only confirmed bookings');
      await sendLogged(env, d, r, 'customer_confirmed_resend', r.email, M.customerConfirmed(r), env.CONTACT_TO);
      await audit(d, 'admin', 'resend_confirmation', r.id).run();
      return json({ ok: true });
    }
  }
  return json({ ok: false, error: 'Unknown action' }, 400);
}

/** Owner override: record an approved SECOND trip for a boat/date that already has a booking.
 * Never confirms by itself — the customer must still pay the deposit (Stripe) or the owner must verify it (Wise),
 * and the usual confirmation emails go out only then. The existing booking (slot 0) is never touched. */
async function secondTrip(request: Request, env: BEnv, d: D1Database, b: Record<string, any>) {
  const fail = (error: string) => json({ ok: false, error }, 400);
  if (b.confirm !== 'SECOND TRIP') return fail('Type SECOND TRIP to confirm that you personally checked a second trip is possible.');
  const boat = (await boats(d)).find((x) => x.id === b.boat);
  if (!boat) return fail('Choose a boat');
  const date = String(b.date || ''), hours = Number(b.hours), people = Number(b.people);
  const total = priceOf(boat, hours); // approved price for that boat and duration (never typed by hand)
  const str = (k: string, max: number) => String(b[k] ?? '').trim().slice(0, max);
  const f = { first: str('fname', 80), last: str('lname', 80), email: str('email', 120), phone: str('phone', 40), message: str('message', 5000) || '(second trip recorded by the owner)' };
  if (!isDate(date) || date < localToday()) return fail('Choose a future date');
  if (total == null) return fail(`Boat #${boat.number} offers ${durationsOf(boat).join(' or ')}-hour trips only.`);
  if (!f.first || !f.last || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) || (f.phone.match(/\d/g) || []).length < 6) return fail('Customer name, valid email and phone are required');
  if (!Number.isInteger(people) || people < 1 || people > boat.capacity) return fail(`People: 1–${boat.capacity}`);
  if (b.payment !== 'stripe' && b.payment !== 'wise') return fail('Payment method?');
  const first = await d.prepare(`SELECT status FROM reservations WHERE boat_id = ? AND date = ? AND slot = 0 AND holds_slot = 1`).bind(boat.id, date).first<{ status: string }>();
  if (!first) return fail('This boat has no booking on that date: the customer can book online normally (no override needed).');
  const s = await getSettings(d);
  const max = await d.prepare(`SELECT COALESCE(MAX(slot), 0) m FROM reservations WHERE boat_id = ? AND date = ? AND holds_slot = 1`).bind(boat.id, date).first<{ m: number }>();
  const slot = (max?.m ?? 0) + 1;
  const id = newId(), ref = newRef(), token = newToken(), now = nowIso();
  const fee = b.payment === 'stripe' ? chargeCents(boat.deposit_usd, s.stripe_fee_pct) - boat.deposit_usd * 100 : 0;
  const u = new URL(request.url);
  const isTest = u.hostname.endsWith('.workers.dev') || u.hostname === '127.0.0.1' || u.hostname === 'localhost' || (env.STRIPE_SECRET_KEY || '').includes('_test_') ? 1 : 0;
  try {
    await d.batch([
      d.prepare(`INSERT INTO reservations (id, ref, token, boat_id, date, hours, slot, holds_slot, hold_expires_at, status, payment_method, total_usd, deposit_usd, balance_usd,
        fee_cents, charge_cents, first_name, last_name, email, phone, people, message, consent_at, terms_version, lang, is_test, source, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'en',?,'override',?,?)`)
        .bind(id, ref, token, boat.id, date, hours, slot, new Date(Date.now() + s.override_hold_hours * 3600e3).toISOString(), b.payment === 'stripe' ? 'AWAITING_PAYMENT' : 'AWAITING_PAYMENT_VERIFICATION',
          b.payment, total, boat.deposit_usd, total - boat.deposit_usd, fee, boat.deposit_usd * 100 + fee, f.first, f.last, f.email, f.phone, people, f.message, now, TERMS_VERSION, isTest, now, now),
      audit(d, 'admin', 'second_trip_override', id, { boat: boat.id, date, hours, slot, existing_status: first.status, payment: b.payment, total }),
    ]);
  } catch (e) { if (/UNIQUE/i.test(String(e))) return json({ ok: false, error: 'Conflict, please retry' }, 409); throw e; }
  const r = (await loadRes(d, 'r.id = ?', id)) as Res;
  const payUrl = `${u.origin}/api/booking/pay?ref=${ref}&t=${token}`;
  const sent = b.notify === false ? false : await sendLogged(env, d, r, 'customer_payment_request', r.email, M.customerPaymentRequest(r, payUrl), env.CONTACT_TO);
  return json({ ok: true, id, ref, slot, status: r.status, payUrl, emailSent: sent, statusUrl: `${u.origin}/book-now/confirmation?ref=${ref}&t=${token}` });
}

/** Telephone booking by the owner (about one minute): boat, duration, date, customer, how the deposit is paid.
 * Same rules as the website: valid boat/duration only (Boat #1 = 6 h), approved price, one trip per boat per day
 * (a booked day needs the explicit SECOND TRIP override instead). Payment options:
 *  - stripe: the customer gets a card payment link (deposit + fee); CONFIRMED only after the verified webhook;
 *  - wise: date held, the owner confirms after checking Wise (like online Wise bookings);
 *  - received: the owner already has the deposit (cash, Wise, …) and types VERIFIED → CONFIRMED + emails now. */
async function phoneBooking(request: Request, env: BEnv, d: D1Database, b: Record<string, any>) {
  const fail = (error: string, status = 400) => json({ ok: false, error }, status);
  const boat = (await boats(d)).find((x) => x.id === b.boat) as Boat | undefined;
  if (!boat || !boat.active) return fail('Choose a boat');
  const date = String(b.date || ''), hours = Number(b.hours), people = Number(b.people);
  const total = priceOf(boat, hours);
  if (total == null) return fail(`Boat #${boat.number} offers ${durationsOf(boat).join(' or ')}-hour trips only.`);
  if (!isDate(date) || date < localToday()) return fail('Choose today or a future date');
  const str = (k: string, max: number) => String(b[k] ?? '').trim().slice(0, max);
  const f = { first: str('fname', 80), last: str('lname', 80), email: str('email', 120), phone: str('phone', 40), message: str('message', 5000) || '(telephone booking)' };
  if (!f.first || (f.phone.match(/\d/g) || []).length < 6) return fail('Customer first name and phone are required');
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return fail('Email address looks wrong (leave it empty if the customer has none)');
  if ((b.payment === 'stripe' || b.payment === 'wise') && !f.email) return fail('An email is needed to send the payment instructions (or choose "deposit already received").');
  if (!Number.isInteger(people) || people < 1 || people > boat.capacity) return fail(`People: 1–${boat.capacity}`);
  if (!['stripe', 'wise', 'received'].includes(b.payment)) return fail('How is the deposit paid?');
  let amountCents = 0;
  if (b.payment === 'received') {
    if (b.confirm !== 'VERIFIED') return fail('Type VERIFIED to confirm you have received the deposit.');
    amountCents = Math.round(Number(b.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < boat.deposit_usd * 100) return fail(`Amount received must be at least the deposit (${boat.deposit_usd} USD).`);
  }
  const s = await getSettings(d);
  // normal availability rules (blocked day, already booked) — the lead-time rule does not apply to the owner
  const state = (await dayStates(d, boat.id, date, date))[date];
  if (state === 'blocked') return fail('This day is blocked for this boat (unblock it in the calendar first).', 409);
  if (state === 'booked' || state === 'pending') return fail(`${BOOKED_MSG} Use “Record second trip” if you have personally checked that a second trip is possible.`, 409);
  if (state === 'closed') return fail('Date beyond the booking window.', 409);
  const method = b.payment === 'received' ? 'other' : b.payment;
  const fee = method === 'stripe' ? chargeCents(boat.deposit_usd, s.stripe_fee_pct) - boat.deposit_usd * 100 : 0;
  const id = newId(), ref = newRef(), token = newToken(), now = nowIso();
  const status = method === 'other' ? 'CONFIRMED' : method === 'stripe' ? 'AWAITING_PAYMENT' : 'AWAITING_PAYMENT_VERIFICATION';
  const holdH = method === 'wise' ? s.wise_hold_hours : s.override_hold_hours;
  const u = new URL(request.url);
  const isTest = u.hostname.endsWith('.workers.dev') || u.hostname === '127.0.0.1' || u.hostname === 'localhost' || (env.STRIPE_SECRET_KEY || '').includes('_test_') ? 1 : 0;
  try {
    const stmts = [
      d.prepare(`INSERT INTO reservations (id, ref, token, boat_id, date, hours, slot, holds_slot, hold_expires_at, status, payment_method, total_usd, deposit_usd, balance_usd,
        fee_cents, charge_cents, first_name, last_name, email, phone, people, message, consent_at, terms_version, lang, is_test, source, created_at, updated_at)
        VALUES (?,?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'en',?,'phone',?,?)`)
        .bind(id, ref, token, boat.id, date, hours, method === 'other' ? null : new Date(Date.now() + holdH * 3600e3).toISOString(), status, method,
          total, boat.deposit_usd, total - boat.deposit_usd, fee, boat.deposit_usd * 100 + fee, f.first, f.last, f.email, f.phone, people, f.message, now, TERMS_VERSION, isTest, now, now),
      audit(d, 'admin', 'phone_booking', id, { boat: boat.id, date, hours, payment: b.payment }),
    ];
    if (method === 'other') {
      stmts.push(d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'other', ?, 'usd', 'verified', ?, ?)`).bind(id, amountCents, str('payRef', 100) || 'received by owner', now));
      stmts.push(audit(d, 'admin', 'deposit_verified', id, { amount_cents: amountCents, how: str('payRef', 100) || null }));
    }
    await d.batch(stmts);
  } catch (e) { if (/UNIQUE/i.test(String(e))) return fail(BOOKED_MSG, 409); throw e; }
  const r = (await loadRes(d, 'r.id = ?', id)) as Res;
  const payUrl = `${u.origin}/api/booking/pay?ref=${ref}&t=${token}`;
  let emailSent = false;
  if (method === 'other') {
    await notifyConfirmed(env, d, id); // owner record + customer confirmation (if an email was given)
    emailSent = !!f.email;
  } else if (method === 'stripe') emailSent = await sendLogged(env, d, r, 'customer_payment_request', r.email, M.customerPaymentRequest(r, payUrl), env.CONTACT_TO);
  else emailSent = await sendLogged(env, d, r, 'customer_wise_pending', r.email, M.customerWisePending(r));
  return json({ ok: true, id, ref, status, total, deposit: boat.deposit_usd, balance: total - boat.deposit_usd, payUrl: method === 'stripe' ? payUrl : null, emailSent });
}
