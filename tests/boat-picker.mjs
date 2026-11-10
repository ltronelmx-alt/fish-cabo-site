// /book-now step 1 — boat cards layout (owner 2026-11-10): 5 × 2 on large screens, 3 / 2 / 1 columns below, 4:3 photos.
// Usage: node tests/boat-picker.mjs [base]   (wrangler dev on :8787)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = []; const t = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && i ? ' — ' + i : ''}`); };
const NAMES = ['23ft Panga', '26ft Super Panga', '27ft Premium Center Console', '30ft Cuddy Cabin', '38ft Flybridge', '31ft Premium Center Console', '29ft Catamaran Center Console', '35ft Premium Cuddy Cabin', '44ft Premium Flybridge', '37ft Offshore Catamaran'];
const WANT = { 1920: 5, 1440: 5, 1366: 5, 1024: 3, 768: 2, 390: 1, 360: 1 };
const b = await chromium.launch();
for (const [w, cols] of Object.entries(WANT).map(([a, c]) => [+a, c])) {
  const mob = w < 700;
  const ctx = await b.newContext({ viewport: { width: w, height: mob ? 844 : 960 }, deviceScaleFactor: mob ? 3 : 1, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/book-now', { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (const i of document.querySelectorAll('.bk-boat img')) { i.dataset.lazy0 = i.getAttribute('loading'); i.loading = 'eager'; if (!i.complete) await new Promise((r) => { i.onload = i.onerror = r; }); } });
  const L = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.bk-boat')]; const g = document.querySelector('.bk-boats').getBoundingClientRect();
    const rows = {}; for (const c of cards) { const r = c.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push({ h: Math.round(r.height), w: r.width, l: r.left, ri: r.right }); }
    const imgs = cards.map((c) => { const i = c.querySelector('img'), r = i.getBoundingClientRect(); return { ratio: r.width / r.height, w: r.width, file: +((i.currentSrc.match(/-(\d+)\.webp/) || [])[1] || 0), fit: getComputedStyle(i).objectFit, ok: i.complete && i.naturalWidth > 0, lazy: i.dataset.lazy0, srcset: !!i.getAttribute('srcset') }; });
    const names = cards.map((c) => { const n = c.querySelector('.bk-bn'); return { t: n.textContent.trim(), over: n.scrollWidth > n.clientWidth + 1, top: Math.round(n.getBoundingClientRect().top - c.getBoundingClientRect().top), fs: parseFloat(getComputedStyle(n).fontSize) }; });
    const meta = cards.map((c) => Math.round(c.getBoundingClientRect().bottom - c.querySelector('.bk-bp').getBoundingClientRect().bottom));
    return { n: cards.length, gridW: g.width, gridL: g.left, gridR: g.right, rows: Object.values(rows), imgs, names, meta, overflow: document.documentElement.scrollWidth > innerWidth + 1, vw: innerWidth, dpr: devicePixelRatio, step2W: document.querySelector('.bk').getBoundingClientRect().width };
  });
  const firstRow = L.rows[0].length;
  t(`${w}px: ${cols} column${cols > 1 ? 's' : ''}, all 10 boats in order, ${L.rows.length} rows${cols === 5 ? ' (5 × 2)' : ''}`, L.n === 10 && firstRow === cols && (cols !== 5 || (L.rows.length === 2 && L.rows.every((r) => r.length === 5))) && L.names.map((x) => x.t).join('|') === NAMES.map((n, k) => `#${k + 1} · ${n}`).join('|'), `${firstRow} cols, rows ${L.rows.map((r) => r.length)}`);
  if (w >= 1300) t(`${w}px: grid uses the wide area (${Math.round(L.gridW)} px, max ≈ 1560), cards ${Math.round(L.rows[0][0].w)} px wide (before: ≈ 234 px), 18 px gaps`, L.gridW > 1100 && L.gridW <= 1561 && L.rows[0][0].w >= 240 && Math.abs((L.rows[0][1].l - L.rows[0][0].ri) - 18) < 1);
  t(`${w}px: photos 4:3, cover, loaded, lazy + srcset kept, sharp (file ≥ displayed width × DPR)`, L.imgs.every((i) => Math.abs(i.ratio - 4 / 3) < 0.02 && i.fit === 'cover' && i.ok && i.lazy === 'lazy' && i.srcset && i.file >= Math.min(i.w * L.dpr, 785) - 1), JSON.stringify(L.imgs.filter((i) => !(Math.abs(i.ratio - 4 / 3) < 0.02 && i.lazy === 'lazy' && i.file >= Math.min(i.w * L.dpr, 785) - 1)).slice(0, 2)));
  t(`${w}px: names readable (≥ 15 px), never overflow, start at the same height in each row`, L.names.every((x) => !x.over && x.fs >= 15) && L.rows.every((r, k) => true) && (() => { let k = 0; return L.rows.every((r) => { const tops = L.names.slice(k, k + r.length).map((x) => x.top); k += r.length; return Math.max(...tops) - Math.min(...tops) <= 1; }); })());
  t(`${w}px: equal card heights per row${cols > 1 ? ', capacity/duration lines aligned at the bottom' : ''}`, L.rows.every((r) => Math.max(...r.map((x) => x.h)) - Math.min(...r.map((x) => x.h)) <= 1) && (cols === 1 || Math.max(...L.meta) - Math.min(...L.meta) <= 1), JSON.stringify(L.rows.map((r) => r.map((x) => x.h))));
  t(`${w}px: no horizontal overflow, grid inside the viewport, other steps keep their column`, !L.overflow && L.gridL >= 0 && L.gridR <= L.vw && L.step2W <= 981);
  // selection (every boat), orange state, duration rules
  const bad = [];
  for (let k = 0; k < 10; k++) {
    const card = p.locator('.bk-boat').nth(k); await card.click(); await p.mouse.move(0, 0); await p.waitForTimeout(250);
    const st = await card.evaluate((c) => ({ checked: c.querySelector('input').checked, v: c.querySelector('input').value, border: getComputedStyle(c).borderTopColor, others: [...document.querySelectorAll('.bk-boat input:checked')].length }));
    const d6 = await p.locator('#s-dur label[data-h="6"]').isVisible(), d8 = await p.locator('#s-dur label[data-h="8"]').isVisible();
    if (!(st.checked && st.v === `boat-${String(k + 1).padStart(2, '0')}` && st.others === 1 && st.border === 'rgb(251, 119, 4)' && d6 && (k === 0 ? !d8 && (await p.locator('#only6').isVisible()) : d8))) bad.push(`#${k + 1} ${JSON.stringify(st)} 6h:${d6} 8h:${d8}`);
  }
  t(`${w}px: clicking each card selects the right boat (orange border, one selection); #1 = 6 h only, others 6 h + 8 h`, bad.length === 0, bad.join(' | '));
  if (w === 1440 || w === 390) {
    // keyboard
    await p.locator('.bk-boat input').nth(0).focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
    t(`${w}px: keyboard — arrow keys move the selection, focus ring visible`, (await p.locator('.bk-boat input').nth(1).isChecked()) && (await p.locator('.bk-boat').nth(1).evaluate((c) => getComputedStyle(c).outlineStyle)) === 'solid');
    // forward / back keeps the boat
    await p.locator('.bk-boat').nth(6).click(); await p.locator('input[name=duration][value="8"]').check();
    await p.waitForSelector('#s-date:not([hidden]) .day.s-available'); await p.locator('.bk-nav[data-m="1"]').click(); await p.waitForTimeout(300);
    await p.locator('.day.s-available').first().click(); await p.locator('#show-price').click(); await p.waitForSelector('#quote:not([hidden])');
    await p.locator('#continue').click(); await p.waitForSelector('#s-details:not([hidden])');
    const fwd = await p.locator('input[name=boat][value=boat-07]').isChecked();
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    const back = await p.locator('input[name=boat][value=boat-07]').isChecked() && (await p.locator('input[name=duration][value="8"]').isChecked());
    t(`${w}px: boat #7 stays selected going forward (details step) and after coming back / reloading`, fwd && back);
  }
  t(`${w}px: no JavaScript error`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
