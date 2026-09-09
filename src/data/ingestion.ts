import { prisma } from "@/lib/db";
import {
  marketDataProvider,
  macroProvider,
  newsProvider,
  fxProvider,
  demoMarketData,
  demoMacro,
  demoNews,
} from "./providers";
import { MACRO_KEYS } from "./providers/types";
import type { ProviderSourceMeta } from "./providers/types";
import { setDemoClock, DEMO_AS_OF } from "./providers/demo";
import { CURRENCIES, type Currency } from "@/lib/enums";

// Data ingestion. Idempotent: prices/macro/benchmarks are append-only
// (createMany + skipDuplicates); fundamentals are replaced per (security, asOf).
// A provider may throw or return partial data — the demo provider fills the gaps
// and the report records that it did.

// SQLite (via the driver adapter) does not support createMany `skipDuplicates`,
// so each section clears the rows it is about to (re)write, then bulk-inserts.
const CHUNK = 2000;
async function createManyChunked<T>(
  rows: T[],
  fn: (batch: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await fn(rows.slice(i, i + CHUNK));
    n += res.count;
  }
  return n;
}

const sourceCache = new Map<string, string>();
async function upsertSource(meta: ProviderSourceMeta): Promise<string> {
  const key = `${meta.publisher}::${meta.title}`;
  const cached = sourceCache.get(key);
  if (cached) return cached;
  const existing = await prisma.source.findFirst({
    where: { title: meta.title, publisher: meta.publisher },
    select: { id: true },
  });
  if (existing) {
    await prisma.source.update({
      where: { id: existing.id },
      data: { retrievedAt: new Date(), freshness: meta.freshness, url: meta.url ?? undefined },
    });
    sourceCache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.source.create({
    data: {
      type: meta.type,
      title: meta.title,
      publisher: meta.publisher,
      url: meta.url,
      publishedAt: meta.publishedAt ? new Date(meta.publishedAt) : null,
      freshness: meta.freshness,
      excerpt: meta.excerpt,
      isDemo: meta.isDemo,
    },
    select: { id: true },
  });
  sourceCache.set(key, created.id);
  return created.id;
}

export type IngestReport = {
  prices: number;
  fundamentals: number;
  macro: number;
  news: number;
  benchmarks: number;
  fx: number;
  usedDemoFallback: string[];
};

const EQUITY_LOOKBACK = 400;

export async function ingestAll(opts: { lookbackDays?: number; asOf?: string } = {}): Promise<IngestReport> {
  sourceCache.clear();
  // Demo provider only: advance the simulated clock so each weekly version sees
  // a slightly evolved market. Real providers ignore this.
  setDemoClock(opts.asOf ?? DEMO_AS_OF);
  const lookback = opts.lookbackDays ?? EQUITY_LOOKBACK;
  const report: IngestReport = {
    prices: 0, fundamentals: 0, macro: 0, news: 0, benchmarks: 0, fx: 0, usedDemoFallback: [],
  };

  const secs = await prisma.security.findMany({
    select: { id: true, ticker: true, assetClass: true },
  });
  const idByTicker = new Map(secs.map((s) => [s.ticker, s.id]));
  const allTickers = secs.map((s) => s.ticker);
  const equityTickers = secs.filter((s) => s.assetClass === "EQUITY").map((s) => s.ticker);

  // ── Prices ──────────────────────────────────────────────────────────
  const mdp = marketDataProvider();
  let priceSeries = await safe(() => mdp.getPriceSeries(allTickers, lookback), []);
  const gotSymbols = new Set(priceSeries.map((p) => p.symbol));
  const missing = allTickers.filter((t) => !gotSymbols.has(t));
  if (missing.length && !mdp.isDemo) {
    report.usedDemoFallback.push(`prices:${missing.length}`);
    priceSeries = priceSeries.concat(await demoMarketData.getPriceSeries(missing, lookback));
  }

  const priceRows: {
    securityId: string; date: Date; close: number; volume: number | null; sourceId: string;
  }[] = [];
  const touchedSecIds: string[] = [];
  for (const series of priceSeries) {
    const secId = idByTicker.get(series.symbol);
    if (!secId) continue;
    touchedSecIds.push(secId);
    const sourceId = await upsertSource(series.source);
    for (const pt of series.points) {
      priceRows.push({
        securityId: secId, date: new Date(pt.date), close: pt.close,
        volume: pt.volume ?? null, sourceId,
      });
    }
  }
  // Replace only the ingested date window; older history is preserved.
  if (priceRows.length) {
    const minDate = new Date(Math.min(...priceRows.map((r) => r.date.getTime())));
    await prisma.price.deleteMany({
      where: { securityId: { in: [...new Set(touchedSecIds)] }, date: { gte: minDate } },
    });
  }
  report.prices = await createManyChunked(priceRows, (data) =>
    prisma.price.createMany({ data }),
  );

  // ── Fundamentals (replace per security+asOf) ────────────────────────
  let fundamentals = await safe(() => mdp.getFundamentals(equityTickers), []);
  const gotF = new Set(fundamentals.map((f) => f.symbol));
  const missingF = equityTickers.filter((t) => !gotF.has(t));
  if (missingF.length && !mdp.isDemo) {
    report.usedDemoFallback.push(`fundamentals:${missingF.length}`);
    fundamentals = fundamentals.concat(await demoMarketData.getFundamentals(missingF));
  }
  const fundRows = [];
  for (const f of fundamentals) {
    const secId = idByTicker.get(f.symbol);
    if (!secId) continue;
    const sourceId = await upsertSource(f.source);
    await prisma.fundamental.deleteMany({ where: { securityId: secId, asOf: new Date(f.asOf) } });
    fundRows.push({
      securityId: secId, asOf: new Date(f.asOf), sourceId,
      revenueGrowth: f.revenueGrowth ?? null, epsGrowth: f.epsGrowth ?? null,
      fcfMargin: f.fcfMargin ?? null, roic: f.roic ?? null,
      netDebtToEbitda: f.netDebtToEbitda ?? null, grossMargin: f.grossMargin ?? null,
      operatingMargin: f.operatingMargin ?? null, pe: f.pe ?? null, forwardPe: f.forwardPe ?? null,
      evEbitda: f.evEbitda ?? null, peg: f.peg ?? null, ps: f.ps ?? null, fcfYield: f.fcfYield ?? null,
      epsRevision4w: f.epsRevision4w ?? null, epsRevision13w: f.epsRevision13w ?? null,
      expectedRevenueGrowth: f.expectedRevenueGrowth ?? null,
      expectedEpsGrowth: f.expectedEpsGrowth ?? null,
      moat: f.moat ?? null, tamTier: f.tamTier ?? null,
    });
  }
  report.fundamentals = await createManyChunked(fundRows, (data) =>
    prisma.fundamental.createMany({ data }),
  );

  // ── Macro ───────────────────────────────────────────────────────────
  const macp = macroProvider();
  const macroKeys = MACRO_KEYS.map((m) => m.key);
  let macroSeries = await safe(() => macp.getMacroSeries(macroKeys, lookback), []);
  const gotM = new Set(macroSeries.map((m) => m.key));
  const missingM = macroKeys.filter((k) => !gotM.has(k));
  if (missingM.length && !macp.isDemo) {
    report.usedDemoFallback.push(`macro:${missingM.length}`);
    macroSeries = macroSeries.concat(await demoMacro.getMacroSeries(missingM, lookback));
  }
  const macroRows = [];
  const touchedKeys = new Set<string>();
  for (const series of macroSeries) {
    const sourceId = await upsertSource(series.source);
    touchedKeys.add(series.key);
    for (const pt of series.points) {
      macroRows.push({
        key: pt.key, region: pt.region, date: new Date(pt.date),
        value: pt.value, unit: pt.unit ?? null, sourceId,
      });
    }
  }
  if (macroRows.length) {
    const minDate = new Date(Math.min(...macroRows.map((r) => r.date.getTime())));
    await prisma.macroIndicator.deleteMany({
      where: { key: { in: [...touchedKeys] }, date: { gte: minDate } },
    });
  }
  report.macro = await createManyChunked(macroRows, (data) =>
    prisma.macroIndicator.createMany({ data }),
  );

  // ── Benchmarks ──────────────────────────────────────────────────────
  const benchSymbols = ["SP500", "NDX", "MSCI_WORLD", "NKY", "TWSE", "CAC", "DAX"];
  let benches = await safe(() => mdp.getBenchmarks(benchSymbols, lookback), []);
  if (!benches.length) benches = await demoMarketData.getBenchmarks(benchSymbols, lookback);
  const benchRows = benches.flatMap((b) =>
    b.points.map((pt) => ({ symbol: b.symbol, name: b.name, date: new Date(pt.date), close: pt.close })),
  );
  if (benchRows.length) {
    const minDate = new Date(Math.min(...benchRows.map((r) => r.date.getTime())));
    await prisma.benchmark.deleteMany({
      where: { symbol: { in: benches.map((b) => b.symbol) }, date: { gte: minDate } },
    });
  }
  report.benchmarks = await createManyChunked(benchRows, (data) =>
    prisma.benchmark.createMany({ data }),
  );

  // ── News ────────────────────────────────────────────────────────────
  const np = newsProvider();
  let companyNews = await safe(() => np.getCompanyNews(equityTickers, 21), []);
  if (!companyNews.length && !np.isDemo) {
    report.usedDemoFallback.push("news");
    companyNews = await demoNews.getCompanyNews(equityTickers, 21);
  }
  const macroNews = await safe(() => np.getMacroNews(["US", "EU", "JP"], 21), []);
  const existingTitles = new Set(
    (await prisma.newsItem.findMany({ select: { title: true } })).map((n) => n.title),
  );
  const newsRows = [];
  for (const a of [...companyNews, ...macroNews]) {
    if (existingTitles.has(a.title)) continue;
    existingTitles.add(a.title);
    const sourceId = await upsertSource(a.source);
    newsRows.push({
      securityId: a.symbol ? (idByTicker.get(a.symbol) ?? null) : null,
      region: a.region ?? null,
      title: a.title, url: a.url ?? null, publisher: a.publisher,
      publishedAt: new Date(a.publishedAt), summary: a.summary,
      sentiment: a.sentiment ?? null, sourceId,
    });
  }
  report.news = await createManyChunked(newsRows, (data) =>
    prisma.newsItem.createMany({ data }),
  );

  // ── FX ──────────────────────────────────────────────────────────────
  const fxp = fxProvider();
  const rates = await safe(
    () => fxp.getRates("USD", CURRENCIES.filter((c) => c !== "USD") as Currency[]),
    [],
  );
  for (const r of rates) {
    await prisma.fxRate.upsert({
      where: { base_quote_asOf: { base: r.base, quote: r.quote, asOf: new Date(r.asOf) } },
      create: { base: r.base, quote: r.quote, rate: r.rate, asOf: new Date(r.asOf) },
      update: { rate: r.rate },
    });
    report.fx++;
  }

  return report;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("ingestion provider error:", (err as Error).message);
    return fallback;
  }
}
