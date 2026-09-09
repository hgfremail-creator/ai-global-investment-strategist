// Market-regime engine. Each indicator casts a weighted vote in [-2, +2]
// (positive = risk-on). The weighted average maps to a regime band. Every vote
// carries a written rationale so the Strategy page can answer "why this regime?".

import type { Regime } from "@/lib/enums";

export type RegimeDriver = {
  indicator: string;
  value: number | null;
  vote: number; // -2..+2
  weight: number;
  rationale: string;
  sourceId?: string;
};

export type RegimeInput = {
  spxTrend: number | null; // -1..1 (price vs 50/200 dma composite)
  ndxTrend: number | null;
  spxRealisedVol: number | null; // annualised; VIX proxy
  hyOas: number | null; // %
  hyOasChange3m: number | null; // pp
  us10y: number | null;
  curve2s10s: number | null; // pp (US10Y - US2Y)
  goldMom3m: number | null; // fraction
  dxyTrend: number | null; // -1..1
  breadthAbove200: number | null; // 0..1 fraction of equities above 200dma
  earningsRevisionBreadth: number | null; // -1..1 (net share of positive revisions)
  semiRelStrength: number | null; // semi basket 3m mom minus SPX 3m mom
  sources?: Partial<Record<string, string>>;
};

function clampVote(v: number): number {
  return Math.max(-2, Math.min(2, Math.round(v * 100) / 100));
}

export function classifyRegime(input: RegimeInput): {
  regime: Regime;
  score: number;
  drivers: RegimeDriver[];
} {
  const d: RegimeDriver[] = [];
  const src = input.sources ?? {};

  // 1. S&P 500 trend
  if (input.spxTrend != null) {
    const vote = clampVote(input.spxTrend * 2);
    d.push({
      indicator: "S&P 500 trend",
      value: input.spxTrend,
      vote,
      weight: 1.4,
      rationale:
        vote > 0.5 ? "Price above rising 50- and 200-day averages — established uptrend."
        : vote < -0.5 ? "Price below falling moving averages — downtrend."
        : "Trend mixed / transitional.",
      sourceId: src.spx,
    });
  }

  // 2. Nasdaq 100 trend
  if (input.ndxTrend != null) {
    d.push({
      indicator: "Nasdaq 100 trend",
      value: input.ndxTrend,
      vote: clampVote(input.ndxTrend * 1.8),
      weight: 1.0,
      rationale: input.ndxTrend > 0 ? "Growth leadership intact." : "Growth leadership deteriorating.",
      sourceId: src.ndx,
    });
  }

  // 3. Volatility (VIX proxy)
  if (input.spxRealisedVol != null) {
    const v = input.spxRealisedVol;
    const vote = clampVote(v < 0.12 ? 1.3 : v < 0.16 ? 0.6 : v < 0.22 ? -0.4 : v < 0.30 ? -1.4 : -2);
    d.push({
      indicator: "Equity volatility (realised, VIX proxy)",
      value: v,
      vote,
      weight: 1.2,
      rationale: `Annualised realised volatility ${(v * 100).toFixed(0)}% — ${vote > 0 ? "calm" : "elevated"}.`,
      sourceId: src.vol,
    });
  }

  // 4. Credit spreads (HY OAS)
  if (input.hyOas != null) {
    const level = input.hyOas;
    const chg = input.hyOasChange3m ?? 0;
    const vote = clampVote((level < 3 ? 1.2 : level < 4 ? 0.4 : level < 5.5 ? -0.8 : -2) - chg * 1.5);
    d.push({
      indicator: "High-yield credit spread (OAS)",
      value: level,
      vote,
      weight: 1.5,
      rationale: `HY OAS ${level.toFixed(2)}% (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}pp/3m) — ${vote > 0 ? "credit conditions supportive" : "credit stress building"}.`,
      sourceId: src.hy,
    });
  }

  // 5. Yield curve
  if (input.curve2s10s != null) {
    const c = input.curve2s10s;
    const vote = clampVote(c > 0.5 ? 0.8 : c > 0 ? 0.3 : c > -0.5 ? -0.6 : -1.2);
    d.push({
      indicator: "US yield curve (2s10s)",
      value: c,
      vote,
      weight: 0.8,
      rationale: `2s10s at ${c.toFixed(2)}pp — ${c < 0 ? "inverted, late-cycle signal" : "positively sloped"}.`,
      sourceId: src.curve,
    });
  }

  // 6. Gold momentum (safe-haven bid)
  if (input.goldMom3m != null) {
    const g = input.goldMom3m;
    const vote = clampVote(g > 0.12 ? -0.8 : g > 0.05 ? -0.3 : g < -0.05 ? 0.4 : 0);
    d.push({
      indicator: "Gold momentum (3m)",
      value: g,
      vote,
      weight: 0.7,
      rationale: `Gold ${(g * 100).toFixed(1)}%/3m — ${g > 0.08 ? "strong safe-haven demand" : "no flight to safety"}.`,
      sourceId: src.gold,
    });
  }

  // 7. US dollar trend
  if (input.dxyTrend != null) {
    d.push({
      indicator: "US dollar trend",
      value: input.dxyTrend,
      vote: clampVote(-input.dxyTrend * 0.9),
      weight: 0.7,
      rationale: input.dxyTrend > 0 ? "Rising dollar — tightening global liquidity." : "Softer dollar — supportive of risk assets.",
      sourceId: src.dxy,
    });
  }

  // 8. Market breadth
  if (input.breadthAbove200 != null) {
    const b = input.breadthAbove200;
    d.push({
      indicator: "Breadth (share above 200-day avg)",
      value: b,
      vote: clampVote((b - 0.5) * 3),
      weight: 1.0,
      rationale: `${(b * 100).toFixed(0)}% of the equity universe is above its 200-day average.`,
      sourceId: src.breadth,
    });
  }

  // 9. Earnings-revision breadth
  if (input.earningsRevisionBreadth != null) {
    d.push({
      indicator: "Earnings-revision breadth",
      value: input.earningsRevisionBreadth,
      vote: clampVote(input.earningsRevisionBreadth * 2),
      weight: 1.1,
      rationale:
        input.earningsRevisionBreadth > 0
          ? "Consensus estimates being revised up on balance."
          : "Consensus estimates being cut on balance.",
      sourceId: src.revisions,
    });
  }

  // 10. Semiconductor relative strength
  if (input.semiRelStrength != null) {
    const r = input.semiRelStrength;
    d.push({
      indicator: "Semiconductor relative strength (3m vs S&P)",
      value: r,
      vote: clampVote(r * 5),
      weight: 1.0,
      rationale: `Semis ${r >= 0 ? "outperforming" : "lagging"} the market by ${(r * 100).toFixed(1)}pp/3m — a key cyclical/AI tell.`,
      sourceId: src.semi,
    });
  }

  const wsum = d.reduce((a, x) => a + x.weight, 0);
  const score = wsum > 0 ? d.reduce((a, x) => a + x.vote * x.weight, 0) / wsum : 0;
  const rounded = Math.round(score * 1000) / 1000;

  const regime: Regime =
    rounded >= 1.2 ? "STRONG_RISK_ON"
    : rounded >= 0.4 ? "RISK_ON"
    : rounded > -0.4 ? "NEUTRAL"
    : rounded > -1.2 ? "RISK_OFF"
    : "CRISIS";

  return { regime, score: rounded, drivers: d };
}
