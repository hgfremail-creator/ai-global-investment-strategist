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

export async function getSleeveHistory(portfolioId: string) {
  const versions = await prisma.strategyVersion.findMany({
    where: { portfolioId },
    orderBy: { version: "asc" },
    include: { regime: true },
  });
  return versions.map((v) => ({
    version: v.version,
    weekOf: v.weekOf.toISOString().slice(0, 10),
    regime: v.regime.regime,
    sleeves: fromJson<Record<Sleeve, number>>(v.sleeveTargetsJson, {} as Record<Sleeve, number>),
    factor: fromJson<FactorExposure>(v.factorExposureJson, {} as FactorExposure),
  }));
}

export type VersionComparison = {
  a: { version: number; weekOf: string; regime: string; regimeScore: number };
  b: { version: number; weekOf: string; regime: string; regimeScore: number };
  sleeveDeltas: { sleeve: Sleeve; a: number; b: number; delta: number }[];
  positionDeltas: {
    ticker: string;
    name: string;
    a: number;
    b: number;
    delta: number;
    kind: "added" | "removed" | "reweighted" | "unchanged";
  }[];
  factorDeltas: { key: string; a: number; b: number; delta: number }[];
  changes: { kind: string; label: string; previousValue: string | null; newValue: string | null; deltaText: string | null; reason: string }[];
};

export async function getVersionComparison(
  portfolioId: string,
  va: number,
  vb: number,
): Promise<VersionComparison | null> {
  const [a, b] = await Promise.all([
    prisma.strategyVersion.findFirst({ where: { portfolioId, version: va }, include: { regime: true } }),
    prisma.strategyVersion.findFirst({
      where: { portfolioId, version: vb },
      include: { regime: true, changes: true },
    }),
  ]);
  if (!a || !b) return null;

  const aAlloc = fromJson<AllocationRow[]>(a.allocationJson, []);
  const bAlloc = fromJson<AllocationRow[]>(b.allocationJson, []);
  const aSleeves = fromJson<Record<Sleeve, number>>(a.sleeveTargetsJson, {} as Record<Sleeve, number>);
  const bSleeves = fromJson<Record<Sleeve, number>>(b.sleeveTargetsJson, {} as Record<Sleeve, number>);
  const aFactor = fromJson<FactorExposure>(a.factorExposureJson, {} as FactorExposure);
  const bFactor = fromJson<FactorExposure>(b.factorExposureJson, {} as FactorExposure);

  const sleeveKeys = Array.from(new Set([...Object.keys(aSleeves), ...Object.keys(bSleeves)])) as Sleeve[];
  const sleeveDeltas = sleeveKeys
    .map((s) => ({ sleeve: s, a: aSleeves[s] ?? 0, b: bSleeves[s] ?? 0, delta: (bSleeves[s] ?? 0) - (aSleeves[s] ?? 0) }))
    .filter((x) => x.a > 0.001 || x.b > 0.001)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const aByT = new Map(aAlloc.map((r) => [r.ticker, r]));
  const bByT = new Map(bAlloc.map((r) => [r.ticker, r]));
  const allTickers = Array.from(new Set([...aByT.keys(), ...bByT.keys()]));
  const positionDeltas = allTickers
    .map((t) => {
      const aw = aByT.get(t)?.weight ?? 0;
      const bw = bByT.get(t)?.weight ?? 0;
      const kind: "added" | "removed" | "reweighted" | "unchanged" =
        aw === 0 ? "added" : bw === 0 ? "removed" : Math.abs(bw - aw) >= 0.005 ? "reweighted" : "unchanged";
      return {
        ticker: t,
        name: bByT.get(t)?.name ?? aByT.get(t)?.name ?? t,
        a: aw,
        b: bw,
        delta: bw - aw,
        kind,
      };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const factorDeltas = (["aiFactor", "semiconductor", "usTech", "defensive"] as const).map((k) => ({
    key: k,
    a: aFactor[k] ?? 0,
    b: bFactor[k] ?? 0,
    delta: (bFactor[k] ?? 0) - (aFactor[k] ?? 0),
  }));

  return {
    a: { version: a.version, weekOf: a.weekOf.toISOString().slice(0, 10), regime: a.regime.regime, regimeScore: a.regime.score },
    b: { version: b.version, weekOf: b.weekOf.toISOString().slice(0, 10), regime: b.regime.regime, regimeScore: b.regime.score },
    sleeveDeltas,
    positionDeltas,
    factorDeltas,
    changes: vb === va + 1 ? b.changes : [],
  };
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
