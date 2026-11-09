// AUTHORITATIVE booking prices (owner-approved, 2026-11-08). SERVER-SIDE ONLY.
// Never import this file from src/ (pages, components, client scripts): the full grid must not reach the public HTML/JS.
// All amounts in whole USD. Deposit is fixed per boat, whatever the duration. Balance = total − deposit (cash on the day).
// null = duration NOT offered for that boat (Boat #1 = 6 hours only) → exactly 19 valid boat/duration combinations.
// These values seed the D1 database; after the first deploy the owner can adjust them in /booking-admin (with history).

export type BoatPrice = { deposit: number; 6: number | null; 8: number | null };

export const PRICING: Record<string, BoatPrice> = {
  'boat-01': { 6: 350, 8: null, deposit: 100 },
  'boat-02': { 6: 550, 8: 600, deposit: 200 },
  'boat-03': { 6: 680, 8: 800, deposit: 200 },
  'boat-04': { 6: 640, 8: 800, deposit: 200 },
  'boat-05': { 6: 1500, 8: 1800, deposit: 300 },
  'boat-06': { 6: 1400, 8: 1600, deposit: 400 },
  'boat-07': { 6: 1600, 8: 1900, deposit: 400 },
  'boat-08': { 6: 2700, 8: 3000, deposit: 500 },
  'boat-09': { 6: 3000, 8: 3500, deposit: 500 },
  'boat-10': { 6: 4500, 8: 5000, deposit: 1000 },
};

/** Card (Stripe) charge for a deposit, in cents: deposit + fee%, rounded to the nearest cent. */
export const cardChargeCents = (depositUsd: number, feePct: number) => Math.round(depositUsd * 100 * (1 + feePct / 100));
