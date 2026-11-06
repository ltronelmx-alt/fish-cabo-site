// Small helpers shared by the booking engine (no dependencies).
export const nowIso = () => new Date().toISOString();

export const json = (o: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...extra },
  });

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function randomCode(n: number) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => ALPH[x % ALPH.length]).join('');
}
export const newRef = () => `EFC-${randomCode(6)}`;
export const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, '0')).join('');
export const newId = () => crypto.randomUUID();

const enc = new TextEncoder();
export async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function sha256Hex(msg: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(msg));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** constant-time string comparison */
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const usd = (n: number) => `$${n.toLocaleString('en-US')} USD`;
export const usdCents = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
export const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Fixed-window rate limit stored in D1 (fine for low traffic). Returns true when allowed. */
export async function rateLimit(db: D1Database, key: string, max: number, windowSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(
    `INSERT INTO rate_limits (k, n, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE n + 1 END,
       window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
     RETURNING n`,
  ).bind(key, now, windowSec).first<{ n: number }>();
  return (row?.n ?? 1) <= max;
}

/** Business timezone (owner, 2026-11-06): America/Mazatlan — used for every fishing date and daily availability.
 * Computed with the IANA database (Intl), never a hard-coded offset, so a future rule change is picked up automatically. */
export const TZ = 'America/Mazatlan';
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
/** minutes to add to UTC to get local wall time at instant ts */
export function tzOffsetMin(ts: number) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60000);
}
export function localToday(ts = Date.now()): string {
  return new Date(ts + tzOffsetMin(ts) * 60000).toISOString().slice(0, 10);
}
/** UTC timestamp (ms) of `date` at `hour`:00 local (America/Mazatlan) time */
export function localTs(date: string, hour: number) {
  const guess = Date.parse(`${date}T00:00:00Z`) + hour * 3600e3;
  let t = guess - tzOffsetMin(guess) * 60000;
  t = guess - tzOffsetMin(t) * 60000;
  return t;
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
/** "Saturday, November 7, 2026, 7:00 AM (Los Cabos time)" */
export const localDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Los Cabos time)';
