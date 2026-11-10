/* Exotic Fish Cabo chat assistant — original fish-cabo.com assistant (same look, same flows), audited 2026-11-04.
   Changes vs the original are listed in CHATBOT-WHATSAPP-FINAL-AUDIT.md. Original kept in git history (see rollback). */
(function () {
'use strict';

// ============================================
// CONFIGURATION (owner-confirmed business number — do not change without approval)
// ============================================
const WHATSAPP_NUMBER = "+526241223506";
const REVIEWS_URL = "https://g.page/r/CVkU9WoXqp_DEBM";
const MAX_INPUT = 500;

// ============================================
// MULTILINGUAL KNOWLEDGE BASE (facts aligned with the website: /fishing-charters, /fishing-boats, /cabo-fishing-faq, /contact, /terms-conditions)
// ============================================
const I18N = {
  fr: {
    welcome: `👋 Bonjour ! Bienvenue chez **Exotic Fish Cabo** !\n\nJe suis votre assistant pour planifier votre journée de pêche à San José del Cabo. 🎣\n\nQue puis-je faire pour vous ?`,
    placeholder: "Posez votre question...",
    inputLabel: "Votre message",
    sendLabel: "Envoyer",
    closeLabel: "Fermer le chat",
    windowLabel: "Assistant de pêche Exotic Fish Cabo",
    online: "🎣 Assistant de pêche • En ligne",
    bookLabel: "Réserver maintenant",
    packagesLabel: "Nos forfaits",
    seasonsLabel: "Poissons & Saisons",
    calendarLabel: "Calendrier de pêche",
    boatsLabel: "Voir les bateaux",
    termsLabel: "Conditions générales",
    reviewsLabel: "Avis Google",
    whatsappLabel: "WhatsApp direct",
    youSaid: "Vous",
    unknown1: `🤔 Je ne suis pas sûr de comprendre. Essayez :\n\n• "Quels sont les prix ?"\n• "Quels poissons en ce moment ?"\n• "C'est bon pour les débutants ?"\n• "Comment réserver ?"`,
    unknown2: `🤔 Je n'ai pas la réponse précise dans ma base de connaissances.\n\nLaissez-moi vous mettre en contact avec notre équipe :`,
    tooLong: "✂️ Message un peu long : je n'ai gardé que les 500 premiers caractères.",
    thanks: `🙏 De rien !\n\nN'oubliez pas : la pêche à Los Cabos se pratique **toute l'année**. Réservez tôt en haute saison ! 🎣`,
    priceTitle: "💰 Nos forfaits privés",
    halfDay: "🕕 3/4 de journée (6 h) — À partir de 350 USD par bateau (1-2 personnes, bateaux sélectionnés)",
    halfDayDesc: "Pêche côtière, intermédiaire ou au large selon les conditions — idéal pour familles et débutants",
    fullDay: "🕗 Journée complète (8 h) — À partir de 600 USD par bateau",
    fullDayDesc: "Plus de temps au large pour les espèces pélagiques",
    priceNote: "Le prix final dépend du bateau, du nombre de personnes et de la durée.",
    privateNote: "Tous nos charters sont 100 % privés",
    included: "Capitaine et équipage, cannes, moulinets et matériel de base inclus",
    fishTitle: "🐟 Nos cibles principales",
    marlin: "Marlin — Action forte en haute saison",
    tuna: "Thon & Dorado — Excellents quand les conditions sont réunies",
    wahoo: "Wahoo — Frappes puissantes en saison",
    rooster: "Roosterfish — Pêche côtière à vue, très excitante",
    grouper: "Mérou & autres espèces de fond",
    calendarHint: "Consultez notre calendrier de pêche sur le site ! Aucune prise n'est garantie.",
    seasonTitle: "📆 Pêche toute l'année !",
    seasonText: "Chaque saison a ses stars. Les courants et les bancs (Gordo Banks, Iman Bank) créent de belles opportunités selon les conditions.",
    boatTitle: "🚤 Notre flotte",
    boatDesc: "10 bateaux privés, de 1 à 10 personnes selon le bateau : pangas, center consoles, catamarans et sportfishers.",
    boatFeat1: "Le prix varie selon le bateau et le nombre de personnes",
    boatFeat2: "Ombre, sièges et toilettes selon le bateau",
    boatFeat3: "Équipement de sécurité à bord",
    boatFeat4: "Nous vous aidons à choisir le bateau adapté",
    familyTitle: "👨‍👩‍👧‍👦 Familles et débutants bienvenus !",
    familyDesc: "Aucune expérience nécessaire : l'équipage explique le matériel et les techniques. Le 3/4 de journée (6 h) est souvent le meilleur choix avec des enfants. Indiquez-nous leur âge pour vérifier le bateau et l'équipement de sécurité.",
    locationTitle: "📍 Puerto Los Cabos Marina",
    locationDesc: "Tous nos départs se font de la marina Puerto Los Cabos, à San José del Cabo — pas de la marina de Cabo San Lucas. Départ habituel vers 6h30. Les clients logés à Cabo San Lucas sont les bienvenus.",
    includedTitle: "✅ Inclus dans tous les charters",
    includedList: "• Capitaine et équipage locaux\n• Cannes, moulinets et matériel de base\n• Eau en bouteille et sodas\n• Bateau privé pour votre groupe",
    notIncludedTitle: "❓ Selon le charter (à confirmer avant de réserver)",
    notIncludedList: "• Licence de pêche\n• Appâts vivants\n• Nourriture\n• Autres boissons (alcool, etc.)\n• Nettoyage du poisson\n• Pourboire de l'équipage : 10-20 % est d'usage",
    bookingTitle: "📅 Pour réserver",
    bookingSteps: "1️⃣ Choisissez votre bateau (#1 à #10)\n2️⃣ 3/4 de journée (6 h) ou journée complète (8 h) — bateau #1 : 6 h uniquement\n3️⃣ Choisissez votre date\n4️⃣ Touchez SHOW MY PRICE pour voir votre prix, puis payez l'acompte en ligne (carte via Stripe +6 % ou Wise sans frais), ou écrivez-nous",
    paypalYes: "Oui.",
    paymentTitle: "💳 Paiement de l'acompte",
    paymentDesc: "Réservation en ligne (Réserver maintenant) : acompte par carte via Stripe (+6 % de frais), PayPal (+6 % de frais) ou Wise (sans frais).",
    cancelTitle: "📄 Annulation",
    cancelDesc: "Selon nos conditions générales, l'acompte n'est pas remboursé (annulation de votre part, absence, mauvaise pêche).\n🌦️ Mauvais temps ou port fermé : votre sortie est reportée ; si le report est impossible, vous recevez un bon pour votre prochaine visite.",
    reviewsTitle: "⭐ Avis clients",
    reviewsDesc: "Lisez les avis de nos clients sur Google et Tripadvisor.",
    contactTitle: "📞 Nous contacter",
    contactDesc: "💬 WhatsApp : +52 624 122 3506 (le plus rapide)\n📧 contact@fish-cabo.com\n📝 Formulaire sur la page Contact",
    hello: `👋 Bonjour ! Je suis l'assistant d'**Exotic Fish Cabo**. Comment puis-je vous aider ?\n\n• 💰 Prix et forfaits\n• 🐟 Poissons et saisons\n• 🚤 Bateaux\n• 👨‍👩‍👧‍👦 Familles et débutants\n• 📅 Réservations`,
    wa: { intro: "Bonjour Exotic Fish Cabo ! J'ai une question depuis votre site web.", question: "Ma question", charter: "Charter", date: "Date", guests: "Personnes", general: "Je voudrais des informations sur vos charters de pêche.", h6: "3/4 de journée (6 h)", h8: "Journée complète (8 h)" },
    sep: " :"
  },

  en: {
    welcome: `👋 Hi! Welcome to **Exotic Fish Cabo**!\n\nI'm your assistant to help plan your fishing day in San José del Cabo. 🎣\n\nWhat can I do for you?`,
    placeholder: "Ask your question...",
    inputLabel: "Your message",
    sendLabel: "Send",
    closeLabel: "Close chat",
    windowLabel: "Exotic Fish Cabo fishing assistant",
    online: "🎣 Fishing Assistant • Online",
    bookLabel: "Book Now",
    packagesLabel: "Our Packages",
    seasonsLabel: "Fish & Seasons",
    calendarLabel: "Fishing Calendar",
    boatsLabel: "See the boats",
    termsLabel: "Terms & Conditions",
    reviewsLabel: "Google reviews",
    whatsappLabel: "WhatsApp",
    youSaid: "You",
    unknown1: `🤔 I'm not sure I understand. Try asking:\n\n• "What are the prices?"\n• "What fish are biting now?"\n• "Is it good for beginners?"\n• "How do I book?"`,
    unknown2: `🤔 I don't have the exact answer in my knowledge base.\n\nLet me connect you directly with our team:`,
    tooLong: "✂️ That message was long: I kept the first 500 characters.",
    thanks: `🙏 You're welcome!\n\nRemember: fishing in Los Cabos is **year-round**. Book early for peak season! 🎣`,
    priceTitle: "💰 Our Private Packages",
    halfDay: "🕕 3/4 Day (6 hours) — From 350 USD per boat (1-2 guests, selected boats)",
    halfDayDesc: "Inshore, midshore or offshore depending on conditions — great for families and beginners",
    fullDay: "🕗 Full Day (8 hours) — From 600 USD per boat",
    fullDayDesc: "More time offshore for pelagic species",
    priceNote: "Final price depends on the boat, group size and trip duration.",
    privateNote: "All our charters are 100% private",
    included: "Captain & crew, rods, reels and basic tackle included",
    fishTitle: "🐟 Our Main Targets",
    marlin: "Marlin — Strong action in peak season",
    tuna: "Tuna & Dorado — Excellent when conditions align",
    wahoo: "Wahoo — Powerful strikes in season",
    rooster: "Roosterfish — Exciting inshore sight-fishing",
    grouper: "Grouper & other bottom species",
    calendarHint: "Check our Fishing Calendar on the website! No catch is ever guaranteed.",
    seasonTitle: "📆 Fishing all year round!",
    seasonText: "Every season has its stars. Currents and banks (Gordo Banks, Iman Bank) create great opportunities when conditions allow.",
    boatTitle: "🚤 Our Fleet",
    boatDesc: "10 private boats for 1 to 10 guests depending on the boat: pangas, center consoles, catamarans and sportfishers.",
    boatFeat1: "Price varies by boat and group size",
    boatFeat2: "Shade, seating and restroom depending on the boat",
    boatFeat3: "Safety equipment on board",
    boatFeat4: "We help you choose the right boat",
    familyTitle: "👨‍👩‍👧‍👦 Families & beginners welcome!",
    familyDesc: "No experience needed: the crew explains the gear and techniques. The 3/4 day (6 hours) is often the best choice with children. Tell us their ages so we can confirm the boat and safety equipment.",
    locationTitle: "📍 Puerto Los Cabos Marina",
    locationDesc: "All our trips depart from Puerto Los Cabos Marina in San José del Cabo — not from Cabo San Lucas Marina. Usual departure around 6:30 AM. Guests staying in Cabo San Lucas are welcome.",
    includedTitle: "✅ Included in all charters",
    includedList: "• Local captain and crew\n• Rods, reels and basic tackle\n• Bottled water and soft drinks\n• A private boat for your group",
    notIncludedTitle: "❓ Varies by charter (confirm before booking)",
    notIncludedList: "• Fishing license\n• Live bait\n• Food\n• Other drinks (alcohol, etc.)\n• Fish cleaning\n• Crew tip: 10-20% is customary",
    bookingTitle: "📅 To book your charter",
    bookingSteps: "1️⃣ Choose your boat (#1 to #10)\n2️⃣ 3/4 day (6 hours) or full day (8 hours) — boat #1: 6 hours only\n3️⃣ Pick your date\n4️⃣ Tap SHOW MY PRICE to see your price, then pay the deposit online (card via Stripe +6% or Wise, no fee), or message us",
    paypalYes: "Yes.",
    paymentTitle: "💳 Deposit payment",
    paymentDesc: "Online booking (Book Now): deposit by card via Stripe (+6% processing fee), PayPal (+6% processing fee) or Wise (no fee).",
    cancelTitle: "📄 Cancellations",
    cancelDesc: "Under our Terms & Conditions, deposits are not refunded (cancellation by the guest, no-show, poor fishing).\n🌦️ Bad weather or port closure: your trip is rescheduled; if rescheduling is not possible, you receive a voucher for your next visit.",
    reviewsTitle: "⭐ Guest reviews",
    reviewsDesc: "Read what our guests say on Google and Tripadvisor.",
    contactTitle: "📞 Contact us",
    contactDesc: "💬 WhatsApp: +52 624 122 3506 (fastest)\n📧 contact@fish-cabo.com\n📝 Form on the Contact page",
    hello: `👋 Hi! I'm **Exotic Fish Cabo**'s assistant. How can I help you?\n\n• 💰 Prices & packages\n• 🐟 Fish & seasons\n• 🚤 Boats\n• 👨‍👩‍👧‍👦 Families & beginners\n• 📅 Bookings`,
    wa: { intro: "Hello Exotic Fish Cabo! I have a question from your website.", question: "My question", charter: "Charter", date: "Date", guests: "Guests", general: "I would like information about your fishing charters.", h6: "3/4 day (6 hours)", h8: "Full day (8 hours)" },
    sep: ":"
  },

  es: {
    welcome: `👋 ¡Hola! ¡Bienvenido a **Exotic Fish Cabo**!\n\nSoy tu asistente para planificar tu día de pesca en San José del Cabo. 🎣\n\n¿En qué puedo ayudarte?`,
    placeholder: "Haz tu pregunta...",
    inputLabel: "Tu mensaje",
    sendLabel: "Enviar",
    closeLabel: "Cerrar el chat",
    windowLabel: "Asistente de pesca de Exotic Fish Cabo",
    online: "🎣 Asistente de pesca • En línea",
    bookLabel: "Reservar ahora",
    packagesLabel: "Nuestros paquetes",
    seasonsLabel: "Peces y temporadas",
    calendarLabel: "Calendario de pesca",
    boatsLabel: "Ver los botes",
    termsLabel: "Términos y condiciones",
    reviewsLabel: "Reseñas en Google",
    whatsappLabel: "WhatsApp",
    youSaid: "Tú",
    unknown1: `🤔 No estoy seguro de entender. Intenta:\n\n• "¿Cuáles son los precios?"\n• "¿Qué peces hay ahora?"\n• "¿Es bueno para principiantes?"\n• "¿Cómo reservo?"`,
    unknown2: `🤔 No tengo la respuesta exacta en mi base de conocimientos.\n\nDéjame conectarte directamente con nuestro equipo:`,
    tooLong: "✂️ Tu mensaje era largo: conservé los primeros 500 caracteres.",
    thanks: `🙏 ¡De nada!\n\nRecuerda: la pesca en Los Cabos es **todo el año**. ¡Reserva temprano en temporada alta! 🎣`,
    priceTitle: "💰 Nuestros paquetes privados",
    halfDay: "🕕 3/4 de día (6 horas) — Desde 350 USD por bote (1-2 personas, botes seleccionados)",
    halfDayDesc: "Pesca costera, media o de altura según las condiciones — ideal para familias y principiantes",
    fullDay: "🕗 Día completo (8 horas) — Desde 600 USD por bote",
    fullDayDesc: "Más tiempo mar adentro para especies pelágicas",
    priceNote: "El precio final depende del bote, el número de personas y la duración.",
    privateNote: "Todos nuestros charters son 100% privados",
    included: "Capitán y tripulación, cañas, carretes y aparejos básicos incluidos",
    fishTitle: "🐟 Nuestros objetivos principales",
    marlin: "Marlín — Mucha acción en temporada alta",
    tuna: "Atún y Dorado — Excelentes cuando las condiciones se alinean",
    wahoo: "Wahoo — Ataques potentes en temporada",
    rooster: "Pez gallo (roosterfish) — Pesca costera a la vista, muy emocionante",
    grouper: "Mero y otras especies de fondo",
    calendarHint: "¡Consulta nuestro calendario de pesca en el sitio! Ninguna captura está garantizada.",
    seasonTitle: "📆 ¡Pesca todo el año!",
    seasonText: "Cada temporada tiene sus estrellas. Las corrientes y los bancos (Gordo Banks, Iman Bank) ofrecen grandes oportunidades según las condiciones.",
    boatTitle: "🚤 Nuestra flota",
    boatDesc: "10 botes privados de 1 a 10 personas según el bote: pangas, center consoles, catamaranes y sportfishers.",
    boatFeat1: "El precio varía según el bote y el número de personas",
    boatFeat2: "Sombra, asientos y baño según el bote",
    boatFeat3: "Equipo de seguridad a bordo",
    boatFeat4: "Te ayudamos a elegir el bote adecuado",
    familyTitle: "👨‍👩‍👧‍👦 ¡Familias y principiantes bienvenidos!",
    familyDesc: "No se necesita experiencia: la tripulación explica el equipo y las técnicas. El 3/4 de día (6 horas) suele ser la mejor opción con niños. Indícanos sus edades para confirmar el bote y el equipo de seguridad.",
    locationTitle: "📍 Marina Puerto Los Cabos",
    locationDesc: "Todas nuestras salidas son desde la Marina Puerto Los Cabos, en San José del Cabo — no desde la marina de Cabo San Lucas. Salida habitual alrededor de las 6:30 AM. Si te hospedas en Cabo San Lucas, eres bienvenido.",
    includedTitle: "✅ Incluido en todos los charters",
    includedList: "• Capitán y tripulación locales\n• Cañas, carretes y aparejos básicos\n• Agua embotellada y refrescos\n• Bote privado para tu grupo",
    notIncludedTitle: "❓ Según el charter (confirmar antes de reservar)",
    notIncludedList: "• Licencia de pesca\n• Carnada viva\n• Comida\n• Otras bebidas (alcohol, etc.)\n• Limpieza del pescado\n• Propina para la tripulación: se acostumbra 10-20%",
    bookingTitle: "📅 Para reservar",
    bookingSteps: "1️⃣ Elige tu bote (#1 a #10)\n2️⃣ 3/4 de día (6 horas) o día completo (8 horas) — bote #1: solo 6 horas\n3️⃣ Elige tu fecha\n4️⃣ Toca SHOW MY PRICE para ver tu precio y paga el depósito en línea (tarjeta vía Stripe +6 % o Wise sin comisión), o escríbenos",
    paypalYes: "Sí.",
    paymentTitle: "💳 Pago del depósito",
    paymentDesc: "Reserva en línea (Reservar ahora): depósito con tarjeta vía Stripe (+6 % de comisión), PayPal (+6 % de comisión) o Wise (sin comisión).",
    cancelTitle: "📄 Cancelaciones",
    cancelDesc: "Según nuestros términos y condiciones, el depósito no se reembolsa (cancelación del cliente, no presentarse, mala pesca).\n🌦️ Mal tiempo o puerto cerrado: tu salida se reprograma; si no es posible reprogramarla, recibes un vale para tu próxima visita.",
    reviewsTitle: "⭐ Opiniones de clientes",
    reviewsDesc: "Lee lo que dicen nuestros clientes en Google y Tripadvisor.",
    contactTitle: "📞 Contáctanos",
    contactDesc: "💬 WhatsApp: +52 624 122 3506 (la respuesta más rápida)\n📧 contact@fish-cabo.com\n📝 Formulario en la página de Contacto",
    hello: `👋 ¡Hola! Soy el asistente de **Exotic Fish Cabo**. ¿Cómo puedo ayudarte?\n\n• 💰 Precios y paquetes\n• 🐟 Peces y temporadas\n• 🚤 Botes\n• 👨‍👩‍👧‍👦 Familias y principiantes\n• 📅 Reservas`,
    wa: { intro: "¡Hola Exotic Fish Cabo! Tengo una pregunta desde su sitio web.", question: "Mi pregunta", charter: "Charter", date: "Fecha", guests: "Personas", general: "Me gustaría información sobre sus charters de pesca.", h6: "3/4 de día (6 horas)", h8: "Día completo (8 horas)" },
    sep: ":"
  }
};

// PUBLIC LAUNCH SWITCH (src/data/launch.json → <html data-booking>). Before the launch, the assistant gives exactly the
// production answers of before the booking system (book → /contact, payment on the boat pages); after it, /book-now.
const BOOKING_OPEN = document.documentElement.dataset.booking === 'open';
const PRE_LAUNCH = {
  fr: { bookingSteps: "1️⃣ Choisissez votre date\n2️⃣ 3/4 de journée (6 h) ou journée complète (8 h)\n3️⃣ Nombre de pêcheurs (1-10)\n4️⃣ Choisissez votre bateau et payez l'acompte en ligne, ou écrivez-nous", paymentDesc: "Sur chaque page bateau :\n• Stripe (carte, Apple Pay, Google Pay) — 6 % de frais\n• Wise — sans frais\n• PayPal — 6 % de frais" },
  en: { bookingSteps: "1️⃣ Choose your date\n2️⃣ 3/4 day (6 hours) or full day (8 hours)\n3️⃣ Number of anglers (1-10)\n4️⃣ Pick your boat and pay the deposit online, or message us", paymentDesc: "On each boat page:\n• Stripe (card, Apple Pay, Google Pay) — 6% fee\n• Wise — no fee\n• PayPal — 6% fee" },
  es: { bookingSteps: "1️⃣ Elige tu fecha\n2️⃣ 3/4 de día (6 horas) o día completo (8 horas)\n3️⃣ Número de pescadores (1-10)\n4️⃣ Elige tu bote y paga el depósito en línea, o escríbenos", paymentDesc: "En la página de cada bote:\n• Stripe (tarjeta, Apple Pay, Google Pay) — 6% de comisión\n• Wise — sin comisión\n• PayPal — 6% de comisión" },
};
if (!BOOKING_OPEN) for (const lg of Object.keys(PRE_LAUNCH)) Object.assign(I18N[lg], PRE_LAUNCH[lg]);
// Wise-only period (owner 2026-11-09, <html data-card="off">): no card promise; the deposit is paid by Wise.
const CARD_OFF = BOOKING_OPEN && document.documentElement.dataset.card === 'off';
const WISE_ONLY = {
  fr: { bookingSteps: "1️⃣ Choisissez votre bateau (#1 à #10)\n2️⃣ 3/4 de journée (6 h) ou journée complète (8 h) — bateau #1 : 6 h uniquement\n3️⃣ Choisissez votre date\n4️⃣ Touchez SHOW MY PRICE pour voir votre prix, puis payez l'acompte en ligne par Wise (sans frais), ou écrivez-nous",
        paymentDesc: "Réservation en ligne (Réserver maintenant) : paiement par carte temporairement indisponible ; acompte par Wise (sans frais) ou PayPal (+6 % de frais)." },
  en: { bookingSteps: "1️⃣ Choose your boat (#1 to #10)\n2️⃣ 3/4 day (6 hours) or full day (8 hours) — boat #1: 6 hours only\n3️⃣ Pick your date\n4️⃣ Tap SHOW MY PRICE to see your price, then pay the deposit online by Wise (no fee), or message us",
        paymentDesc: "Online booking (Book Now): card payments temporarily unavailable; deposit by Wise (no fee) or PayPal (+6% processing fee)." },
  es: { bookingSteps: "1️⃣ Elige tu bote (#1 a #10)\n2️⃣ 3/4 de día (6 horas) o día completo (8 horas) — bote #1: solo 6 horas\n3️⃣ Elige tu fecha\n4️⃣ Toca SHOW MY PRICE para ver tu precio y paga el depósito en línea por Wise (sin comisión), o escríbenos",
        paymentDesc: "Reserva en línea (Reservar ahora): pago con tarjeta temporalmente no disponible; depósito por Wise (sin comisión) o PayPal (+6 % de comisión)." },
};
if (CARD_OFF) for (const lg of Object.keys(WISE_ONLY)) Object.assign(I18N[lg], WISE_ONLY[lg]);

// ============================================
// SAFE RENDERING
// ============================================
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Trusted predefined texts only: escape first, then **bold** and line breaks
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

// ============================================
// LANGUAGE DETECTION (from the visitor's own words)
// ============================================
function detectLanguage(text) {
  const lower = ' ' + text.toLowerCase() + ' ';
  const count = (re) => (lower.match(W(re, 'gu')) || []).length;
  const es = count(/\b(hola|qué|que|cuál|cual|precios?|cuánto|cuanto|reservar|reserva|pescar|pesca|peces|pez|barco|bote|familia|niños|dónde|donde|cuándo|cuando|temporada|incluye|incluido|gracias|adiós|adios|buenos|buenas|cómo|como|cuesta|personas|quiero|para|con|es|hay|tienen|día|mañana)\b/g);
  const fr = count(/\b(bonjour|salut|quoi|quel|quelle|prix|combien|coût|tarif|réserver|réservation|pêche|poisson|bateau|famille|enfants|où|quand|saison|inclus|merci|bonsoir|comment|coûte|personnes|je|vous|est|pour|avec|une|journée|demain)\b/g);
  const en = count(/\b(hello|hi|hey|what|which|price|prices|how|much|cost|book|booking|fish|fishing|boat|family|kids|children|where|when|season|included|thanks|thank|bye|does|people|guests|the|is|are|for|with|day|tomorrow|can|do)\b/g);
  if (es > en && es > fr) return 'es';
  if (fr > en && fr > es) return 'fr';
  if (en > es && en > fr) return 'en';
  return null; // undecided: keep the current language
}

// ============================================
// STATE
// ============================================
let currentLang = 'en';
let manualLang = false;      // a language chosen with EN/ES/FR overrides automatic detection
let chatOpen = false;
let unknownCount = 0;
const MAX_UNKNOWN = 2;
const history = [];          // [{who:'user', text}] | [{who:'bot', kind, ctx}] — bot messages are re-rendered on language change
const facts = { question: '', charter: '', date: '', guests: '' };  // only what the visitor actually wrote

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const $ = (id) => document.getElementById(id);

function setLang(lang, manual) {
  if (!I18N[lang]) return;
  currentLang = lang;
  if (manual) { manualLang = true; store.set('efc-lang', lang); store.set('efc-lang-manual', '1'); }
  const t = I18N[lang];
  document.querySelectorAll('#efc-lang-selector button').forEach((btn) => {
    const on = btn.id === `btn-${lang}`;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('efc-input').placeholder = t.placeholder;
  $('efc-input').setAttribute('aria-label', t.inputLabel);
  $('efc-send').setAttribute('aria-label', t.sendLabel);
  $('efc-close').setAttribute('aria-label', t.closeLabel);
  $('efc-chat-window').setAttribute('aria-label', t.windowLabel);
  $('efc-status').textContent = t.online;
  rerender();
}

// ============================================
// WHATSAPP HANDOFF (only opens when the visitor clicks)
// ============================================
function extractFacts(text) {
  const q = text.toLowerCase();
  if (/\b(8\s*h|8\s*hours?|8\s*heures?|8\s*horas?|full[\s-]*day|journée complète|día completo|dia completo)\b/.test(q)) facts.charter = 'h8';
  else if (/\b(6\s*h|6\s*hours?|6\s*heures?|6\s*horas?|3\/4|three[\s-]*quarter|half[\s-]*day|demi[\s-]*journée|medio día|medio dia)\b/.test(q)) facts.charter = 'h6';
  const g = q.match(/\b(\d{1,2})\s*(people|persons?|guests?|adults?|anglers?|pax|personnes?|adultes?|pêcheurs?|personas?|adultos?|pescadores?)\b/);
  if (g && +g[1] > 0 && +g[1] <= 30) facts.guests = g[1];
  const months = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
  const d = text.match(new RegExp(`\\b(\\d{1,2}(?:er)?\\s*(?:de\\s+)?(?:${months})|(?:${months})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|\\d{4}-\\d{2}-\\d{2})\\b`, 'i'));
  if (d) facts.date = d[1];
}
function waLink() {
  const t = I18N[currentLang], w = t.wa;
  const lines = [w.intro];
  if (facts.question) lines.push(`${w.question}${t.sep} ${facts.question.slice(0, 300)}`);
  else lines.push(w.general);
  if (facts.charter) lines.push(`${w.charter}${t.sep} ${w[facts.charter]}`);
  if (facts.date) lines.push(`${w.date}${t.sep} ${facts.date}`);
  if (facts.guests) lines.push(`${w.guests}${t.sep} ${facts.guests}`);
  return `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// ============================================
// RESPONSES (kind → text + actions, rendered in the current language)
// ============================================
const A = {
  book: (t) => ({ type: 'book', label: t.bookLabel, url: BOOKING_OPEN ? '/book-now' : '/contact' }),
  wa: (t) => ({ type: 'whatsapp', label: t.whatsappLabel }),
  link: (label, url) => ({ type: 'link', label, url }),
};
const RESPONSES = {
  welcome: (t) => ({ text: t.welcome, actions: [A.link('📋 ' + t.packagesLabel, '/fishing-charters'), A.link('🐟 ' + t.seasonsLabel, '/fishing-calendar'), A.book(t), A.wa(t)] }),
  price: (t) => ({ text: `${t.priceTitle}\n\n${t.halfDay}\n${t.halfDayDesc}\n\n${t.fullDay}\n${t.fullDayDesc}\n\n${t.priceNote}\n✅ ${t.privateNote}\n✅ ${t.included}`, actions: [A.link('🚤 ' + t.boatsLabel, '/fishing-boats'), A.book(t)] }),
  included: (t) => ({ text: `${t.includedTitle}${t.sep}\n${t.includedList}\n\n${t.notIncludedTitle}${t.sep}\n${t.notIncludedList}`, actions: [A.book(t), A.wa(t)] }),
  paypal: (t) => ({ text: t.paypalYes, actions: [] }), // owner: "Can I pay with PayPal?" → "Yes." — nothing else
  payment: (t) => ({ text: `${t.paymentTitle}\n\n${t.paymentDesc}`, actions: BOOKING_OPEN ? [A.book(t), A.link('🚤 ' + t.boatsLabel, '/fishing-boats'), A.wa(t)] : [A.link('🚤 ' + t.boatsLabel, '/fishing-boats'), A.wa(t)] }),
  cancel: (t) => ({ text: `${t.cancelTitle}\n\n${t.cancelDesc}`, actions: [A.link('📄 ' + t.termsLabel, '/terms-conditions'), A.wa(t)] }),
  booking: (t) => ({ text: `${t.bookingTitle}${t.sep}\n\n${t.bookingSteps}\n\n${t.privateNote}`, actions: [A.link('🚤 ' + t.boatsLabel, '/fishing-boats'), A.book(t), A.wa(t)] }),
  family: (t) => ({ text: `${t.familyTitle}\n\n${t.familyDesc}`, actions: [A.link('👨‍👩‍👧‍👦 ' + t.packagesLabel, '/family-fishing-charters-san-jose-del-cabo'), A.book(t)] }),
  boats: (t) => ({ text: `${t.boatTitle}\n\n${t.boatDesc}\n\n✅ ${t.boatFeat1}\n✅ ${t.boatFeat2}\n✅ ${t.boatFeat3}\n✅ ${t.boatFeat4}`, actions: [A.link('🚤 ' + t.boatsLabel, '/fishing-boats'), A.book(t)] }),
  location: (t) => ({ text: `${t.locationTitle}\n\n${t.locationDesc}`, actions: [A.book(t), A.wa(t)] }),
  season: (t) => ({ text: `${t.seasonTitle}\n\n${t.seasonText}`, actions: [A.link('📅 ' + t.calendarLabel, '/fishing-calendar')] }),
  fish: (t) => ({ text: `${t.fishTitle}${t.sep}\n\n🎣 ${t.marlin}\n🐠 ${t.tuna}\n⚡ ${t.wahoo}\n🌊 ${t.rooster}\n🪨 ${t.grouper}\n\n${t.calendarHint}`, actions: [A.link('📅 ' + t.calendarLabel, '/fishing-calendar')] }),
  contact: (t) => ({ text: `${t.contactTitle}${t.sep}\n\n${t.contactDesc}`, actions: [A.book(t), A.wa(t)] }),
  reviews: (t) => ({ text: `${t.reviewsTitle}\n\n${t.reviewsDesc}`, actions: [A.link('⭐ ' + t.reviewsLabel, REVIEWS_URL), A.book(t)] }),
  hello: (t) => ({ text: t.hello, actions: [A.book(t)] }),
  thanks: (t) => ({ text: t.thanks, actions: [A.book(t), A.wa(t)] }),
  unknown1: (t) => ({ text: t.unknown1, actions: [A.wa(t), A.book(t)] }),
  unknown2: (t) => ({ text: t.unknown2, actions: [A.wa(t), A.book(t)] }),
  tooLong: (t) => ({ text: t.tooLong, actions: [] }),
};
// Unicode-aware word boundaries (JS \b treats accented letters as non-word characters: "número" would match "mero")
const W = (re, flags = 'u') => new RegExp('(?<![\\p{L}\\p{N}])(?:' + re.source.replace(/^\\b\(/, '(').replace(/\)\\b$/, ')').replace(/\\w\*/g, '[\\p{L}\\p{N}]*') + ')(?![\\p{L}\\p{N}])', flags);
// Order matters: the most specific topics first. Word boundaries avoid false matches (e.g. "hi" inside "fishing").
const RULES = [
  ['paypal', /\b(paypal|pay pal)\b/],
  ['price', /\b(prix|tarifs?|co[uû]ts?|combien|cost|costs|price|prices|pricing|rates?|how much|cheap|expensive|cher|precios?|cu[aá]nto|cuesta|barato|caro|tarifa)\b/],
  ['cancel', /\b(cancel|cancell?ation|refund|annul\w*|rembours\w*|cancela\w*|reembols\w*|devoluci[oó]n)\b/],
  ['payment', /\b(pay|payment|deposit|stripe|wise|paypal|card|payer|paiement|acompte|carte|pagar|pago|dep[oó]sito|tarjeta|anticipo)\b/],
  ['included', /\b(inclus\w*|include[sd]?|including|equipment|tackle|gear|mat[eé]riel|[eé]quipement|nourriture|food|drinks?|boissons?|licen[cs]es?|pourboires?|tips?|gratuit(y|ies)|bait|app[aâ]ts?|incluye|incluido|equipo|comida|bebidas?|licencias?|propinas?|carnada)\b/],
  ['booking', /\b(book|booking|reserve|reservation|r[eé]server|r[eé]servation|disponibilit[eé]s?|availability|available|reservar|reserva|disponibilidad|fechas?)\b/],
  ['family', /\b(famil(y|ies|le|les|ia)|enfants?|kids?|children|child|d[eé]butants?|beginners?|first time|premi[eè]re fois|novices?|ni[nñ]os?|principiantes?|primera vez)\b/],
  ['location', /\b(o[uù]|where|location|d[eé]parts?|partez|partir|depart\w*|marina|puerto|meeting|rendez-vous|adresse|address|d[oó]nde|ubicaci[oó]n|salida|direcci[oó]n|cabo san lucas)\b/],
  ['boats', /\b(bateaux?|boats?|navires?|capacity|capacit[eé]|guests|barcos?|botes?|capacidad|cu[aá]ntas personas|combien de personnes|how many people)\b/],
  ['season', /\b(saisons?|calendrier|calendar|months?|mois|meilleure? p[eé]riode|best time|temporadas?|calendario|mes(es)?|mejor [eé]poca|[eé]poca)\b/],
  ['fish', /\b(poissons?|fish(es)?|catch|esp[eè]ces?|species|marl[ií]n|thon|tuna|dorad[eo]|mahi|wahoo|rooster\w*|pez|peces|at[uú]n|mero|grouper|m[eé]rou|pez gallo)\b/],
  ['contact', /\b(contact\w*|e-?mail|t[eé]l[eé]phone|phone|appeler|call|num[eé]ro|number|tel[eé]fono|llamar|correo|whatsapp)\b/],
  ['reviews', /\b(avis|reviews?|reputation|r[eé]putation|tripadvisor|feedback|opini[oó]n(es)?|rese[nñ]as?|evaluaciones)\b/],
  ['hello', /\b(bonjour|salut|hello|hi|hey|hola|buenos d[ií]as|buenas)\b/],
  ['thanks', /\b(merci|thanks?|thank you|au revoir|bye|gracias|adi[oó]s|hasta luego)\b/],
];
function findKind(input) {
  const q = ' ' + input.toLowerCase() + ' ';
  for (const [kind, re] of RULES) if (W(re).test(q)) return kind;
  return null;
}

// ============================================
// RENDERING
// ============================================
function getTime() {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}
function renderEntry(entry) {
  const div = document.createElement('div');
  if (entry.who === 'user') {
    div.className = 'efc-msg efc-user';
    div.innerHTML = esc(entry.text).replace(/\n/g, '<br>') + `<div class="efc-time">${esc(entry.time)}</div>`; // visitor text is always escaped
    return div;
  }
  const t = I18N[currentLang];
  const r = RESPONSES[entry.kind](t);
  div.className = 'efc-msg efc-bot';
  let html = fmt(r.text);
  if (r.actions.length) {
    html += '<div class="efc-actions">';
    for (const a of r.actions) {
      if (a.type === 'link') html += `<a href="${esc(a.url)}" class="efc-btn"${/^https?:/.test(a.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(a.label)}</a>`;
      else if (a.type === 'book') html += `<a href="${esc(a.url)}" class="efc-btn-primary">📅 ${esc(a.label)}</a>`;
      else if (a.type === 'whatsapp') html += `<a href="${esc(waLink())}" class="efc-btn-primary efc-wa" target="_blank" rel="noopener">💬 ${esc(a.label)}</a>`;
    }
    html += '</div>';
  }
  html += `<div class="efc-time">${esc(entry.time)}</div>`;
  div.innerHTML = html;
  return div;
}
function rerender() {
  const box = $('efc-messages');
  if (!box) return;
  box.textContent = '';
  for (const e of history) box.appendChild(renderEntry(e));
  box.scrollTop = box.scrollHeight;
}
function push(entry) {
  entry.time = getTime();
  history.push(entry);
  const box = $('efc-messages');
  box.appendChild(renderEntry(entry));
  box.scrollTop = box.scrollHeight;
}
// WhatsApp links already on screen always carry the latest facts
function refreshWaLinks() { document.querySelectorAll('#efc-messages a.efc-wa').forEach((a) => { a.href = waLink(); }); }

function showTyping() {
  const div = document.createElement('div');
  div.id = 'efc-typing';
  div.className = 'efc-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  $('efc-messages').appendChild(div);
  $('efc-messages').scrollTop = $('efc-messages').scrollHeight;
}
function removeTyping() { const el = $('efc-typing'); if (el) el.remove(); }

function showWelcome() { push({ who: 'bot', kind: 'welcome' }); }

// ============================================
// OPEN / CLOSE / SEND
// ============================================
function toggleChat(auto) {
  chatOpen = !chatOpen;
  const win = $('efc-chat-window'), bubble = $('efc-chat-bubble');
  if (chatOpen) {
    win.classList.add('active');
    bubble.style.display = 'none';
    bubble.setAttribute('aria-expanded', 'true');
    if (!history.length) setTimeout(showWelcome, 300);
    if (auto !== true) $('efc-input').focus(); // no focus steal (and no mobile keyboard) on the automatic opening
  } else {
    win.classList.remove('active');
    bubble.style.display = 'flex';
    bubble.setAttribute('aria-expanded', 'false');
    bubble.focus();
  }
}

function sendMessage() {
  const input = $('efc-input');
  let text = input.value.replace(/\s+/g, ' ').trim();
  if (!text) return;
  const cut = text.length > MAX_INPUT;
  if (cut) text = text.slice(0, MAX_INPUT);
  // Automatic language detection on every message until the visitor picks EN/ES/FR manually
  if (!manualLang) { const d = detectLanguage(text); if (d && d !== currentLang) setLang(d, false); }
  push({ who: 'user', text });
  input.value = '';
  facts.question = text;
  extractFacts(text);
  refreshWaLinks();
  showTyping();
  setTimeout(() => {
    removeTyping();
    if (cut) push({ who: 'bot', kind: 'tooLong' });
    let kind = findKind(text);
    if (!kind) { unknownCount++; kind = unknownCount >= MAX_UNKNOWN ? 'unknown2' : 'unknown1'; }
    push({ who: 'bot', kind });
  }, 700 + Math.random() * 500);
}

// ============================================
// INITIALISATION
// ============================================
function init() {
  const win = $('efc-chat-window');
  if (!win) return;
  win.setAttribute('role', 'dialog');
  $('efc-messages').setAttribute('aria-live', 'polite');
  $('efc-chat-bubble').setAttribute('aria-expanded', 'false');
  $('efc-chat-bubble').setAttribute('aria-controls', 'efc-chat-window');
  $('efc-input').setAttribute('maxlength', String(MAX_INPUT + 200));
  // Saved manual choice > browser language > English
  const saved = store.get('efc-lang');
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (saved && I18N[saved] && store.get('efc-lang-manual') === '1') { currentLang = saved; manualLang = true; }
  else currentLang = nav.startsWith('es') ? 'es' : nav.startsWith('fr') ? 'fr' : 'en';
  setLang(currentLang, false);

  $('efc-chat-bubble').addEventListener('click', () => toggleChat());
  $('efc-chat-bubble').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChat(); } });
  $('efc-close').addEventListener('click', () => toggleChat());
  ['en', 'es', 'fr'].forEach((l) => { const b = $('btn-' + l); if (b) b.addEventListener('click', () => setLang(l, true)); });
  $('efc-send').addEventListener('click', sendMessage);
  $('efc-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendMessage(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatOpen) toggleChat(); });

  // Auto-open after 50 seconds of inactivity (original behaviour)
  let autoOpenTimer;
  const resetAutoOpen = () => {
    clearTimeout(autoOpenTimer);
    autoOpenTimer = setTimeout(() => { if (!chatOpen && !history.length) toggleChat(true); }, 50000);
  };
  ['mousemove', 'scroll', 'click'].forEach((ev) => document.addEventListener(ev, resetAutoOpen, { passive: true }));
  resetAutoOpen();

  // test hook (read-only)
  window.__efcChat = { get lang() { return currentLang; }, get manual() { return manualLang; }, waLink, history };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
