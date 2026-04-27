const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'adserver.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS login_urls (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    login_url TEXT DEFAULT '',
    register_url TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS banners (
    id TEXT PRIMARY KEY,
    grp TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    click_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_banners_grp ON banners(grp);
  CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active);
`);

// Thêm cột brand_id nếu chưa có (ALTER TABLE không hỗ trợ IF NOT EXISTS)
try {
  db.exec(`ALTER TABLE banners ADD COLUMN brand_id TEXT REFERENCES brands(id)`);
} catch (e) {
  // Cột đã tồn tại — bỏ qua
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_banners_brand ON banners(brand_id);
`);

module.exports = db;
