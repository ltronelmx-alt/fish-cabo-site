# Exotic Fish Cabo — Cloudflare Migration: Status Report (Phases 1–3)

Report date: 2026-11-02 · Author: Claude (Opus 5.5), working session for Loïc (owner)
Scope requested at this stage: audit + 3-page prototype (Homepage, /fishing-charters, /fishing-boats) with shared header, dropdown and footer.
Nothing was changed on the live Squarespace site, DNS, domain or Search Console.

---

## 1. Executive summary

| Item | Status |
|---|---|
| Phase 1 — Audit (URLs, SEO metadata, design, integrations) | ✅ Done |
| Phase 2 — Architecture choice | ✅ Done (Astro static + Cloudflare Workers Static Assets, Free plan) |
| Phase 3 — 3-page prototype, faithful design | ✅ Done, owner reviewed preview and judged it "parfait" |
| Phase 4 — Protected Cloudflare staging deployment | ❌ Not done — needs GitHub connection + Cloudflare dashboard import by owner |
| Phase 5 — Testing & comparison | ⚠️ Partial — layout/SEO/accessibility checks done; **no Lighthouse/Core Web Vitals numbers measured yet** |
| Phases 6–7 — Full migration, CMS, production readiness | ❌ Not started (all source content already exported, see §6) |

Private preview of the 3 pages (owner-only link): https://claude.ai/artifact/RNsfxZUKtv4Ge1jDYR5z2n
(In the preview, links to pages not yet rebuilt open the live fish-cabo.com.)

---

## 2. Environment constraints encountered (important for evaluating the work)

The work environment is a sandbox with a network allowlist. It could **not** reach fish-cabo.com, images.squarespace-cdn.com, the PageSpeed Insights API or the Cloudflare API. GitHub was not connected to the account.

Workarounds used:
- The live site was audited through the owner's desktop browser pane (DOM inspection, computed styles, fetch of all 83 HTML pages, RSS, sitemap).
- The full site (83 pages + 111 images, ~37 MB) was exported by the browser as a `.tar` to the owner's Downloads folder, then transferred into the sandbox. One image in that export was missing, so a second small export (5 images) was made. One image still failed to download (`Brooke.webp`, used by one Fishing Report, not by the 3 prototype pages).

Consequences:
- No performance measurements could be run. **No performance figures have been claimed or estimated.**
- No deployment to Cloudflare was possible from the sandbox.

---

## 3. Phase 1 — Audit findings

### 3.1 URL inventory (81 sitemap URLs + homepage; all return HTTP 200)
- Core: `/`, `/fishing-charters`, `/fishing-boats`, `/contact`, `/fish-species`, `/fishing-calendar`, `/cabo-fishing-faq`, `/cabo-fishing-tournaments`, `/cabo-fishing`
- 10 boat pages under `/fishing-boats/…`
- 8 species/SEO landing pages, 7 fishing-ground pages, 3 guides
- `/fishing-reports` + 36 articles (16 weekly "San Jose del Cabo Fishing Log" + 20 guest stories)
- `/cabo-fishing-videos` + 6 video pages
- `/terms-conditions` and `/privacy-policy` exist (200) but are missing from the sitemap.

**Decision: all existing slugs are preserved exactly**, including the Squarespace-generated odd ones (`…-6hzga-zr7h7`, `sansan-jose-…`), because they are indexed. No 301 redirects are needed for public URLs. Trailing-slash style kept (`/fishing-boats`, no slash).

### 3.2 SEO issues on the current site
1. Two conflicting `LocalBusiness` JSON-LD entities ("Exotic Fish Cabo" with `@id #business`, and a second one named "Fish Cabo").
2. Literal `<br/>` inside `<title>` on 5 pages (marlin, tuna, dorado, wahoo, roosterfish).
3. `/cabo-fishing` duplicates the homepage (canonical points to `/`).
4. The 6 video pages have no H1.
5. `/fishing-reports` listing has 21 H1 tags and 21 images without alt text.
6. About 60 images without alt text site-wide, mostly the Fishing Log header images.
7. The `/fishing-charters` meta description lacks the primary keyword.

### 3.3 Design tokens measured
- Fonts: Syne 700, uppercase, letter-spacing −0.03em, for headings. Syne Mono 400 for body text. Arial 600 at 12px for the navigation.
- Colours:
  - `#FB7704` orange section background
  - `#FF8A00` orange for UI accents and hovers
  - `#FFCD38` BOOK NOW button
  - `#000`, `#171717`, `#FFF`, `#FAFAFA`
  - `#DCDCDC` banner H1s
- Fluid type scale reverse-engineered from measurements at 375 / 1440 / 1694 px. Desktop example: H1 = 3.84vw + 18px, H2 = 3.36vw + 18px.
- Transparent absolute header over the hero, an "Explore Fishing" dropdown (dark panel, 245px, 10px radius) and compact MARINA GPS / BOOK NOW buttons. On mobile (≤800px) there is a fixed bottom action bar.
- The black custom footer ("efc-footer") has a logo, 2 CTAs, 4 link columns (accordion on mobile), departure info and Google review links.

### 3.4 Commercial integrations found
- BOOK NOW links to `/fishing-boats`. MARINA GPS links to Google Maps directions.
- Payments use one **Stripe Payment Link per boat page**, plus Wise (`wise.com/pay/me/…`) and a PayPal button.
- The contact form is a Squarespace component on `/contact`.
- The chat assistant is a ~23 KB custom client-side script: an EN/ES/FR knowledge base that hands off to WhatsApp +52 624 122 3506. No external API or key.
- The "Latest Fishing Log" block is built client-side from the Squarespace RSS feed.

---

## 4. Phase 2 — Architecture

- **Astro (static output)** plus **Cloudflare Workers with Static Assets**. Only `/api/*` executes Worker code, and every page is a pre-rendered HTML file.
- `wrangler.jsonc`:
  - `html_handling: auto-trailing-slash`
  - `not_found_handling: 404-page`
  - `run_worker_first: ["/api/*"]`
  - observability enabled
- Worker endpoint `/api/event`: anonymous click counting (BOOK NOW, boat buttons, WhatsApp, directions). It is designed for Workers Analytics Engine, and the binding is commented out until a dataset is created. It records clicks only and never claims a booking.
- Security and caching via a generated `_headers` file:
  - CSP with no inline JS needed (`script-src 'self'` plus the Cloudflare beacon and Turnstile), nosniff, HSTS, X-Frame-Options DENY, a strict Permissions-Policy.
  - Hashed assets, fonts and media are cached immutable for 1 year. HTML is revalidated.
- **Staging safety:** every build is noindex by default (meta robots, `X-Robots-Tag` header and `robots.txt Disallow: /`). An indexable build requires an explicit `PUBLIC_SITE_ENV=production`.
- Planned but not yet implemented:
  - Turnstile and a Worker for the contact form
  - Cloudflare Access on the workers.dev staging URL
  - Cloudflare Web Analytics (beacon token via env var)
  - Git-based CMS: Sveltia/Decap with GitHub auth through a small Worker, to be evaluated
- Expected cost: Cloudflare Free plan. No paid service activated.

---

## 5. Phase 3 — Prototype delivered

### 5.1 What was built
- Pages `/`, `/fishing-charters`, `/fishing-boats` and a 404 page. Text, titles, H1s and heading order are copied verbatim from the live site.
- Shared components: header + dropdown (hover, click and keyboard support, Escape closes), mobile full-screen menu, mobile bottom bar, footer, WhatsApp button.
- **Latest Fishing Log component:** reads the newest published item in the "San Jose del Cabo Fishing Log" category from a content collection (Markdown, filename = URL slug). It is not hardcoded. It uses CSS container queries: image beside the text on wide containers, image above on narrow ones.
- **Images:** 21 originals are self-hosted in `media-src/`. A build script (sharp) generates AVIF and WebP at 300–2400w. Every `<img>` has width/height, is lazy-loaded below the fold and carries `fetchpriority=high` on the hero. The site no longer depends on the Squarespace CDN.
- Fonts are self-hosted as woff2, latin subsets, preloaded, `font-display: swap`.
- Client JavaScript totals about 1.2 KB, in 3 small module files.
- Structured data:
  - one `LocalBusiness` with `@id`
  - `WebSite`, `BreadcrumbList`
  - `FAQPage` on Home and Boats, mirroring the visible FAQ text exactly
  - `Service` with the two stated starting prices on /fishing-charters
  - `ItemList` of the boats

### 5.2 Deliberate deviations from the live site (owner reviewed the preview and approved)
1. `/fishing-charters` meta description rewritten to include "Private fishing charters in San José del Cabo". Title and H1 unchanged.
2. A 35% dark overlay behind the H1 on the /fishing-charters banner (gray text on a bright photo was unreadable).
3. Boat cards use a uniform structure, with buttons aligned at the bottom and consistent alignment. The original 3·3·2·2 row grouping and alternating section backgrounds are kept.
4. On mobile, the WhatsApp bubble was moved above the bottom bar (on the live site it covers BOOK NOW).
5. On /fishing-boats, a heading merged into the first list item (a Squarespace formatting bug) was split. Wording unchanged.
6. **Marina GPS corrected by the owner** to 23.060275, −109.670677. It is used by MARINA GPS (header and mobile bar), the footer directions button and LocalBusiness `geo`/`hasMap`. The live Squarespace site still uses the old coordinates (23.0600625, −109.6706875).

### 5.3 Tests actually performed
- Local Cloudflare runtime (`wrangler dev`):
  - `/`, `/fishing-charters` and `/fishing-boats` return 200
  - unknown paths return 404
  - `/fishing-boats/` returns 307 to `/fishing-boats`
  - `/api/event` returns 204
  - headers verified (CSP, X-Robots-Tag, Cache-Control)
- Playwright at 375, 768, 1440 and 1920 px:
  - no horizontal overflow (one grid overflow was found and fixed)
  - exactly one H1 per page
  - 0 images without alt
  - 0 images without width/height
- Visual check by screenshot against measurements of the live site. The hero headline position was adjusted.
- Owner visual review of the preview: approved.

### 5.4 Not done / known gaps
- **No Lighthouse or Core Web Vitals measurements** (LCP, INP, CLS) for either site, so no before/after comparison exists yet.
- No pixel-level side-by-side screenshot comparison with the live site. The visual check was manual.
- The multilingual chat assistant is not ported yet. The prototype's WhatsApp button opens a prefilled WhatsApp chat directly.
- The contact form, Stripe/Wise/PayPal payment links (boat pages), remaining 78 pages, Fishing Log bodies, CMS and redirects are all not built (outside current scope).
- The 307 status on trailing-slash URLs is Cloudflare's default. It could be changed to 301 with a rule if preferred.
- The prototype contains 2 Fishing Log entries (front-matter only, used by the Latest Log component). Their article bodies are not imported yet.

---

## 6. Assets available for the next phases
- The full export of the live site is in the working environment: 83 HTML pages, RSS, sitemap and 110 of 111 images.
- The project source (Git repository) is packaged as `Downloads\fish-cabo-prototype.zip` on the owner's PC. It includes `docs/AUDIT.md`, `README.md` (Cloudflare setup steps) and `PROMPT-CLAUDE-CODE.md`.

## 7. Owner actions needed to continue
1. Connect GitHub in claude.ai settings and provide an empty repository name. This is required for Cloudflare deployment.
2. In the Cloudflare dashboard (one time, ~5 min): Workers & Pages → Import repository → build `npm run build` → after the first deploy, enable Cloudflare Access on the workers.dev URL. Do not attach fish-cabo.com.
3. Optional, to enable measurements from the sandbox: allow `fish-cabo.com`, `images.squarespace-cdn.com` and `pagespeedonline.googleapis.com` in claude.ai Settings → Capabilities.

## 8. Questions for the reviewer
- Should `/cabo-fishing` (a duplicate of the homepage) stay as a canonicalised duplicate, or become a 301 to `/`?
- Should the old Squarespace-generated slugs stay, as recommended, or move to clean slugs with 301s?
- CMS preference: a Git-based CMS (Sveltia/Decap, free, edits commit to GitHub) or a hosted headless CMS?
