# Google & Tripadvisor Live Reviews — Final Report

Branch: `reviews-section` (from `main` d0f7aa9). **Not merged, not deployed.**
Verdict: **READY (code) / NOT READY (live)**. The code is finished and fully tested. Going live needs genuine data, and that data requires official API access the owner must obtain (see §5). With no data the section stays hidden, so merging today changes nothing visible on fish-cabo.com.

## 1. What was built
- A homepage section placed immediately before the last section that holds the "Book Now" booking CTA (the FAQ block).
- Heading **"Real Fishing Experiences. Real 5-Star Reviews."** and the subtitle, both exactly as specified.
- Two independent carousels, one for Google and one for Tripadvisor, each showing at most the 5 most recent exactly-5-star reviews.
- The card design follows the owner's example: initial avatar, name, info line, platform logo, stars or bubbles, month and year, title (Tripadvisor only), text clamped to 7 lines with "Read more", and a "Read on Google / Tripadvisor →" link. Each carousel ends with a "See all … reviews →" link.

## 2. Files
| File | Role |
|---|---|
| `src/components/Reviews.astro` | Markup and CSS; renders only platforms that have genuine items |
| `public/js/efc-reviews.js` | Carousel behaviour, no dependencies, about 6 KB unminified |
| `src/data/reviews.json` | Review data, **empty** by default; written only by the sync script |
| `scripts/fetch-reviews.mjs` | Daily sync from the official APIs |
| `.github/workflows/reviews.yml` | Daily cron at 11:17 UTC; commits only when the reviews actually change |
| `tests/reviews.mjs`, `tests/fixtures/*.json` | Behaviour tests and labelled DEMO fixtures (used only in test builds) |
| `src/pages/index.astro` | +2 lines: import and `<Reviews />` |
| `scripts/postbuild.mjs` | CSP `img-src` + `https://www.tripadvisor.com` (official bubble images) |
| `scripts/verify-original.py`, `tests/layout.mjs` | Exclude only `section.rv-section` / `.rv-viewport` |

## 3. Carousel behaviour (all tested)
- Autoplay every 5 s with a seamless infinite loop (inert, aria-hidden clones).
- Autoplay pauses on hover, keyboard focus, touch drag, an open "Read more", when the carousel is out of the viewport (IntersectionObserver) and when the tab is hidden.
- `prefers-reduced-motion`: no autoplay and no animation; the arrows still work.
- Controls: play/pause button (`aria-pressed`, label switches between "Play" and "Pause"), previous/next arrows, ArrowLeft/ArrowRight keys and swipe.
- Cards per view: 3 on desktop, 2 on tablet (≤1100 px), 1 on mobile (≤680 px). Touch targets are 44 px.
- Without JavaScript, all reviews remain readable through native horizontal scroll.
- With 3 reviews or fewer on desktop, the carousel is static and the controls are hidden.

## 4. Compliance
- **No scraping.** Data comes only from the Google Business Profile API and the Tripadvisor Content API.
- **No fake reviews.** The production data file is empty. Demo data exists only in `tests/fixtures`, is marked "DEMO TEXT", and test builds show a red "DEMO DATA" banner.
- **No review schema.** No `Review` or `AggregateRating` JSON-LD was added; Google treats self-serving review markup as ineligible.
- **Attribution.** Each card carries the platform logo and a link to the original review (Tripadvisor) or the listing (Google, which has no per-review URL). Tripadvisor's official bubble image is used when the API supplies it.
- All outbound links use `target="_blank" rel="noopener nofollow"`.
- **SEO/GEO unchanged.** Titles, meta, canonical, JSON-LD and all existing content are identical. `data-nosnippet` on the section stops Google from quoting review text as the site's own snippet.
- **Privacy.** Google names are shortened to "First L."; Tripadvisor usernames are shown as the API returns them. No reviewer photos are loaded.
- **Secrets.** Credentials live only in GitHub Actions secrets, never in the repo or the chat.

## 5. What the owner must do before going live (official access)
**Google** (Business Profile API, owner's own verified listing):
1. In Google Cloud, create a project and submit the Business Profile API access request form. Google reviews it, usually within a few days.
2. Create OAuth credentials (scope `business.manage`), then generate a refresh token with the owner's Google account.
3. Add these GitHub secrets: `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`.

**Tripadvisor** (Content API):
1. Create a developer account; it requires a card on file, with 5,000 free calls per month (the daily sync uses about 30).
2. Restrict the key to the domain fish-cabo.com.
3. Add the GitHub secret `TRIPADVISOR_API_KEY`.

After that, run the "Sync reviews" workflow manually once. A platform without secrets is skipped, and a failed call keeps the previous data.

## 6. Known limitations (official, cannot be bypassed legitimately)
- The Tripadvisor Content API returns **only the 5 most recent reviews, of any rating**. If some of them are 4-star, fewer than 5 cards appear. A Tripadvisor carousel with zero 5-star reviews is hidden automatically.
- Google provides no per-review link, so "Read on Google" opens the listing (`g.page/r/CVkU9WoXqp_DEBM`).
- Tripadvisor has announced its new "Terra" API platform; the endpoint may need an update later.
- **Owner decision needed:** genuine reviews may mention captain or boat names. The rule "no captain/boat names in newly generated content" does not cover third-party reviews, and editing a genuine review would misrepresent it. Reviews are therefore shown verbatim by default.

## 7. Test results
| Suite | Result |
|---|---|
| `tests/reviews.mjs` (demo data, full) | **48/48** |
| `tests/reviews.mjs --small` (2 Google reviews, Tripadvisor empty) | **9/9** |
| `scripts/verify-original.py` (empty data and demo data) | **581/581** |
| `tests/qa.mjs` | **145/145** |
| `tests/layout.mjs` (80 pages × 3 widths) | **243/243** |
| Console / page errors | 0 |

## 8. Lighthouse, homepage (local, staging build; SEO 69 = staging noindex, expected)
| | Perf | A11y | Best pr. | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Before, mobile | 99 | 100 | 100 | 69 | 1.1 s | 1.8 s | 0 ms | 0 |
| After (10 demo reviews), mobile | 99 | 100 | 100 | 69 | 1.2 s | 1.8 s | 0 ms | 0 |
| Before, desktop | 100 | 100 | 100 | 69 | 0.3 s | 0.5 s | 0 ms | 0 |
| After, desktop | 100 | 100 | 100 | 69 | 0.3 s | 0.5 s | 0 ms | 0 |

## 9. Screenshots
`docs/reviews/reviews-1440.png` and `docs/reviews/reviews-390.png` (DEMO data).

## 10. Rollback
- Not merged: nothing to roll back.
- After a merge: `git revert <merge commit>`, or remove `<Reviews />` from `src/pages/index.astro`.
