// Pixel-level design audit: every sitemap page at desktop / tablet / mobile.
// Flags: button height/width/font inconsistencies, buttons of one group with different widths, empty list bullets,
// irregular vertical rhythm between cards of one list (incl. across consecutive sections), elements straddling a
// band edge, horizontal overflow, text clipped by a button, tiny tap targets.
// Usage: node tests/design.mjs [baseUrl] [--json out.json]
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:8787';
const OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const urls = [...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/fish-cabo\.com([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
const WIDTHS = [1440, 1024, 768, 390];
const b = await chromium.launch();
const report = [];
let total = 0;
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  for (const u of urls) {
    await p.goto(BASE + u, { waitUntil: 'load' });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 15)); } window.scrollTo(0, 0); document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in', 'is-visible', 'visible')); });
    await p.waitForTimeout(150);
    const issues = await p.evaluate((vw) => {
      const out = [];
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const txt = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      // ---- buttons: anything that looks like a button inside main ----
      const btns = [...document.querySelectorAll('main a, main button')].filter((a) => {
        if (!vis(a) || a.closest('#efc-chat-window, .rv-section .rv-ctrl, .rv-card, nav') || a.matches('section > a:has(h2)')) return false;
        const s = getComputedStyle(a); const bw = parseFloat(s.borderTopWidth); const bg = s.backgroundColor;
        return (bw >= 1 && s.borderTopStyle !== 'none' && parseFloat(s.paddingLeft) >= 12) || (/btn/.test(a.className) && bg !== 'rgba(0, 0, 0, 0)');
      });
      for (const a of btns) {
        const r = a.getBoundingClientRect(); const s = getComputedStyle(a);
        if (r.height < 44) out.push(`button too small (${Math.round(r.width)}×${Math.round(r.height)}): "${txt(a)}"`);
        if (a.scrollWidth > a.clientWidth + 2) out.push(`button text overflows: "${txt(a)}"`);
        if (r.right > vw + 1 || r.left < -1) out.push(`button outside viewport: "${txt(a)}"`);
      }
      // groups = buttons whose boxes are stacked/adjacent within 40px and share an ancestor section
      const groups = [];
      for (const a of btns) {
        const r = a.getBoundingClientRect();
        const g = groups.find((g) => g.sec === a.closest('section, .card, li, .band') && Math.abs(g.last.bottom - r.top) < 40 || (g.sec === a.closest('section, .card, li, .band') && Math.abs(g.last.top - r.top) < 4));
        if (g) { g.items.push(a); g.last = r; } else groups.push({ sec: a.closest('section, .card, li, .band'), items: [a], last: r });
      }
      for (const g of groups.filter((g) => g.items.length > 1)) {
        const ws = g.items.map((a) => Math.round(a.getBoundingClientRect().width)); const hs = g.items.map((a) => Math.round(a.getBoundingClientRect().height));
        const fs = g.items.map((a) => getComputedStyle(a).fontSize);
        if (Math.max(...ws) - Math.min(...ws) > 2) out.push(`button group widths differ [${ws.join(',')}]: "${txt(g.items[0])}"…`);
        if (Math.max(...hs) - Math.min(...hs) > 2) out.push(`button group heights differ [${hs.join(',')}]: "${txt(g.items[0])}"…`);
        if (new Set(fs).size > 1) out.push(`button group font sizes differ [${fs.join(',')}]`);
      }
      // global consistency: button font size / height families
      const fam = new Set(btns.map((a) => `${getComputedStyle(a).fontSize}/${getComputedStyle(a).letterSpacing}`));
      if (fam.size > 2) out.push(`button styles on page: ${[...fam].join(' | ')}`);
      // ---- empty bullets: list items with a marker but no own content before a nested list ----
      for (const li of document.querySelectorAll('main li')) {
        if (!vis(li) || li.closest('.rv-section, #efc-chat-window')) continue;
        const own = [...li.childNodes].filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join('').trim();
        const mk = getComputedStyle(li, '::before'); const marker = (mk.display !== 'none' && mk.content && mk.content !== 'none' && mk.content !== 'normal' && parseFloat(mk.width) > 0) || getComputedStyle(li).listStyleType !== 'none';
        if (!own && marker && !li.querySelector('img, picture')) out.push(`empty bullet before: "${txt(li)}"`);
      }
      // ---- rhythm: cards / list items of one list with uneven vertical gaps ----
      const lists = [...document.querySelectorAll('main ul, main ol, main .cards-from-h3, main .cards-h4, main .cards')].filter((l) => vis(l) && getComputedStyle(l).display === 'grid');
      for (const l of lists) {
        const kids = [...l.children].filter(vis).map((c) => c.getBoundingClientRect());
        const rows = [...new Set(kids.map((k) => Math.round(k.top)))].sort((a, b) => a - b);
        if (rows.length < 3) continue;
        const gaps = []; for (let i = 1; i < rows.length; i++) { const prevBottom = Math.max(...kids.filter((k) => Math.round(k.top) === rows[i - 1]).map((k) => k.bottom)); gaps.push(Math.round(rows[i] - prevBottom)); }
        if (Math.max(...gaps) - Math.min(...gaps) > 3) out.push(`uneven gaps in list [${gaps.join(',')}]: "${txt(l)}"`);
      }
      // same list continued in the next section (same background): gap must equal the in-list gap
      const secs = [...document.querySelectorAll('main > section')];
      for (let i = 1; i < secs.length; i++) {
        const a = secs[i - 1], c = secs[i];
        if (getComputedStyle(a).backgroundColor !== getComputedStyle(c).backgroundColor) continue;
        const la = a.querySelector('.rich > ul:last-child, .rich > ol:last-child'), lc = c.querySelector('.rich > ul:first-child, .rich > ol:first-child');
        if (!la || !lc || getComputedStyle(la).display !== 'grid' || getComputedStyle(lc).display !== 'grid') continue;
        const gap = Math.round(lc.firstElementChild.getBoundingClientRect().top - la.lastElementChild.getBoundingClientRect().bottom);
        const inner = parseFloat(getComputedStyle(la).rowGap) || 0;
        if (Math.abs(gap - inner) > 3) out.push(`list continues across sections with a ${gap}px gap (in-list gap ${inner}px): "${txt(lc.firstElementChild)}"`);
      }
      // ---- band edge straddling (e.g. a button half on a dark band) ----
      const bands = [...document.querySelectorAll('main .band, main section')].filter(vis);
      for (const a of btns) {
        const r = a.getBoundingClientRect();
        for (const bd of bands) {
          if (bd.contains(a)) continue;
          const q = bd.getBoundingClientRect();
          const overlapY = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top), overlapX = Math.min(r.right, q.right) - Math.max(r.left, q.left);
          if (overlapY > 2 && overlapX > 2 && overlapY < r.height - 2) out.push(`button straddles a band edge: "${txt(a)}"`);
        }
      }
      if (document.documentElement.scrollWidth > vw + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth}px`);
      return [...new Set(out)];
    }, w);
    total++;
    if (issues.length) report.push({ w, u, issues });
  }
  await ctx.close();
}
await b.close();
const n = report.reduce((a, r) => a + r.issues.length, 0);
for (const r of report) { console.log(`ISSUE ${r.w} ${r.u}`); r.issues.forEach((i) => console.log('   ' + i)); }
console.log(`\n${total - report.length}/${total} page×width combinations clean (${n} issues)`);
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
process.exit(report.length ? 1 : 0);
