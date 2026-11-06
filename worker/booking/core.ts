// Booking engine: availability, reservations, Stripe Checkout (test mode until the owner approves live), Wise, webhook.
//
// Owner rules (2026-11-06):
// - ONE automatically confirmed trip per boat per calendar day (6 h or 8 h), America/Mazatlan dates.
// - Boat already booked that day → the customer is sent to the contact form ("REQUEST AVAILABILITY"); no deposit,
//   no automatic second trip. Only the owner can record a second trip (admin override, see admin.ts).
// - Stripe = deposit + 6 %; Wise = deposit, 24 h hold, manual verification; bookings ≥ 24 h before departure.
// - Owner email ONLY once the deposit is verified and the booking CONFIRMED (deduplicated).
// Concurrency: the unique index (boat_id, date, slot) WHERE holds_slot = 1 guarantees one holder per slot.
import { ensureSchema, getSettings } from './schema';
import { json, nowIso, newId, newRef, newToken, hmacHex, safeEqual, rateLimit, localToday, localTs, isDate, addDays } from './util';
import * as M from './emails';
import type { Res } from './emails';

export interface BEnv {
  DB?: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_API_BASE?: string; // local tests only (honoured on localhost/127.0.0.1 only)
  BOOKING_LIVE?: string; // must be "approved" (set by the owner) before a live Stripe key is accepted
  ADMIN_PASSWORD?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
}

export const HOLDING = ['HELD', 'AWAITING_PAYMENT', 'AWAITING_PAYMENT_VERIFICATION'] as const;
const TEST_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
const isLocal = (u: URL) => u.hostname === '127.0.0.1' || u.hostname === 'localhost';
const isStaging = (u: URL) => u.hostname.endsWith('.workers.dev') || isLocal(u);

export type Boat = { id: string; number: number; name: string; slug: string; url: string; capacity: number; deposit_usd: number; active: number; p6: number | null; p8: number | null };

export async function db(env: BEnv) {
  if (!env.DB) throw new Error('DB binding missing');
  await ensureSchema(env.DB);
  return env.DB;
}

export async function boats(d: D1Database): Promise<Boat[]> {
  const { results } = await d.prepare(
    `SELECT b.*, (SELECT price_usd FROM prices WHERE boat_id = b.id AND hours = 6) p6, (SELECT price_usd FROM prices WHERE boat_id = b.id AND hours = 8) p8
     FROM boats b ORDER BY number`,
  ).all<Boat>();
  return results;
}

/** Release every hold that has expired (also run by the hourly cron). */
export const sweepStmt = (d: D1Database, now = nowIso()) =>
  d.prepare(`UPDATE reservations SET holds_slot = 0, status = 'EXPIRED', updated_at = ?1
             WHERE holds_slot = 1 AND status IN ('HELD','AWAITING_PAYMENT','AWAITING_PAYMENT_VERIFICATION') AND hold_expires_at IS NOT NULL AND hold_expires_at < ?1`).bind(now);

export const audit = (d: D1Database, actor: string, action: string, reservationId: string | null, details: unknown = null) =>
  d.prepare(`INSERT INTO audit_log (at, actor, action, reservation_id, details) VALUES (?, ?, ?, ?, ?)`).bind(nowIso(), actor, action, reservationId, details == null ? null : JSON.stringify(details));

export async function loadRes(d: D1Database, where: string, ...args: unknown[]): Promise<Res | null> {
  return d.prepare(`SELECT r.*, b.name boat_name, b.size_ft boat_size_ft FROM reservations r JOIN boats b ON b.id = r.boat_id WHERE ${where}`).bind(...args).first<Res>();
}

// ---------- availability ----------
export type DayState = 'available' | 'booked' | 'pending' | 'blocked' | 'too_soon' | 'past' | 'closed';
export async function dayStates(d: D1Database, boatId: string, from: string, to: string): Promise<Record<string, DayState>> {
  const s = await getSettings(d);
  const today = localToday();
  const lastDay = addDays(today, s.booking_window_days);
  const [blocked, taken] = await Promise.all([
    d.prepare(`SELECT date FROM blocked_dates WHERE boat_id IN (?, '*') AND date BETWEEN ? AND ?`).bind(boatId, from, to).all<{ date: string }>(),
    d.prepare(`SELECT date, status FROM reservations WHERE boat_id = ? AND slot = 0 AND holds_slot = 1 AND date BETWEEN ? AND ?
               AND (status = 'CONFIRMED' OR hold_expires_at IS NULL OR hold_expires_at >= ?)`).bind(boatId, from, to, nowIso()).all<{ date: string; status: string }>(),
  ]);
  const bl = new Set(blocked.results.map((r) => r.date));
  const tk = new Map(taken.results.map((r) => [r.date, r.status]));
  const out: Record<string, DayState> = {};
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (day < today) out[day] = 'past';
    else if (day > lastDay) out[day] = 'closed';
    else if (bl.has(day)) out[day] = 'blocked';
    else if (tk.has(day)) out[day] = tk.get(day) === 'CONFIRMED' ? 'booked' : 'pending';
    else if (localTs(day, s.departure_hour_local) - Date.now() < s.min_lead_hours * 3600e3) out[day] = 'too_soon';
    else out[day] = 'available';
  }
  return out;
}

export async function apiBoats(env: BEnv) {
  const d = await db(env);
  const s = await getSettings(d);
  return json({
    ok: true,
    stripeFeePct: s.stripe_fee_pct, minLeadHours: s.min_lead_hours, wiseHoldHours: s.wise_hold_hours, today: localToday(), timezone: 'America/Mazatlan',
    boats: (await boats(d)).map((b) => ({
      id: b.id, number: b.number, name: b.name, url: b.url, capacity: b.capacity, deposit: b.deposit_usd, active: !!b.active,
      prices: { 6: b.p6, 8: b.p8 }, bookable: !!b.active && (b.p6 != null || b.p8 != null),
    })),
  });
}

export async function apiAvailability(request: Request, env: BEnv) {
  const u = new URL(request.url);
  const boatId = u.searchParams.get('boat') || '';
  const month = u.searchParams.get('month') || localToday().slice(0, 7);
  if (!/^boat-\d{2}$/.test(boatId) || !/^\d{4}-\d{2}$/.test(month)) return json({ ok: false, error: 'Bad request' }, 400);
  const d = await db(env);
  if (!(await d.prepare(`SELECT 1 FROM boats WHERE id = ?`).bind(boatId).first())) return json({ ok: false, error: 'Unknown boat' }, 404);
  const from = `${month}-01`;
  const next = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 10);
  return json({ ok: true, boat: boatId, month, days: await dayStates(d, boatId, from, addDays(next, -1)) });
}

// ---------- reservation ----------
async function human(request: Request, env: BEnv, token: string) {
  const u = new URL(request.url);
  if (isLocal(u) || (isStaging(u) && !env.TURNSTILE_SECRET)) return true; // staging is password-protected
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET || TEST_TURNSTILE_SECRET, response: token, remoteip: request.headers.get('cf-connecting-ip') || '' }),
  }).then((x) => x.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  return !!r.success;
}

function sameOrigin(request: Request) {
  const o = request.headers.get('origin');
  return !o || new URL(o).host === new URL(request.url).host;
}

export const chargeCents = (deposit: number, feePct: number) => Math.round(deposit * 100 * (1 + feePct / 100));

/** Stripe key gate: a live key is refused unless the owner set BOOKING_LIVE=approved. */
export function stripeMode(env: BEnv): 'test' | 'live' | 'off' | 'blocked' {
  const k = env.STRIPE_SECRET_KEY || '';
  if (!k) return 'off';
  if (k.startsWith('sk_test_') || k.startsWith('rk_test_')) return 'test';
  if ((k.startsWith('sk_live_') || k.startsWith('rk_live_')) && env.BOOKING_LIVE === 'approved') return 'live';
  return 'blocked';
}

export async function apiReserve(request: Request, env: BEnv) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden' }, 403);
  const u = new URL(request.url);
  let fd: FormData;
  try { fd = await request.formData(); } catch { return json({ ok: false, error: 'Invalid form' }, 400); }
  if (String(fd.get('website') ?? '').length) return json({ ok: false, error: 'Invalid form' }, 400); // honeypot
  const d = await db(env);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (!(await rateLimit(d, `reserve:${ip}`, 8, 3600))) return json({ ok: false, error: 'Too many attempts. Please try again later or contact us on WhatsApp.' }, 429);

  const get = (k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max);
  const f = {
    firstName: get('fname', 80), lastName: get('lname', 80), email: get('email', 120), phone: get('phone', 40), date: get('date', 10),
    people: Number(get('people', 3)), hours: Number(get('duration', 2)), boatId: get('boat', 10), message: get('message', 5000),
    payment: get('payment', 10), consent: get('consent', 5), lang: get('lang', 5) || 'en',
  };
  const err = (error: string, field?: string, status = 400) => json({ ok: false, error, field }, status);
  if (!f.firstName || !f.lastName) return err('Please enter your first and last name.', 'fname');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return err('Please enter a valid email address.', 'email');
  if (!/^[+()\-.\s\d]{6,40}$/.test(f.phone) || (f.phone.match(/\d/g) || []).length < 6) return err('Please enter a valid phone number.', 'phone');
  if (!isDate(f.date)) return err('Please choose a date.', 'date');
  if (f.hours !== 6 && f.hours !== 8) return err('Please choose a trip duration.', 'duration');
  if (!f.message) return err('Please enter a message.', 'message');
  if (f.payment !== 'stripe' && f.payment !== 'wise') return err('Please choose a payment method.', 'payment');
  if (f.consent !== 'yes') return err('Please accept the Terms & Conditions.', 'consent');
  if (!(await human(request, env, String(fd.get('cf-turnstile-response') ?? '')))) return err('Verification failed. Please try again.', undefined, 403);

  const boat = (await boats(d)).find((b) => b.id === f.boatId);
  if (!boat || !boat.active) return err('Please choose a boat.', 'boat');
  const total = f.hours === 6 ? boat.p6 : boat.p8;
  if (total == null) return err('Online booking is not available for this trip yet. Please contact us for the price.', 'duration', 409);
  if (!Number.isInteger(f.people) || f.people < 1 || f.people > Math.min(boat.capacity, 10)) return err(`This boat takes up to ${boat.capacity} people.`, 'people');
  if (f.payment === 'stripe') {
    const m = stripeMode(env);
    if (m === 'off' || m === 'blocked') return err('Card payment is not available yet. Please choose Wise or contact us.', 'payment', 503);
  }

  const s = await getSettings(d);
  const state = (await dayStates(d, boat.id, f.date, f.date))[f.date];
  if (state === 'booked' || state === 'pending') return json({ ok: false, code: 'BOOKED', state, error: 'This boat already has a booking on your selected date. A second trip may be possible upon request. Please contact us to check availability.' }, 409);
  if (state !== 'available') return err(state === 'too_soon' ? `Online bookings must be made at least ${s.min_lead_hours} hours before the trip. Please contact us on WhatsApp for last-minute trips.` : 'This date cannot be booked online.', 'date', 409);

  const id = newId(), ref = newRef(), token = newToken(), now = nowIso();
  const fee = f.payment === 'stripe' ? chargeCents(boat.deposit_usd, s.stripe_fee_pct) - boat.deposit_usd * 100 : 0;
  const holdMs = f.payment === 'stripe' ? s.stripe_hold_minutes * 60e3 : s.wise_hold_hours * 3600e3;
  const isTest = isStaging(u) || stripeMode(env) === 'test' ? 1 : 0;
  try {
    await d.batch([
      sweepStmt(d, now),
      d.prepare(`INSERT INTO reservations (id, ref, token, boat_id, date, hours, slot, holds_slot, hold_expires_at, status, payment_method,
        total_usd, deposit_usd, balance_usd, fee_cents, charge_cents, first_name, last_name, email, phone, people, message, consent_at, lang,
        is_test, source, created_at, updated_at) VALUES (?,?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'online',?,?)`)
        .bind(id, ref, token, boat.id, f.date, f.hours, new Date(Date.now() + holdMs).toISOString(), f.payment === 'stripe' ? 'HELD' : 'AWAITING_PAYMENT_VERIFICATION', f.payment,
          total, boat.deposit_usd, total - boat.deposit_usd, fee, boat.deposit_usd * 100 + fee, f.firstName, f.lastName, f.email, f.phone, f.people, f.message, now, f.lang, isTest, now, now),
      audit(d, 'customer', 'reserve', id, { payment: f.payment, boat: boat.id, date: f.date, hours: f.hours }),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return json({ ok: false, code: 'BOOKED', state: 'pending', error: 'This boat already has a booking on your selected date. A second trip may be possible upon request. Please contact us to check availability.' }, 409);
    throw e;
  }
  const r = (await loadRes(d, 'r.id = ?', id))!;
  const statusUrl = `${u.origin}/book-now/confirmation?ref=${ref}&t=${token}`;
  if (f.payment === 'wise') {
    await sendLogged(env, d, r, 'customer_wise_pending', r.email, M.customerWisePending(r));
    return json({ ok: true, ref, redirect: statusUrl });
  }
  const sess = await createCheckout(env, d, r, u.origin);
  if (!sess.ok) {
    await d.batch([
      d.prepare(`UPDATE reservations SET status = 'EXPIRED', holds_slot = 0, updated_at = ? WHERE id = ?`).bind(nowIso(), id),
      audit(d, 'system', 'stripe_session_failed', id, { status: sess.status }),
    ]);
    return err('Card payment is temporarily unavailable. Please try again, choose Wise, or contact us on WhatsApp.', 'payment', 502);
  }
  return json({ ok: true, ref, redirect: sess.url });
}

// ---------- Stripe ----------
function stripeBase(env: BEnv, origin: string) {
  return env.STRIPE_API_BASE && isLocal(new URL(origin)) ? env.STRIPE_API_BASE : 'https://api.stripe.com';
}
async function stripe(env: BEnv, origin: string, path: string, params: Record<string, string>, idem?: string) {
  const r = await fetch(`${stripeBase(env, origin)}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', ...(idem ? { 'idempotency-key': idem } : {}) },
    body: new URLSearchParams(params),
  }).catch(() => null);
  const body = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, status: r?.status ?? 0, body: body as Record<string, any> };
}

/** Creates a Stripe Checkout session for the deposit (+6 %) and links it to the reservation (status AWAITING_PAYMENT). */
export async function createCheckout(env: BEnv, d: D1Database, r: Res, origin: string): Promise<{ ok: boolean; url?: string; status?: number }> {
  const s = await getSettings(d);
  const expires = Math.floor(Date.now() / 1000) + Math.max(30, s.stripe_hold_minutes - 4) * 60; // Stripe minimum: 30 min
  const back = `ref=${r.ref}&t=${r.token}`;
  const res = await stripe(env, origin, '/v1/checkout/sessions', {
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(r.charge_cents),
    'line_items[0][price_data][product_data][name]': `Deposit — ${r.boat_name}, ${r.date}, ${r.hours}-hour trip — ${r.ref}`,
    'line_items[0][price_data][product_data][description]': `Deposit $${r.deposit_usd} + ${Math.round((r.fee_cents / (r.deposit_usd * 100)) * 100)}% card processing fee`,
    customer_email: r.email,
    client_reference_id: r.ref,
    'metadata[ref]': r.ref,
    'metadata[reservation_id]': r.id,
    'metadata[trip_duration_hours]': String(r.hours),
    'metadata[boat]': r.boat_name,
    'metadata[fishing_date]': r.date,
    'payment_intent_data[metadata][ref]': r.ref,
    'payment_intent_data[metadata][trip_duration_hours]': String(r.hours),
    'payment_intent_data[metadata][boat]': r.boat_name,
    'payment_intent_data[metadata][fishing_date]': r.date,
    'payment_intent_data[description]': `Exotic Fish Cabo deposit ${r.ref}`,
    success_url: `${origin}/book-now/confirmation?${back}`,
    cancel_url: `${origin}/book-now/canceled?${back}`,
    expires_at: String(expires),
  }, `${r.id}-${Date.now() >> 16}`);
  if (!res.ok || !res.body.id || !res.body.url) return { ok: false, status: res.status };
  const hold = new Date(Math.max(Date.parse(r.hold_expires_at || nowIso()), (expires + 5 * 60) * 1000)).toISOString();
  await d.batch([
    d.prepare(`UPDATE reservations SET stripe_session_id = ?, status = 'AWAITING_PAYMENT', hold_expires_at = ?, updated_at = ? WHERE id = ? AND status IN ('HELD','AWAITING_PAYMENT')`)
      .bind(res.body.id, hold, nowIso(), r.id),
    audit(d, 'system', 'stripe_session_created', r.id, { session: res.body.id }),
  ]);
  return { ok: true, url: res.body.url };
}

async function verifyStripeSig(secret: string, payload: string, header: string) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2)) as Record<string, string>;
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export async function apiStripeWebhook(request: Request, env: BEnv, ctx?: ExecutionContext) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ ok: false, error: 'not configured' }, 503);
  const payload = await request.text();
  if (!(await verifyStripeSig(env.STRIPE_WEBHOOK_SECRET, payload, request.headers.get('stripe-signature') || ''))) return json({ ok: false, error: 'bad signature' }, 400);
  let ev: { id: string; type: string; livemode?: boolean; data: { object: Record<string, any> } };
  try { ev = JSON.parse(payload); } catch { return json({ ok: false }, 400); }
  const d = await db(env);
  const ins = await d.prepare(`INSERT INTO payment_events (id, provider, type, result, received_at) VALUES (?, 'stripe', ?, 'processing', ?) ON CONFLICT(id) DO NOTHING RETURNING id`)
    .bind(ev.id, ev.type, nowIso()).first();
  if (!ins) return json({ ok: true, duplicate: true }); // Stripe retry of an event already handled
  try {
    const result = await handleStripeEvent(env, d, ev, new URL(request.url).origin);
    await d.prepare(`UPDATE payment_events SET result = ?, reservation_id = ? WHERE id = ?`).bind(result.result, result.reservationId ?? null, ev.id).run();
    return json({ ok: true, result: result.result });
  } catch (e) {
    await d.prepare(`DELETE FROM payment_events WHERE id = ?`).bind(ev.id).run(); // let Stripe retry
    console.log('webhook error', String(e));
    return json({ ok: false }, 500);
  }
}

async function handleStripeEvent(env: BEnv, d: D1Database, ev: { type: string; livemode?: boolean; data: { object: Record<string, any> } }, origin: string): Promise<{ result: string; reservationId?: string }> {
  const o = ev.data.object;
  if (ev.livemode && stripeMode(env) !== 'live') return { result: 'ignored_livemode' };
  if (ev.type === 'charge.refunded') {
    const r = await loadRes(d, 'r.stripe_payment_intent = ?', o.payment_intent);
    if (!r) return { result: 'unknown_payment' };
    const full = o.amount_refunded >= o.amount;
    await d.batch([
      d.prepare(`UPDATE reservations SET status = ?, holds_slot = CASE WHEN ? THEN 0 ELSE holds_slot END, updated_at = ? WHERE id = ?`).bind(full ? 'REFUNDED' : r.status, full ? 1 : 0, nowIso(), r.id),
      d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'stripe', ?, ?, 'refunded', ?, ?)`).bind(r.id, -o.amount_refunded, o.currency, o.id, nowIso()),
      audit(d, 'stripe', full ? 'refunded' : 'partially_refunded', r.id, { amount_refunded: o.amount_refunded }),
    ]);
    return { result: full ? 'refunded' : 'partial_refund', reservationId: r.id };
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed'].includes(ev.type)) return { result: 'ignored' };
  const r = await loadRes(d, 'r.stripe_session_id = ?', o.id) || (o.metadata?.reservation_id ? await loadRes(d, 'r.id = ? AND r.ref = ?', o.metadata.reservation_id, o.metadata.ref) : null);
  if (!r) return { result: 'unknown_session' };

  if (ev.type === 'checkout.session.expired' || ev.type === 'checkout.session.async_payment_failed') {
    // only the current session counts (a newer payment link may exist); never touches a confirmed booking
    const upd = await d.prepare(`UPDATE reservations SET status = 'EXPIRED', holds_slot = 0, updated_at = ? WHERE id = ? AND stripe_session_id = ? AND status IN ('HELD','AWAITING_PAYMENT') AND source = 'online' RETURNING id`)
      .bind(nowIso(), r.id, o.id).first();
    await audit(d, 'stripe', ev.type === 'checkout.session.expired' ? 'session_expired' : 'payment_failed', r.id, { session: o.id, released: !!upd }).run();
    return { result: upd ? 'released' : 'noop', reservationId: r.id };
  }

  if (o.payment_status !== 'paid') return { result: 'not_paid_yet', reservationId: r.id };
  if (['CONFIRMED', 'REFUND_PENDING', 'REFUNDED', 'PAYMENT_EXCEPTION'].includes(r.status) && r.stripe_payment_intent === o.payment_intent) return { result: 'already_processed', reservationId: r.id };
  const now = nowIso();
  await d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'stripe', ?, ?, 'paid', ?, ?)`)
    .bind(r.id, o.amount_total, o.currency, o.payment_intent || o.id, now).run();

  const problem = (msg: string) => markException(env, d, r, msg, { session: o.id, payment_intent: o.payment_intent, amount_total: o.amount_total });
  if (o.amount_total !== r.charge_cents || String(o.currency).toLowerCase() !== 'usd') return problem(`Amount mismatch: received ${o.amount_total} ${o.currency}, expected ${r.charge_cents} usd.`);
  if (r.stripe_session_id !== o.id) await d.prepare(`UPDATE reservations SET stripe_session_id = ? WHERE id = ?`).bind(o.id, r.id).run();

  // normal case: the reservation still holds its slot
  let ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', stripe_payment_intent = ?, hold_expires_at = NULL, updated_at = ?
                            WHERE id = ? AND holds_slot = 1 AND status IN ('HELD','AWAITING_PAYMENT') RETURNING id`).bind(o.payment_intent, now, r.id).first();
  if (!ok && (r.status === 'EXPIRED' || r.status === 'CANCELED')) {
    // late payment: the hold was released — take the slot back only if it is still free and the date is not blocked
    const blocked = await d.prepare(`SELECT 1 FROM blocked_dates WHERE boat_id IN (?, '*') AND date = ?`).bind(r.boat_id, r.date).first();
    if (!blocked) {
      try {
        ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', holds_slot = 1, stripe_payment_intent = ?, hold_expires_at = NULL, updated_at = ?
                              WHERE id = ? AND holds_slot = 0 RETURNING id`).bind(o.payment_intent, now, r.id).first();
      } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; ok = null; }
    }
    if (!ok) return problem('Deposit received after the reservation had expired, and the date is no longer available. Please refund the customer or offer another date.');
    await audit(d, 'stripe', 'late_payment_confirmed', r.id).run();
  }
  if (!ok) return problem(`Payment received for a booking in status ${r.status}.`);
  await audit(d, 'stripe', 'confirmed', r.id, { payment_intent: o.payment_intent, amount: o.amount_total }).run();
  await notifyConfirmed(env, d, r.id);
  return { result: 'confirmed', reservationId: r.id };
}

async function markException(env: BEnv, d: D1Database, r: Res, problem: string, details: unknown) {
  await d.batch([
    d.prepare(`UPDATE reservations SET status = 'PAYMENT_EXCEPTION', holds_slot = 0, updated_at = ? WHERE id = ?`).bind(nowIso(), r.id),
    audit(d, 'system', 'payment_exception', r.id, { problem, details }),
  ]);
  const fresh = (await loadRes(d, 'r.id = ?', r.id))!;
  if (env.CONTACT_TO) await sendLogged(env, d, fresh, 'owner_exception', env.CONTACT_TO, M.ownerException(fresh, problem));
  return { result: 'payment_exception', reservationId: r.id };
}

// ---------- emails ----------
export async function sendLogged(env: BEnv, d: D1Database, r: Res | null, kind: string, to: string, m: { subject: string; text: string; html: string }, replyTo?: string) {
  const res = await M.sendEmail(env, to, m.subject, m.text, m.html, replyTo);
  await d.prepare(`INSERT INTO email_log (reservation_id, kind, recipient, subject, status, at, body) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(r?.id ?? null, kind, to, m.subject, res.dryRun ? 'dry_run' : res.ok ? 'sent' : `failed_${res.status ?? 0}`, nowIso(), m.text).run();
  return res.ok;
}

/** Owner + customer confirmation, each sent at most once (atomic claim; released again if the send fails → retried by the cron). */
export async function notifyConfirmed(env: BEnv, d: D1Database, id: string) {
  const r = await loadRes(d, `r.id = ? AND r.status = 'CONFIRMED'`, id);
  if (!r) return;
  if (env.CONTACT_TO && (await d.prepare(`UPDATE reservations SET owner_notified_at = ? WHERE id = ? AND owner_notified_at IS NULL RETURNING id`).bind(nowIso(), id).first())) {
    if (!(await sendLogged(env, d, r, 'owner_confirmed', env.CONTACT_TO, M.ownerConfirmed(r), r.email)))
      await d.prepare(`UPDATE reservations SET owner_notified_at = NULL WHERE id = ?`).bind(id).run();
  }
  if (await d.prepare(`UPDATE reservations SET customer_notified_at = ? WHERE id = ? AND customer_notified_at IS NULL RETURNING id`).bind(nowIso(), id).first()) {
    if (!(await sendLogged(env, d, r, 'customer_confirmed', r.email, M.customerConfirmed(r), env.CONTACT_TO)))
      await d.prepare(`UPDATE reservations SET customer_notified_at = NULL WHERE id = ?`).bind(id).run();
  }
}

// ---------- customer status / checkout return ----------
async function byRefToken(d: D1Database, ref: string, token: string) {
  if (!/^EFC-[A-Z0-9]{6}$/.test(ref) || !/^[a-f0-9]{48}$/.test(token)) return null;
  const r = await loadRes(d, 'r.ref = ?', ref);
  return r && safeEqual(r.token, token) ? r : null;
}

export async function apiStatus(request: Request, env: BEnv) {
  const u = new URL(request.url);
  const d = await db(env);
  await sweepStmt(d).run();
  const r = await byRefToken(d, u.searchParams.get('ref') || '', u.searchParams.get('t') || '');
  if (!r) return json({ ok: false, error: 'Booking not found' }, 404);
  return json({
    ok: true, ref: r.ref, status: r.status, boat: r.boat_name, date: r.date, hours: r.hours, people: r.people, firstName: r.first_name,
    total: r.total_usd, deposit: r.deposit_usd, balance: r.balance_usd, chargeCents: r.charge_cents, feeCents: r.fee_cents, payment: r.payment_method,
    holdExpiresAt: r.hold_expires_at, wiseUrl: r.payment_method === 'wise' ? M.WISE_PAY_URL : null, test: !!r.is_test,
    canPay: r.payment_method === 'stripe' && r.status === 'AWAITING_PAYMENT' && !!r.hold_expires_at && Date.parse(r.hold_expires_at) > Date.now(),
  });
}

/** Customer left Stripe Checkout: release the date right away (online bookings only) and expire the session. */
export async function apiCancelCheckout(request: Request, env: BEnv) {
  if (request.method !== 'POST' || !sameOrigin(request)) return json({ ok: false }, 405);
  const { ref = '', t = '' } = (await request.json().catch(() => ({}))) as { ref?: string; t?: string };
  const d = await db(env);
  const r = await byRefToken(d, ref, t);
  if (!r) return json({ ok: false }, 404);
  if (r.source !== 'online' || !['HELD', 'AWAITING_PAYMENT'].includes(r.status)) return json({ ok: true, status: r.status });
  const u = new URL(request.url);
  if (r.stripe_session_id) {
    const x = await stripe(env, u.origin, `/v1/checkout/sessions/${r.stripe_session_id}/expire`, {});
    // already paid/complete → leave it to the webhook
    if (!x.ok && x.body?.error?.code !== 'checkout_session_expired' && !/expired/i.test(String(x.body?.error?.message ?? ''))) return json({ ok: true, status: r.status, pending: true });
  }
  await d.batch([
    d.prepare(`UPDATE reservations SET status = 'CANCELED', holds_slot = 0, updated_at = ? WHERE id = ? AND status IN ('HELD','AWAITING_PAYMENT')`).bind(nowIso(), r.id),
    audit(d, 'customer', 'checkout_canceled', r.id),
  ]);
  return json({ ok: true, status: 'CANCELED' });
}

/** Payment link for a booking that is still held (second trip recorded by the owner, or a retry). */
export async function apiPay(request: Request, env: BEnv) {
  const u = new URL(request.url);
  const d = await db(env);
  await sweepStmt(d).run();
  const r = await byRefToken(d, u.searchParams.get('ref') || '', u.searchParams.get('t') || '');
  const back = (msg: string) => Response.redirect(`${u.origin}/book-now/confirmation?ref=${encodeURIComponent(u.searchParams.get('ref') || '')}&t=${encodeURIComponent(u.searchParams.get('t') || '')}&m=${msg}`, 303);
  if (!r) return back('notfound');
  if (r.payment_method !== 'stripe' || r.status !== 'AWAITING_PAYMENT' || !r.holds_slot) return back('nopay');
  const m = stripeMode(env);
  if (m === 'off' || m === 'blocked') return back('unavailable');
  if (!(await rateLimit(d, `pay:${r.id}`, 10, 3600))) return back('later');
  if (r.stripe_session_id) await stripe(env, u.origin, `/v1/checkout/sessions/${r.stripe_session_id}/expire`, {}); // only one open session at a time
  const s = await createCheckout(env, d, r, u.origin);
  return s.ok ? Response.redirect(s.url!, 303) : back('unavailable');
}

// ---------- cron ----------
export async function cron(env: BEnv) {
  if (!env.DB) return;
  const d = await db(env);
  await sweepStmt(d).run();
  // Wise reservations released after 24 h: tell the customer once
  const { results: expired } = await d.prepare(`SELECT r.*, b.name boat_name, b.size_ft boat_size_ft FROM reservations r JOIN boats b ON b.id = r.boat_id
     WHERE r.status = 'EXPIRED' AND r.payment_method = 'wise' AND r.expiry_notified_at IS NULL AND r.updated_at > ? LIMIT 20`).bind(new Date(Date.now() - 3 * 864e5).toISOString()).all<Res>();
  for (const r of expired) {
    if (await d.prepare(`UPDATE reservations SET expiry_notified_at = ? WHERE id = ? AND expiry_notified_at IS NULL RETURNING id`).bind(nowIso(), r.id).first())
      await sendLogged(env, d, r, 'customer_wise_expired', r.email, M.customerWiseExpired(r));
  }
  // confirmation emails whose delivery failed earlier
  const { results: unsent } = await d.prepare(`SELECT id FROM reservations WHERE status = 'CONFIRMED' AND (owner_notified_at IS NULL OR customer_notified_at IS NULL) AND updated_at > ? LIMIT 20`)
    .bind(new Date(Date.now() - 3 * 864e5).toISOString()).all<{ id: string }>();
  for (const { id } of unsent) await notifyConfirmed(env, d, id);
  // housekeeping (free-plan friendly)
  await d.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(Math.floor(Date.now() / 1000) - 86400).run();
}
