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
  ready = true;
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
