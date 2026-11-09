// Transactional emails (Resend, already used by the contact form). Plain text + simple HTML.
// Owner rule (2026-11-06): the business receives ONE email per booking, only once it is CONFIRMED and paid
// Second trips the same day are requested on WhatsApp (REQUEST AVAILABILITY) and recorded by the owner (admin override).
// Public boat references use the boat number and size only ("Boat #3 (27 ft)") — never vessel or captain names.
// Never for pending/abandoned/canceled/expired/failed attempts. Only exception: money received for a booking that
// could not be confirmed (PAYMENT_EXCEPTION) — the owner must act (refund or move the date).
import { esc, usd, usdCents, longDate, localDateTime } from './util';

export type Res = {
  id: string; ref: string; token: string; boat_id: string; boat_name: string; boat_number: number; boat_size_ft: number; payment_ref?: string | null; payment_amount_cents?: number | null; payment_at?: string | null; terms_version?: string | null; date: string; hours: number; status: string;
  payment_method: 'stripe' | 'wise' | 'other'; total_usd: number; deposit_usd: number; balance_usd: number; fee_cents: number; charge_cents: number;
  first_name: string; last_name: string; email: string; phone: string; people: number; message: string; slot: number;
  hold_expires_at: string | null; is_test: number; created_at: string; updated_at: string;
  source: 'online' | 'phone' | 'override'; holds_slot: number; stripe_session_id: string | null; stripe_payment_intent: string | null;
  owner_notified_at: string | null; customer_notified_at: string | null; admin_note: string | null; lang: string | null; consent_at: string;
};
type Env = { RESEND_API_KEY?: string; CONTACT_TO?: string; CONTACT_FROM?: string };

const B = (r: Res) => `Boat #${r.boat_number} (${r.boat_size_ft} ft)`;
const PAY = (r: Res) => (r.payment_method === 'stripe' ? 'Card via Stripe' : r.payment_method === 'wise' ? 'Wise' : 'Received directly (verified by the owner)');
export const ADMIN_URL = 'https://fish-cabo.com/booking-admin';
export const WISE_PAY_URL = 'https://wise.com/pay/me/loict92'; // the Wise link already published on every boat page
const WHATSAPP = '+52 624 122 3506';

export async function sendEmail(env: Env, to: string, subject: string, text: string, html: string, replyTo?: string): Promise<{ ok: boolean; dryRun?: boolean; status?: number }> {
  if (!env.RESEND_API_KEY) return { ok: true, dryRun: true }; // local tests / unconfigured: nothing is sent (callers record it)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM || 'Exotic Fish Cabo <onboarding@resend.dev>', to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  }).catch(() => null);
  return { ok: !!r?.ok, status: r?.status };
}

const wrap = (title: string, body: string, foot = 'Exotic Fish Cabo · Puerto Los Cabos Marina, San José del Cabo, B.C.S., Mexico · fish-cabo.com') => `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:600px;margin:0 auto;padding:24px"><div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:.04em">EXOTIC FISH CABO</div>
<div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#666;text-align:center;margin-top:16px">${esc(foot)}</p></div></body></html>`;
const table = (rows: [string, string][]) => `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #eee;color:#555;width:42%">${esc(k)}</td><td style="padding:7px 8px;border-bottom:1px solid #eee;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>`;
const lines = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');
const test = (r: Res) => (r.is_test ? '[TEST] ' : '');

function tripRows(r: Res): [string, string][] {
  return [
    ['Booking reference', r.ref],
    ['Boat', B(r)],
    ['Fishing date', longDate(r.date)],
    ['Trip duration', `${r.hours} HOURS`],
    ['Total charter price', usd(r.total_usd)],
    ['Deposit', usd(r.deposit_usd) + (r.fee_cents ? ` + ${usdCents(r.fee_cents)} card processing fee` : '')],
    ['Remaining balance', usd(r.balance_usd)],
    ['Payment method', PAY(r)],
  ];
}
function customerRows(r: Res): [string, string][] {
  return [
    ['First name', r.first_name], ['Last name', r.last_name], ['Email', r.email], ['Phone', r.phone],
    ['Date', r.date], ['People aboard', String(r.people)], ['Duration', r.hours === 6 ? '3/4 day (6 hours)' : 'Full day (8 hours)'],
    ['Boat', B(r)], ['Message', r.message],
  ];
}

const DUR = (h: number) => `${h} HOURS`; // owner rule: trip duration always spelled out, never derived from the deposit

/** ONE owner email per verified deposit (all contact-form fields + booking details). Duration and the customer's
 * email address come first: the owner sends the official confirmation personally (owner decision 2026-11-08). */
export function ownerConfirmed(r: Res) {
  const email = r.email || '(no email given)';
  const card = r.payment_method === 'stripe';
  const received = r.payment_amount_cents ?? null; // what the payment record actually shows (Stripe amount_total or the amount the owner verified)
  const rows: [string, string][] = [
    ['TRIP DURATION', `${DUR(r.hours)} (${r.hours === 6 ? '3/4 day' : 'full day'})`],
    ['CUSTOMER EMAIL', email],
    ['Customer', `${r.first_name} ${r.last_name}`.trim()],
    ['Phone / WhatsApp', r.phone || '(not given)'],
    ['Status', 'CONFIRMED — deposit verified'],
    ['Booking reference', r.ref],
    ['Boat', B(r)],
    ['Fishing date', longDate(r.date)],
    ['People aboard', String(r.people)],
    ['Special requests / notes', r.message || '(none)'],
    ['Total charter price', usd(r.total_usd)],
    ['Required deposit', usdCents(r.deposit_usd * 100)],
    ['Deposit verified', card ? usdCents(r.deposit_usd * 100) : received != null ? usdCents(received) : '(amount not recorded)'],
    ['Card processing fee', card ? usdCents(r.fee_cents) : 'none'],
    ['Total charged to the customer', card ? (received != null ? usdCents(received) : usdCents(r.charge_cents)) : received != null ? usdCents(received) : '(amount not recorded)'],
    ['Remaining balance (cash on the fishing day)', usd(r.balance_usd)],
    ['Payment method', PAY(r)],
    ['Payment status', 'VERIFIED'],
    ['Verified at', r.payment_at ? localDateTime(r.payment_at) : '(not recorded)'],
    ['Transaction reference', r.payment_ref || r.stripe_payment_intent || '(not recorded)'],
    ['Booked via', r.source === 'online' ? 'Website' : r.source === 'phone' ? 'Owner (telephone booking)' : 'Owner (authorised second trip)'],
  ];
  const subject = `${test(r)}✅ CONFIRMED ${r.ref} — ${DUR(r.hours)} — Boat #${r.boat_number}, ${r.date}`;
  const text = `${test(r)}New CONFIRMED booking (deposit verified)\n\nTRIP DURATION: ${DUR(r.hours)}\nCUSTOMER EMAIL: ${email}\n\nThe customer received an automatic deposit receipt only. Send your official confirmation email personally.\n\n${lines(rows)}\n\nCustomer (contact form fields)\n${lines(customerRows(r))}\n\nManage: ${ADMIN_URL}`;
  const mail = r.email ? `<a href="mailto:${esc(r.email)}" style="color:#111">${esc(r.email)}</a>` : esc(email);
  const html = wrap('New confirmed booking — deposit verified', `<p style="font-size:22px;font-weight:800;margin:0 0 10px;padding:12px 14px;background:#fff3e0;border-left:5px solid #fb7704">TRIP DURATION: ${DUR(r.hours)}</p><p style="font-size:18px;font-weight:700;margin:0 0 6px;padding:12px 14px;background:#f4f1ea;border-left:5px solid #111;user-select:all">CUSTOMER EMAIL: ${mail}</p><p style="margin:0 0 16px;font-size:13px;color:#555">The customer received an automatic deposit receipt only. Send your official confirmation email personally.</p>${table(rows)}<h2 style="font-size:16px;margin:22px 0 8px">Customer</h2>${table(customerRows(r))}<p style="margin-top:20px"><a href="${ADMIN_URL}" style="color:#111">Open the booking dashboard</a></p>`);
  return { subject, text, html };
}

/** Automatic customer email after a verified deposit (owner decision 2026-11-08): a deposit RECEIPT only.
 * No meeting time, no marina directions, not the official confirmation (Loïc sends that one personally). */
export function customerDepositReceipt(r: Res) {
  const received = r.payment_method === 'stripe'
    ? `${usdCents(r.deposit_usd * 100)} (card payment of ${usdCents(r.charge_cents)} including the ${usdCents(r.fee_cents)} processing fee)`
    : usdCents(r.deposit_usd * 100);
  const rows: [string, string][] = [
    ['Booking reference', r.ref],
    ['Boat', `Boat #${r.boat_number}`],
    ['Trip date', longDate(r.date)],
    ['Trip duration', `${r.hours} hours`],
    ['Total charter price', usd(r.total_usd)],
    ['Deposit received', received],
    ['Remaining balance', usd(r.balance_usd)],
  ];
  const p1 = 'Thank you for your deposit. Your booking has been received and your fishing date has been reserved.';
  const p2 = 'Loïc from Exotic Fish Cabo will personally send you a separate official confirmation email containing your meeting time, meeting point, marina directions, and all necessary information for your fishing trip.';
  const p3 = 'Please wait for this personal confirmation email before making your way to the marina.';
  const text = `Dear ${r.first_name},\n\n${p1}\n\n${lines(rows)}\n\n${p2}\n\n${p3}\n\nQuestions? WhatsApp ${WHATSAPP} or https://fish-cabo.com/contact\n\nExotic Fish Cabo`;
  const html = wrap('Deposit received', `<p>Dear ${esc(r.first_name)},</p><p>${esc(p1)}</p>${table(rows)}<p style="margin-top:18px">${esc(p2)}</p><p><strong>${esc(p3)}</strong></p><p>Questions? WhatsApp ${WHATSAPP} or <a href="https://fish-cabo.com/contact">fish-cabo.com/contact</a></p><p>Exotic Fish Cabo</p>`, 'Exotic Fish Cabo · San José del Cabo, B.C.S., Mexico · fish-cabo.com'); // no marina in the receipt (meeting point comes from Loïc)
  return { subject: `${test(r)}Exotic Fish Cabo — Deposit Received`, text, html };
}

export const MARINA_URL = 'https://maps.app.goo.gl/CXbVM7vW1abnT1cbA';
/** Owner's official customer confirmation (wording kept exactly; only the bracketed values are replaced).
 * NOT sent automatically any more (owner decision 2026-11-08): Loïc sends it personally. Kept as the reference text,
 * shown pre-filled in /booking-admin so he can copy it. Protected by tests/fixtures/customer-confirmation-template.txt. */
export function customerConfirmed(r: Res) {
  const amount = `$${r.balance_usd.toLocaleString('en-US')}`;
  const text = `Dear ${r.first_name},

We're excited to confirm your fishing trip on ${longDate(r.date)}  a ${r.hours}-hour trip on our ${r.boat_size_ft} ft boat. Can't wait to get you out on the water!

A few quick tips before your trip:
- Bring sunscreen, a hat, and light layers, mornings on the water can be cool before the sun's fully up
- If you're prone to seasickness, consider taking motion sickness medication about an hour before departure
- Feel free to bring snacks and water, though we'll have some on board too

Logistics:
Please arrive at 6:30am at Puerto Los Cabos marina. Save this location now so it's easy to find on the day:Marina Location: ${MARINA_URL}

Once there, just ask for TORO, my partner, he'll be waiting to greet you and get you set up.

One practical note: there's no ATM at the marina, so please bring the following in cash to save time on trip day:
- Remaining balance: ${amount} USD
- Fishing license (if applicable): $20 USD/person over 12
- Live bait: $20-40 USD depending on target species

Bringing it all at once means more time fishing and less time running back into town.

We can't wait to have you aboard for an unforgettable day!

Best regards,
Loïc`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111"><div style="max-width:620px;white-space:pre-wrap">${esc(text).replace(esc(MARINA_URL), `<a href="${MARINA_URL}">${MARINA_URL}</a>`)}</div></body></html>`;
  return { subject: `${test(r)}Your Fishing Trip Confirmation – Exotic Fish Cabo`, text, html };
}

export function customerWisePending(r: Res) {
  const amount = usd(r.deposit_usd);
  const intro = `Hi ${r.first_name}, we have reserved ${B(r)} on ${longDate(r.date)} for you while we wait for your Wise deposit.`;
  const steps = `1. Pay ${amount} with Wise: ${WISE_PAY_URL}\n2. Write your booking reference ${r.ref} in the payment note.\n3. Once we have verified the payment, you receive a deposit receipt by email, and Loïc then sends you your official confirmation personally.\nThe date is held until ${localDateTime(r.hold_expires_at!)} (24 hours). After that it is released.`;
  return {
    subject: `${test(r)}Complete your deposit with Wise — ${r.ref}`,
    text: `${intro}\n\n${steps}\n\n${lines(tripRows(r))}`,
    html: wrap('Complete your deposit with Wise', `<p>${esc(intro)}</p><p style="white-space:pre-line">${esc(steps)}</p><p><a href="${WISE_PAY_URL}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Pay ${esc(amount)} with Wise</a></p>${table(tripRows(r))}`),
  };
}

/** Second trip recorded by the owner (admin override): the customer still has to pay the deposit; nothing is confirmed yet. */
export function customerPaymentRequest(r: Res, payUrl: string) {
  const intro = `Good news ${r.first_name}: we can take you out on ${B(r)} on ${longDate(r.date)} (${r.hours} hours). Pay your deposit to confirm the booking — the date is held for you until ${localDateTime(r.hold_expires_at!)}.`;
  const pay = r.payment_method === 'stripe'
    ? `Pay ${usdCents(r.charge_cents)} by card (deposit ${usd(r.deposit_usd)} + 6% card fee): ${payUrl}`
    : `Pay ${usd(r.deposit_usd)} with Wise: ${WISE_PAY_URL} — write ${r.ref} in the payment note.`;
  const btn = r.payment_method === 'stripe' ? payUrl : WISE_PAY_URL;
  return { subject: `${test(r)}Your date is available — pay your deposit (${r.ref})`, text: `${intro}\n\n${pay}\nYou receive a deposit receipt by email once the deposit is received.\n\n${lines(tripRows(r))}`, html: wrap('Your date is available', `<p>${esc(intro)}</p><p><a href="${btn}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Pay the deposit</a></p><p>${esc(pay)}</p><p>You receive a deposit receipt by email once the deposit is received.</p>${table(tripRows(r))}`) };
}

export function customerCanceled(r: Res, reason: string) {
  const intro = `Hi ${r.first_name}, your booking ${r.ref} (${B(r)}, ${longDate(r.date)}) has been canceled. ${reason}`;
  return { subject: `${test(r)}Booking canceled — ${r.ref}`, text: `${intro}\nQuestions? WhatsApp ${WHATSAPP}.`, html: wrap('Booking canceled', `<p>${esc(intro)}</p><p>Questions? WhatsApp ${WHATSAPP}.</p>`) };
}

export function customerWiseExpired(r: Res) {
  const intro = `Hi ${r.first_name}, we did not receive your Wise deposit for ${r.ref} within 24 hours, so the date has been released. If you already paid, reply to this email with your Wise receipt and we will sort it out.`;
  return { subject: `${test(r)}Reservation released — ${r.ref}`, text: intro, html: wrap('Reservation released', `<p>${esc(intro)}</p>`) };
}

/** Exceptions only (payment received for a date that is no longer available, etc.) — needs owner action. */
export function ownerException(r: Res, problem: string) {
  const head = 'ACTION REQUIRED — money was received but this booking is NOT confirmed. The customer has NOT received a deposit receipt. No automatic refund was made: refund the customer or offer another date yourself.';
  const rows: [string, string][] = [['CUSTOMER EMAIL', r.email || '(no email given)'], ['Status', `${r.status} — NOT CONFIRMED`], ['Payment reference', r.payment_ref || r.stripe_payment_intent || '(see Stripe)'], ...tripRows(r), ...customerRows(r)];
  return { subject: `${test(r)}⚠️ ACTION REQUIRED — payment received, booking NOT confirmed — ${r.ref}`, text: `${head}\n\n${problem}\n\n${lines(rows)}\n\n${ADMIN_URL}`, html: wrap('ACTION REQUIRED — booking NOT confirmed', `<p style="padding:12px 14px;background:#fee2e2;border-left:5px solid #b42318;font-weight:700">${esc(head)}</p><p><strong>${esc(problem)}</strong></p>${table(rows)}<p><a href="${ADMIN_URL}">${ADMIN_URL}</a></p>`) };
}
