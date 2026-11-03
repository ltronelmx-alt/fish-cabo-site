# Mirror of src/lib/seo-fixes.ts for the verifier: applies the SAME documented SEO fixes (F1–F6) to the
# original Squarespace export, so verify-original.py accepts exactly these changes and nothing else.
import json, re, os
from urllib.parse import unquote_plus
HERE = os.path.dirname(os.path.abspath(__file__))
MAN = json.load(open(os.path.join(HERE, '..', 'src', 'data', 'media-manifest.json')))
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

def _og(m):
    u = m.group(0); u2 = ('https:' + u) if u.startswith('//') else u
    k = re.sub(r'^https?:', '', u2).split('?')[0]
    return SITE + OG[k] if k in OG else u

def fix_head_tag(t):
    if re.search(r'application/ld\+json', t) and re.search(r'"name"\s*:\s*"Fish Cabo"', t) and '"@id"' not in t:
        return None  # F2
    if t.startswith('<title') or re.search(r'property="og:title"|name="twitter:title"|itemprop="name"', t):
        t = re.sub(r'\s*(?:&lt;|<)br\s*/?(?:&gt;|>)', '', t, flags=re.I)  # F1
    if re.search(r'og:image|twitter:image|itemprop="image"|thumbnailUrl|application/ld\+json', t):
        t = CDN.sub(_img, t)  # F6
        t = re.sub(r'(?:https?:)?//static1\.squarespace\.com/[^"\s]+', _og, t)  # F6b
    return t

def fix_soup(soup, slug):
    """Apply F1/F2/F6 on <head>, F4/F5/listing H1→H2 on the body of the ORIGINAL page (BeautifulSoup, in place)."""
    from bs4 import BeautifulSoup
    for tag in list(soup.head.find_all(['title', 'meta', 'link', 'script'])):
        new = fix_head_tag(str(tag))
        if new is None: tag.decompose(); continue
        if new != str(tag): tag.replace_with(BeautifulSoup(new, 'html.parser'))
    main = soup.select_one('article#page-regions') or soup.select_one('main') or soup
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
