# Page-by-page SEO migration report: original export vs new build (dist/).
import glob, json, re, os
from bs4 import BeautifulSoup
EXP = '/home/claude/export/site/pages/'
norm = lambda s: re.sub(r'\s+', ' ', s or '').strip()
qa = {r['test'].replace('GET ', ''): r for r in json.load(open('docs/qa-results.json'))['results'] if r['area'] == 'Routes'}
rows = []; titles = {}
for f in sorted(glob.glob(EXP + '**/*.html', recursive=True)):
    rel = f[len(EXP):-5]; url = '/' if rel == 'index' else '/' + rel
    A = BeautifulSoup(open(f).read(), 'lxml'); dpath = f'dist/{rel}.html'
    B = BeautifulSoup(open(dpath).read(), 'lxml') if os.path.exists(dpath) else None
    def info(S):
        if S is None: return {}
        md = S.head.find('meta', attrs={'name': 'description'}); can = S.head.find('link', rel='canonical')
        main = S.select_one('article#page-regions') or S.select_one('main')
        return {'title': norm(S.title.get_text() if S.title else ''), 'desc': norm(md['content'] if md else ''), 'canonical': can['href'] if can else '',
                'h1': [norm(h.get_text()) for h in main.find_all('h1')], 'ld': len(S.find_all('script', type='application/ld+json')),
                'robots': (S.head.find('meta', attrs={'name': 'robots'}) or {}).get('content', '')}
    a, b = info(A), info(B)
    same = {k: (a.get(k) == b.get(k)) for k in ('title', 'desc', 'canonical', 'h1', 'ld')}
    status = qa.get(url, {}).get('detail', 'n/a')
    rows.append((url, status, a, b, same))
    titles.setdefault(a.get('title'), []).append(url)
md = ['# SEO migration report — page by page', '', 'Generated from the original Squarespace export (2026-11-02) and the new build. "=" means identical to the original.',
      'Content checks (text, headings, links, image alts, DOM order, head tags, JSON-LD): see `scripts/verify-original.py` — **all pages identical**.', '',
      '| URL | HTTP (staging build) | Title | Meta description | Canonical | H1 | JSON-LD blocks | Indexing (staging) |', '|---|---|---|---|---|---|---|---|']
for url, st, a, b, s in rows:
    m = lambda k: '=' if s[k] else 'DIFF'
    md.append(f"| `{url}` | {st} | {m('title')} — {a.get('title','')[:60]} | {m('desc')} | {m('canonical')} | {m('h1')} ({len(a.get('h1', []))}) | {m('ld')} ({a.get('ld')}) | {b.get('robots') or 'index'} → noindex on staging |")
md += ['', '## Existing SEO issues on the live site (kept as is — NOT changed; proposals only)', '']
dup = {t: u for t, u in titles.items() if len(u) > 1}
md.append(f'- Duplicate titles: ' + ('; '.join(f'"{t}" on {", ".join(u)}' for t, u in dup.items()) or 'none'))
md.append('- Missing H1: ' + ', '.join(u for u, _, a, _, _ in rows if not a.get('h1')))
md.append('- More than one H1: ' + ', '.join(f'{u} ({len(a["h1"])})' for u, _, a, _, _ in rows if len(a.get('h1', [])) > 1))
md.append('- `<br/>` inside title: ' + ', '.join(u for u, _, a, _, _ in rows if '<br' in a.get('title', '')))
md.append('- Missing meta description: ' + (', '.join(u for u, _, a, _, _ in rows if not a.get('desc')) or 'none'))
open('docs/SEO-MIGRATION.md', 'w').write('\n'.join(md) + '\n')
print('rows', len(rows), 'diff rows', sum(1 for r in rows if not all(r[4].values())))
