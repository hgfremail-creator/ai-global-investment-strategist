import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { toMinor } from "@/lib/money";
import { DEFAULT_CONSTRAINTS, type ConstraintSet } from "@/lib/config";
import { horizonBucket, type Horizon, type RiskScore, type Sleeve, SLEEVES } from "@/lib/enums";
import { baseSleeves, tiltSleeves, macroValuationTilt, equitySleeveFor } from "@/engine/sleeves";
import { buildPortfolio, type Candidate } from "@/engine/allocation";
import type { FactorLoadings } from "@/engine/aiExposure";
import { runCustomScenario, type StressHolding } from "@/engine/stress";
import { toUsd } from "@/data/fx";
import { getMacroContext } from "./analysis";
import type { AllocationRow } from "./strategyRead";

export type WhatIfOverrides = {
  capitalUsd?: number;
  riskScore?: RiskScore;
  horizon?: Horizon;
  excludeSectors?: string[];
  excludeAssetClasses?: string[];
  minGoldPct?: number; // 0..1
  customShock?: { equity?: number; growthEquity?: number; gold?: number; bonds?: number; jpy?: number; usd?: number };
};

function asCurrency(c: string) {
  return c === "EUR" || c === "JPY" || c === "TWD" ? (c as "EUR" | "JPY" | "TWD") : ("USD" as const);
}

const DEFAULT_VOL: Record<string, number> = {
  EQUITY: 0.3, GOLD: 0.15, GOV_BOND: 0.06, IG_BOND: 0.08, CASH: 0.01, DIVERSIFIER: 0.2,
};

export type WhatIfResult = {
  applied: WhatIfOverrides & { riskScore: RiskScore; horizon: Horizon; capitalUsd: number };
  sleeveTargets: Record<Sleeve, number>;
  rows: AllocationRow[];
  factorExposure: { aiFactor: number; semiconductor: number; usTech: number; defensive: number };
  estVol: number;
  warnings: string[];
  diffVsCurrent: {
    ticker: string;
    name: string;
    current: number;
    hypothetical: number;
    delta: number;
  }[];
  customStress?: { estimatedImpactPct: number; byTicker: { ticker: string; impactPct: number; contributionPct: number }[] };
};

export async function runWhatIf(portfolioId: string, o: WhatIfOverrides): Promise<WhatIfResult> {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) throw new Error("portfolio not found");
  const rp = await prisma.riskProfile.findFirst({
    where: { userId: portfolio.userId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!rp) throw new Error("no active risk profile");

  const riskScore = (o.riskScore ?? rp.riskScore) as RiskScore;
  const horizon = (o.horizon ?? rp.horizon) as Horizon;
  const capitalUsd = o.capitalUsd ?? portfolio.capitalUsdMinor / 100;
  const constraints: ConstraintSet = { ...DEFAULT_CONSTRAINTS[riskScore] };

  const regime = await prisma.marketRegime.findFirst({ orderBy: { asOf: "desc" } });
  const macro = await getMacroContext();

  let sleeveTargets = tiltSleeves(baseSleeves(riskScore, horizon), regime?.regime ?? "NEUTRAL", constraints);
  sleeveTargets = macroValuationTilt(
    sleeveTargets,
    {
      realYieldDirection: macro.real10yChange3m != null ? Math.max(-1, Math.min(1, macro.real10yChange3m / 0.5)) : null,
      usdDirection: macro.dxyTrend ?? null,
      universeValuationPct: 0.5,
    },
    constraints,
  ).sleeves;

  // Force a minimum gold sleeve if requested (take from growth, renormalise).
  if (o.minGoldPct != null && sleeveTargets.gold < o.minGoldPct) {
    const need = o.minGoldPct - sleeveTargets.gold;
    sleeveTargets.gold = o.minGoldPct;
    sleeveTargets.growth = Math.max(0, sleeveTargets.growth - need);
    const t = SLEEVES.reduce((a, s) => a + sleeveTargets[s], 0);
    for (const s of SLEEVES) sleeveTargets[s] = sleeveTargets[s] / t;
  }

  const excludeSectors = new Set((o.excludeSectors ?? []).map((x) => x.toLowerCase()));
  const excludeClasses = new Set(o.excludeAssetClasses ?? []);

  const securities = await prisma.security.findMany({
    include: { scores: { orderBy: { asOf: "desc" }, take: 1 }, prices: { orderBy: { date: "desc" }, take: 1 } },
  });

  const candidates: Candidate[] = [];
  for (const s of securities) {
    const sc = s.scores[0];
    if (!sc) continue;
    if (excludeClasses.has(s.assetClass)) continue;
    if (excludeSectors.has(s.sector.toLowerCase())) continue;
    if ([...excludeSectors].some((x) => s.industry.toLowerCase().includes(x) || s.sector.toLowerCase().includes(x))) continue;
    const factors = fromJson<FactorLoadings>(s.factorLoadings, {
      aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0,
    });
    const raw = fromJson<{ _raw?: { vol?: number | null } }>(sc.notesJson, {});
    const vol = raw._raw?.vol ?? DEFAULT_VOL[s.assetClass] ?? 0.25;
    const priceUsd = toUsd(s.prices[0]?.close ?? 1, asCurrency(s.currency));
    candidates.push({
      ticker: s.ticker, name: s.name,
      sleeve:
        s.assetClass === "GOLD" ? "gold"
        : s.assetClass === "GOV_BOND" || s.assetClass === "IG_BOND" ? "bonds"
        : s.assetClass === "CASH" ? "cash"
        : s.assetClass === "DIVERSIFIER" ? "diversifiers"
        : equitySleeveFor({ defensiveFactor: factors.defensive, sector: s.sector, vol }),
      assetClass: s.assetClass, country: s.countryCode, sector: s.sector, currency: s.currency,
      score: sc.overall, vol: Math.max(0.005, vol), factors, priceUsd: priceUsd > 0 ? priceUsd : 1,
    });
  }

  const result = buildPortfolio({
    capitalUsdMinor: toMinor(capitalUsd),
    sleeveTargets,
    constraints,
    candidates,
    existing: [],
    horizonBucket: horizonBucket(horizon),
  });

  // diff vs the live strategy
  const live = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    select: { allocationJson: true },
  });
  const liveAlloc = fromJson<AllocationRow[]>(live?.allocationJson ?? "", []);
  const liveByT = new Map(liveAlloc.map((r) => [r.ticker, r.weight]));
  const newByT = new Map(result.rows.map((r) => [r.ticker, r.weight]));
  const allTickers = new Set([...liveByT.keys(), ...newByT.keys()]);
  const diffVsCurrent = [...allTickers]
    .map((t) => {
      const current = liveByT.get(t) ?? 0;
      const hypothetical = newByT.get(t) ?? 0;
      const row = result.rows.find((r) => r.ticker === t) ?? liveAlloc.find((r) => r.ticker === t);
      return { ticker: t, name: row?.name ?? t, current, hypothetical, delta: hypothetical - current };
    })
    .filter((x) => Math.abs(x.delta) >= 0.003)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // optional custom stress on the hypothetical portfolio
  let customStress: WhatIfResult["customStress"];
  if (o.customShock && Object.keys(o.customShock).length) {
    const sh: StressHolding[] = result.rows.map((r) => {
      const cand = candidates.find((c) => c.ticker === r.ticker)!;
      return {
        ticker: r.ticker, weight: r.weight, assetClass: r.assetClass, country: r.country,
        currency: r.currency, sector: r.sector, factors: cand.factors, vol: cand.vol,
      };
    });
    const sc = runCustomScenario(sh, o.customShock);
    customStress = {
      estimatedImpactPct: sc.estimatedImpactPct,
      byTicker: sc.byHolding.map((b) => ({ ticker: b.ticker, impactPct: b.impactPct, contributionPct: b.contributionPct })),
    };
  }

  return {
    applied: { ...o, riskScore, horizon, capitalUsd },
    sleeveTargets,
    rows: result.rows.map((r) => ({
      securityId: null, ticker: r.ticker, name: r.name, sleeve: r.sleeve, assetClass: r.assetClass,
      country: r.country, sector: r.sector, currency: r.currency, weight: r.weight,
      usdMinor: r.usdMinor, score: r.score,
    })),
    factorExposure: {
      aiFactor: result.factorExposure.aiFactor,
      semiconductor: result.factorExposure.semiconductor,
      usTech: result.factorExposure.usTech,
      defensive: result.factorExposure.defensive,
    },
    estVol: result.estPortfolioVol,
    warnings: result.warnings,
    diffVsCurrent,
    customStress,
  };
}
