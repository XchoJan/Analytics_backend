import cron from 'node-cron';
import { getMatchesFromDb } from './matchesStore.js';
import { generateSingle, generateExpress, generateExpress5 } from './ai.js';
import { savePredictions } from './predictionsStore.js';

const COUNT_PER_TYPE = 5;

export async function runPredictionGeneration(): Promise<void> {
  console.log('[PredictionCron] Starting scheduled prediction generation...');

  const matches = getMatchesFromDb();
  console.log(`[PredictionCron] Matches in DB: ${matches.length}`);
  if (matches.length === 0) {
    console.warn('[PredictionCron] No matches in DB, skipping');
    return;
  }

  if (matches.length < 5) {
    console.warn('[PredictionCron] Not enough matches for express5, skipping');
  }

  try {
    // 5 прогнозов "Минимальный риск"
    const singles: unknown[] = [];
    for (let i = 0; i < COUNT_PER_TYPE; i++) {
      try {
        const p = await generateSingle(matches);
        singles.push(p);
        await new Promise((r) => setTimeout(r, 2500)); // пауза между запросами
      } catch (e: any) {
        console.error(`[PredictionCron] Single ${i + 1} failed:`, e?.message ?? e);
      }
    }
    if (singles.length > 0) {
      savePredictions('single', singles);
      console.log(`[PredictionCron] Saved ${singles.length} single predictions`);
    }

    // 5 экспресс 3
    if (matches.length >= 3) {
      const expresses: unknown[] = [];
      for (let i = 0; i < COUNT_PER_TYPE; i++) {
        try {
          const p = await generateExpress(matches);
          expresses.push(p);
          await new Promise((r) => setTimeout(r, 2500));
        } catch (e: any) {
          console.error(`[PredictionCron] Express ${i + 1} failed:`, e?.message ?? e);
        }
      }
      if (expresses.length > 0) {
        savePredictions('express', expresses);
        console.log(`[PredictionCron] Saved ${expresses.length} express predictions`);
      } else {
        console.warn('[PredictionCron] No express predictions generated (all 5 failed)');
      }
    }

    // 5 экспресс 5
    if (matches.length >= 5) {
      const express5s: unknown[] = [];
      for (let i = 0; i < COUNT_PER_TYPE; i++) {
        try {
          const p = await generateExpress5(matches);
          express5s.push(p);
          await new Promise((r) => setTimeout(r, 2500));
        } catch (e: any) {
          console.error(`[PredictionCron] Express5 ${i + 1} failed:`, e?.message ?? e);
        }
      }
      if (express5s.length > 0) {
        savePredictions('express5', express5s);
        console.log(`[PredictionCron] Saved ${express5s.length} express5 predictions`);
      } else {
        console.warn('[PredictionCron] No express5 predictions generated (all 5 failed)');
      }
    }

    console.log('[PredictionCron] Generation complete');
  } catch (err: any) {
    console.error('[PredictionCron] Error:', err?.message ?? err);
  }
}

export function startPredictionCron(): void {
  // 12:00 и 18:00 по времени сервера (настрой TZ в .env при необходимости)
  cron.schedule('0 12,18 * * *', () => {
    runPredictionGeneration();
  });

  // Первый запуск через 2 минуты после старта (после загрузки матчей)
  setTimeout(() => {
    runPredictionGeneration();
  }, 2 * 60 * 1000);

  console.log('[PredictionCron] Scheduled at 12:00 and 18:00 daily');
}
