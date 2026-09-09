import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";

export type RecView = {
  id: string;
  ticker: string;
  name: string;
  country: string;
  sector: string;
  assetClass: string;
  action: string;
  conviction: number;
  evidenceQuality: number;
  targetWeight: number;
  targetUsdMinor: number;
  timeHorizon: string;
  entryStrategy: string;
  valuationView: string;
  thesisMd: string;
  catalysts: string[];
  risks: string[];
  invalidation: string[];
  bullBearBase: { bull: string; base: string; bear: string; keyAssumptions: string[] };
  devilsAdvocateMd: string;
  fic: { facts: string[]; interpretations: string[]; aiConclusion: string };
  usedFallback: boolean;
  sources: { id: string; title: string; publisher: string; url: string | null; publishedAt: string | null; freshness: string; type: string; isDemo: boolean }[];
};

function toView(r: Awaited<ReturnType<typeof loadRaw>>[number]): RecView {
  return {
    id: r.id,
    ticker: r.security.ticker,
    name: r.security.name,
    country: r.security.countryCode,
    sector: r.security.sector,
    assetClass: r.security.assetClass,
    action: r.action,
    conviction: r.conviction,
    evidenceQuality: r.evidenceQuality,
    targetWeight: r.targetWeight,
    targetUsdMinor: r.targetUsdMinor,
    timeHorizon: r.timeHorizon,
    entryStrategy: r.entryStrategy,
    valuationView: r.valuationView,
    thesisMd: r.thesisMd,
    catalysts: fromJson<string[]>(r.catalystsJson, []),
    risks: fromJson<string[]>(r.risksJson, []),
    invalidation: fromJson<string[]>(r.invalidationJson, []),
    bullBearBase: fromJson(r.bullBearBaseJson, { bull: "", base: "", bear: "", keyAssumptions: [] }),
    devilsAdvocateMd: r.devilsAdvocateMd,
    fic: fromJson(r.ficJson, { facts: [], interpretations: [], aiConclusion: "" }),
    usedFallback: r.usedFallback,
    sources: r.sources.map((s) => ({
      id: s.source.id, title: s.source.title, publisher: s.source.publisher,
      url: s.source.url, publishedAt: s.source.publishedAt?.toISOString().slice(0, 10) ?? null,
      freshness: s.source.freshness, type: s.source.type, isDemo: s.source.isDemo,
    })),
  };
}

async function loadRaw(strategyVersionId: string) {
  return prisma.recommendation.findMany({
    where: { strategyVersionId },
    include: { security: true, sources: { include: { source: true } } },
  });
}

export async function getRecommendationsForLatest(portfolioId: string): Promise<{
  version: number;
  usedFallback: boolean;
  held: RecView[];
  rejected: RecView[];
} | null> {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
  if (!sv) return null;
  const raw = await loadRaw(sv.id);
  const views = raw.map(toView);
  return {
    version: sv.version,
    usedFallback: views.some((v) => v.usedFallback),
    held: views.filter((v) => v.targetWeight > 0).sort((a, b) => b.conviction - a.conviction),
    rejected: views.filter((v) => v.targetWeight === 0 && v.action === "WATCH"),
  };
}

export async function getRecommendationForTicker(portfolioId: string, ticker: string): Promise<RecView | null> {
  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!sv) return null;
  const r = await prisma.recommendation.findFirst({
    where: { strategyVersionId: sv.id, security: { ticker: { equals: ticker } } },
    include: { security: true, sources: { include: { source: true } } },
  });
  return r ? toView(r) : null;
}
