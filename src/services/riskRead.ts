import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";

export type RiskDashboard = {
  version: number;
  weekOf: string;
  metric: {
    volatility: number;
    expectedDrawdown: number;
    maxHistoricalDrawdown: number;
    concentrationHHI: number;
    aiFactorExposure: number;
    semiconductorExposure: number;
    usTechExposure: number;
    valuationRisk: number;
    liquidityRisk: number;
    geopoliticalRisk: number;
    sharpe: number | null;
    sortino: number | null;
    country: Record<string, number>;
    currency: Record<string, number>;
    sector: Record<string, number>;
  } | null;
  stress: {
    key: string;
    label: string;
    assumptions: Record<string, number>;
    estimatedImpactPct: number;
    byAsset: { ticker: string; weight: number; impactPct: number; contributionPct: number; usdImpactMinor: number }[];
  }[];
  warnings: string[];
};

export async function getRiskDashboard(portfolioId: string): Promise<RiskDashboard | null> {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    include: { riskMetric: true, stressTests: true },
  });
  if (!sv) return null;
  const rm = sv.riskMetric;
  const factor = fromJson<{ warnings?: string[] }>(sv.factorExposureJson, {});

  return {
    version: sv.version,
    weekOf: sv.weekOf.toISOString().slice(0, 10),
    metric: rm
      ? {
          volatility: rm.volatility,
          expectedDrawdown: rm.expectedDrawdown,
          maxHistoricalDrawdown: rm.maxHistoricalDrawdown,
          concentrationHHI: rm.concentrationHHI,
          aiFactorExposure: rm.aiFactorExposure,
          semiconductorExposure: rm.semiconductorExposure,
          usTechExposure: rm.usTechExposure,
          valuationRisk: rm.valuationRisk,
          liquidityRisk: rm.liquidityRisk,
          geopoliticalRisk: rm.geopoliticalRisk,
          sharpe: rm.sharpe,
          sortino: rm.sortino,
          country: fromJson(rm.countryExposureJson, {}),
          currency: fromJson(rm.currencyExposureJson, {}),
          sector: fromJson(rm.sectorExposureJson, {}),
        }
      : null,
    stress: sv.stressTests.map((s) => ({
      key: s.scenarioKey,
      label: s.label,
      assumptions: fromJson(s.assumptionsJson, {}),
      estimatedImpactPct: s.estimatedImpactPct,
      byAsset: fromJson(s.byAssetJson, []),
    })),
    warnings: factor.warnings ?? [],
  };
}
