// App-level enums. Stored as plain strings in the DB for cross-database portability
// (SQLite has no native enum type). Each `as const` tuple is the single source of truth.

export const CURRENCIES = ["USD", "EUR", "JPY", "TWD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const COUNTRIES = ["US", "JP", "TW", "FR", "DE", "GLOBAL"] as const;
export type Country = (typeof COUNTRIES)[number];

export const ASSET_CLASSES = [
  "EQUITY",
  "GOLD",
  "GOV_BOND",
  "IG_BOND",
  "CASH",
  "DIVERSIFIER",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const SLEEVES = [
  "growth",
  "defensiveEquity",
  "gold",
  "bonds",
  "cash",
  "diversifiers",
] as const;
export type Sleeve = (typeof SLEEVES)[number];

export const SLEEVE_LABELS: Record<Sleeve, string> = {
  growth: "Growth equities",
  defensiveEquity: "Defensive equities",
  gold: "Gold / precious metals",
  bonds: "Government & high-quality bonds",
  cash: "Cash & equivalents",
  diversifiers: "Other diversifiers",
};

export const HORIZONS = ["LT_1Y", "Y1_3", "Y3_5", "Y5_10", "GT_10Y"] as const;
export type Horizon = (typeof HORIZONS)[number];

export const HORIZON_LABELS: Record<Horizon, string> = {
  LT_1Y: "Less than 1 year",
  Y1_3: "1–3 years",
  Y3_5: "3–5 years",
  Y5_10: "5–10 years",
  GT_10Y: "10+ years",
};

export const OBJECTIVES = [
  "GROWTH",
  "BALANCED_GROWTH",
  "PRESERVATION",
  "INCOME",
  "GROWTH_PROTECTION",
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  GROWTH: "Capital growth",
  BALANCED_GROWTH: "Balanced growth",
  PRESERVATION: "Capital preservation",
  INCOME: "Income",
  GROWTH_PROTECTION: "Growth + protection",
};

// Risk score: 1 = HIGHEST risk ... 5 = LOWEST risk. (Deliberately non-intuitive per spec.)
export const RISK_SCORES = [1, 2, 3, 4, 5] as const;
export type RiskScore = (typeof RISK_SCORES)[number];

export const RISK_LABELS: Record<RiskScore, { title: string; blurb: string }> = {
  1: {
    title: "Very High Risk",
    blurb:
      "Maximum emphasis on growth and AI. High volatility accepted. Large temporary drawdowns acceptable.",
  },
  2: {
    title: "High Risk",
    blurb: "Growth-oriented but with meaningful diversification.",
  },
  3: {
    title: "Balanced",
    blurb: "A combination of growth and defensive assets.",
  },
  4: {
    title: "Conservative",
    blurb: "Greater emphasis on defensive assets.",
  },
  5: {
    title: "Very Conservative",
    blurb:
      "Capital preservation is the primary objective. Stocks, high-quality bonds, gold and cash equivalents.",
  },
};

export const REGIMES = [
  "STRONG_RISK_ON",
  "RISK_ON",
  "NEUTRAL",
  "RISK_OFF",
  "CRISIS",
] as const;
export type Regime = (typeof REGIMES)[number];

export const REGIME_LABELS: Record<Regime, string> = {
  STRONG_RISK_ON: "Strong Risk-On",
  RISK_ON: "Risk-On",
  NEUTRAL: "Neutral",
  RISK_OFF: "Risk-Off",
  CRISIS: "Crisis / Defensive",
};

export const ACTIONS = [
  "STRONG_BUY",
  "BUY",
  "HOLD",
  "REDUCE",
  "SELL",
  "WATCH",
  "NO_ACTION",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_META: Record<
  Action,
  { label: string; icon: string; tone: string }
> = {
  STRONG_BUY: { label: "Strong Buy", icon: "🟢", tone: "buy-strong" },
  BUY: { label: "Buy", icon: "🟢", tone: "buy" },
  HOLD: { label: "Hold", icon: "🟡", tone: "hold" },
  REDUCE: { label: "Reduce", icon: "🟠", tone: "reduce" },
  SELL: { label: "Sell", icon: "🔴", tone: "sell" },
  WATCH: { label: "Watch", icon: "⚪", tone: "watch" },
  NO_ACTION: { label: "No Action", icon: "⏸️", tone: "watch" },
};

export const SOURCE_TYPES = [
  "FILING",
  "EARNINGS",
  "INVESTOR_PRESENTATION",
  "CENTRAL_BANK",
  "GOV_STAT",
  "MARKET_DATA",
  "MACRO",
  "NEWS",
  "METHODOLOGY",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const FRESHNESS = ["LIVE", "TODAY", "WEEK", "HISTORICAL"] as const;
export type Freshness = (typeof FRESHNESS)[number];

export const STRESS_SCENARIOS = [
  "AI_CRASH",
  "RECESSION",
  "INFLATION_SHOCK",
  "GEOPOLITICAL",
  "JAPAN_RATE_SHOCK",
  "CUSTOM",
] as const;
export type StressScenario = (typeof STRESS_SCENARIOS)[number];

export function horizonBucket(h: Horizon): "short" | "medium" | "long" {
  if (h === "LT_1Y" || h === "Y1_3") return "short";
  if (h === "Y3_5" || h === "Y5_10") return "medium";
  return "long";
}
