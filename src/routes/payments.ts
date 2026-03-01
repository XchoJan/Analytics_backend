import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { findUserById } from '../models/user.js';
import { HttpError } from '../errors.js';
import { createInvoiceLink, getPlanStars } from '../telegramStars.js';
import { db } from '../db.js';
import crypto from 'crypto';

export const paymentsRouter = Router();

// Создание платежа через Telegram Stars
paymentsRouter.post('/create', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Пользователь не авторизован');
    }

    const { plan } = req.body;
    if (!plan || !['week', 'month', 'threeMonths'].includes(plan)) {
      throw new HttpError(400, 'INVALID_PLAN', 'Неверный план подписки');
    }

    const user = findUserById(req.user.id);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
    }

    const orderId = `order_${user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const starsAmount = getPlanStars(plan);

    // Сохраняем платёж в базу
    db.prepare(`
      INSERT INTO payments (userId, plan, amount, currency, orderId, status)
      VALUES (?, ?, ?, 'XTR', ?, 'pending')
    `).run(user.id, plan, starsAmount, orderId);

    // Создаём инвойс-ссылку для Telegram Stars
    const invoiceUrl = await createInvoiceLink(orderId, user.id, plan);

    res.json({
      paymentUrl: invoiceUrl,
      orderId,
      amount: starsAmount,
      currency: 'XTR',
      paymentMethod: 'telegram_stars',
    });
  } catch (e) {
    next(e);
  }
});

// Проверка статуса платежа
paymentsRouter.get('/status/:orderId', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Пользователь не авторизован');
    }

    const { orderId } = req.params;
    const payment = db.prepare(
      'SELECT * FROM payments WHERE orderId = ? AND userId = ?'
    ).get(orderId, req.user.id) as any;

    if (!payment) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Платёж не найден');
    }

    res.json({
      orderId: payment.orderId,
      status: payment.status,
      plan: payment.plan,
      amount: payment.amount,
      currency: payment.currency || 'XTR',
    });
  } catch (e) {
    next(e);
  }
});
