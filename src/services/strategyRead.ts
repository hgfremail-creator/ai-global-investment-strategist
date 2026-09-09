import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import type { Sleeve } from "@/lib/enums";

export type AllocationRow = {
  securityId: string | null;
  ticker: string | null;
  sleeve: Sleeve;
  weight: number;
  usdMinor: number;
};

export async function getLatestStrategy(portfolioId: string) {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    include: {
      regime: true,
      recommendations: { include: { security: true } },
      riskMetric: true,
      researchReport: true,
      changes: true,
    },
  });
  if (!sv) return null;
  return {
    ...sv,
    sleeveTargets: fromJson<Record<Sleeve, number>>(sv.sleeveTargetsJson, {} as Record<Sleeve, number>),
    allocation: fromJson<AllocationRow[]>(sv.allocationJson, []),
    factorExposure: fromJson<Record<string, number>>(sv.factorExposureJson, {}),
    regimeDrivers: fromJson<
      { indicator: string; value: number; vote: number; weight: number; rationale: string; sourceId?: string }[]
    >(sv.regime.driversJson, []),
  };
}

export async function getStrategyHistory(portfolioId: string) {
  return prisma.strategyVersion.findMany({
    where: { portfolioId },
    orderBy: { version: "desc" },
    include: { regime: true, _count: { select: { recommendations: true, changes: true } } },
  });
}
