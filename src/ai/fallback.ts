// Deterministic fallback writer. Turns the structured scoring/analysis data into
// readable, DATA-GROUNDED recommendation prose when no LLM is configured (or when
// the LLM output fails validation). Output is the exact same schema as the LLM
// path. Clearly labelled "generated without LLM" in the UI.

import type {
  AiBatchOutput,
  ReasoningInput,
  RecommendationOutput,
  RejectionOutput,
  SecurityBundle,
} from "./schema";
import type { Action } from "@/lib/enums";

const pctStr = (v: unknown) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "n/a";
const numStr = (v: unknown, d = 1) =>
  typeof v === "number" ? v.toFixed(d) : "n/a";

function chooseAction(b: SecurityBundle, regimeScore: number): Action {
  const s = b.overallScore;
  const held = (b.targetWeight ?? 0) > 0.005;
  const over =
    b.existingExposure && b.targetWeight != null
      ? b.existingExposure.weight - b.targetWeight
      : 0;

  if (over > 0.03) return "REDUCE";
  if (!held) {
    if (s >= 55) return "WATCH";
    return "WATCH";
  }
  if (s >= 78 && regimeScore > -0.4) return "STRONG_BUY";
  if (s >= 62) return "BUY";
  if (s >= 46) return "HOLD";
  if (s < 40) return "SELL";
  return "HOLD";
}

function evidenceQuality(b: SecurityBundle, input: ReasoningInput): number {
  const f = b.fundamentals;
  const fields = Object.values(f).filter((x) => x != null).length;
  const totalFields = Math.max(1, Object.keys(f).length);
  const completeness = fields / totalFields;
  const srcIds = new Set([
    ...b.recentNews.map((n) => n.sourceId),
  ]);
  const srcs = input.sources.filter((s) => srcIds.has(s.id));
  const demoPenalty = input.sources.some((s) => s.isDemo) ? 0.25 : 0;
  const freshBonus = srcs.some((s) => s.freshness === "LIVE" || s.freshness === "TODAY") ? 0.1 : 0;
  const base = 0.45 + 0.4 * completeness + freshBonus - demoPenalty;
  return Math.round(Math.max(10, Math.min(97, base * 100)));
}

function valuationView(score: number, hasData: boolean): RecommendationOutput["valuationView"] {
  if (!hasData) return "UNCLEAR";
  if (score >= 65) return "CHEAP";
  if (score >= 45) return "FAIR";
  return "EXPENSIVE";
}

function entryStrategy(b: SecurityBundle): string {
  const mom = (b.rawMetrics.mom3m as number | null) ?? null;
  const trend = (b.rawMetrics.trend as number | null) ?? null;
  const valScore = b.componentScores.valuation ?? 50;
  if (b.assetClass === "CASH") return "Hold as dry powder; no timing required.";
  if (b.assetClass === "GOV_BOND" || b.assetClass === "IG_BOND")
    return "Build the full position now — carry accrues from day one and timing adds little.";
  if (b.assetClass === "GOLD")
    return "Accumulate in tranches; add on pullbacks toward the rising trend.";
  if (valScore < 42 && (mom ?? 0) > 0.05)
    return "Valuation is demanding and momentum is strong — accumulate gradually and add on pullbacks rather than chasing.";
  if (valScore >= 60 && (trend ?? 0) <= 0)
    return "Undemanding valuation but weak trend — buy in halves and complete the position as the trend stabilises.";
  return "Phase in over roughly 4–6 weeks to average the entry.";
}

function timeHorizon(b: SecurityBundle): RecommendationOutput["timeHorizon"] {
  if (b.assetClass === "GOV_BOND" || b.assetClass === "IG_BOND" || b.assetClass === "GOLD") return "LONG";
  if ((b.componentScores.marketMomentum ?? 50) > 65) return "MEDIUM";
  return "LONG";
}

function topComponents(b: SecurityBundle, n: number): string[] {
  return Object.entries(b.componentScores)
    .filter(([k]) => k !== "risk")
    .sort((a, c) => c[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}
function weakComponents(b: SecurityBundle, n: number): string[] {
  return Object.entries(b.componentScores)
    .sort((a, c) => a[1] - c[1])
    .slice(0, n)
    .map(([k]) => k);
}

const LABEL: Record<string, string> = {
  businessQuality: "business quality",
  growth: "growth",
  valuation: "valuation",
  earningsMomentum: "earnings momentum",
  marketMomentum: "price momentum",
  aiExposure: "AI exposure",
  balanceSheet: "balance sheet",
  risk: "risk profile",
};

function buildThesis(b: SecurityBundle, input: ReasoningInput): string {
  const strong = topComponents(b, 3);
  const lines: string[] = [];
  lines.push(
    `**${b.name} (${b.ticker})** scores **${b.overallScore.toFixed(0)}/100** overall and sits in the ${b.sleeve} sleeve` +
      (b.targetWeight != null ? ` at a ${(b.targetWeight * 100).toFixed(1)}% target weight.` : "."),
  );
  lines.push(
    `Its strongest components are ${strong.map((k) => `**${LABEL[k]}** (${b.componentScores[k].toFixed(0)})`).join(", ")}.`,
  );
  for (const k of strong) if (b.componentNotes[k]) lines.push(`- ${LABEL[k][0].toUpperCase() + LABEL[k].slice(1)}: ${b.componentNotes[k]}.`);
  if (b.assetClass === "EQUITY" && b.aiExposureDrivers.length) {
    lines.push(`- AI exposure (${b.componentScores.aiExposure?.toFixed(0)}): ${b.aiExposureDrivers.slice(0, 2).join("; ")}.`);
  }
  if (b.existingExposure) {
    lines.push(`- You already hold ${b.existingExposure.quantity} — ${b.existingExposure.note}`);
  }
  lines.push(
    `The current market regime is **${input.regime.regime}** (composite ${input.regime.score.toFixed(2)}), which the sleeve targets already reflect.`,
  );
  return lines.join("\n");
}

function buildCatalysts(b: SecurityBundle): string[] {
  const out: string[] = [];
  if ((b.componentScores.growth ?? 0) >= 60) out.push(`Continued delivery on the growth already in the numbers (${b.componentNotes.growth ?? "revenue/EPS growth"}).`);
  if ((b.componentScores.earningsMomentum ?? 0) >= 55) out.push("Further upward earnings revisions — estimate momentum is currently positive.");
  if ((b.componentScores.aiExposure ?? 0) >= 60) out.push("Sustained AI-infrastructure capex from hyperscalers and enterprises.");
  if ((b.componentScores.marketMomentum ?? 0) >= 60) out.push("Trend continuation — price is above its 50- and 200-day averages.");
  if (b.assetClass === "GOLD") out.push("Falling real yields, a softer dollar, or a rise in geopolitical risk.");
  if (b.assetClass === "GOV_BOND") out.push("A dovish shift in central-bank guidance or a growth scare that bids duration.");
  if (out.length === 0) out.push("Stabilisation or improvement in the currently weaker score components.");
  return out;
}

function buildRisks(b: SecurityBundle, input: ReasoningInput): string[] {
  const out: string[] = [];
  if (b.componentNotes.risk) out.push(`Volatility / drawdown: ${b.componentNotes.risk}.`);
  if ((b.componentScores.valuation ?? 50) < 45) out.push(`Valuation risk — ${b.componentNotes.valuation ?? "the multiple is above its own history / the sector"}; the thesis depends on growth staying above consensus.`);
  if ((b.componentScores.balanceSheet ?? 50) < 45) out.push(`Balance sheet — ${b.componentNotes.balanceSheet ?? "leverage is elevated versus peers"}.`);
  if (b.country !== "US" && b.country !== "GLOBAL") out.push(`Geographic / currency risk — non-USD listing (${b.country}, ${input.constraints ? "" : ""}); returns to a USD investor include an FX component.`);
  if ((input.portfolioFactorExposure.aiFactor ?? 0) > 0.6 && (b.componentScores.aiExposure ?? 0) > 60) out.push("Adds to an already-high portfolio AI-factor concentration.");
  if (input.regime.score < -0.4) out.push("Risk-off regime — cyclically-sensitive names can de-rate quickly.");
  if (out.length === 0) out.push("General market risk and the possibility that the score deteriorates as new data arrives.");
  return out;
}

function buildInvalidation(b: SecurityBundle): string[] {
  const out: string[] = [];
  const weak = weakComponents(b, 2);
  if ((b.componentScores.growth ?? 100) < 80) out.push("Revenue or EPS growth decelerates materially below the current trajectory.");
  if ((b.componentScores.earningsMomentum ?? 100) < 80) out.push("Consensus estimates are revised down over two or more consecutive months.");
  if (b.assetClass === "EQUITY") out.push("Operating margins compress rather than hold or expand.");
  if ((b.componentScores.aiExposure ?? 0) > 50) out.push("A clear slowdown in data-centre / AI-accelerator demand.");
  if ((b.componentScores.valuation ?? 50) < 45) out.push("The valuation premium is not supported by an actual acceleration in fundamentals within ~2 quarters.");
  for (const k of weak) if (b.componentNotes[k]) out.push(`Further deterioration in ${LABEL[k]} (currently ${b.componentScores[k].toFixed(0)}).`);
  return [...new Set(out)].slice(0, 5);
}

function buildBullBearBase(b: SecurityBundle): RecommendationOutput["bullBearBase"] {
  const g = b.componentScores.growth ?? 50;
  const v = b.componentScores.valuation ?? 50;
  return {
    bull: `Growth stays above consensus and the ${v < 45 ? "premium" : "current"} valuation is maintained or expands; the position compounds ahead of its sleeve benchmark.`,
    base: `The company delivers roughly in line with expectations; returns approximate its earnings growth (~${g >= 60 ? "double-digit" : "mid-single-digit"}) with the multiple broadly flat.`,
    bear: `Growth disappoints or estimates are cut; ${v < 45 ? "the multiple compresses toward the sector median and " : ""}the position underperforms and is trimmed or exited at the next review.`,
    keyAssumptions: [
      `Score components remain broadly stable (overall ${b.overallScore.toFixed(0)}).`,
      b.componentNotes.growth ? `Growth: ${b.componentNotes.growth}.` : "Growth trajectory holds.",
      b.componentNotes.valuation ? `Valuation: ${b.componentNotes.valuation}.` : "Valuation does not de-rate.",
    ],
  };
}

function buildDevilsAdvocate(b: SecurityBundle): string {
  const weak = weakComponents(b, 3);
  const lines = [
    `**Assume the thesis is wrong.** The evidence that would show it:`,
    ...weak.map((k) => `- ${LABEL[k][0].toUpperCase() + LABEL[k].slice(1)} is the weakest link (${b.componentScores[k].toFixed(0)}/100)${b.componentNotes[k] ? ` — ${b.componentNotes[k]}` : ""}. A further leg down here would break the case.`),
  ];
  if ((b.componentScores.valuation ?? 50) < 45)
    lines.push(`- The position is being paid for with future growth. If the next two prints are merely in line, the multiple has room to fall a long way before it is "cheap".`);
  if ((b.componentScores.marketMomentum ?? 50) > 70)
    lines.push(`- Strong recent momentum can mask deteriorating fundamentals; the price is a lagging confirmation, not a reason to own it.`);
  lines.push(`- Consensus may already embed the good news, leaving asymmetric downside on any disappointment.`);
  return lines.join("\n");
}

function buildFic(b: SecurityBundle, action: Action): RecommendationOutput["fic"] {
  const f = b.fundamentals;
  const facts: string[] = [];
  if (f["Revenue growth"] != null) facts.push(`Revenue growth ${pctStr(f["Revenue growth"])}.`);
  if (f["Operating margin"] != null) facts.push(`Operating margin ${pctStr(f["Operating margin"])}.`);
  if (f.ROIC != null) facts.push(`ROIC ${pctStr(f.ROIC)}.`);
  if (f["Forward P/E"] != null) facts.push(`Forward P/E ${numStr(f["Forward P/E"])}.`);
  if (b.rawMetrics.mom12m != null) facts.push(`12-month total return ${pctStr(b.rawMetrics.mom12m)}.`);
  if (b.rawMetrics.vol != null) facts.push(`Annualised realised volatility ${pctStr(b.rawMetrics.vol)}.`);
  if (facts.length === 0) facts.push(`Overall score ${b.overallScore.toFixed(0)}/100 from the deterministic model.`);
  return {
    facts,
    interpretations: [
      b.componentNotes.growth ? `Growth reading: ${b.componentNotes.growth}.` : "",
      b.componentNotes.valuation ? `Valuation reading: ${b.componentNotes.valuation}.` : "",
      b.componentNotes.risk ? `Risk reading: ${b.componentNotes.risk}.` : "",
    ].filter(Boolean),
    aiConclusion:
      b.targetWeight != null
        ? `Model action: ${action} at a ${(b.targetWeight * 100).toFixed(1)}% target weight${b.existingExposure ? ` (you currently hold ${(b.existingExposure.weight * 100).toFixed(1)}%)` : ""}.`
        : `Model action: ${action} — not currently in the target portfolio.`,
  };
}

function conviction(b: SecurityBundle, eq: number): number {
  const base = 0.5 * b.overallScore + 0.3 * eq + 0.2 * (b.componentScores.risk ?? 50);
  return Math.round(Math.max(5, Math.min(96, base)));
}

export function fallbackReasoning(input: ReasoningInput): AiBatchOutput {
  const methodologyId = input.sources.find((s) => s.type === "METHODOLOGY")?.id;

  const recommendations: RecommendationOutput[] = input.holdings.map((b) => {
    const action = chooseAction(b, input.regime.score);
    const eq = evidenceQuality(b, input);
    const hasVal = b.fundamentals["Forward P/E"] != null || b.assetClass !== "EQUITY";
    const srcIds = [
      ...new Set([
        ...(methodologyId ? [methodologyId] : []),
        ...b.recentNews.map((n) => n.sourceId),
      ]),
    ];
    return {
      ticker: b.ticker,
      action,
      conviction: conviction(b, eq),
      evidenceQuality: eq,
      timeHorizon: timeHorizon(b),
      valuationView: valuationView(b.componentScores.valuation ?? 50, hasVal),
      entryStrategy: entryStrategy(b),
      thesisMd: buildThesis(b, input),
      catalysts: buildCatalysts(b),
      risks: buildRisks(b, input),
      invalidationConditions: buildInvalidation(b),
      bullBearBase: buildBullBearBase(b),
      devilsAdvocateMd: buildDevilsAdvocate(b),
      fic: buildFic(b, action),
      sourceIds: srcIds,
    };
  });

  const rejections: RejectionOutput[] = input.rejected.map((b) => {
    const weak = weakComponents(b, 3);
    return {
      ticker: b.ticker,
      action: "WATCH" as const,
      reasons: [
        `Overall score ${b.overallScore.toFixed(0)}/100 — below the names selected for its sleeve.`,
        ...weak.map((k) => `${LABEL[k][0].toUpperCase() + LABEL[k].slice(1)} is weak (${b.componentScores[k].toFixed(0)})${b.componentNotes[k] ? `: ${b.componentNotes[k]}` : ""}.`),
        `Risk/reward is inferior to the alternatives already held in the ${b.sleeve} sleeve.`,
      ],
      whatWouldChangeOurMind: [
        `A durable improvement in ${LABEL[weak[0]]} (currently ${b.componentScores[weak[0]].toFixed(0)}).`,
        "A valuation reset that improves the entry point without a fundamental deterioration.",
        "Positive earnings-revision momentum sustained over multiple months.",
      ],
      sourceIds: methodologyId ? [methodologyId] : [],
    };
  });

  return { recommendations, rejections };
}
