import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "@/lib/config";
import {
  scoreUniverse,
  type MacroContext,
  type RawFundamentals,
  type ScoreInput,
  type ScoredSecurity,
} from "@/engine/scoring";
import { classifyRegime, type RegimeInput } from "@/engine/regime";
import { momentum, trendScore, realisedVol, sma, type Bar } from "@/engine/indicators";
import type { FactorLoadings } from "@/engine/aiExposure";

const PRICE_BARS = 320;

async function macroLatest(key: string): Promise<{ value: number; date: Date } | null> {
  const row = await prisma.macroIndicator.findFirst({
    where: { key },
    orderBy: { date: "desc" },
    select: { value: true, date: true },
  });
  return row ?? null;
}

async function macroChange(key: string, days: number): Promise<number | null> {
  const points = await prisma.macroIndicator.findMany({
    where: { key },
    orderBy: { date: "desc" },
    take: 200,
    select: { value: true, date: true },
  });
  if (points.length < 2) return null;
  const latest = points[0];
  const target = latest.date.getTime() - days * 86_400_000;
  let prior = points[points.length - 1];
  for (const p of points) if (p.date.getTime() <= target) { prior = p; break; }
  return Math.round((latest.value - prior.value) * 1000) / 1000;
}

export async function getMacroContext(): Promise<MacroContext> {
  const [real10y, us10y, us2y, fedfunds, igOas] = await Promise.all([
    macroLatest("US_REAL10Y"),
    macroLatest("US10Y"),
    macroLatest("US2Y"),
    macroLatest("FEDFUNDS"),
    macroLatest("IG_OAS"),
  ]);
  const [real10yChange3m, us10yChange3m] = await Promise.all([
    macroChange("US_REAL10Y", 91),
    macroChange("US10Y", 91),
  ]);
  const dxyPoints = await prisma.macroIndicator.findMany({
    where: { key: "DXY" }, orderBy: { date: "asc" }, select: { value: true, date: true },
  });
  const dxyBars: Bar[] = dxyPoints.map((p) => ({ date: p.date.toISOString().slice(0, 10), close: p.value }));
  const dxyTrend = trendScore(dxyBars) ?? momTrend(dxyBars);

  return {
    real10y: real10y?.value ?? null,
    real10yChange3m,
    us10y: us10y?.value ?? null,
    us10yChange3m,
    curve2s10s: us10y && us2y ? Math.round((us10y.value - us2y.value) * 1000) / 1000 : null,
    igOas: igOas?.value ?? null,
    frontEndYield: fedfunds?.value ?? null,
    dxyTrend,
  };
}

function momTrend(bars: Bar[]): number | null {
  const m = momentum(bars).m3;
  return m == null ? null : Math.max(-1, Math.min(1, m * 6));
}

async function loadBars(securityId: string): Promise<Bar[]> {
  const rows = await prisma.price.findMany({
    where: { securityId },
    orderBy: { date: "desc" },
    take: PRICE_BARS,
    select: { date: true, close: true },
  });
  return rows.reverse().map((r) => ({ date: r.date.toISOString().slice(0, 10), close: r.close }));
}

async function benchmarkBars(symbol: string): Promise<Bar[]> {
  const rows = await prisma.benchmark.findMany({
    where: { symbol }, orderBy: { date: "asc" }, take: PRICE_BARS,
    select: { date: true, close: true },
  });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), close: r.close }));
}

export type AnalysisResult = {
  asOf: string;
  regime: { regime: string; score: number };
  scored: number;
};

export async function runAnalysis(opts: { weights?: ScoreWeights } = {}): Promise<AnalysisResult> {
  const weights = opts.weights ?? DEFAULT_SCORE_WEIGHTS;

  const securities = await prisma.security.findMany({
    include: {
      fundamentals: { orderBy: { asOf: "desc" }, take: 1 },
    },
  });

  const barsById = new Map<string, Bar[]>();
  for (const s of securities) barsById.set(s.id, await loadBars(s.id));

  const asOfDate =
    [...barsById.values()].flat().map((b) => b.date).sort().at(-1) ??
    new Date().toISOString().slice(0, 10);

  const macro = await getMacroContext();

  const toRawFundamentals = (f: (typeof securities)[number]["fundamentals"][number] | undefined): RawFundamentals | null => {
    if (!f) return null;
    const moat =
      f.moat === "WIDE" || f.moat === "NARROW" || f.moat === "NONE" ? f.moat : null;
    return {
      revenueGrowth: f.revenueGrowth, epsGrowth: f.epsGrowth, fcfMargin: f.fcfMargin,
      roic: f.roic, netDebtToEbitda: f.netDebtToEbitda, grossMargin: f.grossMargin,
      operatingMargin: f.operatingMargin, pe: f.pe, forwardPe: f.forwardPe,
      evEbitda: f.evEbitda, peg: f.peg, ps: f.ps, fcfYield: f.fcfYield,
      epsRevision4w: f.epsRevision4w, epsRevision13w: f.epsRevision13w,
      expectedRevenueGrowth: f.expectedRevenueGrowth, expectedEpsGrowth: f.expectedEpsGrowth,
      moat, tamTier: f.tamTier,
    };
  };

  const inputs: (ScoreInput & { id: string })[] = securities.map((s) => ({
    id: s.id,
    ticker: s.ticker,
    name: s.name,
    assetClass: s.assetClass as ScoreInput["assetClass"],
    sector: s.sector,
    industry: s.industry,
    factors: fromJson<FactorLoadings>(s.factorLoadings, {
      aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0,
    }),
    fundamentals: toRawFundamentals(s.fundamentals[0]),
    bars: barsById.get(s.id) ?? [],
  }));

  const scored = scoreUniverse(inputs, weights, macro);
  const scoredById = new Map(scored.map((sc, i) => [inputs[i].id, sc] as const));

  // ── Regime inputs ────────────────────────────────────────────────────
  const spx = await benchmarkBars("SP500");
  const ndx = await benchmarkBars("NDX");
  const spxMom3m = momentum(spx).m3;

  const equities = inputs.filter((i) => i.assetClass === "EQUITY");
  const aboveCount = equities.filter((i) => {
    const b = i.bars;
    const last = b.at(-1)?.close;
    const s200 = sma(b, 200);
    return last != null && s200 != null && last > s200;
  }).length;
  const breadth = equities.length ? aboveCount / equities.length : null;

  const revs = equities
    .map((i) => i.fundamentals?.epsRevision13w)
    .filter((x): x is number => x != null);
  const revBreadth = revs.length
    ? revs.filter((x) => x > 0).length / revs.length - revs.filter((x) => x < 0).length / revs.length
    : null;

  const semis = inputs.filter((i) => /semiconductor|foundry|fabless|semiconductor equipment/i.test(i.industry));
  const semiMom = semis.map((i) => momentum(i.bars).m3).filter((x): x is number => x != null);
  const semiRel = semiMom.length && spxMom3m != null
    ? semiMom.reduce((a, b) => a + b, 0) / semiMom.length - spxMom3m
    : null;

  const goldBars = inputs.find((i) => i.ticker === "GLD")?.bars ?? [];
  const goldMom3m = momentum(goldBars).m3;

  const hyOas = (await macroLatest("HY_OAS"))?.value ?? null;
  const hyOasChange3m = await macroChange("HY_OAS", 91);

  const regimeInput: RegimeInput = {
    spxTrend: trendScore(spx),
    ndxTrend: trendScore(ndx),
    spxRealisedVol: realisedVol(spx),
    hyOas,
    hyOasChange3m,
    us10y: macro.us10y ?? null,
    curve2s10s: macro.curve2s10s ?? null,
    goldMom3m,
    dxyTrend: macro.dxyTrend ?? null,
    breadthAbove200: breadth,
    earningsRevisionBreadth: revBreadth,
    semiRelStrength: semiRel,
  };

  const regime = classifyRegime(regimeInput);

  // ── Persist ──────────────────────────────────────────────────────────
  const asOf = new Date(asOfDate);

  let methodologySource = await prisma.source.findFirst({
    where: { type: "METHODOLOGY", title: "Market-regime classification methodology" },
  });
  if (!methodologySource) {
    methodologySource = await prisma.source.create({
      data: {
        type: "METHODOLOGY",
        title: "Market-regime classification methodology",
        publisher: "AI Global Investment Strategist",
        freshness: "TODAY",
        isDemo: false,
      },
    });
  }

  const driversJson = toJson(
    regime.drivers.map((d) => ({ ...d, sourceId: d.sourceId ?? methodologySource!.id })),
  );
  const existingRegime = await prisma.marketRegime.findFirst({ where: { asOf } });
  if (existingRegime) {
    await prisma.marketRegime.update({
      where: { id: existingRegime.id },
      data: { regime: regime.regime, score: regime.score, driversJson },
    });
  } else {
    await prisma.marketRegime.create({
      data: { asOf, regime: regime.regime, score: regime.score, driversJson },
    });
  }

  for (const s of securities) {
    const sc = scoredById.get(s.id);
    if (!sc) continue;
    await prisma.securityScore.upsert({
      where: { securityId_asOf: { securityId: s.id, asOf } },
      update: scoreRow(sc),
      create: { securityId: s.id, asOf, ...scoreRow(sc) },
    });
  }

  return { asOf: asOfDate, regime: { regime: regime.regime, score: regime.score }, scored: scored.length };
}

function scoreRow(sc: ScoredSecurity) {
  return {
    overall: sc.overall,
    businessQuality: sc.components.businessQuality,
    growth: sc.components.growth,
    valuation: sc.components.valuation,
    earningsMomentum: sc.components.earningsMomentum,
    marketMomentum: sc.components.marketMomentum,
    aiExposure: sc.components.aiExposure,
    balanceSheet: sc.components.balanceSheet,
    risk: sc.components.risk,
    weightsJson: toJson(sc.weights),
    contributionsJson: toJson(sc.contributions),
    notesJson: toJson({ ...sc.notes, _raw: sc.raw }),
  };
}
