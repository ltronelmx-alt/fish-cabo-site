// Chat assistant connected to the booking system (2026-11-27). Same chat (look, place, rules); concrete booking questions
// are answered from /api/booking/assist (availability, price, alternatives, prefilled /book-now links). No booking is created.
// Usage: node tests/chat-assist.mjs [baseUrl]  (wrangler dev on a fresh local D1; boat-05 blocked on 2026-12-12 by the test)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PERSIST = process.env.PERSIST || '/tmp/wpa';
const sql = (q) => { try { return JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fish-cabo-bookings', '--local', '--persist-to', PERSIST, '--json', '--command', q], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results; } catch { return null; } };
let pass = 0, fail = 0; const errors = [];
const rec = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + info}`); ok ? pass++ : fail++; };
const b = await chromium.launch();
async function page(locale = 'en-US') { const ctx = await b.newContext({ locale }); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(BASE + '/fishing-charters', { waitUntil: 'load' }); await p.click('#efc-chat-bubble'); await p.waitForSelector('#efc-messages .efc-bot'); return p; }
async function ask(p, q) { const n = await p.locator('#efc-messages .efc-bot').count(); await p.fill('#efc-input', q); await p.press('#efc-input', 'Enter'); await p.waitForFunction((k) => document.querySelectorAll('#efc-messages .efc-bot').length > k, n, { timeout: 12000 }); const last = p.locator('#efc-messages .efc-bot').last(); return { text: await last.innerText(), links: await last.locator('a').evaluateAll((a) => a.map((x) => x.getAttribute('href'))) }; }
sql('DELETE FROM rate_limits');
const before = sql('SELECT COUNT(*) n FROM reservations')?.[0]?.n;
sql(`INSERT OR IGNORE INTO blocked_dates (boat_id, date, reason, created_at) VALUES ('boat-05', '2026-12-12', 'test', '2026-11-27')`);

{ const p = await page('fr-FR');
  const r = await ask(p, 'On est quatre, le 20 décembre, pour huit heures');
  rec('FR natural request → available boats from the booking system, prefilled /book-now links (boat, date, hours, people)', /Disponibles le dimanche 20 décembre 2026, 8 h, 4 personnes/.test(r.text) && r.links.some((h) => /^\/book-now\?boat=boat-0\d&date=2026-12-20&hours=8&people=4$/.test(h)) && !/\$\d/.test(r.text), r.text.slice(0, 200));
  rec('…recommendations fit the group (no boat under 4 people)', !/jusqu'à [123] /.test(r.text), r.text);
  const r2 = await ask(p, 'Et le bateau 4 c\'est combien ?');
  rec('follow-up keeps the context → Boat #4 available + exact price from D1 (800 USD, deposit 200, balance 600)', /Le bateau #4 .* disponible le dimanche 20 décembre 2026/.test(r2.text) && /800 USD/.test(r2.text) && /200 USD/.test(r2.text) && /600 USD/.test(r2.text) && r2.links.includes('/book-now?boat=boat-04&date=2026-12-20&hours=8&people=4'), r2.text.slice(0, 260));
  rec('…never says the booking is confirmed', /n'est confirmée qu'une fois l'acompte reçu et vérifié/.test(r2.text) && !/confirmée\s*[!.]/.test(r2.text.replace(/n'est confirmée qu'une fois/, '')), r2.text);
  await p.click('#btn-en'); await p.waitForTimeout(300);
  const t = await p.locator('#efc-messages .efc-bot').last().innerText();
  rec('language switch re-renders the live answer in English (same bubble)', /Boat #4 .* is available on Sunday, December 20, 2026/.test(t), t.slice(0, 160));
  const wa = await p.locator('#efc-messages a.efc-wa').last().getAttribute('href');
  rec('WhatsApp button carries the understood request (date, 8 hours, 4 guests)', /2026-12-20/.test(decodeURIComponent(wa)) && /8/.test(decodeURIComponent(wa)) && /4/.test(decodeURIComponent(wa)), decodeURIComponent(wa));
  await p.context().close(); }

{ const p = await page('en-US');
  const r = await ask(p, 'We are 4, December 12, full day. Is boat 5 available?');
  rec('EN: requested boat taken → not available + other boats the same day (same duration, fit 4)', /Boat #5 is not available online on Saturday, December 12, 2026/.test(r.text) && /Available on Saturday, December 12, 2026, 8 hours, 4 people/.test(r.text) && !r.links.some((h) => /boat-05/.test(h)) && r.links.some((h) => /date=2026-12-12&hours=8&people=4/.test(h)), r.text.slice(0, 260));
  const r2 = await ask(p, 'what about the 05/12?');
  rec('ambiguous numeric date → clarification question with both dates', /December 5, 2026 or .*May 12, 2027/.test(r2.text), r2.text);
  const r3 = await ask(p, 'We want to fish in the Bisbee tournament');
  rec('tournament → hand-off to the team (WhatsApp)', /arranged directly with our team/.test(r3.text) && r3.links.some((h) => /wa\.me\/526241223506/.test(h)), r3.text);
  const r4 = await ask(p, 'What fish can we catch?');
  rec('general FAQ keeps the chat\'s own answer (unchanged)', /Main Targets/.test(r4.text), r4.text.slice(0, 80));
  const r5 = await ask(p, 'Hi, how much does a fishing trip cost?');
  rec('general price question keeps the chat\'s own answer (From 350 USD)', /350 USD/.test(r5.text), r5.text.slice(0, 80));
  await p.context().close(); }

{ const p = await page('es-MX');
  const r = await ask(p, 'somos 3, mañana, seis horas');
  rec('ES: tomorrow (< 24 h) → last-minute hand-off, nothing booked online', /menos de 24 horas/.test(r.text) && r.links.some((h) => /wa\.me/.test(h)), r.text);
  const r2 = await ask(p, '¿Cuál es el estado de mi reserva EFC-ABC123?');
  rec('booking status → no data in the chat, private link / team', /enlace privado/.test(r2.text), r2.text);
  await p.context().close(); }

{ const p = await page('en-US'); await p.route('**/api/booking/assist', (r) => r.abort());
  const r = await ask(p, 'We are 4 on December 20 for 8 hours, what is available?');
  rec('booking system unreachable → the chat answers exactly as before (booking answer + buttons), no error', /To book your charter|book/i.test(r.text) && r.links.length > 0, r.text.slice(0, 120));
  await p.context().close(); }

const after = sql('SELECT COUNT(*) n FROM reservations')?.[0]?.n;
rec('no reservation, hold or payment created by the chat', before === after, `${before} → ${after}`);
rec('no JavaScript error', !errors.length, errors.join(' | '));
console.log(`\n${pass}/${pass + fail} passed`); await b.close(); process.exit(fail ? 1 : 0);
