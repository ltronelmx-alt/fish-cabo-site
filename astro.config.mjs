import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://fish-cabo.com',
  trailingSlash: 'never', // keeps the exact Squarespace URL style (/fishing-boats, no slash)
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  vite: {
    build: { assetsInlineLimit: 0 },
    // `astro dev` (localhost:4321) only serves pages: the booking API lives in the Cloudflare Worker (worker/index.ts).
    // Run the Worker locally in a second terminal (`npm run dev:worker`, port 8787) and these paths are forwarded to it,
    // so /book-now works in `npm run dev` too (before: /api/booking/boats → 404 → "Online booking is not available").
    server: { proxy: { '/api': 'http://127.0.0.1:8787', '/booking-admin': 'http://127.0.0.1:8787' } },
  },
});
