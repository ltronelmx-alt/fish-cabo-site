# Builds the Fishing Reports content collection (one .md per article) from the ORIGINAL export.
# Body = original article HTML (verbatim, cleaned of Squarespace wrappers); head = original tags.
import json, glob, re, os, html as H
from bs4 import BeautifulSoup
ORIG = 'src/data/original/fishing-reports/'
OUT = 'src/content/fishing-reports/'
listing = json.load(open('src/data/original/fishing-reports.json'))
lst = listing['sections'][2]['blocks'][0]['html']
excerpts = {}; thumbs = {}; order = []
for item in re.split(r'(?=<article>)', lst)[1:]:
    mm = re.search(r'<h1>\s*<a href="/fishing-reports/([^"]+)"', item)
    if mm:
        order.append(mm.group(1))
        ti = re.search(r'^<article>\s*<a href="[^"]+">\s*<img alt="([^"]*)" data-path="([^"]+)"', item)
        thumbs[mm.group(1)] = {'src': ti.group(2), 'alt': ti.group(1)} if ti else None
    m = re.search(r'<h1>\s*<a href="/fishing-reports/([^"]+)"', item); p = re.search(r'</h1>\s*<p>([\s\S]*?)</p>', item)
    if m and p: excerpts[m.group(1)] = p.group(1).strip()
rss = BeautifulSoup(open('/home/claude/export/site/rss-reports.xml').read(), 'xml')
for it in rss.select('item'):
    slug = it.link.text.rstrip('/').split('/')[-1]
    desc = BeautifulSoup(it.description.text if it.description else '', 'lxml').get_text(' ', strip=True)
    excerpts.setdefault(slug, desc)
for f in glob.glob(OUT + '*.md'): os.remove(f)
q = lambda s: json.dumps(s, ensure_ascii=False)
n = 0
for f in sorted(glob.glob(ORIG + '*.json')):
    slug = os.path.basename(f)[:-5]
    d = json.load(open(f))
    body = d['sections'][0]['blocks'][0]['html']
    soup = BeautifulSoup(body, 'lxml')
    title = soup.find('h1').get_text(' ', strip=True)
    dt = soup.find('time')['datetime']
    cat_a = soup.find('a', href=re.compile(r'/fishing-reports/category/'))
    category = cat_a.get_text(strip=True) if cat_a else ''
    tags = [a.get_text(strip=True) for a in soup.find_all('a', rel='tag')]
    img = soup.find('img', attrs={'data-path': True})
    headsoup = BeautifulSoup(''.join(d['head']), 'lxml')
    seo_title = headsoup.title.get_text() if headsoup.title else title
    md = headsoup.find('meta', attrs={'name': 'description'})
    desc = md['content'] if md else ''
    exc = excerpts.get(slug); src = 'listing-or-rss' if exc else 'meta-description (original excerpt not in export)'
    if not exc: exc = desc
    fm = ['---', f'title: {q(title)}', f'seoTitle: {q(seo_title)}', f'description: {q(desc)}', f'date: {dt}', f'category: {q(category)}',
          f'tags: {q(tags)}', 'author: "EXOTIC FISH-CABO"',
          f'image: {q({"src": img["data-path"], "alt": img.get("alt", "")} if img else None)}',
          f'thumbnail: {q(thumbs[slug] if slug in thumbs else ({"src": img["data-path"], "alt": ""} if img else None))}',
          f'thumbnailSource: {q("listing" if slug in thumbs else "article first image (listing page 2 not exported)")}',
          f'listingRank: {order.index(slug) if slug in order else 999}',
          f'excerpt: {q(exc)}', f'excerptSource: {q(src)}', 'format: "html"', 'draft: false',
          f'originalHead: {q(d["head"])}', '---', '']
    open(OUT + slug + '.md', 'w').write('\n'.join(fm) + body + '\n')
    n += 1
print(n, 'articles written')
