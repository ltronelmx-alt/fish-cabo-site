// Real-browser tests for the chat assistant (Playwright). Usage: node tests/chat.mjs [baseUrl]
import { createRequire } from 'module';
import { writeFileSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const results = [];
const rec = (area, test, ok, detail = '') => { results.push({ area, test, ok: !!ok, detail: String(detail).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${area} — ${test}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`); };
const b = await chromium.launch();
const errors = [];

async function page(locale = 'en-US', opts = {}) {
  const ctx = await b.newContext({ locale, ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(BASE + '/fishing-charters', { waitUntil: 'load' });
  return p;
}
const open = async (p) => { await p.click('#efc-chat-bubble'); await p.waitForSelector('#efc-messages .efc-bot'); };
const ask = async (p, q) => {
  const n = await p.locator('#efc-messages .efc-bot').count();
  await p.fill('#efc-input', q); await p.press('#efc-input', 'Enter');
  await p.waitForFunction((k) => document.querySelectorAll('#efc-messages .efc-bot').length > k, n, { timeout: 4000 });
  return (await p.locator('#efc-messages .efc-bot').last().innerText());
};
const lastBot = (p) => p.locator('#efc-messages .efc-bot').last().innerText();
const waText = async (p) => { const h = await p.locator('#efc-messages a.efc-wa').last().getAttribute('href'); const u = new URL(h); return { href: h, host: u.host, path: u.pathname, text: u.searchParams.get('text') }; };
const MIX = { en: /Bienvenue|Bonjour|Hola|Réserver|Reservar|forfaits|paquetes/, fr: /Welcome|Book Now|Hola!|Reservar|paquetes|Our Packages/, es: /Welcome|Book Now|Bienvenue|Réserver|forfaits|Our Packages/ };

// 1-3 initial conversations (browser language)
for (const [loc, l, hello] of [['en-US', 'en', /Welcome to/], ['es-MX', 'es', /Bienvenido/], ['fr-FR', 'fr', /Bienvenue/]]) {
  const p = await page(loc); await open(p);
  const txt = await lastBot(p);
  rec('Initial', `${l.toUpperCase()} welcome from browser language ${loc}`, hello.test(txt) && !MIX[l].test(txt.replace(/Exotic Fish Cabo/g, '')), txt.split('\n')[0]);
  rec('Initial', `${l.toUpperCase()} interface labels`, (await p.getAttribute('#efc-input', 'placeholder')) && (await p.locator('#btn-' + l).getAttribute('aria-pressed')) === 'true', await p.getAttribute('#efc-input', 'placeholder'));
  rec('Initial', `${l.toUpperCase()} no raw ** markdown`, !/\*\*/.test(txt), '');
  await p.context().close();
}

// 4 six language switches (bot messages re-rendered, user text untouched)
const langs = ['en', 'es', 'fr'];
const welcomeRe = { en: /Welcome to/, es: /Bienvenido/, fr: /Bienvenue/ };
const priceRe = { en: /Private Packages/, es: /paquetes privados/, fr: /forfaits privés/ };
for (const a of langs) for (const z of langs) {
  if (a === z) continue;
  const p = await page('en-US'); await open(p); await p.click('#btn-' + a);
  await ask(p, 'price ¿? 123');
  await p.click('#btn-' + z);
  const all = await p.locator('#efc-messages').innerText();
  const userTxt = await p.locator('#efc-messages .efc-user').first().innerText();
  const wa = await waText(p);
  rec('Switch', `${a.toUpperCase()} → ${z.toUpperCase()}`, welcomeRe[z].test(all) && priceRe[z].test(all) && !welcomeRe[a].test(all) && userTxt.startsWith('price ¿? 123') && (await p.evaluate(() => window.__efcChat.lang)) === z && wa.text.split('\n')[0] === ({ en: 'Hello Exotic Fish Cabo! I have a question from your website.', es: '¡Hola Exotic Fish Cabo! Tengo una pregunta desde su sitio web.', fr: "Bonjour Exotic Fish Cabo ! J'ai une question depuis votre site web." })[z], wa.text.split('\n')[0]);
  await p.context().close();
}

// 5 every menu topic in every language
const Q = {
  price: { en: 'How much is a charter?', es: '¿Cuánto cuesta?', fr: 'Quel est le prix ?', re: { en: /350 USD/, es: /350 USD/, fr: /350 USD/ } },
  included: { en: "What's included?", es: '¿Qué incluye?', fr: 'Qu’est-ce qui est inclus ?', re: { en: /Bottled water/, es: /Agua embotellada/, fr: /Eau en bouteille/ } },
  payment: { en: 'How do I pay the deposit?', es: '¿Cómo pago el depósito?', fr: "Comment payer l'acompte ?", re: { en: /Wise/, es: /Wise/, fr: /Wise/ } },
  cancel: { en: 'Cancellation policy?', es: '¿Política de cancelación?', fr: "Et en cas d'annulation ?", re: { en: /not refunded/, es: /no se reembolsa/, fr: /pas remboursé/ } },
  booking: { en: 'How do I book?', es: '¿Cómo reservar?', fr: 'Comment réserver ?', re: { en: /3\/4 day/, es: /3\/4 de día/, fr: /3\/4 de journée/ } },
  family: { en: 'Is it good for kids?', es: '¿Es bueno para niños?', fr: 'Bien pour les enfants ?', re: { en: /families|Families/, es: /Familias|familias/, fr: /Familles|familles/ } },
  location: { en: 'Where do you depart from?', es: '¿Dónde es la salida?', fr: "D'où partez-vous ? Où ?", re: { en: /Puerto Los Cabos/, es: /Puerto Los Cabos/, fr: /Puerto Los Cabos/ } },
  boats: { en: 'Tell me about your boats', es: 'Háblame de sus botes', fr: 'Parlez-moi de vos bateaux', re: { en: /Fleet/, es: /flota/, fr: /flotte/ } },
  season: { en: 'Best time of the year?', es: '¿Mejor época?', fr: 'Quelle saison ?', re: { en: /year round/, es: /todo el año/, fr: /toute l'année/ } },
  fish: { en: 'What fish can we catch?', es: '¿Qué peces hay?', fr: 'Quels poissons ?', re: { en: /Main Targets/, es: /objetivos/, fr: /cibles/ } },
  contact: { en: 'Contact phone number', es: 'Número de teléfono', fr: 'Numéro de téléphone', re: { en: /\+52 624 122 3506/, es: /\+52 624 122 3506/, fr: /\+52 624 122 3506/ } },
  reviews: { en: 'Reviews?', es: '¿Reseñas?', fr: 'Des avis ?', re: { en: /Google/, es: /Google/, fr: /Google/ } },
  thanks: { en: 'Thanks!', es: '¡Gracias!', fr: 'Merci !', re: { en: /welcome/, es: /De nada/, fr: /De rien/ } },
};
for (const l of langs) {
  const p = await page('en-US'); await open(p); await p.click('#btn-' + l);
  for (const [k, v] of Object.entries(Q)) {
    const txt = await ask(p, v[l]);
    rec('Topics', `${l.toUpperCase()} ${k}`, v.re[l].test(txt) && !MIX[l].test(txt), txt.replace(/\s+/g, ' ').slice(0, 90));
  }
  await p.context().close();
}


// 6b PayPal policy (permanent regression guard): PayPal is mentioned, never "unavailable", no PayPal link, WhatsApp handoff
{
  const src = (await import('node:fs')).readFileSync('public/js/efc-chat.js', 'utf8');
  rec('PayPal', 'source never says PayPal is unavailable (EN/FR/ES)', !/PayPal is temporarily unavailable|PayPal est momentan[ée]ment indisponible|PayPal no est[áa] disponible/i.test(src) && !/paypal[^"\n]{0,60}(unavailable|indisponible|no est[áa] disponible)/i.test(src));
  rec('PayPal', 'source contains no PayPal URL', !/paypal\.(com|me)/i.test(src));
  const QP = {
    en: ['Can I pay with PayPal?', 'How do I pay the deposit?', 'Do you accept Stripe?', 'Can I pay with Wise?'],
    fr: ['Je peux payer avec PayPal ?', "Comment payer l'acompte ?", 'Vous acceptez Stripe ?', 'Je peux payer avec Wise ?'],
    es: ['¿Puedo pagar con PayPal?', '¿Cómo pago el depósito?', '¿Aceptan Stripe?', '¿Puedo pagar con Wise?'],
  };
  const NEED = { en: /• PayPal — 6% fee/, fr: /• PayPal — 6 % de frais/, es: /• PayPal — 6% de comisión/ };
  for (const l of langs) {
    const p = await page('en-US'); await open(p); await p.click('#btn-' + l);
    const YES = { en: 'Yes.', fr: 'Oui.', es: 'Sí.' };
    const pq = QP[l][0];
    const ptxt = await ask(p, pq);
    const pbody = ptxt.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim(); // strip the message time
    const plinks = await p.locator('#efc-messages .efc-bot').last().locator('a').count();
    rec('PayPal', `${l.toUpperCase()} "${pq}" → exactly "${YES[l]}" (owner rule), no link`, pbody === YES[l] && plinks === 0, JSON.stringify(pbody));
    for (const q of QP[l].slice(1)) {
      const txt = await ask(p, q);
      const links = await p.locator('#efc-messages .efc-bot').last().locator('a').evaluateAll((a) => a.map((x) => x.href));
      const wa = await waText(p);
      const ok = /PayPal/.test(txt) && NEED[l].test(txt) && /Stripe/.test(txt) && /6 ?%/.test(txt) && /Wise/.test(txt)
        && !/unavailable|indisponible|no est[áa] disponible/i.test(txt) && !links.some((h) => /paypal\./i.test(h))
        && wa.host === 'wa.me' && wa.path === '/526241223506' && !MIX[l].test(txt);
      rec('PayPal', `${l.toUpperCase()} "${q}" → payment answer lists Stripe 6 %, Wise, PayPal 6 % + WhatsApp button wa.me/526241223506`, ok, txt.replace(/\s+/g, ' ').slice(0, 160));
    }
    await p.context().close();
  }
}

// 6 free text with automatic detection (no manual choice)
for (const [q, l] of [['Hola, ¿cuánto cuesta un viaje de pesca para 4 personas?', 'es'], ['Bonjour, combien coûte une journée de pêche ?', 'fr'], ['Hi, how much does a fishing trip cost?', 'en']]) {
  const p = await page('en-US'); await open(p);
  const txt = await ask(p, q);
  rec('Detection', `free text detected as ${l.toUpperCase()}`, (await p.evaluate(() => window.__efcChat.lang)) === l && /350 USD/.test(txt), txt.split('\n')[0]);
  await p.context().close();
}
// manual choice overrides detection
{ const p = await page('en-US'); await open(p); await p.click('#btn-fr'); await ask(p, 'Hello, how much does it cost?');
  rec('Detection', 'manual FR choice overrides English text', (await p.evaluate(() => window.__efcChat.lang)) === 'fr' && /forfaits/.test(await lastBot(p)));
  await p.reload(); rec('Detection', 'manual choice remembered after reload', (await p.evaluate(() => window.__efcChat.lang)) === 'fr'); await p.context().close(); }

// 7-11 unknown / empty / accents / HTML / long
{ const p = await page('en-US'); await open(p);
  const n0 = await p.locator('#efc-messages .efc-msg').count();
  await p.fill('#efc-input', '   '); await p.press('#efc-input', 'Enter'); await p.waitForTimeout(1500);
  rec('Input', 'empty input ignored', (await p.locator('#efc-messages .efc-msg').count()) === n0);
  const u1 = await ask(p, 'xyzzy qwerty'); rec('Input', 'unknown question → suggestions + WhatsApp', /not sure/.test(u1) && (await p.locator('#efc-messages .efc-bot').last().locator('a.efc-wa').count()) === 1);
  const u2 = await ask(p, 'zzz plugh'); rec('Input', 'second unknown → team handoff', /connect you/.test(u2));
  await ask(p, 'Pêche à côté de l’hôtel — ñandú 🎣 ¿qué tal? « ok »');
  rec('Input', 'accents, emoji, punctuation shown intact', (await p.locator('#efc-messages .efc-user').last().innerText()).includes('ñandú 🎣 ¿qué tal? « ok »'));
  await ask(p, '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>bold</b>');
  const xss = await p.evaluate(() => window.__xss); const injected = await p.locator('#efc-messages .efc-user img, #efc-messages .efc-user script, #efc-messages .efc-user b').count();
  rec('Security', 'HTML/script input rendered as text, never executed', xss === undefined && injected === 0 && (await p.locator('#efc-messages .efc-user').last().innerText()).includes('<script>'));
  await ask(p, 'A'.repeat(1200));
  const longShown = (await p.locator('#efc-messages .efc-user').last().innerText()).length;
  rec('Input', 'very long input truncated to 500 characters + notice', longShown <= 520 && /500/.test(await p.locator('#efc-messages').innerText()), longShown);
  await p.context().close(); }

// 12-13 WhatsApp generation + destination + encoding
for (const l of langs) {
  const p = await page('en-US'); await open(p); await p.click('#btn-' + l);
  const q = { en: 'We are 4 people, full day on Dec 15, how much?', es: 'Somos 4 personas, día completo el 15 de diciembre, ¿cuánto cuesta?', fr: 'Nous sommes 4 personnes, journée complète le 15 décembre, quel prix ?' }[l];
  await ask(p, q);
  const wa = await waText(p);
  const ok = wa.host === 'wa.me' && wa.path === '/526241223506' && wa.text.includes(q) && /4/.test(wa.text) && /(15 déc|15 de dic|Dec 15)/i.test(wa.text) && wa.text.includes({ en: 'Full day (8 hours)', es: 'Día completo (8 horas)', fr: 'Journée complète (8 h)' }[l]) && !/General inquiry|Contact request|bot/.test(wa.text) && decodeURIComponent(wa.href.split('text=')[1]) === wa.text;
  rec('WhatsApp', `${l.toUpperCase()} message (destination, encoding, context, language)`, ok, wa.text.replace(/\n/g, ' | '));
  const target = await p.locator('#efc-messages a.efc-wa').last().getAttribute('target');
  rec('WhatsApp', `${l.toUpperCase()} opens only on click, in a new tab (no auto-send)`, target === '_blank' && (await p.context().pages()).length === 1);
  await p.context().close();
}

// 14 mobile interaction (iPhone & Android sizes)
for (const dev of ['iPhone 13', 'Pixel 7']) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'en-US' }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/fishing-boats/23ft-panga');
  await p.tap('#efc-chat-bubble'); await p.waitForSelector('#efc-messages .efc-bot');
  const box = await p.locator('#efc-chat-window').boundingBox(); const vw = p.viewportSize().width;
  await p.fill('#efc-input', 'price'); await p.tap('#efc-send'); await p.waitForFunction(() => document.querySelectorAll('#efc-messages .efc-bot').length > 1);
  rec('Mobile', `${dev}: opens, fits screen, send by tap`, box && box.x >= 0 && box.x + box.width <= vw + 1 && /350 USD/.test(await lastBot(p)), JSON.stringify(box));
  await p.tap('#efc-close'); await p.waitForTimeout(200);
  const bookVisible = await p.locator('a.btn-stripe').first().isVisible();
  rec('Mobile', `${dev}: closed chat leaves booking buttons usable`, !(await p.locator('#efc-chat-window').isVisible()) && bookVisible);
  await ctx.close();
}

// 15-16 keyboard, close/reopen, focus
{ const p = await page('en-US');
  await p.focus('#efc-chat-bubble'); await p.keyboard.press('Enter'); await p.waitForSelector('#efc-messages .efc-bot');
  rec('Keyboard', 'Enter on bubble opens, focus in input', (await p.evaluate(() => document.activeElement.id)) === 'efc-input');
  await p.keyboard.type('book'); await p.keyboard.press('Enter'); await p.waitForFunction(() => document.querySelectorAll('#efc-messages .efc-bot').length > 1);
  rec('Keyboard', 'Enter sends', /To book your charter/.test(await lastBot(p)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  rec('Keyboard', 'Escape closes and returns focus to bubble', !(await p.locator('#efc-chat-window').isVisible()) && (await p.evaluate(() => document.activeElement.id)) === 'efc-chat-bubble');
  await p.click('#efc-chat-bubble');
  rec('Open/close', 'reopen keeps the conversation (no duplicate welcome)', (await p.locator('#efc-messages .efc-bot').count()) === 2);
  const a11y = await p.evaluate(() => ({ close: document.getElementById('efc-close').getAttribute('aria-label'), send: document.getElementById('efc-send').getAttribute('aria-label'), input: document.getElementById('efc-input').getAttribute('aria-label'), dialog: document.getElementById('efc-chat-window').getAttribute('role'), live: document.getElementById('efc-messages').getAttribute('aria-live') }));
  rec('Accessibility', 'labels, dialog role, live region', a11y.close && a11y.send && a11y.input && a11y.dialog === 'dialog' && a11y.live === 'polite', JSON.stringify(a11y));
  await p.goto(BASE + '/fishing-boats'); await p.goBack();
  rec('Navigation', 'browser back works with chat', p.url().endsWith('/fishing-charters'));
  await p.context().close(); }

// 17 runtime errors
rec('Runtime', 'no JavaScript errors during all tests', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
writeFileSync('docs/chat-results.json', JSON.stringify(results, null, 1));
const f = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - f}/${results.length} passed`);
process.exitCode = f ? 1 : 0;
