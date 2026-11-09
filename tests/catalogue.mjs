// Static consistency checks (no server): boat catalogue, approved prices, legacy boats.ts, and NO price grid in public files.
// Usage: npm run build && node tests/catalogue.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRICING, cardChargeCents } from '../worker/booking/pricing.ts';

const results = []; const t = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const cat = JSON.parse(readFileSync(new URL('../src/data/boats.json', import.meta.url), 'utf8')).boats;
const legacy = readFileSync(new URL('../src/data/boats.ts', import.meta.url), 'utf8');
const APPROVED = { 1: [350, null, 100], 2: [550, 600, 200], 3: [680, 800, 200], 4: [640, 800, 200], 5: [1500, 1800, 300], 6: [1400, 1600, 400], 7: [1600, 1900, 400], 8: [2700, 3000, 500], 9: [3000, 3500, 500], 10: [4500, 5000, 1000] };

t('10 boats, ids boat-01..boat-10 = #1..#10', cat.length === 10 && cat.every((b, i) => b.id === `boat-${String(i + 1).padStart(2, '0')}` && b.number === i + 1));
t('every boat has a price configuration and nothing else is configured', cat.every((b) => PRICING[b.id]) && Object.keys(PRICING).length === 10);
t('prices and deposits = owner-approved table (USD)', cat.every((b) => { const [p6, p8, dep] = APPROVED[b.number]; const p = PRICING[b.id]; return p[6] === p6 && p[8] === p8 && p.deposit === dep; }));
const combos = Object.values(PRICING).reduce((n, p) => n + (p[6] != null) + (p[8] != null), 0);
t('exactly 19 valid boat/duration combinations; Boat #1 = 6 h only', combos === 19 && PRICING['boat-01'][8] === null && PRICING['boat-01'][6] === 350);
t('balance > 0 for every combination', Object.values(PRICING).every((p) => [6, 8].every((h) => p[h] == null || p[h] - p.deposit > 0)));
const fees = Object.values(PRICING).map((p) => cardChargeCents(p.deposit, 6));
t('card charge = deposit + 6% exactly in cents (no rounding drift)', Object.values(PRICING).every((p, i) => fees[i] === p.deposit * 106));
t('public catalogue (boats.json) has no price or deposit field', !cat.some((b) => Object.keys(b).some((k) => /price|deposit/i.test(k))));
t('sizes in boats.json match the boat names/slugs', cat.every((b) => b.name.startsWith(String(b.sizeFt)) && b.slug.includes(String(b.sizeFt))));
// legacy src/data/boats.ts (not imported by any page) must not drift from boats.json
const leg = [...legacy.matchAll(/slug: '([^']+)'[^]*?label: 'Boat#(\d+)', capacity: (\d+)/g)].map((m) => ({ slug: m[1], n: +m[2], cap: +m[3] }));
t('legacy boats.ts in sync with boats.json (slug, number, capacity)', leg.length === 10 && leg.every((l) => { const b = cat[l.n - 1]; return b && b.slug === l.slug && b.capacity === l.cap; }), JSON.stringify(leg));
// no public file may carry the grid: look for any 3 of the distinctive totals together
const DIST = ['4500', '3500', '2700', '1900', '1800', '1600', '1400'];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pub = walk('dist').filter((f) => /\.(html|js|json|txt|xml)$/.test(f));
const bad = pub.filter((f) => { const s = readFileSync(f, 'utf8'); return DIST.filter((v) => new RegExp(`\\b${v}\\b`).test(s)).length >= 3 && /deposit|price/i.test(s); });
t(`no price grid in any public file (${pub.length} files under dist/)`, bad.length === 0, bad.join(', '));
const bk = readFileSync('dist/book-now.html', 'utf8');
t('/book-now HTML: no dollar amount at all', !/\$\s?\d/.test(bk));
const legacyPages = walk('dist/fishing-boats').filter((f) => f.endsWith('.html')).map((f) => readFileSync(f, 'utf8'));
t('pre-launch build: old Stripe/Wise payment links still on the 10 boat pages (production fallback) + BOOK THIS BOAT', legacyPages.length === 10 && legacyPages.every((h) => /href="https:\/\/buy\.stripe\.com/.test(h) && /href="https:\/\/wise\.com\/pay/.test(h) && h.includes('BOOK THIS BOAT')));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
