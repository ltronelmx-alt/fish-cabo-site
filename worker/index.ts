// Cloudflare Worker: serves the static site (Workers Static Assets) and handles the dynamic routes.
// Every request passes here first (needed for the staging password); pages themselves are pre-rendered files.
export interface Env {
  ASSETS: Fetcher;
  EVENTS?: AnalyticsEngineDataset; // optional: anonymous click counts
  TURNSTILE_SECRET?: string; // secret; staging falls back to Cloudflare's public TEST secret
  RESEND_API_KEY?: string; // optional email provider (requires owner approval)
  CONTACT_TO?: string; // destination address for contact messages
  CONTACT_FROM?: string;
  NOTIFY_TEST_JWKS?: string; // local tests only (ignored unless the request host is 127.0.0.1/localhost)
  STAGING_PASSWORD?: string; // secret: password-protects the *.workers.dev staging site only (never fish-cabo.com)
  // Booking system (D1 free plan). Secrets are set by the owner in the Cloudflare dashboard, never in code.
  DB?: D1Database;
  STRIPE_SECRET_KEY?: string; // sk_test_… until the owner approves live payments
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_API_BASE?: string; // local tests only
  BOOKING_LIVE?: string; // "approved" = owner explicitly approved live card payments
  ADMIN_PASSWORD?: string;
}
import REDIRECTS from '../src/data/redirects.json';
import { publishNotify } from './notify';
import { apiBoats, apiAvailability, apiReserve, apiStatus, apiCancelCheckout, apiPay, apiStripeWebhook, cron } from './booking/core';
import { adminPage, adminApi } from './booking/admin';
const TEST_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const STAGING_OPEN_UNTIL = Date.parse('2026-11-04T16:55:00Z'); // = 2026-11-04 09:55 Mazatlán (post-deploy verification window)
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
    const res = await handle(request, env);
    // *.workers.dev is never indexable, whatever the build mode (production builds carry no noindex of their own)
    if (!new URL(request.url).hostname.endsWith('.workers.dev')) return res;
    const h = new Headers(res.headers);
    h.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cron(env).catch((e) => console.log('cron error', String(e))));
  },
} satisfies ExportedHandler<Env>;

async function handle(request: Request, env: Env): Promise<Response> {
    // Canonical host + old URLs: one permanent redirect, never a chain (www → apex and old path → new path together)
    {
      const u = new URL(request.url);
      const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
      const target = (REDIRECTS as Record<string, string>)[path];
      const isWww = u.hostname === 'www.fish-cabo.com';
      if (target && !path.startsWith('/_')) {
        return new Response(null, { status: 301, headers: { location: `https://fish-cabo.com${target}`, 'cache-control': 'public, max-age=86400' } });
      }
      if (isWww) return new Response(null, { status: 301, headers: { location: `https://fish-cabo.com${u.pathname}${u.search}`, 'cache-control': 'public, max-age=86400' } });
    }
    // robots.txt on *.workers.dev is public (no password) so crawlers read "Disallow: /"
    if (new URL(request.url).hostname.endsWith('.workers.dev') && new URL(request.url).pathname === '/robots.txt')
      return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    if (new URL(request.url).pathname === '/api/stripe/webhook') {
      if (!env.DB) return json({ ok: false }, 503);
      return apiStripeWebhook(request, env).catch((e) => { console.log('webhook fatal', String(e)); return json({ ok: false }, 500); });
    }
    const locked = await stagingLocked(request, env);
    if (locked) return locked;
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return contact(request, env);
    if (url.pathname === '/api/publish-notify') return publishNotify(request, env);
    // Booking system. The Stripe webhook is reachable without the staging password (Stripe cannot send one; it is signed).
    if (url.pathname.startsWith('/api/booking/') || url.pathname.startsWith('/api/admin/') || url.pathname === '/admin/bookings') {
      if (!env.DB) return json({ ok: false, error: 'Online booking is not available yet.' }, 503);
      try {
        switch (url.pathname) {
          case '/api/booking/boats': return await apiBoats(env);
          case '/api/booking/availability': return await apiAvailability(request, env);
          case '/api/booking/reserve': return await apiReserve(request, env);
          case '/api/booking/status': return await apiStatus(request, env);
          case '/api/booking/cancel-checkout': return await apiCancelCheckout(request, env);
          case '/api/booking/pay': return await apiPay(request, env);
          case '/admin/bookings': return await adminPage(request, env);
        }
        if (url.pathname.startsWith('/api/admin/')) return await adminApi(request, env);
      } catch (e) {
        console.log('booking error', String(e));
        return json({ ok: false, error: 'Something went wrong. Please try again or contact us on WhatsApp +52 624 122 3506.' }, 500);
      }
      return json({ ok: false, error: 'Not found' }, 404);
    }
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
}
