import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Fishing Reports & weekly Fishing Logs. One Markdown file per article.
// The file name is the URL slug, so existing Squarespace URLs are preserved exactly.
const reports = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fishing-reports' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(['San Jose del Cabo Fishing Log', 'Fishing Report']),
    image: z.object({ src: z.string(), alt: z.string(), width: z.number(), height: z.number() }),
    excerpt: z.string(),
    draft: z.boolean().default(false),
    imported: z.boolean().default(false), // false = article body not yet imported from Squarespace
  }),
});

export const collections = { reports };
