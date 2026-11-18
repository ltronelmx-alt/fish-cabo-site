# CCK vacation-rental exit popup — KEEP IN ALL FUTURE DEPLOYMENTS
Owner-approved: 2026-11-18. Applies to the public Exotic Fish Cabo website.

## What it does
- Shows the approved vertical CCK vacation-rental creative and a clickable button to https://cabocasitakeeper.com/vacation-rentals-los-cabos.
- On desktop: user moves pointer outside top edge after 12 seconds (an estimate of exit intent; not a guaranteed browser-exit event).
- On touch/mobile: after >=20 seconds and >=65% page reading progress.
- After a contact form actually succeeds, the popup may appear 1.1 seconds after the success confirmation; not on errors or staging test-only responses.
- At most once per browsing session; may show on a new visit. If the visitor clicked through to CCK, suppress repeat suggestions for seven days.
- Does NOT run on /book-now/*, checkout/payment/confirmation routes, or during API requests. No booking/payment code or prices changed.

## Files to preserve (Claude / other developer / GitHub)
- src/components/CckExitPopup.astro (responsive modal, click/close handlers, guards and triggers)
- public/media/cck/cck-popup-approved.webp (owner-approved visual artwork)
- src/layouts/Base.astro (component import and <CckExitPopup />)
- src/components/ContactForm.astro (dispatches efc:contact-success ONLY after real confirmed successful submission)

## Deployment discipline
Always pull the current origin/main and inspect the diff before editing, rebasing or deploying. Preserve the four integration points above. Do not overwrite newer work with an old local snapshot. On conflict, pause and compare changes; never silently discard the popup. Confirm successful Cloudflare production build AND verify desktop/mobile rendering before declaring deployment complete.

## Test checklist
1. No popup immediately on landing; desktop exit-intent after 12s should show once.
2. Close (X), Escape, and open CCK CTA all work. CTA opens the CCK vacation rental page in a separate tab.
3. A second show in the same session is blocked; a fresh browser session can show again.
4. On mobile, >=65% navigation + >=20 seconds can show once.
5. Contact sends: never on failed send; only after the server returns ok AND not test mode.
6. No popup during /book-now and payment routes; bookings, Stripe, Wise, other site UI remain unchanged.
7. Mobile height and narrow screens should keep all art, CTA and close button inside viewport.
