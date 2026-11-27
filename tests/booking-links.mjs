import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const U = process.argv[2] || 'http://127.0.0.1:8787'; // needs boat-03 blocked on 2026-12-14 and boat-09 on 2026-12-15 (test data)
const b = await chromium.launch(); const results = [];
const MOBILE = process.env.MOBILE === '1'; const newPage = () => (MOBILE ? b.newPage({ ...devices['Pixel 7'] }) : b.newPage());
async function run(name, qs, check) {
  const p = await newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U + '/book-now' + qs); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({
    boat: document.querySelector('input[name=boat]:checked')?.value || '',
    dur: document.querySelector('input[name=duration]:checked')?.value || '',
    date: document.querySelector('input[name=date]').value, people: document.querySelector('select[name=people]').value,
    lmsg: document.getElementById('lmsg').hidden ? '' : document.getElementById('lmsg').textContent,
    price: !document.getElementById('s-price').hidden, booked: !document.getElementById('booked').hidden,
    balts: document.getElementById('balts').hidden ? '' : document.getElementById('balts').textContent.replace(/\s+/g, ' ').slice(0, 200),
    lalts: document.getElementById('lalts').hidden ? '' : document.getElementById('lalts').textContent.replace(/\s+/g, ' ').slice(0, 200),
    help: document.querySelector('a[data-track="booking_help_whatsapp"]').href,
    holds: 0 }));
  const ok = check(st) && !errs.length; results.push({ name, ok, st, errs }); await p.close();
}
await run('boat only', '?boat=boat-03', (s) => s.boat === 'boat-03' && !s.dur && !s.lmsg);
await run('short boat', '?boat=3', (s) => s.boat === 'boat-03');
await run('full link available', '?boat=boat-04&date=2026-12-14&hours=8&people=4', (s) => s.boat === 'boat-04' && s.dur === '8' && s.date === '2026-12-14' && s.people === '4' && s.price && !s.lmsg && s.help.includes('Boat%20%234'));
await run('duration alias', '?boat=boat-04&date=2026-12-14&duration=6', (s) => s.dur === '6' && s.price);
await run('boat 1 + 8h', '?boat=1&date=2026-12-14&hours=8&people=2', (s) => s.boat === 'boat-01' && /6-hour trips only/.test(s.lmsg) && s.people === '2');
await run('too many people', '?boat=boat-03&date=2026-12-14&hours=8&people=9', (s) => /up to 4 people/.test(s.lmsg) && s.dur === '8');
await run('bad values kept valid', '?boat=boat-04&date=2026-02-30&hours=7&people=4', (s) => s.boat === 'boat-04' && s.people === '4' && /date in your link/.test(s.lmsg) && /6 or 8 hours/.test(s.lmsg));
await run('past date', '?boat=boat-04&date=2026-11-01&hours=8', (s) => /already passed/.test(s.lmsg) && s.dur === '8');
await run('blocked → other boats', '?boat=boat-03&date=2026-12-14&hours=8&people=4', (s) => s.booked && /Boat #4/.test(s.balts) && !/Boat #3 ·/.test(s.balts));
await run('blocked, no people → asks', '?boat=boat-03&date=2026-12-14&hours=8', (s) => s.booked && /How many people/.test(s.balts));
await run('nothing for 10 → next dates', '?boat=boat-09&date=2026-12-15&hours=8&people=10', (s) => s.booked && /December 1[6-9]|December 2/.test(s.balts));
await run('no boat in link', '?date=2026-12-14&hours=8&people=4', (s) => /Boat #4/.test(s.lalts) && !s.boat);
await run('unknown boat', '?boat=boat-77&date=2026-12-14&hours=8', (s) => /cannot be booked online/.test(s.lmsg) && /Boat #/.test(s.lalts));
await run('contact params ignored', '?boat=boat-04&email=x@y.z&fname=Evil', (s) => s.boat === 'boat-04');
for (const r of results) console.log(r.ok ? 'PASS' : 'FAIL', r.name, r.ok ? '' : JSON.stringify(r.st) + r.errs.join(';'));
// click another boat from the alternatives keeps the selection
const p = await newPage(); await p.goto(U + '/book-now?boat=boat-03&date=2026-12-14&hours=8&people=4'); await p.waitForTimeout(2500);
await p.click('#balts [data-ob="boat-05"]'); await p.waitForTimeout(2500);
console.log('switch boat:', await p.evaluate(() => [document.querySelector('input[name=boat]:checked').value, document.querySelector('input[name=duration]:checked')?.value, document.querySelector('input[name=date]').value, document.querySelector('select[name=people]').value, !document.getElementById('quote').hidden, document.querySelector('.bk-total')?.textContent].join(' | ')));
const p2 = await newPage(); await p2.goto(U + '/book-now?boat=boat-03&date=2026-12-14&hours=8'); await p2.waitForTimeout(2500);
await p2.selectOption('#balts [data-altp]', '6'); await p2.click('#balts [data-altgo]'); await p2.waitForTimeout(1500);
console.log('ask people → ', await p2.evaluate(() => document.getElementById('balts').textContent.replace(/\s+/g, ' ').slice(0, 160)));
// search failure (options API down): the customer still has REQUEST AVAILABILITY (WhatsApp with the request) + other dates
{ const p3 = await newPage(); await p3.route('**/api/booking/options*', (r) => r.abort());
  await p3.goto(U + '/book-now?boat=boat-03&date=2026-12-14&hours=8&people=4'); await p3.waitForTimeout(2500);
  const st = await p3.evaluate(() => ({ booked: !document.getElementById('booked').hidden, req: document.getElementById('req').href, help: document.querySelector('#s-date a[data-track="booking_help_whatsapp"]').href }));
  const ok = st.booked && /wa\.me\/526241223506\?text=.*Boat%20%233.*December%2014.*8%20hours/.test(st.req) && /wa\.me/.test(st.help);
  console.log(ok ? 'PASS' : 'FAIL', 'options API failure → REQUEST AVAILABILITY WhatsApp with boat/date/duration still offered', ok ? '' : JSON.stringify(st)); }
// a link copied from the admin tool opens the right selection
if (process.env.ADMIN_PW) {
  const ctx = await b.newContext(); const pa = await ctx.newPage(); await pa.goto(U + '/booking-admin'); await pa.fill('#pw', process.env.ADMIN_PW); await pa.click('#lf button'); await pa.waitForTimeout(1500);
  await pa.click('nav button[data-t=find]'); await pa.fill('#ff2 input[name=date]', '2026-12-14'); await pa.fill('#ff2 input[name=people]', '4'); await pa.selectOption('#fpb', 'boat-03'); await pa.click('#ff2 button'); await pa.waitForTimeout(1500);
  const link = await pa.locator('#fres [data-copy]').first().getAttribute('data-copy');
  const pp = await ctx.newPage(); await pp.goto(link); await pp.waitForTimeout(2500);
  const st = await pp.evaluate(() => [document.querySelector('input[name=boat]:checked')?.value, document.querySelector('input[name=duration]:checked')?.value, document.querySelector('input[name=date]').value, document.querySelector('select[name=people]').value, !document.getElementById('s-price').hidden].join('|'));
  const u = new URL(link); const ok = st === `${u.searchParams.get('boat')}|8|2026-12-14|4|true` && !/email|phone|name/.test(link);
  console.log(ok ? 'PASS' : 'FAIL', 'admin "Copy link" opens the same selection in /book-now (no customer data in the link)', link, st); await ctx.close(); }
await b.close();
