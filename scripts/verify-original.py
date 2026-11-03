# Verifies the new pages keep the ORIGINAL text, headings, links, alt texts, head tags and JSON-LD.
import re, sys
from bs4 import BeautifulSoup
import glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from link_fixes import fix_html
from seo_fixes import fix_soup  # documented SEO fixes F1–F6 (docs/SEO-GEO-FINAL-AUDIT.md)
EXP = '/home/claude/export/site/pages/'
PAIRS = [(f[len(EXP):-5], f[len(EXP):-5]) for f in sorted(glob.glob(EXP + '**/*.html', recursive=True))]
QUIET = '-q' in sys.argv
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
ok = True
for o, n in PAIRS:
    A = BeautifulSoup(fix_html(open(f'/home/claude/export/site/pages/{o}.html').read()), 'lxml')
    fix_soup(A, o)
    B = BeautifulSoup(open(f'dist/{n}.html').read(), 'lxml') if os.path.exists(f'dist/{n}.html') else None
    if not os.path.exists(f'dist/{n}.html'): ok = False; print(f'MISSING ROUTE {o}'); continue
    a = A.select_one('article#page-regions') or A.select_one('main'); b = B.select_one('main')
    for el in a.select('script,style,noscript'): el.decompose()
    for el in b.select('script,style,noscript'): el.decompose()
    # Latest-log block is rendered by JS on the old site ("Loading..." in static HTML): skip it on both sides
    for el in a.find_all(string=re.compile('Loading latest fishing log')): el.parent.decompose()
    ll = b.select_one('.ll-wrap'); ll and ll.decompose()
    H = lambda r: [(h.name, norm(h.get_text())) for h in r.find_all(['h1','h2','h3','h4','h5','h6'])]
    L = lambda r: sorted((x.get('href'), norm(x.get_text())) for x in r.find_all('a') if norm(x.get_text()))
    I = lambda r: sorted(i.get('alt', '') for i in r.find_all('img'))
    T = lambda r: sorted(norm(p.get_text()) for p in r.find_all(['p','li','h1','h2','h3','h4']) if norm(p.get_text()) and not p.find(['p','li']))
    head = lambda d: sorted(str(t) for t in d.head.find_all(['title','meta','link','script']) if (t.name=='title' or (t.name=='meta' and (t.get('name') in ('description','twitter:title','twitter:image','twitter:url','twitter:card','twitter:description') or (t.get('property') or '').startswith('og:') or t.get('itemprop'))) or (t.name=='link' and t.get('rel')==['canonical']) or (t.name=='script' and t.get('type')=='application/ld+json')))
    D = lambda r: [(e.name, norm(e.get_text()) if e.name!='img' else e.get('alt','')) for e in r.find_all(['h1','h2','h3','h4','p','li','img','a']) if (e.name=='img' or norm(e.get_text()))]
    checks = {'DOM order of all content': (D(a), D(b)), 'headings (order+level)': (H(a), H(b)), 'links': (L(a), L(b)), 'image alts': (I(a), I(b)), 'text blocks': (T(a), T(b)), 'head tags + JSON-LD': (head(A), head(B)), 'lang': (A.html.get('lang'), B.html.get('lang'))}
    for k, (x, y) in checks.items():
        if x == y:
            if not QUIET: print(f'OK   {o:18} {k}')
        else:
            ok = False; print(f'DIFF {o:18} {k}')
            if isinstance(x, list):
                for v in [v for v in x if v not in y][:6]: print('   - only original:', str(v)[:150])
                for v in [v for v in y if v not in x][:6]: print('   + only new     :', str(v)[:150])
            else: print('  ', x, y)
sys.exit(0 if ok else 1)
