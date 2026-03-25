// backend/db/setup.js
// Run once: node backend/db/setup.js
// Creates all tables and seeds default data

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/nazrah.db');
const DATA_DIR = path.join(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── TABLES ─────────────────────────────────────────────────────

db.exec(`
  -- Snapshots of platform data (one row per fetch per platform)
  CREATE TABLE IF NOT EXISTS platform_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    platform    TEXT NOT NULL,          -- 'telegram' | 'website' | 'instagram_nazrahai' etc
    fetched_at  TEXT NOT NULL,          -- ISO timestamp
    data        TEXT NOT NULL,          -- JSON blob of all metrics
    raw_issues  TEXT                    -- JSON array of issue strings
  );

  -- Telegram post view history (individual post tracking)
  CREATE TABLE IF NOT EXISTS telegram_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_num    INTEGER NOT NULL,
    views       INTEGER NOT NULL,
    content     TEXT,
    post_type   TEXT,                   -- 'analysis' | 'repost' | 'cta' | 'image' | 'filler'
    fetched_at  TEXT NOT NULL,
    UNIQUE(post_num, fetched_at)
  );

  -- Revenue entries (manual + calculated)
  CREATE TABLE IF NOT EXISTS revenue_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stream      TEXT NOT NULL,          -- 'trading' | 'media' | 'nazrahai' | 'fashion'
    amount      INTEGER NOT NULL,
    month       TEXT NOT NULL,          -- 'YYYY-MM'
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tasks (auto-generated + manual)
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    detail      TEXT,
    priority    TEXT NOT NULL,          -- 'critical' | 'high' | 'maintenance'
    source      TEXT,                   -- 'telegram' | 'website' | 'fashion' | 'media' | 'trading'
    source_tag  TEXT,                   -- display label
    time_est    TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    auto        INTEGER NOT NULL DEFAULT 0,  -- 1 = auto-generated, 0 = manual
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    done_at     TEXT
  );

  -- Fetch log (every time the scheduler runs)
  CREATE TABLE IF NOT EXISTS fetch_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    success     INTEGER,
    platforms   TEXT,                   -- JSON list of platforms fetched
    tasks_generated INTEGER DEFAULT 0,
    error       TEXT
  );

  -- Settings (key-value)
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── SEED SETTINGS ──────────────────────────────────────────────

const defaults = {
  revenue_goal: '200000',
  goal_months: '6',
  monthly_target: '33333',
  last_fetch: '',
  telegram_channel: 'blockbullacademy',
  fashion_site: 'https://nazrahstudio.netlify.app',
  earned_total: '0',
};

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
`);

for (const [k, v] of Object.entries(defaults)) {
  insertSetting.run(k, v);
}

// ── SEED INITIAL TASKS (from real analysis) ────────────────────

const insertTask = db.prepare(`
  INSERT OR IGNORE INTO tasks (title, detail, priority, source, source_tag, time_est, auto)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const initialTasks = [
  ['Fix website browser tab title — currently says "Package"',
   'Confirmed from live fetch. Change to: "Nazrah Studio — AI Fashion Model Photography | 48hr Delivery"',
   'critical', 'website', 'Website Bug', '15 min', 0],

  ['Remove "Vision Beyond Trading" tagline from fashion website',
   'Trading brand tagline on a fashion site kills conversion. Change to: "AI Fashion. Real Results. 48 Hours."',
   'critical', 'website', 'Brand Fix', '10 min', 0],

  ['Fix base64 hero image on website — causes slow load',
   'Hero image is embedded as base64 in HTML. Upload to Cloudinary, replace with URL.',
   'critical', 'website', 'Website Speed', '20 min', 0],

  ['Fix Telegram IB funnel — remove broker-account gate',
   'Add ₹199/month direct Telegram sub as primary CTA. Keep Lirunex as secondary inside premium.',
   'critical', 'telegram', 'Funnel Fix', 'Strategy', 0],

  ['Lock Nazrah Media retainer with Anish — send proposal today',
   'You manage 3 IG + Telegram + Nazrah.AI. This is ₹10,000-15,000/month of work. Get it confirmed in writing.',
   'critical', 'media', 'Income Anchor', '1 hour', 0],

  ['Add pricing packages to nazrahstudio.netlify.app/pricing',
   'Starter ₹2,500 / Pro ₹5,000 / Campaign ₹9,000. Page is currently blank. Fix before any outreach.',
   'high', 'website', 'Website', '2 hours', 0],

  ['Generate 8 AI fashion portfolio samples and upload to site',
   'Use Midjourney or Leonardo.AI. Ethnic, streetwear, formal, activewear. Portfolio page is empty.',
   'high', 'fashion', 'AI Fashion', '3 hours', 0],

  ['DM 15 clothing boutiques on Instagram with website link',
   'Target: Guwahati local brands, Assam ethnic wear, Myntra/Meesho sellers. Offer first 3 photos free.',
   'high', 'fashion', 'Outreach', '45 min', 0],

  ['Define @growth_desk25 purpose — pivot to fashion or pause',
   '3 accounts with no differentiation dilutes energy. Recommended: pivot to AI Fashion showcase account.',
   'high', 'instagram', 'Instagram Strategy', '30 min', 0],

  ['Post Telegram poll today to reactivate algorithm reach',
   '"Gold this week — bullish or bearish? Vote ↓". Interactive posts boost channel reach immediately.',
   'maintenance', 'telegram', 'Daily', '5 min', 0],

  ['Post 1 quality analysis post on Telegram (max 1 today)',
   'Gold bias or retail sentiment format — your best performing content. Stop posting 5x/day.',
   'maintenance', 'telegram', 'Daily', '15 min', 0],

  ['Check WhatsApp (+91 6901260151) — respond to any fashion inquiry',
   'This is your only inbound sales channel right now. Respond within 30 minutes.',
   'maintenance', 'fashion', 'Daily', '2 min', 0],
];

for (const t of initialTasks) insertTask.run(...t);

console.log('✓ Database setup complete:', DB_PATH);
console.log('✓ Tables created: platform_snapshots, telegram_posts, revenue_entries, tasks, fetch_log, settings');
console.log('✓ Seeded', initialTasks.length, 'initial tasks');
console.log('\nNext: cp .env.example .env && npm start');

db.close();
