// Daily review sync — official APIs only (no scraping). Writes src/data/reviews.json.
// Google:      Google Business Profile API v4, accounts.locations.reviews.list (OAuth, owner's own verified listing).
// Tripadvisor: Tripadvisor Content API, /location/{id}/reviews (returns at most the 5 most recent reviews).
// Rules: only genuine reviews returned by the API; only exactly 5-star; newest first; max 5 per platform.
// A platform whose credentials are missing or whose call fails keeps its previous data untouched.
// Credentials come only from environment variables (GitHub Actions secrets) — never from the repo.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/data/reviews.json', import.meta.url);
const MAX = 5;
const env = process.env;
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const log = (...a) => console.log('[reviews]', ...a);

const valid = (r) => r && r.rating === 5 && typeof r.text === 'string' && r.text.trim().length > 0 && !Number.isNaN(Date.parse(r.date));
const newest = (a, b) => Date.parse(b.date) - Date.parse(a.date);
// "Jane Doe" -> "Jane D." (short public display name); single-word names unchanged.
const shortName = (s) => {
  const p = String(s || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'Google user';
  return p.length === 1 ? p[0] : `${p[0]} ${[...p[p.length - 1]][0].toUpperCase()}.`;
};
// Google returns "(Translated by Google) … (Original) …" for translated reviews: keep the original text.
const googleText = (c = '') => {
  const m = c.match(/\(Original\)\s*([\s\S]+)$/);
  return (m ? m[1] : c.replace(/^\(Translated by Google\)\s*/, '')).trim();
};

async function json(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} ← ${url.split('?')[0]}`);
  return r.json();
}

export function mapGoogle(reviews) {
  return reviews
    .filter((r) => r.starRating === 'FIVE')
    .map((r) => ({
      id: r.reviewId || r.name,
      author: r.reviewer?.isAnonymous ? 'Google user' : shortName(r.reviewer?.displayName),
      authorMeta: 'Google review',
      rating: 5,
      text: googleText(r.comment),
      date: r.createTime,
    }))
    .filter(valid).sort(newest).slice(0, MAX);
}

export function mapTripadvisor(reviews) {
  return reviews
    .filter((r) => Number(r.rating) === 5)
    .map((r) => ({
      id: String(r.id),
      author: r.user?.username || 'Tripadvisor member',
      authorMeta: r.user?.user_location?.name || undefined,
      rating: 5,
      title: r.title || undefined,
      text: (r.text || '').trim(),
      date: r.published_date,
      url: r.url || undefined,
      ratingImage: r.rating_image_url || undefined,
    }))
    .filter(valid).sort(newest).slice(0, MAX);
}

async function google() {
  const need = ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_ACCOUNT_ID', 'GBP_LOCATION_ID'];
  if (need.some((k) => !env[k])) return log('google: credentials not configured — skipped (previous data kept)');
  const tok = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GBP_CLIENT_ID, client_secret: env.GBP_CLIENT_SECRET, refresh_token: env.GBP_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const base = `https://mybusiness.googleapis.com/v4/accounts/${env.GBP_ACCOUNT_ID}/locations/${env.GBP_LOCATION_ID}/reviews`;
  let all = [], pageToken = '', pages = 0;
  do { // newest first; stop as soon as we hold 5 five-star reviews (or after 10 pages = 500 reviews)
    const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc', ...(pageToken && { pageToken }) });
    const res = await json(`${base}?${q}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
    all = all.concat(res.reviews || []);
    pageToken = res.nextPageToken || '';
  } while (pageToken && ++pages < 10 && all.filter((r) => r.starRating === 'FIVE').length < MAX * 3);
  data.google.items = mapGoogle(all);
  data.google.fetchedAt = new Date().toISOString();
  log(`google: ${all.length} reviews read, ${data.google.items.length} five-star kept`);
}

async function tripadvisor() {
  if (!env.TRIPADVISOR_API_KEY) return log('tripadvisor: API key not configured — skipped (previous data kept)');
  const id = env.TRIPADVISOR_LOCATION_ID || '9569970';
  const q = new URLSearchParams({ key: env.TRIPADVISOR_API_KEY, language: 'en' });
  const res = await json(`https://api.content.tripadvisor.com/api/v1/location/${id}/reviews?${q}`, {
    headers: { accept: 'application/json', referer: 'https://fish-cabo.com/' },
  });
  data.tripadvisor.items = mapTripadvisor(res.data || []);
  data.tripadvisor.fetchedAt = new Date().toISOString();
  log(`tripadvisor: ${(res.data || []).length} reviews read (API max 5), ${data.tripadvisor.items.length} five-star kept`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  for (const [name, fn] of [['google', google], ['tripadvisor', tripadvisor]]) {
    try { await fn(); } catch (e) { failed++; console.error(`[reviews] ${name}: FAILED — previous data kept. ${e.message}`); }
  }
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  if (failed === 2) process.exitCode = 1;
}
