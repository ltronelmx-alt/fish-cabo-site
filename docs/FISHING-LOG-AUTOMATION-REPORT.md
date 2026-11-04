# Fishing Log Automation — Final Report (2026-11-04)

**Verdict: OPERATIONAL.** A verified Fishing Log pushed to `main` goes live automatically, and an email reaches contact@fish-cabo.com only after the new article is confirmed online.
- Commits: `1a8ffe3` (pipeline) and the follow-up fix to `publish-notify.yml`.
- End-to-end test run: GitHub Actions run 41907017663, success, real email sent.

## 1. How publication works (verified, not assumed)
1. A ChatGPT agent (or the CMS) commits a Markdown file to `src/content/fishing-reports/` on `main`.
2. **Cloudflare Workers Builds** builds and deploys every push to `main`.
   - Proof on the live site: `https://fish-cabo.com/deploy-info.json` shows `branch: main`, `mode: production` and the deployed commit.
   - Each commit also gets a "Workers Builds: fish-cabo — success" check on GitHub.
3. The production build is `npm run build:prod`. **Guard:** if Cloudflare ever builds `main` without production mode, `scripts/postbuild.mjs` stops the build, so a noindex site can never replace the live one.
4. The new article appears automatically on:
   - its page, with a canonical URL, an indexable robots setting and Article JSON-LD;
   - the sitemap (`lastmod` = article date);
   - the `/fishing-reports` listing and its category page;
   - the homepage "Latest Fishing Log" block (weekly logs).
   - Verified locally with a temporary article that was never committed.

## 2. Build gate: `scripts/check-reports.mjs`, before every build
If a problem is found, the build stops, **nothing is deployed** and the live site stays unchanged.
- **Duplicates** (all articles): same title, same weekly period ("October 19–25, 2026"), or same category + same date. Drafts are ignored.
- **Editorial rules for new articles** (anything not listed in `src/data/reports-baseline.json`):
  - every weight in lb must be a multiple of 5 (151 → "about 150 lb");
  - no "Captain/Capt./Cptn/Capitán + Name".
- Boat names, originality and factual accuracy cannot be checked by a machine and remain the agents' responsibility.

## 3. Email notification: `.github/workflows/publish-notify.yml` + `worker/notify.ts`
- **Trigger:** a push to `main` that touches `src/content/fishing-reports/`.
- **New articles only:** files added, or turned from draft to published. Edits to an article that is already public send nothing.
- **Waits** up to 25 minutes until `deploy-info.json` shows a production build containing the pushed commit.
- **Then checks each article:** HTTP 200, title on the page, correct canonical, no noindex, listed in the sitemap, listed on `/fishing-reports`.
- **Then calls** `POST https://fish-cabo.com/api/publish-notify`, authenticated by a **GitHub OIDC token**. No secret is needed: the token is signed by GitHub and accepted only for this repository, branch `main` and this workflow.
  - The Worker checks everything again inside the running deployment.
  - It sends the email through the **existing Resend account**: no new provider, no new cost.
- **Emails:**
  - "✅ Published: <title>": sent only when all checks pass. Duplicate emails are suppressed per commit and article.
  - "⚠️ Fishing Log NOT published — action needed": sent when the deployment never appears or a check fails. It is never a success message.

## 4. Tests performed (no fake article published)
| Test | Result |
|---|---|
| Build gate: clean article / duplicate week / same title / 187 lb + "Captain Pollo" / draft duplicate | OK / blocked / blocked / blocked / ignored |
| Local full pipeline with a temporary article (page, canonical, sitemap, listing, category, homepage, deploy-info) | all OK; article deleted, never committed |
| Detection of new articles (new, draft→published, edit only, empty history) | new / new / none / none |
| `/api/publish-notify` security (12 cases: wrong repository/branch/workflow/audience, expired, tampered, no token, unknown article, failure, test mode) | 12/12 |
| Live: unauthenticated call | 401 |
| Live end-to-end test (existing Oct 19–25 log, `[TEST]` email) | success, email sent |
| Regressions: SEO/GEO 581/581 · QA 145/145 · chatbot 82/82 · reviews 51/51 · layout 243/243 | all pass |

The first live test exposed a bug in the checks (shell SIGPIPE) and correctly sent a "[TEST] NOT published" alert. The bug is fixed, and the second run succeeded.

## 5. Rules for the ChatGPT agents (front matter of a new file)
```
---
title: "San Jose del Cabo Fishing Log — November 2–8, 2026"
description: "…"
date: 2026-11-08
category: "San Jose del Cabo Fishing Log"   # monthly reports: "Fishing Report"
format: "markdown"
excerpt: "…"
draft: false
---
```
- One file per article. The file name is the URL slug. Commit directly to `main`.
- Gordo Banks is a factual source, never a text template. Content must be original.
- Round weights to 5 lb. No invented catches, no captain or boat names.
- If the build gate blocks an article, the owner receives the "NOT published" email. Fix the article and commit again.

## 6. Limits
- The build command in the Cloudflare dashboard could not be viewed (no dashboard session). Production mode is proven by the live `deploy-info.json` and enforced by the guard above.
- If Resend is down, the workflow fails and GitHub shows a failed run. The article itself is still published.
