import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { findUserById, updateUserPremiumStatus } from '../models/user.js';
import { HttpError } from '../errors.js';
import { createPayment, verifyWebhook, getPlanPrice, getPlanDurationDays } from '../cryptomus.js';
import { db } from '../db.js';
import crypto from 'crypto';

export const paymentsRouter = Router();

// Создание платежа
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

    const amount = getPlanPrice(plan);
    const orderId = `order_${user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Сохраняем платеж в базу данных
    db.prepare(`
      INSERT INTO payments (userId, plan, amount, currency, cryptomusOrderId, status)
      VALUES (?, ?, ?, 'USD', ?, 'pending')
    `).run(user.id, plan, amount, orderId);

    // Создаем платеж в Cryptomus
    const payment = await createPayment(amount, 'USD', orderId, user.id, plan);

    res.json({
      paymentUrl: payment.result.url,
      orderId: orderId,
      amount: amount,
      currency: 'USD',
    });
  } catch (e) {
    next(e);
  }
});

// Webhook от Cryptomus
paymentsRouter.post('/cryptomus/webhook', async (req, res, next) => {
  try {
    const webhookData = req.body as any;

    // Проверяем подпись
    if (!verifyWebhook(webhookData)) {
      console.error('[Cryptomus Webhook] Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { order_id, payment_status, merchant_amount } = webhookData;

    // Находим платеж в базе данных
    const payment = db.prepare('SELECT * FROM payments WHERE cryptomusOrderId = ?').get(order_id) as any;
    if (!payment) {
      console.error('[Cryptomus Webhook] Payment not found:', order_id);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Обновляем статус платежа
    db.prepare(`
      UPDATE payments 
      SET status = ?, updatedAt = datetime('now')
      WHERE cryptomusOrderId = ?
    `).run(payment_status, order_id);

    // Если платеж успешен, активируем premium подписку
    if (payment_status === 'paid' || payment_status === 'paid_over') {
      const user = findUserById(payment.userId);
      if (user) {
        const durationDays = getPlanDurationDays(payment.plan);
        const now = new Date();
        const premiumUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        
        updateUserPremiumStatus(user.id, premiumUntil.toISOString());
        
        console.log(`[Cryptomus Webhook] Premium activated for user ${user.id} until ${premiumUntil.toISOString()}`);
      }
    }

    res.json({ status: 'ok' });
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
    const payment = db.prepare('SELECT * FROM payments WHERE cryptomusOrderId = ? AND userId = ?').get(orderId, req.user.id) as any;

    if (!payment) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Платеж не найден');
    }

    res.json({
      orderId: payment.cryptomusOrderId,
      status: payment.status,
      plan: payment.plan,
      amount: payment.amount,
    });
  } catch (e) {
    next(e);
  }
});

