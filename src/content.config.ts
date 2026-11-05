import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Fishing Reports & weekly Fishing Logs — one Markdown file per article (file name = URL slug).
// Imported articles keep their ORIGINAL HTML body (format: html) and ORIGINAL <head> tags (originalHead).
// New articles written in the CMS use Markdown (format: markdown) and get head tags from the fields below.
const reports = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fishing-reports' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().default(''),
    date: z.coerce.date(),
    category: z.string().default('Fishing Report'),
    tags: z.array(z.string()).default([]),
    author: z.string().default('EXOTIC FISH-CABO'),
    image: z.object({ src: z.string(), alt: z.string().default('') }).nullable().optional(),
    thumbnail: z.object({ src: z.string(), alt: z.string().default('') }).nullable().optional(),
    thumbnailSource: z.string().optional(),
    imageTitle: z.string().optional(), // title attribute of the featured photo (new Markdown articles)
    caption: z.string().optional(), // visible caption under the featured photo (new Markdown articles)
    updated: z.coerce.date().optional(), // dateModified (defaults to date)
    listingRank: z.number().default(999), // tie-breaker for posts published the same day (original order)
    excerpt: z.string().default(''),
    excerptSource: z.string().optional(),
    format: z.enum(['html', 'markdown']).default('markdown'),
    draft: z.boolean().default(false),
    originalHead: z.array(z.string()).optional(),
  }),
});
export const collections = { reports };
