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

const TOTOGAMING_URL = 'https://sport.totogaming.am/ru/sport/pre-match/?sport=1&country=1287&champ=4484&data=eyIxIjp7IjEyODciOls0NDg0XX19';

/**
 * Парсит страницу totogaming.am и извлекает матчи с коэффициентами
 */
export async function scrapeTotogamingMatches(): Promise<MatchWithOdds[]> {
  let browser;
  try {
    console.log('[Totogaming] Launching browser...');
    // Используем headless: 'new' с улучшенными настройками для обхода защиты
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-blink-features',
        '--disable-extensions',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Перехватываем сетевые запросы для отладки
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('api') || url.includes('ajax') || url.includes('data')) {
        console.log(`[Totogaming] Network request: ${url} - Status: ${response.status()}`);
      }
    });
    
    // Устанавливаем реалистичный User-Agent (актуальная версия Chrome)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Убираем все признаки автоматизации
    await page.evaluateOnNewDocument(() => {
      // Убираем webdriver флаг
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Переопределяем permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission } as PermissionStatus) :
          originalQuery(parameters)
      );
      
      // Добавляем реалистичные свойства
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });
      
      // Переопределяем chrome объект
      (window as any).chrome = {
        runtime: {},
      };
    });
    
    // Устанавливаем реалистичные заголовки
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });
    
    console.log('[Totogaming] Navigating to page...');
    
    // Сначала заходим на главную страницу, чтобы установить cookies
    try {
      await page.goto('https://sport.totogaming.am', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      console.log('[Totogaming] Main page loaded, waiting...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.warn('[Totogaming] Could not load main page, continuing...');
    }
    
    // Теперь переходим на нужную страницу
    await page.goto(TOTOGAMING_URL, {
      waitUntil: 'networkidle0',
      timeout: 20000, // 20 секунд
    });
    
    console.log('[Totogaming] Page loaded, waiting for dynamic content...');
    
    // Проверяем наличие iframe - контент загружается в iframe!
    console.log('[Totogaming] Checking for iframe...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем загрузки iframe
    
    const iframeElement = await page.$('#sport_div_iframe iframe');
    
    if (!iframeElement) {
      // Пробуем найти iframe другим способом
      const allIframes = await page.$$('iframe');
      console.log(`[Totogaming] Found ${allIframes.length} iframes on page`);
      if (allIframes.length === 0) {
        throw new Error('Iframe not found! Content might be loaded differently.');
      }
    }
    
    console.log('[Totogaming] Iframe found, waiting for it to load...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Увеличиваем время ожидания
    
    // Получаем frame из iframe
    const frames = page.frames();
    console.log(`[Totogaming] Total frames: ${frames.length}`);
    
    let contentFrame = null;
    for (const frame of frames) {
      const frameUrl = frame.url();
      console.log(`[Totogaming] Frame URL: ${frameUrl}`);
      if (frameUrl.includes('sportiframe.totogaming.am')) {
        console.log(`[Totogaming] Found content frame: ${frameUrl}`);
        contentFrame = frame;
        break;
      }
    }
    
    if (!contentFrame) {
      console.error('[Totogaming] Content frame not found! Available frames:');
      for (const frame of frames) {
        console.error(`  - ${frame.url()}`);
      }
      throw new Error('Content frame not found in iframe!');
    }
    
    console.log('[Totogaming] Content frame found, checking iframe content...');
    
    // Ждем загрузки контента в iframe
    console.log('[Totogaming] Waiting for content in iframe...');
    let matchItemsFound = false;
    
    try {
      await contentFrame.waitForFunction(
        () => {
          return document.querySelectorAll('.tg__match_item, [class*="match_item"], [class*="prematch"]').length > 0;
        },
        { timeout: 15000 } // 15 секунд
      );
      
      const count = await contentFrame.evaluate(() => {
        return document.querySelectorAll('.tg__match_item, [class*="match_item"]').length;
      });
      console.log(`[Totogaming] Found ${count} match items in iframe!`);
      matchItemsFound = true;
    } catch (e) {
      console.warn('[Totogaming] waitForFunction timeout in iframe, trying manual check...');
      
      // Если waitForFunction не сработал, проверяем вручную
      for (let i = 0; i < 10; i++) { // Максимум 20 секунд (10 * 2)
        const count = await contentFrame.evaluate(() => {
          return document.querySelectorAll('.tg__match_item, [class*="match_item"]').length;
        });
        
        if (count > 0) {
          console.log(`[Totogaming] Found ${count} match items in iframe after ${i * 2} seconds`);
          matchItemsFound = true;
          break;
        }
        
        console.log(`[Totogaming] Waiting for match items in iframe... (${i * 2}s)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Используем contentFrame для парсинга
    const targetPage = contentFrame;
    
    // Имитируем человеческое поведение - небольшая задержка
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Сохраняем HTML из iframe для отладки
    const iframeHTML = await contentFrame.evaluate(() => document.documentElement.outerHTML);
    const htmlPath = path.join(process.cwd(), 'debug-totogaming.html');
    fs.writeFileSync(htmlPath, iframeHTML, 'utf-8');
    console.log(`[Totogaming] Iframe HTML saved to: ${htmlPath}`);

    // Проверяем, что элементы найдены в iframe
    if (!matchItemsFound) {
      // Финальная проверка перед ошибкой
      const finalCheck = await targetPage.evaluate(() => {
        return {
          matchItems: document.querySelectorAll('.tg__match_item, [class*="match_item"]').length,
          bodyText: document.body.innerText.substring(0, 300),
          url: window.location.href,
        };
      });
      console.log('[Totogaming] Final check in iframe:', finalCheck);
      throw new Error(`Match items not found in iframe. Found ${finalCheck.matchItems} items. URL: ${finalCheck.url}. Body text preview: ${finalCheck.bodyText.substring(0, 200)}`);
    }

    console.log('[Totogaming] Match items found in iframe, extracting...');
    
    // Дополнительное ожидание для полной загрузки контента в iframe
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Имитируем человеческое поведение - прокрутка страницы в iframe
    await targetPage.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve(undefined);
          }
        }, 100);
      });
    });
    
    // Небольшая задержка после прокрутки
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Прокручиваем обратно вверх в iframe
    await targetPage.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Пробуем разные селекторы для поиска матчей
    console.log('[Totogaming] Trying to find match items...');
    let matchItemsCount = 0;
    let workingSelector = '.tg__match_item';
    
    // Пробуем разные селекторы
    const selectors = [
      '.tg__match_item',
      '[class*="match_item"]',
      '[class*="prematch"] [class*="match"]',
      '.prematch_event_odds_container',
    ];
    
    for (const selector of selectors) {
      try {
        matchItemsCount = await targetPage.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, selector);
        console.log(`[Totogaming] Selector "${selector}": ${matchItemsCount} items`);
        if (matchItemsCount > 0) {
          workingSelector = selector;
          console.log(`[Totogaming] Using selector "${selector}"`);
          break;
        }
      } catch (e) {
        console.warn(`[Totogaming] Error with selector "${selector}":`, e);
      }
    }
    
    if (matchItemsCount === 0) {
      // Сохраняем HTML перед ошибкой из iframe
      const fullHTML = await targetPage.evaluate(() => document.documentElement.outerHTML);
      const htmlPath = path.join(process.cwd(), 'debug-totogaming.html');
      fs.writeFileSync(htmlPath, fullHTML, 'utf-8');
      console.log(`[Totogaming] HTML saved to: ${htmlPath}`);
      
      // Пробуем найти альтернативные селекторы в iframe
      const alternativeSelectors = await targetPage.evaluate(() => {
        return {
          allDivs: document.querySelectorAll('div').length,
          hasPrematch: document.querySelectorAll('[class*="prematch"]').length,
          hasMatch: document.querySelectorAll('[class*="match"]').length,
          hasOdds: document.querySelectorAll('[class*="odd"]').length,
          bodyText: document.body.innerText.substring(0, 500),
          allClasses: Array.from(document.querySelectorAll('div')).slice(0, 20).map(el => el.className),
        };
      });
      console.log('[Totogaming] Alternative selectors check:', JSON.stringify(alternativeSelectors, null, 2));
      throw new Error('No match items found. Page might require authentication or use different structure. HTML saved to debug-totogaming.html');
    }
    
    const matches = await targetPage.evaluate((selector) => {
      // Ищем элементы матчей используя рабочий селектор
      const matchItems = document.querySelectorAll(selector);
      const results: any[] = [];
      
      console.log(`[Totogaming] Found ${matchItems.length} match items for parsing`);

      matchItems.forEach((item) => {
        try {
          // Извлекаем команды
          const teamsContainer = item.querySelector('.tg__teams');
          if (!teamsContainer) return;

          const teamNames = teamsContainer.querySelectorAll('.prematch_name');
          if (teamNames.length < 2) return;

          const homeTeam = teamNames[0].textContent?.trim() || '';
          const awayTeam = teamNames[1].textContent?.trim() || '';

          if (!homeTeam || !awayTeam) return;

          // Извлекаем дату и время
          const header = item.querySelector('.tg__match_header');
          if (!header) return;

          const dateTimeElements = header.querySelectorAll('.tg--mar-r-8');
          let dateStr = '';
          let timeStr = '';

          // Ищем дату и время в элементах
          dateTimeElements.forEach((el) => {
            const text = el.textContent?.trim() || '';
            // Дата в формате DD.MM
            if (text.match(/^\d{2}\.\d{2}$/)) {
              dateStr = text;
            }
            // Время в формате HH:MM
            if (text.match(/^\d{2}:\d{2}$/)) {
              timeStr = text;
            }
          });

          // Преобразуем дату в формат YYYY-MM-DD
          let fullDate = '';
          if (dateStr) {
            const [day, month] = dateStr.split('.');
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            const currentDay = currentDate.getDate();
            
            const matchDay = parseInt(day);
            const matchMonth = parseInt(month);
            
            // Определяем год
            let year = currentYear;
            if (matchMonth < currentMonth) {
              // Если месяц уже прошел в этом году, значит это следующий год
              year = currentYear + 1;
            } else if (matchMonth === currentMonth) {
              // Если месяц совпадает, проверяем день
              if (matchDay < currentDay) {
                year = currentYear + 1;
              }
            }
            // Если matchMonth > currentMonth, это текущий год
            
            fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            // Если дата не найдена, используем сегодняшнюю
            fullDate = new Date().toISOString().split('T')[0];
          }

          // Извлекаем коэффициенты
          const oddsContainer = item.querySelector('.prematch_staks_left');
          if (!oddsContainer) return;

          const oddsElements = oddsContainer.querySelectorAll('.odCnt');
          let homeOdd = 0;
          let drawOdd = 0;
          let awayOdd = 0;

          oddsElements.forEach((oddEl) => {
            const oddNameEl = oddEl.querySelector('.tg__match_item_odd_name');
            const oddValueEl = oddEl.querySelector('.prematch_stake_odd_factor');
            
            if (!oddNameEl || !oddValueEl) return;

            const oddName = oddNameEl.textContent?.trim() || '';
            const oddValue = parseFloat(oddValueEl.textContent?.trim() || '0');

            if (oddName === 'П1' && oddValue > 0) {
              homeOdd = oddValue;
            } else if (oddName === 'X' && oddValue > 0) {
              drawOdd = oddValue;
            } else if (oddName === 'П2' && oddValue > 0) {
              awayOdd = oddValue;
            }
          });

          // Добавляем матч только если есть все коэффициенты
          if (homeOdd > 0 && drawOdd > 0 && awayOdd > 0) {
            results.push({
              homeTeam,
              awayTeam,
              date: fullDate,
              time: timeStr || undefined,
              league: 'Премьер-лига Англии',
              odds: {
                home: homeOdd,
                draw: drawOdd,
                away: awayOdd,
              },
            });
          }
        } catch (error) {
          console.error('[Totogaming] Error parsing match item:', error);
        }
      });

      return results;
    }, workingSelector);

    console.log(`[Totogaming] Found ${matches.length} matches with odds`);
    
    // Сохраняем результаты парсинга в JSON файл
    const debugData = {
      timestamp: new Date().toISOString(),
      url: TOTOGAMING_URL,
      matchesFound: matches.length,
      matches: matches,
      pageInfo: {
        title: await page.title(),
        url: page.url(),
      }
    };
    
    const jsonPath = path.join(process.cwd(), 'debug-totogaming.json');
    fs.writeFileSync(jsonPath, JSON.stringify(debugData, null, 2), 'utf-8');
    console.log(`[Totogaming] Debug data saved to: ${jsonPath}`);
    
    return matches;

  } catch (error: any) {
    console.error('[Totogaming] Error scraping matches:', error);
    
    // Сохраняем информацию об ошибке в JSON файл
    try {
      const debugData = {
        timestamp: new Date().toISOString(),
        url: TOTOGAMING_URL,
        error: true,
        errorMessage: error?.message || 'Unknown error',
        errorStack: error?.stack || '',
        matchesFound: 0,
        matches: [],
      };
      
      const jsonPath = path.join(process.cwd(), 'debug-totogaming.json');
      fs.writeFileSync(jsonPath, JSON.stringify(debugData, null, 2), 'utf-8');
      console.log(`[Totogaming] Error debug data saved to: ${jsonPath}`);
    } catch (saveError) {
      console.warn('[Totogaming] Could not save error debug data:', saveError);
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

