// db.js — قاعدة البيانات (SQLite مدمجة في Node 22)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'company',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS companies (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  name TEXT NOT NULL,
  tax_id TEXT,
  commercial_reg TEXT,
  sectors TEXT NOT NULL DEFAULT '[]',
  products TEXT DEFAULT '',
  governorates TEXT NOT NULL DEFAULT '[]',
  employees TEXT DEFAULT '',
  founded_year INTEGER,
  certs TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  price_egp INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'شهرياً',
  features TEXT NOT NULL DEFAULT '[]',
  analyses_limit INTEGER NOT NULL DEFAULT 5
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ends_at TEXT,
  payment_ref TEXT,
  test_mode INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tenders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  entity TEXT NOT NULL,
  sector TEXT NOT NULL,
  governorate TEXT DEFAULT '',
  source_name TEXT NOT NULL,
  source_url TEXT DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'demo',
  snapshot_at TEXT,
  published_at TEXT,
  deadline_at TEXT,
  booklet_price REAL,
  insurance_initial REAL,
  estimated_value REAL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tender_id INTEGER REFERENCES tenders(id),
  filename TEXT NOT NULL,
  extracted TEXT NOT NULL,
  fit TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'portal',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  last_checked_at TEXT,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  meta TEXT DEFAULT '',
  ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  sector TEXT DEFAULT '',
  governorate TEXT DEFAULT '',
  note TEXT DEFAULT '',
  source TEXT DEFAULT 'digest',
  created_at TEXT NOT NULL
);
`);

// ترقية آمنة: أعمدة قياس استخدام التحليل (تُضاف مرة واحدة فقط)
try {
  const cols = db.prepare("PRAGMA table_info(analyses)").all().map(c => c.name);
  if (!cols.includes('pages')) db.exec('ALTER TABLE analyses ADD COLUMN pages INTEGER DEFAULT 0');
  if (!cols.includes('chars')) db.exec('ALTER TABLE analyses ADD COLUMN chars INTEGER DEFAULT 0');
  if (!cols.includes('cost_egp')) db.exec('ALTER TABLE analyses ADD COLUMN cost_egp REAL DEFAULT 0');
} catch (e) { /* الجدول يُنشأ في أول تشغيل */ }

const now = () => new Date().toISOString();

function logEvent(userId, type, meta = '') {
  db.prepare('INSERT INTO events (user_id, type, meta, ts) VALUES (?,?,?,?)')
    .run(userId ?? null, type, String(meta).slice(0, 500), now());
}

module.exports = { db, now, logEvent };
