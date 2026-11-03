# fish-cabo.com: Astro + Cloudflare Workers

Static site (Astro) served by Cloudflare Workers Static Assets. A small Worker handles `/api/*` only.

## Commands
- `npm run dev`: local preview (http://localhost:4321)
- `npm run build`: **staging** build (noindex everywhere, robots.txt blocks all crawlers)
- `npm run build:prod`: production build (indexable). Use it only after the cut-over has been approved.
- `npx wrangler dev`: local test with the Worker and the `_headers` rules

## Cloudflare staging deployment (one-time setup, ~5 min, from the dashboard)
1. Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → choose this GitHub repo.
2. Build command: `npm run build` · Deploy command: `npx wrangler deploy` (default).
3. After the first deploy: Worker → Settings → Domains & Routes → workers.dev → **enable Cloudflare Access** (only your email can open it).
4. Do NOT add fish-cabo.com before the cut-over has been approved.

## Structure
- `src/pages/`: one file per page (same URLs as Squarespace)
- `src/content/fishing-reports/`: one Markdown file per Fishing Log / Report (file name = slug)
- `src/data/site.ts`, `src/data/boats.ts`: business info, menu, boats
- `worker/index.ts`: `/api/event` (click counting); later `/api/contact`
- `scripts/postbuild.mjs`: `_headers` (security + cache), `robots.txt`, `sitemap.xml`
- `docs/AUDIT.md`: audit of the current site and decisions
