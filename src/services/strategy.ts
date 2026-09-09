import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { DEFAULT_CONSTRAINTS, type ConstraintSet } from "@/lib/config";
import {
  horizonBucket,
  SLEEVE_LABELS,
  SLEEVES,
  type Horizon,
  type RiskScore,
  type Sleeve,
} from "@/lib/enums";
import {
  baseSleeves,
  tiltSleeves,
  macroValuationTilt,
  equitySleeveFor,
} from "@/engine/sleeves";
import { buildPortfolio, type Candidate, type ExistingHolding } from "@/engine/allocation";
import type { FactorLoadings } from "@/engine/aiExposure";
import { getFxRates, toUsd } from "@/data/fx";
import type { Currency } from "@/lib/enums";
import { runAnalysis, getMacroContext } from "./analysis";

export type GenerateOpts = { reason: string; force?: boolean; weekOf?: Date };

const DEFAULT_VOL: Record<string, number> = {
  EQUITY: 0.3, GOLD: 0.15, GOV_BOND: 0.06, IG_BOND: 0.08, CASH: 0.01, DIVERSIFIER: 0.2,
};

function asCurrency(c: string): Currency {
  return c === "EUR" || c === "JPY" || c === "TWD" ? c : "USD";
}

async function currentRegime() {
  const latestPrice = await prisma.price.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const latestRegime = await prisma.marketRegime.findFirst({ orderBy: { asOf: "desc" } });
  const stale = !latestRegime || (latestPrice && latestRegime.asOf.getTime() < latestPrice.date.getTime());
  if (stale) await runAnalysis();
  const regime = await prisma.marketRegime.findFirst({ orderBy: { asOf: "desc" } });
  if (regime) return regime;
  return prisma.marketRegime.create({
    data: { asOf: new Date(), regime: "NEUTRAL", score: 0, driversJson: toJson([]) },
  });
}

function assignSleeve(assetClass: string, factors: FactorLoadings, sector: string, vol: number | null): Sleeve {
  switch (assetClass) {
    case "GOLD": return "gold";
    case "GOV_BOND":
    case "IG_BOND": return "bonds";
    case "CASH": return "cash";
    case "DIVERSIFIER": return "diversifiers";
    default:
      return equitySleeveFor({ defensiveFactor: factors.defensive, sector, vol });
  }
}

export async function generateStrategy(portfolioId: string, opts: GenerateOpts) {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) throw new Error("portfolio not found");

  const riskProfile = await prisma.riskProfile.findFirst({
    where: { userId: portfolio.userId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!riskProfile) throw new Error("no active risk profile");

  const riskScore = riskProfile.riskScore as RiskScore;
  const horizon = riskProfile.horizon as Horizon;
  const constraints = fromJson<ConstraintSet>(riskProfile.constraintsJson, DEFAULT_CONSTRAINTS[riskScore]);

  const regime = await currentRegime();
  const macro = await getMacroContext();

  // ── Sleeve targets: base → regime tilt → macro/valuation tilt ────────
  const afterRegime = tiltSleeves(baseSleeves(riskScore, horizon), regime.regime, constraints);

  // aggregate valuation percentile proxy from equity valuation sub-scores
  const valScores = await prisma.securityScore.findMany({
    where: { security: { assetClass: "EQUITY" } },
    orderBy: { asOf: "desc" },
    take: 60,
    select: { valuation: true, asOf: true },
  });
  const latestAsOf = valScores[0]?.asOf;
  const valForLatest = valScores.filter((v) => v.asOf.getTime() === latestAsOf?.getTime());
  const meanValScore = valForLatest.length
    ? valForLatest.reduce((a, v) => a + v.valuation, 0) / valForLatest.length
    : 50;
  const universeValuationPct = 1 - meanValScore / 100; // low val score => expensive => high pct

  const { sleeves: sleeveTargets, notes: tiltNotes } = macroValuationTilt(
    afterRegime,
    {
      realYieldDirection: macro.real10yChange3m != null ? Math.max(-1, Math.min(1, macro.real10yChange3m / 0.5)) : null,
      usdDirection: macro.dxyTrend ?? null,
      curveSignal: macro.curve2s10s ?? null,
      universeValuationPct,
    },
    constraints,
  );

  // ── Candidates ──────────────────────────────────────────────────────
  const securities = await prisma.security.findMany({
    include: {
      scores: { orderBy: { asOf: "desc" }, take: 1 },
      prices: { orderBy: { date: "desc" }, take: 1 },
    },
  });

  const candidates: Candidate[] = [];
  for (const s of securities) {
    const sc = s.scores[0];
    if (!sc) continue;
    const factors = fromJson<FactorLoadings>(s.factorLoadings, {
      aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0,
    });
    const raw = fromJson<{ _raw?: { vol?: number | null } }>(sc.notesJson, {});
    const vol = raw._raw?.vol ?? DEFAULT_VOL[s.assetClass] ?? 0.25;
    const priceLocal = s.prices[0]?.close ?? 1;
    const priceUsd = toUsd(priceLocal, asCurrency(s.currency));
    candidates.push({
      ticker: s.ticker,
      name: s.name,
      sleeve: assignSleeve(s.assetClass, factors, s.sector, vol),
      assetClass: s.assetClass,
      country: s.countryCode,
      sector: s.sector,
      currency: s.currency,
      score: sc.overall,
      vol: Math.max(0.005, vol),
      factors,
      priceUsd: priceUsd > 0 ? priceUsd : 1,
    });
  }

  // ── Existing holdings ───────────────────────────────────────────────
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId },
    include: { security: { include: { prices: { orderBy: { date: "desc" }, take: 1 } } } },
  });
  const existing: ExistingHolding[] = positions.map((p) => {
    const priceLocal = p.security.prices[0]?.close ?? p.avgPriceMinor / 100;
    const cur = asCurrency(p.security.currency);
    const priceUsd = toUsd(priceLocal, cur);
    return {
      ticker: p.security.ticker,
      quantity: p.quantity,
      avgPriceUsd: toUsd(p.avgPriceMinor / 100, cur),
      marketValueUsd: priceUsd * p.quantity,
    };
  });

  // ── Build ───────────────────────────────────────────────────────────
  const result = buildPortfolio({
    capitalUsdMinor: portfolio.capitalUsdMinor,
    sleeveTargets,
    constraints,
    candidates,
    existing,
    horizonBucket: horizonBucket(horizon),
  });

  const fx = getFxRates();
  const inputHash = createHash("sha256")
    .update(JSON.stringify({
      riskScore, horizon, objective: riskProfile.objective, capital: portfolio.capitalUsdMinor,
      regime: regime.regime, sleeveTargets,
      alloc: result.rows.map((r) => [r.ticker, r.weight]),
    }))
    .digest("hex");

  const prev = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
    include: { recommendations: true },
  });

  if (prev && prev.dataHash === inputHash && !opts.force) {
    return { version: prev.version, created: false, strategyVersionId: prev.id };
  }

  const version = (prev?.version ?? 0) + 1;
  const secIdByTicker = new Map(securities.map((s) => [s.ticker, s.id]));

  const allocationJson = toJson(
    result.rows.map((r) => ({
      securityId: secIdByTicker.get(r.ticker) ?? null,
      ticker: r.ticker,
      name: r.name,
      sleeve: r.sleeve,
      assetClass: r.assetClass,
      country: r.country,
      sector: r.sector,
      currency: r.currency,
      weight: r.weight,
      usdMinor: r.usdMinor,
      score: r.score,
    })),
  );

  const narrative = buildNarrative({
    version, riskScore, horizon, objective: riskProfile.objective,
    regime: regime.regime, sleeveTargets, tiltNotes, result,
  });

  const sv = await prisma.strategyVersion.create({
    data: {
      portfolioId,
      version,
      weekOf: opts.weekOf ?? new Date(),
      regimeId: regime.id,
      sleeveTargetsJson: toJson(sleeveTargets),
      allocationJson,
      fxRatesJson: toJson(fx),
      factorExposureJson: toJson({
        ...result.factorExposure,
        country: result.countryExposure,
        sector: result.sectorExposure,
        currency: result.currencyExposure,
        estVol: result.estPortfolioVol,
        boundConstraints: result.boundConstraints,
        warnings: result.warnings,
        reconciliation: result.reconciliation,
      }),
      narrativeMd: narrative,
      dataHash: inputHash,
      previousVersionId: prev?.id ?? null,
    },
  });

  // ── Risk metrics + stress tests ────────────────────────────────────
  try {
    const { computeAndPersistRisk } = await import("./risk");
    await computeAndPersistRisk(sv.id);
  } catch (err) {
    console.error("risk computation failed:", (err as Error).message);
  }

  // ── Per-position recommendations (AI reasoning layer, or fallback) ──
  let recSummary: { usedFallback: boolean; count: number } | null = null;
  try {
    const { generateRecommendations } = await import("./recommendations");
    const r = await generateRecommendations(sv.id);
    recSummary = { usedFallback: r.usedFallback, count: r.count };
  } catch (err) {
    console.error("recommendation generation failed:", (err as Error).message);
  }

  // ── Change diff vs previous version (skipped for the first version) ──
  if (prev) {
    await diffAndPersistChanges(sv.id, prev.allocationJson, allocationJson, prev.sleeveTargetsJson, toJson(sleeveTargets));
  }

  return {
    version, created: true, strategyVersionId: sv.id,
    rows: result.rows.length, warnings: result.warnings, recommendations: recSummary,
  };
}

function buildNarrative(a: {
  version: number; riskScore: number; horizon: string; objective: string;
  regime: string; sleeveTargets: Record<Sleeve, number>; tiltNotes: string[];
  result: ReturnType<typeof buildPortfolio>;
}): string {
  const sleeveLines = SLEEVES.filter((s) => a.sleeveTargets[s] > 0.001)
    .map((s) => `- **${SLEEVE_LABELS[s]}**: ${(a.sleeveTargets[s] * 100).toFixed(1)}%`)
    .join("\n");
  const top = a.result.rows.slice(0, 6).map((r) => `${r.ticker} ${(r.weight * 100).toFixed(1)}%`).join(" · ");
  return [
    `# Strategy v${a.version}`,
    ``,
    `**Profile.** Risk ${a.riskScore}/5 · horizon ${a.horizon} · objective ${a.objective}.`,
    `**Market regime.** ${a.regime}.`,
    ``,
    `## Sleeve allocation`,
    sleeveLines,
    ``,
    a.tiltNotes.length ? `**Macro / valuation adjustments this cycle:** ${a.tiltNotes.join(" ")}` : "",
    ``,
    `## Largest positions`,
    top,
    ``,
    `## Portfolio characteristics`,
    `- Estimated volatility: ${(a.result.estPortfolioVol * 100).toFixed(1)}%`,
    `- AI-factor look-through exposure: ${(a.result.factorExposure.aiFactor * 100).toFixed(0)}%`,
    `- Semiconductor exposure: ${(a.result.factorExposure.semiconductor * 100).toFixed(0)}%`,
    a.result.boundConstraints.length ? `- Binding constraints: ${a.result.boundConstraints.join("; ")}` : "- No constraints were binding.",
    ``,
    a.result.warnings.length ? `## Notes\n${a.result.warnings.map((w) => `- ${w}`).join("\n")}` : "",
    ``,
    `_Per-position investment theses, catalysts, risks and a devil's-advocate review are generated by the AI reasoning layer (Phase 5)._`,
  ].filter((l) => l !== "").join("\n");
}

type AllocRow = { ticker: string; name: string; sleeve: string; weight: number };

async function diffAndPersistChanges(
  strategyVersionId: string,
  prevAllocJson: string | null,
  newAllocJson: string,
  prevSleeveJson: string | null,
  newSleeveJson: string,
) {
  const prevAlloc = fromJson<AllocRow[]>(prevAllocJson, []);
  const newAlloc = fromJson<AllocRow[]>(newAllocJson, []);
  const prevSleeves = fromJson<Record<string, number>>(prevSleeveJson, {});
  const newSleeves = fromJson<Record<string, number>>(newSleeveJson, {});

  const changes: {
    kind: string; label: string; previousValue: string | null; newValue: string | null;
    deltaText: string | null; reason: string; evidenceJson: string;
  }[] = [];

  // sleeve-level
  for (const s of SLEEVES) {
    const p = prevSleeves[s] ?? 0;
    const n = newSleeves[s] ?? 0;
    if (Math.abs(n - p) >= 0.01) {
      changes.push({
        kind: "SLEEVE",
        label: SLEEVE_LABELS[s],
        previousValue: `${(p * 100).toFixed(1)}%`,
        newValue: `${(n * 100).toFixed(1)}%`,
        deltaText: `${n > p ? "+" : ""}${((n - p) * 100).toFixed(1)}%`,
        reason: n > p ? "Increased on regime / macro signals favouring this sleeve." : "Reduced on regime / macro signals.",
        evidenceJson: toJson([]),
      });
    }
  }

  // position-level
  const prevByT = new Map(prevAlloc.map((r) => [r.ticker, r.weight]));
  const newByT = new Map(newAlloc.map((r) => [r.ticker, r.weight]));
  for (const r of newAlloc) {
    const p = prevByT.get(r.ticker);
    if (p == null) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: "0%",
        newValue: `${(r.weight * 100).toFixed(1)}%`, deltaText: `+${(r.weight * 100).toFixed(1)}%`,
        reason: "New position — entered the portfolio on an improved relative score / sleeve fit.",
        evidenceJson: toJson([]),
      });
    } else if (Math.abs(r.weight - p) >= 0.01) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: `${(p * 100).toFixed(1)}%`,
        newValue: `${(r.weight * 100).toFixed(1)}%`, deltaText: `${r.weight > p ? "+" : ""}${((r.weight - p) * 100).toFixed(1)}%`,
        reason: r.weight > p ? "Weight increased on relative score / momentum improvement." : "Weight trimmed on relative score / constraint pressure.",
        evidenceJson: toJson([]),
      });
    }
  }
  for (const r of prevAlloc) {
    if (!newByT.has(r.ticker)) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: `${(r.weight * 100).toFixed(1)}%`,
        newValue: "0%", deltaText: `-${(r.weight * 100).toFixed(1)}%`,
        reason: "Exited — fell below the minimum score / displaced by a higher-ranked name.",
        evidenceJson: toJson([]),
      });
    }
  }

  if (changes.length) {
    await prisma.strategyChange.createMany({
      data: changes.map((c) => ({ ...c, strategyVersionId })),
    });
  }
}
