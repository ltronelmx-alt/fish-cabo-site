# Full crawl of the PRODUCTION build served by the local Cloudflare runtime (wrangler dev), raw export for an independent audit.
# Starts from / + sitemap.xml, follows every internal link found. Output: docs/crawl/crawl.csv, crawl.json, html.zip
import csv, json, re, sys, urllib.request, urllib.parse, zipfile, collections
from bs4 import BeautifulSoup
BASE = 'http://127.0.0.1:8787'; SITE = 'https://fish-cabo.com'
def get(path):
    req = urllib.request.Request(BASE + path, headers={'User-Agent': 'Mozilla/5.0 (crawl-export)'})
    try:
        r = urllib.request.urlopen(req, timeout=20); return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
st, _, sm = get('/sitemap.xml')
queue = ['/', '/cabo-fishing', '/fishing-reports/older', '/this-page-does-not-exist'] + [urllib.parse.unquote(u.replace(SITE, '')) or '/' for u in re.findall(r'<loc>([^<]+)</loc>', sm.decode())]
seen, rows, inlinks = set(), [], collections.Counter()
z = zipfile.ZipFile('docs/crawl/html.zip', 'w', zipfile.ZIP_DEFLATED)
for extra in ['/robots.txt', '/sitemap.xml']:
    s, h, b = get(extra); z.writestr('raw' + extra, b)
# _headers is Cloudflare configuration, not a served file (requesting it returns the 404 page): export the file itself
z.writestr('raw/_headers.txt', open('dist/_headers', 'rb').read())
# plus the ACTUAL HTTP response headers for representative resources
samples = ['/', '/fishing-boats/23ft-panga', '/fishing-reports?offset=1784496649612', '/admin/', '/robots.txt', '/sitemap.xml',
           '/js/efc-chat.js', '/fonts/syne-latin-700-normal.woff2', '/this-page-does-not-exist']
import os
for d in ('media', 'og'):
    f = next((x for x in sorted(os.listdir('dist/' + d)) if '.' in x), None) if os.path.isdir('dist/' + d) else None
    if d == 'media': f = next((os.path.join(r, x)[len('dist'):] for r, _, fs in os.walk('dist/media') for x in fs), None)
    elif f: f = '/og/' + f
    if f: samples.append(f)
txt = ''
for sp in samples:
    s, h, b = get(urllib.parse.quote(sp, safe='/?=&'))
    txt += f'### {sp}\nHTTP {s}\n' + ''.join(f'{k}: {v}\n' for k, v in h.items()) + '\n'
z.writestr('raw/response-headers.txt', txt)
while queue:
    p = queue.pop(0)
    if p in seen: continue
    seen.add(p)
    s, h, b = get(urllib.parse.quote(p, safe='/?=&'))
    ct = h.get('Content-Type', '')
    row = {'url': SITE + p, 'status': s, 'content_type': ct.split(';')[0], 'x_robots_tag': h.get('X-Robots-Tag', ''), 'bytes': len(b)}
    if 'html' in ct:
        z.writestr('pages' + (p if p != '/' else '/index') + '.html', b)
        soup = BeautifulSoup(b, 'lxml')
        g = lambda **kw: (soup.find('meta', attrs=kw) or {}).get('content', '') if soup.find('meta', attrs=kw) else ''
        canon = soup.find('link', rel='canonical')
        lds = []
        for sc in soup.find_all('script', type='application/ld+json'):
            try:
                j = json.loads(sc.string or '{}'); lds += [str(i.get('@type')) for i in (j if isinstance(j, list) else j.get('@graph', [j]))]
            except Exception: lds.append('INVALID')
        main = soup.find('main') or soup
        links = [a['href'] for a in soup.find_all('a', href=True)]
        internal = sorted({urllib.parse.unquote(l.split('#')[0]) for l in links if l.startswith('/') and not l.startswith('//')})
        for l in internal:
            inlinks[l.split('?')[0] or '/'] += 1
            lp = l if '?offset=' in l else l.split('?')[0]
            if lp and lp not in seen and not lp.startswith('/admin') and not lp.startswith('/api'): queue.append(lp)
        imgs = main.find_all('img')
        row.update({
            'title': soup.title.get_text() if soup.title else '', 'title_len': len(soup.title.get_text()) if soup.title else 0,
            'meta_description': g(name='description'), 'meta_robots': g(name='robots'),
            'canonical': canon['href'] if canon else '', 'self_canonical': (canon['href'] if canon else '').rstrip('/') in ((SITE + p).rstrip('/'), (SITE + urllib.parse.quote(p, safe='/?=&')).rstrip('/')),
            'h1_count': len(soup.find_all('h1')), 'h1': ' | '.join(h.get_text(' ', strip=True) for h in soup.find_all('h1')),
            'h2_count': len(soup.find_all('h2')), 'og_title': g(property='og:title'), 'og_image': g(property='og:image'),
            'twitter_card': g(name='twitter:card'), 'lang': (soup.html or {}).get('lang', ''), 'jsonld_types': ';'.join(lds),
            'internal_links': len(internal), 'external_links': len([l for l in links if l.startswith('http') and 'fish-cabo.com' not in l]),
            'images': len(imgs), 'images_missing_alt': sum(1 for i in imgs if i.get('alt') is None), 'images_empty_alt': sum(1 for i in imgs if i.get('alt') == ''),
            'word_count': len(main.get_text(' ', strip=True).split()),
        })
    rows.append(row)
for r in rows: r['inlinks'] = inlinks.get(urllib.parse.unquote(r['url'].replace(SITE, '')).split('?')[0] or '/', 0)
keys = list(dict.fromkeys(k for r in rows for k in r))
with open('docs/crawl/crawl.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(rows)
json.dump(rows, open('docs/crawl/crawl.json', 'w'), indent=1, ensure_ascii=False)
z.close()
c = collections.Counter(r['status'] for r in rows)
print(f'{len(rows)} URLs crawled · status {dict(c)} · html pages {sum(1 for r in rows if "title" in r)}')
