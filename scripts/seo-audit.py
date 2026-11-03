# Technical SEO audit of a PRODUCTION build (default /tmp/dist-prod). Read-only.
import json, os, re, sys, glob, collections
from bs4 import BeautifulSoup
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dist-prod'
SITE = 'https://fish-cabo.com'
pages = {}
for f in sorted(glob.glob(D + '/**/*.html', recursive=True)):
    rel = f[len(D):-5]
    if rel.endswith('/index'): rel = rel[:-6] or '/'
    if rel in ('/404',) or rel.startswith('/admin'): continue
    pages['/' if rel in ('', '/index') else rel] = f
sm = open(D + '/sitemap.xml').read()
sm_urls = [__import__('urllib.parse').parse.unquote(u.replace(SITE, '')) or '/' for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
issues = collections.defaultdict(list); rows = []
types_by_page = {}; entities = collections.Counter(); og_ext = collections.Counter()
links = collections.Counter()
for u, f in pages.items():
    s = BeautifulSoup(open(f).read(), 'lxml')
    t = s.title.string if s.title else ''
    d = (s.find('meta', attrs={'name': 'description'}) or {}).get('content') if s.find('meta', attrs={'name': 'description'}) else None
    c = s.find('link', rel='canonical'); c = c.get('href') if c else None
    rb = s.find('meta', attrs={'name': 'robots'}); rb = rb.get('content') if rb else ''
    h1 = len(s.find_all('h1'))
    ld = []
    for sc in s.find_all('script', type='application/ld+json'):
        try:
            j = json.loads(sc.string or '{}')
        except Exception as e:
            issues['invalid JSON-LD'].append(u); continue
        for it in (j if isinstance(j, list) else j.get('@graph', [j])):
            ty = it.get('@type'); ld.append(ty)
            if ty in ('LocalBusiness', 'Organization') or (isinstance(ty, list)): entities[(json.dumps(ty), it.get('name'), it.get('@id'))] += 1
    types_by_page[u] = ld
    for m in s.find_all('meta', attrs={'property': 'og:image'}) + s.find_all('meta', attrs={'name': 'twitter:image'}):
        h = re.sub(r'^https?://([^/]+).*', r'\1', m.get('content', ''))
        if h != 'fish-cabo.com': og_ext[h] += 1
    for a in s.select('main a[href], header a[href], footer a[href]'):
        h = a['href']
        if h.startswith('/') and not h.startswith('//'): links[h.split('#')[0].split('?')[0] or '/'] += 1
    if not t: issues['empty title'].append(u)
    if t and re.search(r'<|&lt;', t): issues['markup in title'].append(f'{u}: {t}')
    if not d: issues['missing meta description'].append(u)
    if not c: issues['missing canonical'].append(u)
    elif not c.startswith(SITE): issues['canonical not on fish-cabo.com'].append(f'{u}: {c}')
    if 'noindex' in rb: issues['meta noindex'].append(u)
    if h1 == 0: issues['no H1'].append(u)
    if h1 > 1: issues['several H1'].append(f'{u} ({h1})')
    if 'workers.dev' in open(f).read(): issues['staging host referenced'].append(u)
    rows.append((u, t, c, h1))
titles = collections.Counter(r[1] for r in rows)
for t, n in titles.items():
    if n > 1: issues['duplicate title'].append(f'{t} ×{n}: ' + ', '.join(r[0] for r in rows if r[1] == t))
canon_self = {r[0]: (r[2] or '').replace(SITE, '') or '/' for r in rows}
for u in sm_urls:
    if u not in pages: issues['sitemap URL without page'].append(u)
    elif canon_self[u] != u: issues['sitemap URL not self-canonical'].append(f'{u} → {canon_self[u]}')
for u in pages:
    if u not in sm_urls and canon_self.get(u) == u: issues['indexable page not in sitemap'].append(u)
for l in links:
    l2 = __import__('urllib.parse').parse.unquote(l)
    if l2 not in pages and l not in pages and not os.path.exists(D + l) and l not in ('/api/contact',): issues['broken internal link'].append(l)
dec = {__import__('urllib.parse').parse.unquote(k) for k in links}
orph = [u for u in pages if u not in dec and u != '/']
print(f'pages analysed: {len(pages)} · sitemap URLs: {len(sm_urls)} · distinct internal link targets: {len(links)}')
for k, v in issues.items():
    print(f'\n## {k} ({len(v)})'); [print('  -', x) for x in v[:40]]
print('\n## business entities (type, name, @id) × pages'); [print('  ', k, n) for k, n in entities.items()]
print('\n## og/twitter images on external hosts', dict(og_ext))
print('\n## pages with no internal link pointing to them (excluding /)', orph)
json.dump({'issues': issues, 'types_by_page': types_by_page}, open('/tmp/seo-audit.json', 'w'), indent=1)
