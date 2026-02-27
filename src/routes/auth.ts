import { Router, Request, Response } from 'express';
import { createUser, findUserByUsername, verifyPassword } from '../models/user.js';
import { generateToken } from '../middleware/auth.js';
import { HttpError } from '../errors.js';

export const authRouter = Router();

// Валидация никнейма: уникальный, минимум 8 символов, заглавная буква, цифра, символ
function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 8) {
    return { valid: false, error: 'Никнейм должен содержать минимум 8 символов' };
  }
  if (!/[A-Z]/.test(username)) {
    return { valid: false, error: 'Никнейм должен содержать хотя бы одну заглавную букву' };
  }
  if (!/[0-9]/.test(username)) {
    return { valid: false, error: 'Никнейм должен содержать хотя бы одну цифру' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(username)) {
    return { valid: false, error: 'Никнейм должен содержать хотя бы один специальный символ' };
  }
  return { valid: true };
}

// Валидация пароля: минимум 8 символов, заглавная буква, цифра, символ
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Пароль должен содержать минимум 8 символов' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Пароль должен содержать хотя бы одну заглавную букву' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Пароль должен содержать хотя бы одну цифру' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Пароль должен содержать хотя бы один специальный символ' };
  }
  return { valid: true };
}

authRouter.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { username, password, acceptPrivacyPolicy } = req.body;

    if (!username || !password) {
      throw new HttpError(400, 'MISSING_FIELDS', 'Никнейм и пароль обязательны');
    }

    if (!acceptPrivacyPolicy) {
      throw new HttpError(400, 'PRIVACY_POLICY_NOT_ACCEPTED', 'Необходимо принять политику конфиденциальности');
    }

    // Валидация никнейма
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      throw new HttpError(400, 'INVALID_USERNAME', usernameValidation.error || 'Неверный никнейм');
    }

    // Валидация пароля
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new HttpError(400, 'INVALID_PASSWORD', passwordValidation.error || 'Неверный пароль');
    }

    // Создаем пользователя
    const user = createUser(username, password);

    // Генерируем токен
    const token = generateToken(user.id, user.username, user.role, user.premium);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        premium: user.premium,
      },
      token,
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new HttpError(400, 'MISSING_FIELDS', 'Никнейм и пароль обязательны');
    }

    // Находим пользователя
    const user = findUserByUsername(username);
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный никнейм или пароль');
    }

    // Проверяем пароль
    if (!verifyPassword(password, user.password)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный никнейм или пароль');
    }

    // Генерируем токен
    const token = generateToken(user.id, user.username, user.role, Boolean(user.premium));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        premium: Boolean(user.premium),
        premiumUntil: user.premiumUntil,
      },
      token,
    });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', async (req: Request, res: Response, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;

    if (!token) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Токен не предоставлен');
    }

    const { verifyToken } = await import('../middleware/auth.js');
    const decoded = verifyToken(token);

    if (!decoded) {
      throw new HttpError(401, 'INVALID_TOKEN', 'Недействительный токен');
    }

    const { findUserById } = await import('../models/user.js');
    const user = findUserById(decoded.userId);

    if (!user) {
      throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        premium: Boolean(user.premium),
        premiumUntil: user.premiumUntil,
      },
    });
  } catch (e) {
    next(e);
  }
});

