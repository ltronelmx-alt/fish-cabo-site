// Layout audit: every sitemap URL at desktop / tablet / mobile widths.
// Flags: horizontal overflow, overlapping content boxes (buttons, images, headings, paragraphs, list items),
// text overflowing its box, and content covered by another element.
// Usage: node tests/layout.mjs [baseUrl]
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const sm = readFileSync('dist/sitemap.xml', 'utf8');
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
urls.push('/fishing-reports/older', '/contact');
const widths = [1440, 820, 390];
const out = [];
const b = await chromium.launch();
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  for (const u of [...new Set(urls)]) {
    await p.goto(BASE + u, { waitUntil: 'load' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}*{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}' });
    const r = await p.evaluate(() => {
      const issues = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) issues.push(`horizontal overflow ${document.documentElement.scrollWidth}px > ${vw}px`);
      const skip = (el) => el.closest('header, .hdr, .mmenu, #efc-chat, .efc-chat, [class*="chat"], .wa, footer, iframe, .visually-hidden, .hp, .skip-link');
      const sel = 'main a.btn, main img, main h1, main h2, main h3, main h4, main p, main li, main .card, main form';
      const els = [...document.querySelectorAll(sel)].filter((e) => !skip(e)).filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2; });
      const sy = window.scrollY;
      const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + sy, r: r.right, b: r.bottom + sy }; };
      const B = els.map(box);
      const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(e.innerText || e.alt || '').trim().slice(0, 40)}"`;
      // content outside the viewport horizontally
      els.forEach((e, i) => { if (B[i].r > vw + 2 || B[i].x < -2) issues.push(`outside viewport: ${name(e)} [${Math.round(B[i].x)}–${Math.round(B[i].r)}]`); });
      // pairwise overlaps between unrelated boxes (images inside the hero are backgrounds by design)
      const leaf = els.filter((e) => /^(A|IMG|H1|H2|H3|H4|P|FORM)$/.test(e.tagName));
      const LB = leaf.map(box);
      for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) {
        const a = leaf[i], c = leaf[j];
        if (a.contains(c) || c.contains(a)) continue;
        const heroBg = (e) => e.tagName === 'IMG' && e.closest('.hero, .o-hero, .banner');
        if (heroBg(a) || heroBg(c)) continue;
        const A = LB[i], C = LB[j];
        const ox = Math.min(A.r, C.r) - Math.max(A.x, C.x), oy = Math.min(A.b, C.b) - Math.max(A.y, C.y);
        if (ox > 4 && oy > 4) issues.push(`overlap: ${name(a)} × ${name(c)} (${Math.round(ox)}×${Math.round(oy)}px)`);
      }
      // text overflowing its own box (cut words, buttons too narrow)
      document.querySelectorAll('main a.btn, main h1, main h2, main h3, main h4').forEach((e) => { if (!skip(e) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') issues.push(`text overflow: ${name(e)}`); });
      // payment links must always use the payment-button style
      document.querySelectorAll('main a[href*="stripe.com"], main a[href*="wise.com"], main a[href*="paypal."]').forEach((a) => { if (!a.classList.contains('btn-pay')) issues.push(`payment link without payment style: ${name(a)}`); });
      // images: never shown far above their real resolution (blurry) and never taller than the screen outside the hero
      const vh = window.innerHeight;
      document.querySelectorAll('main img').forEach((im) => {
        if (skip(im) || im.closest('.hero, .o-hero, .banner')) return;
        const r = im.getBoundingClientRect(); if (r.width < 2) return;
        const nat = +im.getAttribute('width') || 0;
        if (nat && r.width > nat * 1.25 && r.width > 300) issues.push(`image upscaled ${Math.round(r.width)}px > natural ${nat}px: ${name(im)}`);
        if (r.height > vh * 1.0) issues.push(`image taller than the screen (${Math.round(r.height)}px): ${name(im)}`);
        if (vw >= 1000 && r.width > 1000 && !im.closest('.o-gallery.n1')) issues.push(`image very wide on desktop (${Math.round(r.width)}px): ${name(im)}`);
      });
      return [...new Set(issues)].slice(0, 30);
    });
    // covered content: buttons, headings and images must be the topmost element at their centre
    const covered = await p.evaluate(async () => {
      const res = [];
      const skip = (el) => el.closest('header, .hdr, .mmenu, footer, iframe, .visually-hidden, .hp');
      const items = [...document.querySelectorAll('main a.btn, main h1, main h2, main h3, main h4, main img, main form button')].filter((e) => !skip(e) && e.getBoundingClientRect().width > 2 && !(e.tagName === 'IMG' && e.closest('.hero, .o-hero, .banner')));
      for (const e of items) {
        e.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = e.getBoundingClientRect();
        const x = r.left + Math.min(r.width / 2, 20), y = r.top + r.height / 2;
        let hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        // ignore the floating WhatsApp/chat bubble and the fixed header (they float over everything by design)
        if (hit.closest('header, .hdr, .mbar, [id*="efc"], [class*="efc"]')) continue;
        if (!(e === hit || e.contains(hit) || hit.contains(e) || (e.tagName === 'IMG' && hit.closest('picture, a, .media')?.contains(e)))) res.push(`covered: ${e.tagName.toLowerCase()} "${(e.innerText || e.alt || '').trim().slice(0, 40)}" under ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`);
      }
      return res.slice(0, 15);
    });
    r.push(...covered);
    out.push({ width: w, url: u, issues: r });
    console.log(`${r.length ? 'ISSUE' : 'OK   '} ${w} ${u}${r.length ? '\n   ' + r.join('\n   ') : ''}`);
  }
  await ctx.close();
}
await b.close();
writeFileSync('docs/layout-results.json', JSON.stringify(out, null, 1));
const bad = out.filter((o) => o.issues.length);
console.log(`\n${out.length - bad.length}/${out.length} page×width combinations without layout issues`);
