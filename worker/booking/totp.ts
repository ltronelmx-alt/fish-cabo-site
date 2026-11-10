// /booking-admin two-factor authentication (owner, 2026-11-10): password + 6-digit code from Google Authenticator
// (TOTP, RFC 6238: SHA-1, 6 digits, 30 s — the defaults every authenticator app uses) or a single-use recovery code.
// The TOTP secret is generated here, shown ONCE to the signed-in owner (QR code + text key, never sent anywhere else)
// and kept in D1 (table admin_2fa, never returned by any API). Each code works once (replay refused).
// Emergency: if the phone and the recovery codes are both lost, set the Cloudflare variable ADMIN_2FA_DISABLED = "yes"
// (Worker fish-cabo → Settings → Variables), sign in with the password, disable/re-enable 2FA, then remove the variable.
import { renderSVG } from 'uqr';
import { nowIso, sha256Hex } from './util';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const b32encode = (b: Uint8Array) => { let bits = 0, v = 0, out = ''; for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(v << (5 - bits)) & 31]; return out; };
export const b32decode = (s: string) => { const c = s.toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, v = 0; const out: number[] = []; for (const ch of c) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); };

/** 6-digit TOTP for a 30-second step. */
export async function totpAt(secretB32: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b32decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8); let s = step; for (let i = 7; i >= 0; i--) { msg[i] = s & 255; s = Math.floor(s / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
/** Step of a valid code within ±1 step (phone clock drift), or null. */
export async function matchStep(secretB32: string, code: string, now = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const t = Math.floor(now / 30000);
  for (const s of [t, t - 1, t + 1]) if ((await totpAt(secretB32, s)) === code) return s;
  return null;
}

type Row = { secret: string | null; pending_secret: string | null; pending_at: string | null; enabled_at: string | null; last_step: number | null; recovery: string | null; epoch: string | null };
async function ensure(d: D1Database) {
  await d.prepare(`CREATE TABLE IF NOT EXISTS admin_2fa (id INTEGER PRIMARY KEY CHECK (id = 1), secret TEXT, pending_secret TEXT, pending_at TEXT,
    enabled_at TEXT, last_step INTEGER, recovery TEXT, epoch TEXT)`).run();
  await d.prepare(`INSERT OR IGNORE INTO admin_2fa (id, epoch) VALUES (1, '0')`).run();
}
export async function get2fa(d: D1Database): Promise<Row> { await ensure(d); return (await d.prepare(`SELECT * FROM admin_2fa WHERE id = 1`).first<Row>())!; }
export const enabled = (r: Row) => !!(r.secret && r.enabled_at);
/** Changes whenever 2FA is enabled or disabled → part of the session key, so every open session is signed out. */
export const epochOf = (r: Row) => r.epoch || '0';

/** Start (or restart) enrolment: new pending secret + QR code. Nothing changes for login until enable2fa() succeeds. */
export async function setup2fa(d: D1Database) {
  await ensure(d);
  const secret = b32encode(crypto.getRandomValues(new Uint8Array(20)));
  await d.prepare(`UPDATE admin_2fa SET pending_secret = ?, pending_at = ? WHERE id = 1`).bind(secret, nowIso()).run();
  const uri = `otpauth://totp/${encodeURIComponent('Exotic Fish Cabo')}:${encodeURIComponent('booking-admin')}?secret=${secret}&issuer=${encodeURIComponent('Exotic Fish Cabo')}&algorithm=SHA1&digits=6&period=30`;
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qrSvg: renderSVG(uri, { border: 2 }) };
}
const newRecovery = () => Array.from({ length: 10 }, () => { const b = crypto.getRandomValues(new Uint8Array(5)); return b32encode(b).slice(0, 8).replace(/(.{4})/, '$1-'); });
const hashCode = (c: string) => sha256Hex('efc-2fa-recovery|' + c.toUpperCase().replace(/[^A-Z2-7]/g, ''));

/** Confirm enrolment with a code from the app → 2FA on, 10 recovery codes returned ONCE (only their hashes are kept). */
export async function enable2fa(d: D1Database, code: string) {
  const r = await get2fa(d);
  if (!r.pending_secret || !r.pending_at || Date.now() - Date.parse(r.pending_at) > 15 * 60e3) return { ok: false, error: 'Setup expired. Click "Set up" again.' };
  const step = await matchStep(r.pending_secret, String(code || '').trim());
  if (step === null) return { ok: false, error: 'Wrong code. Check that you scanned the new QR code and that your phone shows the correct time.' };
  const codes = newRecovery();
  const hashes = await Promise.all(codes.map(hashCode));
  await d.prepare(`UPDATE admin_2fa SET secret = pending_secret, pending_secret = NULL, pending_at = NULL, enabled_at = ?, last_step = ?, recovery = ?, epoch = ? WHERE id = 1`)
    .bind(nowIso(), step, JSON.stringify(hashes), String(Date.now())).run();
  return { ok: true, recoveryCodes: codes };
}
/** Check a login code: authenticator code (each step usable once) or a recovery code (single use). */
export async function verifyLogin(d: D1Database, input: string): Promise<{ ok: boolean; via?: 'app' | 'recovery'; recoveryLeft?: number }> {
  const r = await get2fa(d);
  if (!enabled(r)) return { ok: true };
  const code = String(input || '').trim();
  const step = await matchStep(r.secret!, code.replace(/\s/g, ''));
  if (step !== null) {
    const ok = await d.prepare(`UPDATE admin_2fa SET last_step = ? WHERE id = 1 AND (last_step IS NULL OR last_step < ?) RETURNING id`).bind(step, step).first();
    return ok ? { ok: true, via: 'app' } : { ok: false };
  }
  if (/^[A-Za-z2-7]{4}-?[A-Za-z2-7]{4}$/.test(code)) {
    const h = await hashCode(code); const list: string[] = JSON.parse(r.recovery || '[]');
    if (list.includes(h)) {
      const rest = list.filter((x) => x !== h);
      const ok = await d.prepare(`UPDATE admin_2fa SET recovery = ? WHERE id = 1 AND recovery = ? RETURNING id`).bind(JSON.stringify(rest), r.recovery).first();
      return ok ? { ok: true, via: 'recovery', recoveryLeft: rest.length } : { ok: false };
    }
  }
  return { ok: false };
}
export async function disable2fa(d: D1Database) {
  await ensure(d);
  await d.prepare(`UPDATE admin_2fa SET secret = NULL, pending_secret = NULL, pending_at = NULL, enabled_at = NULL, last_step = NULL, recovery = NULL, epoch = ? WHERE id = 1`).bind(String(Date.now())).run();
}
export async function status2fa(d: D1Database) {
  const r = await get2fa(d);
  return { enabled: enabled(r), since: r.enabled_at, recoveryCodesLeft: enabled(r) ? JSON.parse(r.recovery || '[]').length : 0 };
}
