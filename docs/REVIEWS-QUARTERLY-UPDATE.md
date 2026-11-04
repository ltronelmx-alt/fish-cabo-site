# Reviews — Quarterly Update Procedure (for an AI coding agent)

Repository: `ltronelmx-alt/fish-cabo-site`.
Data file: `src/data/reviews.json`, the **only** file to edit.
The design (`src/components/Reviews.astro`) and the animation (`public/js/efc-reviews.js`) are never touched.

## Rules (non-negotiable)
- Only reviews rated **exactly 5/5** are allowed. Never publish a review rated 1–4.
- Never invent, merge, translate or reword a review. Use only reviews visible on the official Exotic Fish Cabo listings below.
- No paid API, no review widget or subscription (Elfsight, SociableKIT, Tripadvisor Terra…), no automated bulk scraping. Open the public pages in a normal browser session and read them.
- `text` is a **short verbatim excerpt**: one or two sentences, never the full review. Mark omissions with `…` and change no word.
  - Prefer excerpts without captain or boat names.
  - Never cut a review in a way that changes its meaning.
- Never add Review or AggregateRating structured data. Never change SEO titles, meta, canonicals, JSON-LD, sitemap, robots, redirects, chatbot or payment links.
- If the reviews cannot be retrieved or verified (sign-in wall, blocked page, unclear rating), **stop and report the exact obstacle**. Do not publish a partial guess.

## Sources
- Google: https://www.google.com/search?q=Exotic+Fish+Cabo (business panel) → "View all Google reviews" → sort **Newest**.
  - Maps (https://g.page/r/CVkU9WoXqp_DEBM) shows a limited view without sign-in.
- Tripadvisor: https://www.tripadvisor.com/Attraction_Review-g152516-d9569970-Reviews-Exotic_Fish_Cabo_Sportfishing_Charter-San_Jose_del_Cabo_Los_Cabos_Baja_California.html (default order: most recent).

## Workflow
1. Create a branch from `main` named `reviews-update-YYYY-MM`.
2. **Google:** sort by Newest and walk down the list. For each review, read the star count: 5 filled stars (`#fabb05`) is required; skip any review with fewer. Keep the first **five** 5-star reviews.
   - Record: displayed name, "Local Guide" if shown, the relative date ("6 months ago"), the review text, and the contributor id from the profile link `…/maps/contrib/<ID>/reviews`.
   - Source URL: `https://www.google.com/maps/reviews/data=!4m5!14m4!1m3!1m2!1s<ID>!2s0x86af50aeb0005895:0xc39faa176af51459`.
   - `date`: approximate year-month derived from the relative date. `dateLabel`: the year only.
3. **Tripadvisor:** walk down the most-recent list. Read each card's rating ("5 of 5 bubbles"); skip anything below 5. Keep the first **five** 5-star reviews.
   - Record: username, location, title, the "Written …" date (ISO `YYYY-MM-DD`) and the review URL (`ShowUserReviews-…-r<ID>-…`).
4. Compare with the current `reviews.json`. Replace the entries, keep **newest first**, and keep **exactly 5 per platform**.
   - If fewer than 5 qualifying reviews exist, publish fewer and say so in the PR.
5. Set `verifiedAt` to today for each platform.
6. Run the tests:
   ```
   npm install && npx playwright install chromium
   npm run build
   npx wrangler dev --port 8787 &
   node tests/reviews.mjs        # data integrity + carousel behaviour
   python3 scripts/verify-original.py   # must print 581 OK lines
   node tests/qa.mjs             # 145/145
   node tests/layout.mjs         # 243/243
   ```
7. Open a pull request listing each new review (platform, author, date, rating, source URL) and attach a screenshot of the section at desktop and mobile widths.
8. **Ask the owner for approval. Do not merge or deploy without it.** Merging into `main` triggers the Cloudflare deploy.

## Things to watch
- A new review may be a reply to another review (for example, "that last review…"). Excerpt only the part that stands on its own, or skip it and say so in the PR.
- Flag reviews written by partner businesses (property managers, affiliates) so the owner can decide. Showing an affiliated endorsement without disclosure is misleading.
- Google shows relative dates only, so the year shown on the card is approximate.
