# Owner-approved link corrections (the only intentional differences from the Squarespace original).
# 2026-11-03: Iman Bank page linked "wahoo" to /wahoo-... (404 on the live site); the post lives under /fishing-reports/.
LINK_FIXES = {
    '/wahoo-fishing-san-jose-del-cabo-august-2026': '/fishing-reports/wahoo-fishing-san-jose-del-cabo-august-2026',
}
def fix_html(s):
    for old, new in LINK_FIXES.items():
        s = s.replace(f'href="{old}"', f'href="{new}"').replace(f'href=\\"{old}\\"', f'href=\\"{new}\\"')
    return s
