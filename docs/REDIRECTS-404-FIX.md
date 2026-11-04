# Search Console 404s: fix report (2026-11-04)

**Source:** `fish-cabo.com-Coverage-Drilldown-2026-11-04.xlsx` (Not found (404), 11 URLs, last crawled from 2026-04-28 to 2026-10-23).

**Diagnosis:**
- The 11 URLs returned a real **404** on production (Cloudflare), with no redirect.
- They were already 404 on Squarespace: the crawl dates are before the migration, and the chart shows 7–13 pages in this state since August.
- Their content exists **nowhere**: not in the Squarespace export, the CMS or the repository. They are deleted posts and old slugs.
- Restoring them was therefore not possible. Each URL is now a **permanent 301** to the closest equivalent page. Nothing is redirected to the homepage.

**Extra defect found during the check:** `www.fish-cabo.com` served the whole site as a duplicate (200, not redirected). It is now **301 → `https://fish-cabo.com` + same path and query**. A www request to an old URL goes straight to the final page in **one hop**.

**Implementation:** `src/data/redirects.json`, applied in `worker/index.ts`. No page, text, design or DNS was changed.

## Before / after

| Old URL (Search Console) | Before | After | Destination (final status, canonical) | Why this destination |
|---|---|---|---|---|
| /fishing-reports/african-pompano-fishing-san-jose-del-cabo-xa4hg | 404 | 301 | /fish-species (200, self-canonical) | Deleted African pompano report; the species guide has the "African Pompano (Palometa)" section |
| /fishing-reports/giant-roosta-fishing-san-jose-del-cabo-7sgpw | 404 | 301 | /roosterfish-fishing-cabo (200, self) | Deleted roosterfish ("roosta") report; species guide |
| /fishing-reports/roosterfish-sun-fishing-san-jose-del-cabo | 404 | 301 | /roosterfish-fishing-cabo (200, self) | Deleted roosterfish report |
| /fishing-reports/gordo-banks-fishing-san-jose-del-cabo-mraem | 404 | 301 | /gordo-banks-fishing (200, self) | Deleted Gordo Banks report; the Gordo Banks page |
| /fishing-reports/giant-rooster-fishing-san-jose-del-cabo-5ggth | 404 | 301 | /roosterfish-fishing-cabo (200, self) | Deleted roosterfish report |
| /san-jose-del-cabo-fishing-charters | 404 | 301 | /fishing-charters (200, self) | Old charters slug |
| www…/contact-san-jose-del-cabo-fishing-charters-sport-fishing-cabo-exotic-fish-cabo | 404 | 301 (single hop) | /contact (200, self) | Old contact slug |
| www…/fish-species-in-san-jose-del-cabo | 404 | 301 (single hop) | /fish-species (200, self) | Old species slug |
| /tournaments-fishing-san-jose-del-cabo | 404 | 301 | /cabo-fishing-tournaments (200, self) | Old tournaments slug |
| www…/fish-species-fishing-trophy-marlin-exotic-fish-cabo | 404 | 301 (single hop) | /marlin-fishing-cabo (200, self) | Old marlin slug |
| www…/san-jose-del-cabo-fishing-reports-fishing-reports-cabo | 404 | 301 (single hop) | /fishing-reports (200, self) | Old reports slug |

## Tests

- **Local, with the production Worker:**
  - the 11 paths return **301**, with and without a trailing slash;
  - www returns 301 to the apex for `/`, a page, a page with a query, and an old URL (direct to its final page).
- **Live on fish-cabo.com (after deployment, commit f2f5bd5):**
  - the 11 URLs redirect and end on the expected page;
  - final status 200, canonical = the destination itself, no X-Robots-Tag;
  - `www.fish-cabo.com/fish-species-in-san-jose-del-cabo` lands on `https://fish-cabo.com/fish-species`.
- **Regression (live):**
  - 200 on `/`, /fishing-charters, a boat page, /fishing-reports, the `?offset=` page, a Fishing Report, /iman-bank… and sitemap.xml;
  - an unknown URL still returns **404**: no blanket redirect.
- **Content and QA:** verifier 581/581; QA 145/145.

## Owner action

In Search Console, open **Pages → Not found (404) → VALIDATE FIX**. Google re-crawls the URLs over the following days.
