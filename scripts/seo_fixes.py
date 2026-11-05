# Mirror of src/lib/seo-fixes.ts for the verifier: applies the SAME documented SEO fixes (F1–F6) to the
# original Squarespace export, so verify-original.py accepts exactly these changes and nothing else.
import json, re, os
from urllib.parse import unquote_plus
HERE = os.path.dirname(os.path.abspath(__file__))
MAN = json.load(open(os.path.join(HERE, '..', 'src', 'data', 'media-manifest.json')))
ALTS = {k: v for k, v in json.load(open(os.path.join(HERE, '..', 'src', 'data', 'alt-fixes.json'))).items() if not k.startswith('_')}
OG = json.load(open(os.path.join(HERE, '..', 'src', 'data', 'og-mirror.json')))
SITE = 'https://fish-cabo.com'
CDN = re.compile(r'(?:https?:)?//images\.squarespace-cdn\.com/content/v1/6911316472567617bebc28b5/([^"?\s)]+)(?:\?[^"\s)]*)?')

def _key(p):
    p = unquote_plus(p).rstrip('/')
    i, rest = p.split('/', 1)
    rest = re.sub(r'\.[a-z0-9]+$', '', rest, flags=re.I).lower()
    return i + '/' + re.sub(r'[^a-z0-9]+', '-', rest).strip('-')

def _img(m):
    k = _key(m.group(1)); e = MAN.get(k)
    return f"{SITE}/media/{k}-{e['widths'][-1]}.webp" if e else m.group(0)

BYNAME = {}
for _k in MAN: BYNAME.setdefault(_k.split('/', 1)[1], []).append(_k)

def _og(m):
    u = m.group(0); u2 = ('https:' + u) if u.startswith('//') else u
    k = re.sub(r'^https?:', '', u2).split('?')[0]
    if k in OG: return SITE + OG[k]
    name = _key('x/' + k.rsplit('/', 1)[1])[2:]
    hits = BYNAME.get(name, [])
    return f"{SITE}/media/{hits[0]}-{MAN[hits[0]]['widths'][-1]}.webp" if len(hits) == 1 else u

def hero_fallback(slug):
    try: page = json.load(open(os.path.join(HERE, '..', 'src', 'data', 'original', (slug or 'home') + '.json')))
    except Exception: return None
    first = (page.get('sections') or [{}])[0]
    p = (first.get('bg') or {}).get('path') or next((b.get('path') for b in first.get('blocks', []) if b.get('kind') == 'img'), None)
    e = MAN.get(_key(p)) if p else None
    if not e: return None
    w = e['widths'][-1]; return (f"{SITE}/media/{_key(p)}-{w}.webp", w, round(e['height'] * w / e['width']))

def fix_head_tag(t, fb=None, used=None):
    if re.search(r'application/ld\+json', t) and re.search(r'"name"\s*:\s*"Fish Cabo"', t) and '"@id"' not in t:
        return None  # F2
    if t.startswith('<title') or re.search(r'property="og:title"|name="twitter:title"|itemprop="name"', t):
        t = re.sub(r'\s*(?:&lt;|<)br\s*/?(?:&gt;|>)', '', t, flags=re.I)  # F1
    if re.search(r'og:image|twitter:image|itemprop="image"|thumbnailUrl|application/ld\+json', t):
        t = CDN.sub(_img, t)  # F6
        t = re.sub(r'(?:https?:)?//static1\.squarespace\.com/[^"\s]+', _og, t)  # F6b
        if fb and re.search(r'property="og:image"|name="twitter:image"|itemprop="(?:image|thumbnailUrl)"', t) and 'static1.squarespace.com' in t:
            og = bool(re.search(r'og:image|twitter:image', t))
            t = re.sub(r'content="[^"]*"', f'content="{fb[0]}"', t, count=1)  # F6c
            if og: used.append(1)
    if re.search(r'name="twitter:card"', t): t = t.replace('content="summary"', 'content="summary_large_image"')  # F12
    if fb and re.search(r'property="og:image"|name="twitter:image"', t) and 'logo-low-res-fishing-san-jose-del-cabo' in t:  # F12
        og = 'og:image' in t
        t = re.sub(r'content="[^"]*"', f'content="{fb[0]}"', t, count=1)
        if og: used.append(1)
    return t

def fix_soup(soup, slug):
    """Apply F1/F2/F6 on <head>, F4/F5/listing H1→H2 on the body of the ORIGINAL page (BeautifulSoup, in place)."""
    from bs4 import BeautifulSoup
    fb = None if slug.startswith('fishing-reports/') else hero_fallback('home' if slug in ('index', 'cabo-fishing', '') else slug); used = []
    for tag in list(soup.head.find_all(['title', 'meta', 'link', 'script'])):
        new = fix_head_tag(str(tag), fb, used)
        if new is None: tag.decompose(); continue
        if new != str(tag): tag.replace_with(BeautifulSoup(new, 'html.parser'))
    if used:
        for m in soup.head.find_all('meta', attrs={'property': 'og:image:width'}): m['content'] = str(fb[1])
        for m in soup.head.find_all('meta', attrs={'property': 'og:image:height'}): m['content'] = str(fb[2])
    main = soup.select_one('article#page-regions') or soup.select_one('main') or soup
    for im in soup.find_all('img'):  # A1
        if im.get('alt', None) == '':
            src = ' '.join(str(im.get(a, '')) for a in ('src', 'data-src', 'data-image', 'srcset'))
            hit = next((v for k, v in ALTS.items() if k in src), None)
            if hit: im['alt'] = hit
    if slug.startswith('cabo-fishing-videos/v/') and not main.find('h1'):
        h = main.find('h2')
        if h: h.name = 'h1'  # F4
    if slug.startswith('fishing-reports/') and slug.count('/') == 1:
        hs = main.find_all('h1')
        for h in hs[1:]: h.name = 'h2'  # F5
    if slug == 'fishing-reports':
        for h in main.find_all('h1'):
            if h.find('a'): h.name = 'h2'  # listing items (linked titles): one H1 per page
    return soup
