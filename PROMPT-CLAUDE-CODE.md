# Prompt to paste into Claude Code (run from this folder)

You are continuing the Cloudflare rebuild of https://fish-cabo.com. This folder is an Astro + Cloudflare Workers project
(read README.md and docs/AUDIT.md first). Scope for now: ONLY the three prototype pages — Homepage (/),
/fishing-charters and /fishing-boats, plus the shared header, dropdown and footer. Do not build other pages yet.
Do not modify the live Squarespace site, DNS or the domain.

Do this, in order, without asking me for routine decisions:

1. `npm install`, then `npm run build` and `npx wrangler dev` to confirm the site runs at http://127.0.0.1:8787.
2. Localize the images: for every image used by the three pages (search `src/` for Squarespace CDN paths, the
   `Img`, `Header` and `Footer` components and `src/data/*.ts`), download the original from
   `https://images.squarespace-cdn.com/content/v1/6911316472567617bebc28b5/<path>?format=2500w` into `public/media/<path>`.
   Then switch the image base in `Img.astro`, `Header.astro`, `Footer.astro` and `Base.astro` to the local `/media/`
   files, generate responsive AVIF/WebP widths (300–2500w) at build time (sharp or Astro's image service), and
   remove `images.squarespace-cdn.com` from the CSP in `scripts/postbuild.mjs`. Keep width/height attributes.
3. Visual fidelity: with Playwright, screenshot the live site and the local build for the three pages at
   375, 768, 1440 and 1920 px (full page). Save them side by side in `docs/compare/`. Fix differences in spacing,
   type sizes, image crops, header, dropdown and footer until the local version matches the live design.
   Keep the documented intentional improvements (docs/AUDIT.md §5).
4. Performance: run Lighthouse (mobile + desktop) on the three live pages and on the three local pages.
   Write the real numbers (Performance score, LCP, CLS, TBT, total page weight, JS size) to `docs/PERFORMANCE.md`.
   Never estimate a number you did not measure.
5. Check SEO on the local build: one H1 per page, titles/descriptions/canonicals match docs/AUDIT.md,
   JSON-LD parses, all links resolve to existing fish-cabo.com URLs, robots noindex is present in the staging build.
6. Leave `npm run dev` running and tell me the URL to open the three pages in my browser.
   Summarize in French what changed and anything that still differs from the live site.
