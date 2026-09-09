// Transparent 0–100 security scoring model.
//
// overall = Σ weightᵢ · subScoreᵢ   (subScoreᵢ ∈ [0,100])
// Each subScore blends a PEER PERCENTILE with an ABSOLUTE anchor, so a security
// is judged both against its peers and against sensible absolute thresholds.
// `contributions` (= weightᵢ · subScoreᵢ) sum to `overall` and are shown in the UI.

import type { ScoreWeights } from "@/lib/config";
import type { AssetClass } from "@/lib/enums";
import { aiExposureScore, type FactorLoadings } from "./aiExposure";
import { maxDrawdown, momentum, realisedVol, trendScore, type Bar } from "./indicators";
import { blendRelAbs, mean, percentileRank, scaleClamped, to100 } from "./normalize";

export type RawFundamentals = {
  revenueGrowth?: number | null;
  epsGrowth?: number | null;
  fcfMargin?: number | null;
  roic?: number | null;
  netDebtToEbitda?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  pe?: number | null;
  forwardPe?: number | null;
  evEbitda?: number | null;
  peg?: number | null;
  ps?: number | null;
  fcfYield?: number | null;
  epsRevision4w?: number | null;
  epsRevision13w?: number | null;
  expectedRevenueGrowth?: number | null;
  expectedEpsGrowth?: number | null;
  moat?: "NONE" | "NARROW" | "WIDE" | null;
  tamTier?: number | null;
};

export type ScoreInput = {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: string;
  industry: string;
  factors: FactorLoadings;
  fundamentals: RawFundamentals | null;
  bars: Bar[];
};

export type MacroContext = {
  real10y?: number | null;
  real10yChange3m?: number | null;
  dxyTrend?: number | null; // -1..1 (down = supportive for gold / non-USD)
  us10y?: number | null;
  us10yChange3m?: number | null;
  curve2s10s?: number | null;
  igOas?: number | null;
  frontEndYield?: number | null; // e.g. fed funds
};

export const SCORE_COMPONENTS = [
  "businessQuality",
  "growth",
  "valuation",
  "earningsMomentum",
  "marketMomentum",
  "aiExposure",
  "balanceSheet",
  "risk",
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export type ScoredSecurity = {
  ticker: string;
  assetClass: AssetClass;
  overall: number;
  components: Record<ScoreComponent, number>;
  contributions: Record<ScoreComponent, number>;
  weights: ScoreWeights;
  notes: Record<ScoreComponent, string>;
  raw: {
    vol: number | null;
    maxDrawdown: number;
    mom1m: number | null;
    mom3m: number | null;
    mom6m: number | null;
    mom12m: number | null;
    trend: number | null;
    aiDrivers: string[];
  };
};

const WEIGHT_KEYS = SCORE_COMPONENTS;

function emptyRecord(): Record<ScoreComponent, number> {
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, 0])) as Record<ScoreComponent, number>;
}

function pct(n: number | null | undefined): string {
  return n == null ? "n/a" : `${(n * 100).toFixed(1)}%`;
}

// ─────────────────────────── equity sub-scores ───────────────────────────

function equityScores(
  s: ScoreInput,
  peers: ScoreInput[],
): { components: Record<ScoreComponent, number>; notes: Record<ScoreComponent, string>; raw: ScoredSecurity["raw"] } {
  const f = s.fundamentals ?? {};
  const peerF = peers.map((p) => p.fundamentals ?? {});
  const components = emptyRecord();
  const notes = {} as Record<ScoreComponent, string>;

  // Business quality
  const bqParts = [
    percentileRank(f.roic, peerF.map((x) => x.roic)),
    percentileRank(f.fcfMargin, peerF.map((x) => x.fcfMargin)),
    percentileRank(f.grossMargin, peerF.map((x) => x.grossMargin)),
    percentileRank(f.operatingMargin, peerF.map((x) => x.operatingMargin)),
  ];
  const moatBoost = f.moat === "WIDE" ? 0.15 : f.moat === "NARROW" ? 0.07 : 0;
  const bqRel = mean(bqParts);
  const bqAbs =
    f.roic != null ? scaleClamped(f.roic, 0.04, 0.25) : null;
  components.businessQuality = to100(Math.min(1, blendRelAbs(bqRel, bqAbs) + moatBoost));
  notes.businessQuality =
    `ROIC ${pct(f.roic)}, FCF margin ${pct(f.fcfMargin)}, gross margin ${pct(f.grossMargin)}` +
    (f.moat && f.moat !== "NONE" ? `, ${f.moat.toLowerCase()} moat` : "");

  // Growth
  const gRel = mean([
    percentileRank(f.revenueGrowth, peerF.map((x) => x.revenueGrowth)),
    percentileRank(f.epsGrowth, peerF.map((x) => x.epsGrowth)),
    percentileRank(f.expectedRevenueGrowth, peerF.map((x) => x.expectedRevenueGrowth)),
  ]);
  const gAbs = f.revenueGrowth != null ? scaleClamped(f.revenueGrowth, 0.0, 0.35) : null;
  const tamBoost = f.tamTier != null ? (f.tamTier - 3) * 0.03 : 0;
  components.growth = to100(Math.max(0, Math.min(1, blendRelAbs(gRel, gAbs) + tamBoost)));
  notes.growth = `revenue growth ${pct(f.revenueGrowth)}, EPS growth ${pct(f.epsGrowth)}, expected revenue ${pct(f.expectedRevenueGrowth)}`;

  // Valuation (cheaper = higher score) — growth-adjusted
  const valRel = mean([
    percentileRank(f.forwardPe, peerF.map((x) => x.forwardPe), false),
    percentileRank(f.evEbitda, peerF.map((x) => x.evEbitda), false),
    percentileRank(f.ps, peerF.map((x) => x.ps), false),
    percentileRank(f.fcfYield, peerF.map((x) => x.fcfYield), true),
  ]);
  const pegAbs = f.peg != null ? scaleClamped(f.peg, 3.0, 0.6) : null; // low PEG -> high
  components.valuation = to100(blendRelAbs(valRel, pegAbs, 0.65));
  notes.valuation = `forward P/E ${f.forwardPe?.toFixed(1) ?? "n/a"}, EV/EBITDA ${f.evEbitda?.toFixed(1) ?? "n/a"}, PEG ${f.peg?.toFixed(2) ?? "n/a"}, FCF yield ${pct(f.fcfYield)}`;

  // Earnings momentum
  const emRel = mean([
    percentileRank(f.epsRevision4w, peerF.map((x) => x.epsRevision4w)),
    percentileRank(f.epsRevision13w, peerF.map((x) => x.epsRevision13w)),
  ]);
  const emAbs =
    f.epsRevision13w != null ? scaleClamped(f.epsRevision13w, -0.1, 0.1) : null;
  components.earningsMomentum = to100(blendRelAbs(emRel, emAbs));
  notes.earningsMomentum = `4w EPS revision ${pct(f.epsRevision4w)}, 13w ${pct(f.epsRevision13w)}`;

  // Market momentum
  const mom = momentum(s.bars);
  const mmRel = percentileRank(mom.blended, peers.map((p) => momentum(p.bars).blended));
  const mmAbs = mom.blended != null ? scaleClamped(mom.blended, -0.25, 0.5) : null;
  const trend = trendScore(s.bars);
  components.marketMomentum = to100(
    Math.min(1, blendRelAbs(mmRel, mmAbs) + (trend != null ? trend * 0.05 : 0)),
  );
  notes.marketMomentum = `1M ${pct(mom.m1)}, 3M ${pct(mom.m3)}, 6M ${pct(mom.m6)}, 12M ${pct(mom.m12)}`;

  // AI exposure
  const ai = aiExposureScore({ factors: s.factors, sector: s.sector, industry: s.industry });
  components.aiExposure = ai.score;
  notes.aiExposure = ai.drivers.slice(0, 3).join("; ");

  // Balance sheet
  const bsRel = percentileRank(f.netDebtToEbitda, peerF.map((x) => x.netDebtToEbitda), false);
  const bsAbs = f.netDebtToEbitda != null ? scaleClamped(f.netDebtToEbitda, 4, -1) : null;
  components.balanceSheet = to100(blendRelAbs(bsRel, bsAbs));
  notes.balanceSheet = `net debt / EBITDA ${f.netDebtToEbitda?.toFixed(1) ?? "n/a"}x`;

  // Risk (higher score = LOWER risk)
  const vol = realisedVol(s.bars);
  const mdd = maxDrawdown(s.bars);
  const volRel = percentileRank(vol, peers.map((p) => realisedVol(p.bars)), false);
  const volAbs = vol != null ? scaleClamped(vol, 0.6, 0.12) : null;
  const valuationRiskPenalty = f.forwardPe != null && f.forwardPe > 40 ? 0.12 : 0;
  const ddPenalty = scaleClamped(-mdd, 0.6, 0.05);
  components.risk = to100(
    Math.max(0, blendRelAbs(volRel, volAbs) * 0.7 + ddPenalty * 0.3 - valuationRiskPenalty),
  );
  notes.risk = `realised vol ${pct(vol)}, max drawdown ${pct(mdd)}${valuationRiskPenalty ? ", elevated valuation risk" : ""}`;

  return {
    components,
    notes,
    raw: {
      vol,
      maxDrawdown: mdd,
      mom1m: mom.m1,
      mom3m: mom.m3,
      mom6m: mom.m6,
      mom12m: mom.m12,
      trend,
      aiDrivers: ai.drivers,
    },
  };
}

// ─────────────────────────── non-equity sub-scores ───────────────────────────

function nonEquityScores(
  s: ScoreInput,
  macro: MacroContext,
): { components: Record<ScoreComponent, number>; notes: Record<ScoreComponent, string>; raw: ScoredSecurity["raw"] } {
  const components = emptyRecord();
  const notes = {} as Record<ScoreComponent, string>;
  const mom = momentum(s.bars);
  const vol = realisedVol(s.bars);
  const mdd = maxDrawdown(s.bars);
  const trend = trendScore(s.bars);

  if (s.assetClass === "GOLD") {
    // Attractive when real yields fall, USD weakens, momentum positive.
    const realYieldSignal =
      macro.real10yChange3m != null ? scaleClamped(-macro.real10yChange3m, -0.3, 0.3) : 0.5;
    const usdSignal = macro.dxyTrend != null ? scaleClamped(-macro.dxyTrend, -1, 1) : 0.5;
    const momSignal = mom.blended != null ? scaleClamped(mom.blended, -0.15, 0.25) : 0.5;
    const attractiveness = 0.4 * realYieldSignal + 0.3 * usdSignal + 0.3 * momSignal;
    components.businessQuality = to100(0.7); // gold: store of value
    components.growth = to100(0.4);
    components.valuation = to100(realYieldSignal);
    components.earningsMomentum = to100(0.5);
    components.marketMomentum = to100(momSignal);
    components.aiExposure = 0;
    components.balanceSheet = to100(0.9);
    components.risk = to100(vol != null ? scaleClamped(vol, 0.3, 0.08) : 0.7);
    notes.valuation = `real 10y ${macro.real10y?.toFixed(2) ?? "n/a"}% (3m Δ ${macro.real10yChange3m?.toFixed(2) ?? "n/a"})`;
    notes.marketMomentum = `gold momentum ${pct(mom.blended)}`;
    notes.businessQuality = "strategic reserve asset / diversifier";
    notes.growth = "no cash flow; return is price-driven";
    notes.earningsMomentum = "n/a for gold";
    notes.aiExposure = "none";
    notes.balanceSheet = "no issuer credit risk (physical / allocated)";
    notes.risk = `realised vol ${pct(vol)}, max drawdown ${pct(mdd)}`;
    return {
      components: scaleToOverallInputs(components, attractiveness),
      notes,
      raw: { vol, maxDrawdown: mdd, mom1m: mom.m1, mom3m: mom.m3, mom6m: mom.m6, mom12m: mom.m12, trend, aiDrivers: [] },
    };
  }

  if (s.assetClass === "GOV_BOND" || s.assetClass === "IG_BOND") {
    const yieldLevel = macro.us10y != null ? scaleClamped(macro.us10y, 1.0, 5.5) : 0.5;
    const rateDirection =
      macro.us10yChange3m != null ? scaleClamped(-macro.us10yChange3m, -0.6, 0.6) : 0.5;
    const creditPenalty = s.assetClass === "IG_BOND" && macro.igOas != null
      ? scaleClamped(macro.igOas, 2.0, 0.5)
      : 0.7;
    components.businessQuality = to100(0.75);
    components.growth = to100(0.35);
    components.valuation = to100(yieldLevel);
    components.earningsMomentum = to100(rateDirection);
    components.marketMomentum = to100(mom.blended != null ? scaleClamped(mom.blended, -0.1, 0.1) : 0.5);
    components.aiExposure = 0;
    components.balanceSheet = to100(s.assetClass === "GOV_BOND" ? 0.95 : creditPenalty);
    components.risk = to100(vol != null ? scaleClamped(vol, 0.12, 0.02) : 0.8);
    notes.valuation = `starting yield proxy (10y ${macro.us10y?.toFixed(2) ?? "n/a"}%)`;
    notes.earningsMomentum = `rate path (3m Δ10y ${macro.us10yChange3m?.toFixed(2) ?? "n/a"})`;
    notes.businessQuality = s.assetClass === "GOV_BOND" ? "sovereign, high liquidity" : "diversified investment-grade credit";
    notes.growth = "coupon + roll-down; limited capital growth";
    notes.marketMomentum = `price momentum ${pct(mom.blended)}`;
    notes.aiExposure = "none";
    notes.balanceSheet = s.assetClass === "GOV_BOND" ? "minimal credit risk" : `IG spread ${macro.igOas?.toFixed(2) ?? "n/a"}%`;
    notes.risk = `duration & rate sensitivity; realised vol ${pct(vol)}`;
    const attractiveness = 0.45 * yieldLevel + 0.35 * rateDirection + 0.2 * creditPenalty;
    return {
      components: scaleToOverallInputs(components, attractiveness),
      notes,
      raw: { vol, maxDrawdown: mdd, mom1m: mom.m1, mom3m: mom.m3, mom6m: mom.m6, mom12m: mom.m12, trend, aiDrivers: [] },
    };
  }

  // CASH
  const y = macro.frontEndYield ?? 0;
  const cashAttractive = scaleClamped(y, 0, 5.5);
  for (const k of WEIGHT_KEYS) components[k] = to100(0.5);
  components.valuation = to100(cashAttractive);
  components.risk = 95;
  components.aiExposure = 0;
  components.growth = to100(0.2);
  notes.valuation = `front-end yield ${y.toFixed(2)}%`;
  notes.risk = "principal stable; reinvestment risk only";
  notes.businessQuality = "highest liquidity, optionality / dry powder";
  notes.growth = "yield only";
  notes.earningsMomentum = "n/a";
  notes.marketMomentum = "n/a";
  notes.aiExposure = "none";
  notes.balanceSheet = "n/a";
  return {
    components,
    notes,
    raw: { vol: 0.01, maxDrawdown: 0, mom1m: 0, mom3m: 0, mom6m: 0, mom12m: 0, trend: 0, aiDrivers: [] },
  };
}

/** Nudge non-equity component scores toward a single attractiveness signal so
 *  the overall score reflects the regime/macro backdrop, while keeping the
 *  component breakdown readable. */
function scaleToOverallInputs(
  components: Record<ScoreComponent, number>,
  attractiveness: number,
): Record<ScoreComponent, number> {
  const target = to100(attractiveness);
  const out = { ...components };
  for (const k of ["valuation", "earningsMomentum", "marketMomentum"] as ScoreComponent[]) {
    out[k] = Math.round((out[k] * 0.5 + target * 0.5) * 10) / 10;
  }
  return out;
}

// ─────────────────────────── public API ───────────────────────────

export function scoreSecurity(
  s: ScoreInput,
  peers: ScoreInput[],
  weights: ScoreWeights,
  macro: MacroContext = {},
): ScoredSecurity {
  const { components, notes, raw } =
    s.assetClass === "EQUITY"
      ? equityScores(s, peers.filter((p) => p.assetClass === "EQUITY"))
      : nonEquityScores(s, macro);

  const contributions = emptyRecord();
  let overall = 0;
  for (const k of WEIGHT_KEYS) {
    const c = weights[k] * components[k];
    contributions[k] = Math.round(c * 100) / 100;
    overall += c;
  }

  return {
    ticker: s.ticker,
    assetClass: s.assetClass,
    overall: Math.round(overall * 10) / 10,
    components,
    contributions,
    weights,
    notes,
    raw,
  };
}

export function scoreUniverse(
  inputs: ScoreInput[],
  weights: ScoreWeights,
  macro: MacroContext = {},
): ScoredSecurity[] {
  return inputs.map((s) => scoreSecurity(s, inputs, weights, macro));
}
