// Pre-launch audit B2/B6: environment detection and admin links (pure functions). Usage: npx tsx tests/env-unit.ts
import { isProductionEnv, isStagingEnv, adminUrl, isProductionHost, bookingOpen, cardEnabled } from '../worker/booking/envmode';

const results: boolean[] = [];
const t = (name: string, ok: boolean) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const U = (h: string) => new URL(`https://${h}/book-now`);
const prod = { SITE_ENV: 'production' }, stg = { SITE_ENV: 'staging', SITE_URL: 'https://booking-system-fish-cabo.small-boat-4235.workers.dev' };

// B2 — production rules never relaxed by the hostname
t('production Worker on fish-cabo.com → production', isProductionEnv(prod, U('fish-cabo.com')) && !isStagingEnv(prod, U('fish-cabo.com')));
t('production Worker on its *.workers.dev address → STILL production (not staging)', isProductionEnv(prod, U('fish-cabo.small-boat-4235.workers.dev')) && !isStagingEnv(prod, U('fish-cabo.small-boat-4235.workers.dev')));
t('production Worker on a preview-looking workers.dev name → still production', isProductionEnv(prod, U('booking-system-fish-cabo.small-boat-4235.workers.dev')) && !isStagingEnv(prod, U('booking-system-fish-cabo.small-boat-4235.workers.dev')));
t('production Worker reached as 127.0.0.1 → still production', isProductionEnv(prod, new URL('http://127.0.0.1:8787/')) && !isStagingEnv(prod, new URL('http://127.0.0.1:8787/')));
t('fish-cabo.com is production even if SITE_ENV were missing', isProductionEnv({}, U('fish-cabo.com')) && isProductionEnv({ SITE_ENV: 'staging' }, U('www.fish-cabo.com')));
t('staging preview (SITE_ENV=staging) on workers.dev → staging', !isProductionEnv(stg, U('booking-system-fish-cabo.small-boat-4235.workers.dev')) && isStagingEnv(stg, U('booking-system-fish-cabo.small-boat-4235.workers.dev')));
t('local development (SITE_ENV=development) on 127.0.0.1 → staging rules', isStagingEnv({ SITE_ENV: 'development' }, new URL('http://127.0.0.1:8787/')));
t('unknown custom host without production config → neither production nor staging (no test relaxations)', !isProductionEnv(stg, U('example.com')) && !isStagingEnv(stg, U('example.com')));
t('isProductionHost: only fish-cabo.com / www', isProductionHost(U('fish-cabo.com')) && isProductionHost(U('www.fish-cabo.com')) && !isProductionHost(U('fish-cabo.com.evil.dev')) && !isProductionHost(U('xfish-cabo.com')));

// B6 — admin link from trusted configuration only
t('production → https://fish-cabo.com/booking-admin (even if SITE_URL is set)', adminUrl({ SITE_ENV: 'production', SITE_URL: 'https://booking-system-fish-cabo.small-boat-4235.workers.dev' }) === 'https://fish-cabo.com/booking-admin');
t('staging → the staging /booking-admin', adminUrl(stg) === 'https://booking-system-fish-cabo.small-boat-4235.workers.dev/booking-admin');
t('staging SITE_URL with trailing slash → normalised', adminUrl({ SITE_ENV: 'staging', SITE_URL: 'https://booking-system-fish-cabo.small-boat-4235.workers.dev/' }) === 'https://booking-system-fish-cabo.small-boat-4235.workers.dev/booking-admin');
t('local test origin accepted off production', adminUrl({ SITE_ENV: 'staging', SITE_URL: 'http://127.0.0.1:8787' }) === 'http://127.0.0.1:8787/booking-admin');
t('untrusted SITE_URL (other domain, http, path, javascript:) → production address', ['https://evil.example.com', 'http://booking-system.workers.dev', 'https://x.workers.dev/phish', 'javascript:alert(1)', ''].every((u) => adminUrl({ SITE_ENV: 'staging', SITE_URL: u }) === 'https://fish-cabo.com/booking-admin'));

// Public launch switch (worker side)
t('production + switch off → booking API closed', bookingOpen({ SITE_ENV: 'production' }, false) === false);
t('production + switch on → open', bookingOpen({ SITE_ENV: 'production' }, true) === true);
t('staging / local → always open (switch ignored)', bookingOpen({ SITE_ENV: 'staging' }, false) && bookingOpen({ SITE_ENV: 'development' }, false));

// Card payments (Wise-only launch)
t('production + CARD_PAYMENTS_ENABLED false → cards off by configuration', cardEnabled({ SITE_ENV: 'production' }, false) === false);
t('production + CARD_PAYMENTS_ENABLED true → allowed (the key and BOOKING_LIVE still decide)', cardEnabled({ SITE_ENV: 'production' }, true) === true);
t('staging → allowed (the Stripe test key decides)', cardEnabled({ SITE_ENV: 'staging' }, false) === true);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
