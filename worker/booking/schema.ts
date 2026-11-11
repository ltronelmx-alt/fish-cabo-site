// D1 schema + migrations for the booking engine. Applied automatically (idempotent) on first use, so no manual
// database step is needed after deploy. Each migration runs once; the applied version is stored in `meta`.
import catalogue from '../../src/data/boats.json';
import { PRICING } from './pricing';

type Boat = { id: string; number: number; name: string; sizeFt: number; slug: string; url: string; capacity: number };

const M1 = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS boats (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL, slug TEXT NOT NULL, url TEXT NOT NULL,
  size_ft INTEGER NOT NULL, capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 20), deposit_usd INTEGER NOT NULL CHECK (deposit_usd > 0),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS prices (
  boat_id TEXT NOT NULL REFERENCES boats(id), hours INTEGER NOT NULL CHECK (hours IN (6, 8)),
  price_usd INTEGER CHECK (price_usd IS NULL OR price_usd > 0), updated_at TEXT NOT NULL, PRIMARY KEY (boat_id, hours)
);
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, boat_id TEXT NOT NULL, field TEXT NOT NULL, old_value INTEGER, new_value INTEGER,
  changed_at TEXT NOT NULL, changed_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS blocked_dates (
  boat_id TEXT NOT NULL, date TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL, PRIMARY KEY (boat_id, date)
);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, token TEXT NOT NULL,
  boat_id TEXT NOT NULL REFERENCES boats(id), date TEXT NOT NULL, hours INTEGER NOT NULL CHECK (hours IN (6, 8)),
  slot INTEGER NOT NULL DEFAULT 0, holds_slot INTEGER NOT NULL DEFAULT 0, hold_expires_at TEXT,
  status TEXT NOT NULL, payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'wise', 'other')), -- other = deposit received outside the site (phone booking, verified by the owner)
  total_usd INTEGER NOT NULL, deposit_usd INTEGER NOT NULL, balance_usd INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0, charge_cents INTEGER NOT NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, people INTEGER NOT NULL,
  message TEXT NOT NULL, consent_at TEXT NOT NULL, terms_version TEXT, lang TEXT,
  stripe_session_id TEXT, stripe_payment_intent TEXT, is_test INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'online', -- 'online' (customer on the website) | 'phone' (owner, telephone customer) | 'override' (second trip authorised by the owner)
  owner_notified_at TEXT, customer_notified_at TEXT, expiry_notified_at TEXT, admin_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- one active booking per boat, date and slot (slot 0 = the normal daily trip; >0 only after the owner approves an extra trip)
CREATE UNIQUE INDEX IF NOT EXISTS res_active_slot ON reservations (boat_id, date, slot) WHERE holds_slot = 1;
CREATE INDEX IF NOT EXISTS res_date ON reservations (date);
CREATE INDEX IF NOT EXISTS res_status ON reservations (status);
CREATE INDEX IF NOT EXISTS res_hold ON reservations (hold_expires_at) WHERE holds_slot = 1;
CREATE UNIQUE INDEX IF NOT EXISTS res_stripe_session ON reservations (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reservation_id TEXT NOT NULL, provider TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL, status TEXT NOT NULL, external_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, type TEXT NOT NULL, reservation_id TEXT, result TEXT, received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  reservation_id TEXT, details TEXT
);
CREATE INDEX IF NOT EXISTS audit_res ON audit_log (reservation_id);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reservation_id TEXT, kind TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL,
  status TEXT NOT NULL, at TEXT NOT NULL, body TEXT -- exact text sent (shown in the dashboard)
);
CREATE INDEX IF NOT EXISTS email_res ON email_log (reservation_id);
CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, window_start INTEGER NOT NULL);
`;

const MIGRATIONS = [M1];

const DEFAULT_SETTINGS: Record<string, string> = {
  min_lead_hours: '24', // owner: bookings at least 24 h before departure
  departure_hour_local: '6', // owner: customers arrive at 6:30 AM (customer email) → reference departure 6:30 local for the 24 h rule
  departure_minute_local: '30',
  booking_window_days: '365',
  stripe_fee_pct: '6', // owner: card deposits = deposit + 6 %
  stripe_hold_minutes: '35', // Stripe Checkout sessions expire after 30 min (minimum allowed by Stripe)
  wise_hold_hours: '24', // owner: a Wise booking keeps the date for 24 h while the payment is verified
  override_hold_hours: '48', // second trip recorded by the owner: the customer has 48 h to pay the deposit
  paypal_fee_pct: '6', // owner 2026-11-09: PayPal deposits = deposit + 6 % (fee on the deposit only, never on the balance)
  paypal_hold_minutes: '45', // date held while the customer approves the PayPal payment (nothing is captured before approval)
};

let ready = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (ready) return;
  let version = 0;
  try {
    const r = await db.prepare(`SELECT v FROM meta WHERE k = 'schema_version'`).first<{ v: string }>();
    version = r ? Number(r.v) : 0;
  } catch { version = 0; }
  for (let i = version; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i].replace(/^\s*--.*$/gm, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
    await db.prepare(`INSERT INTO meta (k, v) VALUES ('schema_version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(String(i + 1)).run();
  }
  await seed(db);
  await importManualBookings(db);
  await fixManualBookings(db);
  ready = true;
}

/** Reservations the owner took by hand BEFORE online booking (owner, 2026-11-08). No customer, price or payment is
 * invented: each one is a blocked day for that boat, labelled MANUAL BOOKING (unavailable on /book-now, visible in
 * /booking-admin). Runs once per database; skips a day that already has a booking or a block. No email, no charge. */
export const MANUAL_BOOKINGS: { boat: string; date: string; client: string }[] = [
  { boat: 'boat-02', date: '2026-11-21', client: 'Bubenik' }, // owner 2026-11-10: the 21st, not the 26th
  { boat: 'boat-04', date: '2026-12-15', client: 'Guard' },
  { boat: 'boat-06', date: '2027-01-19', client: 'Rademacher' },
];
export const MANUAL_REASON = 'MANUAL BOOKING — taken by the owner before online booking (imported 2026-11-08)';
export const manualReason = (client: string) => `MANUAL BOOKING — ${client} (taken by the owner before online booking)`;
/** Client name of a MANUAL BOOKING block, if the reason carries one. */
export const manualClient = (reason: string) => (/^MANUAL BOOKING — ([^(]+?) \(taken by the owner/.exec(reason) || [])[1] || '';
async function importManualBookings(db: D1Database) {
  const KEY = 'import:manual-bookings-2026-11-08';
  if (await db.prepare(`SELECT 1 FROM meta WHERE k = ?`).bind(KEY).first()) return;
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const result: Record<string, string> = {};
  for (const m of MANUAL_BOOKINGS) {
    const res = await db.prepare(`SELECT ref FROM reservations WHERE boat_id = ? AND date = ? AND holds_slot = 1 LIMIT 1`).bind(m.boat, m.date).first<{ ref: string }>();
    const blk = await db.prepare(`SELECT reason FROM blocked_dates WHERE boat_id IN (?, '*') AND date = ? LIMIT 1`).bind(m.boat, m.date).first();
    if (res || blk) { result[`${m.boat} ${m.date}`] = res ? `skipped: booking ${res.ref} exists` : 'skipped: already blocked'; continue; }
    stmts.push(db.prepare(`INSERT OR IGNORE INTO blocked_dates (boat_id, date, reason, created_at) VALUES (?, ?, ?, ?)`).bind(m.boat, m.date, manualReason(m.client), now));
    result[`${m.boat} ${m.date}`] = 'imported';
  }
  stmts.push(db.prepare(`INSERT INTO audit_log (at, actor, action, reservation_id, details) VALUES (?, 'system', 'import_manual_bookings', NULL, ?)`).bind(now, JSON.stringify(result)));
  stmts.push(db.prepare(`INSERT INTO meta (k, v) VALUES (?, ?)`).bind(KEY, now));
  await db.batch(stmts);
}

/** Owner correction 2026-11-10 (runs once per database): boat #2 manual booking is on 21 Nov 2026, not the 26th,
 * and the three manual bookings carry the client's name (Bubenik, Guard, Rademacher). Only MANUAL BOOKING blocks are
 * touched; a day that already holds an online booking is never blocked over (the conflict is logged). No email, no charge. */
async function fixManualBookings(db: D1Database) {
  const KEY = 'fix:manual-bookings-2026-11-10';
  if (await db.prepare(`SELECT 1 FROM meta WHERE k = ?`).bind(KEY).first()) return;
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  const stmts: D1PreparedStatement[] = [];
  // the wrong day (26 Nov) is released only if it is the imported manual block
  const wrong = await db.prepare(`SELECT reason FROM blocked_dates WHERE boat_id = 'boat-02' AND date = '2026-11-26'`).first<{ reason: string }>();
  if (wrong && /^MANUAL BOOKING/.test(wrong.reason)) { stmts.push(db.prepare(`DELETE FROM blocked_dates WHERE boat_id = 'boat-02' AND date = '2026-11-26' AND reason LIKE 'MANUAL BOOKING%'`)); result['boat-02 2026-11-26'] = 'released (wrong day)'; }
  for (const m of MANUAL_BOOKINGS) {
    const res = await db.prepare(`SELECT ref FROM reservations WHERE boat_id = ? AND date = ? AND holds_slot = 1 LIMIT 1`).bind(m.boat, m.date).first<{ ref: string }>();
    const blk = await db.prepare(`SELECT reason FROM blocked_dates WHERE boat_id = ? AND date = ?`).bind(m.boat, m.date).first<{ reason: string }>();
    if (blk && /^MANUAL BOOKING/.test(blk.reason)) { stmts.push(db.prepare(`UPDATE blocked_dates SET reason = ? WHERE boat_id = ? AND date = ?`).bind(manualReason(m.client), m.boat, m.date)); result[`${m.boat} ${m.date}`] = 'named'; continue; }
    if (blk) { result[`${m.boat} ${m.date}`] = 'kept: already blocked by the owner'; continue; }
    if (res) { result[`${m.boat} ${m.date}`] = `CONFLICT: online booking ${res.ref} exists — not blocked`; continue; }
    stmts.push(db.prepare(`INSERT OR IGNORE INTO blocked_dates (boat_id, date, reason, created_at) VALUES (?, ?, ?, ?)`).bind(m.boat, m.date, manualReason(m.client), now));
    result[`${m.boat} ${m.date}`] = 'blocked';
  }
  stmts.push(db.prepare(`INSERT INTO audit_log (at, actor, action, reservation_id, details) VALUES (?, 'system', 'fix_manual_bookings', NULL, ?)`).bind(now, JSON.stringify(result)));
  stmts.push(db.prepare(`INSERT INTO meta (k, v) VALUES (?, ?)`).bind(KEY, now));
  await db.batch(stmts);
}

async function seed(db: D1Database) {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const b of (catalogue as { boats: Boat[] }).boats) {
    const p = PRICING[b.id];
    if (!p) throw new Error(`No price configuration for ${b.id}`);
    // boats: insert once; never overwrite values the owner edited in the dashboard
    stmts.push(db.prepare(`INSERT OR IGNORE INTO boats (id, number, name, slug, url, size_ft, capacity, deposit_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(b.id, b.number, b.name, b.slug, b.url, b.sizeFt, b.capacity, p.deposit));
    for (const h of [6, 8] as const) {
      // price rows: inserted once; an empty price from an earlier seed is filled with the approved price (never overwrites an owner edit)
      stmts.push(db.prepare(`INSERT INTO prices (boat_id, hours, price_usd, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(boat_id, hours) DO UPDATE SET price_usd = excluded.price_usd, updated_at = excluded.updated_at WHERE prices.price_usd IS NULL AND excluded.price_usd IS NOT NULL`).bind(b.id, h, p[h], now));
    }
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) stmts.push(db.prepare(`INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)`).bind(k, v));
  await db.batch(stmts);
}

export async function getSettings(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare(`SELECT k, v FROM settings`).all<{ k: string; v: string }>();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) out[k] = Number(v);
  for (const r of results) out[r.k] = Number(r.v);
  return out;
}

/** PayPal columns (owner 2026-11-09). The original table only accepts payment_method stripe | wise | other, and SQLite
 * cannot change a CHECK in place, so the table is rebuilt ONCE, in ONE atomic batch (all or nothing), keeping every row
 * and index. It runs only when PayPal credentials are installed (see core.db) or right before the first PayPal booking —
 * never while PayPal is not connected. Idempotent: does nothing once the table accepts 'paypal'. */
const RES_COLUMNS = `id, ref, token, boat_id, date, hours, slot, holds_slot, hold_expires_at, status, payment_method, total_usd, deposit_usd, balance_usd,
  fee_cents, charge_cents, first_name, last_name, email, phone, people, message, consent_at, terms_version, lang, stripe_session_id, stripe_payment_intent,
  is_test, source, owner_notified_at, customer_notified_at, expiry_notified_at, admin_note, created_at, updated_at`;
let paypalReady = false;
export async function paypalSchemaReady(db: D1Database): Promise<boolean> {
  if (paypalReady) return true;
  const t = await db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reservations'`).first<{ sql: string }>();
  paypalReady = !!t && t.sql.includes(`'paypal'`) && t.sql.includes('paypal_capture_id');
  return paypalReady;
}
export async function ensurePaypalSchema(db: D1Database): Promise<void> {
  if (await paypalSchemaReady(db)) return;
  const now = new Date().toISOString();
  const n = await db.prepare(`SELECT COUNT(*) n FROM reservations`).first<{ n: number }>();
  await db.batch([
    db.prepare(`DROP TABLE IF EXISTS reservations_pp`),
    db.prepare(`CREATE TABLE reservations_pp (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, token TEXT NOT NULL,
  boat_id TEXT NOT NULL REFERENCES boats(id), date TEXT NOT NULL, hours INTEGER NOT NULL CHECK (hours IN (6, 8)),
  slot INTEGER NOT NULL DEFAULT 0, holds_slot INTEGER NOT NULL DEFAULT 0, hold_expires_at TEXT,
  status TEXT NOT NULL, payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'wise', 'paypal', 'other')),
  total_usd INTEGER NOT NULL, deposit_usd INTEGER NOT NULL, balance_usd INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0, charge_cents INTEGER NOT NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, people INTEGER NOT NULL,
  message TEXT NOT NULL, consent_at TEXT NOT NULL, terms_version TEXT, lang TEXT,
  stripe_session_id TEXT, stripe_payment_intent TEXT, is_test INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'online',
  owner_notified_at TEXT, customer_notified_at TEXT, expiry_notified_at TEXT, admin_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  paypal_order_id TEXT, paypal_capture_id TEXT
)`),
    db.prepare(`INSERT INTO reservations_pp (${RES_COLUMNS}) SELECT ${RES_COLUMNS} FROM reservations`),
    db.prepare(`DROP TABLE reservations`),
    db.prepare(`ALTER TABLE reservations_pp RENAME TO reservations`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS res_active_slot ON reservations (boat_id, date, slot) WHERE holds_slot = 1`),
    db.prepare(`CREATE INDEX IF NOT EXISTS res_date ON reservations (date)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS res_status ON reservations (status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS res_hold ON reservations (hold_expires_at) WHERE holds_slot = 1`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS res_stripe_session ON reservations (stripe_session_id) WHERE stripe_session_id IS NOT NULL`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS res_paypal_order ON reservations (paypal_order_id) WHERE paypal_order_id IS NOT NULL`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS res_paypal_capture ON reservations (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL`),
    db.prepare(`INSERT INTO audit_log (at, actor, action, reservation_id, details) VALUES (?, 'system', 'schema_paypal', NULL, ?)`).bind(now, JSON.stringify({ rowsKept: n?.n ?? 0 })),
  ]);
  paypalReady = false;
  if (!(await paypalSchemaReady(db))) throw new Error('PayPal schema migration did not apply');
}
