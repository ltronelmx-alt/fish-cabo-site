# Extracts content and SEO tags VERBATIM from the exported Squarespace pages.
# Text, heading levels, links, alt texts, meta tags and JSON-LD are kept exactly;
# only Squarespace's presentational attributes/wrappers are removed.
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from link_fixes import fix_html
from bs4 import BeautifulSoup, NavigableString, Comment

SRC = '/home/claude/export/site/pages/'
OUT = '/home/claude/fish-cabo/src/data/original/'
CDN = 'https://images.squarespace-cdn.com/content/v1/6911316472567617bebc28b5/'
KEEP = {'a': ['href', 'target', 'rel'], 'img': ['alt', 'data-path', 'data-ext'], 'iframe': ['src', 'title', 'allow', 'allowfullscreen'], 'time': ['datetime'], 'source': [], 'video': [], 'td': ['colspan', 'rowspan'], 'th': ['colspan', 'rowspan']}
UNWRAP = {'span', 'div', 'font'}

def clean(node):
    node = BeautifulSoup(str(node), 'lxml')
    for t in node(['script', 'style', 'noscript', 'svg']): t.decompose()
    for c in node.find_all(string=lambda s: isinstance(s, Comment)): c.extract()
    for im in node.find_all('img'):
        pth = path_of(im.get('data-src') or im.get('data-image') or im.get('src'))
        if pth: im['data-path'] = pth
        elif im.get('src') or im.get('data-src'): im['data-ext'] = (im.get('data-src') or im.get('src'))
    for ifr in node.find_all('iframe'):
        if ifr.get('data-src') and not ifr.get('src'): ifr['src'] = ifr['data-src']
    for el in node.find_all(True):
        if el.name in UNWRAP: el.unwrap(); continue
        el.attrs = {k: v for k, v in el.attrs.items() if k in KEEP.get(el.name, [])}
    body = node.body or node
    html = ''.join(str(c) for c in body.contents)
    return html.strip()

def path_of(url):
    url = (url or '').split('?')[0]
    return url.split('/6911316472567617bebc28b5/', 1)[1].rstrip('/') if '/6911316472567617bebc28b5/' in url else None

def grid_areas(soup):
    areas = {}
    css = '\n'.join(s.get_text() for s in soup.select('style'))
    for m in re.finditer(r'@media \(min-width: ?768px\)\s*\{([\s\S]*?)\n\s*\}\s*\n', css):
        for r in re.finditer(r'\.fe-block-([\w-]+)\s*\{[^}]*?grid-area:\s*([\d\s/]+)', m.group(1)):
            areas[r.group(1)] = [int(x) for x in r.group(2).split('/')]
    return areas

def page(name, slug):
    soup = BeautifulSoup(open(SRC + name).read(), 'lxml')
    head_tags = []
    for el in soup.head.find_all(['title', 'meta', 'link', 'script'], recursive=True):
        if el.name == 'title': head_tags.append(str(el))
        elif el.name == 'meta' and (el.get('name') in ('description', 'twitter:title', 'twitter:image', 'twitter:url', 'twitter:card', 'twitter:description') or (el.get('property') or '').startswith('og:') or el.get('itemprop')):
            head_tags.append(str(el))
        elif el.name == 'link' and el.get('rel') == ['canonical']: head_tags.append(str(el))
        elif el.name == 'script' and el.get('type') == 'application/ld+json': head_tags.append(str(el))
    body_ld = [str(s) for s in soup.body.select('script[type="application/ld+json"]')]
    areas = grid_areas(soup)
    sections = []
    for sec in soup.select('article#page-regions section.page-section') or soup.select('main article.sections > section') or soup.select('section.page-section'):
        bg = sec.select_one('.section-background img')
        blocks = []
        for i, fe in enumerate(sec.select('.fe-block')):
            fid = next((c[9:] for c in fe.get('class', []) if c.startswith('fe-block-')), '')
            ga = areas.get(fid, [999, 999, 0, 0])
            sb = fe.select_one('.sqs-block')
            btype = (sb.get('data-sqsp-block') or sb.get('data-block-type') or '') if sb else ''
            img = fe.select_one('img')
            btn = fe.select_one('a.sqs-block-button-element, .sqs-block-button a, a.sqs-button-element--primary, a.sqs-button-element--secondary')
            text = fe.select_one('.sqs-html-content')
            if btn and not text:
                blocks.append({'kind': 'button', 'href': btn.get('href'), 'text': btn.get_text(' ', strip=True), 'ga': ga, 'dom': i})
            elif img and not text:
                a = img.find_parent('a')
                blocks.append({'kind': 'img', 'path': path_of(img.get('data-src') or img.get('src')), 'alt': img.get('alt', ''), 'link': a.get('href') if a else None, 'ga': ga, 'dom': i})
            elif text:
                blocks.append({'kind': 'text', 'html': clean(text), 'ga': ga, 'dom': i})
            else:
                content = fe.select_one('.sqs-block-content')
                blocks.append({'kind': 'code', 'html': clean(content) if content else '', 'ga': ga, 'dom': i, 'btype': btype})
        if not sec.select('.fe-block'):
            content = sec.select_one('.content') or sec
            kind = 'gallery' if 'gallery-section' in (sec.get('class') or []) else 'html'
            if content.get_text(strip=True) or content.select('img, iframe'):
                blocks.append({'kind': kind, 'html': clean(content), 'ga': [0, 0, 0, 0], 'dom': 0})
        blocks.sort(key=lambda b: (b['ga'][0], b['ga'][1], b['dom']))
        sections.append({'theme': sec.get('data-section-theme', ''), 'bg': {'path': path_of(bg.get('data-src') or bg.get('src')), 'alt': bg.get('alt', '')} if bg else None, 'blocks': blocks})
    raw = open(SRC + name).read()
    vids = list(dict.fromkeys(re.findall(r'https?:(?:\\/|/)(?:\\/|/)www\.youtube\.com(?:\\/|/)embed(?:\\/|/)([\w-]{6,})', raw)))
    out = {'lang': soup.html.get('lang', 'en-US'), 'head': head_tags, 'bodyLd': body_ld, 'sections': sections, 'videos': vids}
    out = json.loads(fix_html(json.dumps(out, ensure_ascii=False)))
    json.dump(out, open(OUT + slug + '.json', 'w'), ensure_ascii=False, indent=1)
    print(slug, len(sections), 'sections', sum(len(s['blocks']) for s in sections), 'blocks', len(head_tags), 'head tags', len(body_ld), 'body ld', 'no-area', sum(1 for s in sections for b in s['blocks'] if b['ga'][0] == 999))

import glob, os
if len(sys.argv) > 1 and sys.argv[1] == 'all':
    for f in sorted(glob.glob(SRC + '**/*.html', recursive=True)):
        rel = f[len(SRC):-5]
        slug = 'home' if rel == 'index' else rel
        os.makedirs(os.path.dirname(OUT + slug + '.json') or '.', exist_ok=True)
        page(rel + '.html', slug)
else:
    page('index.html', 'home'); page('fishing-charters.html', 'fishing-charters'); page('fishing-boats.html', 'fishing-boats')
