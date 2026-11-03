import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const pages = process.argv.slice(3); const w = +process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w, height: 900 } });
for (const u of pages) { await p.goto('http://127.0.0.1:8787' + u, { waitUntil: 'networkidle' }); await p.evaluate(()=>document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')); await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/shots/${w}${u.replace(/\//g,'_')||'_home'}.png`, fullPage: true }); }
await b.close();
