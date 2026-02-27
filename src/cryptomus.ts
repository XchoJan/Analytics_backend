import crypto from 'crypto';
import axios from 'axios';
import { HttpError } from './errors.js';

const CRYPTOMUS_API_URL = 'https://api.cryptomus.com/v1';

interface CryptomusPaymentRequest {
  amount: string;
  currency: string;
  order_id: string;
  url_return?: string;
  url_callback?: string;
  is_payment_multiple?: boolean;
  lifetime?: number;
  to_currency?: string;
  subtract?: number;
  accuracy_payment_percent?: number;
  additional_data?: string;
  currencies?: string[];
  network?: string;
  address?: string;
  from?: string;
  is_refresh?: boolean;
}

interface CryptomusPaymentResponse {
  state: number;
  result: {
    uuid: string;
    order_id: string;
    amount: string;
    payment_amount: string;
    payment_amount_usd: string;
    currency: string;
    merchant_amount: string;
    network: string;
    address: string;
    from: string;
    txid: string;
    payment_status: string;
    url: string;
    expired_at: number;
    status: string;
    is_final: boolean;
    additional_data?: string;
    currencies?: any[];
  };
}

interface CryptomusWebhookData {
  merchant_id: string;
  order_id: string;
  payment_status: string;
  payment_amount: string;
  payment_amount_usd: string;
  merchant_amount: string;
  network: string;
  address: string;
  from: string;
  txid: string;
  sign: string;
  [key: string]: any;
}

function getMerchantId(): string {
  const id = process.env.CRYPTOMUS_MERCHANT_ID;
  if (!id) {
    throw new HttpError(500, 'CRYPTOMUS_CONFIG_ERROR', 'CRYPTOMUS_MERCHANT_ID не настроен');
  }
  return id;
}

function getPaymentKey(): string {
  const key = process.env.CRYPTOMUS_PAYMENT_KEY;
  if (!key || key === 'ВАШ_PAYMENT_KEY_ЗДЕСЬ') {
    throw new HttpError(500, 'CRYPTOMUS_CONFIG_ERROR', 'CRYPTOMUS_PAYMENT_KEY не настроен. Добавьте Payment Key в .env файл');
  }
  return key;
}

function createSignature(data: Record<string, any>, paymentKey: string): string {
  const payload = JSON.stringify(data);
  const sign = crypto
    .createHash('md5')
    .update(Buffer.from(payload).toString('base64') + paymentKey)
    .digest('hex');
  return sign;
}

function verifySignature(data: CryptomusWebhookData, paymentKey: string): boolean {
  const { sign, ...dataWithoutSign } = data;
  const calculatedSign = createSignature(dataWithoutSign, paymentKey);
  return calculatedSign === sign;
}

export async function createPayment(
  amount: number,
  currency: string,
  orderId: string,
  userId: number,
  plan: 'week' | 'month' | 'threeMonths'
): Promise<CryptomusPaymentResponse> {
  const merchantId = getMerchantId();
  const paymentKey = getPaymentKey();
  const webhookUrl = process.env.CRYPTOMUS_WEBHOOK_URL || 'https://rover-endorsed-conceptual-meets.trycloudflare.com/api/payments/cryptomus/webhook';

  const requestData: CryptomusPaymentRequest = {
    amount: amount.toString(),
    currency: currency.toUpperCase(),
    order_id: orderId,
    url_callback: webhookUrl,
    url_return: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
    is_payment_multiple: false,
    lifetime: 7200, // 2 часа
  };

  const sign = createSignature(requestData, paymentKey);

  try {
    const response = await axios.post<CryptomusPaymentResponse>(
      `${CRYPTOMUS_API_URL}/payment`,
      requestData,
      {
        headers: {
          'merchant': merchantId,
          'sign': sign,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.state === 0) {
      return response.data;
    } else {
      throw new HttpError(400, 'CRYPTOMUS_ERROR', `Ошибка создания платежа: ${JSON.stringify(response.data)}`);
    }
  } catch (error: any) {
    if (error instanceof HttpError) {
      throw error;
    }
    console.error('[Cryptomus] Error creating payment:', error);
    throw new HttpError(500, 'CRYPTOMUS_API_ERROR', `Ошибка при создании платежа: ${error.message}`);
  }
}

export async function getPaymentStatus(orderId: string): Promise<any> {
  const merchantId = getMerchantId();
  const paymentKey = getPaymentKey();

  const requestData = {
    order_id: orderId,
  };

  const sign = createSignature(requestData, paymentKey);

  try {
    const response = await axios.post(
      `${CRYPTOMUS_API_URL}/payment/info`,
      requestData,
      {
        headers: {
          'merchant': merchantId,
          'sign': sign,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('[Cryptomus] Error getting payment status:', error);
    throw new HttpError(500, 'CRYPTOMUS_API_ERROR', `Ошибка при получении статуса платежа: ${error.message}`);
  }
}

export function verifyWebhook(data: CryptomusWebhookData): boolean {
  const paymentKey = getPaymentKey();
  return verifySignature(data, paymentKey);
}

export function getPlanPrice(plan: 'week' | 'month' | 'threeMonths'): number {
  switch (plan) {
    case 'week':
      return 15;
    case 'month':
      return 50;
    case 'threeMonths':
      return 120;
    default:
      return 0;
  }
}

export function getPlanDurationDays(plan: 'week' | 'month' | 'threeMonths'): number {
  switch (plan) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'threeMonths':
      return 90;
    default:
      return 0;
  }
}

