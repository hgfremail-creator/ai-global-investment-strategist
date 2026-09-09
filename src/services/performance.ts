import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { computePerformance, type VersionPeriod, type PriceLookup } from "@/engine/performance";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";
import type { AllocationRow } from "./strategyRead";
import type { RiskScore } from "@/lib/enums";

export type PerformanceView = Awaited<ReturnType<typeof getPerformance>>;

export async function getPerformance(portfolioId: string) {
  const versions = await prisma.strategyVersion.findMany({
    where: { portfolioId },
    orderBy: { version: "asc" },
    select: { version: true, weekOf: true, allocationJson: true },
  });
  if (versions.length === 0) return null;

  const latestPrice = (await prisma.price.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date;
  const endDate = latestPrice ? latestPrice.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const periods: VersionPeriod[] = versions.map((v, i) => ({
    version: v.version,
    from: v.weekOf.toISOString().slice(0, 10),
    to: (versions[i + 1]?.weekOf.toISOString().slice(0, 10)) ?? endDate,
    holdings: fromJson<AllocationRow[]>(v.allocationJson, []).map((r) => ({ ticker: r.ticker, weight: r.weight })),
  }));

  // price + benchmark lookups
  const tickers = Array.from(new Set(periods.flatMap((p) => p.holdings.map((h) => h.ticker))));
  const prices = await prisma.price.findMany({
    where: { security: { ticker: { in: tickers } } },
    orderBy: { date: "asc" },
    select: { date: true, close: true, security: { select: { ticker: true } } },
  });
  const byTicker = new Map<string, { date: string; close: number }[]>();
  for (const p of prices) {
    const arr = byTicker.get(p.security.ticker) ?? [];
    arr.push({ date: p.date.toISOString().slice(0, 10), close: p.close });
    byTicker.set(p.security.ticker, arr);
  }
  const benchSymbol = "MSCI_WORLD";
  const bench = (await prisma.benchmark.findMany({
    where: { symbol: benchSymbol }, orderBy: { date: "asc" }, select: { date: true, close: true },
  })).map((b) => ({ date: b.date.toISOString().slice(0, 10), close: b.close }));
  byTicker.set(benchSymbol, bench);

  const lookup: PriceLookup = (ticker, from, to) => {
    const arr = byTicker.get(ticker);
    if (!arr || arr.length === 0) return null;
    const startBar = [...arr].reverse().find((b) => b.date <= from) ?? arr[0];
    const endBar = [...arr].reverse().find((b) => b.date <= to) ?? arr[arr.length - 1];
    return { start: startBar.close, end: endBar.close };
  };

  const activeProfile = await prisma.riskProfile.findFirst({
    where: { user: { portfolios: { some: { id: portfolioId } } }, active: true },
    orderBy: { createdAt: "desc" },
  });
  const riskScore = (activeProfile?.riskScore ?? 3) as RiskScore;
  const equityCeiling = DEFAULT_CONSTRAINTS[riskScore].maxGrowth + 0.15;
  const blendedWeights = { equity: Math.min(0.9, equityCeiling), bond: 1 - Math.min(0.9, equityCeiling) };

  const perf = computePerformance(periods, lookup, benchSymbol, blendedWeights);

  // latest RiskMetric for Sharpe/Sortino
  const rm = await prisma.riskMetric.findFirst({
    where: { strategyVersion: { portfolioId } },
    orderBy: { createdAt: "desc" },
    select: { sharpe: true, sortino: true, volatility: true },
  });

  return {
    ...perf,
    sharpe: rm?.sharpe ?? null,
    sortino: rm?.sortino ?? null,
    benchmarkLabel: "MSCI World (simulated)",
    blendedLabel: `Blended (${Math.round(blendedWeights.equity * 100)}% equity)`,
  };
}
