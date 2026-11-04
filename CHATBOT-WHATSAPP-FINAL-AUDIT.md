# Chatbot & WhatsApp audit: final report

**Date:** 2026-11-04
**Branch:** `chatbot-audit`. It is **not merged and not deployed** to fish-cabo.com. Production stays on `main` (d0f7aa9).
**Files changed:**
- `public/js/efc-chat.js`
- `src/components/Chat.astro` (accessibility attributes only)
- `tests/chat.mjs` (new)
- `docs/chat-results.json` (new)
- this report

The look is unchanged: the same `src/styles/chat.css` and the same DOM ids and classes.

## 1. Existing functions (mapped before any change)

1. Bubble to open, × to close, and automatic opening after 50 s of inactivity.
2. Welcome message with 4 actions: Packages, Fish & Seasons, Book Now, WhatsApp.
3. EN/ES/FR selector; language saved in `localStorage`; initial language taken from the browser.
4. Free-text questions answered by keyword rules: prices, booking, fish, seasons, boats, families, location, inclusions, contact, reviews, greetings, thanks.
5. Two-step unknown handling: suggestions first, then a team handoff.
6. Typing indicator and timestamps.
7. WhatsApp link (`wa.me`) with a prefilled message.
8. CSP-safe event wiring, with no inline handlers.

All of these are kept.

## 2. Confirmed defects (each reproduced, not assumed)

| # | Defect | Evidence |
|---|---|---|
| D1 | **XSS / HTML injection:** visitor text was inserted with `innerHTML` | `addMessage(text, true)` builds HTML from raw input |
| D2 | **Language detection never ran:** it only ran when the history was empty, but the welcome message is always there first | `if (msgs.children.length === 0 …)` in `sendMessage` |
| D3 | **Switching language left old answers in the previous language;** the welcome was only translated when the chat was empty | `setLang` → `showWelcome` only if empty |
| D4 | **Mixed-language WhatsApp message:** localized intro plus English context ("General inquiry", "Question not understood by bot"); no customer details | `whatsappPre + action.context` |
| D5 | **ES "Medio día" and EN "Half day"** in the booking steps, while the offer is **3/4 day = 6 h** (`/fishing-charters`, FAQ) | `bookingSteps` |
| D6 | **Raw `**bold**` markers** displayed to visitors | No markdown rendering |
| D7 | **Facts not matching the site:**<br>• tip "15-20%" (FAQ: 10-20%);<br>• "Food/drinks not included" (site: bottled water and soft drinks included);<br>• "Gear/bilingual crew" vs the site's list;<br>• prices without "(1-2 guests)";<br>• unverifiable claims ("Many say it's the highlight…", "guests return year after year", "accessible from all hotels") | Compared with /fishing-boats, /cabo-fishing-faq and /fishing-charters |
| D8 | **Wrong topic matching:**<br>• "fish" matched inside "fishing", so "Do you provide fishing equipment?" gave the fish answer;<br>• `\b` breaks on accents: "número" matched "mero", "où" was not matched, "cancelación" was not matched;<br>• "hi" matched inside words | Unit checks plus the browser suite |
| D9 | **Missing answers:** payment and deposit, cancellation, departure time, and "not from Cabo San Lucas Marina" | No rule |
| D10 | **Untranslated labels:** "📅 Fishing Calendar" button in all languages; FR welcome "¡Hola !"; ES "crew bilingüe" / "Propina crew"; FR "Pourboire crew"; " :" French spacing in EN/ES | `I18N` |
| D11 | **Accessibility:**<br>• no Escape key;<br>• × and send buttons without labels;<br>• input without a label;<br>• no dialog role or live region;<br>• focus not returned to the bubble on close;<br>• automatic opening stole focus (and opened the keyboard on mobile) | DOM inspection |
| D12 | **Input handling:** deprecated `keypress`, no IME guard, no length limit, and `localStorage` access not guarded (throws in some private modes) | Code |

## 3. Corrections

- **D1 (safe rendering):** visitor text is always HTML-escaped. Predefined answers are escaped first, then only `**bold**` and line breaks are turned into markup. Action URLs and labels are escaped too.
- **D2 (detection):** runs on every message until the visitor clicks EN/ES/FR. A manual choice is stored (`efc-lang-manual`) and always wins. Detection uses Unicode-aware word matching. A tie keeps the current language.
- **D3 (language switch):** the conversation is stored as a history of `{user text}` and `{bot answer kind}`. Switching language re-renders every assistant message in the new language; visitor messages are never altered.
- **D4 (WhatsApp message):** fully localized and built only from what the visitor actually typed:
  - their last question;
  - the charter length, if they wrote 6 h / 8 h / full day / 3/4…;
  - the date, if written;
  - the number of guests, if written.

  Nothing is invented, and nothing technical or internal is included. Links on screen update with the latest details. The link opens only when clicked, in a new tab, and nothing is sent automatically.
- **D5:** "3/4 day (6 hours) or full day (8 hours)" in EN, ES and FR.
- **D6:** bold is rendered properly.
- **D7:** every fact rewritten from the site:
  - **Prices:** from 350 USD per boat (1-2 guests, selected boats) / from 600 USD; the final price depends on the boat, group size and duration.
  - **Included:** captain and crew, rods, reels, basic tackle, bottled water and soft drinks.
  - **Varies by charter:** licence, live bait, food, fish cleaning; tip 10-20% is customary.
  - **Fleet:** 10 boats for 1-10 guests.
  - **Departures:** Puerto Los Cabos Marina, usually 6:30 AM, not Cabo San Lucas Marina.
  - **Reviews:** a link to Google reviews instead of claims.
  - **Fish answer:** adds "no catch is guaranteed".
- **D8:** rules reordered from most to least specific, with Unicode word boundaries.
- **D9:** new answers:
  - **Payment:** Stripe (card, Apple Pay, Google Pay), 6% fee; Wise, no fee; PayPal temporarily unavailable. This is the owner's decision and matches the boat pages.
  - **Cancellation:** a summary of the Terms ("deposits are not refunded for guest cancellation, no-show, bad weather or poor fishing") plus a link to /terms-conditions.
- **D10:** all labels localized ("Calendario de pesca", "Calendrier de pêche", "Bonjour !", "tripulación", "équipage"); separator spacing per language.
- **D11:**
  - Escape closes the chat;
  - `aria-label`s are localized for close, send, input and the language buttons;
  - `role="dialog"` and `aria-live="polite"`;
  - `aria-expanded` on the bubble;
  - focus goes to the input on open and back to the bubble on close;
  - no focus steal on the automatic opening.
- **D12:**
  - `keydown` with an `isComposing` guard;
  - messages over 500 characters are cut, with a notice in the current language;
  - `localStorage` is wrapped in try/catch.

**Unchanged:**
- the WhatsApp number;
- the colours, layout and animations;
- the 50-second automatic opening;
- the link targets (/contact, /fishing-charters, /fishing-calendar);
- no external service or API added.

## 4. Translation check (EN / ES / FR)

**Browser tests:** for each of the 13 topics in each language, the answer is in the selected language and contains no word from the other two languages' interface strings (the `MIX` check in `tests/chat.mjs`). Result: 39/39.

**Vocabulary used:**
- **Spanish:** "3/4 de día (6 horas)", "Día completo (8 horas)", "pez gallo (roosterfish)", "carnada viva".
- **French:** "3/4 de journée (6 h)", "Journée complète (8 h)", "appâts vivants", "mérou".

## 5. Language switching

All 6 directions passed (EN→ES, EN→FR, ES→EN, ES→FR, FR→EN, FR→ES). In each case:
- the welcome and a price answer are re-rendered in the target language;
- no text from the source language is left;
- the visitor's message is unchanged;
- the WhatsApp intro switches language.

**Automatic detection** (no manual choice): Spanish, French and English free text were each detected correctly ✅. A manual FR choice overrides an English sentence ✅ and survives a reload ✅.

## 6. WhatsApp destination

- **Configured:** `+526241223506`, giving `https://wa.me/526241223506?text=…`.
- **Matches the site:** the footer, the contact JSON-LD (`+52-624-122-3506`) and `SITE.whatsapp`. It was **not changed**.
- **Encoding check:** `encodeURIComponent`; decoding the `text` parameter returns the exact message.
- **Not done:** no real WhatsApp message was sent. Only the generated URL was checked, in a real browser.

## 7. WhatsApp message examples (as generated in the browser test)

**EN:**
```
Hello Exotic Fish Cabo! I have a question from your website.
My question: We are 4 people, full day on Dec 15, how much?
Charter: Full day (8 hours)
Date: Dec 15
Guests: 4
```

**ES:**
```
¡Hola Exotic Fish Cabo! Tengo una pregunta desde su sitio web.
Mi pregunta: Somos 4 personas, día completo el 15 de diciembre, ¿cuánto cuesta?
Charter: Día completo (8 horas)
Fecha: 15 de diciembre
Personas: 4
```

**FR:**
```
Bonjour Exotic Fish Cabo ! J'ai une question depuis votre site web.
Ma question : Nous sommes 4 personnes, journée complète le 15 décembre, quel prix ?
Charter : Journée complète (8 h)
Date : 15 décembre
Personnes : 4
```

When the visitor has typed nothing, the message is the intro plus "I would like information about your fishing charters." (localized).

## 8. Browser and mobile tests: `tests/chat.mjs` (Playwright, Chromium), **82/82 passed**

The suite covers:
- initial conversations in EN, ES and FR from the browser language, with no raw `**`;
- the 6 language switches;
- 13 topics × 3 languages;
- free-text detection in 3 languages;
- the manual override and its persistence;
- empty input ignored;
- unknown question → suggestions and WhatsApp, then team handoff;
- accents, emoji and « » kept intact;
- **HTML/script input shown as text and never executed**;
- input of 1,200 characters cut to 500 with a notice;
- WhatsApp in 3 languages: destination, encoding, context, no auto-send;
- **iPhone 13 and Pixel 7**: tap to open, the window fits the screen, tap to send, and the booking buttons stay usable after closing;
- keyboard: Enter opens, focus goes to the input, Enter sends, Escape closes and returns focus;
- closing and reopening keeps the conversation without a duplicate welcome;
- accessibility attributes;
- browser Back;
- **0 JavaScript runtime errors**.

The results are in `docs/chat-results.json`.

## 9. Security

- No visitor input ever reaches `innerHTML` unescaped (D1, tested).
- WhatsApp text: `encodeURIComponent`; question capped at 300 characters in the link.
- External links use `rel="noopener"`.
- **CSP not weakened:** the script stays `'self'`; there are no inline handlers and no new hosts.
- Nothing is stored except the language choice. No personal data is sent anywhere unless the visitor clicks WhatsApp.

## 10. SEO/GEO and site regression

| Check | Result |
|---|---|
| Content and SEO verifier | **581/581** (no title, description, heading, canonical, JSON-LD or sitemap change) |
| Functional QA | **145/145** (includes the existing chatbot EN/ES/FR + WhatsApp checks) |
| Layout | **243/243** (81 URLs × 3 widths) |
| Lighthouse (local staging build) | `/`: mobile 99 / desktop 100<br>`/contact`: mobile 99 / desktop 100<br>Accessibility 100. CLS 0, TBT 0 ms, LCP 1.9 s / 0.5 s. Same as the 2026-11-03 baseline |
| Script weight | `efc-chat.js` 24.7 kB → 34.4 kB raw (8.1 → 12.3 kB gzip), still loaded with `defer`. TBT is unchanged at 0 ms |

## 11. Remaining limitations

- **The assistant is rule-based** (keywords), not AI. Unusual wording gets the suggestions, then the WhatsApp handoff; that is by design.
- **Date extraction** recognises common formats (e.g. "Dec 15", "15 de diciembre", "15/12"). Anything else stays inside the quoted question.
- **WhatsApp delivery was not tested end to end:** the URL was checked, but no message was sent.
- **Safari/WebKit was not run.** Only Chromium was tested, with iPhone and Android viewports.
- **The 50-second automatic opening is kept** as on the original. It is an owner choice; it can be disabled on mobile if preferred.

## 12. Deployment and rollback

- **Preview:** Cloudflare Workers Builds builds non-production branches as **preview versions**. The URL is on `*-fish-cabo.small-boat-4235.workers.dev`, protected by the staging password and noindex. If preview builds are disabled in the Cloudflare settings, the evidence is the test suite above.
- **To deploy (owner approval required):** merge `chatbot-audit` into `main`, for example through the pull request https://github.com/ltronelmx-alt/fish-cabo-site/pull/new/chatbot-audit. Cloudflare redeploys automatically.
- **Immediate rollback after a merge:** revert the merge commit, or restore the original script and component:

  ```
  git checkout d0f7aa9 -- public/js/efc-chat.js src/components/Chat.astro
  git commit -m "Restore original chatbot"
  git push
  ```

  The site is back on the original chatbot in about 3 minutes. No other file depends on the new script.

## 13. Recommendation

**GO (owner-approved merge).**

All confirmed defects are fixed, including a real XSS hole and a language detection that never ran. The suite passes 82/82 and the site regression suites pass (581/581, 145/145, 243/243), with no performance change.

Before merging, two owner checks:
- try the chat once on the preview;
- confirm the wording of the **payment line** ("PayPal temporarily unavailable") and the **cancellation summary**. Both are taken from the site and the Terms.
