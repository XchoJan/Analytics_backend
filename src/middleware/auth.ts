import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../models/user.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: 'user' | 'admin';
    premium: boolean;
    premiumUntil: string | null;
  };
}

export function generateToken(userId: number, username: string, role: 'user' | 'admin', premium: boolean): string {
  return jwt.sign(
    { userId, username, role, premium },
    JWT_SECRET,
    { expiresIn: '30d' } // Токен действителен 30 дней
  );
}

export function verifyToken(token: string): { userId: number; username: string; role: 'user' | 'admin'; premium: boolean } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role: 'user' | 'admin'; premium: boolean };
    return decoded;
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Токен не предоставлен' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Недействительный токен' });
  }

  const user = findUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    premium: Boolean(user.premium),
    premiumUntil: user.premiumUntil,
  };

  next();
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const user = findUserById(decoded.userId);
      if (user) {
        req.user = {
          id: user.id,
          username: user.username,
          role: user.role,
          premium: Boolean(user.premium),
        };
      }
    }
  }

  next();
}

