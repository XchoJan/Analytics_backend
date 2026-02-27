import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getVbetUrls, setVbetUrls } from "../config.js";
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
    res.json({ success: true, urls: getVbetUrls() });
  } catch (e) {
    next(e);
  }
});

