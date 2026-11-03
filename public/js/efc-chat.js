/* Original Exotic Fish Cabo chat assistant (verbatim from fish-cabo.com), plus CSP-safe event wiring at the end. */

// ============================================
// CONFIGURATION
// ============================================
const WHATSAPP_NUMBER = "+526241223506"; //

// ============================================
// BASE DE CONNAISSANCES MULTILINGUE
// ============================================
const I18N = {
  fr: {
    welcome: `👋 ¡Hola ! Bienvenue chez **Exotic Fish Cabo** !\n\nJe suis votre assistant pour planifier votre journée de pêche à San José del Cabo. 🎣\n\nQue puis-je faire pour vous ?`,
    placeholder: "Posez votre question...",
    online: "🎣 Assistant de pêche • En ligne",
    bookLabel: "Réserver maintenant",
    packagesLabel: "Nos forfaits",
    seasonsLabel: "Poissons & Saisons",
    whatsappLabel: "WhatsApp direct",
    whatsappPre: "Bonjour Exotic Fish Cabo ! J'ai une question complémentaire depuis votre site web : ",
    unknown1: `🤔 Je ne suis pas sûr de comprendre. Essayez :\n\n• "Quels sont les prix ?"\n• "Quels poissons en ce moment ?"\n• "C'est bon pour les débutants ?"\n• "Comment réserver ?"`,
    unknown2: `🤔 Je n'ai pas la réponse précise dans ma base de connaissances.\n\nLaissez-moi vous mettre en contact avec notre équipe :`,
    thanks: `🙏 De rien !\n\nN'oubliez pas : la pêche à Los Cabos est **toute l'année**. Réservez tôt en haute saison ! 🎣`,
    priceTitle: "💰 Nos forfaits privés",
    halfDay: "🕕 3/4 Journée (6h) — À partir de 350 USD",
    halfDayDesc: "Pêche mixte inshore/offshore, idéal pour familles",
    fullDay: "🕗 Journée Complète (8h) — À partir de 600 USD",
    fullDayDesc: "Offshore sérieux pour pêcheurs expérimentés",
    privateNote: "Tous nos charters sont 100% privés",
    included: "Matériel, équipage bilingue et sécurité inclus",
    fishTitle: "🐟 Nos cibles principales",
    marlin: "Marlin — Action forte en haute saison",
    tuna: "Thon & Dorado — Excellents quand conditions alignées",
    wahoo: "Wahoo — Frappes puissantes en saison",
    rooster: "Roosterfish — Pêche inshore excitante",
    grouper: "Grouper & autres espèces côtières",
    calendarHint: "Consultez notre Fishing Calendar sur le site !",
    seasonTitle: "📆 Pêche toute l'année !",
    seasonText: "Chaque saison a ses stars. Les courants chauds et bancs (Gordo Banks, Iman Bank) créent des conditions exceptionnelles.",
    boatTitle: "🚤 Notre flotte",
    boatDesc: "De 1 à 10 invités. Center consoles rapides et sportfishers spacieux.",
    boatFeat1: "Ombre et sièges confortables",
    boatFeat2: "Équipement sécurité complet",
    boatFeat3: "Matériel haut de gamme",
    boatFeat4: "Coques rapides = plus de pêche !",
    familyTitle: "👨‍👩‍👧‍👦 Parfait pour familles !",
    familyDesc: "Équipage patient, zones calmes, espèces faciles. Beaucoup disent que c'est le highlight de leurs vacances !",
    locationTitle: "📍 Puerto Los Cabos Marina",
    locationDesc: "San José del Cabo. Accessible depuis tous les hôtels. Départ direct vers Gordo Banks et Iman Bank.",
    includedTitle: "✅ Inclus dans tous les charters",
    includedList: "• Matériel de pêche haut de gamme\n• Équipement sécurité complet\n• Équipage professionnel bilingue\n• Bateau privé rapide",
    notIncludedTitle: "❓ Non inclus",
    notIncludedList: "• Licence de pêche mexicaine\n• Pourboire crew (15-20%)\n• Nourriture/boissons (selon bateau)",
    bookingTitle: "📅 Pour réserver",
    bookingSteps: "1️⃣ Choisissez votre date\n2️⃣ 3/4 journée ou journée complète\n3️⃣ Nombre de pêcheurs (1-10)",
    reviewsTitle: "⭐ Excellentes évaluations",
    reviewsDesc: "Clients qui reviennent année après année. Points forts : connaissance locale, équipage sympa, bateaux propres.",
    contactTitle: "📞 Nous contacter",
    contactDesc: "💬 WhatsApp : le plus rapide\n📧 Email : via formulaire\n🌐 www.fish-cabo.com",
    hello: `👋 ¡Hola ! Je suis l'assistant d'**Exotic Fish Cabo**. Comment puis-je vous aider ?\n\n• 💰 Prix et forfaits\n• 🐟 Poissons et saisons\n• 🚤 Bateaux\n• 👨‍👩‍👧‍👦 Familles et débutants\n• 📅 Réservations`
  },
  
  en: {
    welcome: `👋 Hi! Welcome to **Exotic Fish Cabo**!\n\nI'm your assistant to help plan your fishing day in San José del Cabo. 🎣\n\nWhat can I do for you?`,
    placeholder: "Ask your question...",
    online: "🎣 Fishing Assistant • Online",
    bookLabel: "Book Now",
    packagesLabel: "Our Packages",
    seasonsLabel: "Fish & Seasons",
    whatsappLabel: "WhatsApp",
    whatsappPre: "Hello Exotic Fish Cabo! I have a question from your website: ",
    unknown1: `🤔 I'm not sure I understand. Try asking:\n\n• "What are the prices?"\n• "What fish are biting now?"\n• "Is it good for beginners?"\n• "How do I book?"`,
    unknown2: `🤔 I don't have the exact answer in my knowledge base.\n\nLet me connect you directly with our team:`,
    thanks: `🙏 You're welcome!\n\nRemember: fishing in Los Cabos is **year-round**. Book early for peak season! 🎣`,
    priceTitle: "💰 Our Private Packages",
    halfDay: "🕕 3/4 Day (6 hours) — From 350 USD",
    halfDayDesc: "Mixed inshore/offshore, perfect for families",
    fullDay: "🕗 Full Day (8 hours) — From 600 USD",
    fullDayDesc: "Serious offshore fishing for experienced anglers",
    privateNote: "All our charters are 100% private",
    included: "Gear, bilingual crew & safety included",
    fishTitle: "🐟 Our Main Targets",
    marlin: "Marlin — Strong action in peak season",
    tuna: "Tuna & Dorado — Excellent when conditions align",
    wahoo: "Wahoo — Powerful strikes in season",
    rooster: "Roosterfish — Exciting inshore sight-fishing",
    grouper: "Grouper & other inshore species",
    calendarHint: "Check our Fishing Calendar on the website!",
    seasonTitle: "📆 Fishing all year round!",
    seasonText: "Every season has its stars. Warm currents and banks (Gordo Banks, Iman Bank) create exceptional conditions.",
    boatTitle: "🚤 Our Fleet",
    boatDesc: "From 1 to 10 guests. Fast center consoles and spacious sportfishers.",
    boatFeat1: "Shade and comfortable seating",
    boatFeat2: "Full safety equipment",
    boatFeat3: "Top-quality tackle",
    boatFeat4: "Fast hulls = more fishing time!",
    familyTitle: "👨‍👩‍👧‍👦 Perfect for families!",
    familyDesc: "Patient crew, calm areas, easy-to-handle species. Many say it's the highlight of their vacation!",
    locationTitle: "📍 Puerto Los Cabos Marina",
    locationDesc: "San José del Cabo. Accessible from all hotels. Direct departure to Gordo Banks and Iman Bank.",
    includedTitle: "✅ Included in all charters",
    includedList: "• Top-quality fishing tackle\n• Full safety equipment\n• Professional bilingual crew\n• Private fast boat",
    notIncludedTitle: "❓ Not included",
    notIncludedList: "• Mexican fishing license\n• Crew tip (15-20% recommended)\n• Food/drinks (varies by boat)",
    bookingTitle: "📅 To book your charter",
    bookingSteps: "1️⃣ Choose your date\n2️⃣ Half day or full day\n3️⃣ Number of anglers (1-10)",
    reviewsTitle: "⭐ Excellent reviews",
    reviewsDesc: "Guests return year after year. Highlights: local knowledge, friendly crew, clean boats.",
    contactTitle: "📞 Contact us",
    contactDesc: "💬 WhatsApp: fastest response\n📧 Email: via contact form\n🌐 www.fish-cabo.com",
    hello: `👋 Hi! I'm **Exotic Fish Cabo**'s assistant. How can I help you?\n\n• 💰 Prices & packages\n• 🐟 Fish & seasons\n• 🚤 Boats\n• 👨‍👩‍👧‍👦 Families & beginners\n• 📅 Bookings`
  },
  
  es: {
    welcome: `👋 ¡Hola! ¡Bienvenido a **Exotic Fish Cabo**!\n\nSoy tu asistente para planificar tu día de pesca en San José del Cabo. 🎣\n\n¿En qué puedo ayudarte?`,
    placeholder: "Haz tu pregunta...",
    online: "🎣 Asistente de pesca • En línea",
    bookLabel: "Reservar ahora",
    packagesLabel: "Nuestros paquetes",
    seasonsLabel: "Peces y temporadas",
    whatsappLabel: "WhatsApp",
    whatsappPre: "¡Hola Exotic Fish Cabo! Tengo una pregunta desde su sitio web: ",
    unknown1: `🤔 No estoy seguro de entender. Intenta:\n\n• "¿Cuáles son los precios?"\n• "¿Qué peces hay ahora?"\n• "¿Es bueno para principiantes?"\n• "¿Cómo reservo?"`,
    unknown2: `🤔 No tengo la respuesta exacta en mi base de conocimientos.\n\nDéjame conectarte directamente con nuestro equipo:`,
    thanks: `🙏 ¡De nada!\n\nRecuerda: la pesca en Los Cabos es **todo el año**. ¡Reserva temprano en temporada alta! 🎣`,
    priceTitle: "💰 Nuestros paquetes privados",
    halfDay: "🕕 3/4 Día (6 horas) — Desde 350 USD",
    halfDayDesc: "Pesca mixta inshore/offshore, perfecto para familias",
    fullDay: "🕗 Día completo (8 horas) — Desde 600 USD",
    fullDayDesc: "Pesca offshore seria para pescadores experimentados",
    privateNote: "Todos nuestros charters son 100% privados",
    included: "Equipo, crew bilingüe y seguridad incluidos",
    fishTitle: "🐟 Nuestros objetivos principales",
    marlin: "Marlin — Acción fuerte en temporada alta",
    tuna: "Atún & Dorado — Excelentes cuando se alinean condiciones",
    wahoo: "Wahoo — Golpes poderosos en temporada",
    rooster: "Roosterfish — Pesca inshore emocionante",
    grouper: "Mero y otras especies costeras",
    calendarHint: "¡Consulta nuestro Fishing Calendar en el sitio!",
    seasonTitle: "📆 ¡Pesca todo el año!",
    seasonText: "Cada temporada tiene sus estrellas. Las corrientes cálidas y bancos (Gordo Banks, Iman Bank) crean condiciones excepcionales.",
    boatTitle: "🚤 Nuestra flota",
    boatDesc: "De 1 a 10 invitados. Center consoles rápidos y sportfishers espaciosos.",
    boatFeat1: "Sombra y asientos cómodos",
    boatFeat2: "Equipo de seguridad completo",
    boatFeat3: "Equipo de pesca de alta gama",
    boatFeat4: "Casco rápido = ¡más tiempo pescando!",
    familyTitle: "👨‍👩‍👧‍👦 ¡Perfecto para familias!",
    familyDesc: "Tripulación paciente, zonas tranquilas, especies fáciles. ¡Muchos dicen que es lo mejor de sus vacaciones!",
    locationTitle: "📍 Marina Puerto Los Cabos",
    locationDesc: "San José del Cabo. Accesible desde todos los hoteles. Salida directa a Gordo Banks e Iman Bank.",
    includedTitle: "✅ Incluido en todos los charters",
    includedList: "• Equipo de pesca de alta gama\n• Equipo de seguridad completo\n• Tripulación profesional bilingüe\n• Bote privado rápido",
    notIncludedTitle: "❓ No incluido",
    notIncludedList: "• Licencia de pesca mexicana\n• Propina crew (15-20% recomendado)\n• Comida/bebidas (varía por bote)",
    bookingTitle: "📅 Para reservar",
    bookingSteps: "1️⃣ Elige tu fecha\n2️⃣ Medio día o día completo\n3️⃣ Número de pescadores (1-10)",
    reviewsTitle: "⭐ Excelentes evaluaciones",
    reviewsDesc: "Clientes que regresan año tras año. Destacan: conocimiento local, tripulación amigable, botes limpios.",
    contactTitle: "📞 Contáctanos",
    contactDesc: "💬 WhatsApp: la respuesta más rápida\n📧 Email: vía formulario\n🌐 www.fish-cabo.com",
    hello: `👋 ¡Hola! Soy el asistente de **Exotic Fish Cabo**. ¿Cómo puedo ayudarte?\n\n• 💰 Precios y paquetes\n• 🐟 Peces y temporadas\n• 🚤 Botes\n• 👨‍👩‍👧‍👦 Familias y principiantes\n• 📅 Reservas`
  }
};

// ============================================
// DÉTECTION DE LANGUE
// ============================================

function detectLanguage(text) {
  const lower = text.toLowerCase();
  
  // Mots-clés espagnols
  const esWords = /hola|qué|cuál|precio|precios|cuánto|reservar|reserva|pescar|pesca|pez|peces|barco|bote|familia|niños|dónde|cuándo|temporada|incluido|gracias|adios|buenos|buenas|como|donde|cuando|cuesta|barato|caro|marlin|atun|dorado|wahoo|rooster|mero|capacidad|personas|gente|contacto|telefono|numero|email|correo|ayuda|por favor|disculpe/;
  
  // Mots-clés français
  const frWords = /bonjour|salut|quoi|quel|quelle|prix|combien|coût|tarif|réserver|réservation|pêche|poisson|bateau|famille|enfants|où|quand|saison|inclus|merci|au revoir|bonsoir|comment|coûte|cher|pas cher|marlin|thon|dorade|wahoo|rooster|grouper|capacité|personnes|contact|téléphone|numéro|email|aide|s'il vous plaît|excusez/;
  
  // Mots-clés anglais
  const enWords = /hello|hi|hey|what|which|price|prices|how much|cost|book|booking|fish|fishing|boat|family|kids|children|where|when|season|included|thanks|thank|goodbye|bye|how|does|cheap|expensive|marlin|tuna|dorado|wahoo|rooster|grouper|capacity|people|guests|contact|phone|number|email|help|please|sorry/;
  
  let esScore = (lower.match(esWords) || []).length;
  let frScore = (lower.match(frWords) || []).length;
  let enScore = (lower.match(enWords) || []).length;
  
  // Priorité si égalité : EN > ES > FR (majorité de vos clients)
  if (esScore > frScore && esScore > enScore) return 'es';
  if (enScore >= frScore && enScore >= esScore) return 'en';
  if (frScore > enScore && frScore > esScore) return 'fr';
  
  // Détection navigateur par défaut
  const navLang = navigator.language || navigator.userLanguage;
  if (navLang.startsWith('es')) return 'es';
  if (navLang.startsWith('fr')) return 'fr';
  return 'en'; // défaut anglais
}

// ============================================
// ÉTAT GLOBAL
// ============================================
let currentLang = 'en';
let chatOpen = false;
let unknownCount = 0;
const MAX_UNKNOWN = 2;

function setLang(lang, save = true) {
  currentLang = lang;
  if (save) localStorage.setItem('efc-lang', lang);
  
  // Update UI
  document.querySelectorAll('#efc-lang-selector button').forEach(btn => {
    btn.classList.toggle('active', btn.id === `btn-${lang}`);
  });
  
  const t = I18N[lang];
  document.getElementById('efc-input').placeholder = t.placeholder;
  document.getElementById('efc-status').textContent = t.online;
  
  // Si chat vide, montrer welcome dans la nouvelle langue
  const msgs = document.getElementById('efc-messages');
  if (msgs.children.length === 0 && chatOpen) {
    showWelcome();
  }
}

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('efc-chat-window');
  const bubble = document.getElementById('efc-chat-bubble');
  
  if (chatOpen) {
    win.classList.add('active');
    bubble.style.display = 'none';
    if (document.getElementById('efc-messages').children.length === 0) {
      setTimeout(() => showWelcome(), 300);
    }
    document.getElementById('efc-input').focus();
  } else {
    win.classList.remove('active');
    bubble.style.display = 'flex';
  }
}

function getTime() {
  const now = new Date();
  return now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
}

function addMessage(text, isUser = false, actions = []) {
  const container = document.getElementById('efc-messages');
  const div = document.createElement('div');
  div.className = `efc-msg ${isUser ? 'efc-user' : 'efc-bot'}`;
  
  let html = text.replace(/\n/g, '<br>');
  
  if (actions.length > 0) {
    html += '<div class="efc-actions">';
    actions.forEach(action => {
      if (action.type === 'link') {
        html += `<a href="${action.url}" class="efc-btn" target="_blank">${action.label}</a>`;
      } else if (action.type === 'book') {
        html += `<a href="${action.url}" class="efc-btn-primary">📅 ${action.label}</a>`;
      } else if (action.type === 'whatsapp') {
        const msg = I18N[currentLang].whatsappPre + action.context;
        // wa.me exige le numéro sans "+" ni espaces
        const waNumber = WHATSAPP_NUMBER.replace(/\D/g, '');
        html += `<a href="https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}" class="efc-btn-primary" target="_blank">💬 ${action.label}</a>`;
      }
    });
    html += '</div>';
  }
  
  html += `<div class="efc-time">${getTime()}</div>`;
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('efc-messages');
  const div = document.createElement('div');
  div.id = 'efc-typing';
  div.className = 'efc-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function removeTyping() {
  const el = document.getElementById('efc-typing');
  if (el) el.remove();
}

function showWelcome() {
  const t = I18N[currentLang];
  addMessage(t.welcome, false, [
    {type: 'link', label: '📋 ' + t.packagesLabel, url: '/fishing-charters'},
    {type: 'link', label: '🐟 ' + t.seasonsLabel, url: '/fishing-calendar'},
    {type: 'book', label: t.bookLabel, url: '/contact'},
    {type: 'whatsapp', label: t.whatsappLabel, context: 'General inquiry'}
  ]);
}

// ============================================
// MOTEUR DE RÉPONSE MULTILINGUE
// ============================================

function findBestResponse(input) {
  const q = input.toLowerCase();
  const t = I18N[currentLang];
  
  // === PRIX ===
  if (q.match(/prix|tarif|coût|combien|cost|price|cheap|cher|precio|precios|cuánto|cuesta|barato|caro/)) {
    return {
      text: `${t.priceTitle}\n\n${t.halfDay}\n${t.halfDayDesc}\n\n${t.fullDay}\n${t.fullDayDesc}\n\n✅ ${t.privateNote}\n✅ ${t.included}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === RÉSERVATION ===
  if (q.match(/book|réserver|réservation|reserve|booking|disponibilité|date|reservar|reserva|disponibilidad|fecha|cuando.*pescar/)) {
    return {
      text: `${t.bookingTitle} :\n\n${t.bookingSteps}\n\n${t.privateNote}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === POISSONS ===
  if (q.match(/poisson|fish|catch|espèce|marlin|thon|tuna|dorado|wahoo|rooster|pez|peces|pescar|atun|mero/)) {
    return {
      text: `${t.fishTitle} :\n\n🎣 ${t.marlin}\n🐠 ${t.tuna}\n⚡ ${t.wahoo}\n🌊 ${t.rooster}\n🪨 ${t.grouper}\n\n${t.calendarHint}`,
      actions: [{type: 'link', label: '📅 Fishing Calendar', url: '/fishing-calendar'}]
    };
  }
  
  // === SAISONS ===
  if (q.match(/saison|calendrier|calendar|month|mois|meilleur|best|période|temporada|calendario|mes|mejor|epoca/)) {
    return {
      text: `${t.seasonTitle}\n\n${t.seasonText}`,
      actions: [{type: 'link', label: '📅 Fishing Calendar', url: '/fishing-calendar'}]
    };
  }
  
  // === BATEAUX ===
  if (q.match(/bateau|boat|navire|capacity|capacité|combien.*personne|guest|barco|bote|capacidad|cuantas.*personas|cuantos/)) {
    return {
      text: `${t.boatTitle}\n\n${t.boatDesc}\n\n✅ ${t.boatFeat1}\n✅ ${t.boatFeat2}\n✅ ${t.boatFeat3}\n✅ ${t.boatFeat4}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === FAMILLE ===
  if (q.match(/famille|family|enfant|kid|débutant|beginner|first.*time|première|novice|familia|niños|niño|principiante|primera.*vez/)) {
    return {
      text: `${t.familyTitle}\n\n${t.familyDesc}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === LOCALISATION ===
  if (q.match(/où|where|location|départ|depart|marina|puerto|san.*jose|los.*cabos|adresse|address|donde|ubicacion|salida|direccion/)) {
    return {
      text: `${t.locationTitle}\n\n${t.locationDesc}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === INCLUS ===
  if (q.match(/inclus|included|what.*include|équipement|tackle|matériel|nourriture|food|drink|boisson|license|licence|pourboire|tip|incluido|que.*incluye|equipo|comida|bebida|licencia|propina/)) {
    return {
      text: `${t.includedTitle} :\n${t.includedList}\n\n${t.notIncludedTitle} :\n${t.notIncludedList}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === CONTACT ===
  if (q.match(/contact|email|téléphone|phone|appeler|call|numéro|number|contacto|telefono|numero|llamar|correo/)) {
    return {
      text: `${t.contactTitle} :\n\n${t.contactDesc}`,
      actions: [
        {type: 'book', label: t.bookLabel, url: '/contact'},
        {type: 'whatsapp', label: t.whatsappLabel, context: 'Contact request'}
      ]
    };
  }
  
  // === AVIS ===
  if (q.match(/avis|review|reputation|tripadvisor|retour|client|feedback|opinion|opiniones|evaluaciones|resenas/)) {
    return {
      text: `${t.reviewsTitle}\n\n${t.reviewsDesc}`,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === SALUTATIONS ===
  if (q.match(/bonjour|salut|hello|hi|hey|hola|buenos|buenas/)) {
    return {
      text: t.hello,
      actions: [{type: 'book', label: t.bookLabel, url: '/contact'}]
    };
  }
  
  // === MERCI ===
  if (q.match(/merci|thank|thanks|au revoir|bye|gracias|adios|hasta/)) {
    return {
      text: t.thanks,
      actions: [
        {type: 'book', label: t.bookLabel, url: '/contact'},
        {type: 'whatsapp', label: t.whatsappLabel, context: 'Follow-up from chat'}
      ]
    };
  }
  
  return null;
}

function handleUnknown() {
  unknownCount++;
  const t = I18N[currentLang];
  
  if (unknownCount >= MAX_UNKNOWN) {
    return {
      text: t.unknown2,
      actions: [
        {type: 'whatsapp', label: t.whatsappLabel, context: 'Advanced question not handled by bot'},
        {type: 'book', label: t.bookLabel, url: '/contact'}
      ]
    };
  } else {
    return {
      text: t.unknown1,
      actions: [
        {type: 'whatsapp', label: t.whatsappLabel, context: 'Question not understood by bot'},
        {type: 'book', label: t.bookLabel, url: '/contact'}
      ]
    };
  }
}

// ============================================
// GESTION DES MESSAGES
// ============================================

function sendMessage() {
  const input = document.getElementById('efc-input');
  const text = input.value.trim();
  if (!text) return;
  
  // Détecter langue au premier message
  const msgs = document.getElementById('efc-messages');
  if (msgs.children.length === 0 || (msgs.children.length === 1 && !chatOpen)) {
    const detected = detectLanguage(text);
    if (detected !== currentLang) {
      setLang(detected);
    }
  }
  
  addMessage(text, true);
  input.value = '';
  
  const typing = showTyping();
  
  setTimeout(() => {
    removeTyping();
    const response = findBestResponse(text) || handleUnknown();
    addMessage(response.text, false, response.actions);
  }, 700 + Math.random() * 500);
}

// ============================================
// INITIALISATION
// ============================================

// Langue sauvegardée ou détection navigateur
const savedLang = localStorage.getItem('efc-lang');
const navLang = navigator.language || navigator.userLanguage;
if (savedLang) {
  currentLang = savedLang;
} else if (navLang.startsWith('es')) {
  currentLang = 'es';
} else if (navLang.startsWith('fr')) {
  currentLang = 'fr';
} else {
  currentLang = 'en';
}

setLang(currentLang, false);

// Auto-open après 50 secondes
let autoOpenTimer;
function resetAutoOpen() {
  clearTimeout(autoOpenTimer);
  autoOpenTimer = setTimeout(() => {
    if (!chatOpen && document.getElementById('efc-messages').children.length === 0) {
      toggleChat();
    }
  }, 50000);
}
document.addEventListener('mousemove', resetAutoOpen);
document.addEventListener('scroll', resetAutoOpen);
document.addEventListener('click', resetAutoOpen);
resetAutoOpen();


// ---- Cloudflare version: event wiring (replaces Squarespace inline onclick attributes; CSP-safe) ----
(function () {
  var $ = function (id) { return document.getElementById(id); };
  $('efc-chat-bubble') && $('efc-chat-bubble').addEventListener('click', toggleChat);
  $('efc-chat-bubble') && $('efc-chat-bubble').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChat(); } });
  $('efc-close') && $('efc-close').addEventListener('click', toggleChat);
  ['en', 'es', 'fr'].forEach(function (l) { var b = $('btn-' + l); b && b.addEventListener('click', function () { setLang(l); }); });
  $('efc-send') && $('efc-send').addEventListener('click', sendMessage);
  $('efc-input') && $('efc-input').addEventListener('keypress', function (e) { if (e.key === 'Enter') sendMessage(); });
})();
