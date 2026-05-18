import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { childLogger } from './common/logger.js';

const log = childLogger('db');

export const DB_PATH = resolve(process.cwd(), 'royaltaxi.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER UNIQUE,
  callsign TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  region TEXT,
  service TEXT,
  tariff TEXT,
  address TEXT,
  driver_name TEXT,
  car TEXT,
  client_phone TEXT,
  driver_phones TEXT,
  amount INTEGER,
  distance_km REAL,
  status TEXT,
  raw_text TEXT,
  is_driver_crook INTEGER DEFAULT 0,
  submission_time TEXT,
  finish_time TEXT,
  duration_sec INTEGER,
  fraud_score INTEGER DEFAULT 0,
  fraud_reasons TEXT,
  alerted_at TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_region ON orders(region);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_name);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_phone);
CREATE INDEX IF NOT EXISTS idx_orders_callsign ON orders(callsign);
CREATE INDEX IF NOT EXISTS idx_orders_distance ON orders(distance_km);
CREATE INDEX IF NOT EXISTS idx_orders_fraud ON orders(fraud_score);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  callsign TEXT,
  driver_name TEXT,
  fraud_type TEXT NOT NULL,
  fraud_score INTEGER NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  acknowledged INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_driver ON fraud_alerts(callsign);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON fraud_alerts(created_at);

CREATE TABLE IF NOT EXISTS driver_blocks (
  callsign TEXT PRIMARY KEY,
  driver_name TEXT,
  reason TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  alert_count INTEGER NOT NULL,
  blocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  applied INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_tick_at TEXT,
  tick_count INTEGER DEFAULT 0,
  site_total_today INTEGER DEFAULT 0,
  our_count_today INTEGER DEFAULT 0,
  started_at TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  last_error TEXT
);
INSERT OR IGNORE INTO monitor_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS site_monitor_state (
  site_id INTEGER PRIMARY KEY,
  last_tick_at TEXT,
  tick_count INTEGER DEFAULT 0,
  site_total_today INTEGER DEFAULT 0,
  our_count_today INTEGER DEFAULT 0,
  started_at TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS telegram_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  username TEXT,
  role TEXT DEFAULT 'viewer',
  regions TEXT,
  receive_alerts INTEGER DEFAULT 1,
  receive_daily_report INTEGER DEFAULT 1,
  receive_no_orders_alert INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

const MIGRATIONS = [
  "ALTER TABLE fraud_alerts ADD COLUMN action_taken TEXT",
  "ALTER TABLE fraud_alerts ADD COLUMN action_by TEXT",
  "ALTER TABLE fraud_alerts ADD COLUMN action_at TEXT",
  "ALTER TABLE fraud_alerts ADD COLUMN action_note TEXT",
  "ALTER TABLE orders ADD COLUMN is_driver_crook INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN submission_time TEXT",
  "ALTER TABLE orders ADD COLUMN finish_time TEXT",
  "ALTER TABLE orders ADD COLUMN duration_sec INTEGER",
  "ALTER TABLE orders ADD COLUMN fraud_score INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN fraud_reasons TEXT",
  "ALTER TABLE orders ADD COLUMN alerted_at TEXT",
  "ALTER TABLE orders ADD COLUMN source TEXT",
  "ALTER TABLE orders ADD COLUMN cancel_kind TEXT",
  "ALTER TABLE orders ADD COLUMN cancel_comment TEXT",
  "ALTER TABLE orders ADD COLUMN false_positive INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN site_id INTEGER",
  "ALTER TABLE fraud_alerts ADD COLUMN site_id INTEGER",
  "ALTER TABLE site_credentials ADD COLUMN use_proxy INTEGER DEFAULT 1",
  // Auto Подразделение Выбрать все — ba'zi loginlar uchun saytdagi default
  // filter allaqachon to'g'ri, qo'l tegmaslik kerak (1=ON, 0=OFF)
  "ALTER TABLE site_credentials ADD COLUMN auto_select_all INTEGER DEFAULT 1",
  // Duplicate alert oldini olish — bir order_id uchun faqat bitta fraud_alert
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_fraud_alerts_order_unique ON fraud_alerts(order_id)",
  // Region blacklist — noto'g'ri parse bo'lgan ko'cha/mahalla nomlarini bloklash
  `CREATE TABLE IF NOT EXISTS region_blacklist (
    name TEXT PRIMARY KEY,
    blocked_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  // Performance indexlar — 500K+ order uchun kerak
  "CREATE INDEX IF NOT EXISTS idx_orders_date_region ON orders(date, region)",
  "CREATE INDEX IF NOT EXISTS idx_orders_date_callsign ON orders(date, callsign)",
  "CREATE INDEX IF NOT EXISTS idx_orders_phone_date ON orders(client_phone, date)",
  "CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, date)",
  "CREATE INDEX IF NOT EXISTS idx_orders_cancel_date ON orders(cancel_kind, date) WHERE cancel_kind IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS idx_orders_callsign_date ON orders(callsign, date)",
  "CREATE INDEX IF NOT EXISTS idx_orders_site_date ON orders(site_id, date)",
  "CREATE INDEX IF NOT EXISTS idx_orders_amount ON orders(amount) WHERE amount > 0",
];

const NEW_TABLES = `
CREATE TABLE IF NOT EXISTS drivers (
  driver_id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  callsign TEXT,
  office_id TEXT,
  fleet_id TEXT,
  fleet_name TEXT,
  phones TEXT,
  balance INTEGER,
  on_shift INTEGER DEFAULT 0,
  lock_kind TEXT,
  lock_comment TEXT,
  reg_code TEXT,
  whitelisted INTEGER DEFAULT 0,
  raw_data TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_drivers_callsign ON drivers(callsign);
CREATE INDEX IF NOT EXISTS idx_drivers_fleet ON drivers(fleet_id);
CREATE INDEX IF NOT EXISTS idx_drivers_lock ON drivers(lock_kind);

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id TEXT PRIMARY KEY,
  fleet_id TEXT,
  brand TEXT,
  model TEXT,
  color TEXT,
  reg_number TEXT,
  driver_callsign TEXT,
  raw_data TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subsidies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT,
  callsign TEXT,
  driver_name TEXT,
  date TEXT,
  amount INTEGER,
  subsidy_name TEXT,
  tariff_name TEXT,
  order_id INTEGER,
  raw_data TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subsidies_driver ON subsidies(callsign);
CREATE INDEX IF NOT EXISTS idx_subsidies_date ON subsidies(date);

CREATE TABLE IF NOT EXISTS blacklist_mirror (
  number_id INTEGER PRIMARY KEY,
  phone TEXT,
  enabled INTEGER DEFAULT 1,
  raw_data TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lock_kinds (
  kind_id TEXT PRIMARY KEY,
  name TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  actor TEXT,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS site_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export interface OrderRow {
  order_id: number;
  callsign: string;
  date: string;
  time: string;
  region: string;
  service: string;
  tariff: string;
  address: string;
  driver_name: string;
  car: string;
  client_phone: string;
  driver_phones: string;
  amount: number | null;
  distance_km: number | null;
  status: string;
  raw_text: string;
  is_driver_crook: number;
  submission_time: string | null;
  finish_time: string | null;
  duration_sec: number | null;
  source: string | null;
  cancel_kind: string | null;
  cancel_comment: string | null;
}

export function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -524288'); // 512 MB sahifa kesh (sekin queries uchun)
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 1073741824'); // 1 GB memory-mapped IO
  db.pragma('wal_autocheckpoint = 1000'); // 1000 sahifaga yetganda checkpoint
  db.exec(SCHEMA);
  db.exec(NEW_TABLES);
  // idempotent migrations — ignore "duplicate column" errors
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch (err) {
      const msg = (err as Error).message;
      if (!msg.includes('duplicate column')) {
        log.warn({ sql, err: msg }, 'Migration skip');
      }
    }
  }
  // Default admin user — env'dagi TELEGRAM_CHAT_ID
  const envChatId = process.env.TELEGRAM_CHAT_ID;
  if (envChatId) {
    db.prepare(
      `INSERT OR IGNORE INTO telegram_users (chat_id, full_name, role, regions, receive_alerts, receive_daily_report, receive_no_orders_alert, is_active, note)
       VALUES (?, 'Bosh Admin', 'admin', NULL, 1, 1, 1, 1, ?)`,
    ).run(envChatId, '.env default admin');
  }
  log.info({ path: DB_PATH }, 'DB tayyor');
  return db;
}

export function insertOrder(db: Database.Database, o: OrderRow): 'inserted' | 'skipped' {
  const siteId = process.env.SITE_ID ? parseInt(process.env.SITE_ID, 10) : null;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO orders
      (order_id, callsign, date, time, region, service, tariff, address, driver_name, car,
       client_phone, driver_phones, amount, distance_km, status, raw_text,
       is_driver_crook, submission_time, finish_time, duration_sec,
       source, cancel_kind, cancel_comment, site_id)
    VALUES
      (@order_id, @callsign, @date, @time, @region, @service, @tariff, @address, @driver_name, @car,
       @client_phone, @driver_phones, @amount, @distance_km, @status, @raw_text,
       @is_driver_crook, @submission_time, @finish_time, @duration_sec,
       @source, @cancel_kind, @cancel_comment, @site_id)
  `);
  const res = stmt.run({ ...o, site_id: siteId });
  return res.changes > 0 ? 'inserted' : 'skipped';
}

export interface FraudAlert {
  order_id: number;
  callsign: string;
  driver_name: string;
  fraud_type: string;
  fraud_score: number;
  details: string;
}

/**
 * Returns 'inserted' for new alerts, 'duplicate' if order_id already alerted.
 * Duplicate'lar uchun Telegram yuborilmaydi (bitta zakaz uchun 5x duplicate
 * xabar muammosini hal qiladi).
 */
export function insertAlert(db: Database.Database, a: FraudAlert): 'inserted' | 'duplicate' {
  const siteId = process.env.SITE_ID ? parseInt(process.env.SITE_ID, 10) : null;
  // INSERT OR IGNORE — agar shu order_id uchun allaqachon alert bo'lsa, skip
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO fraud_alerts (order_id, callsign, driver_name, fraud_type, fraud_score, details, site_id)
     VALUES (@order_id, @callsign, @driver_name, @fraud_type, @fraud_score, @details, @site_id)`,
  );
  const result = stmt.run({ ...a, site_id: siteId });
  return result.changes > 0 ? 'inserted' : 'duplicate';
}

export function markOrderFraud(
  db: Database.Database,
  orderId: number,
  score: number,
  reasons: string[],
): void {
  db.prepare(
    `UPDATE orders SET fraud_score = ?, fraud_reasons = ?, alerted_at = CURRENT_TIMESTAMP
     WHERE order_id = ?`,
  ).run(score, reasons.join('; '), orderId);
}

export function updateMonitorState(
  db: Database.Database,
  patch: {
    tickIncrement?: boolean;
    siteTotalToday?: number;
    ourCountToday?: number;
    startedAt?: string;
    consecutiveErrors?: number;
    lastError?: string | null;
  },
): void {
  const parts: string[] = ['last_tick_at = CURRENT_TIMESTAMP'];
  const vals: unknown[] = [];
  if (patch.tickIncrement) parts.push('tick_count = tick_count + 1');
  if (patch.siteTotalToday !== undefined) {
    parts.push('site_total_today = ?');
    vals.push(patch.siteTotalToday);
  }
  if (patch.ourCountToday !== undefined) {
    parts.push('our_count_today = ?');
    vals.push(patch.ourCountToday);
  }
  if (patch.startedAt) {
    parts.push('started_at = ?');
    vals.push(patch.startedAt);
  }
  if (patch.consecutiveErrors !== undefined) {
    parts.push('consecutive_errors = ?');
    vals.push(patch.consecutiveErrors);
  }
  if (patch.lastError !== undefined) {
    parts.push('last_error = ?');
    vals.push(patch.lastError);
  }
  db.prepare(`UPDATE monitor_state SET ${parts.join(', ')} WHERE id = 1`).run(...vals);

  // Per-site monitor state (SITE_ID env'dan)
  const siteIdStr = process.env.SITE_ID;
  if (siteIdStr) {
    const siteId = parseInt(siteIdStr, 10);
    if (!isNaN(siteId)) {
      db.prepare(
        `INSERT INTO site_monitor_state (site_id, last_tick_at, tick_count, started_at)
         VALUES (?, CURRENT_TIMESTAMP, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           last_tick_at = CURRENT_TIMESTAMP,
           tick_count = tick_count + ${patch.tickIncrement ? 1 : 0},
           site_total_today = COALESCE(?, site_total_today),
           our_count_today = COALESCE(?, our_count_today),
           consecutive_errors = COALESCE(?, consecutive_errors),
           last_error = COALESCE(?, last_error)`,
      ).run(
        siteId,
        patch.tickIncrement ? 1 : 0,
        patch.startedAt ?? null,
        patch.siteTotalToday ?? null,
        patch.ourCountToday ?? null,
        patch.consecutiveErrors ?? null,
        patch.lastError ?? null,
      );
    }
  }
}

export function upsertDriverBlock(
  db: Database.Database,
  callsign: string,
  driverName: string,
  reason: string,
  totalScore: number,
  alertCount: number,
): void {
  db.prepare(
    `INSERT INTO driver_blocks (callsign, driver_name, reason, total_score, alert_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(callsign) DO UPDATE SET
       reason = excluded.reason,
       total_score = excluded.total_score,
       alert_count = excluded.alert_count,
       blocked_at = CURRENT_TIMESTAMP`,
  ).run(callsign, driverName, reason, totalScore, alertCount);
}

export function countOrders(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number };
  return row.c;
}

export function orderExists(db: Database.Database, callsign: string, date: string, time: string): boolean {
  const row = db.prepare('SELECT 1 FROM orders WHERE callsign = ? AND date = ? AND time = ?').get(
    callsign,
    date,
    time,
  );
  return !!row;
}
