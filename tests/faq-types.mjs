// FAQ "What types of fishing trips can we book?" (owner 2026-11-10): standard 6/8-hour charters on /book-now (Boat #1: 6 h only);
// tournaments / custom private charters / extended trips → contact form or WhatsApp first. Usage: node tests/faq-types.mjs [base]
import { readFileSync, existsSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const Q = '<h4>What types of fishing trips can we book?</h4>';
const ansOf = (h) => { const i = h.indexOf(Q); return i < 0 ? '' : h.slice(i, h.indexOf('<h4>', i + 10)); };
const page = await (await fetch(BASE + '/cabo-fishing-faq')).text();
const a = ansOf(page), txt = a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('question kept; standard charters = 6 or 8 hours depending on the boat, booked on /book-now', !!a && /Standard fishing charters are available for 6 or 8 hours, depending on the boat selected/.test(txt) && /<a href="\/book-now">Book Now<\/a>/.test(a));
t('Boat #1 exception stated (6-hour trips only), other boats 6 h + 8 h', /Boat #1 offers 6-hour \(3\/4-day\) trips only, and our other boats offer private 6-hour \(3\/4-day\) and 8-hour \(full-day\) trips/.test(txt));
const boats = await (await fetch(BASE + '/api/booking/boats')).json();
t('…matches the booking system (boat-01 = [6], boats 02–10 = [6,8])', JSON.stringify(boats.boats.find((b) => b.id === 'boat-01').durations) === '[6]' && boats.boats.filter((b) => b.id !== 'boat-01').every((b) => JSON.stringify(b.durations) === '[6,8]'));
t('tournaments, custom private charters, extended trips, special arrangements → contact first; then the official booking and deposit process', /For tournament fishing, custom private fishing charters, extended trips, or special arrangements, please contact us/.test(txt) && /These trips are not available as standard options on our online booking form\. Please contact us first to discuss your requirements and pricing\. Once the details are agreed upon, we will guide you through our official booking and deposit process\./.test(txt) && !/not priced or booked/.test(txt));
t('links: /contact and the official WhatsApp link (wa.me/526241223506), no mailto/email', /<a href="\/contact">contact form<\/a>/.test(a) && /<a href="https:\/\/wa\.me\/526241223506" target="_blank" rel="noopener">WhatsApp<\/a>/.test(a) && !/mailto:/i.test(page));
t('keywords kept: 6-hour (3/4-day), 8-hour (full-day), private, fishing charters, inshore/offshore, Fishing Boats link', /6-hour \(3\/4-day\)/.test(txt) && /8-hour \(full-day\)/.test(txt) && /private/.test(txt) && /fishing charters/.test(txt) && /inshore fishing or offshore sportfishing/.test(txt) && /href="https:\/\/fish-cabo\.com\/fishing-boats">Fishing Boats/.test(a));
const NEW = process.env.NEWDIST || '/tmp/prodnew';
if (existsSync('/tmp/base/dist/cabo-fishing-faq.html') && existsSync(NEW + '/cabo-fishing-faq.html')) {
  const old = readFileSync('/tmp/base/dist/cabo-fishing-faq.html', 'utf8'), neu = readFileSync(NEW + '/cabo-fishing-faq.html', 'utf8');
  const meta = (h) => (h.match(/<title>[\s\S]*?<\/title>|<meta [^>]*>|<link rel="canonical"[^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>|<h1[\s\S]*?<\/h1>/g) || []).join('|');
  t('production build: title, meta, canonical, JSON-LD, H1 identical (no FAQPage schema on the page — nothing to sync)', meta(old) === meta(neu) && !/FAQPage/.test(neu));
  t('production build: every other question/answer unchanged', old.replace(ansOf(old), '') === neu.replace(ansOf(neu), ''));
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
