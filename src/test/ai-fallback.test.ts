import { describe, expect, it } from "vitest";
import { fallbackReasoning } from "@/ai/fallback";
import { applyGuardrails } from "@/ai/guardrails";
import { aiBatchOutputSchema, type ReasoningInput, type SecurityBundle } from "@/ai/schema";

function bundle(over: Partial<SecurityBundle> = {}): SecurityBundle {
  return {
    ticker: "NVDA",
    name: "NVIDIA",
    country: "US",
    sector: "Information Technology",
    industry: "Semiconductors",
    assetClass: "EQUITY",
    sleeve: "growth",
    targetWeight: 0.08,
    overallScore: 82,
    componentScores: {
      businessQuality: 90, growth: 95, valuation: 38, earningsMomentum: 70,
      marketMomentum: 88, aiExposure: 100, balanceSheet: 92, risk: 55,
    },
    componentContributions: {},
    componentNotes: {
      growth: "revenue growth 42.0%, EPS growth 55.0%",
      valuation: "forward P/E 32.0, PEG 0.80",
      risk: "realised vol 45.0%, max drawdown -28.0%",
    },
    rawMetrics: { vol: 0.45, mom12m: 0.6, mom3m: 0.12, trend: 1, maxDrawdown: -0.28, aiDrivers: ["semiconductors", "data-centre infrastructure"] },
    fundamentals: { "Forward P/E": 32, "Operating margin": 0.55, ROIC: 0.4, "Revenue growth": 0.42 },
    aiExposureDrivers: ["high direct AI factor loading", "semiconductor supply-chain exposure"],
    existingExposure: null,
    recentNews: [],
    ...over,
  };
}

const baseInput: ReasoningInput = {
  asOf: "2026-09-04",
  regime: { regime: "NEUTRAL", score: 0, drivers: [] },
  constraints: {},
  sleeveTargets: { growth: 0.5, defensiveEquity: 0.2, gold: 0.12, bonds: 0.15, cash: 0.03, diversifiers: 0 },
  portfolioFactorExposure: { aiFactor: 0.4, semiconductor: 0.25, usTech: 0.4, defensive: 0.3 },
  holdings: [bundle()],
  rejected: [bundle({ ticker: "TSLA", name: "Tesla", targetWeight: null, overallScore: 41, componentScores: { businessQuality: 45, growth: 40, valuation: 25, earningsMomentum: 30, marketMomentum: 35, aiExposure: 55, balanceSheet: 60, risk: 30 } })],
  sources: [
    { id: "src_meth", type: "METHODOLOGY", title: "Methodology", publisher: "App", publishedAt: null, freshness: "TODAY", isDemo: false },
  ],
};

describe("fallback reasoning writer", () => {
  it("produces schema-valid output with required negative disclosures", () => {
    const out = fallbackReasoning(baseInput);
    const parsed = aiBatchOutputSchema.parse(out);
    expect(parsed.recommendations).toHaveLength(1);
    const r = parsed.recommendations[0];
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.invalidationConditions.length).toBeGreaterThan(0);
    expect(r.devilsAdvocateMd.toLowerCase()).toContain("assume the thesis is wrong");
    expect(r.fic.facts.length).toBeGreaterThan(0);
    expect(parsed.rejections[0].reasons.length).toBeGreaterThan(0);
    expect(parsed.rejections[0].whatWouldChangeOurMind.length).toBeGreaterThan(0);
  });

  it("passes its own guardrails", () => {
    const out = fallbackReasoning(baseInput);
    const gr = applyGuardrails(out, baseInput);
    expect(gr.violations).toEqual([]);
    expect(gr.ok).toBe(true);
  });

  it("recommends REDUCE when the user is well above the target weight", () => {
    const input: ReasoningInput = {
      ...baseInput,
      holdings: [bundle({ existingExposure: { quantity: 300, weight: 0.35, note: "Above target" } })],
    };
    const out = fallbackReasoning(input);
    expect(out.recommendations[0].action).toBe("REDUCE");
  });

  it("is deterministic", () => {
    expect(fallbackReasoning(baseInput)).toEqual(fallbackReasoning(baseInput));
  });
});

describe("guardrails", () => {
  it("flags guaranteed returns, price targets, and unknown sources", () => {
    const out = fallbackReasoning(baseInput);
    out.recommendations[0].thesisMd += " This stock is guaranteed to double with a $500 price target.";
    out.recommendations[0].sourceIds = ["src_meth", "src_bogus"];
    const gr = applyGuardrails(out, baseInput);
    expect(gr.ok).toBe(false);
    expect(gr.violations.join(" ")).toMatch(/guarantee/i);
    expect(gr.violations.join(" ")).toMatch(/price target/i);
    // unknown source id is dropped, not fatal
    expect(out.recommendations[0].sourceIds).toEqual(["src_meth"]);
  });

  it("flags a recommendation with no risks", () => {
    const out = fallbackReasoning(baseInput);
    out.recommendations[0].risks = [];
    const gr = applyGuardrails(out, baseInput);
    expect(gr.ok).toBe(false);
    expect(gr.violations.join(" ")).toMatch(/no risks/i);
  });

  it("flags a recommendation for a security not held", () => {
    const out = fallbackReasoning(baseInput);
    out.recommendations.push({ ...out.recommendations[0], ticker: "GHOST" });
    const gr = applyGuardrails(out, baseInput);
    expect(gr.violations.join(" ")).toMatch(/not in the target portfolio/i);
  });
});
