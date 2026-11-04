# Exotic Fish Cabo — SEO, GEO & AI-search technical audit (final)

**Date:** 2026-11-03
**Repository:** `ltronelmx-alt/fish-cabo-site` (branch `main`)
**Staging:** https://fish-cabo.small-boat-4235.workers.dev (noindex)
**Production:** https://fish-cabo.com (still on Squarespace, untouched)

## 1. Executive summary

- **Content.** The migrated site keeps every original URL, title, meta description, canonical, heading text, internal link, image alt and JSON-LD block. The only exceptions are the **9 documented technical fixes (F1–F8, plus the Iman Bank link fix L1)** listed in §5. The verbatim verifier, extended only with those individually documented rules (`scripts/seo_fixes.py`, `scripts/link_fixes.py`), still passes **581/581**.
- **Defects found and fixed:**
  - literal `<br/>` inside 5 SEO titles;
  - a second, conflicting LocalBusiness entity on the homepage, with different coordinates and an unverifiable rating;
  - a pagination page canonicalised to page one;
  - missing or duplicate H1s on 34 pages;
  - a homepage URL missing from the sitemap, which listed the non-canonical duplicate `/cabo-fishing` instead;
  - 2 orphan pages;
  - missing meta descriptions on 17 generated archive pages;
  - all 168 `og:image`/`twitter:image` references (plus JSON-LD images) still hosted by Squarespace.
- **Social images.** **7 of those Squarespace social images already return 404 on the live site today**, so their social previews are already broken in production. They are now self-hosted.
- **Staging protection.** Staging stays protected: `robots.txt Disallow: /`, an `X-Robots-Tag: noindex, nofollow` header and `<meta name="robots" content="noindex, nofollow">`. The production build emits none of these, except on `/admin/*`.
- **Performance.** Lighthouse 12 on the production build gives:
  - mobile: 99–100 performance, LCP 1.5–2.0 s, CLS 0, total weight 76–156 KiB, 13–14 KiB of JavaScript;
  - desktop: 100 performance.
- **Remaining blockers before cut-over:** real contact email delivery, a real Turnstile key, Cloudflare Access on staging, and the owner's decisions on the PayPal links and the existing boat and captain names (§9).

## 2. Methodology

| Step | Tool | Scope |
|---|---|---|
| Verbatim preservation | `scripts/verify-original.py`: export vs build. It compares DOM order, headings, links, alts, text blocks, head tags + JSON-LD, and lang | 83 exported pages |
| Technical SEO crawl of the **production** build | `scripts/seo-audit.py` (new). It checks titles, descriptions, canonicals, meta robots, H1 count, JSON-LD validity and entities, og/twitter image hosts, internal links, orphan pages, and sitemap ↔ canonical reconciliation | 101 HTML routes |
| Functional QA | `tests/qa.mjs` (Playwright) | 145 checks |
| Layout | `tests/layout.mjs`. It looks for overflow, overlap, covered content, payment-button styling, image upscaling, images taller than the screen, and oversized article images | 81 URLs × 3 widths |
| Lab performance | Lighthouse 12, simulated throttling, production build, served by the local Cloudflare runtime (`docs/lighthouse-local.tsv`) | 7 page types × mobile and desktop |
| Live staging | PageSpeed Insights (Google) for the homepage, plus in-browser checks of routes, headers, the contact API and the internal-link crawl | live workers.dev |

**What was not done:**
- **Google Rich Results Test and Schema.org validator:** not available from this sandbox. JSON-LD was parsed (0 invalid blocks) and its types and properties were reviewed manually.
- **Search Console:** no access, so there is no CrUX or field data.
- **Squarespace PSI:** only the homepage could be measured (see §8).

## 3. Pages analysed

There are 101 production routes:
- 81 URLs from the original sitemap (the homepage counts as `/`, see F7);
- `/`, `/terms-conditions` and `/privacy-policy`;
- 36 Fishing Reports;
- `/fishing-reports/older`, served at the original `?offset=` URL;
- 2 category pages and 15 tag pages;
- `/404` and `/admin` (excluded).

## 4. Findings by class

| Class | Finding | Status |
|---|---|---|
| Confirmed defect | `<br/>` (escaped `&lt;br/&gt;`) inside `<title>`, `og:title`, `twitter:title` and `itemprop=name` on /dorado, /marlin, /roosterfish, /tuna and /wahoo -fishing-cabo | **Fixed (F1)** |
| Confirmed defect | A second LocalBusiness JSON-LD block on `/` and `/cabo-fishing`:<br>• name "Fish Cabo", url `https://www.fish-cabo.com`<br>• geo 23.0615, −109.7080 (≈4 km west of the marina)<br>• `openingHours` and `aggregateRating 4.9/50` not shown anywhere on the site<br>• no `@id`<br>It contradicts the main entity `https://fish-cabo.com/#business` | **Fixed (F2)**: block removed. The main entity keeps `alternateName: ["Fish Cabo","Fish-Cabo"]` |
| Confirmed defect | `/fishing-reports/older`, the content of the Squarespace URL `/fishing-reports?offset=1784496649612`, had canonical = `/fishing-reports`, so unique older posts were canonicalised to page one | **Fixed (F3)**: canonical and og:url now point to the `?offset=` URL |
| Confirmed defect | 6 video item pages had no H1 | **Fixed (F4)**: the video title (first H2) is now the H1, with the same look |
| Confirmed defect | 7 Fishing Logs had 2 H1s (title + body headline); listing pages had one H1 per post (fishing-reports 21, older 17, categories, tags) | **Fixed (F5)**: body headline → `<h2 class="as-h1">`; listing post titles → `<h2>`. Same look |
| Confirmed defect | 168 og:image/twitter:image references and JSON-LD image/logo URLs hosted on Squarespace; 7 of them already 404 | **Fixed (F6)**: byte-for-byte mirror (`public/og/`, GitHub Action `mirror-og.yml`) and same-file self-hosted copies. For the 4 pages whose original image is 404 with no same-name copy, the page's own hero photo is used, with correct width and height |
| Confirmed defect | Sitemap listed `/cabo-fishing` (canonical → `/`) and not the homepage itself | **Fixed (F7)**: `<loc>https://fish-cabo.com/</loc>`. `/cabo-fishing` is kept, still canonical → `/` |
| Confirmed defect | `/deep-sea-fishing-charters` and `/deep-sea-fishing-cabo` were in the sitemap but had no internal link | **Fixed (F8)**: 2 footer links in "Charters & Booking" |
| Confirmed defect | 17 category/tag archive pages, generated by the new site, had no meta description | **Fixed**: factual one-line description. These pages are not in the sitemap, as on the original |
| Confirmed defect (already fixed earlier) | Iman Bank "wahoo" link → 404 | **Fixed (L1)**, kept |
| Preserved Squarespace issue | Generic "Read More" text on archive links | Visible text kept; `aria-label="Read more: <title>"` added. Lighthouse SEO 92 on `/fishing-reports` remains for this reason |
| Preserved Squarespace issue | H2 → H4 jumps in original content (fishing-boats) | Kept. Re-levelling would change the document outline of ranking pages |
| Preserved Squarespace issue | Duplicate tags differing only by case ("Bottom fishing" / "bottom fishing") | Kept (CMS data). Merge in the CMS if desired |
| Preserved Squarespace issue | `/cabo-fishing` duplicates `/` | Kept with canonical → `/`, as on Squarespace. No redirect without Search Console data |
| Staging-only | SEO 61/69 on PSI = "page blocked from indexing" | Intentional. The production build scores SEO 100 |
| Production config | `robots.txt` = `Allow: /` + sitemap; no X-Robots-Tag except `/admin/*`; canonicals on `https://fish-cabo.com`; 0 references to workers.dev | Verified |
| Needs validation | JSON-LD geo 23.0600625, −109.6706875 vs owner GPS 23.060275, −109.670677 (≈24 m apart, same marina) | **Not changed.** Both points are inside Puerto Los Cabos Marina. Owner to confirm which point to publish |
| Owner decision | Existing video page text names a boat and a captain (`/cabo-fishing-videos/v/can-tv-fishing-show-1`) | **Not changed** (original indexed content). Owner to decide whether to remove |
| Owner decision | Empty PayPal links (10 boat pages): **intentional, PayPal temporarily unavailable (owner)**; "Stipe" label typo (31ft) | Not changed |

## 5. Before / after table

| # | URL(s) | Original | New | Justification | Expected benefit | Migration risk | Test |
|---|---|---|---|---|---|---|---|
| F1 | /dorado-, /marlin-, /roosterfish-, /tuna-, /wahoo-fishing-cabo | `<title>Marlin Fishing Cabo \| Deep Sea Sport Fishing Charters&lt;br/&gt;</title>` (same in og:title, twitter:title, itemprop name) | `<title>Marlin Fishing Cabo \| Deep Sea Sport Fishing Charters</title>` | The editor's markup leaked into the title. Google can show "<br/>" in results | Clean SERP and social titles; keywords unchanged | Very low: same words | verifier 581/581, seo-audit: 0 markup |
| F2 | /, /cabo-fishing | 2 LocalBusiness blocks ("Exotic Fish Cabo" #business + legacy "Fish Cabo" with other geo, www URL, rating 4.9/50, hours) | 1 LocalBusiness `#business` | Conflicting entity data. A self-served rating not visible on the page is against Google's review-snippet guidelines | One consistent entity for Google and AI systems | Low. Stars were not eligible anyway (self-serving LocalBusiness review) | seo-audit: 1 entity on 84 pages |
| F3 | /fishing-reports?offset=… (`/fishing-reports/older`) | canonical `https://fish-cabo.com/fishing-reports` | canonical and og:url `https://fish-cabo.com/fishing-reports?offset=1784496649612` | Page 2 is unique content | Older posts are not hidden behind page 1 | Low | built HTML checked |
| F4 | 6 × /cabo-fishing-videos/v/* | no H1; video title in `<h2>` | `<h1 class="as-h2">` (same text, same look) | Every page needs a primary heading | Clear main topic | Very low | verifier (rule F4) |
| F5 | 7 Fishing Logs; /fishing-reports, older, category and tag pages | 2 H1 per log; 1 H1 per listed post | 1 H1 per page (`<h2 class="as-h1">` for the log headline, `<h2>` for listed post titles) | One clear H1 | Clear document outline | Very low: text, order and look unchanged | verifier (rule F5), layout 243/243 |
| F6 | 84 pages (og/twitter images), JSON-LD image/logo | `http://static1.squarespace.com/…?format=1500w`, `images.squarespace-cdn.com/…` | `https://fish-cabo.com/og/<file>` (54 byte-for-byte copies) and `https://fish-cabo.com/media/<same file>` | Would break when Squarespace is cancelled; 7 already 404 | Durable, working social previews | Low: same images, except the 4 pages whose original was already 404 (own hero photo used) | 0 external hosts, 0 missing files |
| F7 | sitemap.xml | `<loc>https://fish-cabo.com/cabo-fishing</loc>` | `<loc>https://fish-cabo.com/</loc>` | Sitemaps must list canonical URLs | Homepage submitted under its canonical URL | Very low | QA 145/145 (expectation updated for F7 only) |
| F8 | footer (all pages) | — | links to `/deep-sea-fishing-charters` and `/deep-sea-fishing-cabo` | Orphan pages | Crawl path and internal relevance | Very low | seo-audit: no orphans (except `/cabo-fishing` by design and the pagination page) |
| — | 17 category/tag pages | no meta description | factual description | Missing metadata | Better snippets | None (new pages) | seo-audit |
| L1 | /iman-bank-fishing-san-jose-del-cabo | `href="/wahoo-fishing-san-jose-del-cabo-august-2026"` (404) | `href="/fishing-reports/wahoo-fishing-san-jose-del-cabo-august-2026"` | Broken link | Working internal link | None | verifier (rule L1) |

## 6. Changes deliberately rejected

- **Rewriting titles or descriptions to a length target:** rejected. There is no technical defect.
- **Removing staging noindex to raise the PSI SEO score:** rejected.
- **Redirecting `/cabo-fishing` → `/`:** rejected without Search Console data. The canonical is enough.
- **Re-levelling original H2 → H4 jumps:** rejected. It would change the outline of ranking pages for a Lighthouse-only gain.
- **Adding FAQPage, Service, BreadcrumbList or VideoObject schema:** not added. These are optional; see the checklist. FAQ rich results are restricted by Google to authoritative government and health sites, so FAQPage would bring no SERP feature. VideoObject needs the upload date and duration of each video, which are not verified.
- **Changing JSON-LD coordinates to the owner GPS:** pending owner confirmation (≈24 m difference).
- **`llms.txt`:** not created. It is an experimental convention with no proven effect; Google does not use it.
- **AI crawler blocking or allowing changes:** none. The production robots.txt allows all crawlers (search, AI search and AI training alike), as on Squarespace. That is a business choice: see the checklist.

## 7. AI-search (GEO) readiness: verifiable criteria

| Criterion | Status |
|---|---|
| All page content (services, prices "from $350/$600", departure marina, departure time, species, fishing grounds, FAQs, Fishing Reports) present in server-rendered HTML, without JavaScript | ✅ Static HTML (Astro). The chatbot is an extra, not the only source of any fact |
| One consistent business entity (`#business`, name "Exotic Fish Cabo", alternate names declared) | ✅ after F2 |
| Consistent NAP. Phone +52-624-122-3506 and email are identical in footer, contact and JSON-LD | ✅ |
| Geographic entities explicit in text: San José del Cabo, Puerto Los Cabos Marina, Cabo San Lucas, Sea of Cortez, Gordo Banks, Iman Bank, La Fortuna, El 25, Vinorama, San Luis | ✅ Dedicated original pages, now all internally linked |
| Dated first-hand evidence: 36 Fishing Reports with `datePublished`, Article JSON-LD and stable URLs | ✅ |
| Topic relationships: species ↔ grounds ↔ reports ↔ charters ↔ contact | ✅ Through original in-text links, the footer and listings. No orphan pages left |
| Crawlable pagination, category and tag archives | ✅ |
| Durable images with alt text | ✅ |
| `sameAs` social profiles in JSON-LD | ✅ (7 profiles, unchanged) |

**No numeric "GEO score" is given; none is measurable.**

## 8. Performance

**Local production build** (Lighthouse 12, simulated throttling; lab data, not field data):

| Page | Mobile P/A/BP/SEO | Mobile LCP | Desktop P/A/BP/SEO | Desktop LCP | CLS | Weight / JS (mobile) |
|---|---|---|---|---|---|---|
| / | 99/100/100/100 | 1.8 s | 100/100/100/100 | 0.5 s | 0 | 111 / 13 KiB |
| /fishing-charters | 99/100/100/100 | 1.8 s | 100/100/100/100 | 0.6 s | 0 | 121 / 13 KiB |
| /fishing-boats | 100/98/100/100 | 1.7 s | 100/98/100/100 | 0.5 s | 0 | 141 / 13 KiB |
| /fishing-boats/23ft-panga | 99/100/100/100 | 1.9 s | 100/100/100/100 | 0.6 s | 0 | 156 / 13 KiB |
| /fishing-reports | 99/98/100/92 | 2.0 s | 100/98/100/92 | 0.5 s | 0 | 138 / 13 KiB |
| Fishing Log (wahoo) | 100/100/100/100 | 1.5 s | 100/100/100/100 | 0.4 s | 0 | 76 / 13 KiB |
| /contact | 99/100/96/100 | 1.9 s | 100/100/96/100 | 0.5 s | 0 | 145 / 14 KiB |

Notes on the remaining points:
- **Accessibility 98:** the original H2 → H4 jumps.
- **SEO 92:** the original "Read More" link text.
- **Best Practices 96 on /contact:** a console error caused by the sandbox having no internet (Google Maps and Turnstile). It does not occur on the live staging site.

**PageSpeed Insights (Google, real network):**
- **Staging homepage:**
  - mobile: performance 99, accessibility 91, best practices 96, SEO 61;
  - desktop: performance 100, accessibility 91, best practices 100, SEO 69.

  The accessibility points came from three items, fixed after that run: contrast, the chat bubble role and the footer logo. The SEO score reflects the intentional noindex.
- **Squarespace homepage, mobile:**
  - performance 49;
  - FCP 3.1 s, LCP 9.5 s;
  - TBT 580 ms, SI 6.4 s.

  The other Squarespace PSI runs did not complete (the UI stalled, and the API hit a 429 daily quota). No values are inferred.

**CrUX / INP:** no field data available.

## 9. Remaining risks

1. **Contact form:** it is in test mode. No real email is delivered until Resend or Email Routing is configured (owner approval needed).
2. **Turnstile:** it uses the public test key. A real key (Invisible) and secret are required before launch.
3. **Cloudflare Access:** not yet enabled on workers.dev. Staging is publicly reachable, though noindexed.
4. **Boat and captain names:** they appear in original video text. Owner decision.
5. **Social previews on 4 pages:** they now use the page hero, because the original images no longer exist on Squarespace.
6. **Search Console:** after cut-over, monitor coverage for `/cabo-fishing`, `?offset=` and the tag pages.

## 10. Structured data report

| Template | Types | Entity identifiers |
|---|---|---|
| All original pages (84) | WebSite (Squarespace) + LocalBusiness `https://fish-cabo.com/#business` | One business entity. F2 removed the legacy duplicate on `/` and `/cabo-fishing` |
| Fishing Reports (36) | + Article (`headline`, `datePublished`, `dateModified`, `author`, `publisher` Organization with logo, `image`) | Dates are the original Squarespace dates (unchanged) |
| Category/tag/404 | none | — |

**Validation:**
- All JSON-LD blocks parse; 0 invalid.
- Google's supported types in use are LocalBusiness and Article.
- A Rich Results Test is still to be run on the production domain after launch. Eligibility does not guarantee a rich result or an AI citation.

**Unresolved business data:**
- the coordinates (≈24 m difference);
- the WebSite block has an empty `description` (original Squarespace);
- the Article `author` is the plain string "EXOTIC FISH-CABO" (original).

## 11. Full regression results (2026-11-03)

| Check | Result |
|---|---|
| Content + SEO verbatim verifier (with documented rules F1–F8, L1 only) | ✅ 581/581 |
| Functional QA (routes, navigation, chatbot EN/ES/FR + WhatsApp, contact API, booking buttons, headers, staging protection) | ✅ 145/145 |
| Layout and visual rules, 81 URLs × 1440/820/390 | ✅ 243/243 |
| Production SEO crawl | ✅ No markup in titles, no missing canonical or description on original pages, 1 business entity, 0 external og hosts, 0 broken internal links, sitemap valid XML with canonical absolute URLs only |
| Staging indexing protection | ✅ robots Disallow + X-Robots-Tag + meta robots on staging only |
| Lighthouse | ✅ See §8. No regression versus the earlier 2026-11-03 baseline |

## 12. Live staging verification after deployment (commit 6be958e)

- **Fixes live:**
  - `/marlin-fishing-cabo` title without `<br/>`;
  - homepage with 1 LocalBusiness block;
  - video page with 1 H1;
  - the new footer links;
  - og:image file served (200).
- **Staging protection still active:** `robots.txt Disallow: /`, `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex, nofollow">`.
