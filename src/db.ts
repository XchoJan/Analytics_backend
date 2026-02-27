import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../database.sqlite');
export const db = new Database(dbPath);

// Создаем таблицу пользователей
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    premium INTEGER NOT NULL DEFAULT 0,
    premiumUntil TEXT,
    lastPredictionDate TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Миграция: добавляем новые поля, если их нет
try {
  db.exec(`
    ALTER TABLE users ADD COLUMN premiumUntil TEXT;
  `);
} catch (e: any) {
  // Поле уже существует, игнорируем ошибку
  if (!e.message.includes('duplicate column name')) {
    console.warn('[DB] Migration warning:', e.message);
  }
}

try {
  db.exec(`
    ALTER TABLE users ADD COLUMN lastPredictionDate TEXT;
  `);
} catch (e: any) {
  // Поле уже существует, игнорируем ошибку
  if (!e.message.includes('duplicate column name')) {
    console.warn('[DB] Migration warning:', e.message);
  }
}

// Создаем таблицу платежей
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    plan TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    cryptomusOrderId TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`);

console.log('[DB] Database initialized');

