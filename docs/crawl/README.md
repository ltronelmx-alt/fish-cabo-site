# Raw crawl export — production build (2026-11-03)

These files are for an independent audit. Staging (`*.workers.dev`) is password-protected and noindex, so the crawl was run on the **production build** (`npm run build:prod`, no noindex) served by the local Cloudflare runtime (`wrangler dev`, the same Worker and `_headers` as on Cloudflare). URLs are reported on `https://fish-cabo.com`.

- **Crawl scope:** the start set was `/`, every `sitemap.xml` URL, `/cabo-fishing`, `/fishing-reports/older` and one unknown URL (to check the 404). From there the crawl followed every internal link it found, excluding `/admin` and `/api`.
- **`crawl.csv` / `crawl.json`:** one row per URL. Fields:
  - status, content type, `X-Robots-Tag`, bytes;
  - title and its length, meta description, meta robots;
  - canonical, and whether it is self-canonical;
  - H1 count and text, H2 count;
  - `og:title`, `og:image`, `twitter:card`, lang;
  - JSON-LD `@type` list;
  - internal and external link counts, inlinks;
  - images, images without an alt, images with an empty alt;
  - word count of `<main>`.
- **`html.zip`:**
  - `pages/…html`: the full rendered HTML of every crawled page;
  - `raw/robots.txt`, `raw/sitemap.xml`, `raw/_headers.txt`: the production versions.
- **Generator:** `scripts/crawl-export.py`. It can be re-run against any base URL by editing `BASE`.
