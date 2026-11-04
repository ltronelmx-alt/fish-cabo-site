// Local tests for /api/publish-notify (no email is sent: no RESEND_API_KEY locally → dry run).
// 1) node tests/notify.mjs keys   → prints the test JWKS to pass to wrangler dev (--var NOTIFY_TEST_JWKS:...)
// 2) node tests/notify.mjs [baseUrl]
import { generateKeyPairSync, createSign } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const KEYFILE = '/tmp/notify-test-key.json';
if (process.argv[2] === 'keys' || !existsSync(KEYFILE)) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  writeFileSync(KEYFILE, JSON.stringify({ pem: privateKey.export({ format: 'pem', type: 'pkcs8' }), jwks: { keys: [jwk] } }));
  if (process.argv[2] === 'keys') { console.log(JSON.stringify({ keys: [jwk] })); process.exit(0); }
}
const { pem } = JSON.parse(readFileSync(KEYFILE, 'utf8'));
const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:8787';
const b64u = (b) => Buffer.from(b).toString('base64url');
const jwt = (over = {}, kid = 'test-kid') => {
  const now = Math.floor(Date.now() / 1000);
  const c = { iss: 'https://token.actions.githubusercontent.com', aud: 'fish-cabo-publish-notify', exp: now + 300, nbf: now - 5, repository: 'ltronelmx-alt/fish-cabo-site', ref: 'refs/heads/main', workflow_ref: 'ltronelmx-alt/fish-cabo-site/.github/workflows/publish-notify.yml@refs/heads/main', sha: 'abc', event_name: 'push', ...over };
  const data = `${b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))}.${b64u(JSON.stringify(c))}`;
  return `${data}.${createSign('RSA-SHA256').update(data).sign(pem).toString('base64url')}`;
};
const info = JSON.parse(readFileSync('dist/deploy-info.json', 'utf8'));
const real = info.reports[0].slug;
const call = async (token, body, host) => {
  const r = await fetch(BASE + '/api/publish-notify', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(host ? { host } : {}) }, body: JSON.stringify(body) });
  return [r.status, await r.json()];
};
const res = [];
const t = (n, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`); };

let [s, j] = await call(jwt({ sha: info.commit }), { status: 'published', slugs: [real], commit: info.commit });
t('valid GitHub identity + live article → "published" email prepared', s === 200 && j.dryRun && j.to === 'contact@fish-cabo.com' && j.subject.startsWith('✅ Published:') && j.text.includes(`https://fish-cabo.com/fishing-reports/${real}`), j.subject);
[s, j] = await call(jwt(), { status: 'published', slugs: ['this-article-does-not-exist'] });
t('unknown / unpublished article → refused, no email', s === 409 && !j.dryRun, JSON.stringify(j));
[s, j] = await call(jwt({ repository: 'someone/else' }), { status: 'published', slugs: [real] });
t('token from another repository → 401', s === 401 && /repository/.test(j.detail));
[s, j] = await call(jwt({ ref: 'refs/heads/reviews-section' }), { status: 'published', slugs: [real] });
t('token from another branch → 401', s === 401);
[s, j] = await call(jwt({ workflow_ref: 'ltronelmx-alt/fish-cabo-site/.github/workflows/other.yml@refs/heads/main' }), { status: 'published', slugs: [real] });
t('token from another workflow → 401', s === 401 && /workflow/.test(j.detail));
[s, j] = await call(jwt({ aud: 'other' }), { status: 'published', slugs: [real] });
t('wrong audience → 401', s === 401);
[s, j] = await call(jwt({ exp: Math.floor(Date.now() / 1000) - 10 }), { status: 'published', slugs: [real] });
t('expired token → 401', s === 401);
const forged = jwt().split('.'); forged[1] = b64u(JSON.stringify({ ...JSON.parse(Buffer.from(forged[1], 'base64url')), repository: 'ltronelmx-alt/fish-cabo-site', sha: 'x' }));
[s, j] = await call(forged.join('.') + 'x', { status: 'published', slugs: [real] });
t('tampered signature → 401', s === 401);
[s, j] = await call('', { status: 'published', slugs: [real] });
t('no token → 401', s === 401);
[s, j] = await call(jwt(), { status: 'failed', slugs: [real], reason: 'Cloudflare did not deploy commit abc1234' });
t('failed deployment → "NOT published" alert, never a success email', s === 200 && j.subject.includes('NOT published') && !j.subject.includes('✅') && /NOT confirmed/.test(j.text));
[s, j] = await call(jwt(), { status: 'published', slugs: [real], test: true });
t('test run → subject marked [TEST]', s === 200 && j.subject.startsWith('[TEST]'));
[s, j] = await call(jwt(), { status: 'whatever', slugs: [real] });
t('unknown status → refused', s === 400);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
process.exit(res.every(Boolean) ? 0 : 1);
