# Exotic Fish Cabo — Final handoff report (pre-launch)

**Date:** 2026-11-03
**Repository:** `ltronelmx-alt/fish-cabo-site`, branch `main`, state as of commit `ddf042e` + this report
**Staging:** https://fish-cabo.small-boat-4235.workers.dev. It is protected by a password (owner only) and noindex.
**Production:** https://fish-cabo.com is still on Squarespace. **No DNS change, nothing touched on Squarespace.**

## 1. Status in one line

The Cloudflare version is complete, tested and production-ready. **The only remaining step is the DNS cut-over, which needs the owner's explicit approval.**

## 2. What was delivered

| Area | Result |
|---|---|
| Pages | 83 original pages at the same URLs, plus 36 Fishing Reports/Logs, the listing with the original `?offset=` pagination, 2 category and 15 tag pages, and a 404 page |
| Content and SEO preservation | Verbatim verifier against the Squarespace export: **581/581**. The only differences are 9 individually documented technical fixes (F1–F8, plus L1 for the Iman Bank link). See `docs/SEO-GEO-FINAL-AUDIT.md` §5 |
| Design | Premium redesign, approved by the owner; responsive at full width on PC, tablet and mobile.<br>• Images are shown whole, capped at their file resolution and at 85% of screen height.<br>• Payment buttons use the platform colours and logos (Stripe violet, Wise green, PayPal yellow), with the Stripe payment-methods picture shown small next to the Stripe button.<br>• "Next Boat" sits on its own row |
| Chatbot | The original EN/ES/FR + WhatsApp chatbot, ported verbatim (CSP-safe wiring, keyboard accessible) |
| Contact form | Same fields as the original. A Worker handles validation, a honeypot and Cloudflare Turnstile.<br>• **Turnstile:** the real key is used, in Invisible mode, for fish-cabo.com and workers.dev. Verified: "Likely human 100%".<br>• **Email:** a real email is sent through **Resend** (free) to `contact@fish-cabo.com` and was **received**.<br>• If email is not configured on the real domain, the form refuses with a WhatsApp/email fallback; it never shows a fake "sent" message |
| CMS | Sveltia CMS at `/admin` (free, GitHub backend) |
| Technical SEO (see the audit) | • Titles cleaned and one business entity.<br>• Correct pagination canonical and one H1 per page.<br>• Social and JSON-LD images self-hosted: 54 copied byte-for-byte by a GitHub Action. 7 of them were already returning 404 on Squarespace.<br>• Sitemap lists the canonical homepage; orphan pages linked.<br>• Production robots and canonicals are on fish-cabo.com, with 0 references to staging |
| Staging protection | Password lock in the Worker (secret `STAGING_PASSWORD`; active only on `*.workers.dev`, never on fish-cabo.com), plus `robots.txt Disallow`, `X-Robots-Tag` and meta noindex. Cloudflare Access was not used because it requires a card on file |

## 3. Test results (final)

| Test | Result |
|---|---|
| Content + SEO verifier | ✅ 581/581 |
| Functional QA (Playwright, `tests/qa.mjs`) | ✅ 145/145 |
| Layout and visual rules, 81 URLs × 3 widths (`tests/layout.mjs`) | ✅ 243/243 |
| Production SEO crawl (`scripts/seo-audit.py`) | ✅ 0 markup in titles, 1 business entity, 0 external social-image hosts, 0 broken internal links, valid sitemap |
| Live staging | ✅ All routes 200, unknown URL 404, security headers, contact form delivers a real email, Turnstile verified |
| Lighthouse 12, production build (`docs/lighthouse-local.tsv`) | **Mobile:** performance 99–100, LCP 1.5–2.0 s, CLS 0, 76–156 KiB total, 13–14 KiB JS.<br>**Desktop:** performance 100.<br>SEO 100, except 92 on /fishing-reports (the original "Read More" link text) |
| Squarespace reference (PSI, mobile homepage) | Performance 49, LCP 9.5 s, TBT 580 ms. The other Squarespace pages could not be measured: the PSI UI stalled and the API hit its quota. No figures are invented |

## 4. Configuration in Cloudflare (Worker `fish-cabo`, Production)

| Name | Type | Purpose |
|---|---|---|
| `SITE_ENV` | Variable | `staging` |
| `STAGING_PASSWORD` | Secret | Staging lock (only on `*.workers.dev`) |
| `TURNSTILE_SECRET` | Secret | Real Turnstile secret |
| `RESEND_API_KEY` | Secret | Resend, sending-only key |
| `CONTACT_TO` | Secret | `contact@fish-cabo.com` |

- **Public Turnstile site key**, in the code: `0x4AAAAAAFyrH2-R96GEy7AN`.
- **Deployment:** Workers Builds deploys automatically on every push to `main` (build `npm run build`, deploy `npx wrangler deploy`).
- **Rotated key:** a Turnstile secret was pasted in chat once by mistake and was **rotated** immediately; the old value is invalid.

## 5. Owner decisions recorded

- **PayPal links empty on purpose:** PayPal is temporarily unavailable. Buttons are kept as on Squarespace.
- **Shared Stripe links between boats are intentional:** they correspond to the same deposit amounts. They are unchanged.
- **The 31ft boat button label "Stipe"** is an original typo and is kept verbatim. Detection uses the stripe.com link.
- **Original text is never rewritten.** Only the design and documented technical fixes were changed.

## 6. Open items (not blockers)

- **JSON-LD coordinates:** 23.0600625, −109.6706875 vs the owner's GPS 23.060275, −109.670677. They are about 24 m apart, both in Puerto Los Cabos Marina. The owner should confirm which one to publish.
- **Original video page text** (`/cabo-fishing-videos/v/can-tv-fishing-show-1`) names a boat and a captain. The owner should decide whether to keep it.
- **Optional:** verify fish-cabo.com in Resend (DNS records) so emails come from an @fish-cabo.com sender. This needs the owner's approval because it is a DNS change.
- **Optional:** BreadcrumbList JSON-LD and an AI-crawler policy (see `docs/PRODUCTION-SEO-CHECKLIST.md` §F).

## 7. Cut-over plan (ONLY with the owner's explicit approval)

1. Set `SITE_ENV=production` and build with `npm run build:prod` (no noindex).
2. In Cloudflare, attach `fish-cabo.com` (and `www`) to the Worker as a Custom Domain. This needs the domain's DNS to point to Cloudflare; the registrar step is done by the owner.
3. Check right away:
   - `X-Robots-Tag` absent, `robots.txt` and the sitemap correct;
   - 10 old URLs return 200, and the `?offset=` URL works;
   - a contact form submission is delivered;
   - the booking buttons work;
   - the social preview image works.
4. Search Console: submit the sitemap, then inspect the key URLs. Monitor indexing daily for 4 weeks.
5. **Rollback:** point the DNS back to Squarespace. Keep the Squarespace subscription for at least 60 days.

## 8. Documents in the repository

- `docs/SEO-GEO-FINAL-AUDIT.md`: the full SEO/GEO audit, the before/after table, the structured-data report and the regression results.
- `docs/PRODUCTION-SEO-CHECKLIST.md`: completed work, remaining owner actions, the cut-over and monitoring plan.
- `docs/STAGING-REPORT.md`: the earlier migration report, with the payment-links table and the migration and rollback plans.
- `docs/SEO-MIGRATION.md`: the page-by-page SEO comparison.
- `docs/qa-results.json`, `docs/layout-results.json`, `docs/lighthouse-local.tsv`: raw test data.
