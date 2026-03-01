import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { Match } from './schemas.js';

// Используем плагин stealth для обхода защиты от ботов
puppeteer.use(StealthPlugin());

export interface MatchWithOdds extends Match {
  odds: {
    home: number; // П1
    draw: number; // X
    away: number; // П2
  };
}

/**
 * Парсит одну страницу vbet.am и извлекает матчи с коэффициентами
 */
async function scrapeSingleUrl(url: string, leagueName: string): Promise<MatchWithOdds[]> {
  let browser;
  try {
    console.log('[Vbet] Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Устанавливаем реалистичный User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Убираем все признаки автоматизации
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });
      
      (window as any).chrome = {
        runtime: {},
      };
    });
    
    // Устанавливаем реалистичные заголовки
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });
    
    console.log('[Vbet] Navigating to page...');
    
    // domcontentloaded быстрее чем networkidle0; на тяжёлых сайтах networkidle0 часто не наступает
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    
    console.log('[Vbet] Page loaded, waiting for content...');
    
    // Ждем появления элементов матчей
    let matchItemsFound = false;
    
    try {
      await page.waitForSelector('.multi-column-content', {
        timeout: 10000,
      });
      
      const count = await page.evaluate(() => {
        return document.querySelectorAll('.multi-column-content').length;
      });
      console.log(`[Vbet] Found ${count} match items!`);
      matchItemsFound = true;
    } catch (e) {
      console.warn('[Vbet] waitForSelector timeout, trying manual check...');
      
      // Если waitForSelector не сработал, проверяем вручную
      for (let i = 0; i < 5; i++) {
        const count = await page.evaluate(() => {
          return document.querySelectorAll('.multi-column-content').length;
        });
        
        if (count > 0) {
          console.log(`[Vbet] Found ${count} match items after ${i * 1} seconds`);
          matchItemsFound = true;
          break;
        }
        
        console.log(`[Vbet] Waiting for match items... (${i * 1}s)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!matchItemsFound) {
      // Сохраняем HTML для отладки
      const html = await page.content();
      const htmlPath = path.join(process.cwd(), `debug-vbet-${Date.now()}.html`);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      console.log(`[Vbet] HTML saved to: ${htmlPath}`);
      
      // Пробуем найти альтернативные селекторы
      const debugInfo = await page.evaluate(() => {
        return {
          multiColumn: document.querySelectorAll('.multi-column-content').length,
          multiColumnUl: document.querySelectorAll('ul.multi-column-content').length,
          competition: document.querySelectorAll('.competition-bc').length,
          bodyText: document.body.innerText.substring(0, 500),
          url: window.location.href,
        };
      });
      console.log('[Vbet] Debug info:', JSON.stringify(debugInfo, null, 2));
      
      // Не выбрасываем ошибку, просто возвращаем пустой массив
      console.warn('[Vbet] Match items not found, returning empty array');
      return [];
    }
    
    console.log('[Vbet] Match items found, extracting...');
    
    // Небольшая задержка для полной загрузки
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Парсим матчи
    const matches = await page.evaluate((leagueName) => {
      const results: any[] = [];
      
      // Пробуем разные селекторы для поиска матчей
      let matchItems = document.querySelectorAll('.multi-column-content');
      
      // Если не нашли, пробуем альтернативные селекторы
      if (matchItems.length === 0) {
        matchItems = document.querySelectorAll('ul.multi-column-content');
      }
      
      console.log(`[Vbet] Found ${matchItems.length} match items for parsing`);
      
      // Если все еще нет элементов, проверяем структуру страницы
      if (matchItems.length === 0) {
        const debugInfo = {
          hasMultiColumn: document.querySelectorAll('[class*="multi-column"]').length,
          hasCompetition: document.querySelectorAll('.competition-bc').length,
          bodyText: document.body.innerText.substring(0, 500),
        };
        console.log('[Vbet] Debug info:', JSON.stringify(debugInfo));
        return results;
      }
      
      matchItems.forEach((item, index) => {
        try {
          // Извлекаем команды
          const teamsContainer = item.querySelector('.multi-column-teams');
          if (!teamsContainer) {
            console.log(`[Vbet] Match ${index}: No teams container`);
            return;
          }
          
          const teamElements = teamsContainer.querySelectorAll('.multi-column-single-team p');
          if (teamElements.length < 2) {
            console.log(`[Vbet] Match ${index}: Not enough team elements (${teamElements.length})`);
            return;
          }
          
          const homeTeam = teamElements[0].textContent?.trim() || '';
          const awayTeam = teamElements[1].textContent?.trim() || '';
          
          if (!homeTeam || !awayTeam) {
            console.log(`[Vbet] Match ${index}: Empty team names`);
            return;
          }
          
          // Извлекаем дату и время
          const timeElement = item.querySelector('.multi-column-time-icon time');
          let timeStr = '';
          let dateStr = '';
          
          if (timeElement) {
            timeStr = timeElement.textContent?.trim() || '';
          }
          
          // Ищем дату в заголовке секции - ищем ближайший родительский элемент с датой
          let parent = item.parentElement;
          while (parent && !dateStr) {
            const dateEl = parent.querySelector('.c-title-bc');
            if (dateEl) {
              dateStr = dateEl.textContent?.trim() || '';
              break;
            }
            parent = parent.parentElement;
          }
          
          // Если не нашли в родителях, ищем на всей странице
          if (!dateStr) {
            const dateElement = document.querySelector('.c-title-bc');
            if (dateElement) {
              dateStr = dateElement.textContent?.trim() || '';
            }
          }
          
          // Преобразуем дату в формат YYYY-MM-DD
          let fullDate = '';
          if (dateStr) {
            // Формат: DD.MM.YYYY
            const parts = dateStr.split('.');
            if (parts.length === 3) {
              const [day, month, year] = parts;
              fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
          }
          
          if (!fullDate) {
            // Если дата не найдена, используем сегодняшнюю
            fullDate = new Date().toISOString().split('T')[0];
          }
          
          // Извлекаем коэффициенты - ищем во втором li элементе (первый - команды, второй - коэффициенты)
          const listItems = item.querySelectorAll('li');
          let homeOdd = 0;
          let drawOdd = 0;
          let awayOdd = 0;
          
          // Ищем li с коэффициентами (обычно это второй li)
          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const oddsCells = li.querySelectorAll('.market-odd-bc');
            
            // Если нашли 3 коэффициента, это исходы (П1, X, П2)
            if (oddsCells.length >= 3) {
              homeOdd = parseFloat(oddsCells[0].textContent?.trim() || '0');
              drawOdd = parseFloat(oddsCells[1].textContent?.trim() || '0');
              awayOdd = parseFloat(oddsCells[2].textContent?.trim() || '0');
              break;
            }
          }
          
          // Если не нашли в li, пробуем найти напрямую в item
          if (homeOdd === 0 || drawOdd === 0 || awayOdd === 0) {
            const allOdds = item.querySelectorAll('.market-odd-bc');
            if (allOdds.length >= 3) {
              homeOdd = parseFloat(allOdds[0].textContent?.trim() || '0');
              drawOdd = parseFloat(allOdds[1].textContent?.trim() || '0');
              awayOdd = parseFloat(allOdds[2].textContent?.trim() || '0');
            }
          }
          
          // Добавляем матч только если есть все коэффициенты
          if (homeOdd > 0 && drawOdd > 0 && awayOdd > 0) {
            results.push({
              homeTeam,
              awayTeam,
              date: fullDate,
              time: timeStr || undefined,
              league: leagueName,
              odds: {
                home: homeOdd,
                draw: drawOdd,
                away: awayOdd,
              },
            });
            console.log(`[Vbet] Match ${index} parsed: ${homeTeam} vs ${awayTeam}`);
          } else {
            console.log(`[Vbet] Match ${index} skipped: missing odds (${homeOdd}, ${drawOdd}, ${awayOdd})`);
          }
        } catch (error) {
          console.error(`[Vbet] Error parsing match item ${index}:`, error);
        }
      });
      
      return results;
    }, leagueName);
    
    console.log(`[Vbet] Found ${matches.length} matches with odds`);
    
    return matches;

  } catch (error: any) {
    console.error(`[Vbet] Error scraping URL ${url}:`, error);
    console.error(`[Vbet] Error stack:`, error?.stack);
    // Возвращаем пустой массив, чтобы другие URL могли быть обработаны
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Парсит все страницы vbet.am и извлекает матчи с коэффициентами
 * Парсит каждую ссылку отдельно и объединяет результаты
 */
export async function scrapeVbetMatches(): Promise<MatchWithOdds[]> {
  console.log('[Vbet] Starting to scrape matches from multiple links...');
  
  // Получаем ссылки из конфигурации
  const { getVbetUrls } = await import('./config.js');
  const urls = getVbetUrls();
  
  if (urls.length === 0) {
    console.warn('[Vbet] No URLs configured in database. Add URLs via admin panel.');
    return [];
  }
  
  const allMatches: MatchWithOdds[] = [];
  const errors: string[] = [];
  
  // Парсим все ссылки последовательно
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[Vbet] Scraping link ${i + 1}/${urls.length}: ${url}`);
    
    try {
      const matches = await scrapeSingleUrl(url, `Лига ${i + 1}`);
      console.log(`[Vbet] Link ${i + 1}: Found ${matches.length} matches`);
      if (matches.length > 0) {
        allMatches.push(...matches);
      } else {
        console.warn(`[Vbet] Link ${i + 1} returned 0 matches`);
      }
    } catch (error: any) {
      console.error(`[Vbet] Error scraping link ${i + 1}:`, error.message);
      errors.push(`Link ${i + 1}: ${error.message}`);
    }
    
    // Задержка между запросами (кроме последнего)
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`[Vbet] Total matches found: ${allMatches.length}`);
  
  // Сохраняем результаты парсинга в JSON файл
  const debugData = {
    timestamp: new Date().toISOString(),
    totalMatchesFound: allMatches.length,
    urlsUsed: urls,
    matches: allMatches,
    errors: errors.length > 0 ? errors : undefined,
  };
  
  const jsonPath = path.join(process.cwd(), 'debug-vbet.json');
  fs.writeFileSync(jsonPath, JSON.stringify(debugData, null, 2), 'utf-8');
  console.log(`[Vbet] Debug data saved to: ${jsonPath}`);
  
  return allMatches;
}

