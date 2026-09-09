import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { toMinor } from "@/lib/money";
import type { AllocationRow, FactorExposure } from "./strategyRead";
import type { ReasoningInput, SecurityBundle, AiBatchOutput } from "@/ai/schema";
import { callReasoning, aiConfigured, promptHashOf } from "@/ai/client";
import { fallbackReasoning } from "@/ai/fallback";
import { applyGuardrails } from "@/ai/guardrails";
import { toUsd } from "@/data/fx";
import type { Currency } from "@/lib/enums";

function asCurrency(c: string): Currency {
  return c === "EUR" || c === "JPY" || c === "TWD" ? c : "USD";
}

async function buildBundle(
  row: AllocationRow | null,
  securityId: string,
  ctx: {
    asOf: Date;
    capitalUsdMinor: number;
    existingByTicker: Map<string, { quantity: number; marketValueUsd: number }>;
    reconByTicker: Map<string, { note: string; existingWeight: number }>;
  },
): Promise<SecurityBundle | null> {
  const s = await prisma.security.findUnique({
    where: { id: securityId },
    include: {
      scores: { orderBy: { asOf: "desc" }, take: 1 },
      fundamentals: { orderBy: { asOf: "desc" }, take: 1 },
      newsItems: { orderBy: { publishedAt: "desc" }, take: 4, include: { source: true } },
    },
  });
  if (!s || !s.scores[0]) return null;
  const sc = s.scores[0];
  const notes = fromJson<Record<string, string> & { _raw?: Record<string, unknown> }>(sc.notesJson, {});
  const raw = (notes._raw ?? {}) as Record<string, number | null | string[]>;
  const f = s.fundamentals[0];

  const existing = ctx.existingByTicker.get(s.ticker);
  const recon = ctx.reconByTicker.get(s.ticker);

  return {
    ticker: s.ticker,
    name: s.name,
    country: s.countryCode,
    sector: s.sector,
    industry: s.industry,
    assetClass: s.assetClass,
    sleeve: row?.sleeve ?? "—",
    targetWeight: row?.weight ?? null,
    overallScore: sc.overall,
    componentScores: {
      businessQuality: sc.businessQuality, growth: sc.growth, valuation: sc.valuation,
      earningsMomentum: sc.earningsMomentum, marketMomentum: sc.marketMomentum,
      aiExposure: sc.aiExposure, balanceSheet: sc.balanceSheet, risk: sc.risk,
    },
    componentContributions: fromJson(sc.contributionsJson, {}),
    componentNotes: Object.fromEntries(
      Object.entries(notes).filter(([k]) => k !== "_raw"),
    ) as Record<string, string>,
    rawMetrics: raw,
    fundamentals: f
      ? {
          "Revenue growth": f.revenueGrowth, "EPS growth": f.epsGrowth,
          "Operating margin": f.operatingMargin, "Gross margin": f.grossMargin,
          "FCF margin": f.fcfMargin, ROIC: f.roic, "Net debt/EBITDA": f.netDebtToEbitda,
          "Forward P/E": f.forwardPe, "EV/EBITDA": f.evEbitda, PEG: f.peg, "FCF yield": f.fcfYield,
          Moat: f.moat,
        }
      : {},
    aiExposureDrivers: Array.isArray(raw.aiDrivers) ? (raw.aiDrivers as string[]) : [],
    existingExposure: existing
      ? {
          quantity: existing.quantity,
          weight: recon?.existingWeight ?? 0,
          note: recon?.note ?? "",
        }
      : null,
    recentNews: s.newsItems.map((n) => ({
      title: n.title,
      publishedAt: n.publishedAt.toISOString().slice(0, 10),
      sentiment: n.sentiment,
      sourceId: n.sourceId ?? "",
    })).filter((n) => n.sourceId),
  };
}

export async function generateRecommendations(strategyVersionId: string): Promise<{
  usedFallback: boolean;
  guardrailViolations: string[];
  count: number;
}> {
  const sv = await prisma.strategyVersion.findUnique({
    where: { id: strategyVersionId },
    include: { portfolio: true, regime: true },
  });
  if (!sv) throw new Error("strategy version not found");

  const allocation = fromJson<AllocationRow[]>(sv.allocationJson, []);
  const factor = fromJson<FactorExposure>(sv.factorExposureJson, {} as FactorExposure);
  const asOf = new Date(
    (await prisma.price.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? sv.weekOf,
  );

  // existing holdings
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId: sv.portfolioId },
    include: { security: { include: { prices: { orderBy: { date: "desc" }, take: 1 } } } },
  });
  const existingByTicker = new Map(
    positions.map((p) => {
      const cur = asCurrency(p.security.currency);
      const priceUsd = toUsd(p.security.prices[0]?.close ?? p.avgPriceMinor / 100, cur);
      return [p.security.ticker, { quantity: p.quantity, marketValueUsd: priceUsd * p.quantity }];
    }),
  );
  const reconByTicker = new Map(
    (factor.reconciliation ?? []).map((r) => [r.ticker, { note: r.note, existingWeight: r.existingWeight }]),
  );

  const ctx = { asOf, capitalUsdMinor: sv.portfolio.capitalUsdMinor, existingByTicker, reconByTicker };

  // holdings bundles
  const secIdByTicker = new Map(
    (await prisma.security.findMany({ select: { id: true, ticker: true } })).map((s) => [s.ticker, s.id]),
  );
  const holdings: SecurityBundle[] = [];
  for (const row of allocation) {
    const id = secIdByTicker.get(row.ticker);
    if (!id) continue;
    const b = await buildBundle(row, id, ctx);
    if (b) holdings.push(b);
  }

  // rejected candidates: highest-scoring equities NOT in the allocation (the
  // "why not this stock?" list), capped at 8.
  const heldTickers = new Set(allocation.map((r) => r.ticker));
  const topUnheld = await prisma.securityScore.findMany({
    where: { asOf, security: { assetClass: "EQUITY", ticker: { notIn: [...heldTickers] } } },
    orderBy: { overall: "desc" },
    take: 8,
    include: { security: true },
  });
  const rejected: SecurityBundle[] = [];
  for (const r of topUnheld) {
    const b = await buildBundle(null, r.securityId, ctx);
    if (b) rejected.push(b);
  }

  // sources
  const sourceIds = new Set<string>();
  for (const b of [...holdings, ...rejected]) for (const n of b.recentNews) sourceIds.add(n.sourceId);
  const methodology = await prisma.source.findFirst({ where: { type: "METHODOLOGY" }, select: { id: true } });
  if (methodology) sourceIds.add(methodology.id);
  const fundSources = await prisma.fundamental.findMany({
    where: { asOf, securityId: { in: [...secIdByTicker.values()] } },
    select: { sourceId: true },
  });
  for (const fs of fundSources) if (fs.sourceId) sourceIds.add(fs.sourceId);

  const sources = await prisma.source.findMany({
    where: { id: { in: [...sourceIds] } },
  });

  const input: ReasoningInput = {
    asOf: asOf.toISOString().slice(0, 10),
    regime: {
      regime: sv.regime.regime,
      score: sv.regime.score,
      drivers: fromJson<{ indicator: string; vote: number; rationale: string }[]>(sv.regime.driversJson, []),
    },
    constraints: {},
    sleeveTargets: fromJson(sv.sleeveTargetsJson, {}),
    portfolioFactorExposure: {
      aiFactor: factor.aiFactor ?? 0,
      semiconductor: factor.semiconductor ?? 0,
      usTech: factor.usTech ?? 0,
      defensive: factor.defensive ?? 0,
    },
    holdings,
    rejected,
    sources: sources.map((s) => ({
      id: s.id, type: s.type, title: s.title, publisher: s.publisher,
      publishedAt: s.publishedAt?.toISOString().slice(0, 10) ?? null,
      freshness: s.freshness, isDemo: s.isDemo,
    })),
  };

  // ── call AI (or fallback) ─────────────────────────────────────────────
  let output: AiBatchOutput;
  let usedFallback = false;
  let note: string | undefined;

  if (aiConfigured()) {
    try {
      const res = await callReasoning(input);
      const gr = applyGuardrails(res.output, input);
      if (!gr.ok) {
        note = `AI output failed guardrails (${gr.violations.length}); used deterministic fallback. First: ${gr.violations[0]}`;
        output = fallbackReasoning(input);
        usedFallback = true;
      } else {
        output = gr.sanitised;
      }
      await recordAudit(strategyVersionId, "RECOMMENDATIONS", res.model, res.promptHash, input, output, usedFallback, res.tokensIn, res.tokensOut);
    } catch (err) {
      note = `AI call failed (${(err as Error).message}); used deterministic fallback.`;
      output = fallbackReasoning(input);
      usedFallback = true;
      await recordAudit(strategyVersionId, "RECOMMENDATIONS", "fallback", promptHashOf(input), input, output, true);
    }
  } else {
    output = fallbackReasoning(input);
    usedFallback = true;
    await recordAudit(strategyVersionId, "RECOMMENDATIONS", "fallback", promptHashOf(input), input, output, true);
  }

  const finalGr = applyGuardrails(output, input);

  // ── persist recommendations ──────────────────────────────────────────
  await prisma.recommendation.deleteMany({ where: { strategyVersionId } });

  for (const r of output.recommendations) {
    const id = secIdByTicker.get(r.ticker);
    const row = allocation.find((a) => a.ticker === r.ticker);
    if (!id) continue;
    const rec = await prisma.recommendation.create({
      data: {
        strategyVersionId,
        securityId: id,
        action: r.action,
        conviction: r.conviction,
        evidenceQuality: r.evidenceQuality,
        targetWeight: row?.weight ?? 0,
        targetUsdMinor: row ? toMinor((sv.portfolio.capitalUsdMinor / 100) * row.weight) : 0,
        timeHorizon: r.timeHorizon,
        entryStrategy: r.entryStrategy,
        valuationView: r.valuationView,
        thesisMd: r.thesisMd,
        catalystsJson: toJson(r.catalysts),
        risksJson: toJson(r.risks),
        invalidationJson: toJson(r.invalidationConditions),
        bullBearBaseJson: toJson(r.bullBearBase),
        devilsAdvocateMd: r.devilsAdvocateMd,
        ficJson: toJson(r.fic),
        usedFallback,
      },
    });
    if (r.sourceIds.length) {
      await prisma.recommendationSource.createMany({
        data: [...new Set(r.sourceIds)].map((sid) => ({ recommendationId: rec.id, sourceId: sid })),
      });
    }
  }

  // rejected candidates persisted as WATCH recommendations
  for (const rej of output.rejections) {
    const id = secIdByTicker.get(rej.ticker);
    if (!id) continue;
    const rec = await prisma.recommendation.create({
      data: {
        strategyVersionId,
        securityId: id,
        action: "WATCH",
        conviction: 0,
        evidenceQuality: 40,
        targetWeight: 0,
        targetUsdMinor: 0,
        timeHorizon: "MEDIUM",
        entryStrategy: "Not currently a buy — monitor.",
        valuationView: "UNCLEAR",
        thesisMd: `**Why not ${rej.ticker}?**\n\n${rej.reasons.map((x) => `- ${x}`).join("\n")}`,
        catalystsJson: toJson([]),
        risksJson: toJson(["Included here as a rejected candidate; not held."]),
        invalidationJson: toJson(rej.whatWouldChangeOurMind),
        bullBearBaseJson: toJson({ bull: "", base: "", bear: "", keyAssumptions: [] }),
        devilsAdvocateMd: "",
        ficJson: toJson({ facts: [], interpretations: rej.reasons, aiConclusion: "WATCH — not added to the portfolio." }),
        usedFallback,
      },
    });
    if (rej.sourceIds.length) {
      await prisma.recommendationSource.createMany({
        data: [...new Set(rej.sourceIds)].map((sid) => ({ recommendationId: rec.id, sourceId: sid })),
      });
    }
  }

  return {
    usedFallback,
    guardrailViolations: [...finalGr.violations, ...(note ? [note] : [])],
    count: output.recommendations.length + output.rejections.length,
  };
}

async function recordAudit(
  strategyVersionId: string,
  kind: string,
  model: string,
  promptHash: string,
  input: ReasoningInput,
  output: AiBatchOutput,
  usedFallback: boolean,
  tokensIn?: number,
  tokensOut?: number,
) {
  await prisma.aIAnalysis.create({
    data: {
      strategyVersionId,
      kind,
      model,
      promptHash,
      inputJson: toJson({
        asOf: input.asOf,
        regime: input.regime.regime,
        holdings: input.holdings.map((h) => h.ticker),
        rejected: input.rejected.map((h) => h.ticker),
        sourceCount: input.sources.length,
      }),
      outputJson: toJson(output),
      usedFallback,
      tokensIn: tokensIn ?? null,
      tokensOut: tokensOut ?? null,
    },
  });
}
