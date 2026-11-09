"""Regression check between two production builds (e.g. main vs a branch): for every HTML page, compares
<title>, meta description, canonical, robots, og/twitter tags, JSON-LD, headings (order+level), main text and links.
Usage: python3 scripts/compare-builds.py <baseline-dist> <new-dist>   → lists every page that differs and how.
Substitute for scripts/verify-original.py when the Squarespace export (/home/claude/export) is not available."""
import sys, os, glob, re, json, difflib
from bs4 import BeautifulSoup
A, B = sys.argv[1], sys.argv[2]
norm = lambda s: re.sub(r'\s+', ' ', s or '').strip()
def snap(path):
    s = BeautifulSoup(open(path, encoding='utf-8').read(), 'lxml')
    head = {}
    head['title'] = norm(s.title.string if s.title else '')
    for m in s.find_all('meta'):
        k = m.get('name') or m.get('property') or m.get('itemprop')
        if k and (k in ('description', 'robots') or k.startswith(('og:', 'twitter:')) or m.get('itemprop')): head['meta:' + k] = norm(m.get('content'))
    c = s.find('link', rel='canonical'); head['canonical'] = c.get('href') if c else None
    head['jsonld'] = [norm(x.string) for x in s.find_all('script', type='application/ld+json')]
    main = s.find('main') or s.body
    for el in main.select('script,style,noscript'): el.decompose()
    hs = [(h.name, norm(h.get_text())) for h in main.find_all(re.compile('^h[1-6]$'))]
    links = sorted({(a.get('href'), norm(a.get_text())) for a in main.find_all('a')})
    text = norm(main.get_text(' '))
    return head, hs, links, text
pages = sorted(os.path.relpath(p, A) for p in glob.glob(A + '/**/*.html', recursive=True))
new_only = sorted(set(os.path.relpath(p, B) for p in glob.glob(B + '/**/*.html', recursive=True)) - set(pages))
changed = 0
for p in pages:
    if not os.path.exists(os.path.join(B, p)): print(f'REMOVED {p}'); changed += 1; continue
    a, b = snap(os.path.join(A, p)), snap(os.path.join(B, p))
    if a == b: continue
    changed += 1; print(f'\n== {p}')
    for k in sorted(set(a[0]) | set(b[0])):
        if a[0].get(k) != b[0].get(k): print(f'  head {k}:\n    - {str(a[0].get(k))[:400]}\n    + {str(b[0].get(k))[:400]}')
    if a[1] != b[1]:
        for l in difflib.unified_diff([f'{x}: {y}' for x, y in a[1]], [f'{x}: {y}' for x, y in b[1]], lineterm='', n=0):
            if not l.startswith(('---', '+++', '@@')): print('  heading', l)
    if a[2] != b[2]:
        for l in sorted(set(a[2]) ^ set(b[2])): print('  link', '+' if l in b[2] else '-', l)
    if a[3] != b[3]:
        sm = difflib.SequenceMatcher(None, a[3], b[3], autojunk=False)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op != 'equal': print(f'  text {op}: - "{a[3][i1:i2][:300]}"  + "{b[3][j1:j2][:300]}"')
print(f'\n{len(pages)} baseline pages, {changed} changed, new pages: {new_only}')
