import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { computeRiskMetrics, type RiskHolding } from "@/engine/risk";
import { runAllScenarios, type StressHolding } from "@/engine/stress";
import type { AllocationRow } from "./strategyRead";
import type { FactorLoadings } from "@/engine/aiExposure";
import type { Bar } from "@/engine/indicators";

const PRICE_BARS = 300;
const DEFAULT_VOL: Record<string, number> = {
  EQUITY: 0.3, GOLD: 0.15, GOV_BOND: 0.06, IG_BOND: 0.08, CASH: 0.01, DIVERSIFIER: 0.2,
};

export async function computeAndPersistRisk(strategyVersionId: string) {
  const sv = await prisma.strategyVersion.findUnique({ where: { id: strategyVersionId } });
  if (!sv) throw new Error("strategy version not found");
  const allocation = fromJson<AllocationRow[]>(sv.allocationJson, []);
  if (allocation.length === 0) return null;

  const frontEnd = (await prisma.macroIndicator.findFirst({
    where: { key: "FEDFUNDS" }, orderBy: { date: "desc" }, select: { value: true },
  }))?.value;
  const frontEndYield = frontEnd != null ? frontEnd / 100 : 0.04;

  const secs = await prisma.security.findMany({
    where: { ticker: { in: allocation.map((r) => r.ticker) } },
    include: {
      prices: { orderBy: { date: "desc" }, take: PRICE_BARS },
      scores: { orderBy: { asOf: "desc" }, take: 1 },
    },
  });
  const secByTicker = new Map(secs.map((s) => [s.ticker, s]));

  const riskHoldings: RiskHolding[] = [];
  const stressHoldings: StressHolding[] = [];
  for (const row of allocation) {
    const s = secByTicker.get(row.ticker);
    if (!s) continue;
    const factors = fromJson<FactorLoadings>(s.factorLoadings, {
      aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0,
    });
    const bars: Bar[] = s.prices.slice().reverse().map((p) => ({
      date: p.date.toISOString().slice(0, 10), close: p.close,
    }));
    const sc = s.scores[0];
    const rawNotes = fromJson<{ _raw?: { vol?: number | null } }>(sc?.notesJson ?? "", {});
    const vol = rawNotes._raw?.vol ?? DEFAULT_VOL[s.assetClass] ?? 0.25;

    riskHoldings.push({
      ticker: row.ticker, weight: row.weight, assetClass: s.assetClass,
      country: s.countryCode, sector: s.sector, currency: s.currency,
      factors, bars, valuationScore: sc?.valuation ?? 50,
    });
    stressHoldings.push({
      ticker: row.ticker, weight: row.weight, assetClass: s.assetClass,
      country: s.countryCode, currency: s.currency, sector: s.sector, factors, vol,
    });
  }

  const metrics = computeRiskMetrics(riskHoldings, frontEndYield);
  const scenarios = runAllScenarios(stressHoldings);
  const capitalUsd = sv ? (await prisma.portfolio.findUnique({ where: { id: sv.portfolioId }, select: { capitalUsdMinor: true } }))!.capitalUsdMinor / 100 : 0;

  await prisma.riskMetric.upsert({
    where: { strategyVersionId },
    update: riskRow(metrics),
    create: { strategyVersionId, ...riskRow(metrics) },
  });

  await prisma.stressTest.deleteMany({ where: { strategyVersionId } });
  await prisma.stressTest.createMany({
    data: scenarios.map((sc) => ({
      strategyVersionId,
      scenarioKey: sc.key,
      label: sc.label,
      assumptionsJson: toJson(sc.assumptions),
      estimatedImpactPct: sc.estimatedImpactPct,
      byAssetJson: toJson(
        sc.byHolding.map((b) => ({
          ...b,
          usdImpactMinor: Math.round(capitalUsd * b.contributionPct * 100),
        })),
      ),
      isHypothetical: true,
    })),
  });

  return { metrics, scenarios };
}

function riskRow(m: ReturnType<typeof computeRiskMetrics>) {
  return {
    volatility: m.volatility,
    expectedDrawdown: m.expectedDrawdown,
    maxHistoricalDrawdown: m.maxHistoricalDrawdown,
    concentrationHHI: m.concentrationHHI,
    aiFactorExposure: m.aiFactorExposure,
    semiconductorExposure: m.semiconductorExposure,
    usTechExposure: m.usTechExposure,
    valuationRisk: m.valuationRisk,
    liquidityRisk: m.liquidityRisk,
    geopoliticalRisk: m.geopoliticalRisk,
    countryExposureJson: toJson(m.countryExposure),
    currencyExposureJson: toJson(m.currencyExposure),
    sectorExposureJson: toJson(m.sectorExposure),
    sharpe: m.sharpe,
    sortino: m.sortino,
  };
}
