// Owner 2026-11-10: FAQ booking answer → /book-now for every guest; Boat #10 shown as "37ft Offshore Catamaran" in booking UIs.
// Usage: node tests/faq-boat10.mjs [base]   (wrangler dev on :8787; production build of the previous commit in /tmp/base/dist for SEO comparison)
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const NAME = '37ft Offshore Catamaran', OLD = /ultimate fishing machine/i;

// ---------- FAQ (static HTML = what crawlers see) ----------
const faq = await (await fetch(BASE + '/cabo-fishing-faq')).text();
const i = faq.indexOf('<h4>How do we book a fishing charter?</h4>'); const ans = faq.slice(i, faq.indexOf('<h4>', i + 10));
const txt = ans.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('FAQ: question kept, answer sends every guest to /book-now with a crawlable link', i > 0 && /<a href="\/book-now">Book Now<\/a>/.test(ans) && /All reservations are completed online/.test(txt) && /every guest, including guests who have already contacted Exotic Fish Cabo through WhatsApp, email, or the contact form/.test(txt));
t('FAQ: deposit paid on /book-now; contacting us does not confirm; confirmed only once the deposit is received and verified', /pay your deposit/.test(txt) && /Contacting us does not confirm a reservation/.test(txt) && /confirmed only once your deposit has been successfully received and verified/.test(txt));
t('FAQ: acknowledgment, then the owner personally sends the official confirmation (departure time, meeting point, marina directions)', /You then receive an acknowledgment, and the owner personally sends your complete official booking confirmation, including your departure time, meeting point, and marina directions/.test(txt));
t('FAQ: WhatsApp and contact form still offered for questions/help, contact link kept', /WhatsApp and our contact form remain available for any questions, help with your booking, or to discuss your fishing trip/.test(txt) && /href="https:\/\/fish-cabo\.com\/contact">Contact Exotic Fish Cabo<\/a>/.test(ans));
t('FAQ: old instruction gone ("You can contact … through WhatsApp, phone, email…", "We\'ll … confirm availability, pricing")', !/You can contact Exotic Fish Cabo through WhatsApp, phone, email/.test(faq) && !/confirm availability, pricing, and booking details/.test(faq));
t('FAQ: no email address, no mailto link on the page', !/mailto:/i.test(faq) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(faq.replace(/<script[\s\S]*?<\/script>/g, '')));
// ---------- SEO: head / H1 / structured data identical to the production build of the previous commit ----------
const NEW = process.env.NEWDIST || '/tmp/prodnew'; // production build of THIS commit (PUBLIC_SITE_ENV=production)
if (existsSync('/tmp/base/dist/cabo-fishing-faq.html') && existsSync(NEW + '/cabo-fishing-faq.html')) {
  const old = readFileSync('/tmp/base/dist/cabo-fishing-faq.html', 'utf8');
  { const faq = readFileSync(NEW + '/cabo-fishing-faq.html', 'utf8'); const i = faq.indexOf('<h4>How do we book a fishing charter?</h4>'); const ans = faq.slice(i, faq.indexOf('<h4>', i + 10));
  const head = (h) => (h.match(/<head>[\s\S]*<\/head>/) || [''])[0].replace(/efc-chat\.js\?v=[a-z0-9]+/, '');
  const h1 = (h) => (h.match(/<h1[\s\S]*?<\/h1>/g) || []).join('|');
  const ld = (h) => (h.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []).join('|');
  t('FAQ: <head> (title, description, canonical, OG, JSON-LD) identical to production', head(faq) === head(old));
  t('FAQ: H1 identical, structured data identical (the page has no FAQPage schema — nothing to update)', h1(faq) === h1(old) && ld(faq) === ld(old) && !/FAQPage/.test(faq));
  const others = faq.replace(ans, ''), others0 = old.replace(old.slice(old.indexOf('<h4>How do we book'), old.indexOf('<h4>', old.indexOf('<h4>How do we book') + 10)), '');
  t('FAQ: every other question/answer unchanged', others.replace(/efc-chat\.js\?v=[a-z0-9]+/, '') === others0.replace(/efc-chat\.js\?v=[a-z0-9]+/, ''));
  for (const f of ['fishing-boats/37ft-ultimate-fishing-machine.html', 'sitemap.xml', 'fishing-boats.html']) {
    const a = readFileSync('/tmp/base/dist/' + f, 'utf8'), b = readFileSync(NEW + '/' + f, 'utf8');
    t(`SEO unchanged (production builds): /${f} ${f.endsWith('.xml') ? 'identical' : '<head> (title, meta, canonical, structured data)'}`, f.endsWith('.xml') ? a === b : head(a) === head(b));
  }
  }
}
// ---------- Boat #10 in booking interfaces ----------
const b = await chromium.launch();
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['Pixel 7'] }]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/book-now?boat=boat-10', { waitUntil: 'networkidle' });
  const cards = await p.locator('.bk-bn').allInnerTexts();
  t(`${label} /book-now: card "#10 · ${NAME}", image alt updated, ?boat=boat-10 selects boat-10`, cards[9].trim() === `#10 · ${NAME}` && (await p.locator('input[name=boat][value=boat-10]').isChecked()) && (await p.locator(`img[alt="${NAME}"]`).count()) === 1);
  t(`${label} /book-now: other 9 boat labels unchanged`, JSON.stringify(cards.slice(0, 9).map((s) => s.trim())) === JSON.stringify(['#1 · 23ft Panga', '#2 · 26ft Super Panga', '#3 · 27ft Premium Center Console', '#4 · 30ft Cuddy Cabin', '#5 · 38ft Flybridge', '#6 · 31ft Premium Center Console', '#7 · 29ft Catamaran Center Console', '#8 · 35ft Premium Cuddy Cabin', '#9 · 44ft Premium Flybridge']), cards.join(' | '));
  t(`${label} /book-now: "Ultimate Fishing Machine" nowhere on the page`, !OLD.test(await p.content()));
  await p.goto(BASE + '/contact?boat=boat-10', { waitUntil: 'networkidle' });
  const sel = await p.evaluate(() => { const s = document.querySelector('#contact-form select[name=boats]') || [...document.querySelectorAll('#contact-form select')].find((x) => /Boat #10/.test(x.textContent)); return s ? { v: s.value, opts: [...s.options].map((o) => o.textContent.trim()) } : null; });
  t(`${label} /contact: boat selector shows "Boat #10 (37FT Offshore Catamaran)", ?boat=boat-10 preselects it`, !!sel && sel.opts.includes('Boat #10 (37FT Offshore Catamaran)') && sel.v === 'Boat #10 (37FT Offshore Catamaran)' && !OLD.test(sel.opts.join('|')), JSON.stringify(sel));
  await p.goto(BASE + '/fishing-boats', { waitUntil: 'networkidle' });
  t(`${label} /fishing-boats: #10 showcase "${NAME}", book link → boat-10`, (await p.locator('#boat-10-title').innerText()).toLowerCase().includes(NAME.toLowerCase()) && (await p.locator('#boat-10 a.sc-book').getAttribute('href')) === '/book-now?boat=boat-10' && !OLD.test(await p.locator('main').innerText()));
  t(`${label}: no JavaScript error`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
// ---------- prices / deposits / availability API unchanged ----------
const s10 = await Promise.all([6, 8].map(async (h) => (await (await fetch(BASE + '/api/booking/summary', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-efc-quote': '1' }, body: JSON.stringify({ boat: 'boat-10', hours: h }) })).json())));
t('Boat #10 prices/deposit unchanged: 6 h $4,500 / 8 h $5,000, deposit $1,000, balance $3,500 / $4,000', s10[0].total === 4500 && s10[1].total === 5000 && s10.every((x) => x.deposit === 1000) && s10[0].balance === 3500 && s10[1].balance === 4000, JSON.stringify(s10));
const boats = await (await fetch(BASE + '/api/booking/boats')).json(); const b10 = boats.boats.find((x) => x.id === 'boat-10');
t('Boat #10 booking catalogue: id boat-10, 37 ft, 6 guests, 6 h + 8 h, bookable', b10 && b10.number === 10 && b10.sizeFt === 37 && b10.capacity === 6 && JSON.stringify(b10.durations) === '[6,8]' && b10.bookable);
const av = await (await fetch(`${BASE}/api/booking/availability?boat=boat-10&month=${new Date().toISOString().slice(0, 7)}`)).json();
t('Boat #10 availability API answers normally', av.ok !== false && !!(av.days || av.states || av.dates || Object.keys(av).length > 1), JSON.stringify(av).slice(0, 120));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
