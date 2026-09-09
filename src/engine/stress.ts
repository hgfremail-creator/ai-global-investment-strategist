// Stress-test engine (pure). Deterministic factor-shock model. Every result is
// explicitly hypothetical — labelled as such throughout the UI.

import type { FactorLoadings } from "./aiExposure";
import type { StressScenario } from "@/lib/enums";

export type StressHolding = {
  ticker: string;
  weight: number;
  assetClass: string;
  country: string;
  currency: string;
  sector: string;
  factors: FactorLoadings;
  vol: number;
};

export type ScenarioDef = {
  key: StressScenario;
  label: string;
  assumptions: Record<string, number>;
  /** Return the estimated price impact (fraction) for one holding. */
  impact: (h: StressHolding) => number;
};

const equityBeta = (h: StressHolding) => (h.assetClass === "EQUITY" ? 1 : 0);
const growthiness = (h: StressHolding) => Math.min(1, 0.6 * h.factors.usTech + 0.6 * h.factors.aiFactor);

export const SCENARIOS: ScenarioDef[] = [
  {
    key: "AI_CRASH",
    label: "AI / tech crash — Nasdaq −30%",
    assumptions: { NASDAQ: -0.3, SEMIS: -0.4, SP500: -0.12 },
    impact: (h) => {
      if (h.assetClass === "GOLD") return 0.03;
      if (h.assetClass === "GOV_BOND") return 0.02;
      if (h.assetClass === "IG_BOND") return -0.01;
      if (h.assetClass === "CASH") return 0;
      const ai = growthiness(h);
      const semi = h.factors.semiconductor;
      return -(0.1 + 0.22 * ai + 0.12 * semi);
    },
  },
  {
    key: "RECESSION",
    label: "Global recession — equities −25%",
    assumptions: { GLOBAL_EQUITY: -0.25, IG_SPREAD_BPS: 120, GOLD: 0.05, UST: 0.04 },
    impact: (h) => {
      if (h.assetClass === "GOLD") return 0.05;
      if (h.assetClass === "GOV_BOND") return 0.045;
      if (h.assetClass === "IG_BOND") return -0.02;
      if (h.assetClass === "CASH") return 0.001;
      const defensiveOffset = 0.08 * h.factors.defensive;
      return -(0.25 * equityBeta(h)) + defensiveOffset;
    },
  },
  {
    key: "INFLATION_SHOCK",
    label: "Inflation shock — policy rates +150 bps",
    assumptions: { RATES_BPS: 150, GROWTH_EQUITY: -0.12, GOLD: 0.02 },
    impact: (h) => {
      if (h.assetClass === "GOV_BOND") return -0.015 * (1.5) - 0.04 * h.factors.rates; // duration hit
      if (h.assetClass === "IG_BOND") return -0.05;
      if (h.assetClass === "GOLD") return 0.02;
      if (h.assetClass === "CASH") return 0.004;
      const g = growthiness(h);
      return -(0.05 + 0.1 * g) + 0.02 * h.factors.defensive;
    },
  },
  {
    key: "GEOPOLITICAL",
    label: "Geopolitical crisis — gold +15%, equities −20%",
    assumptions: { GOLD: 0.15, GLOBAL_EQUITY: -0.2, USD: 0.03 },
    impact: (h) => {
      if (h.assetClass === "GOLD") return 0.15;
      if (h.assetClass === "GOV_BOND") return 0.03;
      if (h.assetClass === "IG_BOND") return -0.01;
      if (h.assetClass === "CASH") return 0.002;
      const geo = h.country === "TW" ? 0.1 : h.country === "US" || h.country === "GLOBAL" ? 0 : 0.04;
      return -(0.2 * equityBeta(h)) - geo + 0.06 * h.factors.defensive;
    },
  },
  {
    key: "JAPAN_RATE_SHOCK",
    label: "Japan rate shock — JPY +10%, JGB −8%",
    assumptions: { JPY: 0.1, JGB: -0.08, NIKKEI: -0.1 },
    impact: (h) => {
      // For a USD investor, JPY appreciation lifts the USD value of JPY assets.
      const fx = h.currency === "JPY" ? 0.1 : 0;
      if (h.assetClass === "GOV_BOND" && h.currency === "JPY") return -0.08 + fx;
      if (h.country === "JP" && h.assetClass === "EQUITY") return -0.1 + fx;
      if (h.assetClass === "GOLD") return 0.02;
      if (h.assetClass === "CASH") return 0;
      return fx - 0.01 * equityBeta(h);
    },
  },
];

export type StressResult = {
  key: StressScenario;
  label: string;
  assumptions: Record<string, number>;
  estimatedImpactPct: number; // portfolio-level fraction
  byHolding: { ticker: string; weight: number; impactPct: number; contributionPct: number }[];
  isHypothetical: true;
};

export function runScenario(holdings: StressHolding[], def: ScenarioDef): StressResult {
  const totalW = holdings.reduce((a, h) => a + h.weight, 0) || 1;
  const byHolding = holdings.map((h) => {
    const w = h.weight / totalW;
    const impact = Math.round(def.impact(h) * 1000) / 1000;
    return { ticker: h.ticker, weight: Math.round(w * 1000) / 1000, impactPct: impact, contributionPct: Math.round(w * impact * 1000) / 1000 };
  });
  const port = byHolding.reduce((a, x) => a + x.contributionPct, 0);
  return {
    key: def.key,
    label: def.label,
    assumptions: def.assumptions,
    estimatedImpactPct: Math.round(port * 1000) / 1000,
    byHolding: byHolding.sort((a, b) => a.contributionPct - b.contributionPct),
    isHypothetical: true,
  };
}

export function runAllScenarios(holdings: StressHolding[]): StressResult[] {
  return SCENARIOS.map((s) => runScenario(holdings, s));
}

/** Ad-hoc scenario for the what-if tool (Phase 9). */
export function runCustomScenario(
  holdings: StressHolding[],
  shocks: { equity?: number; growthEquity?: number; gold?: number; bonds?: number; jpy?: number; usd?: number },
): StressResult {
  const def: ScenarioDef = {
    key: "CUSTOM",
    label: "Custom scenario",
    assumptions: shocks as Record<string, number>,
    impact: (h) => {
      let x = 0;
      if (h.assetClass === "EQUITY") x += (shocks.equity ?? 0) + (shocks.growthEquity ?? 0) * growthiness(h);
      if (h.assetClass === "GOLD") x += shocks.gold ?? 0;
      if (h.assetClass === "GOV_BOND" || h.assetClass === "IG_BOND") x += shocks.bonds ?? 0;
      if (h.currency === "JPY") x += shocks.jpy ?? 0;
      if (h.currency !== "USD" && shocks.usd) x -= shocks.usd;
      return x;
    },
  };
  return runScenario(holdings, def);
}
