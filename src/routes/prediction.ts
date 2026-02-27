import { Router } from "express";
import { analyzeMatch } from "../ai.js";
import { getMatchesFromDb } from "../matchesStore.js";
import { getRandomPrediction } from "../predictionsStore.js";
import { getStats } from "../stats.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { findUserById, canUsePrediction, updateLastPredictionDate } from "../models/user.js";
import { HttpError } from "../errors.js";

export const predictionRouter = Router();

predictionRouter.get("/matches", async (req, res, next) => {
  try {
    const matches = getMatchesFromDb();
    res.json({ matches });
  } catch (e) {
    next(e);
  }
});

predictionRouter.post("/single", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Пользователь не авторизован');
    }

    const user = findUserById(req.user.id);
    if (!user) {
      throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
    }

    // Проверяем, может ли пользователь использовать прогноз
    if (!canUsePrediction(user)) {
      throw new HttpError(403, 'PREDICTION_LIMIT_REACHED', 'Вы уже использовали бесплатный прогноз сегодня. Оформите подписку для неограниченного доступа.');
    }

    const result = getRandomPrediction('single');
    if (!result) {
      throw new HttpError(503, 'NO_PREDICTIONS', 'Прогнозы обновляются. Попробуйте через несколько минут.');
    }

    if (!user.premium) {
      updateLastPredictionDate(user.id);
    }

    const pred = result as { type: string; match: string; prediction: string; odds: number; confidence: number };
    res.json({
      prediction: result,
      matchAnalysis: {
        match: pred.match,
        prediction: pred.prediction,
        riskPercent: 25,
        odds: pred.odds,
      },
    });
  } catch (e) {
    next(e);
  }
});

predictionRouter.post("/express", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Пользователь не авторизован');
    }

    const user = findUserById(req.user.id);
    if (!user) {
      throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
    }

    if (!user.premium) {
      const now = new Date();
      if (user.premiumUntil) {
        const premiumUntil = new Date(user.premiumUntil);
        if (premiumUntil <= now) {
          throw new HttpError(403, 'PREMIUM_REQUIRED', 'Экспресс-прогнозы доступны только для premium пользователей. Оформите подписку.');
        }
      } else {
        throw new HttpError(403, 'PREMIUM_REQUIRED', 'Экспресс-прогнозы доступны только для premium пользователей. Оформите подписку.');
      }
    }

    const result = getRandomPrediction('express');
    if (!result) {
      throw new HttpError(503, 'NO_PREDICTIONS', 'Прогнозы обновляются. Попробуйте через несколько минут.');
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
});

predictionRouter.post("/express5", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Пользователь не авторизован');
    }

    const user = findUserById(req.user.id);
    if (!user) {
      throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
    }

    if (!user.premium) {
      const now = new Date();
      if (user.premiumUntil) {
        const premiumUntil = new Date(user.premiumUntil);
        if (premiumUntil <= now) {
          throw new HttpError(403, 'PREMIUM_REQUIRED', 'Экспресс-прогнозы доступны только для premium пользователей. Оформите подписку.');
        }
      } else {
        throw new HttpError(403, 'PREMIUM_REQUIRED', 'Экспресс-прогнозы доступны только для premium пользователей. Оформите подписку.');
      }
    }

    const result = getRandomPrediction('express5');
    if (!result) {
      throw new HttpError(503, 'NO_PREDICTIONS', 'Прогнозы обновляются. Попробуйте через несколько минут.');
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
});

predictionRouter.post("/analyze", async (req, res, next) => {
  try {
    const { match, league, date } = req.body;
    if (!match) {
      return res.status(400).json({ error: "Match is required" });
    }
    const result = await analyzeMatch(match, league, date);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

predictionRouter.get("/matches-with-odds", async (req, res, next) => {
  try {
    const matches = getMatchesFromDb();
    res.json({ matches });
  } catch (e: any) {
    console.error('[matches-with-odds] Error:', e);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: e.message || 'Failed to load matches' 
    });
  }
});

predictionRouter.get("/stats", async (req, res, next) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (e) {
    next(e);
  }
});


