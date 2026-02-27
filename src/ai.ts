import { openai, OPENAI_MODEL } from "./openai.js";
import {
  ExpressPrediction,
  ExpressPredictionSchema,
  Express5Prediction,
  Express5PredictionSchema,
  SinglePrediction,
  SinglePredictionSchema,
  MatchAnalysis,
  MatchAnalysisSchema,
} from "./schemas.js";
import { buildExpressPrompt, buildExpress5Prompt, buildSinglePrompt, buildMatchAnalysisPrompt } from "./prompt.js";
import { HttpError } from "./errors.js";
import { MatchWithOdds } from "./vbet.js";
import { getMatchesFromDb } from "./matchesStore.js";
import axios from "axios";

// Механизм отслеживания последних выборов для разнообразия
const recentSelections: string[] = [];
const recentExpressSelections: string[][] = []; // Для экспресса храним массивы из 3 матчей
const recentExpress5Selections: string[][] = []; // Для экспресса x5 храним массивы из 5 матчей
const MAX_RECENT_SELECTIONS = 5; // Храним последние 5 выборов

const singleJsonSchema = {
  name: "single_prediction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", const: "single" },
      match: { type: "string" },
      prediction: { type: "string" },
      odds: { type: "number", minimum: 1.30, maximum: 1.60 },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["type", "match", "prediction", "odds", "confidence"],
  },
} as const;

const expressJsonSchema = {
  name: "express_prediction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", const: "express" },
      bets: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            match: { type: "string" },
            prediction: { type: "string" },
            odds: { type: "number", minimum: 1.30, maximum: 1.60 },
          },
          required: ["match", "prediction", "odds"],
        },
      },
      total_odds: { type: "number" },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["type", "bets", "total_odds", "confidence"],
  },
} as const;

const express5JsonSchema = {
  name: "express5_prediction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", const: "express5" },
      bets: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            match: { type: "string" },
            prediction: { type: "string" },
            odds: { type: "number", minimum: 1.30, maximum: 1.60 },
          },
          required: ["match", "prediction", "odds"],
        },
      },
      total_odds: { type: "number" },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["type", "bets", "total_odds", "confidence"],
  },
} as const;

const matchAnalysisJsonSchema = {
  name: "match_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      match: { type: "string" },
      prediction: { type: "string" },
      riskPercent: { type: "integer", minimum: 0, maximum: 100 },
      odds: { type: "number", minimum: 1.0, maximum: 10.0 },
    },
    required: ["match", "prediction", "riskPercent", "odds"],
  },
} as const;

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new HttpError(502, "OPENAI_INVALID_JSON", "OpenAI returned non-JSON output", {
      raw: input.slice(0, 2000),
    });
  }
}

/**
 * Выполняет поиск в интернете
 * Пробует разные источники: Tavily (если есть ключ), затем DuckDuckGo
 */
async function searchWeb(query: string): Promise<string> {
  // Сначала пробуем Tavily API (специально для AI, требует ключ)
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (tavilyApiKey) {
    try {
      const tavilyResponse = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: tavilyApiKey,
          query: query,
          search_depth: "basic",
          max_results: 3
        },
        {
          timeout: 8000,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (tavilyResponse.data?.results && Array.isArray(tavilyResponse.data.results)) {
        const results = tavilyResponse.data.results
          .map((r: any) => r.content || r.snippet || r.title)
          .filter(Boolean)
          .join("\n\n");
        
        if (results) {
          console.log(`[searchWeb] Tavily found ${results.length} chars for: ${query.substring(0, 50)}`);
          return results.substring(0, 1500);
        }
      }
    } catch (error: any) {
      console.warn(`[searchWeb] Tavily failed: ${error.message}, trying DuckDuckGo...`);
    }
  }
  
  // Fallback: DuckDuckGo Instant Answer API (бесплатный, не требует ключа)
  try {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await axios.get(searchUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SportsAnalytics/1.0)' }
    });
    
    const data = response.data;
    
    // Собираем информацию из ответа
    const results: string[] = [];
    
    if (data.AbstractText) {
      results.push(data.AbstractText);
    }
    if (data.Answer) {
      results.push(data.Answer);
    }
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const topics = data.RelatedTopics.slice(0, 5) // Увеличиваем до 5 для больше информации
        .map((t: any) => t.Text || t.FirstURL)
        .filter(Boolean);
      results.push(...topics);
    }
    
    const result = results.join("\n").substring(0, 1500); // Увеличиваем лимит
    if (result) {
      console.log(`[searchWeb] DuckDuckGo found ${result.length} chars for: ${query.substring(0, 50)}`);
    }
    return result;
  } catch (error: any) {
    console.warn(`[searchWeb] All search methods failed for "${query}": ${error.message}`);
    return "";
  }
}

async function callStrictJson(prompt: string, jsonSchema: unknown, temperature: number = 0.8, useWebSearch: boolean = false): Promise<string> {
  try {
    let enhancedPrompt = prompt;
    
    // Если нужен поиск, добавляем результаты поиска в промпт
    if (useWebSearch) {
      console.log("[callStrictJson] Performing web search for context...");
      
      // Извлекаем ключевые слова из промпта для поиска
      const matchInfo = prompt.match(/Матч:\s*(.+?)(?:\n|$)/);
      const leagueInfo = prompt.match(/Лига:\s*(.+?)(?:\n|$)/);
      
      const searchQueries: string[] = [];
      if (matchInfo) {
        // Ищем реальные коэффициенты букмекеров - более специфичные запросы
        const matchName = matchInfo[1];
        searchQueries.push(`${matchName} коэффициенты букмекеров сегодня актуальные`);
        searchQueries.push(`${matchName} ставки коэффициенты 1xbet bet365 fonbet parimatch`);
        searchQueries.push(`букмекеры ${matchName} коэффициенты на победу тотал`);
        searchQueries.push(`${matchName} прогноз статистика форма команд`);
      }
      if (leagueInfo) {
        searchQueries.push(`${leagueInfo[1]} ${matchInfo?.[1] || ''} коэффициенты букмекеров`);
      }
      
      // Выполняем поиск и собираем результаты
      const searchResults: string[] = [];
      // Увеличиваем количество запросов для лучшего поиска коэффициентов
      for (const query of searchQueries.slice(0, 4)) {
        const result = await searchWeb(query);
        if (result) {
          searchResults.push(`[Поисковый запрос: "${query}"]\n${result}`);
        }
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      
      if (searchResults.length > 0) {
        const webContext = searchResults.join("\n\n═══════════════════════════════════════════════════════\n\n");
        
        // Логируем первые 500 символов результатов для отладки
        const preview = webContext.substring(0, 500);
        console.log(`[callStrictJson] Search results preview (first 500 chars):\n${preview}...`);
        
        // Проверяем, есть ли в результатах упоминания коэффициентов
        const hasOddsMention = /коэффициент|коэф|odds|ставк|букмекер|1xbet|bet365|fonbet|parimatch/i.test(webContext);
        if (!hasOddsMention) {
          console.warn(`[callStrictJson] WARNING: Search results may not contain bookmaker odds information!`);
        } else {
          console.log(`[callStrictJson] ✓ Search results contain bookmaker/odds information`);
        }
        
        enhancedPrompt = `${prompt}\n\n═══════════════════════════════════════════════════════\nРЕАЛЬНАЯ ИНФОРМАЦИЯ ИЗ ИНТЕРНЕТА О МАТЧЕ И КОЭФФИЦИЕНТАХ БУКМЕКЕРОВ:\n═══════════════════════════════════════════════════════\n${webContext}\n═══════════════════════════════════════════════════════\n\nКРИТИЧЕСКИ ВАЖНО - РЕАЛЬНЫЕ КОЭФФИЦИЕНТЫ БУКМЕКЕРОВ:`;
        enhancedPrompt += `\n\n1. ВНИМАТЕЛЬНО изучи информацию выше и найди РЕАЛЬНЫЕ коэффициенты букмекеров`;
        enhancedPrompt += `\n2. Коэффициенты могут быть указаны в формате: "2.80", "1.60", "коэф. 2.5", "odds 1.8" и т.д.`;
        enhancedPrompt += `\n3. Ищи коэффициенты от букмекеров: 1xBet, Bet365, Fonbet, Parimatch, Winline, BetBoom и других`;
        enhancedPrompt += `\n4. Если в информации есть несколько коэффициентов для одного исхода - используй СРЕДНИЙ или НАИБОЛЕЕ ЧАСТЫЙ`;
        enhancedPrompt += `\n5. НЕ придумывай коэффициенты! НЕ рассчитывай их математически!`;
        enhancedPrompt += `\n6. Если в информации НЕТ реальных коэффициентов - НЕ возвращай коэффициент! Верни ошибку или используй значение 0`;
        enhancedPrompt += `\n7. Коэффициент ДОЛЖЕН точно соответствовать тому, что указано в информации выше`;
        enhancedPrompt += `\n8. Если в информации указан коэффициент 2.80 для исхода - верни ТОЧНО 2.80, а не 1.60!`;
        enhancedPrompt += `\n9. Проанализируй форму команд, статистику из информации выше для расчета процента риска`;
        enhancedPrompt += `\n10. Процент риска рассчитывай на основе анализа, но коэффициент бери ТОЛЬКО из реальных данных букмекеров выше`;
        console.log("[callStrictJson] Web search results added to prompt with STRICT emphasis on exact bookmaker odds");
      } else {
        console.warn("[callStrictJson] No web search results found");
        enhancedPrompt = `${prompt}\n\nКРИТИЧЕСКИ ВАЖНО: Поиск в интернете не дал результатов с коэффициентами букмекеров.`;
        enhancedPrompt += `\nНЕ придумывай коэффициенты! Если не можешь найти реальные коэффициенты в интернете, верни коэффициент 0 или очень высокое значение (например 99.99), чтобы показать, что реальные данные не найдены.`;
      }
    }
    
    const completionParams: any = {
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Верни ТОЛЬКО валидный JSON. Без прозы. Без markdown. Без объяснений. Без блоков кода. Все тексты на русском языке.",
        },
        { role: "user", content: enhancedPrompt },
      ],
      response_format: { type: "json_schema", json_schema: jsonSchema },
      temperature: temperature,
      top_p: 0.95, // Добавляем top_p для большего разнообразия
    };

    const completion = await openai.chat.completions.create(completionParams as any);

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "OPENAI_EMPTY_RESPONSE", "Empty response from OpenAI");
    return content;
  } catch (error: any) {
    // Handle OpenAI API errors
    if (error?.status === 429) {
      throw new HttpError(
        429,
        "OPENAI_QUOTA_EXCEEDED",
        "Превышена квота OpenAI API. Проверьте баланс и настройки биллинга на https://platform.openai.com/account/billing"
      );
    }
    if (error?.status === 401) {
      throw new HttpError(
        401,
        "OPENAI_AUTH_ERROR",
        "Неверный API ключ OpenAI. Проверьте OPENAI_API_KEY в .env файле"
      );
    }
    if (error?.status === 402) {
      throw new HttpError(
        402,
        "OPENAI_PAYMENT_REQUIRED",
        "Требуется оплата OpenAI API. Проверьте баланс на https://platform.openai.com/account/billing"
      );
    }
    // Re-throw other errors
    throw error;
  }
}

export async function generateSingle(matchesData?: MatchWithOdds[]): Promise<SinglePrediction> {
  // Если матчи не переданы, получаем их
  if (!matchesData || matchesData.length === 0) {
    matchesData = getMatchesFromDb();
  }
  
  if (matchesData.length === 0) {
    throw new HttpError(500, "NO_MATCHES", "Не удалось получить матчи");
  }
  
  console.log(`[generateSingle] Analyzing ${matchesData.length} real matches with odds`);
  
  // Получаем список недавно выбранных матчей для исключения
  const excludeMatches = recentSelections.slice(-MAX_RECENT_SELECTIONS);
  console.log(`[generateSingle] Excluding recent selections: ${excludeMatches.join(', ')}`);
  
  const prompt = buildSinglePrompt(matchesData, excludeMatches);
  // Используем более высокую температуру (1.0) для максимального разнообразия в выборе матчей
  // Не используем web search здесь, так как он работает только для одного матча
  // ИИ должен использовать свои знания для анализа всех матчей
  const raw = await callStrictJson(prompt, singleJsonSchema, 1.0, false);
  const parsed = safeJsonParse(raw);
  const result = SinglePredictionSchema.parse(parsed);
  
  // Валидация: проверяем, что AI выбрал один из реальных матчей
  let validatedMatch = result.match;
  const matchFound = matchesData.some(m => {
    const matchStr = `${m.homeTeam} - ${m.awayTeam}`;
    // Проверяем, содержит ли результат названия команд (AI может перевести на русский)
    return result.match.includes(m.homeTeam) || 
           result.match.includes(m.awayTeam) ||
           matchStr.includes(result.match.split(' - ')[0]?.trim() || '') ||
           matchStr.includes(result.match.split(' - ')[1]?.trim() || '');
  });
  
  if (!matchFound && matchesData.length > 0) {
    console.warn(`[generateSingle] AI returned match not matching list: "${result.match}". Using first available match.`);
    const firstMatch = matchesData[0];
    validatedMatch = `${firstMatch.homeTeam} - ${firstMatch.awayTeam}`;
  }
  
  // Валидация коэффициента: должен быть реальным из списка матчей
  let validatedOdds = result.odds;
  const selectedMatch = matchesData.find(m => {
    const matchStr = `${m.homeTeam} - ${m.awayTeam}`;
    return result.match.includes(m.homeTeam) || result.match.includes(m.awayTeam);
  });
  
  if (selectedMatch) {
    // Определяем реальный коэффициент на основе прогноза
    const predictionText = result.prediction.toLowerCase();
    if (predictionText.includes('победа хозяев') || predictionText.includes('хозяева') || predictionText.includes('п1')) {
      validatedOdds = selectedMatch.odds.home;
      console.log(`[generateSingle] Using home odds: ${validatedOdds} for prediction: ${result.prediction}`);
    } else if (predictionText.includes('победа гостей') || predictionText.includes('гости') || predictionText.includes('п2')) {
      validatedOdds = selectedMatch.odds.away;
      console.log(`[generateSingle] Using away odds: ${validatedOdds} for prediction: ${result.prediction}`);
    } else if (predictionText.includes('ничья') || predictionText.includes('x')) {
      validatedOdds = selectedMatch.odds.draw;
      console.log(`[generateSingle] Using draw odds: ${validatedOdds} for prediction: ${result.prediction}`);
    } else {
      // Для тоталов и других прогнозов проверяем, соответствует ли коэффициент реальным
      const realOdds = [selectedMatch.odds.home, selectedMatch.odds.draw, selectedMatch.odds.away];
      const isRealOdd = realOdds.some(odd => Math.abs(odd - validatedOdds) < 0.1);
      
      if (!isRealOdd) {
        // Используем самый низкий коэффициент (наиболее вероятный исход)
        validatedOdds = Math.min(selectedMatch.odds.home, selectedMatch.odds.draw, selectedMatch.odds.away);
        console.warn(`[generateSingle] Odds ${result.odds} doesn't match real odds. Using ${validatedOdds} from match.`);
      }
    }
  } else {
    // Если матч не найден, используем средний коэффициент из диапазона
    if (validatedOdds < 1.30 || validatedOdds > 1.60) {
      console.warn(`[generateSingle] Odds ${validatedOdds} out of range. Adjusting to 1.45.`);
      validatedOdds = 1.45;
    }
  }
  
  // Валидация уверенности: должна быть 70-85% для минимального риска
  let validatedConfidence = result.confidence;
  if (validatedConfidence < 70 || validatedConfidence > 85) {
    console.warn(`[generateSingle] Confidence ${validatedConfidence} out of range. Adjusting to 75.`);
    validatedConfidence = 75;
  }
  
  const finalResult = {
      ...result,
    match: validatedMatch,
    odds: validatedOdds,
    confidence: validatedConfidence,
  };
  
  // Сохраняем выбор в список недавних для разнообразия
  recentSelections.push(validatedMatch);
  // Оставляем только последние MAX_RECENT_SELECTIONS выборов
  if (recentSelections.length > MAX_RECENT_SELECTIONS) {
    recentSelections.shift();
  }
  console.log(`[generateSingle] Saved selection to recent list. Current recent selections: ${recentSelections.join(', ')}`);
  
  return finalResult;
}

export async function generateExpress(matchesData?: MatchWithOdds[]): Promise<ExpressPrediction> {
  // Если матчи не переданы, получаем их
  if (!matchesData || matchesData.length === 0) {
    matchesData = getMatchesFromDb();
  }
  
  if (matchesData.length < 3) {
    throw new HttpError(500, "NOT_ENOUGH_MATCHES", "Need at least 3 matches for express");
  }
  
  console.log(`[generateExpress] Analyzing ${matchesData.length} real matches with odds`);
  
  // Получаем список недавно выбранных комбинаций матчей для исключения
  const excludeMatches: string[] = [];
  recentExpressSelections.forEach(selection => {
    selection.forEach(match => {
      if (!excludeMatches.includes(match)) {
        excludeMatches.push(match);
      }
    });
  });
  console.log(`[generateExpress] Excluding recent selections: ${excludeMatches.join(', ')}`);
  
  const prompt = buildExpressPrompt(matchesData, excludeMatches);
  // Используем более высокую температуру (1.0) для максимального разнообразия
  const raw = await callStrictJson(prompt, expressJsonSchema, 1.0, false);
  const parsed = safeJsonParse(raw);
  const result = ExpressPredictionSchema.parse(parsed) as ExpressPrediction;

  // Валидация: проверяем, что AI выбрал реальные матчи и коэффициенты
  const validatedBets = result.bets.map((bet) => {
    // Находим соответствующий матч в списке
    const selectedMatch = matchesData.find(m => {
      const matchStr = `${m.homeTeam} - ${m.awayTeam}`;
      return bet.match.includes(m.homeTeam) || bet.match.includes(m.awayTeam);
    });
    
    if (!selectedMatch) {
      console.warn(`[generateExpress] Bet match "${bet.match}" not found in list, keeping AI translation`);
      return bet;
    }
    
    // Определяем реальный коэффициент на основе прогноза
    let validatedOdds = bet.odds;
    const predictionText = bet.prediction.toLowerCase();
    
    if (predictionText.includes('победа хозяев') || predictionText.includes('хозяева') || predictionText.includes('п1')) {
      validatedOdds = selectedMatch.odds.home;
      console.log(`[generateExpress] Using home odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else if (predictionText.includes('победа гостей') || predictionText.includes('гости') || predictionText.includes('п2')) {
      validatedOdds = selectedMatch.odds.away;
      console.log(`[generateExpress] Using away odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else if (predictionText.includes('ничья') || predictionText.includes('x')) {
      validatedOdds = selectedMatch.odds.draw;
      console.log(`[generateExpress] Using draw odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else {
      // Для тоталов проверяем, соответствует ли коэффициент реальным
      const realOdds = [selectedMatch.odds.home, selectedMatch.odds.draw, selectedMatch.odds.away];
      const isRealOdd = realOdds.some(odd => Math.abs(odd - validatedOdds) < 0.1);
      
      if (!isRealOdd) {
        // Для тоталов используем средний коэффициент из доступных
        validatedOdds = (selectedMatch.odds.home + selectedMatch.odds.draw + selectedMatch.odds.away) / 3;
        console.warn(`[generateExpress] Odds ${bet.odds} doesn't match real odds for total. Using average: ${validatedOdds}`);
      }
    }
    
    return {
      ...bet,
      odds: validatedOdds
    };
  });

  // Ensure total_odds matches product (tolerate small floating error)
  const product = validatedBets.reduce((acc, b) => acc * b.odds, 1);
  const rounded = Math.round(product * 100) / 100;
  
  const finalResult = {
    ...result,
    bets: validatedBets,
    total_odds: rounded,
  };
  
  // Сохраняем выбор в список недавних для разнообразия
  const selectedMatches = validatedBets.map(bet => bet.match);
  recentExpressSelections.push(selectedMatches);
  // Оставляем только последние MAX_RECENT_SELECTIONS выборов
  if (recentExpressSelections.length > MAX_RECENT_SELECTIONS) {
    recentExpressSelections.shift();
  }
  console.log(`[generateExpress] Saved selection to recent list. Current recent selections: ${recentExpressSelections.map(s => s.join(', ')).join('; ')}`);
  
  return finalResult;
}

export async function generateExpress5(matchesData?: MatchWithOdds[]): Promise<Express5Prediction> {
  // Если матчи не переданы, получаем их
  if (!matchesData || matchesData.length === 0) {
    matchesData = getMatchesFromDb();
  }
  
  if (matchesData.length < 5) {
    throw new HttpError(500, "NOT_ENOUGH_MATCHES", "Need at least 5 matches for express x5");
  }
  
  console.log(`[generateExpress5] Analyzing ${matchesData.length} real matches with odds`);
  
  // Получаем список недавно выбранных комбинаций матчей для исключения
  const excludeMatches: string[] = [];
  recentExpress5Selections.forEach(selection => {
    selection.forEach(match => {
      if (!excludeMatches.includes(match)) {
        excludeMatches.push(match);
      }
    });
  });
  console.log(`[generateExpress5] Excluding recent selections: ${excludeMatches.join(', ')}`);
  
  const prompt = buildExpress5Prompt(matchesData, excludeMatches);
  // Используем более высокую температуру (1.0) для максимального разнообразия
  const raw = await callStrictJson(prompt, express5JsonSchema, 1.0, false);
  const parsed = safeJsonParse(raw);
  const result = Express5PredictionSchema.parse(parsed) as Express5Prediction;

  // Валидация: проверяем, что AI выбрал реальные матчи и коэффициенты
  const validatedBets = result.bets.map((bet) => {
    // Находим соответствующий матч в списке
    const selectedMatch = matchesData.find(m => {
      const matchStr = `${m.homeTeam} - ${m.awayTeam}`;
      return bet.match.includes(m.homeTeam) || bet.match.includes(m.awayTeam);
    });
    
    if (!selectedMatch) {
      console.warn(`[generateExpress5] Bet match "${bet.match}" not found in list, keeping AI translation`);
      return bet;
    }
    
    // Определяем реальный коэффициент на основе прогноза
    let validatedOdds = bet.odds;
    const predictionText = bet.prediction.toLowerCase();
    
    if (predictionText.includes('победа хозяев') || predictionText.includes('хозяева') || predictionText.includes('п1')) {
      validatedOdds = selectedMatch.odds.home;
      console.log(`[generateExpress5] Using home odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else if (predictionText.includes('победа гостей') || predictionText.includes('гости') || predictionText.includes('п2')) {
      validatedOdds = selectedMatch.odds.away;
      console.log(`[generateExpress5] Using away odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else if (predictionText.includes('ничья') || predictionText.includes('x')) {
      validatedOdds = selectedMatch.odds.draw;
      console.log(`[generateExpress5] Using draw odds: ${validatedOdds} for prediction: ${bet.prediction}`);
    } else {
      // Для тоталов проверяем, соответствует ли коэффициент реальным
      const realOdds = [selectedMatch.odds.home, selectedMatch.odds.draw, selectedMatch.odds.away];
      const isRealOdd = realOdds.some(odd => Math.abs(odd - validatedOdds) < 0.1);
      
      if (!isRealOdd) {
        // Для тоталов используем средний коэффициент из доступных
        validatedOdds = (selectedMatch.odds.home + selectedMatch.odds.draw + selectedMatch.odds.away) / 3;
        console.warn(`[generateExpress5] Odds ${bet.odds} doesn't match real odds for total. Using average: ${validatedOdds}`);
      }
    }
    
    return {
      ...bet,
      odds: validatedOdds
    };
  });

  // Ensure total_odds matches product (tolerate small floating error)
  const product = validatedBets.reduce((acc, b) => acc * b.odds, 1);
  const rounded = Math.round(product * 100) / 100;
  
  const finalResult = {
    ...result,
    bets: validatedBets,
    total_odds: rounded,
  };
  
  // Сохраняем выбор в список недавних для разнообразия
  const selectedMatches = validatedBets.map(bet => bet.match);
  recentExpress5Selections.push(selectedMatches);
  // Оставляем только последние MAX_RECENT_SELECTIONS выборов
  if (recentExpress5Selections.length > MAX_RECENT_SELECTIONS) {
    recentExpress5Selections.shift();
  }
  console.log(`[generateExpress5] Saved selection to recent list. Current recent selections: ${recentExpress5Selections.map(s => s.join(', ')).join('; ')}`);
  
  return finalResult;
}

export async function analyzeMatch(match: string, league?: string, date?: string): Promise<MatchAnalysis> {
  console.log(`[analyzeMatch] Analyzing match: ${match}`);
  
  const prompt = buildMatchAnalysisPrompt(match, league, date);
  // Используем низкую температуру (0.2) для стабильных результатов анализа одного и того же матча
  // Пробуем использовать web search для получения актуальной информации
  const raw = await callStrictJson(prompt, matchAnalysisJsonSchema, 0.2, true);
  const parsed = safeJsonParse(raw);
  const result = MatchAnalysisSchema.parse(parsed);
  
  // Валидация: AI переводит названия команд на русский, поэтому просто проверяем что есть название
  if (!result.match || result.match.trim().length === 0) {
    console.warn(`[analyzeMatch] AI returned empty match name. Using original: ${match}`);
    result.match = match;
  }
  
  // Валидация процента риска
  if (result.riskPercent < 0 || result.riskPercent > 100) {
    console.warn(`[analyzeMatch] Invalid riskPercent: ${result.riskPercent}. Setting to 50.`);
    result.riskPercent = 50;
  }
  
  // Валидация коэффициента - используем ТОЛЬКО то, что вернул OpenAI из реальных источников
  let validatedOdds = result.odds;
  
  // Проверяем, не является ли коэффициент маркером "не найдено" (0 или 99.99)
  const isNotFoundMarker = validatedOdds === 0 || validatedOdds >= 99.0;
  
  // Только базовая валидация диапазона (1.0-10.0), без пересчета
  if (isNotFoundMarker || validatedOdds < 1.0 || validatedOdds > 10.0) {
    if (isNotFoundMarker) {
      console.warn(`[analyzeMatch] AI returned marker for "odds not found": ${validatedOdds}. Real bookmaker odds were not found in search results.`);
    } else {
      console.warn(`[analyzeMatch] Invalid odds range: ${validatedOdds}. Must be 1.0-10.0.`);
    }
    
    // Только если коэффициент совсем невалидный или не найден - используем расчет на основе риска
    // Но это должно быть редко, так как мы просим OpenAI искать реальные коэффициенты
    const successProbability = (100 - result.riskPercent) / 100;
    if (successProbability > 0 && successProbability <= 1) {
      validatedOdds = Math.round((1 / successProbability) * 100) / 100;
      if (validatedOdds < 1.10) validatedOdds = 1.10;
      if (validatedOdds > 10.0) validatedOdds = 10.0;
    } else {
      validatedOdds = 2.0; // Fallback
    }
    console.log(`[analyzeMatch] Using calculated odds (real odds not found): ${validatedOdds} for risk: ${result.riskPercent}%`);
    console.warn(`[analyzeMatch] WARNING: Real bookmaker odds were not found! Using calculated value. This may not match actual bookmaker odds.`);
  } else {
    // Используем коэффициент, который вернул OpenAI (предполагаем, что он из реальных источников)
    console.log(`[analyzeMatch] ✓ Using AI-provided REAL bookmaker odds: ${validatedOdds} for risk: ${result.riskPercent}%`);
    console.log(`[analyzeMatch] This coefficient should match actual bookmaker odds from search results.`);
  }
  
  return {
    ...result,
    odds: validatedOdds,
  };
}

