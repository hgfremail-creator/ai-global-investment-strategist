import { describe, expect, it } from "vitest";
import { fallbackAnswer, type AdvisorCtx } from "@/services/advisor";

const ctx: AdvisorCtx = {
  version: 3,
  weekOf: "2026-09-18",
  regime: "NEUTRAL",
  regimeScore: 0.03,
  regimeDrivers: [],
  alloc: [
    { securityId: null, ticker: "NVDA", name: "NVIDIA", sleeve: "growth", assetClass: "EQUITY", country: "US", sector: "Information Technology", currency: "USD", weight: 0.08, usdMinor: 800000, score: 82 },
    { securityId: null, ticker: "GLD", name: "Gold", sleeve: "gold", assetClass: "GOLD", country: "GLOBAL", sector: "Precious metals", currency: "USD", weight: 0.1, usdMinor: 1000000, score: 60 },
    { securityId: null, ticker: "IEF", name: "US Treasuries", sleeve: "bonds", assetClass: "GOV_BOND", country: "US", sector: "Government bonds", currency: "USD", weight: 0.2, usdMinor: 2000000, score: 55 },
  ],
  factor: { aiFactor: 0.55, semiconductor: 0.3, usTech: 0.4, defensive: 0.35, rates: 0.2, gold: 0.1, country: {}, sector: {}, currency: {}, estVol: 0.11, boundConstraints: [], warnings: ["AI-infrastructure exposure is 55% — concentrated."], reconciliation: [] },
  recs: [
    { ticker: "NVDA", name: "NVIDIA", action: "BUY", conviction: 84, evidenceQuality: 70, targetWeight: 0.08, thesis: "Exceptional AI-infrastructure exposure with 42% revenue growth.", risks: ["Valuation is demanding", "High volatility"], valuationView: "EXPENSIVE" },
  ],
  risk: { volatility: 0.11, maxHistoricalDrawdown: -0.14, concentrationHHI: 0.07, valuationRisk: 0.5, geopoliticalRisk: 0.2, sharpe: 1.2 },
  stress: [
    { label: "AI / tech crash — Nasdaq −30%", estimatedImpactPct: -0.19 },
    { label: "Recession — equities −25%", estimatedImpactPct: -0.14 },
  ],
  changes: [
    { label: "MSFT", previousValue: "8.1%", newValue: "7.1%", reason: "Weight trimmed on relative score. Evidence: overall score -6.1 since 2026-09-11." },
  ],
  scores: [
    { ticker: "NVDA", name: "NVIDIA", overall: 82, components: { businessQuality: 90, growth: 95, valuation: 38, earningsMomentum: 70, marketMomentum: 88, aiExposure: 100, balanceSheet: 92, risk: 55 } },
    { ticker: "SAP", name: "SAP", overall: 69, components: { businessQuality: 78, growth: 80, valuation: 51, earningsMomentum: 60, marketMomentum: 55, aiExposure: 57, balanceSheet: 70, risk: 62 } },
    { ticker: "ORCL", name: "Oracle", overall: 63, components: { businessQuality: 72, growth: 65, valuation: 45, earningsMomentum: 50, marketMomentum: 60, aiExposure: 55, balanceSheet: 55, risk: 58 } },
  ],
};

describe("advisor deterministic router", () => {
  it("answers 'why did you reduce MSFT' from the recorded change", () => {
    const a = fallbackAnswer("Why did you reduce Microsoft?", ctx);
    expect(a.answer).toMatch(/8\.1%.+7\.1%/);
    expect(a.answer).toMatch(/overall score -6\.1/);
    expect(a.citations.some((c) => c.kind === "change")).toBe(true);
  });

  it("answers 'why do you hold NVDA' with the thesis + risks", () => {
    const a = fallbackAnswer("Why do you hold NVDA?", ctx);
    expect(a.answer).toMatch(/AI-infrastructure/);
    expect(a.answer).toMatch(/Valuation is demanding/);
  });

  it("compares SAP to Oracle from their scores", () => {
    const a = fallbackAnswer("Do you prefer SAP to Oracle?", ctx);
    expect(a.answer).toMatch(/SAP scores 69.+(ORCL|Oracle) at 63/);
    expect(a.citations.filter((c) => c.kind === "score")).toHaveLength(2);
  });

  it("identifies the biggest risk incl. the worst stress scenario", () => {
    const a = fallbackAnswer("What is the biggest risk in my portfolio?", ctx);
    expect(a.answer).toMatch(/AI-factor look-through exposure is 55/i);
    expect(a.answer).toMatch(/AI \/ tech crash/);
  });

  it("ranks top risk/reward names", () => {
    const a = fallbackAnswer("Which three names have the best risk/reward?", ctx);
    expect(a.answer).toMatch(/NVDA/);
  });

  it("handles 'what if the Nasdaq falls 15%'", () => {
    const a = fallbackAnswer("What if the Nasdaq falls 15%?", ctx);
    expect(a.answer.toLowerCase()).toMatch(/growth sleeve|drawdown|cushion/);
  });

  it("never emits a guaranteed-return phrase", () => {
    for (const q of ["why NVDA", "biggest risk", "best ideas", "prefer SAP to Oracle"]) {
      const a = fallbackAnswer(q, ctx);
      expect(a.answer.toLowerCase()).not.toMatch(/guarantee|risk-free|will (rise|double)/);
    }
  });
});
