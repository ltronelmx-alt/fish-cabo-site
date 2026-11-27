// Chat assistant "brain" (2026-11-27). The site chat (public/js/efc-chat.js) keeps its look, its rules and its answers;
// it calls POST /api/chat/assist only for concrete booking questions (date, duration, group, boat, price, availability)
// and for questions its rules do not understand.
//
// Facts ALWAYS come from the booking system (same functions as /book-now): availability = findOptions/dayStates,
// prices = D1 prices table (owner-editable), boats = D1 boats. Texts are fixed templates in EN/FR/ES: the AI never writes
// a price, an availability or a confirmation. Workers AI (free daily allocation) is only used to UNDERSTAND a message the
// rules could not parse, and is capped (ASSIST_AI_DAILY_MAX calls/day, shared Free-plan quota → errors, never a bill).
import { db, boats as loadBoats, findOptions, dayStates, priceOf, durationsOf, type BEnv, type Boat } from './core';
import { json, rateLimit, localToday, addDays, isDate } from './util';
import showcase from '../../src/data/boat-showcase.json';

type Lang = 'en' | 'fr' | 'es';
type Ctx = { date?: string; hours?: 6 | 8; people?: number; boat?: number };
type Act = { type: 'book' | 'link' | 'whatsapp'; label: Record<Lang, string>; url?: string };
type Reply = { text: Record<Lang, string>; actions: Act[]; ctx: Ctx; source: 'rules' | 'ai' };
type AiEnv = BEnv & { AI?: { run: (model: string, input: unknown) => Promise<unknown> }; ASSIST_AI?: string; ASSIST_AI_DAILY_MAX?: string };

const AI_MODEL = '@cf/openai/gpt-oss-20b'; // best of the free Workers AI models in our EN/FR/ES extraction test (2026-11-27)
const tier = (id: string) => ((showcase as { boats: { id: string; priceTier?: number }[] }).boats.find((b) => b.id === id)?.priceTier ?? 0);

/* ------------------------------------------------------------------ understanding (rules) ------------------------------------------------------------------ */
const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const N = `(\\d{1,2}|${Object.keys(NUM).join('|')})`;
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s]);
const MONTHS: Record<string, number> = { jan: 1, january: 1, janvier: 1, janv: 1, enero: 1, ene: 1, feb: 2, february: 2, fevrier: 2, fev: 2, febrero: 2, mar: 3, march: 3, mars: 3, marzo: 3,
  apr: 4, april: 4, avril: 4, avr: 4, abril: 4, abr: 4, may: 5, mai: 5, mayo: 5, jun: 6, june: 6, juin: 6, junio: 6, jul: 7, july: 7, juillet: 7, juil: 7, julio: 7,
  aug: 8, august: 8, aout: 8, agosto: 8, ago: 8, sep: 9, sept: 9, september: 9, septembre: 9, septiembre: 9, oct: 10, october: 10, octobre: 10, octubre: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11, dec: 12, december: 12, decembre: 12, dic: 12, diciembre: 12 };
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const DOW: Record<string, number> = { sunday: 0, dimanche: 0, domingo: 0, monday: 1, lundi: 1, lunes: 1, tuesday: 2, mardi: 2, martes: 2, wednesday: 3, mercredi: 3, miercoles: 3,
  thursday: 4, jeudi: 4, jueves: 4, friday: 5, vendredi: 5, viernes: 5, saturday: 6, samedi: 6, sabado: 6 };
const DOWRE = Object.keys(DOW).join('|');
const pad = (n: number) => String(n).padStart(2, '0');
function nextOf(today: string, m: number, d: number, y?: number) {
  if (y) { const iso = `${y < 100 ? 2000 + y : y}-${pad(m)}-${pad(d)}`; return isDate(iso) ? iso : ''; }
  let yy = Number(today.slice(0, 4)); let iso = `${yy}-${pad(m)}-${pad(d)}`;
  if (isDate(iso) && iso < today) iso = `${++yy}-${pad(m)}-${pad(d)}`;
  return isDate(iso) ? iso : '';
}
export type Parsed = Ctx & { choices?: string[]; pastDate?: string; handoff?: 'tournament' | 'custom' | 'human' | 'today' | 'big_group'; status?: string; wantsPrice?: boolean; wantsBooking?: boolean };
export function parse(text: string, today: string): Parsed {
  const t = ` ${strip(text).replace(/[!?¡¿,;:()"«»]/g, ' ').replace(/\s+/g, ' ')} `;
  const p: Parsed = {};
  if (/\b(tournament|tournoi|torneo|bisbee|derby)\b/.test(t)) p.handoff = 'tournament';
  else if (/\b(custom|sur mesure|personnalise|a la medida|personalizad[oa]|overnight|multi ?day|plusieurs jours|varios dias|wedding|mariage|boda)\b/.test(t)) p.handoff = 'custom';
  else if (/\b(human|real person|talk to someone|speak to someone|humain|parler a quelqu'un|une vraie personne|persona real|hablar con alguien|asesor)\b/.test(t)) p.handoff = 'human';
  else if (/\b(today|tonight|aujourd'hui|ce soir|hoy|esta tarde|ahorita)\b/.test(t)) p.handoff = 'today';
  const ref = text.match(/\bEFC-[A-Z0-9]{6}\b/i); if (ref) p.status = ref[0].toUpperCase();
  if (/\b(price|prices|cost|how much|prix|tarif|tarifs|combien|coute|cout|precio|precios|cuanto|cuesta|tarifa)\b/.test(t)) p.wantsPrice = true;
  if (/\b(book|available|availability|free|reserve|disponible|disponibilite|dispo|reserver|libre|reservar|disponibilidad)\b/.test(t)) p.wantsBooking = true;
  const b = t.match(/\b(?:boat|bateau|bote|barco|lancha)\s*(?:#|n[o°º]\s*|number\s*|numero\s*)?(\d{1,2})\b/) || t.match(/#\s?(\d{1,2})\b/)
    || ((p.wantsPrice || p.wantsBooking) ? t.match(/\b(?:the|le|la|el)\s+(\d{1,2})\s*$/) : null);
  if (b && +b[1] >= 1 && +b[1] <= 10) p.boat = +b[1];
  if (/\b(full ?day|whole day|journee (complete|entiere)|toute la journee|dia completo|todo el dia)\b/.test(t)) p.hours = 8;
  else if (/\b(3 ?\/ ?4|three ?quarters?|trois ?quarts?|tres ?cuartos?|half ?day|demi ?journee|medio dia)\b/.test(t)) p.hours = 6;
  const h = t.match(new RegExp(`\\b${N}\\s*(?:h|hr|hrs|hours?|heures?|horas?)\\b`));
  if (h) { const n = num(h[1]); if (n === 6 || n === 8) p.hours = n; }
  const pp = t.match(new RegExp(`\\b${N}\\s*(?:people|persons?|pax|guests?|adults?|anglers?|fishermen|of us|personnes?|adultes?|pecheurs?|amis|personas?|adultos?|pescadores?|amigos)\\b`))
    || t.match(new RegExp(`\\b(?:we are|we're|there are|party of|group of|on est|on sera|nous sommes|nous serons|somos|seremos|grupo de)\\s+${N}\\b`))
    || t.match(new RegExp(`\\b(?:for|pour|para)\\s+${N}\\b(?!\\s*(?:h|hr|hrs|hours?|heures?|horas?|am|pm)\\b)`));
  if (pp) { const n = num(pp[1]); if (n >= 1) { if (n > 10) p.handoff ??= 'big_group'; else p.people = n; } }
  let td = t; // the group size and duration are removed before reading the date ("we are 4, December 12" is the 12th)
  if (pp) td = td.replace(pp[0], ' ');
  if (h) td = td.replace(h[0], ' ');
  if (p.people == null && /\b(my (wife|husband|partner) and i|me and my (wife|husband|son|daughter|friend)|ma femme et moi|mon mari et moi|mi esposa y yo|mi esposo y yo)\b/.test(t)) p.people = 2;
  const iso = td.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const dm = td.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er)?\\s+(?:de\\s+)?(${MON})\\b(?:\\s+(?:de\\s+)?(20\\d{2}))?`));
  const md = td.match(new RegExp(`\\b(${MON})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(20\\d{2}))?`));
  const nn = td.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  const rel = td.match(/\b(day after tomorrow|apres-demain|apres demain|pasado manana|tomorrow|demain)\b/) || (/\bmanana\b/.test(td) && !/\b(la|por la|de la|en la|cada)\s+manana\b/.test(td) ? ['manana', 'manana'] : null);
  const wd = td.match(new RegExp(`\\b(next|prochain|proximo)?\\s*(${DOWRE})\\b\\s*(prochain|next|que viene|proximo|qui vient)?`));
  let date = '';
  if (iso) date = isDate(`${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`) ? `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}` : '';
  else if (dm) date = nextOf(today, MONTHS[dm[2]], +dm[1], dm[3] ? +dm[3] : undefined);
  else if (md) date = nextOf(today, MONTHS[md[1]], +md[2], md[3] ? +md[3] : undefined);
  else if (nn && !/^3\/4$/.test(nn[0])) {
    const a = +nn[1], c = +nn[2], y = nn[3] ? +nn[3] : undefined;
    const dmY = a <= 31 && c <= 12 ? nextOf(today, c, a, y) : ''; // day/month
    const mdY = a <= 12 && c <= 31 ? nextOf(today, a, c, y) : ''; // month/day
    if (dmY && mdY && dmY !== mdY) p.choices = [dmY, mdY].sort(); else date = dmY || mdY;
  } else if (rel) date = addDays(today, /after|apres|pasado/.test(rel[1]) ? 2 : 1);
  else if (wd) {
    const cur = new Date(`${today}T12:00:00Z`).getUTCDay(); let diff = (DOW[wd[2]] - cur + 7) % 7; if (diff === 0) diff = 7;
    const first = addDays(today, diff);
    if ((wd[1] || wd[3]) && diff <= 3) p.choices = [first, addDays(first, 7)]; else date = first;
  }
  if (date) { if (date < today) p.pastDate = date; else p.date = date; }
  return p;
}

/* ------------------------------------------------------------------ understanding (AI, free quota, capped) ------------------------------------------------------------------ */
async function aiParse(env: AiEnv, d: D1Database, text: string, today: string): Promise<Parsed | null> {
  if (!env.AI || env.ASSIST_AI === 'off') return null;
  const max = Number(env.ASSIST_AI_DAILY_MAX || 150);
  if (!(await rateLimit(d, `assist:ai:${today}`, max, 86400))) return null; // daily cap: back to rules, never a bill
  const instructions = `Extract a fishing-charter booking request. Today is ${today} (Los Cabos). Reply with ONE minified JSON object only, keys:
date (YYYY-MM-DD or null), date_choices (array of 2 candidate dates when ambiguous, else null), hours (6, 8 or null — trip DURATION, "full day"=8, "3/4 day"/"half day"=6, never a clock time), people (integer or null), boat (1-10 or null), price (true if they ask a price), handoff ("tournament","custom","human","today" or null).`;
  try {
    const out = (await env.AI.run(AI_MODEL, { instructions, input: text.slice(0, 500), max_output_tokens: 400 })) as Record<string, unknown>;
    const raw = String((out as { response?: string }).response ?? (out as { output_text?: string }).output_text
      ?? ((out as { output?: { type?: string; content?: { text?: string }[] }[] }).output || []).filter((x) => x.type === 'message').flatMap((x) => x.content || []).map((c) => c.text || '').join('')
      ?? '');
    const m = raw.match(/\{[\s\S]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const p: Parsed = {};
    if (typeof j.date === 'string' && isDate(j.date)) { if (j.date < today) p.pastDate = j.date; else p.date = j.date; }
    if (Array.isArray(j.date_choices) && j.date_choices.length === 2 && j.date_choices.every((x) => typeof x === 'string' && isDate(x) && x >= today)) { p.choices = (j.date_choices as string[]).sort(); delete p.date; }
    if (j.hours === 6 || j.hours === 8) p.hours = j.hours;
    if (Number.isInteger(j.people) && (j.people as number) >= 1) { if ((j.people as number) > 10) p.handoff = 'big_group'; else p.people = j.people as number; }
    if (Number.isInteger(j.boat) && (j.boat as number) >= 1 && (j.boat as number) <= 10) p.boat = j.boat as number;
    if (j.price === true) p.wantsPrice = true;
    if (['tournament', 'custom', 'human', 'today'].includes(String(j.handoff))) p.handoff ??= j.handoff as Parsed['handoff'];
    return p;
  } catch (e) { console.log('assist ai error', String(e).slice(0, 120)); return null; }
}

/* ------------------------------------------------------------------ answers (templates; facts from D1) ------------------------------------------------------------------ */
const L = (en: string, fr: string, es: string): Record<Lang, string> => ({ en, fr, es });
const fmtDate = (d: string) => ({
  en: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  fr: new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  es: new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
});
const usd = (n: number) => `$${n.toLocaleString('en-US')} USD`;
const bookLink = (boat: string | null, c: Ctx) => '/book-now?' + new URLSearchParams({ ...(boat ? { boat } : {}), ...(c.date ? { date: c.date } : {}), ...(c.hours ? { hours: String(c.hours) } : {}), ...(c.people ? { people: String(c.people) } : {}) });
const boatAct = (b: { id: string; number: number; capacity: number }, c: Ctx): Act => ({ type: 'book', url: bookLink(b.id, c), label: L(`Book Boat #${b.number} (up to ${Math.min(b.capacity, 10)})`, `Réserver le bateau #${b.number} (jusqu'à ${Math.min(b.capacity, 10)})`, `Reservar el bote #${b.number} (hasta ${Math.min(b.capacity, 10)})`) });
const WA: Act = { type: 'whatsapp', label: L('WhatsApp', 'WhatsApp', 'WhatsApp') };
const tierTxt = (id: string) => { const n = tier(id); return n ? '$'.repeat(n) : ''; };

function join(parts: Record<Lang, string>[]): Record<Lang, string> {
  return { en: parts.map((x) => x.en).join('\n\n'), fr: parts.map((x) => x.fr).join('\n\n'), es: parts.map((x) => x.es).join('\n\n') };
}

export async function answer(env: AiEnv, d: D1Database, text: string, prev: Ctx, ip: string): Promise<Reply | null> {
  const today = localToday();
  let p = parse(text, today), source: Reply['source'] = 'rules';
  const understood = (x: Parsed) => !!(x.date || x.choices || x.pastDate || x.hours || x.people || x.boat || x.handoff || x.status);
  // the AI only fills what the rules could not read ("mes trois potes" = 4 people, "le jour de Noël" = 25 Dec…)
  const partial = !p.handoff && !p.status && (!(p.date || p.choices || p.pastDate) || p.people == null) && text.split(/\s+/).length >= 4;
  if (!understood(p) || partial) {
    const a = await aiParse(env, d, text, today);
    if (a && understood(a)) {
      const before = understood(p);
      for (const k of ['hours', 'people', 'boat', 'handoff'] as const) if (p[k] == null && a[k] != null) (p as Record<string, unknown>)[k] = a[k];
      if (!(p.date || p.choices || p.pastDate)) { if (a.date) p.date = a.date; else if (a.choices) p.choices = a.choices; else if (a.pastDate) p.pastDate = a.pastDate; }
      p.wantsPrice = p.wantsPrice || a.wantsPrice;
      if (!before || understood(p)) source = 'ai';
    }
  }
  const c: Ctx = { ...prev };
  for (const k of ['date', 'hours', 'people', 'boat'] as const) if (p[k] != null) (c as Record<string, unknown>)[k] = p[k];
  if (p.choices || p.pastDate) delete c.date;
  const out = (t: Record<Lang, string>, actions: Act[] = []): Reply => ({ text: t, actions, ctx: c, source });

  // hand-offs: the team answers on WhatsApp (the chat's WhatsApp button carries the conversation)
  if (p.handoff === 'tournament' || p.handoff === 'custom') return out(L('🏆 Tournaments and custom trips are arranged directly with our team. Tap WhatsApp — your request is already written, just press Send.', '🏆 Les tournois et sorties sur mesure s\'organisent directement avec notre équipe. Touchez WhatsApp — votre demande est déjà écrite, il suffit d\'envoyer.', '🏆 Los torneos y viajes a la medida se organizan directamente con nuestro equipo. Toca WhatsApp — tu solicitud ya está escrita, solo envíala.'), [WA]);
  if (p.handoff === 'today') return out(L('⏱️ Online booking closes 24 hours before departure. For a last-minute trip, message our team on WhatsApp — they will check what is possible.', '⏱️ La réservation en ligne ferme 24 h avant le départ. Pour une sortie de dernière minute, écrivez à notre équipe sur WhatsApp — elle vérifiera ce qui est possible.', '⏱️ La reserva en línea cierra 24 horas antes de la salida. Para un viaje de último minuto, escribe a nuestro equipo por WhatsApp — revisarán qué es posible.'), [WA]);
  if (p.handoff === 'big_group') return out(L('👥 Our boats take up to 10 people each. For a larger group our team can combine boats — message them on WhatsApp.', '👥 Nos bateaux prennent jusqu\'à 10 personnes chacun. Pour un groupe plus grand, notre équipe peut combiner plusieurs bateaux — écrivez-lui sur WhatsApp.', '👥 Nuestros botes llevan hasta 10 personas cada uno. Para un grupo más grande, nuestro equipo puede combinar botes — escríbeles por WhatsApp.'), [WA]);
  if (p.handoff === 'human') return out(L('🙋 Of course — our team answers on WhatsApp. Your question is already in the message, just press Send.', '🙋 Bien sûr — notre équipe répond sur WhatsApp. Votre question est déjà dans le message, il suffit d\'envoyer.', '🙋 Claro — nuestro equipo responde por WhatsApp. Tu pregunta ya está en el mensaje, solo envíalo.'), [WA]);
  if (p.status) return out(L(`🔒 For your privacy, booking ${p.status} is shown only through the private link in your booking email ("View your booking"). Can't find it? Message our team on WhatsApp.`, `🔒 Pour votre confidentialité, la réservation ${p.status} n'est visible que par le lien privé de votre email de réservation (« View your booking »). Introuvable ? Écrivez à notre équipe sur WhatsApp.`, `🔒 Por tu privacidad, la reserva ${p.status} solo se muestra con el enlace privado de tu correo de reserva ("View your booking"). ¿No lo encuentras? Escribe a nuestro equipo por WhatsApp.`), [WA]);
  if (p.choices) {
    const [a, b] = p.choices.map(fmtDate);
    return out(L(`📅 Just to be sure: do you mean ${a.en} or ${b.en}? Write the date with the month (e.g. "14 December").`, `📅 Pour être sûr : vous parlez du ${a.fr} ou du ${b.fr} ? Écrivez la date avec le mois (ex. « 14 décembre »).`, `📅 Para estar seguros: ¿te refieres al ${a.es} o al ${b.es}? Escribe la fecha con el mes (ej. "14 de diciembre").`));
  }
  if (p.pastDate) return out(L('📅 That date has already passed — which date would you like?', '📅 Cette date est déjà passée — quelle date souhaitez-vous ?', '📅 Esa fecha ya pasó — ¿qué fecha te gustaría?'));
  if (!understood(p) && !p.wantsPrice && !p.wantsBooking) return null; // nothing concrete: the chat keeps its own answer
  if (!(p.date || p.hours || p.people || p.boat || c.date || c.boat)) return null; // general price/booking question: the chat's own answer (from $350 / steps)
  if (p.wantsPrice && !c.date) return null; // "how much for 4 people?" → the chat's own price answer (From $350 / From $600, Book Now)

  const list = (await loadBoats(d)).filter((b) => b.active);
  const pref = c.boat ? list.find((b) => b.number === c.boat) : undefined;
  if (c.boat && !pref) return out(L(`🚤 Boat #${c.boat} cannot be booked online. Our boats are #1 to #10 — see them all on the boats page.`, `🚤 Le bateau #${c.boat} n'est pas réservable en ligne. Nos bateaux vont du #1 au #10 — voyez-les sur la page des bateaux.`, `🚤 El bote #${c.boat} no se puede reservar en línea. Nuestros botes van del #1 al #10 — míralos en la página de botes.`), [{ type: 'link', url: '/fishing-boats', label: L('🚤 See the boats', '🚤 Voir les bateaux', '🚤 Ver los botes') }]);
  if (pref && c.hours && !durationsOf(pref).includes(c.hours)) { const only = durationsOf(pref).join(' / '); return out(L(`🚤 Boat #${pref.number} offers ${only}-hour trips only.`, `🚤 Le bateau #${pref.number} propose uniquement des sorties de ${only} h.`, `🚤 El bote #${pref.number} solo ofrece viajes de ${only} horas.`)); }
  if (pref && c.people && c.people > Math.min(pref.capacity, 10)) { c.boat = undefined; return out(L(`👥 Boat #${pref.number} takes up to ${Math.min(pref.capacity, 10)} people. Tell me the date and duration and I'll find a boat for ${c.people}.`, `👥 Le bateau #${pref.number} prend jusqu'à ${Math.min(pref.capacity, 10)} personnes. Donnez-moi la date et la durée et je trouve un bateau pour ${c.people}.`, `👥 El bote #${pref.number} lleva hasta ${Math.min(pref.capacity, 10)} personas. Dime la fecha y la duración y busco un bote para ${c.people}.`)); }

  // ask only what is missing (date and duration are needed to check the calendar)
  if (pref && !c.hours && durationsOf(pref).length === 1) c.hours = durationsOf(pref)[0];
  const miss: Record<Lang, string>[] = [];
  if (!c.date) miss.push(L('the date', 'la date', 'la fecha'));
  if (!c.hours) miss.push(L('6 or 8 hours', '6 ou 8 heures', '6 u 8 horas'));
  if (!c.people) miss.push(L('how many people', 'le nombre de personnes', 'cuántas personas'));
  if (!c.date || !c.hours) {
    const lst = (lg: Lang) => miss.map((m) => m[lg]).join(', ');
    return out(L(`🎣 Happy to check the calendar! Please tell me ${lst('en')}.`, `🎣 Avec plaisir, je regarde le calendrier ! Dites-moi ${lst('fr')}.`, `🎣 ¡Con gusto reviso el calendario! Dime ${lst('es')}.`));
  }

  let o;
  try { o = await findOptions(d, { date: c.date, hours: c.hours, people: c.people ?? null, boat: pref?.id ?? null }); }
  catch (e) { console.log('assist options error', String(e).slice(0, 120)); return out(L('⚠️ I can\'t reach the booking calendar right now. Our team can check for you on WhatsApp.', '⚠️ Je n\'arrive pas à consulter le calendrier pour le moment. Notre équipe peut vérifier pour vous sur WhatsApp.', '⚠️ No puedo consultar el calendario en este momento. Nuestro equipo puede revisarlo por WhatsApp.'), [WA]); }
  const D = fmtDate(c.date), H = c.hours, P = c.people;
  // inside the 24-hour minimum notice: online booking is closed for that day → the team (last-minute trips)
  if (o.dateState === 'ok' && list.length && (await dayStates(d, (pref ?? list[0]).id, c.date, c.date))[c.date] === 'too_soon')
    return out(L(`⏱️ ${D.en} is less than 24 hours away, so it can't be booked online. For a last-minute trip, message our team on WhatsApp — your request is already written.`, `⏱️ Le ${D.fr} est dans moins de 24 h : il n'est plus réservable en ligne. Pour une sortie de dernière minute, écrivez à notre équipe sur WhatsApp — votre demande est déjà écrite.`, `⏱️ El ${D.es} es en menos de 24 horas, así que no se puede reservar en línea. Para un viaje de último minuto, escribe a nuestro equipo por WhatsApp — tu solicitud ya está escrita.`), [WA]);
  const group = (lg: Lang) => (P ? { en: `, ${P} ${P > 1 ? 'people' : 'person'}`, fr: `, ${P} personne${P > 1 ? 's' : ''}`, es: `, ${P} persona${P > 1 ? 's' : ''}` }[lg] : '');
  if (o.dateState !== 'ok') return out(L(`📅 ${D.en} cannot be booked online (bookings open from 24 hours to 12 months ahead). Our team can help on WhatsApp.`, `📅 Le ${D.fr} n'est pas réservable en ligne (de 24 h à 12 mois à l'avance). Notre équipe peut vous aider sur WhatsApp.`, `📅 El ${D.es} no se puede reservar en línea (de 24 horas a 12 meses de anticipación). Nuestro equipo puede ayudarte por WhatsApp.`), [WA]);

  // the boat asked for is free → its exact price (same rule as SHOW MY PRICE: boat + duration + date chosen; same anti-scraping limits)
  if (pref && o.preferred?.available) {
    const total = priceOf(pref, H);
    const showPrice = total != null && (await rateLimit(d, `quote:h:${ip}`, 40, 3600)) && (await rateLimit(d, `quote:d:${ip}`, 120, 86400));
    const pr = showPrice ? L(`Total charter price: **${usd(total!)}** — deposit ${usd(pref.deposit_usd)} online, balance ${usd(total! - pref.deposit_usd)} in cash on the day.`, `Prix total de la sortie : **${usd(total!)}** — acompte ${usd(pref.deposit_usd)} en ligne, solde ${usd(total! - pref.deposit_usd)} en espèces le jour même.`, `Precio total del viaje: **${usd(total!)}** — depósito ${usd(pref.deposit_usd)} en línea, saldo ${usd(total! - pref.deposit_usd)} en efectivo el día del viaje.`)
      : L('Tap the button to see your price.', 'Touchez le bouton pour voir votre prix.', 'Toca el botón para ver tu precio.');
    return out(join([L(`✅ Boat #${pref.number} (${pref.size_ft} ft, up to ${Math.min(pref.capacity, 10)} people) is available on ${D.en} for ${H === 8 ? "an" : "a"} ${H}-hour trip${group("en")}.`, `✅ Le bateau #${pref.number} (${pref.size_ft} ft, jusqu'à ${Math.min(pref.capacity, 10)} personnes) est disponible le ${D.fr} pour une sortie de ${H} h${group('fr')}.`, `✅ El bote #${pref.number} (${pref.size_ft} ft, hasta ${Math.min(pref.capacity, 10)} personas) está disponible el ${D.es} para un viaje de ${H} horas${group('es')}.`),
      pr, L('Nothing is reserved yet: your booking is confirmed only once your deposit has been received and verified — the booking form takes you through it.', 'Rien n\'est encore réservé : votre réservation n\'est confirmée qu\'une fois l\'acompte reçu et vérifié — le formulaire de réservation vous guide.', 'Aún no hay nada reservado: tu reserva se confirma solo cuando el depósito se ha recibido y verificado — el formulario de reserva te guía.')]), [boatAct({ id: pref.id, number: pref.number, capacity: pref.capacity }, c), WA]);
  }
  const head = pref ? L(`❌ Boat #${pref.number} is not available online on ${D.en} for ${H} hours${!o.preferred?.fits && P ? ` (it takes up to ${Math.min(pref.capacity, 10)} people)` : ''}.`, `❌ Le bateau #${pref.number} n'est pas disponible en ligne le ${D.fr} pour ${H} h${!o.preferred?.fits && P ? ` (il prend jusqu'à ${Math.min(pref.capacity, 10)} personnes)` : ''}.`, `❌ El bote #${pref.number} no está disponible en línea el ${D.es} por ${H} horas${!o.preferred?.fits && P ? ` (lleva hasta ${Math.min(pref.capacity, 10)} personas)` : ''}.`) : null;
  const others = o.boats.filter((x) => x.id !== pref?.id);
  if (others.length) {
    // recommendation: the boats that fit the group, closest size first (a 4-person group is not sent to the 10-person boat first)
    const pick = [...others].sort((a, b) => (P ? Math.min(a.capacity, 10) - Math.min(b.capacity, 10) : 0) || tier(a.id) - tier(b.id) || a.number - b.number).slice(0, 4);
    const lines = (lg: Lang) => pick.map((x) => `• ${lg === 'en' ? 'Boat' : lg === 'fr' ? 'Bateau' : 'Bote'} #${x.number} — ${x.sizeFt} ft, ${lg === 'en' ? 'up to' : lg === 'fr' ? 'jusqu\'à' : 'hasta'} ${Math.min(x.capacity, 10)} ${tierTxt(x.id)}`).join('\n');
    return out(join([...(head ? [head] : []), L(`🚤 Available on ${D.en}, ${H} hours${group('en')}:\n${lines('en')}`, `🚤 Disponibles le ${D.fr}, ${H} h${group('fr')} :\n${lines('fr')}`, `🚤 Disponibles el ${D.es}, ${H} horas${group('es')}:\n${lines('es')}`),
      P ? L('Tap a boat to see its price and book.', 'Touchez un bateau pour voir son prix et réserver.', 'Toca un bote para ver su precio y reservar.') : L('How many people will be aboard? I\'ll pick the right size.', 'Combien de personnes à bord ? Je vous indiquerai la bonne taille.', '¿Cuántas personas a bordo? Te diré el tamaño adecuado.')]), [...pick.map((x) => boatAct(x, c)), WA]);
  }
  if (o.nextDates.length) {
    const forBoat = o.nextDatesFor ? list.find((x) => x.id === o.nextDatesFor) : null;
    const lines = (lg: Lang) => o.nextDates.map((x) => `• ${fmtDate(x)[lg]}`).join('\n');
    return out(join([...(head ? [head] : []), L(`No boat is available online on ${D.en} for this request. Next available dates${forBoat ? ` for Boat #${forBoat.number}` : ''}:\n${lines('en')}`, `Aucun bateau n'est disponible en ligne le ${D.fr} pour cette demande. Prochaines dates disponibles${forBoat ? ` pour le bateau #${forBoat.number}` : ''} :\n${lines('fr')}`, `Ningún bote está disponible en línea el ${D.es} para esta solicitud. Próximas fechas disponibles${forBoat ? ` para el bote #${forBoat.number}` : ''}:\n${lines('es')}`)]),
      [...o.nextDates.slice(0, 3).map((x): Act => ({ type: 'book', url: bookLink(forBoat?.id ?? null, { ...c, date: x }), label: fmtDate(x) })), WA]);
  }
  return out(join([...(head ? [head] : []), L(`No boat is available online on ${D.en} for this request. Our team may still find a solution — message them on WhatsApp.`, `Aucun bateau n'est disponible en ligne le ${D.fr} pour cette demande. Notre équipe peut encore trouver une solution — écrivez-lui sur WhatsApp.`, `Ningún bote está disponible en línea el ${D.es} para esta solicitud. Nuestro equipo aún puede encontrar una solución — escríbeles por WhatsApp.`)]), [WA]);
}

/** POST /api/chat/assist {text, ctx} → {ok, reply} | {ok:false} (the chat then keeps its own answer). */
export async function apiAssist(request: Request, env: BEnv) {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; ctx?: Record<string, unknown> };
  const text = String(body.text ?? '').slice(0, 500).trim();
  if (!text) return json({ ok: false }, 400);
  const d = await db(env);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (!(await rateLimit(d, `assist:${ip}`, 60, 3600))) return json({ ok: false, error: 'rate' }, 429);
  const r = body.ctx || {};
  const prev: Ctx = {};
  if (typeof r.date === 'string' && isDate(r.date) && r.date >= localToday()) prev.date = r.date;
  if (r.hours === 6 || r.hours === 8) prev.hours = r.hours;
  if (Number.isInteger(r.people) && (r.people as number) >= 1 && (r.people as number) <= 10) prev.people = r.people as number;
  if (Number.isInteger(r.boat) && (r.boat as number) >= 1 && (r.boat as number) <= 10) prev.boat = r.boat as number;
  const reply = await answer(env as AiEnv, d, text, prev, ip);
  return json(reply ? { ok: true, reply } : { ok: false }, 200, { 'cache-control': 'no-store' });
}
export type { Boat };
