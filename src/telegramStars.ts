import axios from 'axios';
import { HttpError } from './errors.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

export type PlanType = 'week' | 'month' | 'threeMonths';

// Telegram Stars: ~1 Star ≈ $0.013 (приблизительно)
// Цены в Stars для цифровых товаров
const PLAN_STARS: Record<PlanType, number> = {
  week: 1200,    // ~$15
  month: 4000,   // ~$50
  threeMonths: 9500, // ~$120
};

const PLAN_TITLES: Record<PlanType, string> = {
  week: 'Premium на 1 неделю',
  month: 'Premium на 1 месяц',
  threeMonths: 'Premium на 3 месяца',
};

const PLAN_DESCRIPTIONS: Record<PlanType, string> = {
  week: 'Полный доступ к AI прогнозам на 7 дней',
  month: 'Полный доступ к AI прогнозам на 30 дней',
  threeMonths: 'Полный доступ к AI прогнозам на 90 дней (выгодно!)',
};

export function getPlanStars(plan: PlanType): number {
  return PLAN_STARS[plan] ?? 0;
}

export function getPlanDurationDays(plan: PlanType): number {
  switch (plan) {
    case 'week': return 7;
    case 'month': return 30;
    case 'threeMonths': return 90;
    default: return 0;
  }
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new HttpError(500, 'TELEGRAM_CONFIG_ERROR', 'TELEGRAM_BOT_TOKEN не настроен. Добавьте в .env');
  }
  return token;
}

interface InvoicePayload {
  userId: number;
  plan: PlanType;
  orderId: string;
}

export function encodePayload(payload: InvoicePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decodePayload(payloadStr: string): InvoicePayload | null {
  try {
    const json = Buffer.from(payloadStr, 'base64').toString('utf-8');
    const data = JSON.parse(json);
    if (data.userId && data.plan && data.orderId) {
      return data as InvoicePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Создаёт ссылку на инвойс для оплаты через Telegram Stars.
 * Используется в Mini App с WebApp.openInvoice(url)
 */
export async function createInvoiceLink(
  orderId: string,
  userId: number,
  plan: PlanType
): Promise<string> {
  const token = getBotToken();
  const starsAmount = getPlanStars(plan);

  const payload = encodePayload({ userId, plan, orderId });

  const url = `${TELEGRAM_API}${token}/createInvoiceLink`;

  try {
    const response = await axios.post(url, {
      title: PLAN_TITLES[plan],
      description: PLAN_DESCRIPTIONS[plan],
      payload,
      provider_token: '', // Пустая строка для Telegram Stars (цифровые товары)
      currency: 'XTR',   // Telegram Stars
      prices: [
        { label: PLAN_TITLES[plan], amount: starsAmount },
      ],
    });

    if (response.data.ok && response.data.result) {
      return response.data.result;
    }
    throw new Error(response.data.description || 'Unknown Telegram API error');
  } catch (error: any) {
    if (error instanceof HttpError) throw error;
    console.error('[Telegram Stars] Error creating invoice:', error?.response?.data || error);
    throw new HttpError(
      500,
      'TELEGRAM_STARS_ERROR',
      `Ошибка создания платежа: ${error?.response?.data?.description || error.message}`
    );
  }
}

/**
 * Подтверждает pre-checkout запрос (обязательно ответить в течение 10 сек)
 */
export async function answerPreCheckoutQuery(
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string
): Promise<boolean> {
  const token = getBotToken();
  const url = `${TELEGRAM_API}${token}/answerPreCheckoutQuery`;

  const body: Record<string, unknown> = { pre_checkout_query_id: preCheckoutQueryId, ok };
  if (!ok && errorMessage) {
    body.error_message = errorMessage;
  }

  const response = await axios.post(url, body);
  return response.data.ok === true;
}
