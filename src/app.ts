import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { predictionRouter } from "./routes/prediction.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { paymentsRouter } from "./routes/payments.js";
import { HttpError } from "./errors.js";
import "./db.js"; // Инициализируем базу данных
import "./config.js"; // Инициализируем конфигурацию

export const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/ping", (_req, res) => {
  res.json({ pong: true, timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api", predictionRouter);

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: err.issues,
      });
    }

    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }

    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
  },
);


