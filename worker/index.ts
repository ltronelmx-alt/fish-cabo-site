// Cloudflare Worker: serves the static site (Workers Static Assets) and handles the dynamic routes.
// Every request passes here first (needed for the staging password); pages themselves are pre-rendered files.
export interface Env {
  ASSETS: Fetcher;
  EVENTS?: AnalyticsEngineDataset; // optional: anonymous click counts
  TURNSTILE_SECRET?: string; // secret; staging falls back to Cloudflare's public TEST secret
  RESEND_API_KEY?: string; // optional email provider (requires owner approval)
  CONTACT_TO?: string; // destination address for contact messages
  CONTACT_FROM?: string;
  STAGING_PASSWORD?: string; // secret: password-protects the *.workers.dev staging site only (never fish-cabo.com)
}
const TEST_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const STAGING_OPEN_UNTIL = Date.parse('2026-11-04T01:50:00Z'); // = 2026-11-03 18:50 Mazatlán
// Staging lock: only on *.workers.dev and only once the STAGING_PASSWORD secret exists. Any user name, that password.
async function stagingLocked(request: Request, env: Env): Promise<Response | null> {
  const host = new URL(request.url).hostname;
  if (!env.STAGING_PASSWORD || !host.endsWith('.workers.dev')) return null;
  // Temporary open window (owner request, 2026-11-03): staging readable without password until this time, then locked again automatically
  if (Date.now() < STAGING_OPEN_UNTIL) return null;
  const h = request.headers.get('authorization') || '';
  let pass = '';
  try { pass = h.startsWith('Basic ') ? atob(h.slice(6)).split(':').slice(1).join(':') : ''; } catch {}
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(pass)), crypto.subtle.digest('SHA-256', enc.encode(env.STAGING_PASSWORD))]);
  if (crypto.subtle.timingSafeEqual(a, b)) return null;
  return new Response('Staging site — password required', { status: 401, headers: { 'www-authenticate': 'Basic realm="Exotic Fish Cabo staging", charset="UTF-8"', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } });
}
// Staging (*.workers.dev) always uses Cloudflare's public TEST secret (always passes) so the form can be tested;
// fish-cabo.com uses the real TURNSTILE_SECRET. The real secret must be re-checked before going live.
const turnstileSecret = (_request: Request, env: Env) => env.TURNSTILE_SECRET || TEST_TURNSTILE_SECRET;
const ALLOWED_EVENTS = /^[a-z0-9_-]{2,80}$/;

async function contact(request: Request, env: Env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'Forbidden' }, 403);
  let fd: FormData;
  try { fd = await request.formData(); } catch { return json({ ok: false, error: 'Invalid form' }, 400); }
  if ((fd.get('website') as string)?.length) return json({ ok: true }); // honeypot: silently ignore bots
  const get = (k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max);
  const data = {
    firstName: get('fname', 80), lastName: get('lname', 80), email: get('email', 120), phone: get('phone', 40), date: get('date', 20),
    people: get('people-aboard-10-max', 40), duration: get('duration', 40), boat: get('boats', 80), message: get('message', 5000),
  };
  const missing = Object.entries(data).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return json({ ok: false, error: 'Please complete all required fields.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
  // Cloudflare Turnstile verification
  const token = String(fd.get('cf-turnstile-response') ?? '');
  // Staging (*.workers.dev) is already behind the staging password: the anti-bot check only runs on the real domain.
  const isStaging = new URL(request.url).hostname.endsWith('.workers.dev');
  // staging: verify with the real secret once it is set (to test it before launch); without it, skip
  const ver = isStaging && !env.TURNSTILE_SECRET ? { success: true, 'error-codes': [] as string[] } : await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: turnstileSecret(request, env), response: token, remoteip: request.headers.get('cf-connecting-ip') || '' }),
  }).then((r) => r.json() as Promise<{ success: boolean; 'error-codes'?: string[] }>).catch(() => ({ success: false, 'error-codes': ['siteverify-unreachable'] }));
  if (!ver.success) {
    const codes = ver['error-codes'] || [];
    console.log('turnstile failed', JSON.stringify({ codes, tokenLength: token.length })); // no personal data logged
    // staging only: show Cloudflare's error codes to help diagnose the configuration
    const dbg = new URL(request.url).hostname.endsWith('.workers.dev') ? { codes, tokenLength: token.length } : {};
    return json({ ok: false, error: 'Verification failed. Please try again.', ...dbg }, 403);
  }
  // Delivery: only when an approved provider is configured; otherwise TEST MODE (nothing sent, nothing stored).
  if (!env.RESEND_API_KEY || !env.CONTACT_TO) {
    // staging: test mode (nothing sent). fish-cabo.com: never pretend a request was sent when no email is configured
    if (new URL(request.url).hostname.endsWith('.workers.dev')) return json({ ok: true, test: true });
    return json({ ok: false, error: 'The form is temporarily unavailable. Please contact us on WhatsApp +52 624 122 3506 or at contact@fish-cabo.com.' }, 503);
  }
  const text = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM || 'Exotic Fish Cabo <onboarding@resend.dev>', to: [env.CONTACT_TO], reply_to: data.email, subject: `New charter request — ${data.firstName} ${data.lastName} (${data.date})`, text }),
  });
  return r.ok ? json({ ok: true }) : json({ ok: false, error: 'Sorry, the message could not be sent. Please contact us on WhatsApp.' }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const locked = await stagingLocked(request, env);
    if (locked) return locked;
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return contact(request, env);
    if (url.pathname === '/api/event') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      try {
        const body = (await request.json()) as { event?: string; page?: string };
        const event = String(body.event ?? '');
        if (ALLOWED_EVENTS.test(event) && env.EVENTS) env.EVENTS.writeDataPoint({ blobs: [event, String(body.page ?? '').slice(0, 200), String((request as any).cf?.country ?? '')], doubles: [1], indexes: [event] });
      } catch { /* ignore */ }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    // Squarespace-style blog pagination: /fishing-reports?offset=<timestamp> → pre-rendered older page
    if (url.pathname === '/fishing-reports' && url.searchParams.has('offset')) {
      const r = await env.ASSETS.fetch(new Request(new URL('/fishing-reports/older', url), request));
      return new Response(r.body, r);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
