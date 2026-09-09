import { z } from "zod";
import type { RiskScore, Sleeve } from "./enums";

// ─────────────────────────── Constraint set ───────────────────────────
// Persisted (as JSON string) on RiskProfile.constraintsJson. Every limit the
// portfolio optimizer must respect, plus the configurable score weights.

export const scoreWeightsSchema = z.object({
  businessQuality: z.number(),
  growth: z.number(),
  valuation: z.number(),
  earningsMomentum: z.number(),
  marketMomentum: z.number(),
  aiExposure: z.number(),
  balanceSheet: z.number(),
  risk: z.number(),
});
export type ScoreWeights = z.infer<typeof scoreWeightsSchema>;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  businessQuality: 0.2,
  growth: 0.2,
  valuation: 0.15,
  earningsMomentum: 0.1,
  marketMomentum: 0.1,
  aiExposure: 0.1,
  balanceSheet: 0.05,
  risk: 0.1,
};

export const constraintSetSchema = z.object({
  maxSingleName: z.number().min(0.01).max(1),
  maxSector: z.number().min(0.05).max(1),
  maxCountry: z.number().min(0.1).max(1),
  maxCurrency: z.number().min(0.1).max(1),
  maxPortfolioVol: z.number().min(0.02).max(0.5), // annualised
  minDefensive: z.number().min(0).max(1), // gold + bonds + cash + defensive equity
  minCash: z.number().min(0).max(1),
  maxGrowth: z.number().min(0).max(1),
  minScoreToHold: z.number().min(0).max(100),
  maxNames: z.number().int().min(5).max(40),
  scoreWeights: scoreWeightsSchema,
});
export type ConstraintSet = z.infer<typeof constraintSetSchema>;

// Defaults by risk score (1 = highest risk … 5 = lowest risk).
export const DEFAULT_CONSTRAINTS: Record<RiskScore, ConstraintSet> = {
  1: {
    maxSingleName: 0.14, maxSector: 0.45, maxCountry: 0.75, maxCurrency: 0.85,
    maxPortfolioVol: 0.30, minDefensive: 0.05, minCash: 0.01, maxGrowth: 0.85,
    minScoreToHold: 45, maxNames: 18, scoreWeights: DEFAULT_SCORE_WEIGHTS,
  },
  2: {
    maxSingleName: 0.12, maxSector: 0.38, maxCountry: 0.70, maxCurrency: 0.80,
    maxPortfolioVol: 0.24, minDefensive: 0.15, minCash: 0.02, maxGrowth: 0.70,
    minScoreToHold: 48, maxNames: 20, scoreWeights: DEFAULT_SCORE_WEIGHTS,
  },
  3: {
    maxSingleName: 0.10, maxSector: 0.30, maxCountry: 0.60, maxCurrency: 0.70,
    maxPortfolioVol: 0.17, minDefensive: 0.35, minCash: 0.04, maxGrowth: 0.55,
    minScoreToHold: 50, maxNames: 22, scoreWeights: DEFAULT_SCORE_WEIGHTS,
  },
  4: {
    maxSingleName: 0.08, maxSector: 0.25, maxCountry: 0.55, maxCurrency: 0.60,
    maxPortfolioVol: 0.12, minDefensive: 0.55, minCash: 0.07, maxGrowth: 0.38,
    minScoreToHold: 55, maxNames: 22, scoreWeights: DEFAULT_SCORE_WEIGHTS,
  },
  5: {
    maxSingleName: 0.06, maxSector: 0.20, maxCountry: 0.50, maxCurrency: 0.55,
    maxPortfolioVol: 0.09, minDefensive: 0.70, minCash: 0.12, maxGrowth: 0.25,
    minScoreToHold: 58, maxNames: 20, scoreWeights: DEFAULT_SCORE_WEIGHTS,
  },
};

// ─────────────────────────── Strategic sleeve matrix ───────────────────────────
// Base (regime-neutral) sleeve weights by (riskScore, horizonBucket).
// Each row sums to 1.0. The regime + macro tilts adjust these within bounds.

type SleeveWeights = Record<Sleeve, number>;
type HorizonBucket = "short" | "medium" | "long";

export const BASE_SLEEVE_MATRIX: Record<RiskScore, Record<HorizonBucket, SleeveWeights>> = {
  1: {
    short:  { growth: 0.60, defensiveEquity: 0.14, gold: 0.10, bonds: 0.08, cash: 0.06, diversifiers: 0.02 },
    medium: { growth: 0.68, defensiveEquity: 0.12, gold: 0.10, bonds: 0.05, cash: 0.03, diversifiers: 0.02 },
    long:   { growth: 0.74, defensiveEquity: 0.10, gold: 0.09, bonds: 0.03, cash: 0.02, diversifiers: 0.02 },
  },
  2: {
    short:  { growth: 0.48, defensiveEquity: 0.20, gold: 0.12, bonds: 0.12, cash: 0.06, diversifiers: 0.02 },
    medium: { growth: 0.56, defensiveEquity: 0.18, gold: 0.12, bonds: 0.09, cash: 0.03, diversifiers: 0.02 },
    long:   { growth: 0.62, defensiveEquity: 0.16, gold: 0.11, bonds: 0.06, cash: 0.03, diversifiers: 0.02 },
  },
  3: {
    short:  { growth: 0.34, defensiveEquity: 0.22, gold: 0.13, bonds: 0.22, cash: 0.07, diversifiers: 0.02 },
    medium: { growth: 0.42, defensiveEquity: 0.21, gold: 0.12, bonds: 0.18, cash: 0.05, diversifiers: 0.02 },
    long:   { growth: 0.48, defensiveEquity: 0.20, gold: 0.12, bonds: 0.14, cash: 0.04, diversifiers: 0.02 },
  },
  4: {
    short:  { growth: 0.20, defensiveEquity: 0.22, gold: 0.14, bonds: 0.32, cash: 0.10, diversifiers: 0.02 },
    medium: { growth: 0.26, defensiveEquity: 0.22, gold: 0.13, bonds: 0.29, cash: 0.08, diversifiers: 0.02 },
    long:   { growth: 0.32, defensiveEquity: 0.22, gold: 0.12, bonds: 0.25, cash: 0.07, diversifiers: 0.02 },
  },
  5: {
    short:  { growth: 0.10, defensiveEquity: 0.18, gold: 0.15, bonds: 0.40, cash: 0.15, diversifiers: 0.02 },
    medium: { growth: 0.15, defensiveEquity: 0.19, gold: 0.15, bonds: 0.37, cash: 0.12, diversifiers: 0.02 },
    long:   { growth: 0.19, defensiveEquity: 0.20, gold: 0.14, bonds: 0.34, cash: 0.11, diversifiers: 0.02 },
  },
};

// Regime tilts (percentage-point deltas applied to sleeves, then renormalised
// and clamped to the risk-profile floors/ceilings).
export const REGIME_TILTS: Record<string, Partial<SleeveWeights>> = {
  STRONG_RISK_ON: { growth: +0.08, defensiveEquity: -0.02, gold: -0.02, bonds: -0.03, cash: -0.01 },
  RISK_ON:        { growth: +0.04, defensiveEquity: -0.01, gold: -0.01, bonds: -0.01, cash: -0.01 },
  NEUTRAL:        {},
  RISK_OFF:       { growth: -0.08, defensiveEquity: +0.01, gold: +0.03, bonds: +0.03, cash: +0.01 },
  CRISIS:         { growth: -0.16, defensiveEquity: -0.02, gold: +0.06, bonds: +0.07, cash: +0.05 },
};

export const APP = {
  name: "AI Global Investment Strategist",
  shortName: "Strategist",
  disclaimerVersion: 1,
  defaultBenchmark: "BLENDED_R3",
} as const;
