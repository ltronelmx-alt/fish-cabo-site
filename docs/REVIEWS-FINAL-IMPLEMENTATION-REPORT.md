# Reviews — Final Implementation Report

Branch: `reviews-section`, which contains the latest `main` (d0f7aa9: SEO/GEO fixes and 301 redirects).
**Not merged, not deployed.** It waits for the owner's visual approval.
Verdict: **GO for merge once the owner approves**, after the two owner decisions in §4.

## 1. Verified Google reviews (5/5 stars; checked 2026-11-04, Google Search panel → "View all Google reviews" → Newest)
Google shows only relative dates, so the card shows the year.

| # | Author | Date shown by Google | Rating | Source (contributor id) |
|---|---|---|---|---|
| 1 | A B (Local Guide) | 6 months ago | 5 | 101640265681105381514 |
| 2 | Agnes xE Benitez | 7 months ago | 5 | 105099981144725820527 |
| 3 | Robert Saykally | 7 months ago | 5 | 116314337626315953153 |
| 4 | Chloe Turner | Edited 9 months ago | 5 | 100588830157678318690 |
| 5 | Matt Stanford | 10 months ago | 5 | 105135065874815552692 |

Skipped on purpose: Anthony Dekkers (7 months ago, **1 star**).
Each card links to `google.com/maps/reviews/data=…1s<contributor id>!2s0x86af50aeb0005895:0xc39faa176af51459`.

## 2. Verified Tripadvisor reviews ("5 of 5 bubbles"; checked 2026-11-04, listing d9569970, most recent first)
| # | Author | Written | Title | Review id |
|---|---|---|---|---|
| 1 | Stella M (Los Angeles) | 2026-08-16 | Had an incredible morning | r1073477935 |
| 2 | Agnès B (Deux-Montagnes) | 2026-04-05 | Exotic Fish Cabo experience | r1055459421 |
| 3 | crypton A | 2025-11-06 | HUGE yellowfin tuna | r1037958271 |
| 4 | Alhuero (La Mirada) | 2025-08-20 | Sunday Morning Catch! | r1025742240 |
| 5 | Cabo Casita Keeper (San José del Cabo) | 2025-07-13 | Marlins and tuna in the same morning | r1017994206 |

Skipped on purpose: AnthonyDek (Mar 2026, **1 bubble**) and Fitsea1 (May 2025, **1 bubble**).

## 3. Implementation
- `src/data/reviews.json` holds the static data (5 + 5). Only `rating: 5` can render.
- `src/components/Reviews.astro` is the existing design, which follows the owner's example screenshot. Each carousel header says "Selected 5-star reviews · excerpts", so the cards are not presented as the full rating distribution.
- **Text is a short verbatim excerpt** (one or two sentences, omissions marked `…`) with a link to the full review. The full texts are not copied: the copyright belongs to the reviewers, and both platforms restrict copying.
- No customer photos (no reuse permission). Excerpts avoid captain and boat names.
- `public/js/efc-reviews.js` drives the carousel:
  - autoplay every 5 s with a seamless loop;
  - pauses on hover, focus, swipe, out-of-viewport and hidden tab;
  - respects reduced-motion;
  - play/pause button, arrows, keyboard and swipe;
  - 3 cards per view on desktop, 2 on tablet, 1 on mobile;
  - all reviews stay readable without JavaScript.
- **Removed:** the API sync script, the daily GitHub workflow and the extra CSP host. **Zero recurring cost:** no API, no key, no subscription, no scheduled request.
- No Review or AggregateRating schema was added. `data-nosnippet` is set on the section.
- Placement: homepage, immediately before the last section, which holds the "Book Now" CTA (FAQ).
- Maintenance procedure: `docs/REVIEWS-QUARTERLY-UPDATE.md`, for the owner's existing quarterly ChatGPT task (from 2027-02-04). No duplicate task was created.

## 4. Owner decisions needed (everything shown is genuine and 5-star)
1. **Agnès B / Agnes xE Benitez** appears in both carousels. Her original review opens by answering a negative review ("I find it impossible to take that last review seriously"), and the excerpt leaves that opening out. If you would rather not show it, the next 5-star reviews are Brad Madill (Google) and EGinSoCal (Tripadvisor).
2. **Cabo Casita Keeper** (Tripadvisor): if this is a partner business, showing it without disclosure could mislead visitors. Replacement: EGinSoCal (2025-04-07, 5 bubbles).
3. The Google reviews from **Cabo Getaways** and **Lalie CCK** (property managers who send clients) are already excluded: they are not among the 5 newest.

## 5. Tests (real data, local build)
| Suite | Result |
|---|---|
| `tests/reviews.mjs` (data integrity + carousel + responsive + a11y) | **51/51** |
| `tests/reviews.mjs --small` (fixture: fewer reviews → static) | **9/9** |
| `scripts/verify-original.py` (SEO/GEO, content, JSON-LD) | **581/581** |
| `tests/qa.mjs` (routes, links, redirects, forms…) | **145/145** |
| `tests/layout.mjs` (80 pages × 3 widths) | **243/243** |

Lighthouse, homepage (SEO 69 = staging noindex):
| | Perf | A11y | BP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| Mobile, before | 99 | 100 | 100 | 1.8 s | 0 ms | 0 |
| Mobile, after | 99 | 100 | 100 | 1.8 s | 0 ms | 0 |
| Desktop, before | 100 | 100 | 100 | 0.5 s | 0 ms | 0 |
| Desktop, after | 100 | 100 | 100 | 0.5 s | 0 ms | 0 |

Screenshots: `docs/reviews/reviews-1440.png`, `docs/reviews/reviews-390.png`.

## 6. Limitations
- Google shows relative dates only, so the year on the card is approximate.
- The data is static: new reviews appear only after the quarterly update.

## 7. Before merging
- The chatbot improvements are on branch `chatbot-audit` (not merged). This branch does not touch `public/js/efc-chat.js` or `Chat.astro`, so the two merge independently.
- Re-run the suites above after both merges.
- Rollback: `git revert <merge commit>`.
