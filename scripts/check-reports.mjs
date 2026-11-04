// Build gate for Fishing Reports / Fishing Logs (runs before `astro build`). A failure stops the build,
// so Cloudflare never deploys it and the current live version stays online.
//  1. Duplicates (all articles): same title, same weekly period ("October 19–25, 2026"),
//     or same category + same publication date.
//  2. Editorial rules (only articles created after the pipeline went live, i.e. not in src/data/reports-baseline.json):
//     weights rounded to a multiple of 5 lb; no captain names.
// Usage: node scripts/check-reports.mjs [dir]   (exit 1 on error)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] || 'src/content/fishing-reports';
const baseline = new Set(JSON.parse(readFileSync(new URL('../src/data/reports-baseline.json', import.meta.url), 'utf8')).slugs);
const fm = (src, k) => {
  const m = src.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[–—-]/g, '-').replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim();
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
const period = (title) => { // weekly log period, e.g. "August 31–September 6, 2026" → "august 31-september 6 2026"
  const m = norm(title).match(new RegExp(`((?:${MONTHS}) \\d{1,2} ?- ?(?:(?:${MONTHS}) )?\\d{1,2} \\d{4})`));
  return m ? m[1].replace(/ ?- ?/, '-') : '';
};

const errors = [];
const seen = { title: new Map(), period: new Map(), catDate: new Map() };
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const src = readFileSync(join(DIR, f), 'utf8');
  if (/^draft:\s*true\s*$/m.test(src)) continue;
  const title = fm(src, 'title'), date = fm(src, 'date').slice(0, 10), category = fm(src, 'category') || 'Fishing Report';
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`${slug}: missing title or date`); continue; }
  const keys = [['title', norm(title)], ['catDate', `${norm(category)}|${date}`]];
  if (/fishing log/i.test(title + category)) { const p = period(title); if (p) keys.push(['period', p]); }
  for (const [k, v] of keys) {
    if (seen[k].has(v)) errors.push(`DUPLICATE (${k}): "${slug}" and "${seen[k].get(v)}"`);
    else seen[k].set(v, slug);
  }
  if (baseline.has(slug)) continue;
  // Editorial rules for new articles. The body is everything after the front matter, plus title/description/excerpt.
  const text = [title, fm(src, 'description'), fm(src, 'excerpt'), src.replace(/^---[\s\S]*?---/, '')].join('\n');
  for (const m of text.matchAll(/\b(\d{2,4})(?:\.\d+)?\s?-?\s?(?:lb|lbs|pounds?)\b/gi)) {
    if (Number(m[1]) % 5 !== 0) errors.push(`${slug}: weight "${m[0]}" must be rounded to the nearest 5 lb (e.g. 151 → about 150 lb)`);
  }
  for (const m of text.matchAll(/\b(?:Capt(?:ain)?|Cptn|Capit[aá]n)\.?\s+[A-ZÁÉÍÓÚÑ][\p{L}]+/gu)) errors.push(`${slug}: captain name "${m[0]}" is not allowed in public content`);
}
if (errors.length) {
  console.error(`check-reports: ${errors.length} problem(s) — build stopped, nothing deployed:\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`check-reports: ${files.length} articles OK (no duplicates; editorial rules OK for ${files.filter((f) => !baseline.has(f.replace(/\.md$/, ''))).length} new article(s))`);
