// Public launch switch — see src/data/launch.json. Build side (pages, links, buttons). The Worker side is in
// worker/booking/envmode.ts (bookingOpen), reading the SAME file, so pages and API always switch together.
import launch from '../data/launch.json';

/** true on staging/local builds; on production builds only when launch.json says so (owner-authorised switch). */
export const BOOKING_OPEN = import.meta.env.PUBLIC_SITE_ENV !== 'production' || launch.PUBLIC_BOOKING_LAUNCHED === true;

/** Before the launch, a link to the booking page keeps the pre-launch destination (as on the production site). */
export const bookHref = (href?: string) => (!BOOKING_OPEN && href && /^\/book-now(\?|$)/.test(href) ? '/fishing-boats' : href);

/** Card payments offered on this build (Wise-only launch, owner 2026-11-09). Staging/local: always (they follow the key). */
export const BOOKING_CARD = import.meta.env.PUBLIC_SITE_ENV !== 'production' || launch.CARD_PAYMENTS_ENABLED === true;
