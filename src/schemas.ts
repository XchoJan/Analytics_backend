import { z } from "zod";

export const MatchesInputSchema = z.object({
  matches: z.array(z.string().min(3)).min(1),
});

export type MatchesInput = z.infer<typeof MatchesInputSchema>;

export const SinglePredictionSchema = z.object({
  type: z.literal("single"),
  match: z.string().min(3),
  prediction: z.string().min(3),
  odds: z.number().positive(),
  confidence: z.number().int().min(0).max(100),
});

export type SinglePrediction = z.infer<typeof SinglePredictionSchema>;

export const ExpressBetSchema = z.object({
  match: z.string().min(3),
  prediction: z.string().min(3),
  odds: z.number().positive(),
});

export type ExpressBet = z.infer<typeof ExpressBetSchema>;

export const ExpressPredictionSchema = z.object({
  type: z.literal("express"),
  bets: z.array(ExpressBetSchema).length(3),
  total_odds: z.number().positive(),
  confidence: z.number().int().min(0).max(100),
});

export type ExpressPrediction = z.infer<typeof ExpressPredictionSchema>;

export const Express5PredictionSchema = z.object({
  type: z.literal("express5"),
  bets: z.array(ExpressBetSchema).length(5),
  total_odds: z.number().positive(),
  confidence: z.number().int().min(0).max(100),
});

export type Express5Prediction = z.infer<typeof Express5PredictionSchema>;

export const MatchSchema = z.object({
  id: z.string().optional(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  date: z.string(),
  time: z.string().optional(),
  league: z.string().optional(),
});

export type Match = z.infer<typeof MatchSchema>;

export const MatchesListSchema = z.object({
  matches: z.array(MatchSchema),
});

export type MatchesList = z.infer<typeof MatchesListSchema>;

export const MatchAnalysisSchema = z.object({
  match: z.string().min(3),
  prediction: z.string().min(3),
  riskPercent: z.number().int().min(0).max(100),
  odds: z.number().positive().min(1.0).max(10.0),
});

export type MatchAnalysis = z.infer<typeof MatchAnalysisSchema>;

export const MatchWithOddsSchema = MatchSchema.extend({
  odds: z.object({
    home: z.number().positive(),
    draw: z.number().positive(),
    away: z.number().positive(),
  }),
});

export type MatchWithOdds = z.infer<typeof MatchWithOddsSchema>;


