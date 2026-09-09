import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import type { Sleeve } from "@/lib/enums";

export type AllocationRow = {
  securityId: string | null;
  ticker: string;
  name: string;
  sleeve: Sleeve;
  assetClass: string;
  country: string;
  sector: string;
  currency: string;
  weight: number;
  usdMinor: number;
  score: number;
};

export type FactorExposure = {
  aiFactor: number;
  semiconductor: number;
  usTech: number;
  defensive: number;
  rates: number;
  gold: number;
  country: Record<string, number>;
  sector: Record<string, number>;
  currency: Record<string, number>;
  estVol: number;
  boundConstraints: string[];
  warnings: string[];
  reconciliation: {
    ticker: string;
    existingWeight: number;
    targetWeight: number;
    deltaWeight: number;
    note: string;
  }[];
};

const EMPTY_FACTOR: FactorExposure = {
  aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0,
  country: {}, sector: {}, currency: {}, estVol: 0, boundConstraints: [], warnings: [], reconciliation: [],
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
    factorExposure: fromJson<FactorExposure>(sv.factorExposureJson, EMPTY_FACTOR),
    fxRates: fromJson<{ base: string; quote: string; rate: number; asOf: string; source: string }[]>(sv.fxRatesJson, []),
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

export async function getStrategyVersion(portfolioId: string, version: number) {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId, version },
    include: { regime: true, changes: true, recommendations: { include: { security: true } } },
  });
  if (!sv) return null;
  return {
    ...sv,
    sleeveTargets: fromJson<Record<Sleeve, number>>(sv.sleeveTargetsJson, {} as Record<Sleeve, number>),
    allocation: fromJson<AllocationRow[]>(sv.allocationJson, []),
    factorExposure: fromJson<FactorExposure>(sv.factorExposureJson, EMPTY_FACTOR),
    regimeDrivers: fromJson<
      { indicator: string; value: number; vote: number; weight: number; rationale: string }[]
    >(sv.regime.driversJson, []),
  };
}
