# Exotic Fish Cabo: Audit and Migration Notes (Phase 1–3)

Audit date: 2026-11-02. Source: live fish-cabo.com (Squarespace 7.1), read through a browser. Squarespace was not modified.

## 1. URL inventory (81 URLs = sitemap + homepage)

| Group | Count | URLs |
|---|---|---|
| Core pages | 9 | `/`, `/fishing-charters`, `/fishing-boats`, `/contact`, `/fish-species`, `/fishing-calendar`, `/cabo-fishing-faq`, `/cabo-fishing-tournaments`, `/cabo-fishing` |
| Boat pages | 10 | `/fishing-boats/23ft-panga`, `26ft-super-panga`, `27ft-premium-center-console`, `30ft-cuddy-cabin`, `31ft-premium-center-console`, `29-ft-catamaran-center-console`, `35ft-premium-cuddy-cabin`, `38ft-flybridge`, `44ft-premium-flybridge`, `37ft-ultimate-fishing-machine` |
| Species / SEO landing pages | 8 | `/marlin-fishing-cabo`, `/tuna-fishing-cabo`, `/dorado-fishing-cabo`, `/wahoo-fishing-cabo`, `/roosterfish-fishing-cabo`, `/deep-sea-fishing-charters`, `/deep-sea-fishing-cabo`, `/cabo-san-lucas-fishing-charters` |
| Fishing grounds | 7 | `/puerto-los-cabos-fishing`, `/gordo-banks-fishing`, `/iman-bank-…`, `/la-fortuna-…`, `/el-25-…`, `/vinorama-…`, `/san-luis-fishing-san-jose-del-cabo` |
| Guides | 3 | `/fishing-guide-for-newbies`, `/family-fishing-charters-san-jose-del-cabo`, `/what-to-bring-fishing-cabo` |
| Fishing Reports | 37 | `/fishing-reports` + 36 articles (16 weekly Logs + 20 guest stories) |
| Videos | 7 | `/cabo-fishing-videos` + 6 `/cabo-fishing-videos/v/…` |

Every URL returns 200. **All slugs are kept unchanged in the new site.** No 301 redirect is needed for public URLs.

Linked from the footer but missing from the sitemap: `/terms-conditions` and `/privacy-policy`. Their status needs checking in Phase 6.

## 2. SEO issues found (current site)

1. **Two conflicting LocalBusiness entities**: one named "Exotic Fish Cabo" (`#business`) and one named "Fish Cabo". Fixed: the new site publishes a single entity, referenced by `@id`.
2. **`<br/>` inside 5 `<title>` tags** (marlin, tuna, dorado, wahoo, roosterfish pages). To fix in Phase 6.
3. **`/cabo-fishing` duplicates the homepage** (same content, canonical → `/`). It stays in place with its canonical, and it is removed from the new sitemap.
4. **Video pages have no H1** (6 pages).
5. **`/fishing-reports` has 21 H1 tags** (one per post) and 21 images without alt text.
6. **About 60 images without alt text**, mostly the main image of each Fishing Log.
7. Duplicate slugs from the Squarespace editor (`…-6hzga-zr7h7`, `…-2mfar-ajlnf-px5gd`, `sansan-jose-…`): **kept as they are** (they are indexed), with no change.
8. The `/fishing-charters` meta description does not contain the target keyword. Changed in the prototype (see §5).

## 3. Measured design (preserved)

- Fonts: **Syne 700** (uppercase headings, letter-spacing −0.03em) + **Syne Mono 400** (body text); Arial 600 at 12px for the menu.
- Colors: orange `#FB7704` (Latest Log section), orange `#FF8A00` (footer button, hover states), yellow `#FFCD38` (BOOK NOW), black `#000`, `#171717`, white `#FFF` / `#FAFAFA`, gray `#DCDCDC` (H1 on banners).
- Fluid type scale identical to the Squarespace theme on desktop (H1 = 3.84vw + 18px, etc.).
- Transparent header over the hero; "Explore Fishing" dropdown (dark panel, 245px, 10px radius); MARINA GPS and BOOK NOW buttons; fixed bottom bar on mobile.
- Black footer (efc-footer): logo, 2 CTAs, 4 menu columns (accordion on mobile), departure info, Google reviews.

## 4. Commercial integrations found

| Feature | Current implementation | Status in prototype |
|---|---|---|
| BOOK NOW | link → `/fishing-boats` | ✅ identical |
| MARINA GPS | Google Maps (23.0600625, −109.6706875) | ✅ identical |
| Payment | **Stripe Payment Links per boat** + Wise + PayPal (on boat pages) | ⏳ Phase 6 (boat pages) |
| Contact form | Squarespace component on `/contact` | ⏳ Phase 6 (Worker + Turnstile) |
| Chat assistant | EN/ES/FR JS script (~23 KB) with handoff to WhatsApp +52 624 122 3506 | ⚠️ Prototype: direct WhatsApp button. Full script ported in Phase 6 |
| Latest Fishing Log | Squarespace RSS fetched client-side | ✅ generated at build time (no JS) |
| Google reviews | g.page links | ✅ identical |

## 5. Deliberate changes in the prototype (to approve)

- `/fishing-charters` meta description: replaced with "Private fishing charters in San José del Cabo from $350…" (the old one had no target keyword). Title and H1 unchanged.
- Light darkening (35%) behind the H1 on the Fishing Charters banner: gray text on a bright photo was hard to read.
- Boat cards: uniform structure (buttons aligned at the bottom, consistent text alignment) instead of the uneven Squarespace grid.
- Mobile: the WhatsApp bubble used to cover the BOOK NOW button. It now sits above the bar.
- "Why Fish With Exotic Fish Cabo": the heading was merged with the first list item (Squarespace formatting bug). Now split. Text unchanged.

## 6. Known technical limits (current session)

- The work environment cannot reach `fish-cabo.com`, `images.squarespace-cdn.com`, the PageSpeed API or the Cloudflare API (network allowlist). Images therefore stay on the Squarespace CDN for staging. Before cut-over they must be copied into the project.
- Squarespace performance measurements are pending: they need the PageSpeed API or a GitHub Action. **No figure has been invented.**
