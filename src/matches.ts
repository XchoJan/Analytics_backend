import axios from "axios";
import { Match } from "./schemas.js";

function getEnv(name: string): string | undefined {
  return process.env[name];
}

interface SportDBMatch {
  id?: string | number;
  homeName?: string;
  awayName?: string;
  startDateTimeUtc?: string;
  startUtime?: string | number;
  tournamentName?: string;
  eventStageId?: number | string;
  eventStage?: string;
  [key: string]: any;
}

interface SportDBResponse {
  matches?: SportDBMatch[];
  data?: SportDBMatch[];
  results?: SportDBMatch[];
  [key: string]: any;
}

/**
 * Проверяет, является ли дата актуальной (сегодня, завтра или послезавтра)
 */
function isRecentDate(dateStr: string): boolean {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      return false;
    }
    
    const matchDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    
    matchDate.setHours(0, 0, 0, 0);
    
    const isValid = matchDate >= today && matchDate < threeDaysLater;
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const notTooFar = matchDate < oneMonthLater;
    const currentYear = today.getFullYear();
    const yearValid = year <= currentYear + 1;
    
    return isValid && notTooFar && yearValid;
  } catch (error) {
    console.warn(`[isRecentDate] Error parsing date: ${dateStr}`, error);
    return false;
  }
}

/**
 * Получает матчи с датами из SportDB API (Flashscore)
 * Использует endpoint /api/flashscore/football/live с параметром offset
 */
async function getMatchesWithDatesFromSportDB(): Promise<Match[]> {
  const matches: Match[] = [];
  try {
    const apiKey = getEnv("SPORTDB_API_KEY");
    if (!apiKey) {
      console.warn("[SportDB] API key not found");
      return [];
    }
    
    // Получаем матчи на сегодня (offset=0) и завтра (offset=1)
    const offsets = [0, 1];
    
    for (const offset of offsets) {
      try {
        const url = `https://api.sportdb.dev/api/flashscore/football/live?offset=${offset}`;
        console.log(`[SportDB] Fetching matches for offset=${offset} (${offset === 0 ? 'today' : 'tomorrow'})...`);
        
        const response = await axios.get<SportDBResponse>(url, {
          timeout: 15000,
          headers: { 
            'Accept': 'application/json',
            'X-API-Key': apiKey,
          },
          validateStatus: (status) => status < 500,
        });
        
        console.log(`[SportDB] Response status: ${response.status}`);
        
        if (response.status === 200) {
          // Пробуем разные форматы ответа
          let matchesData: any[] = [];
          
          if (Array.isArray(response.data)) {
            matchesData = response.data;
          } else if (response.data?.matches && Array.isArray(response.data.matches)) {
            matchesData = response.data.matches;
          } else if (response.data?.data && Array.isArray(response.data.data)) {
            matchesData = response.data.data;
          } else if (response.data?.results && Array.isArray(response.data.results)) {
            matchesData = response.data.results;
          } else if (typeof response.data === 'object') {
            const keys = Object.keys(response.data);
            console.log(`[SportDB] Response keys: ${keys.join(', ')}`);
            
            for (const key of keys) {
              if (Array.isArray((response.data as any)[key])) {
                matchesData = (response.data as any)[key];
                break;
              }
            }
          }
          
          if (matchesData.length > 0) {
            console.log(`[SportDB] Found ${matchesData.length} matches for offset=${offset}`);
            
            for (const matchData of matchesData) {
              const homeTeam = matchData.homeName || matchData.homeTeam || matchData.home_team || matchData.home?.name || "";
              const awayTeam = matchData.awayName || matchData.awayTeam || matchData.away_team || matchData.away?.name || "";
              
              let dateStr = "";
              let timeStr = "";
              
              if (matchData.startDateTimeUtc) {
                const matchDate = new Date(matchData.startDateTimeUtc);
                dateStr = matchDate.toISOString().split('T')[0];
                timeStr = matchDate.toTimeString().split(' ')[0].substring(0, 5);
              } else if (matchData.startUtime) {
                const matchDate = new Date(Number(matchData.startUtime) * 1000);
                dateStr = matchDate.toISOString().split('T')[0];
                timeStr = matchDate.toTimeString().split(' ')[0].substring(0, 5);
              } else {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + offset);
                dateStr = targetDate.toISOString().split('T')[0];
              }
              
              const league = matchData.tournamentName || matchData.tournament?.name || matchData.league || "";
              
              // Берем только запланированные (1) или live (2) матчи
              const eventStageId = matchData.eventStageId;
              const eventStage = matchData.eventStage;
              const isScheduled = eventStageId === 1 || eventStageId === 2 || 
                                 eventStage === "SCHEDULED" || eventStage === "LIVE" ||
                                 (typeof eventStageId === 'string' && (eventStageId === "1" || eventStageId === "2"));
              
              if (homeTeam && awayTeam && dateStr && isScheduled) {
                if (isRecentDate(dateStr)) {
                  matches.push({
                    homeTeam: homeTeam.trim(),
                    awayTeam: awayTeam.trim(),
                    date: dateStr,
                    time: timeStr || matchData.time || "",
                    league: league || "",
                  });
                }
              }
            }
          } else {
            console.log(`[SportDB] No matches found for offset=${offset}`);
          }
        } else if (response.status === 401) {
          console.warn(`[SportDB] Unauthorized - check API key`);
          break;
        } else if (response.status === 403) {
          console.warn(`[SportDB] Forbidden - check API key permissions`);
          break;
        } else if (response.status === 429) {
          console.warn(`[SportDB] Rate limit exceeded`);
          break;
        }
      } catch (error: any) {
        console.warn(`[SportDB] Request failed for offset=${offset}: ${error.message}`);
        if (error.response) {
          console.warn(`[SportDB] Response status: ${error.response.status}`);
          if (error.response.data) {
            const errorData = JSON.stringify(error.response.data).substring(0, 300);
            console.warn(`[SportDB] Response data:`, errorData);
          }
        }
        continue;
      }
    }
    
    console.log(`[SportDB] Total matches collected: ${matches.length}`);
  } catch (error: any) {
    console.error("[SportDB] Error:", error.message);
  }
  return matches;
}

/**
 * Получает список будущих матчей с датами
 */
export async function getMatchesWithDates(): Promise<Match[]> {
  console.log("[getMatchesWithDates] Fetching matches with dates...");
  const today = new Date().toISOString().split('T')[0];
  console.log(`[getMatchesWithDates] Today: ${today}`);
  
  try {
    const matches = await getMatchesWithDatesFromSportDB();
    console.log(`[getMatchesWithDates] SportDB: ${matches.length} matches`);
    
    // Убираем дубликаты (по командам и дате)
    const uniqueMatches = matches.filter((match, index, self) => 
      index === self.findIndex((m) => 
        m.homeTeam === match.homeTeam && 
        m.awayTeam === match.awayTeam && 
        m.date === match.date
      )
    );
    
    // Фильтруем только актуальные даты
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const todayStr = currentDate.toISOString().split('T')[0];
    
    console.log(`[getMatchesWithDates] Today is: ${todayStr}`);
    console.log(`[getMatchesWithDates] Total matches before filtering: ${uniqueMatches.length}`);
    
    const recentMatches = uniqueMatches.filter(match => isRecentDate(match.date));
    
    // Сортируем по дате и времени
    recentMatches.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      const timeA = a.time || "00:00";
      const timeB = b.time || "00:00";
      return timeA.localeCompare(timeB);
    });
    
    console.log(`[getMatchesWithDates] Total unique recent matches after filtering: ${recentMatches.length}`);
    
    if (recentMatches.length === 0) {
      console.warn("[getMatchesWithDates] No recent matches found");
      return [];
    }
    
    return recentMatches.slice(0, 30); // Возвращаем до 30 актуальных матчей
  } catch (error: any) {
    console.error("[getMatchesWithDates] Error:", error.message);
    throw new Error("Не удалось получить матчи. Проверьте подключение к интернету и настройки API.");
  }
}
