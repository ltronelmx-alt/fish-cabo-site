# FINAL PRE-LAUNCH CERTIFICATION — Exotic Fish Cabo

**Date:** 2026-11-03
**Repository:** `ltronelmx-alt/fish-cabo-site` · `main`. The final commit hash is given in §12.
**Staging:** https://fish-cabo.small-boat-4235.workers.dev (password and noindex)
**Production:** https://fish-cabo.com, still on Squarespace. **DNS untouched.**

## 1. Executive summary

The independent audit's findings were checked one by one. All verified technical weaknesses are fixed and re-tested:
- external images in the sitemap and pages;
- a broken `_headers` export;
- empty alt attributes;
- the sitemap gap;
- cache headers.

A **design regression** was also found and fixed during this pass: the video pages showed unreadable grey text in a narrow card.

All approved content, URLs, titles, descriptions, headings and schema remain identical to Squarespace, apart from the individually documented fixes. The test results are:
- content and SEO verifier **581/581**;
- functional QA **145/145**;
- layout **243/243**;
- crawl **102/102 pages 200**;
- **898/898** referenced assets return 200;
- **0** Squarespace-hosted references left.

**Verdict: READY FOR OWNER-APPROVED DNS CUTOVER** (see §11).

## 2. Exact corrections completed (this pass)

| # | Issue (independent audit) | Finding | Correction | Test |
|---|---|---|---|---|
| F9 | 102 `<image:loc>` in the sitemap on `images.squarespace-cdn.com` | All 102 images already exist in `/media`. They are the same original files, served in the site's responsive set, whose largest variant is WebP at quality 80, the same variant the pages already display. The full-quality originals are kept in `media-src/` | `<image:loc>` → `https://fish-cabo.com/media/<same file>-<largest width>.webp`. The page `<loc>` list and the image count are unchanged | Sitemap: 80 URLs, 102 images, 0 Squarespace references; 102/102 return 200 |
| F10 | Images still loaded from Squarespace in the pages: the author avatar (36 pages), `Brooke.webp` (13), and 4 `itemprop` image URLs that already return 404 | These files were not in `/media` | Byte-for-byte copies made by the GitHub Action `mirror-og.yml` (57 files in `/og`). `postbuild` replaces the 49 references. The 4 dead `itemprop image/thumbnailUrl` URLs use the page's own hero photo, the same rule as og:image (F6c) | 0 Squarespace references in HTML and sitemap |
| — | CSP still allowed Squarespace image hosts | No longer needed | Removed `images.squarespace-cdn.com` and `static1.squarespace.com` from `img-src` | Response headers in `raw/response-headers.txt` |
| A1 | 172 empty `alt` attributes (crawl count, including duplicates across pages) | Reviewed by context and by viewing the images: 37 hero background photos (decorative), 96 listing thumbnails inside links named by `aria-label` = post title (the empty alt is correct), 37 author avatars (decorative), **2 meaningful photos** | Alt text added only to those 2, written from the image itself: the 27ft center-console boat photo (/fishing-charters) and the red snapper catch photo (red-snapper report). Rule file: `src/data/alt-fixes.json`, mirrored in the verifier | Verifier 581/581 (rule A1) |
| — | `raw/_headers.txt` contained the 404 page | `_headers` is Cloudflare configuration and is never served over HTTP, so requesting `/_headers` correctly returns the 404 page | The export now contains the real `dist/_headers` and the **actual HTTP response headers** of 11 representative URLs (`raw/response-headers.txt`) | See §5 |
| — | Cache headers | HTML had `max-age=0, must-revalidate` (correct); `/media`, `/fonts` and `/_astro` were immutable for 1 year; `/og` had no rule | `/og/*` immutable for 1 year (hashed names); `/js/*` 1 day | `raw/response-headers.txt` |
| R1 | (found during this pass) Video item pages: article rendered as a narrow white "listing card" with light-grey text, which was unreadable | The CSS for the Fishing Reports listing cards matched any `article` | Card styles restricted to real listings (`article:has(> h2.as-h1)`). The video page is back to its approved look, with **content unchanged** | Screenshot check; layout 243/243 |

The earlier documented fixes (F1–F8 and L1) stay as described in `docs/SEO-GEO-FINAL-AUDIT.md` §5.

## 3. SEO/GEO preservation results

- **Verbatim verifier against the Squarespace export: 581/581** (83 pages × DOM order, headings, links, alts, text, head + JSON-LD, lang). The only accepted differences are the rule files `scripts/link_fixes.py` (L1), `scripts/seo_fixes.py` (F1–F6, A1) and `src/data/alt-fixes.json`. The verifier was **not weakened**: each rule targets named elements.
- **Sitemap: 80 page URLs, identical to the original** except F7 (homepage `/` instead of the duplicate `/cabo-fishing`).
- **Not added to the sitemap, on purpose, matching the original indexing strategy:**
  - category and tag pages (17): thin archives, which stay crawlable and indexable through links;
  - `/fishing-reports?offset=…`: pagination, self-canonical;
  - `/cabo-fishing`: canonical → `/`;
  - `/fishing-reports/older`: canonical → `?offset=`;
  - `/terms-conditions` and `/privacy-policy`: legal pages, absent from the original sitemap. They remain indexable and linked from the footer; adding them is an optional owner choice.
- **Structured data:**
  - 84 pages × 1 LocalBusiness `#business` + WebSite; 36 × Article with the original dates;
  - 0 invalid JSON-LD blocks;
  - no speculative FAQ, Service or Breadcrumb markup added.
- **Fishing Reports:** 36 reports, with original URLs and `datePublished`.
- **Video page:** `/cabo-fishing-videos/v/can-tv-fishing-show-1` is unchanged, as instructed by the owner. Only the shared CSS regression R1 was fixed.

## 4. Final crawl statistics (production build)

Raw data: `docs/crawl/` (crawl.csv, crawl.json, html.zip, broken-links.txt), plus `docs/seo-audit-production.txt`.

| Metric | Result |
|---|---|
| URLs crawled | 103 |
| HTTP 200 | 102 (the only 404 is the deliberate test URL) |
| Pages with noindex (meta or header) | 0 |
| Pages with ≠ 1 H1 | 0 |
| Missing meta descriptions | 0 |
| Non-self canonicals | 2, both intentional: `/cabo-fishing` → `/` and `/fishing-reports/older` → `?offset=` |
| Orphan pages | 0, apart from the 2 intentional URLs above |
| Local assets referenced (pages, srcset, og/twitter/JSON-LD, sitemap) | 898 checked, **0 broken** |
| Remaining external image host | `i.ytimg.com` only (YouTube thumbnails, by design) |
| References to `workers.dev` in production | 0 |

## 5. Production configuration and actual response headers

**Build and indexing:**
- `npm run build:prod` sets `PUBLIC_SITE_ENV=production` and prints "mode=PRODUCTION".
- No `<meta name="robots">` and no `X-Robots-Tag`, except `/admin/*` (noindex, no-store).
- `robots.txt` = `User-agent: * / Allow: / / Sitemap: https://fish-cabo.com/sitemap.xml`.

**Actual headers (`raw/response-headers.txt`):**
- **HTML:** `Cache-Control: public, max-age=0, must-revalidate`, with CSP, HSTS (1 year, includeSubDomains), `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy`.
- **`/media`, `/og`, `/fonts`:** `public, max-age=31536000, immutable`.
- **`/js`:** 1 day.

**Staging isolation:**
- Every staging response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt Disallow: /`.
- The Worker password lock applies **only** to `*.workers.dev` hostnames, so it cannot affect fish-cabo.com.

## 6. Performance (Lighthouse 12, production build, simulated throttling; lab only)

| Page | Mobile P / A / BP / SEO | Mobile LCP | Desktop P / A / BP / SEO | Desktop LCP | CLS |
|---|---|---|---|---|---|
| / | 99/100/100/100 | 1.8 s | 100/100/100/100 | 0.5 s | 0 |
| /fishing-charters | 99/100/100/100 | 1.8 s | 100/100/100/100 | 0.6 s | 0 |
| /fishing-boats | 100/98/100/100 | 1.8 s | 100/98/100/100 | 0.5 s | 0 |
| /fishing-boats/23ft-panga | 99/100/100/100 | 1.9 s | 100/100/100/100 | 0.6 s | 0 |
| /fishing-calendar | 100/98/100/100 | 1.7 s | 100/98/100/100 | 0.5 s | 0 |
| /fishing-reports | 99/98/100/92 | 2.0 s | 100/98/100/92 | 0.5 s | 0 |
| Fishing Report (wahoo) | 100/100/100/100 | 1.5 s | 100/100/100/100 | 0.4 s | 0 |
| Video page | 100/96/96/100 | 1.5 s | 100/96/96/100 | 0.4 s | 0 |
| /contact | 99/100/96/100 | 1.9 s | 100/100/96/100 | 0.5 s | 0 |

TBT is 0–20 ms on every page.

**Remaining deductions, all original content or design, kept by rule:**
- **SEO 92:** the "Read More" link text.
- **Accessibility 98:** the original H2 → H4 jumps.
- **Accessibility 96 on the video page:** white text on the approved orange background.
- **Best Practices 96:** console errors that occur only in the offline sandbox (YouTube, Maps, Turnstile).

**Not measured:** no field data (CrUX/INP) exists yet, and none is claimed.

**Reference (PSI, real network):**
- **Squarespace homepage, mobile:** performance 49, LCP 9.5 s.
- **Staging homepage:** mobile 99, desktop 100.

## 7. Functional test results

| Area | Result |
|---|---|
| Automated QA (`tests/qa.mjs`): routes, menu, mobile menu, footer, internal links, pagination, category/tag, chatbot EN/ES/FR + WhatsApp, contact validation, booking buttons, security headers, staging protection, runtime errors | ✅ 145/145 |
| Layout (`tests/layout.mjs`), 81 URLs × 1440/820/390: overflow, overlap, covered content, payment-button style on every payment link, no upscaled image, no image taller than the screen | ✅ 243/243 |
| Stripe and Wise links | ✅ Unchanged; intentionally shared deposit links kept. **No charge made** |
| PayPal | ✅ Intentionally unavailable (owner); buttons kept as on Squarespace |
| Contact form (live staging) | ✅ Validation (400 on missing fields). **Turnstile** with the real key: verified, "Likely human 100%" in the Cloudflare dashboard. **Resend:** a real test inquiry was **received** at contact@fish-cabo.com (confirmed by the owner). On the real domain, if email were ever unconfigured, the form answers 503 with a WhatsApp/email fallback; it never shows a false success |
| CMS (Sveltia) | ⚠️ **Not tested end to end.** Login needs the owner's own GitHub credentials, which the agent must not handle. The build pipeline for new Markdown posts is tested: sitemap entry with the post date, listing, canonical, and drafts excluded. **Owner test to do before cut-over** (see §8) |
| Error page | ✅ Unknown URL → 404 page |

## 8. Remaining risks

| Risk | Severity | Action |
|---|---|---|
| CMS login and publish flow not exercised with real credentials | Medium (content editing, not the public site) | Owner, about 5 minutes: `/admin` → login with GitHub → new Fishing Report → Save draft → Publish → check the page → Delete |
| Emails are sent from `onboarding@resend.dev` | Low (delivery works) | Optional: verify fish-cabo.com in Resend. This is a DNS change and needs owner approval |
| JSON-LD coordinates vs the GPS buttons (≈24 m apart, same marina) | Low | Owner to confirm the preferred point |
| No field Core Web Vitals yet | Information | Monitor CrUX in Search Console after launch |
| Items that cannot be tested before DNS migration | — | • HTTPS certificate and the Custom Domain on fish-cabo.com<br>• Turnstile on the real hostname (configured)<br>• Search Console indexing<br>• real social-preview fetches by Facebook and X on fish-cabo.com |

## 9. Production deployment instructions

1. **Cloudflare → Workers & Pages → fish-cabo → Settings:**
   - **Build:** set the build command to `npm run build:prod`, or add the build variable `PUBLIC_SITE_ENV=production`.
   - **Runtime variables:** change `SITE_ENV` to `production`.
   - Keep the secrets `TURNSTILE_SECRET`, `RESEND_API_KEY` and `CONTACT_TO`. `STAGING_PASSWORD` can stay; it only affects `*.workers.dev`.
2. Trigger a deployment (push, or *Retry build*). Check that the deployment shows the latest commit.
3. On the workers.dev URL, confirm the build log shows "mode=PRODUCTION". Note that the workers.dev URL then becomes indexable; the password lock still protects it.
4. Proceed to the DNS cut-over (§10). **Only with the owner's explicit approval.**

## 10. Exact DNS cut-over prerequisites

1. Owner approval in writing, and a low-traffic time window.
2. fish-cabo.com added to Cloudflare as a zone (Free plan). The owner changes the **nameservers at the registrar** (the domain is currently managed by Squarespace).
   - **Before switching**, copy every existing DNS record into Cloudflare: MX, SPF/TXT, DKIM, the Google verification TXT, and so on. Otherwise **email for contact@fish-cabo.com would stop**.
3. Cloudflare → Workers → fish-cabo → **Domains & Routes → Add Domain**: `fish-cabo.com` and `www.fish-cabo.com`. Add a `www` → apex redirect if needed.
4. Turnstile hostnames already include fish-cabo.com ✅.
5. Right after the switch:
   - `curl -I https://fish-cabo.com/` returns 200 with no `X-Robots-Tag`;
   - `robots.txt` and the sitemap are correct;
   - 10 old URLs and the `?offset=` URL work;
   - a contact-form email is received;
   - Stripe and Wise buttons open;
   - the chatbot works;
   - a social preview works.
6. **Search Console:** submit the sitemap, inspect `/`, `/fishing-charters`, `/fishing-boats` and one report. Monitor indexing daily for 4 weeks.

## 11. Rollback procedure to Squarespace

1. At the registrar, set the nameservers back to Squarespace's (or the previous DNS host's). The previous DNS records must have been saved before the switch.
2. Squarespace is **not cancelled** and keeps serving the original site unchanged. Keep the subscription for at least 60 days after a stable launch.
3. DNS propagation usually takes minutes to a few hours. Then re-check the live site and email.
4. In Search Console, no action is needed: the URLs are identical on both platforms.

## 12. Final recommendation

**READY FOR OWNER-APPROVED DNS CUTOVER.**

Evidence:
- content verifier 581/581;
- QA 145/145;
- layout 243/243;
- crawl 102/102 pages 200;
- 898/898 assets 200;
- 0 Squarespace dependencies left;
- Lighthouse mobile 99–100 and desktop 100;
- real contact email received;
- Turnstile verified.

**Conditions:**
- the owner completes the 5-minute CMS test;
- the existing DNS records (especially email MX) are copied before the nameserver change.

**Final commit:** the commit that adds this file to `main`. Its hash is given in the delivery message.
