import { db } from './db.js';

export type PredictionType = 'single' | 'express' | 'express5';

/**
 * Сохраняет прогнозы. Заменяет все существующие прогнозы данного типа.
 */
export function savePredictions(type: PredictionType, predictions: unknown[]): void {
  const del = db.prepare('DELETE FROM predictions WHERE type = ?');
  const insert = db.prepare('INSERT INTO predictions (type, data) VALUES (?, ?)');

  const run = db.transaction(() => {
    del.run(type);
    for (const p of predictions) {
      insert.run(type, JSON.stringify(p));
    }
  });

  run();
}

/**
 * Возвращает случайный прогноз из пула по типу.
 */
export function getRandomPrediction(type: PredictionType): unknown | null {
  const row = db.prepare(
    'SELECT data FROM predictions WHERE type = ? ORDER BY RANDOM() LIMIT 1'
  ).get(type) as { data: string } | undefined;

  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

/**
 * Проверяет, есть ли прогнозы в пуле.
 */
export function hasPredictions(type: PredictionType): boolean {
  const row = db.prepare('SELECT 1 FROM predictions WHERE type = ? LIMIT 1').get(type);
  return !!row;
}

/**
 * Возвращает количество прогнозов по типам.
 */
export function getPredictionCounts(): Record<PredictionType, number> {
  const rows = db.prepare(
    'SELECT type, COUNT(*) as count FROM predictions GROUP BY type'
  ).all() as { type: string; count: number }[];

  const counts: Record<PredictionType, number> = { single: 0, express: 0, express5: 0 };
  for (const r of rows) {
    if (r.type in counts) counts[r.type as PredictionType] = r.count;
  }
  return counts;
}
