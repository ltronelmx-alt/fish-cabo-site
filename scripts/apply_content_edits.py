"""Owner-approved text corrections (src/data/content-edits.json).
apply_json(): applies them once to src/data/original/<page>.json (idempotent).
apply_export(html, slug): used by verify-original.py on the Squarespace export, so the verbatim check accepts exactly these edits."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EDITS = json.load(open(os.path.join(HERE, '..', 'src', 'data', 'content-edits.json'), encoding='utf-8'))['edits']
SLUG = {'index': 'home'}

def apply_export(html, slug):
    slug = SLUG.get(slug, slug)
    for e in EDITS:
        if e['page'] != slug: continue
        html = html.replace(e.get('export_find', e['find']), e.get('export_replace', e['replace']))
    return html

def _walk(o, e):
    if isinstance(o, dict): return {k: _walk(v, e) for k, v in o.items()}
    if isinstance(o, list): return [_walk(v, e) for v in o]
    if isinstance(o, str):
        if e.get('exact'): return e['replace'] if o == e['find'] else o
        # idempotent: skip when the replacement is already there (an empty replacement = deletion, always safe to repeat)
        return o.replace(e['find'], e['replace']) if not e['replace'] or e['replace'] not in o else o
    return o

def apply_json():
    root = os.path.join(HERE, '..', 'src', 'data', 'original')
    for e in EDITS:
        f = os.path.join(root, e['page'] + '.json')
        d = json.load(open(f, encoding='utf-8'))
        before = json.dumps(d, ensure_ascii=False)
        d2 = _walk(d, e)
        after = json.dumps(d2, ensure_ascii=False)
        n = before.count(e['find']) if not e.get('exact') else before.count('"' + e['find'] + '"')
        if before != after:
            json.dump(d2, open(f, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
            open(f, 'a').write('\n')
        print(f"{'OK ' if (before != after or e['replace'] in before) else 'MISS'} {e['page']}: {e['find'][:60]}  ({n} match)")

if __name__ == '__main__':
    apply_json()
