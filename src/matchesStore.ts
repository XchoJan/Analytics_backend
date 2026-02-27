import { db } from './db.js';
import { scrapeVbetMatches } from './vbet.js';
import type { MatchWithOdds } from './vbet.js';

function toMatchKey(m: MatchWithOdds): string {
  return `${m.homeTeam}|${m.awayTeam}|${m.date}`;
}

/**
 * Убирает дубликаты матчей (homeTeam + awayTeam + date).
 * При дубликате оставляет первый.
 */
function deduplicateMatches(matches: MatchWithOdds[]): MatchWithOdds[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = toMatchKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Возвращает матчи из БД (кеш).
 */
export function getMatchesFromDb(): MatchWithOdds[] {
  const rows = db.prepare(`
    SELECT homeTeam, awayTeam, date, time, league, odds_home, odds_draw, odds_away
    FROM matches
    ORDER BY date ASC, time ASC
  `).all() as Array<{
    homeTeam: string;
    awayTeam: string;
    date: string;
    time: string | null;
    league: string | null;
    odds_home: number;
    odds_draw: number;
    odds_away: number;
  }>;

  return rows.map((r) => ({
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    date: r.date,
    time: r.time ?? undefined,
    league: r.league ?? undefined,
    odds: {
      home: r.odds_home,
      draw: r.odds_draw,
      away: r.odds_away,
    },
  }));
}

/**
 * Сохраняет матчи в БД. Удаляет старые, вставляет новые без дубликатов.
 */
function saveMatches(matches: MatchWithOdds[]): void {
  const deduped = deduplicateMatches(matches);
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO matches (homeTeam, awayTeam, date, time, league, odds_home, odds_draw, odds_away, updatedAt)
    VALUES (@homeTeam, @awayTeam, @date, @time, @league, @odds_home, @odds_draw, @odds_away, @updatedAt)
  `);

  const runMany = db.transaction((items: MatchWithOdds[]) => {
    for (const m of items) {
      insert.run({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        date: m.date,
        time: m.time ?? null,
        league: m.league ?? null,
        odds_home: m.odds.home,
        odds_draw: m.odds.draw,
        odds_away: m.odds.away,
        updatedAt: now,
      });
    }
  });

  runMany(deduped);
}

/**
 * Парсит матчи по ссылкам, сохраняет в БД и возвращает их.
 * Вызывается кроном раз в 2 часа.
 */
export async function refreshMatches(): Promise<MatchWithOdds[]> {
  console.log('[MatchesStore] Starting scheduled refresh...');
  try {
    const matches = await scrapeVbetMatches();
    const deduped = deduplicateMatches(matches);

    // Полная замена: удаляем старые, вставляем актуальные
    db.exec('DELETE FROM matches');
    if (deduped.length > 0) {
      saveMatches(deduped);
    }

    console.log(`[MatchesStore] Refreshed: ${deduped.length} matches (${matches.length} before dedup)`);
    return getMatchesFromDb();
  } catch (err: any) {
    console.error('[MatchesStore] Refresh failed:', err?.message ?? err);
    // При ошибке парсинга возвращаем то, что есть в кеше
    return getMatchesFromDb();
  }
}
