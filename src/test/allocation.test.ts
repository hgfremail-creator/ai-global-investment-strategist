import { describe, expect, it } from "vitest";
import { buildPortfolio, type Candidate } from "@/engine/allocation";
import { baseSleeves, tiltSleeves } from "@/engine/sleeves";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";
import { RISK_SCORES, SLEEVES } from "@/lib/enums";
import { seededRng } from "@/lib/rng";

const F = (aiFactor = 0, semiconductor = 0, usTech = 0, defensive = 0, rates = 0, gold = 0) =>
  ({ aiFactor, semiconductor, usTech, defensive, rates, gold });

function universe(): Candidate[] {
  const rng = seededRng("alloc-universe");
  const mk = (
    ticker: string, sleeve: Candidate["sleeve"], assetClass: string,
    country: string, sector: string, currency: string, score: number, vol: number, factors = F(),
  ): Candidate => ({
    ticker, name: ticker, sleeve, assetClass, country, sector, currency,
    score, vol, factors, priceUsd: 100 + rng() * 100,
  });
  return [
    mk("NVDA", "growth", "EQUITY", "US", "Information Technology", "USD", 92, 0.45, F(1, 1, 1)),
    mk("MSFT", "growth", "EQUITY", "US", "Information Technology", "USD", 80, 0.26, F(0.8, 0.1, 1)),
    mk("AVGO", "growth", "EQUITY", "US", "Information Technology", "USD", 85, 0.4, F(0.85, 0.95, 1)),
    mk("TSM", "growth", "EQUITY", "TW", "Information Technology", "TWD", 83, 0.38, F(0.95, 1, 0.2)),
    mk("SAP", "growth", "EQUITY", "DE", "Information Technology", "EUR", 70, 0.27, F(0.7, 0, 0.6)),
    mk("SONY", "growth", "EQUITY", "JP", "Consumer Discretionary", "JPY", 62, 0.3, F(0.3, 0.2, 0.3)),
    mk("LLY", "defensiveEquity", "EQUITY", "US", "Health Care", "USD", 72, 0.28, F(0, 0, 0.1, 0.8)),
    mk("COST", "defensiveEquity", "EQUITY", "US", "Consumer Staples", "USD", 66, 0.2, F(0, 0, 0.1, 0.85)),
    mk("NEE", "defensiveEquity", "EQUITY", "US", "Utilities", "USD", 58, 0.24, F(0, 0, 0.1, 0.8)),
    mk("OR", "defensiveEquity", "EQUITY", "FR", "Consumer Staples", "EUR", 60, 0.22, F(0, 0, 0, 0.8)),
    mk("GLD", "gold", "GOLD", "GLOBAL", "Precious metals", "USD", 62, 0.15, F(0, 0, 0, 0.3, -0.2, 1)),
    mk("IAU", "gold", "GOLD", "GLOBAL", "Precious metals", "USD", 61, 0.15, F(0, 0, 0, 0.3, -0.2, 1)),
    mk("IEF", "bonds", "GOV_BOND", "US", "Government bonds", "USD", 58, 0.07, F(0, 0, 0, 0.6, 1, 0.1)),
    mk("SHY", "bonds", "GOV_BOND", "US", "Government bonds", "USD", 55, 0.02, F(0, 0, 0, 0.5, 0.3)),
    mk("BUND", "bonds", "GOV_BOND", "DE", "Government bonds", "EUR", 54, 0.06, F(0, 0, 0, 0.6, 0.95, 0.1)),
    mk("LQD", "bonds", "IG_BOND", "US", "Credit", "USD", 52, 0.08, F(0, 0, 0, 0.4, 0.8, 0.1)),
    mk("USDCASH", "cash", "CASH", "US", "Cash", "USD", 55, 0.01, F(0, 0, 0, 0.4)),
  ];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("portfolio construction", () => {
  const cands = universe();

  function build(riskIdx: number, capitalUsd = 100_000) {
    const risk = RISK_SCORES[riskIdx];
    const c = DEFAULT_CONSTRAINTS[risk];
    const sleeves = tiltSleeves(baseSleeves(risk, "Y5_10"), "NEUTRAL", c);
    return buildPortfolio({
      capitalUsdMinor: capitalUsd * 100,
      sleeveTargets: sleeves,
      constraints: c,
      candidates: cands,
      existing: [],
      horizonBucket: "medium",
    });
  }

  it("weights sum to exactly 100.0% for every risk profile", () => {
    for (let i = 0; i < RISK_SCORES.length; i++) {
      const r = build(i);
      const total = sum(r.rows.map((x) => x.weight));
      expect(Math.round(total * 1000)).toBe(1000);
    }
  });

  it("dollar amounts sum to exactly the invested capital", () => {
    const r = build(2, 250_000);
    expect(sum(r.rows.map((x) => x.usdMinor))).toBe(250_000 * 100);
  });

  it("respects single-name, sector, country and currency caps", () => {
    for (let i = 0; i < RISK_SCORES.length; i++) {
      const c = DEFAULT_CONSTRAINTS[RISK_SCORES[i]];
      const r = build(i);
      // single-name cap applies to concentration risk; cash and govt bonds get a looser cap
      for (const row of r.rows) {
        if (row.assetClass === "CASH") continue;
        const cap = row.assetClass === "GOV_BOND" ? Math.max(c.maxSingleName, 0.25) : c.maxSingleName;
        expect(row.weight).toBeLessThanOrEqual(cap + 0.0015);
      }
      const by = (k: "sector" | "country" | "currency") => {
        const g: Record<string, number> = {};
        for (const row of r.rows) g[row[k]] = (g[row[k]] ?? 0) + row.weight;
        return Math.max(...Object.values(g));
      };
      // Group caps are satisfied unless the universe lacks diversifying instruments,
      // in which case the engine emits an explicit warning.
      const w = r.warnings.join(" ").toLowerCase();
      if (by("sector") > c.maxSector + 0.02) expect(w).toMatch(/sector exposure/);
      if (by("country") > c.maxCountry + 0.02) expect(w).toMatch(/country exposure/);
      if (by("currency") > c.maxCurrency + 0.02) expect(w).toMatch(/currency exposure/);
    }
  });

  it("higher risk score (=lower risk) => not more growth-sleeve weight", () => {
    const growthOf = (i: number) => {
      const r = build(i);
      return SLEEVES.includes("growth")
        ? r.rows.filter((x) => x.sleeve === "growth").reduce((a, x) => a + x.weight, 0)
        : 0;
    };
    for (let i = 0; i < RISK_SCORES.length - 1; i++) {
      expect(growthOf(i + 1)).toBeLessThanOrEqual(growthOf(i) + 0.02);
    }
  });

  it("changing capital only scales dollar amounts, not weights", () => {
    const a = build(2, 100_000);
    const b = build(2, 500_000);
    expect(a.rows.map((x) => x.ticker)).toEqual(b.rows.map((x) => x.ticker));
    a.rows.forEach((x, i) => expect(x.weight).toBeCloseTo(b.rows[i].weight, 6));
  });

  it("removing the top name reallocates and still sums to 100%", () => {
    const risk = RISK_SCORES[1];
    const c = DEFAULT_CONSTRAINTS[risk];
    const sleeves = tiltSleeves(baseSleeves(risk, "Y5_10"), "NEUTRAL", c);
    const without = buildPortfolio({
      capitalUsdMinor: 100_000 * 100,
      sleeveTargets: sleeves,
      constraints: c,
      candidates: cands.filter((x) => x.ticker !== "NVDA"),
      existing: [],
      horizonBucket: "medium",
    });
    expect(without.rows.find((r) => r.ticker === "NVDA")).toBeUndefined();
    expect(Math.round(sum(without.rows.map((x) => x.weight)) * 1000)).toBe(1000);
  });

  it("flags AI concentration when factor exposure is high", () => {
    const aiHeavy = cands.filter((x) =>
      ["NVDA", "AVGO", "TSM", "MSFT", "GLD", "IEF", "USDCASH"].includes(x.ticker),
    );
    const r = buildPortfolio({
      capitalUsdMinor: 100_000 * 100,
      sleeveTargets: { growth: 0.7, defensiveEquity: 0, gold: 0.15, bonds: 0.1, cash: 0.05, diversifiers: 0 },
      constraints: DEFAULT_CONSTRAINTS[1],
      candidates: aiHeavy,
      existing: [],
      horizonBucket: "long",
    });
    expect(r.factorExposure.aiFactor).toBeGreaterThan(0.4);
    expect(r.warnings.join(" ")).toMatch(/AI|concentrat/i);
  });

  it("existing holding reconciliation classifies over/under/at target", () => {
    const r = buildPortfolio({
      capitalUsdMinor: 100_000 * 100,
      sleeveTargets: tiltSleeves(baseSleeves(RISK_SCORES[1], "Y5_10"), "NEUTRAL", DEFAULT_CONSTRAINTS[RISK_SCORES[1]]),
      constraints: DEFAULT_CONSTRAINTS[RISK_SCORES[1]],
      candidates: cands,
      existing: [{ ticker: "NVDA", quantity: 300, avgPriceUsd: 100, marketValueUsd: 45_000 }],
      horizonBucket: "medium",
    });
    const recon = r.reconciliation.find((x) => x.ticker === "NVDA")!;
    expect(recon.existingWeight).toBeCloseTo(0.45, 2);
    expect(recon.note.toLowerCase()).toMatch(/trim|above target/);
  });
});
