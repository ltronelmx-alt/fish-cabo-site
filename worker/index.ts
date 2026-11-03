// Cloudflare Worker: serves the static site (Workers Static Assets) and handles the dynamic routes.
// Only /api/* and /fishing-reports?offset=… run this code; every page is a pre-rendered file.
export interface Env {
  ASSETS: Fetcher;
  EVENTS?: AnalyticsEngineDataset; // optional: anonymous click counts
  TURNSTILE_SECRET?: string; // secret; staging falls back to Cloudflare's public TEST secret
  RESEND_API_KEY?: string; // optional email provider (requires owner approval)
  CONTACT_TO?: string; // destination address for contact messages
  CONTACT_FROM?: string;
}
const TEST_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
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
  const ver = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET || TEST_TURNSTILE_SECRET, response: token, remoteip: request.headers.get('cf-connecting-ip') || '' }),
  }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  if (!ver.success) return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
  // Delivery: only when an approved provider is configured; otherwise TEST MODE (nothing sent, nothing stored).
  if (!env.RESEND_API_KEY || !env.CONTACT_TO) return json({ ok: true, test: true });
  const text = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM || 'Exotic Fish Cabo <onboarding@resend.dev>', to: [env.CONTACT_TO], reply_to: data.email, subject: `New charter request — ${data.firstName} ${data.lastName} (${data.date})`, text }),
  });
  return r.ok ? json({ ok: true }) : json({ ok: false, error: 'Sorry, the message could not be sent. Please contact us on WhatsApp.' }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
