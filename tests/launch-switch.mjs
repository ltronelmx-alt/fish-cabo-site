// PUBLIC LAUNCH SWITCH (src/data/launch.json). Builds the PRODUCTION site twice (switch off, then on — the file is
// restored afterwards), serves each with a production Worker (SITE_ENV=production) and checks that pages, links, legacy
// payment buttons, chat, sitemap and booking API all change TOGETHER. Also: a Stripe TEST key is refused in production,
// /booking-admin + readiness work before the launch, the Stripe webhook stays reachable.
// Usage: node tests/launch-switch.mjs   (takes a few minutes; leaves dist/ as a STAGING build)
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 8793, BASE = `http://127.0.0.1:${PORT}`, PASS = 'launch-test-pass', LAUNCH = 'src/data/launch.json';
const original = readFileSync(LAUNCH, 'utf8');
const results = []; let section = '';
const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${section} › ${name}${!ok && info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (f) => readFileSync(`dist/${f}`, 'utf8');
const count = (s, re) => (s.match(re) || []).length;

function build(open) {
  writeFileSync(LAUNCH, original.replace(/"PUBLIC_BOOKING_LAUNCHED":\s*(true|false)/, `"PUBLIC_BOOKING_LAUNCHED": ${open}`));
  execSync('npm run build:prod', { stdio: 'ignore' });
}
async function start(extra = []) {
  rmSync('/tmp/wp-launch', { recursive: true, force: true });
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', '/tmp/wp-launch', ...['ADMIN_PASSWORD:' + PASS, 'CONTACT_TO:owner@example.test', 'STRIPE_WEBHOOK_SECRET:whsec_launch_test', ...extra].flatMap((v) => ['--var', v])], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/')).ok) return p; } catch {} await sleep(1000); }
  throw new Error('wrangler dev did not start');
}
const stop = async (p) => { try { process.kill(-p.pid); } catch {} await sleep(1500); };
async function adminGet(path) {
  const r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-efc-admin': '1', origin: BASE }, body: JSON.stringify({ password: PASS }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return fetch(BASE + '/api/admin/' + path, { headers: { cookie } }).then((x) => x.json());
}
async function chatBookLink() {
  const b = await chromium.launch(); const p = await (await b.newContext({ locale: 'en-US' })).newPage();
  await p.goto(BASE + '/fishing-charters', { waitUntil: 'load' });
  await p.click('#efc-chat-bubble'); await p.waitForSelector('#efc-messages .efc-bot');
  const n = await p.locator('#efc-messages .efc-bot').count();
  await p.fill('#efc-input', 'how do I book?'); await p.press('#efc-input', 'Enter');
  await p.waitForFunction((k) => document.querySelectorAll('#efc-messages .efc-bot').length > k, n);
  const txt = await p.locator('#efc-messages .efc-bot').last().innerText();
  const hrefs = await p.locator('#efc-messages .efc-bot').last().locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  await b.close(); return { txt, hrefs };
}
const reserveForm = () => { const f = new FormData(); for (const [k, v] of Object.entries({ fname: 'L', lname: 'T', email: 'l@example.test', phone: '+1 555 010 0000', date: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), people: '2', duration: '6', boat: 'boat-03', payment: 'stripe', 'cf-turnstile-response': 'x' })) f.append(k, v); return f; };

try {
  // ---------------- switch OFF (state of production until the owner-authorised launch)
  section = 'Switch OFF (production)';
  build(false);
  const home = page('index.html'), boatsPage = page('fishing-boats.html'), panga = page('fishing-boats/23ft-panga.html'), cabo = page('cabo-fishing.html');
  t('no /book-now page in the production build, no /book-now in the sitemap', !existsSync('dist/book-now.html') && !existsSync('dist/book-now') && !page('sitemap.xml').includes('/book-now'));
  t('header BOOK NOW → /fishing-boats (as today)', count(home, /href="\/fishing-boats"[^>]*>BOOK NOW</g) === 2 && !/href="\/book-now/.test(home));
  t('FAQ "Book Now" on home and /cabo-fishing → /fishing-boats (as today)', /href="\/fishing-boats"[^>]*>Book Now</.test(home) && /href="\/fishing-boats"[^>]*>Book Now</.test(cabo));
  t('no BOOK THIS BOAT anywhere, no link to /book-now on any page', !boatsPage.includes('BOOK THIS BOAT') && !panga.includes('BOOK THIS BOAT') && !execSync("grep -rl 'href=\"/book-now' dist --include=*.html || true").toString().trim());
  t('original direct-payment buttons still on the boat pages (Stripe + Wise)', /buy\.stripe\.com/.test(panga) && /wise\.com\/pay\/me\/loict92/.test(panga));
  t('pages say booking is closed (<html data-booking="closed">)', /<html[^>]*data-booking="closed"/.test(home));
  t('entry prices untouched (home: From $350 ×5, From $600 ×1, $600USD ×1)', count(home, /From \$350/g) === 5 && count(home, /From \$600/g) === 1 && count(home, /\$600USD/g) === 1);
  let w = await start();
  const api = await fetch(BASE + '/api/booking/boats');
  t('public booking API closed (503) on the production Worker', api.status === 503);
  t('/book-now answers 404', (await fetch(BASE + '/book-now')).status === 404);
  t('Stripe webhook still reachable and signature-checked (unsigned → 400, not 503)', (await fetch(BASE + '/api/stripe/webhook', { method: 'POST', body: '{}' })).status === 400);
  const rd = (await adminGet('readiness')).readiness || {};
  t('/booking-admin works before the launch; readiness: database initialised (tables + unique indexes)', rd.database?.tablesAndIndexesOk === true && rd.productionRules === true && rd.publicBookingOpen === false, JSON.stringify(rd.database));
  t('readiness: the 3 manual bookings are blocked, once each', JSON.stringify(rd.database?.manualBlocks) === JSON.stringify(['Boat #2 2026-11-26', 'Boat #4 2026-12-15', 'Boat #6 2027-01-19']));
  t('readiness: 19 prices exactly as approved, 6 % card fee, 24 h Wise hold', rd.prices?.length === 19 && rd.prices.includes('#1 6h $350 (deposit $100)') && rd.prices.includes('#10 8h $5000 (deposit $1000)') && !rd.prices.some((x) => x.startsWith('#1 8h')) && rd.settings?.stripe_fee_pct === 6 && rd.settings?.wise_hold_hours === 24);
  t('readiness never returns a secret value', !JSON.stringify(rd).includes(PASS) && rd.ADMIN_PASSWORD === 'set');
  const ch = await chatBookLink();
  t('chat (switch off): booking answer as today, book button → /contact, no /book-now', !ch.hrefs.includes('/book-now') && ch.hrefs.includes('/contact') && /Choose your date/.test(ch.txt), JSON.stringify(ch));
  await stop(w);

  // a Stripe TEST key on a production Worker never opens a test checkout for a customer
  section = 'Stripe test key in production';
  build(true);
  w = await start(['STRIPE_SECRET_KEY:sk_test_never_in_production', 'STRIPE_API_BASE:http://127.0.0.1:9']);
  const rs = await fetch(BASE + '/api/booking/reserve', { method: 'POST', headers: { origin: BASE }, body: reserveForm() });
  t('production + sk_test key → card payment refused (Turnstile/availability first, never a test checkout)', rs.status === 403 || rs.status === 503);
  const rd2 = (await adminGet('readiness')).readiness || {};
  t('readiness reports the test key as BLOCKED in production', rd2.stripe?.keyType === 'sk_test' && rd2.stripe?.mode === 'blocked', JSON.stringify(rd2.stripe));
  await stop(w);

  // ---------------- switch ON (one commit at the launch)
  section = 'Switch ON (production)';
  const homeOn = page('index.html'), boatsOn = page('fishing-boats.html'), pangaOn = page('fishing-boats/23ft-panga.html'), caboOn = page('cabo-fishing.html');
  t('/book-now page built and in the sitemap', existsSync('dist/book-now.html') && page('sitemap.xml').includes('<loc>https://fish-cabo.com/book-now</loc>'));
  t('header BOOK NOW + FAQ Book Now → /book-now', count(homeOn, /href="\/book-now"[^>]*>BOOK NOW</g) === 2 && /href="\/book-now"[^>]*>Book Now</.test(homeOn) && /href="\/book-now"[^>]*>Book Now</.test(caboOn));
  t('BOOK THIS BOAT with preselection on the fleet page (10) and each boat page', new Set([...boatsOn.matchAll(/href="\/book-now\?boat=(boat-\d\d)"/g)].map((m) => m[1])).size === 10 && /href="\/book-now\?boat=boat-01"/.test(pangaOn));
  t('NO old direct-payment link left on any page (Stripe Payment Links, Wise, PayPal)', !execSync("grep -rlE 'buy\\.stripe\\.com|wise\\.com/pay|paypal\\.' dist --include=*.html || true").toString().trim());
  t('pages say booking is open', /<html[^>]*data-booking="open"/.test(homeOn));
  t('entry prices untouched', count(homeOn, /From \$350/g) === 5 && count(homeOn, /From \$600/g) === 1 && count(homeOn, /\$600USD/g) === 1);
  w = await start();
  t('public booking API open (no Stripe key here → boats list answers)', (await fetch(BASE + '/api/booking/boats')).status === 200);
  t('/book-now answers 200', (await fetch(BASE + '/book-now')).status === 200);
  const rs3 = await fetch(BASE + '/api/booking/reserve', { method: 'POST', headers: { origin: BASE }, body: reserveForm() });
  t('production Worker: Turnstile enforced (no secret → refused), no test relaxation', rs3.status === 403);
  const ch2 = await chatBookLink();
  t('chat (switch on): book button → /book-now', ch2.hrefs.includes('/book-now'), JSON.stringify(ch2));
  await stop(w);
} finally {
  writeFileSync(LAUNCH, original);
  execSync('npm run build', { stdio: 'ignore' }); // leave a staging build behind
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
