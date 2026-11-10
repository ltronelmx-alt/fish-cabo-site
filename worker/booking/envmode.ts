// Environment decisions in ONE place (pre-launch audit B2/B6, 2026-11-09). Pure functions, no Cloudflare types,
// so they are unit-tested directly (tests/env-unit.ts).
//
// Rule: production security applies when the Worker is configured as production (SITE_ENV=production, set in the
// top-level "vars" of wrangler.jsonc) OR when the request arrives on fish-cabo.com — whatever the hostname. A production
// Worker answering on *.workers.dev is therefore still production (real Turnstile, no TEST label, no diagnostics).
// Staging = Cloudflare Previews, which set SITE_ENV=staging in "previews.vars".

import launch from '../../src/data/launch.json';

export type EnvLike = { SITE_ENV?: string; SITE_URL?: string };

export const isProductionHost = (u: URL) => u.hostname === 'fish-cabo.com' || u.hostname === 'www.fish-cabo.com';
export const isLocalHost = (u: URL) => u.hostname === '127.0.0.1' || u.hostname === 'localhost';

/** Production rules (never relaxed because of the hostname). */
export const isProductionEnv = (env: EnvLike, u: URL) => env.SITE_ENV === 'production' || isProductionHost(u);

/** Staging/local rules (test Turnstile pair, TEST label, staging diagnostics) — only when NOT production. */
export const isStagingEnv = (env: EnvLike, u: URL) => !isProductionEnv(env, u) && (u.hostname.endsWith('.workers.dev') || isLocalHost(u));

export const PRODUCTION_ADMIN_URL = 'https://fish-cabo.com/booking-admin';
const TRUSTED_STAGING_ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/i;
const TRUSTED_LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/;

/** Link to /booking-admin for owner emails, from trusted configuration only (never from request headers).
 * Production → https://fish-cabo.com/booking-admin. Staging → SITE_URL (previews.vars) when it is a workers.dev or
 * local origin; anything else falls back to the production address. */
export function adminUrl(env: EnvLike): string {
  if (env.SITE_ENV === 'production') return PRODUCTION_ADMIN_URL;
  const s = (env.SITE_URL || '').trim().replace(/\/+$/, '');
  return TRUSTED_STAGING_ORIGIN.test(s) || TRUSTED_LOCAL_ORIGIN.test(s) ? `${s}/booking-admin` : PRODUCTION_ADMIN_URL;
}

/** PUBLIC LAUNCH SWITCH (src/data/launch.json, the same file the pages are built from). Staging/local: always open.
 * Production: the public booking API (/api/booking/*) answers only after the owner-authorised switch. /booking-admin
 * and the signed Stripe webhook are not affected (the owner can verify the production database before the launch). */
export const bookingOpen = (env: EnvLike, launched: boolean = launch.PUBLIC_BOOKING_LAUNCHED === true) => env.SITE_ENV !== 'production' || launched;

/** Card payments allowed by configuration (Wise-only launch). Staging/local: yes (the Stripe key decides). Production:
 * only once launch.json CARD_PAYMENTS_ENABLED is true — and the Stripe key/BOOKING_LIVE rules still apply on top. */
export const cardEnabled = (env: EnvLike, enabled: boolean = launch.CARD_PAYMENTS_ENABLED === true) => env.SITE_ENV !== 'production' || enabled;

/** PayPal allowed by configuration (owner 2026-11-09). Staging/local: yes (the PayPal credentials decide). Production:
 * only once launch.json PAYPAL_PAYMENTS_ENABLED is true — and the credential/PAYPAL_LIVE rules (paypal.ts) apply on top. */
export const paypalEnabled = (env: EnvLike, enabled: boolean = (launch as { PAYPAL_PAYMENTS_ENABLED?: boolean }).PAYPAL_PAYMENTS_ENABLED === true) => env.SITE_ENV !== 'production' || enabled;
