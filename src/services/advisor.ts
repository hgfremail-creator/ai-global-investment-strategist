import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { formatPercent } from "@/lib/money";
import { aiConfigured } from "@/ai/client";
import { applyGuardrailsText } from "@/ai/guardrails";
import type { AllocationRow, FactorExposure } from "./strategyRead";

export type AdvisorAnswer = {
  answer: string;
  citations: { kind: string; ref: string; detail: string }[];
  usedFallback: boolean;
};

export type AdvisorCtx = {
  version: number;
  weekOf: string;
  regime: string;
  regimeScore: number;
  regimeDrivers: { indicator: string; vote: number; rationale: string }[];
  alloc: AllocationRow[];
  factor: FactorExposure;
  recs: {
    ticker: string; name: string; action: string; conviction: number; evidenceQuality: number;
    targetWeight: number; thesis: string; risks: string[]; valuationView: string;
  }[];
  risk: {
    volatility: number; maxHistoricalDrawdown: number; concentrationHHI: number;
    valuationRisk: number; geopoliticalRisk: number; sharpe: number | null;
  } | null;
  stress: { label: string; estimatedImpactPct: number }[];
  changes: { label: string; previousValue: string | null; newValue: string | null; reason: string }[];
  scores: { ticker: string; name: string; overall: number; components: Record<string, number> }[];
};

async function loadContext(portfolioId: string): Promise<AdvisorCtx | null> {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    include: {
      regime: true, riskMetric: true, stressTests: true, changes: true,
      recommendations: { include: { security: true } },
    },
  });
  if (!sv) return null;
  const asOf = (await prisma.securityScore.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }))?.asOf;
  const scores = asOf
    ? await prisma.securityScore.findMany({ where: { asOf }, include: { security: true }, orderBy: { overall: "desc" } })
    : [];

  return {
    version: sv.version,
    weekOf: sv.weekOf.toISOString().slice(0, 10),
    regime: sv.regime.regime,
    regimeScore: sv.regime.score,
    regimeDrivers: fromJson(sv.regime.driversJson, []),
    alloc: fromJson<AllocationRow[]>(sv.allocationJson, []),
    factor: fromJson<FactorExposure>(sv.factorExposureJson, {} as FactorExposure),
    recs: sv.recommendations.map((r) => ({
      ticker: r.security.ticker, name: r.security.name, action: r.action, conviction: r.conviction,
      evidenceQuality: r.evidenceQuality, targetWeight: r.targetWeight,
      thesis: r.thesisMd.split("\n").slice(0, 3).join(" "),
      risks: fromJson<string[]>(r.risksJson, []), valuationView: r.valuationView,
    })),
    risk: sv.riskMetric
      ? {
          volatility: sv.riskMetric.volatility,
          maxHistoricalDrawdown: sv.riskMetric.maxHistoricalDrawdown,
          concentrationHHI: sv.riskMetric.concentrationHHI,
          valuationRisk: sv.riskMetric.valuationRisk,
          geopoliticalRisk: sv.riskMetric.geopoliticalRisk,
          sharpe: sv.riskMetric.sharpe,
        }
      : null,
    stress: sv.stressTests.map((s) => ({ label: s.label, estimatedImpactPct: s.estimatedImpactPct })),
    changes: sv.changes.map((c) => ({ label: c.label, previousValue: c.previousValue, newValue: c.newValue, reason: c.reason })),
    scores: scores.map((s) => ({
      ticker: s.security.ticker, name: s.security.name, overall: s.overall,
      components: {
        businessQuality: s.businessQuality, growth: s.growth, valuation: s.valuation,
        earningsMomentum: s.earningsMomentum, marketMomentum: s.marketMomentum,
        aiExposure: s.aiExposure, balanceSheet: s.balanceSheet, risk: s.risk,
      },
    })),
  };
}

// ─────────────────────── deterministic intent router ───────────────────────

const COMMON_NAMES: Record<string, string> = {
  MICROSOFT: "MSFT", NVIDIA: "NVDA", "ALPHABET": "GOOGL", GOOGLE: "GOOGL", AMAZON: "AMZN",
  META: "META", FACEBOOK: "META", BROADCOM: "AVGO", ORACLE: "ORCL", TESLA: "TSLA",
  APPLE: "AAPL", PALANTIR: "PLTR", TSMC: "2330", "TOKYO ELECTRON": "8035", SONY: "6758",
};

function tickersIn(q: string, ctx: AdvisorCtx): string[] {
  const up = q.toUpperCase();
  const all = new Set([
    ...ctx.alloc.map((r) => r.ticker),
    ...ctx.scores.map((s) => s.ticker),
    ...ctx.recs.map((r) => r.ticker),
    ...ctx.changes.map((c) => c.label),
  ]);
  const byName = new Map<string, string>([
    ...ctx.scores.map((s) => [s.name.toUpperCase(), s.ticker] as const),
    ...ctx.recs.map((r) => [r.name.toUpperCase(), r.ticker] as const),
    ...Object.entries(COMMON_NAMES),
  ]);
  const found: string[] = [];
  for (const t of all) if (new RegExp(`\\b${t.replace(/[.]/g, "\\.")}\\b`).test(up)) found.push(t);
  for (const [name, t] of byName) if (up.includes(name) && !found.includes(t)) found.push(t);
  return found;
}

export function fallbackAnswer(q: string, ctx: AdvisorCtx): AdvisorAnswer {
  const ql = q.toLowerCase();
  const citations: AdvisorAnswer["citations"] = [];
  const tks = tickersIn(q, ctx);

  // "why did you reduce / sell / cut X"
  if (/(reduce|reduced|reducing|trim|trimmed|cut|sell|sold|sold out)/.test(ql) && tks.length) {
    const t = tks[0];
    const ch = ctx.changes.find((c) => c.label === t);
    const rec = ctx.recs.find((r) => r.ticker === t);
    citations.push({ kind: "strategy-version", ref: `v${ctx.version}`, detail: ctx.weekOf });
    if (ch) citations.push({ kind: "change", ref: t, detail: `${ch.previousValue} → ${ch.newValue}` });
    return {
      usedFallback: true,
      citations,
      answer: ch
        ? `In Strategy v${ctx.version}, **${t}** moved ${ch.previousValue} → ${ch.newValue}. Reason on file: ${ch.reason}`
        : rec
          ? `**${t}** was not reduced in v${ctx.version} — its current recommendation is ${rec.action} at ${formatPercent(rec.targetWeight)} (conviction ${rec.conviction}/100).`
          : `No change to ${t} is recorded in the latest strategy version.`,
    };
  }

  // "why are you recommending / why own X"
  if (/(why|recommend|recommending|own|buy|hold|thesis|invest)/.test(ql) && tks.length) {
    const t = tks[0];
    const rec = ctx.recs.find((r) => r.ticker === t);
    const sc = ctx.scores.find((s) => s.ticker === t);
    citations.push({ kind: "strategy-version", ref: `v${ctx.version}`, detail: ctx.weekOf });
    if (sc) citations.push({ kind: "score", ref: t, detail: `overall ${sc.overall.toFixed(0)}/100` });
    if (!rec) return { usedFallback: true, citations, answer: `${t} is not in the current portfolio. Its overall score is ${sc?.overall.toFixed(0) ?? "n/a"}/100.` };
    return {
      usedFallback: true,
      citations,
      answer:
        `**${rec.name} (${t})** — ${rec.action}, target ${formatPercent(rec.targetWeight)}, conviction ${rec.conviction}/100, ` +
        `valuation ${rec.valuationView.toLowerCase()}. ${rec.thesis} ` +
        `Key risks on file: ${rec.risks.slice(0, 2).join("; ")}.`,
    };
  }

  // "prefer X to Y" / "X vs Y"
  if (tks.length >= 2 && /(prefer|versus|vs\.?|compare|better|instead of)/.test(ql)) {
    const [a, b] = tks;
    const sa = ctx.scores.find((s) => s.ticker === a);
    const sb = ctx.scores.find((s) => s.ticker === b);
    citations.push({ kind: "score", ref: a, detail: `overall ${sa?.overall.toFixed(0) ?? "n/a"}` });
    citations.push({ kind: "score", ref: b, detail: `overall ${sb?.overall.toFixed(0) ?? "n/a"}` });
    if (!sa || !sb) return { usedFallback: true, citations, answer: `I don't have current scores for both ${a} and ${b}.` };
    const diffs = Object.keys(sa.components)
      .map((k) => ({ k, d: sa.components[k] - sb.components[k] }))
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 3);
    return {
      usedFallback: true,
      citations,
      answer:
        `${a} scores ${sa.overall.toFixed(0)}/100 vs ${b} at ${sb.overall.toFixed(0)}/100. ` +
        `Biggest differences: ${diffs.map((x) => `${x.k} ${x.d >= 0 ? "+" : ""}${x.d.toFixed(0)} for ${a}`).join(", ")}. ` +
        (sa.overall >= sb.overall
          ? `The model currently ranks ${a} ahead${ctx.alloc.some((r) => r.ticker === a) ? " and holds it" : ""}.`
          : `The model currently ranks ${b} ahead.`),
    };
  }

  // "best risk/reward" / "top ideas" — checked before the generic risk branch
  if (/(best (risk\s*\/?\s*reward|ideas?|opportunit)|top (three|3|ideas?|picks?|names?)|highest conviction|strongest (holdings?|ideas?))/.test(ql)) {
    const ranked = [...ctx.recs]
      .filter((r) => r.targetWeight > 0)
      .sort((a, b) => b.conviction * b.evidenceQuality - a.conviction * a.evidenceQuality)
      .slice(0, 3);
    ranked.forEach((r) => citations.push({ kind: "recommendation", ref: r.ticker, detail: `conviction ${r.conviction}` }));
    return {
      usedFallback: true,
      citations,
      answer:
        `By conviction × evidence quality, the strongest holdings in v${ctx.version} are:\n` +
        ranked
          .map((r, i) => `${i + 1}. **${r.ticker}** (${r.name}) — ${r.action}, ${formatPercent(r.targetWeight)}, conviction ${r.conviction}/100. ${r.thesis}`)
          .join("\n"),
    };
  }

  // "biggest risk"
  if (/(biggest risk|main risk|largest risk|riskiest|what could go wrong|downside|\brisks?\b)/.test(ql)) {
    const worst = [...ctx.stress].sort((a, b) => a.estimatedImpactPct - b.estimatedImpactPct)[0];
    citations.push({ kind: "risk-metric", ref: `v${ctx.version}`, detail: `vol ${formatPercent(ctx.risk?.volatility ?? 0)}` });
    if (worst) citations.push({ kind: "stress-test", ref: worst.label, detail: formatPercent(worst.estimatedImpactPct) });
    const parts: string[] = [];
    if ((ctx.factor.aiFactor ?? 0) > 0.5) parts.push(`AI-factor look-through exposure is ${formatPercent(ctx.factor.aiFactor)} — a single economic driver`);
    if ((ctx.risk?.valuationRisk ?? 0) > 0.45) parts.push(`equity valuation risk is elevated (${formatPercent(ctx.risk!.valuationRisk)})`);
    if ((ctx.risk?.geopoliticalRisk ?? 0) > 0.25) parts.push(`geopolitical risk from non-US exposure is ${formatPercent(ctx.risk!.geopoliticalRisk)}`);
    for (const w of ctx.factor.warnings ?? []) parts.push(w);
    return {
      usedFallback: true,
      citations,
      answer:
        `The main risks in Strategy v${ctx.version}: ${parts.join("; ") || "no concentration warnings; standard market risk"}. ` +
        (worst ? `The most damaging stress scenario is "${worst.label}" at an estimated ${formatPercent(worst.estimatedImpactPct)} (hypothetical).` : "") +
        ` Portfolio volatility ${formatPercent(ctx.risk?.volatility ?? 0)}, max historical drawdown ${formatPercent(ctx.risk?.maxHistoricalDrawdown ?? 0)}.`,
    };
  }

  // "what if nasdaq falls X%" / "if the market drops"
  const dropM = ql.match(/(nasdaq|market|equities|stocks?)\s*(falls?|drops?|down|-)\s*(\d+)\s*%/);
  if (dropM) {
    const pct = -Number(dropM[3]) / 100;
    const growthNames = ctx.alloc.filter((r) => r.sleeve === "growth");
    const defensiveNames = ctx.alloc.filter((r) => r.sleeve !== "growth");
    citations.push({ kind: "allocation", ref: `v${ctx.version}`, detail: `${ctx.alloc.length} positions` });
    return {
      usedFallback: true,
      citations,
      answer:
        `A ${dropM[3]}% equity drawdown would hit the growth sleeve hardest (${formatPercent(growthNames.reduce((a, r) => a + r.weight, 0))} of the book: ${growthNames.slice(0, 4).map((r) => r.ticker).join(", ")}…). ` +
        `The ${formatPercent(defensiveNames.reduce((a, r) => a + r.weight, 0))} in defensive equities, gold, bonds and cash would cushion it. ` +
        `Rough first-order estimate: portfolio impact ≈ ${formatPercent(pct * growthNames.reduce((a, r) => a + r.weight, 0) * 1.1)} (hypothetical — use the What-If tool for a full custom stress test). ` +
        `On such a pullback the model would look to add to the highest-scoring names on the Opportunities watch list.`,
    };
  }

  // default: strategy summary
  citations.push({ kind: "strategy-version", ref: `v${ctx.version}`, detail: ctx.weekOf });
  const top = [...ctx.alloc].sort((a, b) => b.weight - a.weight).slice(0, 5);
  return {
    usedFallback: true,
    citations,
    answer:
      `Strategy v${ctx.version} (week of ${ctx.weekOf}). Regime: ${ctx.regime} (composite ${ctx.regimeScore.toFixed(2)}). ` +
      `${ctx.alloc.length} positions; largest: ${top.map((r) => `${r.ticker} ${formatPercent(r.weight)}`).join(", ")}. ` +
      `Estimated volatility ${formatPercent(ctx.risk?.volatility ?? ctx.factor.estVol ?? 0)}, AI-factor exposure ${formatPercent(ctx.factor.aiFactor ?? 0)}. ` +
      `Ask me things like "why do you hold NVDA?", "what is my biggest risk?", "which three names have the best risk/reward?", or "what if the Nasdaq falls 15%?".`,
  };
}

// ─────────────────────────── LLM path ───────────────────────────

const ADVISOR_SYSTEM = `You are the user's investment strategist. Answer their question using ONLY
the JSON context provided (the current strategy, scores, recommendations, risk metrics, stress
tests and recorded changes). Rules:
- Never invent numbers, prices, or price targets. If the context lacks something, say so.
- Cite the specific data you used (ticker, metric, strategy version).
- No guarantees, no "will rise", no certainty language.
- Be concise and specific. Distinguish fact from your interpretation.
Return plain text (markdown allowed).`;

export async function askAdvisor(portfolioId: string, question: string): Promise<AdvisorAnswer> {
  const ctx = await loadContext(portfolioId);
  if (!ctx) {
    return { answer: "No strategy has been generated yet — run one first.", citations: [], usedFallback: true };
  }

  if (aiConfigured()) {
    try {
      const client = new Anthropic();
      const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
      const stream = client.messages.stream({
        model,
        max_tokens: 1200,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: ADVISOR_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `CONTEXT:\n${JSON.stringify(ctx)}\n\nQUESTION: ${question}`,
          },
        ],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new Error("refused");
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      const gr = applyGuardrailsText(text);
      await prisma.aIAnalysis.create({
        data: {
          kind: "ADVISOR", model, promptHash: "advisor",
          inputJson: toJson({ question, version: ctx.version }),
          outputJson: toJson({ text }), usedFallback: !gr.ok,
          tokensIn: msg.usage?.input_tokens ?? null, tokensOut: msg.usage?.output_tokens ?? null,
        },
      });
      if (!gr.ok) return fallbackAnswer(question, ctx);
      return {
        answer: text,
        citations: [{ kind: "strategy-version", ref: `v${ctx.version}`, detail: ctx.weekOf }],
        usedFallback: false,
      };
    } catch {
      return fallbackAnswer(question, ctx);
    }
  }

  return fallbackAnswer(question, ctx);
}
