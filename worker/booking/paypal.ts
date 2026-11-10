// PayPal (owner, 2026-11-09): a PERMANENT payment method next to Stripe and Wise.
// Deposit + PayPal processing fee (settings.paypal_fee_pct, 6 %) on the DEPOSIT ONLY; the balance (cash on the day) never changes.
// Only the connection of the owner's PayPal account is postponed. Until it is connected AND authorised, paypalPaymentsOn()
// is false: no order is created, nothing can be charged, and the customer is offered Stripe or Wise without losing the booking.
//
// Flow (PayPal Orders v2, intent CAPTURE — nothing is taken before the customer approves AND we capture server-side):
//   /api/booking/reserve (payment=paypal) → reservation HELD → order created → customer approves on PayPal
//   → /api/booking/paypal/return (server-side capture, amount/currency/reservation checked) → CONFIRMED
//   → backup: signed webhook /api/paypal/webhook (CHECKOUT.ORDER.APPROVED → capture; PAYMENT.CAPTURE.COMPLETED → confirm).
// A booking is NEVER marked paid or confirmed from the browser: only from a capture read back from PayPal's API.
// Duplicates: one order per reservation (PayPal-Request-Id), PayPal captures an order only once, one capture per reservation (claimed atomically in D1,
// unique indexes on paypal_order_id / paypal_capture_id), webhook events processed once (payment_events).
//
// Configuration (never in the code — Cloudflare secrets/vars; values are never shown anywhere):
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET  REST app credentials (secrets)
//   PAYPAL_WEBHOOK_ID                       id of the webhook created for https://fish-cabo.com/api/paypal/webhook
//   PAYPAL_ENV                              "live" | "sandbox" (sandbox is refused on production)
//   PAYPAL_LIVE                             must be "approved" (owner) before live credentials are used
//   launch.json PAYPAL_PAYMENTS_ENABLED     production switch (owner)
import { json, nowIso, rateLimit } from './util';
import { getSettings, ensurePaypalSchema } from './schema';
import { paypalEnabled, isProductionEnv, isLocalHost } from './envmode';
import type { BEnv } from './core';
import type { Res } from './emails';

export type PayPalEnv = {
  SITE_ENV?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_ENV?: string;
  PAYPAL_LIVE?: string;
  PAYPAL_API_BASE?: string; // local tests only (honoured on 127.0.0.1/localhost, never on production)
};

/** off = no credentials · blocked = credentials present but not usable here (sandbox on production, live not approved) */
export function paypalMode(env: PayPalEnv): 'off' | 'blocked' | 'sandbox' | 'live' {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return 'off';
  if (env.PAYPAL_ENV === 'sandbox') return env.SITE_ENV === 'production' ? 'blocked' : 'sandbox';
  if (env.PAYPAL_ENV === 'live' && env.PAYPAL_LIVE === 'approved') return 'live';
  return 'blocked';
}
/** PayPal checkout can actually be offered: allowed by configuration AND usable credentials AND a webhook id. */
export const paypalPaymentsOn = (env: PayPalEnv) => paypalEnabled(env) && ['sandbox', 'live'].includes(paypalMode(env)) && !!env.PAYPAL_WEBHOOK_ID;

/** PayPal charge for a deposit, in cents: deposit + fee%, rounded to the nearest cent (fee on the deposit only). */
export const paypalChargeCents = (depositUsd: number, feePct: number) => Math.round(depositUsd * 100 * (1 + feePct / 100));
const usd = (c: number) => (c / 100).toFixed(2);
const toCents = (v: unknown) => Math.round(Number(v) * 100);

function base(env: PayPalEnv, origin: string) {
  const o = new URL(origin);
  if (env.PAYPAL_API_BASE && isLocalHost(o) && !isProductionEnv(env, o)) return env.PAYPAL_API_BASE;
  return paypalMode(env) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

let tokenCache: { key: string; token: string; exp: number } | null = null;
async function token(env: PayPalEnv, origin: string): Promise<string | null> {
  const key = `${base(env, origin)}|${env.PAYPAL_CLIENT_ID}`;
  if (tokenCache && tokenCache.key === key && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const r = await fetch(`${base(env, origin)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`), 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  tokenCache = { key, token: j.access_token, exp: Date.now() + (j.expires_in || 300) * 1000 };
  return j.access_token;
}

async function call(env: PayPalEnv, origin: string, method: string, path: string, body?: unknown, requestId?: string) {
  const t = await token(env, origin);
  if (!t) return { ok: false, status: 0, body: {} as any };
  const r = await fetch(`${base(env, origin)}${path}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', prefer: 'return=representation', ...(requestId ? { 'paypal-request-id': requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, body: {} as any };
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

type Deps = {
  db: (env: BEnv) => Promise<D1Database>;
  loadRes: (d: D1Database, where: string, ...args: unknown[]) => Promise<Res | null>;
  audit: (d: D1Database, actor: string, action: string, reservationId: string | null, details?: unknown) => D1PreparedStatement;
  markException: (env: BEnv, d: D1Database, r: Res, problem: string, details: unknown) => Promise<{ result: string; reservationId?: string }>;
  notifyConfirmed: (env: BEnv, d: D1Database, id: string) => Promise<void>;
  byRefToken: (d: D1Database, ref: string, token: string) => Promise<Res | null>;
  boatLabel: (r: { boat_number: number; boat_size_ft: number }) => string;
};
let D: Deps;
export const wirePaypal = (deps: Deps) => { D = deps; };

/** Creates (or re-uses) the PayPal order for a held reservation and returns the approval link. */
export async function createPaypalOrder(env: BEnv, d: D1Database, r: Res, origin: string): Promise<{ ok: boolean; url?: string; status?: number }> {
  const s = await getSettings(d);
  const q = `ref=${encodeURIComponent(r.ref)}&t=${encodeURIComponent((r as any).token)}`;
  const res = await call(env, origin, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: r.ref, custom_id: r.id, invoice_id: r.ref,
      description: `Exotic Fish Cabo deposit ${r.ref} — ${D.boatLabel(r)}, ${r.date}, ${r.hours} h (deposit $${r.deposit_usd} + ${s.paypal_fee_pct}% PayPal fee)`.slice(0, 127),
      amount: { currency_code: 'USD', value: usd(r.charge_cents) },
    }],
    payment_source: { paypal: { experience_context: {
      brand_name: 'Exotic Fish Cabo', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', landing_page: 'LOGIN',
      return_url: `${origin}/api/booking/paypal/return?${q}`, cancel_url: `${origin}/book-now?paypal=cancel`,
    } } },
  }, `efc-order-${r.id}`);
  const id = res.body?.id as string | undefined;
  const link = (res.body?.links || []).find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')?.href as string | undefined;
  if (!res.ok || !id || !link) return { ok: false, status: res.status };
  const exp = new Date(Date.now() + s.paypal_hold_minutes * 60e3).toISOString();
  await d.batch([
    d.prepare(`UPDATE reservations SET paypal_order_id = ?, status = 'AWAITING_PAYMENT', hold_expires_at = ?, updated_at = ? WHERE id = ? AND status IN ('HELD','AWAITING_PAYMENT')`).bind(id, exp, nowIso(), r.id),
    D.audit(d, 'system', 'paypal_order_created', r.id, { order: id, amount_cents: r.charge_cents }),
  ]);
  return { ok: true, url: link };
}

/** Takes the deposit for an APPROVED order (server-side) and confirms the booking. Never captures for a date that is no
 * longer this customer's: the money is only taken if the reservation still holds — or can take back — its slot. */
export async function captureAndConfirm(env: BEnv, d: D1Database, r: Res, origin: string, actor = 'paypal'): Promise<{ result: string }> {
  const order = (r as any).paypal_order_id as string | null;
  if (!order) return { result: 'no_order' };
  if ((r as any).paypal_capture_id) return { result: 'already_processed' };
  if (!r.holds_slot) {
    if (!['EXPIRED', 'CANCELED'].includes(r.status) || r.source !== 'online') return { result: 'not_payable' };
    // hold released (customer took too long): take the slot back only if it is still free — before any money is taken
    const blocked = await d.prepare(`SELECT 1 FROM blocked_dates WHERE boat_id IN (?, '*') AND date = ?`).bind(r.boat_id, r.date).first();
    let back = null;
    if (!blocked) {
      try {
        back = await d.prepare(`UPDATE reservations SET holds_slot = 1, status = 'AWAITING_PAYMENT', hold_expires_at = ?, updated_at = ? WHERE id = ? AND holds_slot = 0 AND status IN ('EXPIRED','CANCELED') RETURNING id`)
          .bind(new Date(Date.now() + 15 * 60e3).toISOString(), nowIso(), r.id).first();
      } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
    }
    if (!back) { await D.audit(d, actor, 'paypal_not_captured_date_gone', r.id, { order }).run(); return { result: 'date_gone' }; }
    await D.audit(d, actor, 'paypal_slot_taken_back', r.id, { order }).run();
  }
  // no PayPal-Request-Id here: a refused attempt (order not approved yet) must not be replayed later; PayPal itself
  // never captures an order twice (ORDER_ALREADY_CAPTURED → the existing capture is read back and handled once)
  const cap = await call(env, origin, 'POST', `/v2/checkout/orders/${encodeURIComponent(order)}/capture`, {});
  let o = cap.body;
  if (!cap.ok && cap.body?.details?.some((x: any) => x.issue === 'ORDER_ALREADY_CAPTURED')) o = (await call(env, origin, 'GET', `/v2/checkout/orders/${encodeURIComponent(order)}`)).body;
  const c = o?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!c) {
    await D.audit(d, actor, 'paypal_capture_failed', r.id, { order, status: cap.status, issue: cap.body?.details?.[0]?.issue || cap.body?.name || null }).run();
    return { result: 'capture_failed' };
  }
  return handleCapture(env, d, r.id, { id: c.id, status: c.status, value: c.amount?.value, currency: c.amount?.currency_code, custom_id: c.custom_id ?? o?.purchase_units?.[0]?.custom_id, order }, actor);
}

/** A capture read back from PayPal → record it once and confirm the booking (same rules as Stripe). */
export async function handleCapture(env: BEnv, d: D1Database, reservationId: string, c: { id: string; status: string; value: unknown; currency: string; custom_id?: string; order?: string }, actor = 'paypal'): Promise<{ result: string }> {
  const r = await D.loadRes(d, 'r.id = ?', reservationId);
  if (!r) return { result: 'unknown_reservation' };
  if (c.custom_id && c.custom_id !== r.id) return { result: 'reservation_mismatch' };
  if (c.status !== 'COMPLETED') {
    await D.audit(d, actor, 'paypal_capture_' + String(c.status || 'unknown').toLowerCase(), r.id, { capture: c.id }).run();
    return { result: 'not_completed' };
  }
  // claim: one capture per reservation (a second, different capture = double payment → owner must refund it)
  const claimed = await d.prepare(`UPDATE reservations SET paypal_capture_id = ? WHERE id = ? AND paypal_capture_id IS NULL RETURNING id`).bind(c.id, r.id).first();
  if (!claimed) {
    const cur = await d.prepare(`SELECT paypal_capture_id FROM reservations WHERE id = ?`).bind(r.id).first<{ paypal_capture_id: string }>();
    if (cur?.paypal_capture_id === c.id) return { result: 'already_processed' };
    return D.markException(env, d, r, `A second PayPal payment (${c.id}) was received for this booking. Please refund it in PayPal.`, { capture: c.id, first: cur?.paypal_capture_id });
  }
  const now = nowIso();
  const cents = toCents(c.value);
  await d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'paypal', ?, ?, 'paid', ?, ?)`)
    .bind(r.id, cents, String(c.currency || '').toLowerCase(), c.id, now).run();
  const problem = (msg: string) => D.markException(env, d, r, msg, { capture: c.id, order: c.order, amount: c.value, currency: c.currency });
  if (cents !== r.charge_cents || String(c.currency).toUpperCase() !== 'USD') return problem(`Amount mismatch: received ${c.value} ${c.currency}, expected ${usd(r.charge_cents)} USD.`);
  let ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', hold_expires_at = NULL, updated_at = ? WHERE id = ? AND holds_slot = 1 AND status IN ('HELD','AWAITING_PAYMENT') RETURNING id`).bind(now, r.id).first();
  if (!ok && (r.status === 'EXPIRED' || r.status === 'CANCELED')) {
    const blocked = await d.prepare(`SELECT 1 FROM blocked_dates WHERE boat_id IN (?, '*') AND date = ?`).bind(r.boat_id, r.date).first();
    if (!blocked) {
      try { ok = await d.prepare(`UPDATE reservations SET status = 'CONFIRMED', holds_slot = 1, hold_expires_at = NULL, updated_at = ? WHERE id = ? AND holds_slot = 0 RETURNING id`).bind(now, r.id).first(); }
      catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; ok = null; }
    }
    if (!ok) return problem('Deposit received after the reservation had expired, and the date is no longer available. Please refund the customer in PayPal or offer another date.');
    await D.audit(d, actor, 'late_payment_confirmed', r.id).run();
  }
  if (!ok) return problem(`Payment received for a booking in status ${r.status}.`);
  await D.audit(d, actor, 'confirmed', r.id, { capture: c.id, order: c.order, amount_cents: cents }).run();
  await D.notifyConfirmed(env, d, r.id);
  return { result: 'confirmed' };
}

/** Return from PayPal after approval: capture server-side, then show the booking status page. */
export async function apiPaypalReturn(request: Request, env: BEnv) {
  const u = new URL(request.url);
  const ref = u.searchParams.get('ref') || '', t = u.searchParams.get('t') || '';
  const back = (m?: string) => Response.redirect(`${u.origin}/book-now/confirmation?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}${m ? '&m=' + m : ''}`, 303);
  const d = await D.db(env);
  const r = await D.byRefToken(d, ref, t);
  if (!r) return back('notfound');
  if (r.payment_method !== 'paypal') return back('nopay');
  if (r.status === 'CONFIRMED') return back();
  if (!paypalPaymentsOn(env)) return back('paypal_unavailable');
  if (u.searchParams.get('token') && u.searchParams.get('token') !== (r as any).paypal_order_id) return back('notfound');
  if (!(await rateLimit(d, `ppret:${r.id}`, 20, 3600))) return back('later');
  const x = await captureAndConfirm(env, d, r, u.origin, 'customer_return');
  return back(x.result === 'confirmed' || x.result === 'already_processed' ? undefined : x.result === 'date_gone' ? 'paypal_date_gone' : x.result === 'not_completed' ? undefined : 'paypal_failed');
}

/** Customer came back from PayPal without paying (or retries): release the date unless PayPal already has the payment. */
export async function cancelPaypal(env: BEnv, d: D1Database, r: Res, origin: string) {
  const order = (r as any).paypal_order_id as string | null;
  if (order && paypalPaymentsOn(env)) {
    const g = await call(env, origin, 'GET', `/v2/checkout/orders/${encodeURIComponent(order)}`);
    if (!g.ok) return json({ ok: true, status: r.status, pending: true }); // cannot check → keep the hold (it expires on its own)
    if (g.body?.status === 'APPROVED' || g.body?.status === 'COMPLETED') {
      const x = await captureAndConfirm(env, d, r, origin, 'customer_return');
      const fresh = await D.loadRes(d, 'r.id = ?', r.id);
      return json({ ok: true, status: fresh?.status || r.status, pending: x.result !== 'confirmed' && x.result !== 'already_processed' && fresh?.status !== 'CONFIRMED' });
    }
  }
  await d.batch([
    d.prepare(`UPDATE reservations SET status = 'CANCELED', holds_slot = 0, updated_at = ? WHERE id = ? AND status IN ('HELD','AWAITING_PAYMENT') AND paypal_capture_id IS NULL`).bind(nowIso(), r.id),
    D.audit(d, 'customer', 'checkout_canceled', r.id, { provider: 'paypal' }),
  ]);
  return json({ ok: true, status: 'CANCELED' });
}

/** Signed PayPal webhook (backup path: the customer closed the browser after approving, refunds…). */
export async function apiPaypalWebhook(request: Request, env: BEnv) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  if (paypalMode(env) === 'off' || !env.PAYPAL_WEBHOOK_ID) return json({ ok: false, error: 'PayPal not connected' }, 503);
  const raw = await request.text();
  let ev: any; try { ev = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  const u = new URL(request.url);
  const h = (k: string) => request.headers.get(k) || '';
  const v = await call(env, u.origin, 'POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: ev,
  });
  if (!v.ok || v.body?.verification_status !== 'SUCCESS') return json({ ok: false, error: 'bad signature' }, 400);
  const d = await D.db(env);
  await ensurePaypalSchema(d);
  const ins = await d.prepare(`INSERT INTO payment_events (id, provider, type, result, received_at) VALUES (?, 'paypal', ?, 'processing', ?) ON CONFLICT(id) DO NOTHING RETURNING id`)
    .bind(String(ev.id), String(ev.event_type), nowIso()).first();
  if (!ins) return json({ ok: true, duplicate: true });
  try {
    const res = await handlePaypalEvent(env, d, ev, u.origin);
    await d.prepare(`UPDATE payment_events SET result = ?, reservation_id = ? WHERE id = ?`).bind(res.result, res.reservationId ?? null, String(ev.id)).run();
    return json({ ok: true, result: res.result });
  } catch (e) {
    await d.prepare(`DELETE FROM payment_events WHERE id = ?`).bind(String(ev.id)).run(); // let PayPal retry
    console.log('paypal webhook error', String(e));
    return json({ ok: false }, 500);
  }
}

async function handlePaypalEvent(env: BEnv, d: D1Database, ev: any, origin: string): Promise<{ result: string; reservationId?: string }> {
  const o = ev.resource || {};
  if (ev.event_type === 'CHECKOUT.ORDER.APPROVED') {
    const r = await D.loadRes(d, 'r.paypal_order_id = ?', o.id);
    if (!r) return { result: 'unknown_order' };
    return { ...(await captureAndConfirm(env, d, r, origin, 'paypal')), reservationId: r.id };
  }
  if (['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.PENDING'].includes(ev.event_type)) {
    const orderId = o.supplementary_data?.related_ids?.order_id;
    const r = (orderId && await D.loadRes(d, 'r.paypal_order_id = ?', orderId)) || (o.custom_id && await D.loadRes(d, 'r.id = ?', o.custom_id)) || null;
    if (!r) return { result: 'unknown_capture' };
    return { ...(await handleCapture(env, d, r.id, { id: o.id, status: o.status, value: o.amount?.value, currency: o.amount?.currency_code, custom_id: o.custom_id, order: orderId }, 'paypal')), reservationId: r.id };
  }
  if (ev.event_type === 'PAYMENT.CAPTURE.REFUNDED' || ev.event_type === 'PAYMENT.CAPTURE.REVERSED') {
    const capId = (o.links || []).find((l: any) => l.rel === 'up')?.href?.split('/').pop() || o.id;
    const r = await D.loadRes(d, 'r.paypal_capture_id = ?', capId) || (o.custom_id ? await D.loadRes(d, 'r.id = ?', o.custom_id) : null);
    if (!r) return { result: 'unknown_refund' };
    const cents = toCents(o.amount?.value ?? o.seller_payable_breakdown?.total_refunded_amount?.value);
    const full = cents >= r.charge_cents;
    await d.batch([
      d.prepare(`UPDATE reservations SET status = ?, holds_slot = CASE WHEN ? THEN 0 ELSE holds_slot END, updated_at = ? WHERE id = ?`).bind(full ? 'REFUNDED' : r.status, full ? 1 : 0, nowIso(), r.id),
      d.prepare(`INSERT INTO payments (reservation_id, provider, amount_cents, currency, status, external_id, created_at) VALUES (?, 'paypal', ?, 'usd', 'refunded', ?, ?)`).bind(r.id, -cents, String(o.id), nowIso()),
      D.audit(d, 'paypal', full ? 'refunded' : 'partially_refunded', r.id, { amount_refunded_cents: cents, event: ev.event_type }),
    ]);
    return { result: full ? 'refunded' : 'partial_refund', reservationId: r.id };
  }
  return { result: 'ignored' };
}
