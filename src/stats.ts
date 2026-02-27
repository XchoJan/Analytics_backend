import fs from 'fs';
import path from 'path';

export interface Stats {
  activeUsers: number;
  successfulPredictions: number;
  failedPredictions: number;
  lastUpdateDate: string; // YYYY-MM-DD
}

const STATS_FILE = path.join(process.cwd(), 'stats.json');

// Начальные значения
const INITIAL_STATS: Stats = {
  activeUsers: 100,
  successfulPredictions: 186,
  failedPredictions: 12,
  lastUpdateDate: new Date().toISOString().split('T')[0],
};

/**
 * Загружает статистику из файла или создает начальную
 */
function loadStats(): Stats {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Stats] Error loading stats file:', error);
  }
  
  // Если файла нет или ошибка, создаем начальную статистику
  saveStats(INITIAL_STATS);
  return INITIAL_STATS;
}

/**
 * Сохраняет статистику в файл
 */
function saveStats(stats: Stats): void {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Stats] Error saving stats file:', error);
  }
}

/**
 * Генерирует случайное число в диапазоне
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Обновляет статистику, если прошел новый день
 */
function updateStatsIfNeeded(): Stats {
  const stats = loadStats();
  const today = new Date().toISOString().split('T')[0];
  
  // Если сегодня уже обновляли, возвращаем текущие значения
  if (stats.lastUpdateDate === today) {
    return stats;
  }
  
  // Вычисляем количество дней, которые прошли
  const lastDate = new Date(stats.lastUpdateDate);
  const todayDate = new Date(today);
  const daysDiff = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 0) {
    // Обновляем статистику за каждый прошедший день
    let updatedStats = { ...stats };
    
    for (let i = 0; i < daysDiff; i++) {
      // Активных пользователей: +10 до +26
      updatedStats.activeUsers += randomInt(10, 26);
      
      // Удачные прогнозы: +25 до +40
      updatedStats.successfulPredictions += randomInt(25, 40);
      
      // Проигранные прогнозы: +1 до +5
      updatedStats.failedPredictions += randomInt(1, 5);
    }
    
    updatedStats.lastUpdateDate = today;
    saveStats(updatedStats);
    
    console.log(`[Stats] Updated stats for ${daysDiff} day(s). New values:`, {
      activeUsers: updatedStats.activeUsers,
      successfulPredictions: updatedStats.successfulPredictions,
      failedPredictions: updatedStats.failedPredictions,
    });
    
    return updatedStats;
  }
  
  return stats;
}

/**
 * Получает текущую статистику (с автоматическим обновлением)
 */
export function getStats(): Stats {
  return updateStatsIfNeeded();
}

/**
 * Получает статистику без обновления (для отладки)
 */
export function getStatsRaw(): Stats {
  return loadStats();
}

