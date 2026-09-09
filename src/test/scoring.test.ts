import { describe, expect, it } from "vitest";
import { scoreUniverse, type ScoreInput } from "@/engine/scoring";
import { classifyRegime, type RegimeInput } from "@/engine/regime";
import { maxDrawdown, momentum, realisedVol, totalReturn } from "@/engine/indicators";
import { DEFAULT_SCORE_WEIGHTS } from "@/lib/config";
import { seededRng, gaussian } from "@/lib/rng";
import { SCORE_COMPONENTS } from "@/engine/scoring";

function bars(seed: string, n = 260, vol = 0.02, drift = 0.0003) {
  const rng = seededRng(seed);
  let p = 100;
  const out = [];
  for (let i = 0; i < n; i++) {
    p *= Math.exp(drift + vol * gaussian(rng));
    out.push({ date: `2026-01-${i}`, close: p });
  }
  return out;
}

function equity(ticker: string, opts: Partial<ScoreInput["fundamentals"] & object> = {}, seed = ticker): ScoreInput {
  return {
    ticker,
    name: ticker,
    assetClass: "EQUITY",
    sector: "Information Technology",
    industry: "Software",
    factors: { aiFactor: 0.5, semiconductor: 0.1, usTech: 0.8, defensive: 0.2, rates: 0, gold: 0 },
    fundamentals: {
      revenueGrowth: 0.2, epsGrowth: 0.22, fcfMargin: 0.2, roic: 0.15, netDebtToEbitda: 1,
      grossMargin: 0.55, operatingMargin: 0.28, pe: 30, forwardPe: 25, evEbitda: 20, peg: 1.3,
      ps: 8, fcfYield: 0.03, epsRevision4w: 0.01, epsRevision13w: 0.02,
      expectedRevenueGrowth: 0.18, expectedEpsGrowth: 0.2, moat: "NARROW", tamTier: 4,
      ...opts,
    },
    bars: bars(seed),
  };
}

describe("indicators", () => {
  it("totalReturn / momentum / vol / drawdown behave", () => {
    const up = bars("up", 260, 0.01, 0.002);
    expect(totalReturn(up, 60)).toBeGreaterThan(0);
    expect(realisedVol(up)).toBeGreaterThan(0);
    expect(maxDrawdown(up)).toBeLessThanOrEqual(0);
    const m = momentum(up);
    expect(m.blended).not.toBeNull();
  });
});

describe("scoring", () => {
  const universe = [
    equity("HIGHQ", { roic: 0.3, fcfMargin: 0.35, revenueGrowth: 0.35, epsGrowth: 0.4, forwardPe: 18, peg: 0.8 }),
    equity("MIDQ"),
    equity("LOWQ", { roic: 0.02, fcfMargin: 0.01, revenueGrowth: 0.01, epsGrowth: -0.05, forwardPe: 55, peg: 4, netDebtToEbitda: 5 }),
  ];

  it("every component and overall is within 0..100 and contributions sum to overall", () => {
    const scored = scoreUniverse(universe, DEFAULT_SCORE_WEIGHTS);
    for (const s of scored) {
      expect(s.overall).toBeGreaterThanOrEqual(0);
      expect(s.overall).toBeLessThanOrEqual(100);
      for (const c of SCORE_COMPONENTS) {
        expect(s.components[c]).toBeGreaterThanOrEqual(0);
        expect(s.components[c]).toBeLessThanOrEqual(100);
      }
      const contribSum = SCORE_COMPONENTS.reduce((a, c) => a + s.contributions[c], 0);
      expect(contribSum).toBeCloseTo(s.overall, 1);
    }
  });

  it("higher-quality, cheaper, faster-growing name outranks the weak one", () => {
    const scored = scoreUniverse(universe, DEFAULT_SCORE_WEIGHTS);
    const hi = scored.find((s) => s.ticker === "HIGHQ")!;
    const lo = scored.find((s) => s.ticker === "LOWQ")!;
    expect(hi.overall).toBeGreaterThan(lo.overall);
    expect(hi.components.businessQuality).toBeGreaterThan(lo.components.businessQuality);
    expect(hi.components.valuation).toBeGreaterThan(lo.components.valuation);
  });

  it("is deterministic", () => {
    const a = scoreUniverse(universe, DEFAULT_SCORE_WEIGHTS);
    const b = scoreUniverse(universe, DEFAULT_SCORE_WEIGHTS);
    expect(a).toEqual(b);
  });

  it("AI-heavy name scores high on aiExposure", () => {
    const ai = equity("AICO");
    ai.factors = { aiFactor: 1, semiconductor: 1, usTech: 1, defensive: 0, rates: 0, gold: 0 };
    ai.industry = "Semiconductors";
    const [scored] = scoreUniverse([ai, ...universe], DEFAULT_SCORE_WEIGHTS);
    expect(scored.components.aiExposure).toBeGreaterThan(80);
  });
});

describe("regime engine", () => {
  const strongRiskOn: RegimeInput = {
    spxTrend: 1, ndxTrend: 1, spxRealisedVol: 0.1, hyOas: 2.6, hyOasChange3m: -0.3,
    us10y: 4, curve2s10s: 0.6, goldMom3m: -0.02, dxyTrend: -0.5, breadthAbove200: 0.85,
    earningsRevisionBreadth: 0.5, semiRelStrength: 0.08,
  };
  const crisis: RegimeInput = {
    spxTrend: -1, ndxTrend: -1, spxRealisedVol: 0.4, hyOas: 7, hyOasChange3m: 2,
    us10y: 4, curve2s10s: -0.6, goldMom3m: 0.2, dxyTrend: 0.8, breadthAbove200: 0.1,
    earningsRevisionBreadth: -0.6, semiRelStrength: -0.1,
  };

  it("classifies extremes correctly and score is bounded", () => {
    const on = classifyRegime(strongRiskOn);
    const off = classifyRegime(crisis);
    expect(["STRONG_RISK_ON", "RISK_ON"]).toContain(on.regime);
    expect(["CRISIS", "RISK_OFF"]).toContain(off.regime);
    expect(on.score).toBeGreaterThan(off.score);
    for (const d of [...on.drivers, ...off.drivers]) {
      expect(Math.abs(d.vote)).toBeLessThanOrEqual(2);
      expect(d.rationale.length).toBeGreaterThan(0);
    }
  });

  it("neutral inputs -> neutral regime", () => {
    const neutral = classifyRegime({
      spxTrend: 0, ndxTrend: 0, spxRealisedVol: 0.18, hyOas: 4, hyOasChange3m: 0,
      us10y: 4, curve2s10s: 0.1, goldMom3m: 0, dxyTrend: 0, breadthAbove200: 0.5,
      earningsRevisionBreadth: 0, semiRelStrength: 0,
    });
    expect(neutral.regime).toBe("NEUTRAL");
  });
});
