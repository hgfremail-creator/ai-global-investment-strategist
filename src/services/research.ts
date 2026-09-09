import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import type { ScoreComponent } from "@/engine/scoring";
import type { ScoredSecurity } from "@/engine/scoring";

export type ResearchRow = {
  ticker: string;
  name: string;
  country: string;
  sector: string;
  assetClass: string;
  currency: string;
  overall: number | null;
  components: Record<ScoreComponent, number> | null;
  asOf: string | null;
};

export async function listResearch(): Promise<ResearchRow[]> {
  const securities = await prisma.security.findMany({
    include: { scores: { orderBy: { asOf: "desc" }, take: 1 }, market: true },
    orderBy: { ticker: "asc" },
  });
  return securities.map((s) => {
    const sc = s.scores[0];
    return {
      ticker: s.ticker,
      name: s.name,
      country: s.countryCode,
      sector: s.sector,
      assetClass: s.assetClass,
      currency: s.currency,
      overall: sc?.overall ?? null,
      asOf: sc?.asOf.toISOString().slice(0, 10) ?? null,
      components: sc
        ? {
            businessQuality: sc.businessQuality,
            growth: sc.growth,
            valuation: sc.valuation,
            earningsMomentum: sc.earningsMomentum,
            marketMomentum: sc.marketMomentum,
            aiExposure: sc.aiExposure,
            balanceSheet: sc.balanceSheet,
            risk: sc.risk,
          }
        : null,
    };
  });
}

export type ResearchDetail = {
  ticker: string;
  name: string;
  country: string;
  sector: string;
  industry: string;
  currency: string;
  assetClass: string;
  isDemo: boolean;
  score: (ScoredSecurity & { asOf: string }) | null;
  fundamentals: Record<string, number | string | null> | null;
  fundamentalsSource: { title: string; publisher: string; url: string | null; freshness: string } | null;
  priceBars: { date: string; close: number }[];
  news: { title: string; publisher: string; url: string | null; publishedAt: string; summary: string; sentiment: number | null }[];
};

export async function getResearchDetail(ticker: string): Promise<ResearchDetail | null> {
  const s = await prisma.security.findFirst({
    where: { ticker: { equals: ticker } },
    include: {
      scores: { orderBy: { asOf: "desc" }, take: 1 },
      fundamentals: { orderBy: { asOf: "desc" }, take: 1, include: { source: true } },
      prices: { orderBy: { date: "desc" }, take: 260 },
      newsItems: { orderBy: { publishedAt: "desc" }, take: 8 },
    },
  });
  if (!s) return null;

  const sc = s.scores[0];
  const f = s.fundamentals[0];

  const score: (ScoredSecurity & { asOf: string }) | null = sc
    ? {
        ticker: s.ticker,
        assetClass: s.assetClass as ScoredSecurity["assetClass"],
        overall: sc.overall,
        components: {
          businessQuality: sc.businessQuality, growth: sc.growth, valuation: sc.valuation,
          earningsMomentum: sc.earningsMomentum, marketMomentum: sc.marketMomentum,
          aiExposure: sc.aiExposure, balanceSheet: sc.balanceSheet, risk: sc.risk,
        },
        contributions: fromJson(sc.contributionsJson, {} as ScoredSecurity["contributions"]),
        weights: fromJson(sc.weightsJson, {} as ScoredSecurity["weights"]),
        notes: fromJson(sc.notesJson, {} as ScoredSecurity["notes"]),
        raw: fromJson(sc.notesJson, { _raw: {} } as { _raw: ScoredSecurity["raw"] })._raw as ScoredSecurity["raw"],
        asOf: sc.asOf.toISOString().slice(0, 10),
      }
    : null;

  return {
    ticker: s.ticker,
    name: s.name,
    country: s.countryCode,
    sector: s.sector,
    industry: s.industry,
    currency: s.currency,
    assetClass: s.assetClass,
    isDemo: s.isDemo,
    score,
    fundamentals: f
      ? {
          "Revenue growth": f.revenueGrowth, "EPS growth": f.epsGrowth,
          "Gross margin": f.grossMargin, "Operating margin": f.operatingMargin,
          "FCF margin": f.fcfMargin, ROIC: f.roic, "Net debt / EBITDA": f.netDebtToEbitda,
          "P/E": f.pe, "Forward P/E": f.forwardPe, "EV/EBITDA": f.evEbitda, PEG: f.peg,
          "P/S": f.ps, "FCF yield": f.fcfYield,
          "EPS revision 4w": f.epsRevision4w, "EPS revision 13w": f.epsRevision13w,
          Moat: f.moat,
        }
      : null,
    fundamentalsSource: f?.source
      ? { title: f.source.title, publisher: f.source.publisher, url: f.source.url, freshness: f.source.freshness }
      : null,
    priceBars: s.prices.reverse().map((p) => ({ date: p.date.toISOString().slice(0, 10), close: p.close })),
    news: s.newsItems.map((n) => ({
      title: n.title, publisher: n.publisher, url: n.url,
      publishedAt: n.publishedAt.toISOString().slice(0, 10), summary: n.summary, sentiment: n.sentiment,
    })),
  };
}
