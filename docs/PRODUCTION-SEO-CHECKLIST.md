# Production SEO checklist — Exotic Fish Cabo

**Production migration is prohibited without the owner's explicit authorization.** Squarespace stays active for rollback.

## A. Completed technical work (verified 2026-11-03)
- [x] All 81 original sitemap URLs + homepage + legal pages served (200). The Squarespace pagination URL `?offset=` is served by the Worker.
- [x] Canonicals on `https://fish-cabo.com`. 0 references to workers.dev in the production build.
- [x] Production `robots.txt`: `Allow: /` + `Sitemap: https://fish-cabo.com/sitemap.xml`. No `X-Robots-Tag` except `/admin/*`.
- [x] Sitemap: valid XML, canonical absolute URLs only (F7). New CMS posts added with their own publication date. Drafts excluded (not built).
- [x] Titles cleaned (F1). One business entity (F2). Pagination canonical (F3). One H1 per page (F4, F5). Durable social images (F6). Orphans linked (F8). Archive descriptions added.
- [x] Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- [x] Full internal-link crawl: 0 broken. Functional QA 145/145. Layout 243/243. Lighthouse: see `docs/SEO-GEO-FINAL-AUDIT.md` §8.
- [x] Staging noindex active (robots Disallow, X-Robots-Tag, meta robots).

## B. Remaining owner actions (blockers for cut-over)
1. ~~Contact email delivery~~: **done and tested 2026-11-03.** Resend (free) is set up, with Worker secrets `RESEND_API_KEY` and `CONTACT_TO=contact@fish-cabo.com`. A real test inquiry was received. Sender: `onboarding@resend.dev`, which delivers only to the Resend account address (contact@fish-cabo.com); that is enough here. *Optional, owner approval needed:* verify fish-cabo.com in Resend (DNS records) to send from an @fish-cabo.com address.
2. ~~Turnstile~~: **done 2026-11-03.**
   - Real site key `0x4AAAAAAFyrH2-R96GEy7AN` (Invisible; hostnames fish-cabo.com + workers.dev).
   - Real `TURNSTILE_SECRET` Worker secret set.
   - A test submission on staging returned success with the real secret.
3. ~~Staging protection~~: **done.** Password lock (Worker secret `STAGING_PASSWORD`, only on *.workers.dev). Cloudflare Access was not used because it requires a card on file.
4. **CMS publish test.** Log in at `/admin` with your own GitHub token, publish one test report, check the page, sitemap and listing, then delete it.
5. ~~PayPal~~: **intentional (owner, 2026-11-03).** PayPal is temporarily unavailable. The buttons are kept as on Squarespace, and customers are told directly. Not a blocker.
6. **Coordinates.** Confirm which marina point to publish in JSON-LD: 23.0600625, −109.6706875 (current schema) or 23.060275, −109.670677 (GPS buttons). They are ≈24 m apart.
7. **Video page text.** It names a boat and a captain (`/cabo-fishing-videos/v/can-tv-fishing-show-1`). Keep or remove.
8. **Production build command at cut-over:** `npm run build:prod`, which sets `PUBLIC_SITE_ENV=production`.

## C. Items awaiting external credentials
- Google Search Console (owner account): Domain property, sitemap submission, URL inspection.
- An email provider API key (if Resend).
- The Turnstile secret.

## D. Cut-over (only after explicit approval)
1. Deploy the production build to the Worker and attach `fish-cabo.com` as a Custom Domain in Cloudflare (DNS change at the registrar, by the owner).
2. Check right away:
   - `curl -I https://fish-cabo.com/` returns 200 with **no** `X-Robots-Tag`;
   - `robots.txt` and `sitemap.xml` are correct;
   - 10 random old URLs return 200;
   - the `?offset=` URL works;
   - the contact form delivers;
   - the booking buttons work.
3. Search Console: submit the sitemap and inspect `/`, `/fishing-charters`, `/fishing-boats` and one Fishing Report.
4. Rollback: point the DNS back to Squarespace (keep the subscription for at least 60 days).

## E. Post-launch monitoring (Search Console)
- **Weeks 1–4:** daily Page indexing report (look for "Duplicate, Google chose different canonical", 404s and soft 404s), Performance clicks and impressions vs the previous 28 days, Core Web Vitals once CrUX data appears.
- Expected canonical behaviour:
  - `/cabo-fishing` → `/`;
  - `/fishing-reports/older` → the `?offset=` URL;
  - tag and category pages are indexable but not in the sitemap (as on Squarespace).
- Re-run `python3 scripts/seo-audit.py <dist>` after any template change.

## F. Optional improvements (validate before doing)
- **BreadcrumbList JSON-LD** on reports and boat pages: low risk, supported by Google.
- **VideoObject** on video pages: only with verified upload dates.
- **Merge duplicate tags** in the CMS (e.g. "Bottom fishing" / "bottom fishing").
- **AI crawler policy:** all crawlers are currently allowed. Blocking training-only crawlers (e.g. GPTBot, Google-Extended, CCBot) while allowing search and retrieval crawlers is a business choice. It does not affect Google Search ranking.
- **`llms.txt`:** experimental, no proven effect. Not required.
