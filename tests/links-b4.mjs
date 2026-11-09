// Pre-launch audit B4: FAQ "Book Now" buttons (homepage + /cabo-fishing) go to /book-now; boat preselection links intact.
// Reads the built site (dist/). Usage: npm run build && node tests/links-b4.mjs
import { readFileSync, readdirSync } from 'node:fs';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const page = (f) => readFileSync(`dist/${f}`, 'utf8');
for (const f of ['index.html', 'cabo-fishing.html']) {
  const h = page(f);
  const faq = [...h.matchAll(/<a [^>]*href="([^"]+)"[^>]*>Book Now<\/a>/g)].map((m) => m[1]);
  t(`${f}: FAQ "Book Now" → /book-now`, faq.length === 1 && faq[0] === '/book-now', JSON.stringify(faq));
  t(`${f}: no "Book Now" button left on /fishing-boats`, !/href="\/fishing-boats"[^>]*>Book Now</.test(h));
  t(`${f}: entry prices untouched (From $350 ×5, From $600 ×1, $600USD ×1)`, (h.match(/From \$350/g) || []).length === 5 && (h.match(/From \$600/g) || []).length === 1 && (h.match(/\$600USD/g) || []).length === 1);
}
const boats = readdirSync('dist/fishing-boats').filter((f) => f.endsWith('.html'));
const pre = boats.map((f) => (page(`fishing-boats/${f}`).match(/href="\/book-now\?boat=boat-(\d\d)"/) || [])[1]).filter(Boolean);
t('10 boat pages keep their BOOK THIS BOAT preselection link (boat-01…boat-10, each once)', boats.length === 10 && new Set(pre).size === 10, JSON.stringify(pre));
const fleet = [...page('fishing-boats.html').matchAll(/href="\/book-now\?boat=(boat-\d\d)"/g)].map((m) => m[1]);
t('/fishing-boats keeps 10 preselection links', new Set(fleet).size === 10);
t('no mailto: and no contact@ on /book-now pages', ['book-now.html', 'book-now/confirmation.html', 'book-now/canceled.html'].every((f) => !page(f).includes('mailto:') && !page(f).includes('contact@fish-cabo.com')));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
