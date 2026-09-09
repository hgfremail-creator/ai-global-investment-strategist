import { describe, expect, it } from "vitest";
import { computeRiskMetrics, type RiskHolding } from "@/engine/risk";
import { runAllScenarios, runScenario, SCENARIOS, type StressHolding } from "@/engine/stress";
import { seededRng, gaussian } from "@/lib/rng";

const F = (aiFactor = 0, semiconductor = 0, usTech = 0, defensive = 0, rates = 0, gold = 0) =>
  ({ aiFactor, semiconductor, usTech, defensive, rates, gold });

function bars(seed: string, n = 260, vol = 0.02) {
  const rng = seededRng(seed);
  let p = 100;
  const out = [];
  for (let i = 0; i < n; i++) {
    p *= Math.exp(vol * gaussian(rng));
    out.push({ date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`, close: p });
  }
  return out;
}

const holdings: RiskHolding[] = [
  { ticker: "NVDA", weight: 0.1, assetClass: "EQUITY", country: "US", sector: "Information Technology", currency: "USD", factors: F(1, 1, 1), bars: bars("nvda", 260, 0.03), valuationScore: 40 },
  { ticker: "LLY", weight: 0.08, assetClass: "EQUITY", country: "US", sector: "Health Care", currency: "USD", factors: F(0, 0, 0.1, 0.8), bars: bars("lly", 260, 0.018), valuationScore: 55 },
  { ticker: "2330", weight: 0.06, assetClass: "EQUITY", country: "TW", sector: "Information Technology", currency: "TWD", factors: F(0.95, 1, 0.2), bars: bars("tsm", 260, 0.025), valuationScore: 60 },
  { ticker: "GLD", weight: 0.12, assetClass: "GOLD", country: "GLOBAL", sector: "Precious metals", currency: "USD", factors: F(0, 0, 0, 0.3, -0.2, 1), bars: bars("gld", 260, 0.01), valuationScore: 50 },
  { ticker: "IEF", weight: 0.24, assetClass: "GOV_BOND", country: "US", sector: "Government bonds", currency: "USD", factors: F(0, 0, 0, 0.6, 1, 0.1), bars: bars("ief", 260, 0.005), valuationScore: 50 },
  { ticker: "USDCASH", weight: 0.3, assetClass: "CASH", country: "US", sector: "Cash", currency: "USD", factors: F(0, 0, 0, 0.4), bars: bars("cash", 260, 0.0005), valuationScore: 50 },
];

describe("risk engine", () => {
  const m = computeRiskMetrics(holdings, 0.04);

  it("produces bounded, sensible metrics", () => {
    expect(m.volatility).toBeGreaterThan(0);
    expect(m.volatility).toBeLessThan(0.4);
    expect(m.maxHistoricalDrawdown).toBeLessThanOrEqual(0);
    expect(m.concentrationHHI).toBeGreaterThan(0);
    expect(m.concentrationHHI).toBeLessThanOrEqual(1);
    expect(m.effectiveNames).toBeGreaterThan(1);
    for (const k of ["valuationRisk", "liquidityRisk", "geopoliticalRisk"] as const) {
      expect(m[k]).toBeGreaterThanOrEqual(0);
      expect(m[k]).toBeLessThanOrEqual(1);
    }
  });

  it("exposures sum to ~1", () => {
    const s = Object.values(m.countryExposure).reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 2);
  });

  it("Taiwan exposure raises geopolitical risk vs an all-US book", () => {
    const allUs = holdings.map((h) => ({ ...h, country: h.country === "TW" ? "US" : h.country }));
    const mUs = computeRiskMetrics(allUs, 0.04);
    expect(m.geopoliticalRisk).toBeGreaterThan(mUs.geopoliticalRisk);
  });

  it("is deterministic", () => {
    expect(computeRiskMetrics(holdings, 0.04)).toEqual(computeRiskMetrics(holdings, 0.04));
  });
});

describe("stress engine", () => {
  const sh: StressHolding[] = holdings.map((h) => ({
    ticker: h.ticker, weight: h.weight, assetClass: h.assetClass, country: h.country,
    currency: h.currency, sector: h.sector, factors: h.factors, vol: 0.2,
  }));

  it("all five scenarios produce a negative or mixed portfolio impact and are flagged hypothetical", () => {
    const results = runAllScenarios(sh);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.isHypothetical).toBe(true);
      expect(Math.abs(r.estimatedImpactPct)).toBeLessThan(0.5);
      expect(r.byHolding.reduce((a, b) => a + b.contributionPct, 0)).toBeCloseTo(r.estimatedImpactPct, 3);
    }
  });

  it("AI crash hurts the AI-heavy book more than a recession hurts a defensive one", () => {
    const aiCrash = runScenario(sh, SCENARIOS.find((s) => s.key === "AI_CRASH")!);
    expect(aiCrash.estimatedImpactPct).toBeLessThan(0);
    const nvda = aiCrash.byHolding.find((b) => b.ticker === "NVDA")!;
    const cash = aiCrash.byHolding.find((b) => b.ticker === "USDCASH")!;
    expect(nvda.impactPct).toBeLessThan(cash.impactPct);
  });

  it("gold gains in the geopolitical scenario", () => {
    const geo = runScenario(sh, SCENARIOS.find((s) => s.key === "GEOPOLITICAL")!);
    expect(geo.byHolding.find((b) => b.ticker === "GLD")!.impactPct).toBeGreaterThan(0.1);
  });
});
