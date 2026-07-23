/* db.js — SQLite 连接、建表、初始 seed
 * 使用 Node 22 内置 node:sqlite（DatabaseSync，同步 API，无需原生编译）。
 * 启动需带 --experimental-sqlite 标志（见 package.json scripts）。
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'tuyou.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'sales',
  secret     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  userName        TEXT,
  gender          TEXT,
  age             INTEGER,
  trip            TEXT,
  roomType        TEXT,
  checkIn         TEXT,
  checkOut        TEXT,
  preferredGender TEXT,
  contact         TEXT,
  salesNote       TEXT,
  note            TEXT,
  createdAt       TEXT,
  owner_id        TEXT,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS trips (
  id   TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id   TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS pairs (
  id         TEXT PRIMARY KEY,
  a          TEXT,
  b          TEXT,
  createdAt  TEXT,
  by_id      TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id     TEXT PRIMARY KEY,
  action TEXT,
  detail TEXT,
  at     TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_pairs_a ON pairs(a);
CREATE INDEX IF NOT EXISTS idx_pairs_b ON pairs(b);
`);

/* 单进程部署，WAL 可减少写锁冲突；失败也不影响功能 */
try { db.exec('PRAGMA journal_mode = WAL;'); } catch (_) { /* ignore */ }

/* 首次运行注入默认目录，避免团队进来看到空下拉 */
function seedCatalog() {
  const tCount = db.prepare('SELECT COUNT(*) c FROM trips').get().c;
  const rCount = db.prepare('SELECT COUNT(*) c FROM rooms').get().c;
  if (tCount === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO trips(id,name) VALUES(?,?)');
    ['成都', '重庆', '三亚', '云南', '西安', '厦门'].forEach((n, i) => ins.run('t-seed-' + i, n));
  }
  if (rCount === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO rooms(id,name) VALUES(?,?)');
    ['双床房', '大床房', '标间'].forEach((n, i) => ins.run('r-seed-' + i, n));
  }
}
seedCatalog();

/* 首次运行把管理员密码写入 settings（优先用环境变量 ADMIN_PASSWORD，否则默认 tuyou2026）；
 * 之后密码以 settings 表为准，支持在后台修改并持久化。 */
const pwSeed = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get();
if (!pwSeed) {
  const initPw = process.env.ADMIN_PASSWORD || 'tuyou2026';
  db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(initPw);
}

module.exports = { db };
