import { refreshMatches } from './matchesStore.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2000; // первый запуск через 2 сек после старта сервера

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startMatchesCron(): void {
  // Первый запуск с задержкой
  setTimeout(async () => {
    await refreshMatches();
  }, STARTUP_DELAY_MS);

  // Затем каждые 2 часа
  intervalId = setInterval(async () => {
    await refreshMatches();
  }, TWO_HOURS_MS);

  console.log('[Cron] Matches refresh scheduled every 2 hours');
}

export function stopMatchesCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Cron] Matches refresh stopped');
  }
}
