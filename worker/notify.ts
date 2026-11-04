// POST /api/publish-notify — called ONLY by the GitHub Action .github/workflows/publish-notify.yml after it has
// confirmed that the production deployment of a commit is live. No shared secret: the caller proves its identity
// with a short-lived GitHub Actions OIDC token (signed by GitHub, checked here against GitHub's public keys,
// restricted to this repository, the main branch and that workflow file).
// "published" emails are sent only after this Worker re-checks, inside the RUNNING deployment, that:
//   - the deployment was built from that commit (or a newer one) — /deploy-info.json,
//   - every announced article is a published Fishing Report in that deployment and its page exists (HTTP 200),
//   - every article URL is in the live sitemap.
// Otherwise nothing "published" is sent. status "failed" sends a clearly worded "NOT published" alert instead.
import type { Env } from './index';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'fish-cabo-publish-notify';
const REPO = 'ltronelmx-alt/fish-cabo-site';
const WORKFLOW = `${REPO}/.github/workflows/publish-notify.yml@refs/heads/main`;
const TO = 'contact@fish-cabo.com';
const SITE = 'https://fish-cabo.com';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

type Claims = { iss: string; aud: string | string[]; exp: number; nbf?: number; repository: string; ref: string; job_workflow_ref?: string; workflow_ref?: string; sha: string; event_name: string };

export async function verifyOidc(token: string, jwks?: { keys: JsonWebKey[] }): Promise<Claims> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed token');
  const header = JSON.parse(new TextDecoder().decode(b64u(h)));
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const keys = jwks ?? (await fetch(`${ISSUER}/.well-known/jwks`).then((r) => r.json() as Promise<{ keys: (JsonWebKey & { kid: string })[] }>));
  const jwk = (keys.keys as (JsonWebKey & { kid?: string })[]).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  const c = JSON.parse(new TextDecoder().decode(b64u(p))) as Claims;
  const now = Date.now() / 1000;
  if (c.iss !== ISSUER) throw new Error('bad issuer');
  if (!(Array.isArray(c.aud) ? c.aud : [c.aud]).includes(AUDIENCE)) throw new Error('bad audience');
  if (!(c.exp > now) || (c.nbf && c.nbf > now + 60)) throw new Error('expired');
  if (c.repository !== REPO || c.ref !== 'refs/heads/main') throw new Error('wrong repository/branch');
  if ((c.workflow_ref || c.job_workflow_ref) !== WORKFLOW) throw new Error('wrong workflow');
  return c;
}

type DeployInfo = { commit: string; mode: string; reports: { slug: string; title: string; date: string; category: string }[] };

export async function publishNotify(request: Request, env: Env & { NOTIFY_TEST_JWKS?: string }) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const url = new URL(request.url);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  // Test keys are honoured ONLY on a local development server, never on fish-cabo.com.
  const jwks = local && env.NOTIFY_TEST_JWKS ? JSON.parse(env.NOTIFY_TEST_JWKS) : undefined;
  let claims: Claims;
  try {
    claims = await verifyOidc((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), jwks);
  } catch (e) {
    return json({ ok: false, error: 'unauthorized', detail: (e as Error).message }, 401);
  }
  let body: { status?: string; slugs?: string[]; commit?: string; reason?: string; runUrl?: string; test?: boolean };
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const slugs = [...new Set((body.slugs || []).filter((s) => /^[a-z0-9-]{3,160}$/.test(s)))].slice(0, 10);
  const runUrl = /^https:\/\/github\.com\/ltronelmx-alt\/fish-cabo-site\/actions\/runs\/\d+/.test(body.runUrl || '') ? body.runUrl! : '';
  const tag = body.test ? '[TEST] ' : '';

  if (body.status === 'failed') {
    const text = [
      `${tag}A Fishing Log change reached GitHub (main) but it is NOT confirmed as published on ${SITE}.`, '',
      `Reason: ${String(body.reason || 'unknown').slice(0, 300)}`, `Commit: ${claims.sha}`, slugs.length ? `Articles: ${slugs.join(', ')}` : '',
      runUrl ? `Details: ${runUrl}` : '', '', 'Nothing was announced as published. The previous version of the website stays online.',
    ].filter((l) => l !== null).join('\n');
    return send(env, `${tag}⚠️ Fishing Log NOT published — action needed`, text, local);
  }
  if (body.status !== 'published' || !slugs.length) return json({ ok: false, error: 'nothing to announce' }, 400);

  // Re-check inside the running deployment (this Worker version serves exactly these static assets).
  const assetUrl = (p: string) => new URL(p, local ? url.origin : SITE).toString();
  let info: DeployInfo;
  try { info = await env.ASSETS.fetch(assetUrl('/deploy-info.json')).then((r) => r.json() as Promise<DeployInfo>); } catch { return json({ ok: false, error: 'deploy-info missing' }, 409); }
  if (info.mode !== 'production') return json({ ok: false, error: 'not a production build' }, 409);
  if (!local && info.commit !== claims.sha && info.commit !== body.commit) return json({ ok: false, error: 'deployment is not built from this commit', deployed: info.commit }, 409);
  const sitemap = await env.ASSETS.fetch(assetUrl('/sitemap.xml')).then((r) => r.text());
  const items = [];
  for (const slug of slugs) {
    const meta = info.reports.find((r) => r.slug === slug);
    const page = await env.ASSETS.fetch(assetUrl(`/fishing-reports/${slug}`));
    const live = `${SITE}/fishing-reports/${slug}`;
    if (!meta || page.status !== 200 || !sitemap.includes(`<loc>${live}</loc>`)) return json({ ok: false, error: 'article not verified in the running deployment', slug, inBuild: !!meta, status: page.status }, 409);
    items.push({ ...meta, url: live });
  }
  // Duplicate-email guard (best effort): one "published" email per commit + article.
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`${SITE}/__notified/${claims.sha}/${slugs.join('+')}${body.test ? '/test' : ''}`);
  if (!local && (await cache.match(key))) return json({ ok: true, skipped: 'already notified' });
  const text = [
    `${tag}New Fishing Log published on ${SITE}`, '',
    ...items.flatMap((i) => [`• ${i.title}`, `  ${i.category || 'Fishing Report'} — ${i.date}`, `  ${i.url}`, '']),
    `Verified live: page online (HTTP 200), listed in the sitemap, production build of commit ${info.commit.slice(0, 7)}.`,
    runUrl ? `Workflow run: ${runUrl}` : '',
  ].join('\n');
  const res = await send(env, `${tag}✅ Published: ${items.map((i) => i.title).join(' · ').slice(0, 150)}`, text, local);
  if (res.status === 200 && !local) await cache.put(key, new Response('1', { headers: { 'cache-control': 'max-age=2592000' } }));
  return res;
}

async function send(env: Env, subject: string, text: string, local: boolean) {
  if (!env.RESEND_API_KEY) return local ? json({ ok: true, dryRun: true, to: TO, subject, text }) : json({ ok: false, error: 'email service not configured' }, 503);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM || 'Exotic Fish Cabo <onboarding@resend.dev>', to: [TO], subject, text }),
  });
  return r.ok ? json({ ok: true, sent: true, subject }) : json({ ok: false, error: 'email provider error', status: r.status }, 502);
}
