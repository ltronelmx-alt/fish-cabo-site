// Helpers to render the ORIGINAL Squarespace content (verbatim HTML) inside the new design.
// They only add wrapper elements for layout; text, tags and order inside a block never change.
import home from '../data/original/home.json';
import charters from '../data/original/fishing-charters.json';
import boats from '../data/original/fishing-boats.json';

export type Block = { kind: 'text' | 'img' | 'button' | 'code'; html?: string; path?: string; alt?: string; link?: string | null; href?: string; text?: string; ga: number[] };
export type Section = { theme: string; bg: { path: string; alt: string } | null; blocks: Block[] };
export type Page = { lang: string; head: string[]; bodyLd: string[]; sections: Section[] };
export const PAGES: Record<string, Page> = { home: home as Page, 'fishing-charters': charters as Page, 'fishing-boats': boats as Page };

/** Split a text block at each <h2> (the h2 starts a new chunk). */
export const byH2 = (html: string) => html.split(/(?=<h2[\s>])/).filter((s) => s.trim());
/** Split a chunk into [intro, ...groups] at each <h3>. */
export function byH3(html: string) {
  const parts = html.split(/(?=<h3[\s>])/);
  const intro = parts[0].startsWith('<h3') ? '' : parts.shift()!;
  return { intro, groups: parts };
}
/** Split a chunk into [intro, ...groups] at each <h4>. */
export function byH4(html: string) {
  const parts = html.split(/(?=<h4[\s>])/);
  const intro = parts[0].startsWith('<h4') ? '' : parts.shift()!;
  return { intro, groups: parts };
}
/** First heading of a chunk + the rest. */
export function headAndRest(html: string) {
  const m = html.match(/^(<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>)([\s\S]*)$/);
  return m ? { head: m[1], rest: m[2] } : { head: '', rest: html };
}
