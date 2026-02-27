import "dotenv/config";
import { db } from "../db.js";
import bcrypt from "bcrypt";

const username = "Analyses_admin1101";
const password = "Kalbas1101!";

// Проверяем, существует ли пользователь
const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);

if (existing) {
  console.log(`[createAdmin] Пользователь ${username} уже существует`);
  process.exit(0);
}

// Хэшируем пароль
const hashedPassword = bcrypt.hashSync(password, 10);

// Создаем администратора
const result = db
  .prepare(
    `INSERT INTO users (username, password, role, premium, premiumUntil, lastPredictionDate) VALUES (?, ?, 'admin', 1, NULL, NULL)`
  )
  .run(username, hashedPassword);

console.log(`[createAdmin] Администратор создан успешно!`);
console.log(`[createAdmin] ID: ${result.lastInsertRowid}`);
console.log(`[createAdmin] Username: ${username}`);
console.log(`[createAdmin] Role: admin`);
console.log(`[createAdmin] Premium: true`);

process.exit(0);

