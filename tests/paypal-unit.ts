// PayPal gating and fee (owner 2026-11-09), pure functions. Usage: npx tsx tests/paypal-unit.ts
import { paypalMode, paypalPaymentsOn, paypalChargeCents } from '../worker/booking/paypal';
import { paypalEnabled } from '../worker/booking/envmode';
import { PRICING } from '../worker/booking/pricing';
import launch from '../src/data/launch.json';

const results: boolean[] = [];
const t = (name: string, ok: boolean, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info ? ' — ' + info : ''}`); };
const creds = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'WH' };

t('launch.json: PAYPAL_PAYMENTS_ENABLED is false (account not connected yet)', (launch as any).PAYPAL_PAYMENTS_ENABLED === false);
t('production today (no PayPal credentials) → mode off, checkout NOT possible', paypalMode({ SITE_ENV: 'production' }) === 'off' && !paypalPaymentsOn({ SITE_ENV: 'production' }));
t('production + live credentials but switch false → checkout NOT possible', !paypalPaymentsOn({ SITE_ENV: 'production', ...creds, PAYPAL_ENV: 'live', PAYPAL_LIVE: 'approved' }));
t('production + live credentials without PAYPAL_LIVE=approved → blocked', paypalMode({ SITE_ENV: 'production', ...creds, PAYPAL_ENV: 'live' }) === 'blocked');
t('production + sandbox credentials → blocked (never a sandbox checkout for real customers)', paypalMode({ SITE_ENV: 'production', ...creds, PAYPAL_ENV: 'sandbox' }) === 'blocked');
t('production + switch true + live + approved + webhook id → possible', paypalEnabled({ SITE_ENV: 'production' }, true) && paypalMode({ SITE_ENV: 'production', ...creds, PAYPAL_ENV: 'live', PAYPAL_LIVE: 'approved' }) === 'live');
t('missing webhook id → checkout NOT possible (webhook = backup confirmation path)', !paypalPaymentsOn({ SITE_ENV: 'staging', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's', PAYPAL_ENV: 'sandbox' }));
t('staging + sandbox credentials + webhook id → possible (tests only)', paypalPaymentsOn({ SITE_ENV: 'staging', ...creds, PAYPAL_ENV: 'sandbox' }));
t('unknown PAYPAL_ENV value → blocked', paypalMode({ SITE_ENV: 'staging', ...creds, PAYPAL_ENV: 'production' }) === 'blocked');
// fee = exactly 6 % of the deposit, in cents, for every deposit; balance never involved
const bad: string[] = [];
for (const [id, p] of Object.entries(PRICING)) {
  const c = paypalChargeCents(p.deposit, 6);
  if (c !== p.deposit * 100 + Math.round(p.deposit * 6)) bad.push(`${id}: ${c}`);
}
t('PayPal charge = deposit + 6 % of the deposit (exact cents) for all 10 boats', bad.length === 0, bad.join(', '));
t('rounding to the cent (odd deposits): $123 → $130.38, $99.99-like inputs never produce fractions of a cent', paypalChargeCents(123, 6) === 13038 && Number.isInteger(paypalChargeCents(77, 6)) && paypalChargeCents(77, 6) === 8162);
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
