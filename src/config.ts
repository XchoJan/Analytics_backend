import { db } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '../vbet-urls.json');

// Инициализируем таблицу для хранения ссылок
db.exec(`
  CREATE TABLE IF NOT EXISTS vbet_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Миграция: если таблица пустая, добавляем дефолтные ссылки
const existingUrls = db.prepare('SELECT COUNT(*) as count FROM vbet_urls').get() as { count: number };
if (existingUrls.count === 0) {
  const defaultUrls = [
    'https://sport.vbet.am/ru/sports/pre-match/event-view/Soccer/Europe/566/',
    'https://sport.vbet.am/ru/sports/pre-match/event-view/Soccer/Europe/1861',
    'https://sport.vbet.am/ru/sports/pre-match/event-view/Soccer/Europe/18278410',
  ];
  
  const insert = db.prepare('INSERT INTO vbet_urls (url) VALUES (?)');
  const insertMany = db.transaction((urls: string[]) => {
    for (const url of urls) {
      insert.run(url);
    }
  });
  
  insertMany(defaultUrls);
  console.log('[Config] Default vbet URLs initialized');
}

export function getVbetUrls(): string[] {
  const urls = db.prepare('SELECT url FROM vbet_urls ORDER BY id').all() as { url: string }[];
  return urls.map(u => u.url);
}

export function setVbetUrls(urls: string[]): void {
  // Удаляем все существующие ссылки
  db.prepare('DELETE FROM vbet_urls').run();
  
  // Добавляем новые ссылки
  const insert = db.prepare('INSERT INTO vbet_urls (url) VALUES (?)');
  const insertMany = db.transaction((urls: string[]) => {
    for (const url of urls) {
      if (url.trim()) {
        insert.run(url.trim());
      }
    }
  });
  
  insertMany(urls);
  console.log(`[Config] Updated vbet URLs: ${urls.length} URLs saved`);
}

