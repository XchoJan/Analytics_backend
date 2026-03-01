/**
 * Устанавливает webhook для Telegram бота.
 * Запуск: npx tsx scripts/setTelegramWebhook.ts https://api.your-domain.com
 * Или с BACKEND_URL в .env
 */
import 'dotenv/config';
import axios from 'axios';

const BACKEND_URL = process.argv[2] || process.env.BACKEND_URL;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

if (!BACKEND_URL) {
  console.error('Укажите URL backend: npx tsx scripts/setTelegramWebhook.ts https://api.your-domain.com');
  process.exit(1);
}

const webhookUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/telegram/webhook`;

async function setWebhook() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
    const response = await axios.post(url, { url: webhookUrl });
    if (response.data.ok) {
      console.log('✅ Webhook установлен:', webhookUrl);
    } else {
      console.error('Ошибка:', response.data);
    }
  } catch (e: any) {
    console.error('Ошибка:', e.response?.data || e.message);
    process.exit(1);
  }
}

setWebhook();
