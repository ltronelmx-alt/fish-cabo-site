// Renders the booking emails with sample data (no network): npx esbuild scripts/render-emails.ts --bundle --platform=node --format=esm --outfile=/tmp/re.mjs && node /tmp/re.mjs
// Output: docs/email-samples/*.html + *.txt — for the owner to read the exact emails before launch.
import * as M from '../worker/booking/emails';
import { writeFileSync } from 'node:fs';
const base: any = { id: 'x', ref: 'EFC-7KQ2MZ', token: '', boat_id: 'boat-03', boat_name: '27ft Premium Center Console', boat_number: 3, boat_size_ft: 27, date: '2026-12-11', hours: 8, status: 'CONFIRMED',
  payment_method: 'stripe', total_usd: 800, deposit_usd: 200, balance_usd: 600, fee_cents: 1200, charge_cents: 21200, first_name: 'Ana', last_name: 'Ux', email: 'ana@example.com', phone: '+1 555 000 2222',
  people: 3, message: 'Two kids aboard', slot: 0, hold_expires_at: null, is_test: 1, created_at: '', updated_at: '', source: 'online', holds_slot: 1, stripe_session_id: 'cs_test_1', stripe_payment_intent: 'pi_test_3Q1',
  owner_notified_at: null, customer_notified_at: null, admin_note: null, lang: 'en', consent_at: '', payment_ref: 'pi_test_3Q1', payment_amount_cents: 21200, payment_at: '2026-11-09T03:12:00.000Z' };
const out: Record<string, { subject: string; html: string; text: string }> = {
  'owner-stripe': M.ownerConfirmed(base),
  'owner-wise': M.ownerConfirmed({ ...base, payment_method: 'wise', fee_cents: 0, charge_cents: 20000, payment_ref: 'Wise TR-88213', payment_amount_cents: 20000 }),
  'owner-missing': M.ownerConfirmed({ ...base, source: 'phone', payment_method: 'other', email: '', message: '', fee_cents: 0, charge_cents: 20000, payment_ref: 'cash', payment_amount_cents: 20000 }),
  'customer-receipt': M.customerDepositReceipt(base),
  'owner-exception': M.ownerException({ ...base, status: 'PAYMENT_EXCEPTION' }, 'Deposit received after the reservation had expired, and the date is no longer available. Please refund the customer or offer another date.'),
};
for (const [k, v] of Object.entries(out)) { writeFileSync(`docs/email-samples/${k}.html`, v.html); writeFileSync(`docs/email-samples/${k}.txt`, `SUBJECT: ${v.subject}\n\n${v.text}`); }
