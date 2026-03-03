import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getVbetUrls, setVbetUrls } from "../config.js";
import { refreshMatches } from "../matchesStore.js";
import { runPredictionGeneration } from "../predictionCron.js";
import { getPredictionCounts } from "../predictionsStore.js";
import { db, getAppLaunchCount } from "../db.js";
import { HttpError } from "../errors.js";

export const adminRouter = Router();

// Все роуты требуют авторизации и роль admin
adminRouter.use(authMiddleware);

adminRouter.get("/urls", async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Доступ запрещен. Требуется роль администратора.');
    }

    const urls = getVbetUrls();
    res.json({ urls });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/urls", async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Доступ запрещен. Требуется роль администратора.');
    }

    const { urls } = req.body;
    
    if (!Array.isArray(urls)) {
      throw new HttpError(400, 'INVALID_INPUT', 'URLs должны быть массивом');
    }

    // Валидация URL
    for (const url of urls) {
      if (typeof url !== 'string' || !url.trim()) {
        throw new HttpError(400, 'INVALID_URL', 'Все URL должны быть непустыми строками');
      }
      try {
        new URL(url);
      } catch {
        throw new HttpError(400, 'INVALID_URL', `Некорректный URL: ${url}`);
      }
    }

    setVbetUrls(urls);
    // Сразу обновляем матчи по новым ссылкам
    refreshMatches().catch((err) => console.error('[Admin] Refresh after URL update failed:', err));
    res.json({ success: true, urls: getVbetUrls() });
  } catch (e) {
    next(e);
  }
});

// Статус прогнозов в БД
adminRouter.get("/predictions-status", async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Доступ запрещен.');
    }
    res.json(getPredictionCounts());
  } catch (e) {
    next(e);
  }
});

// Ручной запуск генерации прогнозов
adminRouter.post("/generate-predictions", async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Доступ запрещен. Требуется роль администратора.');
    }

    runPredictionGeneration().catch((err) => console.error('[Admin] Generate predictions failed:', err));
    res.json({ success: true, message: 'Генерация прогнозов запущена. Подождите 2–3 минуты.' });
  } catch (e) {
    next(e);
  }
});

// Статистика для админа
adminRouter.get("/stats", async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Доступ запрещен. Требуется роль администратора.');
    }

    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
    const premiumCount = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE premium = 1 AND (premiumUntil IS NULL OR premiumUntil > datetime('now'))"
    ).get() as { c: number }).c;
    const totalLaunches = getAppLaunchCount();
    const successfulPayments = (db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'paid' OR status = 'paid_over'").get() as { c: number }).c;
    const newUsersLast7Days = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE createdAt >= date('now', '-7 days')"
    ).get() as { c: number }).c;
    const newPaymentsLast7Days = (db.prepare(
      "SELECT COUNT(*) as c FROM payments WHERE (status = 'paid' OR status = 'paid_over') AND updatedAt >= date('now', '-7 days')"
    ).get() as { c: number }).c;

    res.json({
      totalUsers,
      premiumCount,
      totalLaunches,
      successfulPayments,
      newUsersLast7Days,
      newPaymentsLast7Days,
    });
  } catch (e) {
    next(e);
  }
});

