// Fishing Reports listing markup — reproduces the ORIGINAL Squarespace listing item structure
// (same links, texts and order), generated from the content collection so new CMS posts appear automatically.
import { getCollection, type CollectionEntry } from 'astro:content';
export type Report = CollectionEntry<'reports'>;
export const PER_PAGE = 20;
export async function published() {
  return (await getCollection('reports', (e) => !e.data.draft)).sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.data.listingRank - b.data.listingRank || a.id.localeCompare(b.id));
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdy = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
export const catUrl = (c: string) => `/fishing-reports/category/${encodeURIComponent(c)}`;
export const tagUrl = (t: string) => `/fishing-reports/tag/${encodeURIComponent(t)}`;
export function itemHtml(e: Report) {
  const d = e.data, url = `/fishing-reports/${e.id}`;
  const meta = (d.category ? `<a href="${catUrl(d.category)}">${esc(d.category)}</a>` : '') + `${esc(d.author)}<time>${mdy(d.date)}</time>`;
  const img = d.thumbnail ? `<a href="${url}"><img alt="${esc(d.thumbnail.alt)}" data-path="${esc(d.thumbnail.src)}"/></a>` : '';
  return `<article>${img}${meta}${meta}<h1><a href="${url}">${esc(d.title)}</a></h1>${d.excerpt ? `<p>${d.excerpt}</p>` : ''}<a href="${url}">Read More</a></article>`;
}
