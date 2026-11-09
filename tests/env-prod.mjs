// Pre-launch audit B2 (integration): a Worker configured as PRODUCTION (SITE_ENV=production, the top-level var of
// wrangler.jsonc) keeps production rules even when it is reached through another hostname; a STAGING Worker keeps
// working. Starts its own `wrangler dev` twice (needs `npm run build` first). Usage: node tests/env-prod.mjs
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const PORT = 8792, BASE = `http://127.0.0.1:${PORT}`, PASS = 'env-test-pass';
const results = []; const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start(extraVars, upstream = true) {
  rmSync('/tmp/wp-env', { recursive: true, force: true });
  const args = ['wrangler', 'dev', '--port', String(PORT), '--persist-to', '/tmp/wp-env', ...(upstream ? ['--local-upstream', 'fish-cabo.small-boat-4235.workers.dev'] : []),
    '--var', `ADMIN_PASSWORD:${PASS}`, '--var', 'CONTACT_TO:owner@example.test', ...extraVars.flatMap((v) => ['--var', v])];
  const p = spawn('npx', args, { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/booking/boats')).ok) return p; } catch {} await sleep(1000); }
  throw new Error('wrangler dev did not start');
}
const stop = async (p) => { try { process.kill(-p.pid); } catch {} await sleep(1500); };
async function login() {
  const r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE }, body: JSON.stringify({ password: PASS }) });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const adminPost = (cookie, path) => fetch(BASE + '/api/admin/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE, cookie }, body: '{}' });
const day = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
function reserveForm() {
  const f = new FormData();
  for (const [k, v] of Object.entries({ fname: 'Env', lname: 'Test', email: 'env@example.test', phone: '+1 555 010 0000', date: day(60), people: '2', duration: '6', boat: 'boat-03', payment: 'wise', message: 'env test', 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' })) f.append(k, v);
  return f;
}
const reserve = () => fetch(BASE + '/api/booking/reserve', { method: 'POST', headers: { origin: BASE }, body: reserveForm() }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);

// 1) PRODUCTION Worker (no SITE_ENV override → "production" from wrangler.jsonc), reached on a non-production hostname
let p = await start([]);
t('production Worker: /api/booking/config-check → 404 on a non-production hostname', (await fetch(BASE + '/api/booking/config-check')).status === 404);
let cookie = await login();
t('production Worker: admin login still works', cookie.startsWith('efc_admin='));
t('production Worker: staging-only "run hourly job" → 404 even for the signed-in admin', (await adminPost(cookie, 'run-hourly-job')).status === 404);
let [s, j] = await reserve();
t('production Worker: Turnstile NOT bypassed (no secret configured → booking refused)', s === 403 && /Verification failed/.test(j.error || ''), JSON.stringify([s, j]));
const cf = new FormData(); for (const [k, v] of Object.entries({ firstName: 'A', lastName: 'B', email: 'a@example.test', phone: '1', 'people-aboard-10-max': '2', duration: '6', boats: 'x', message: 'm', date: day(30), 'cf-turnstile-response': 'x' })) cf.append(k, v);
const cr = await fetch(BASE + '/api/contact', { method: 'POST', body: cf }); const cj = await cr.json().catch(() => ({}));
t('production Worker: contact form never answers "test mode" and exposes no Turnstile debug codes', cj.test !== true && !('codes' in cj), JSON.stringify([cr.status, cj]));
await stop(p);

// 2) STAGING Worker (SITE_ENV=staging, as in previews.vars): diagnostics + test relaxations still work
p = await start(['SITE_ENV:staging', 'SITE_URL:http://127.0.0.1:8792']);
const cc = await fetch(BASE + '/api/booking/config-check'); const ccj = await cc.json().catch(() => ({}));
t('staging Worker: config-check available, reports the staging admin link, no secret values', cc.status === 200 && ccj.ADMIN_LINK_IN_OWNER_EMAILS === 'http://127.0.0.1:8792/booking-admin' && ccj.ADMIN_PASSWORD === 'set' && !JSON.stringify(ccj).includes(PASS), JSON.stringify(ccj));
cookie = await login();
const rj = await adminPost(cookie, 'run-hourly-job');
t('staging Worker: "run hourly job" available to the signed-in admin', rj.status === 200);
await stop(p);
// 3) STAGING Worker on the local host: the booking itself still works end to end
p = await start(['SITE_ENV:staging', 'SITE_URL:http://127.0.0.1:8792'], false);
[s, j] = await reserve();
t('staging Worker (local): booking works', s === 200 && j.ok, JSON.stringify([s, j]));
await stop(p);

try { execFileSync('pkill', ['-f', `port ${PORT}`]); } catch {}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
