// Google Calendar — ONE-WAY mirror of confirmed bookings (owner, 2026-11-10).
// /booking-admin (D1) stays the only source of truth: the calendar is never read back, never changes availability or a status.
//
// Which bookings: status CONFIRMED or COMPLETED (online after a verified payment, Wise once verified by the owner, and
// owner-recorded bookings). Not mirrored: HELD / AWAITING_PAYMENT / AWAITING_PAYMENT_VERIFICATION (Wise pending) / EXPIRED /
// CANCELED / REFUND_PENDING / REFUNDED / PAYMENT_EXCEPTION, and test bookings on production.
// How: reconcile() compares what each booking should look like in the calendar with what was last written
// (calendar_sync table) and only calls Google for differences:
//   - event id is deterministic ("efc" + reservation id) → a retry, a repeated webhook or two runs at once can never create
//     a second event (PUT on that id, POST with that id only when it does not exist yet);
//   - date / boat / duration / name change → the same event is updated; booking no longer confirmed → the event is deleted.
// Triggered in the background after admin actions and payment confirmations (ctx.waitUntil) and by the hourly cron.
// Any Google error is caught and logged (calendar_sync.last_error, admin readiness): it can never block a booking or a payment.
//
// Configuration (Cloudflare — never in Git, never shown anywhere):
//   GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN  OAuth client + refresh token of l.tronelmx@gmail.com (secrets)
//   GCAL_CALENDAR_ID   id of the "EXOTIC FISH CABO – BOOKINGS" calendar (…@group.calendar.google.com), never "primary"
// Scope needed: https://www.googleapis.com/auth/calendar.events
import catalogue from '../../src/data/boats.json';
import { nowIso, localToday, addDays } from './util';
import { getSettings, manualClient } from './schema';

export type GcalEnv = {
  DB?: D1Database; SITE_ENV?: string; SITE_URL?: string;
  GCAL_CLIENT_ID?: string; GCAL_CLIENT_SECRET?: string; GCAL_REFRESH_TOKEN?: string; GCAL_CALENDAR_ID?: string;
  GCAL_API_BASE?: string; GCAL_TOKEN_URL?: string; // local tests only (127.0.0.1)
};
const TZ = 'America/Mazatlan';
const MIRRORED = ['CONFIRMED', 'COMPLETED'];
const MAX_CALLS = 40; // per run (Google quota friendly; the next run continues)

export const gcalConfigured = (e: GcalEnv) => !!(e.GCAL_CLIENT_ID && e.GCAL_CLIENT_SECRET && e.GCAL_REFRESH_TOKEN && e.GCAL_CALENDAR_ID && e.GCAL_CALENDAR_ID !== 'primary');
const local = (e: GcalEnv) => /^http:\/\/127\.0\.0\.1[:/]/.test(e.GCAL_API_BASE || '') && e.SITE_ENV !== 'production';
const apiBase = (e: GcalEnv) => (local(e) ? e.GCAL_API_BASE! : 'https://www.googleapis.com/calendar/v3');
const tokenUrl = (e: GcalEnv) => (local(e) && e.GCAL_TOKEN_URL ? e.GCAL_TOKEN_URL : 'https://oauth2.googleapis.com/token');
export const eventIdOf = (reservationId: string) => 'efc' + reservationId.toLowerCase().replace(/[^0-9a-v]/g, '');
const MODEL: Record<string, { number: number; name: string }> = Object.fromEntries((catalogue as { boats: { id: string; number: number; name: string }[] }).boats.map((b) => [b.id, { number: b.number, name: b.name }]));

let token: { v: string; exp: number; key: string } | null = null;
async function accessToken(e: GcalEnv): Promise<string> {
  const key = (e.GCAL_CLIENT_ID || '') + (e.GCAL_REFRESH_TOKEN || '').slice(-6);
  if (token && token.key === key && token.exp > Date.now() + 60e3) return token.v;
  const r = await fetch(tokenUrl(e), {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: e.GCAL_CLIENT_ID!, client_secret: e.GCAL_CLIENT_SECRET!, refresh_token: e.GCAL_REFRESH_TOKEN!, grant_type: 'refresh_token' }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`oauth ${r.status} ${j.error || ''}`.trim()); // invalid_grant = token revoked/expired → owner reconnects
  token = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, key };
  return token.v;
}
async function call(e: GcalEnv, method: string, path: string, body?: unknown, retry = true): Promise<{ status: number; body: any }> {
  const r = await fetch(apiBase(e) + path, {
    method, signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${await accessToken(e)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401 && retry) { token = null; return call(e, method, path, body, false); } // access token revoked/expired early → refresh once
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

type Row = { id: string; ref: string; boat_id: string; date: string; hours: number; slot: number; status: string; first_name: string; last_name: string; people: number; source: string; is_test: number };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

/** The calendar event for one booking (no email, phone, payment or card data). */
export function eventFor(r: Row, depMin: number, siteUrl: string) {
  const m = MODEL[r.boat_id] || { number: 0, name: r.boat_id };
  const client = `${r.first_name} ${r.last_name}`.replace(/\s+/g, ' ').trim();
  const end = depMin + r.hours * 60;
  return {
    id: eventIdOf(r.id),
    summary: `${m.name} — ${r.hours}h — ${client}`,
    location: 'Puerto Los Cabos Marina, San José del Cabo',
    description: [
      `Booking reference: ${r.ref}`,
      `Boat #${m.number} — ${m.name}${r.slot > 0 ? ' (second trip of the day)' : ''}`,
      `Trip: ${r.hours} hours · Guests: ${r.people}`,
      `Client: ${client}`,
      r.source === 'online' ? 'Booked online' : 'Recorded by the owner',
      `Details: ${siteUrl.replace(/\/$/, '')}/booking-admin`,
    ].join('\n'),
    start: { dateTime: `${r.date}T${hhmm(depMin)}`, timeZone: TZ },
    end: { dateTime: `${r.date}T${hhmm(end)}`, timeZone: TZ },
    status: 'confirmed',
    transparency: 'opaque',
    extendedProperties: { private: { efcRef: r.ref, efcReservationId: r.id } },
  };
}
/** All-day event for a manual booking (a MANUAL BOOKING blocked day): boat, client name if recorded, no other data. */
export function manualEventFor(b: { boat_id: string; date: string; reason: string }, siteUrl: string) {
  const m = MODEL[b.boat_id] || { number: 0, name: b.boat_id };
  const client = manualClient(b.reason);
  const next = new Date(Date.parse(b.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  return {
    id: 'efcm' + b.date.replace(/-/g, '') + String(m.number).padStart(2, '0'),
    summary: `${m.name} — ${client || 'Manual booking'}`,
    location: 'Puerto Los Cabos Marina, San José del Cabo',
    description: [`Boat #${m.number} — ${m.name}`, client ? `Client: ${client}` : '', 'Manual booking taken by the owner before online booking', `Details: ${siteUrl.replace(/\/$/, '')}/booking-admin`].filter(Boolean).join('\n'),
    start: { date: b.date },
    end: { date: next },
    status: 'confirmed',
    transparency: 'opaque',
    extendedProperties: { private: { efcManual: `${b.boat_id}|${b.date}` } },
  };
}
const hashOf = async (o: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(o))))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');

async function ensureTable(d: D1Database) {
  await d.prepare(`CREATE TABLE IF NOT EXISTS calendar_sync (
    reservation_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, hash TEXT, state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, synced_at TEXT, updated_at TEXT NOT NULL)`).run();
}

let running: Promise<unknown> | null = null;
let again = false;
/** Mirror D1 → Google Calendar. Never throws. Triggers that arrive during a run are coalesced into one more run
 * (nothing is lost, no parallel runs in this isolate; other isolates are harmless thanks to the deterministic event ids). */
export async function reconcile(e: GcalEnv, _force = false): Promise<{ ok: boolean; skipped?: string; created: number; updated: number; deleted: number; errors: number }> {
  const out = { ok: true, created: 0, updated: 0, deleted: 0, errors: 0 };
  if (!e.DB || !gcalConfigured(e)) return { ...out, skipped: 'not configured' };
  if (running) { again = true; await running.catch(() => {}); return { ...out, skipped: 'coalesced into the running pass' }; }
  const pass = async () => {
    const d = e.DB!;
    await ensureTable(d);
    const s = await getSettings(d);
    const depMin = (s.departure_hour_local ?? 6) * 60 + (s.departure_minute_local ?? 30);
    const site = e.SITE_URL || 'https://fish-cabo.com';
    const from = addDays(localToday(), -30); // past trips are left as they are
    const prod = e.SITE_ENV === 'production';
    const { results: want } = await d.prepare(`SELECT id, ref, boat_id, date, hours, slot, status, first_name, last_name, people, source, is_test
       FROM reservations WHERE status IN (${MIRRORED.map(() => '?').join(',')}) AND date >= ? ${prod ? 'AND is_test = 0' : ''}`).bind(...MIRRORED, from).all<Row>();
    const { results: rows } = await d.prepare(`SELECT reservation_id, event_id, hash, state FROM calendar_sync`).all<{ reservation_id: string; event_id: string; hash: string | null; state: string }>();
    const known = new Map(rows.map((x) => [x.reservation_id, x]));
    // manual bookings taken by the owner before online booking (blocked days labelled MANUAL BOOKING): all-day events
    const { results: blocks } = await d.prepare(`SELECT boat_id, date, reason FROM blocked_dates WHERE reason LIKE 'MANUAL BOOKING%' AND date >= ?`).bind(from).all<{ boat_id: string; date: string; reason: string }>();
    const blockKey = (b: { boat_id: string; date: string }) => `block:${b.boat_id}|${b.date}`;
    const wanted = new Set([...want.map((r) => r.id), ...blocks.map(blockKey)]);
    let calls = 0;
    const cal = `/calendars/${encodeURIComponent(e.GCAL_CALENDAR_ID!)}/events`;
    const mark = (id: string, ev: string, state: string, hash: string | null, err: string | null) =>
      d.prepare(`INSERT INTO calendar_sync (reservation_id, event_id, hash, state, attempts, last_error, synced_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reservation_id) DO UPDATE SET event_id = excluded.event_id, hash = excluded.hash, state = excluded.state,
          attempts = CASE WHEN excluded.last_error IS NULL THEN 0 ELSE calendar_sync.attempts + 1 END, last_error = excluded.last_error,
          synced_at = COALESCE(excluded.synced_at, calendar_sync.synced_at), updated_at = excluded.updated_at`)
        .bind(id, ev, hash, state, err ? 1 : 0, err, err ? null : nowIso(), nowIso()).run();
    // 1) confirmed bookings: create or update when different from what was last written
    for (const r of want) {
      if (calls >= MAX_CALLS) break;
      const ev = eventFor(r, depMin, site);
      const h = await hashOf(ev);
      const k = known.get(r.id);
      if (k && k.state === 'synced' && k.hash === h) continue;
      try {
        calls++;
        let res = await call(e, 'PUT', `${cal}/${ev.id}`, ev); // update (also brings back an event that was deleted)
        let created = false;
        if (res.status === 404) { calls++; res = await call(e, 'POST', cal, ev); created = true; }
        if (res.status === 409) { calls++; res = await call(e, 'PUT', `${cal}/${ev.id}`, ev); created = false; } // created meanwhile by another run
        if (res.status >= 300) throw new Error(`google ${res.status} ${res.body?.error?.message || ''}`.trim());
        await mark(r.id, ev.id, 'synced', h, null);
        created && !k ? out.created++ : out.updated++;
      } catch (err) {
        out.errors++; out.ok = false;
        await mark(r.id, ev.id, 'error', null, String(err).slice(0, 300));
      }
    }
    // 1b) manual bookings (owner's blocked days) as all-day events
    for (const b of blocks) {
      if (calls >= MAX_CALLS) break;
      const key = blockKey(b);
      const ev = manualEventFor(b, site);
      const h = await hashOf(ev);
      const k = known.get(key);
      if (k && k.state === 'synced' && k.hash === h) continue;
      try {
        calls++;
        let res = await call(e, 'PUT', `${cal}/${ev.id}`, ev);
        let created = false;
        if (res.status === 404) { calls++; res = await call(e, 'POST', cal, ev); created = true; }
        if (res.status === 409) { calls++; res = await call(e, 'PUT', `${cal}/${ev.id}`, ev); created = false; }
        if (res.status >= 300) throw new Error(`google ${res.status} ${res.body?.error?.message || ''}`.trim());
        await mark(key, ev.id, 'synced', h, null);
        created && !k ? out.created++ : out.updated++;
      } catch (err) {
        out.errors++; out.ok = false;
        await mark(key, ev.id, 'error', null, String(err).slice(0, 300));
      }
    }
    // 2) events of bookings that are no longer confirmed (cancelled, refunded, moved to a non-confirmed state…) → delete
    for (const k of rows) {
      if (wanted.has(k.reservation_id) || k.state === 'deleted') continue;
      if (calls >= MAX_CALLS) break;
      // a past trip that dropped out of the 30-day window only because of its date keeps its event
      const st = await d.prepare(`SELECT status, date FROM reservations WHERE id = ?`).bind(k.reservation_id).first<{ status: string; date: string }>();
      if (st && MIRRORED.includes(st.status) && st.date < from) continue;
      try {
        calls++;
        const res = await call(e, 'DELETE', `${cal}/${k.event_id}`);
        if (res.status >= 300 && res.status !== 404 && res.status !== 410) throw new Error(`google ${res.status} ${res.body?.error?.message || ''}`.trim());
        await mark(k.reservation_id, k.event_id, 'deleted', null, null);
        out.deleted++;
      } catch (err) {
        out.errors++; out.ok = false;
        await d.prepare(`UPDATE calendar_sync SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE reservation_id = ?`).bind(String(err).slice(0, 300), nowIso(), k.reservation_id).run();
      }
    }
  };
  const job = (async () => {
    let n = 0;
    do { again = false; try { await pass(); } catch (err) { out.ok = false; out.errors++; console.log('gcal reconcile error', String(err)); } } while (again && ++n < 3);
  })();
  running = job;
  try { await job; } finally { running = null; }
  if (out.created || out.updated || out.deleted || out.errors) console.log('gcal', JSON.stringify(out));
  return out;
}

/** Read-only status for /booking-admin readiness (never shows a credential). */
export async function gcalStatus(e: GcalEnv) {
  const base = { configured: gcalConfigured(e), clientId: e.GCAL_CLIENT_ID ? 'set' : 'missing', clientSecret: e.GCAL_CLIENT_SECRET ? 'set' : 'missing',
    refreshToken: e.GCAL_REFRESH_TOKEN ? 'set' : 'missing', calendarId: e.GCAL_CALENDAR_ID ? (e.GCAL_CALENDAR_ID === 'primary' ? 'primary (refused: use the dedicated calendar)' : 'set') : 'missing' };
  if (!base.configured || !e.DB) return base;
  let access: string;
  try {
    const r = await call(e, 'GET', `/calendars/${encodeURIComponent(e.GCAL_CALENDAR_ID!)}/events?maxResults=1&singleEvents=true&timeMin=${encodeURIComponent(new Date().toISOString())}`);
    access = r.status === 200 ? 'ok' : `error ${r.status} ${r.body?.error?.message || ''}`.trim();
  } catch (err) { access = String(err).slice(0, 200); }
  await ensureTable(e.DB);
  const c = await e.DB.prepare(`SELECT state, COUNT(*) n, MAX(synced_at) last FROM calendar_sync GROUP BY state`).all<{ state: string; n: number; last: string }>();
  const errs = await e.DB.prepare(`SELECT r.ref, s.last_error, s.attempts FROM calendar_sync s JOIN reservations r ON r.id = s.reservation_id WHERE s.state = 'error' ORDER BY s.updated_at DESC LIMIT 5`).all();
  return { ...base, calendarAccess: access, events: Object.fromEntries(c.results.map((x) => [x.state, x.n])), lastSync: c.results.map((x) => x.last).filter(Boolean).sort().at(-1) || null, recentErrors: errs.results };
}
