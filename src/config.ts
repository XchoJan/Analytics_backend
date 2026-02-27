import { db } from './db.js';

// Инициализируем таблицу для хранения ссылок
db.exec(`
  CREATE TABLE IF NOT EXISTS vbet_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

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

