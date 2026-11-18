# CCK vacation-rental exit popup — KEEP IN ALL FUTURE DEPLOYMENTS
Owner-approved: 2026-11-18. Applies to the public Exotic Fish Cabo website.

## What it does
- Shows the approved vertical CCK vacation-rental creative and a clickable button to https://cabocasitakeeper.com/vacation-rentals-los-cabos.
- On desktop: after at least 7 seconds and meaningful mouse browsing, show on upward/rightward movement into the invisible top-right viewport region (right 26%, top 65px), OR on upward movement across the top 45px / top-edge exit. No 35-second (or other timer-only) desktop popup. Browser UI itself cannot be inspected and closing via Ctrl+W / X is not guaranteed.
- On touch/mobile: only on the first deliberate tap of the existing EFC header logo OR hamburger Menu button at <=860px (including iPhone, Android, and hybrid touch). Uses document click capture; intercepts the tap only if showModal() actually succeeds. Later taps work normally (logo navigates home, hamburger opens the menu). No automatic scroll, time, or inactivity popup.
- After a contact form actually succeeds, the popup may appear 1.1 seconds after the success confirmation; not on errors or staging test-only responses.
- At most once per site visit; reset on a fresh navigation arriving from outside fish-cabo.com (including opening the site directly in a tab), and after 30 minutes of inactivity. Internal navigation/reload retains the once-per-visit cap. Clicking through to CCK does NOT impose a 7-day ban: a future visit may show the popup again.
- Does NOT run on /book-now/*, checkout/payment/confirmation routes, or during API requests. No booking/payment code or prices changed.

## Files to preserve (Claude / other developer / GitHub)
- src/components/CckExitPopup.astro (responsive modal, click/close handlers, guards and triggers)
- public/media/cck/cck-popup-approved.webp (owner-approved visual artwork)
- src/layouts/Base.astro (component import and <CckExitPopup />)
- src/components/ContactForm.astro (dispatches efc:contact-success ONLY after real confirmed successful submission)

## Deployment discipline
Always pull the current origin/main and inspect the diff before editing, rebasing or deploying. Preserve the four integration points above. Do not overwrite newer work with an old local snapshot. On conflict, pause and compare changes; never silently discard the popup. Confirm successful Cloudflare production build AND verify desktop/mobile rendering before declaring deployment complete.

## Test checklist
1. PC: no time-only popup. After 7s move the mouse into content (y>140px), then diagonally toward the upper-right corner inside the page (right 26%, top 65px), or upward over top 45px. Must show once. Directly closing via Ctrl+W cannot be intercepted.
2. Close (X), Escape, and open CCK CTA all work. CTA opens the CCK vacation rental page in a separate tab.
3. A second show during the same visit is blocked; internal page navigation preserves that. Returning to fish-cabo.com on a later separate visit (even in the same browser tab) allows another display.
4. On mobile, no popup after scroll or waiting. First tap on either EFC logo or three-line Menu control on a new visit: CCK opens. Close it; logo tap navigates home and Menu tap opens the menu normally. Navigate away and return: first header-control tap can show CCK again.
5. Contact sends: never on failed send; only after the server returns ok AND not test mode.
6. No popup during /book-now and payment routes; bookings, Stripe, Wise, other site UI remain unchanged.
7. Mobile height and narrow screens should keep all art, CTA and close button inside viewport.
