import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://fish-cabo.com',
  trailingSlash: 'never', // keeps the exact Squarespace URL style (/fishing-boats, no slash)
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  vite: { build: { assetsInlineLimit: 0 } },
});
