# Exotic Fish Cabo — Complete Cloudflare Version: Status Report

Date: 2026-11-03 · Repository: `ltronelmx-alt/fish-cabo-site` (branch `main`)
Rule applied throughout (owner decision): **content and SEO are kept exactly as on fish-cabo.com; only the design changes.**
Nothing was changed on Squarespace, DNS, the domain, Search Console or any payment account.

## 1. Summary

| Requirement | Status |
|---|---|
| Every public page rebuilt (83 exported pages = 81 sitemap URLs + homepage + /terms-conditions + /privacy-policy) | ✅ Built. Content verified identical to the original (see §3) |
| All 36 Fishing Reports / Logs imported (body, date, category, tags, author, images, SEO head) | ✅ |
| Fishing Reports listing, original pagination URL (`?offset=…`), category and tag pages | ✅ Generated from the collection; page 1 identical to the original |
| Latest Fishing Log (automatic, same rules as the original script) | ✅ Tested |
| 10 boat pages with Stripe / Wise / PayPal buttons exactly as on the live site | ✅ (see §5 for issues found on the live site) |
| Original multilingual chatbot (EN/ES/FR + WhatsApp) | ✅ Original code ported verbatim. Tested in all 3 languages |
| Contact form (same fields), Worker + Cloudflare Turnstile, safe test mode | ✅ Validation tested. Full submission to be tested on staging (Turnstile needs the internet) |
| CMS (Sveltia CMS, free, Git-based, drafts, preview, image upload, SEO fields) | ✅ Configured. **Needs staging + a GitHub token to be used** (see §7) |
| Protected Cloudflare staging URL | ⏳ **Waiting for the owner**: importing the repo in Cloudflare is a dashboard step (§8) |
| Real performance comparison | ⚠️ Partial: Squarespace homepage measured. Everything else is pending staging (§6) |
| Automated QA (Playwright) | ✅ 145/145 passed |

## 2. Architecture and costs

- Astro static site served by **Cloudflare Workers Static Assets**. The Worker only runs for `/api/*` and `/fishing-reports?offset=…`.
- Images are self-hosted: 111 originals, with AVIF and WebP generated at 300–2400 px. Fonts are self-hosted.
- Security headers include a CSP, HSTS, nosniff, X-Frame-Options and Referrer-Policy. `/admin` has its own CSP for the CMS.
- Staging safety: `<meta name="robots" content="noindex">`, an `X-Robots-Tag: noindex` header and `robots.txt: Disallow: /`. **Cloudflare Access** should also be enabled so that only the owner can open it.

| Service | Use | Cost |
|---|---|---|
| Cloudflare Workers (Free) | hosting and the API | $0 (100k Worker requests/day; static assets are not counted) |
| Cloudflare Turnstile | anti-spam on the contact form | $0 |
| Cloudflare Access (Zero Trust Free, ≤50 users) | protecting the staging site | $0 |
| Cloudflare Web Analytics | privacy-friendly analytics (optional) | $0 |
| Workers Analytics Engine | click counts for BOOK NOW / payments (optional) | $0 within free limits |
| GitHub (private repository) | code and CMS history | $0 |
| Sveltia CMS | content editing | $0 (open source) |
| Email delivery for the contact form | **not activated.** Options: Resend (free tier 3,000 emails/month, needs an API key) or Cloudflare Email Routing (free, needs the domain on Cloudflare) | $0, **requires approval** |

## 3. SEO preservation (verified automatically)

`scripts/verify-original.py` compares **all 83 original pages** with the new build. For each page it checks:
- DOM order of all content
- headings (text, level, order)
- links and anchor texts
- image alt texts
- every text block
- `<head>`: title, meta description, canonical, og:*, twitter:*, itemprop, JSON-LD
- `lang`

**Result: 581/581 checks identical.**

- Page-by-page table: `docs/SEO-MIGRATION.md`. There are no differences in title, description, canonical, H1 or JSON-LD on any URL.
- `sitemap.xml` is identical to the original. New CMS posts are added to it automatically.
- All URLs and slugs are unchanged, including legacy ones (`…-6hzga-zr7h7`, `sansan-…`) and `/cabo-fishing` with its canonical pointing to `/`.

**Only deliberate differences**
1. The MARINA GPS and footer directions buttons point to the owner-verified coordinates 23.060275, −109.670677. The JSON-LD keeps the original coordinates, unchanged as requested.
2. Image file URLs are now self-hosted (`/media/...`). Alt texts are unchanged.
3. The latest-log block is pre-rendered instead of loaded by JavaScript, with the same texts.
4. Design-only additions: CSS-drawn numbers and arrows, plus a `class="sub"` on paragraphs that are entirely bold. No text was changed.

**Existing SEO issues on the live site (NOT changed — proposals for a later, separate decision)**
- Two LocalBusiness entities ("Exotic Fish Cabo" and "Fish Cabo").
- `<br/>` inside `<title>` on 5 pages (dorado, marlin, roosterfish, tuna, wahoo).
- `/cabo-fishing` duplicates the homepage (same title; canonical points to `/`).
- 6 video pages have no H1.
- `/fishing-reports` has 21 H1 tags, and 7 Fishing Logs have 2 H1s each.
- **Broken link — fixed on the new site (owner-approved, 2026-11-03):** `/iman-bank-fishing-san-jose-del-cabo` linked "wahoo" to `/wahoo-fishing-san-jose-del-cabo-august-2026` (404 on the live site). It now points to `/fishing-reports/wahoo-fishing-san-jose-del-cabo-august-2026`. This is the only intentional difference from the original content; it is listed in `scripts/link_fixes.py`, and the verifier accounts for it. The live Squarespace page still has the broken link.
- `/terms-conditions` and `/privacy-policy` are missing from the sitemap.

## 4. Functional tests (Playwright, local Cloudflare runtime) — `docs/qa-results.json`

- All 101 routes return 200: 83 original pages, plus the older-posts, category and tag pages. Unknown URLs return a 404 page.
- 946 internal links and images were checked. **1 is broken**, and it is the live-site link described in §3.
- Pagination: `/fishing-reports?offset=…` shows the older posts.
- Trailing-slash URLs redirect to the canonical form with a 307 (Cloudflare's default).
- Navigation:
  - desktop dropdown (hover, click, Escape to close)
  - mobile menu (open, sub-menu, close)
  - **a bug was found and fixed:** the open mobile menu was covering its own close button
- Booking: header BOOK NOW goes to /fishing-boats; the mobile BOOK NOW bar is visible; MARINA GPS uses the verified coordinates.
- Chatbot: price question answered in EN, ES and FR (desktop and mobile); WhatsApp handoff goes to +52 624 122 3506.
- Contact form:
  - an empty submission is blocked with a message
  - the server rejects incomplete data
  - the honeypot drops bots
- No horizontal scrolling on any page at 375, 768 and 1440 px.
- No JavaScript errors in the browser on the pages tested.
- The homepage shows the newest published Fishing Log.
- Security headers are present. Staging noindex is confirmed (header and robots.txt).

**Not testable here, to be checked on staging:**
- a full contact form submission with Turnstile
- the CMS login and publishing
- Cloudflare Access

## 5. Booking and payment checklist (links copied exactly from the live site — no transaction made)

| Boat page | Stripe | Wise | PayPal |
|---|---|---|---|
| 23ft-panga | buy.stripe.com/00geYG02Seukbsc148 | wise.com/pay/me/loict92 | **empty link on live site** |
| 26ft-super-panga | buy.stripe.com/8wM8Ai8zo9a00NybIJ | same | empty |
| 27ft-premium-center-console | buy.stripe.com/8wM8Ai8zo9a00NybIJ | same | empty |
| 29-ft-catamaran-center-console | buy.stripe.com/3cseYG8zo4TK0Ny14c | same | empty |
| 30ft-cuddy-cabin | buy.stripe.com/8wM8Ai8zo9a00NybIJ | same | empty |
| 31ft-premium-center-console | buy.stripe.com/3cseYG8zo4TK0Ny14c | same | empty |
| 35ft-premium-cuddy-cabin | buy.stripe.com/6oE3fY4j8ae467S5kt | same | empty |
| 37ft-ultimate-fishing-machine | buy.stripe.com/aFaeVd5PF0AkcBofrv9bO0b | same | empty |
| 38ft-flybridge | buy.stripe.com/28o9Em8zo4TKbscbIP | same | empty |
| 44ft-premium-flybridge | buy.stripe.com/6oE3fY4j8ae467S5kt | same | empty |

To confirm with the owner (kept exactly as on the live site):
- **The PayPal button has an empty link on all 10 boat pages of the live site.** It does nothing there, and it does nothing here.
- **Several boats share the same Stripe link:** 26/27/30 ft, 29/31 ft and 35/44 ft. Perhaps intentional (same deposit), perhaps a mistake. The owner should check in Stripe.
- Each boat page mentions only its own size (no 38ft/31ft mix-up found). The 38ft page's "Next Boat" button goes to the 31ft page, as on the live site.
- Contact form: same 8 fields, options and "Send" button. After sending, the original redirects to `/confirmation`, a page that is not in the export. The new form shows "Thank you!" (the original success message) instead.

## 6. Performance

| Measurement (lab, PageSpeed Insights, mobile, 2026-11-03 11:05) | Squarespace | Cloudflare |
|---|---|---|
| Homepage — Performance score | **49** | pending (staging not deployed) |
| FCP / LCP | 3.1 s / **9.5 s** | pending |
| TBT / CLS / Speed Index | 580 ms / 0 / 6.4 s | pending |

All other pages, desktop results and field data (CrUX): **not measured yet**. The PageSpeed tool requires an approval per test in the browser, and the staging site does not exist yet. Plan: once staging is deployed, temporarily allow PageSpeed to reach it (Cloudflare Access blocks robots), then test the 7 pages on both sites, mobile and desktop. Known facts that need no measuring: the new site loads about 3 KB of its own JavaScript, plus the original chatbot script (23 KB). No figure has been estimated.

## 7. CMS — how to use (once staging is live)

1. Open `https://<staging-url>/admin/` → **Sign in with GitHub token**.
   Create the token once on github.com → Settings → Developer settings → Fine-grained token → repository `fish-cabo-site` → permission "Contents: Read and write".
2. **Fishing Logs & Reports** → New:
   - paste the approved text into "Article";
   - add the image, date, excerpt and SEO title/description;
   - keep **Draft** checked while reviewing (the preview pane shows the result);
   - uncheck Draft and Save to publish.
3. Every save is a Git commit: full history, and any version can be restored. Cloudflare rebuilds the site in about 2–5 minutes.
4. The external ChatGPT automations are not connected or modified. Their output is published only when the owner pastes it into the CMS.

Pages and boat pages can also be edited ("advanced" collections). These edit the original HTML of each block and the SEO tags, so changes there affect SEO.

## 8. What requires the owner

1. **Cloudflare (≈5 min, dashboard):** Workers & Pages → Create → Import a repository → `fish-cabo-site`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - After the first deploy: Settings → Domains & Routes → workers.dev → enable **Cloudflare Access**.
   - **Do not add fish-cabo.com.**
2. **Turnstile (optional for staging):** create a site key in Cloudflare → set `PUBLIC_TURNSTILE_SITEKEY` (build variable) and `TURNSTILE_SECRET` (Worker secret). Until then, Cloudflare's public test keys are used.
3. **Email for the contact form:** choose Resend or Email Routing (approval needed). Until then, the form runs in test mode and sends nothing.
4. Confirm the Stripe link sharing and the empty PayPal button (§5).
5. Before any cut-over: copy the live `robots.txt` and decide on og:image hosting. The og:image tags still point to Squarespace static files, which will disappear if Squarespace is cancelled.

## 9. Production migration plan (NOT to be executed without explicit approval)

1. Freeze content edits on Squarespace and run the verifier again against a fresh export (new posts).
2. Set `PUBLIC_SITE_ENV=production`. This removes noindex and uses the production robots.txt. Configure the real Turnstile keys and email delivery.
3. Lower the DNS TTL 48 hours before the switch. The domain stays registered at Squarespace and only the DNS records change, as for stellamoonmusic.com.
4. Attach fish-cabo.com to the Worker (Custom Domain). Check HTTPS, then crawl all 83 URLs and the sitemap.
5. In Search Console: submit the sitemap (existing property, no change of property), then watch Coverage and Core Web Vitals for 4 weeks.

## 10. Rollback plan

- Keep the Squarespace site and subscription active for at least 30 days after the switch.
- Rollback = point the DNS records back to Squarespace's values (save them before the switch). Propagation follows the lowered TTL (minutes to 1 hour).
- On Cloudflare, every deploy is versioned: Workers → Deployments → "Rollback" to any previous version instantly.

## Staging deployment check — 2026-11-03

- URL: `https://fish-cabo.small-boat-4235.workers.dev` (Workers Builds, GitHub `ltronelmx-alt/fish-cabo-site`, branch `main`). The production domain is not connected.
- All 85 sitemap URLs plus `/robots.txt`, `/admin/`, `/js/efc-chat.js`, `/fishing-reports?offset=1` and `/fishing-reports/older` return 200. An unknown URL returns 404.
- Staging protection: `robots.txt` has `Disallow: /`, the `X-Robots-Tag: noindex, nofollow` header is set, and CSP and HSTS are present.
- Iman Bank "wahoo" link resolves to `/fishing-reports/wahoo-fishing-san-jose-del-cabo-august-2026` (200).
- `/api/contact`: an incomplete submission is rejected (400). A complete submission passes Turnstile with the test key and returns `{"ok":true,"test":true}`, which means no email is sent. The Turnstile widget is present on `/contact`.
- Cloudflare Access: **not yet enabled** at the time of this check.
- PageSpeed Insights could not resolve the new workers.dev hostname yet. The measurement will be retried; no figures are reported until it succeeds.
