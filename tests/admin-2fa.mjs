// /booking-admin two-factor authentication (Google Authenticator) — real browser + API, wrangler dev :8787 (staging vars).
// The test computes codes like the phone app would (RFC 6238, SHA-1, 6 digits, 30 s). Usage: PERSIST=/tmp/wpX node tests/admin-2fa.mjs
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = 'http://127.0.0.1:8787', PASS = 'test-admin-pass', PERSIST = process.env.PERSIST || '/tmp/wpb';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const clearRL = () => { try { sql('DELETE FROM rate_limits'); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = []; for (const c of s.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, step = Math.floor(Date.now() / 30000)) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const nextStep = async () => { const ms = 30000 - (Date.now() % 30000) + 300; await sleep(ms); };
const login = async (password, code) => { const r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-efc-admin': '1' }, body: JSON.stringify({ password, code }) }); return [r.status, await r.json(), (r.headers.get('set-cookie') || '').split(';')[0]]; };
const get = async (p, cookie) => { const r = await fetch(BASE + '/api/admin/' + p, { headers: { cookie } }); return [r.status, await r.json().catch(() => ({}))]; };
clearRL();
try { sql(`UPDATE admin_2fa SET secret = NULL, enabled_at = NULL, recovery = NULL WHERE id = 1`); } catch {}

const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(BASE + '/booking-admin'); await p.fill('#pw', PASS); await p.click('#lf button'); await p.waitForSelector('#nav:not(.hide)');
t('2FA off: sign-in with the password only (as today)', await p.locator('#nav').isVisible() && !(await p.locator('#cl').isVisible()));
const oldCookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
await p.evaluate(() => tab('settings')); await p.waitForSelector('#tfs');
t('Settings: "Two-factor authentication — OFF" + "Set up Google Authenticator"', (await p.locator('#tfa').innerText()).includes('OFF'));
await p.click('#tfs'); await p.waitForSelector('#tfa svg');
const secret = (await p.locator('#tfa code').innerText()).trim();
t('setup: QR code (inline SVG, no external service) + manual key shown', (await p.locator('#tfa svg').count()) === 1 && /^[A-Z2-7 ]{32,}$/.test(secret) && !(await p.content()).includes('chart.googleapis') );
await p.fill('#tfec', '000000'); await p.click('#tfe button'); await sleep(400);
t('wrong confirmation code → refused, 2FA still off', /Wrong code/.test(await p.locator('#tfam').innerText()) && (await get('2fa-status', oldCookie))[1].enabled === false);
await p.fill('#tfec', totp(secret)); await p.click('#tfe button'); await p.waitForSelector('#rc:not(.hide)');
const codes = (await p.locator('#rcl').innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
t('confirmed → "Two-factor authentication is ON", 10 recovery codes shown once', codes.length === 10 && codes.every((c) => /^[A-Z2-7]{4}-[A-Z2-7]{4}$/.test(c)) && new Set(codes).size === 10);
const [os] = await get('overview', oldCookie);
t('every open session is signed out when 2FA is turned on (old cookie → 401)', os === 401);
const row = sql(`SELECT secret, recovery FROM admin_2fa WHERE id = 1`)[0];
t('recovery codes stored only as hashes; secret never returned by the status/readiness APIs', !codes.some((c) => (row.recovery || '').includes(c.replace('-', ''))) && !JSON.stringify((await get('2fa-status', ''))[1]).includes(secret.replace(/\s/g, '')));
await p.click('#rcok'); await p.waitForSelector('#login:not(.hide)');
// password only → asks for the code, no session
clearRL();
await p.fill('#pw', PASS); await p.click('#lf button'); await p.waitForSelector('#cl:not(.hide)');
t('password only → code field appears, not signed in', (await p.locator('#tc').isVisible()) && !(await p.locator('#nav').isVisible()) && /6-digit code/.test(await p.locator('#lmsg').innerText()));
await p.fill('#tc', '123456'); await p.click('#lf button'); await sleep(400);
t('wrong code → refused', !(await p.locator('#nav').isVisible()) && /Wrong or already used/.test(await p.locator('#lmsg').innerText()));
await nextStep(); const c1 = totp(secret);
await p.fill('#tc', c1); await p.click('#lf button'); await p.waitForSelector('#nav:not(.hide)');
t('correct code (password kept in memory, not re-typed) → signed in', await p.locator('#nav').isVisible());
const [rs, rj] = await login(PASS, c1);
t('the same code cannot be used twice (replay refused)', rs === 401 && rj.need2fa === true);
const [ws] = await login('wrong-password', totp(secret));
t('wrong password + valid code → refused', ws === 401);
const [ns, nj] = await login(PASS, '');
t('API: password without code → 401 need2fa, no cookie', ns === 401 && nj.need2fa === true);
clearRL();
const [s1, , ck1] = await login(PASS, codes[0]);
const [s2] = await login(PASS, codes[0]);
const st = (await get('2fa-status', ck1))[1];
t('recovery code works once, then refused; 9 left', s1 === 200 && s2 === 401 && st.recoveryCodesLeft === 9, JSON.stringify(st));
const audit = sql(`SELECT action FROM audit_log WHERE action LIKE '%2fa%' OR action = 'login' ORDER BY id DESC LIMIT 12`).map((x) => x.action);
t('audit log: 2fa_enabled, login_2fa_failed, logins', audit.includes('2fa_enabled') && audit.includes('login_2fa_failed') && audit.includes('login'));
// readiness shows the status
const rd = (await get('readiness', ck1))[1];
t('Launch readiness: twoFactor.enabled = true, no secret value', rd.readiness?.twoFactor?.enabled === true && !JSON.stringify(rd).includes(secret.replace(/\s/g, '')));
// mobile login
const m = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); clearRL();
await m.goto(BASE + '/booking-admin'); await m.fill('#pw', PASS); await m.click('#lf button'); await m.waitForSelector('#cl:not(.hide)');
await nextStep(); await m.fill('#tc', totp(secret)); await m.click('#lf button'); await m.waitForSelector('#nav:not(.hide)');
t('mobile (Pixel 7): password + code sign-in works, numeric keypad field', await m.locator('#nav').isVisible() && (await m.locator('#tc').getAttribute('inputmode')) === 'numeric');
// turn off (needs a current code)
await p.evaluate(() => tab('settings')); await p.waitForSelector('#tfd');
p.once('dialog', (dl) => dl.accept());
await p.fill('#tfdc', '000000'); await p.click('#tfd button'); await sleep(400);
const still = (await get('2fa-status', ck1))[1].enabled;
await nextStep(); p.once('dialog', (dl) => dl.accept());
await p.fill('#tfdc', totp(secret)); await p.click('#tfd button'); await p.waitForSelector('#login:not(.hide)');
clearRL();
const [os2] = await login(PASS, '');
t('turn off: refused without a valid code; with a code → off, signed out, password-only again', still === true && os2 === 200);
t('no JavaScript error', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
