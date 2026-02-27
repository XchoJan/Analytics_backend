import { db } from '../db.js';
import bcrypt from 'bcrypt';

export interface User {
  id: number;
  username: string;
  password: string;
  role: 'user' | 'admin';
  premium: boolean;
  premiumUntil: string | null;
  lastPredictionDate: string | null;
  createdAt: string;
}

export interface UserPublic {
  id: number;
  username: string;
  role: 'user' | 'admin';
  premium: boolean;
  premiumUntil: string | null;
  createdAt: string;
}

export function createUser(username: string, password: string): UserPublic {
  // Проверяем, существует ли пользователь
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as User | undefined;
  if (existing) {
    throw new Error('USERNAME_EXISTS');
  }

  // Хэшируем пароль
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Создаем пользователя
  const result = db.prepare(`
    INSERT INTO users (username, password, role, premium, premiumUntil, lastPredictionDate)
    VALUES (?, ?, 'user', 0, NULL, NULL)
  `).run(username, hashedPassword);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    premium: Boolean(user.premium),
    premiumUntil: user.premiumUntil,
    createdAt: user.createdAt,
  };
}

export function findUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function findUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function verifyPassword(password: string, hashedPassword: string): boolean {
  return bcrypt.compareSync(password, hashedPassword);
}

export function updateLastPredictionDate(userId: number): void {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  db.prepare('UPDATE users SET lastPredictionDate = ? WHERE id = ?').run(today, userId);
}

export function canUsePrediction(user: User): boolean {
  // Проверяем, активна ли premium подписка
  const now = new Date();
  if (user.premiumUntil) {
    const premiumUntil = new Date(user.premiumUntil);
    if (premiumUntil > now) {
      // Premium подписка активна - можно использовать без ограничений
      return true;
    }
  }

  // Если premium не активна, проверяем лимит для не-premium пользователей
  // Не-premium пользователи могут использовать только 1 раз в день
  if (!user.lastPredictionDate) {
    return true;
  }

  const today = new Date().toISOString().split('T')[0];
  return user.lastPredictionDate !== today;
}

export function updateUserPremiumStatus(userId: number, premiumUntil: string | null): void {
  const premium = premiumUntil ? 1 : 0;
  db.prepare(`
    UPDATE users 
    SET premium = ?, premiumUntil = ? 
    WHERE id = ?
  `).run(premium, premiumUntil, userId);
}
