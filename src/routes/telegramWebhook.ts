import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { findUserById, updateUserPremiumStatus } from '../models/user.js';
import {
  answerPreCheckoutQuery,
  decodePayload,
  getPlanDurationDays,
} from '../telegramStars.js';

export const telegramWebhookRouter = Router();

// Telegram отправляет update как JSON в body
telegramWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  // Всегда сразу отвечаем 200, чтобы Telegram не повторял запрос
  res.status(200).send();

  const update = req.body as {
    update_id?: number;
    pre_checkout_query?: {
      id: string;
      from: { id: number; first_name?: string };
      currency: string;
      total_amount: number;
      invoice_payload: string;
    };
    message?: {
      message_id: number;
      from?: { id: number };
      successful_payment?: {
        currency: string;
        total_amount: number;
        invoice_payload: string;
        telegram_payment_charge_id: string;
      };
    };
  };

  try {
    // Обработка pre_checkout_query — пользователь нажал "Оплатить"
    if (update.pre_checkout_query) {
      const { id, invoice_payload } = update.pre_checkout_query;
      const payload = decodePayload(invoice_payload);

      if (!payload) {
        await answerPreCheckoutQuery(id, false, 'Неверные данные платежа');
        return;
      }

      const payment = db.prepare(
        'SELECT * FROM payments WHERE orderId = ? AND userId = ? AND status = ?'
      ).get(payload.orderId, payload.userId, 'pending') as any;

      if (!payment) {
        await answerPreCheckoutQuery(id, false, 'Платёж не найден или уже обработан');
        return;
      }

      await answerPreCheckoutQuery(id, true);
      return;
    }

    // Обработка successful_payment — платёж прошёл успешно
    if (update.message?.successful_payment) {
      const { invoice_payload, telegram_payment_charge_id } = update.message.successful_payment;
      const payload = decodePayload(invoice_payload);

      if (!payload) {
        console.error('[Telegram Webhook] Invalid payload:', invoice_payload);
        return;
      }

      const payment = db.prepare(
        'SELECT * FROM payments WHERE orderId = ? AND userId = ?'
      ).get(payload.orderId, payload.userId) as any;

      if (!payment) {
        console.error('[Telegram Webhook] Payment not found:', payload.orderId);
        return;
      }

      if (payment.status === 'paid' || payment.status === 'paid_over') {
        console.log('[Telegram Webhook] Payment already processed:', payload.orderId);
        return;
      }

      // Обновляем статус платежа (telegramPaymentChargeId нужен для refundStarPayment)
      db.prepare(`
        UPDATE payments
        SET status = 'paid', updatedAt = datetime('now'), telegramPaymentChargeId = ?
        WHERE orderId = ? AND userId = ?
      `).run(telegram_payment_charge_id, payload.orderId, payload.userId);

      // Активируем Premium
      const user = findUserById(payload.userId);
      if (user) {
        const durationDays = getPlanDurationDays(payload.plan);
        const now = new Date();
        const premiumUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        updateUserPremiumStatus(user.id, premiumUntil.toISOString());
        console.log(`[Telegram Webhook] Premium activated for user ${user.id} until ${premiumUntil.toISOString()}`);
      }
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
  }
});
