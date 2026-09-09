import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { allocateMinor } from "@/lib/money";
import { DEFAULT_CONSTRAINTS, type ConstraintSet } from "@/lib/config";
import { type Horizon, type RiskScore, SLEEVES } from "@/lib/enums";
import { baseSleeves, tiltSleeves } from "@/engine/sleeves";
import { getFxRates } from "@/data/fx";

// NOTE: This is the orchestration seam. The deterministic sub-engines
// (regime, scoring, allocation, risk, AI narrative) are layered in during their
// respective phases and called from here. For now it produces a coherent
// sleeve-level strategy version so the UI and history/versioning work end to end.

export type GenerateOpts = { reason: string; force?: boolean; weekOf?: Date };

async function currentRegime() {
  // Provisional regime until the regime engine (Phase 3) is wired in.
  const existing = await prisma.marketRegime.findFirst({ orderBy: { asOf: "desc" } });
  if (existing) return existing;
  const source = await prisma.source.create({
    data: {
      type: "METHODOLOGY",
      title: "Provisional regime classification (pre-engine)",
      publisher: "AI Global Investment Strategist",
      freshness: "TODAY",
      isDemo: true,
    },
  });
  return prisma.marketRegime.create({
    data: {
      asOf: new Date(),
      regime: "NEUTRAL",
      score: 0,
      driversJson: toJson([
        {
          indicator: "Composite",
          value: 0,
          vote: 0,
          weight: 1,
          rationale:
            "Regime engine not yet active — defaulting to Neutral. Replaced once the indicator engine runs.",
          sourceId: source.id,
        },
      ]),
    },
  });
}

export async function generateStrategy(portfolioId: string, opts: GenerateOpts) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    include: { user: true },
  });
  if (!portfolio) throw new Error("portfolio not found");

  const riskProfile = await prisma.riskProfile.findFirst({
    where: { userId: portfolio.userId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!riskProfile) throw new Error("no active risk profile");

  const riskScore = riskProfile.riskScore as RiskScore;
  const constraints = fromJson<ConstraintSet>(
    riskProfile.constraintsJson,
    DEFAULT_CONSTRAINTS[riskScore],
  );
  const base = baseSleeves(riskScore, riskProfile.horizon as Horizon);

  const regime = await currentRegime();
  const sleeveTargets = tiltSleeves(base, regime.regime, constraints);

  const prev = await prisma.strategyVersion.findFirst({
    where: { portfolioId },
    orderBy: { version: "desc" },
  });

  const fx = getFxRates();
  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        riskScore,
        horizon: riskProfile.horizon,
        objective: riskProfile.objective,
        capital: portfolio.capitalUsdMinor,
        regime: regime.regime,
        sleeveTargets,
        constraints,
      }),
    )
    .digest("hex");

  if (prev && prev.dataHash === inputHash && !opts.force) {
    return { version: prev.version, created: false, strategyVersionId: prev.id };
  }

  // Sleeve-level USD split (name-level selection added by the allocation engine phase).
  const sleeveOrder = SLEEVES.filter((s) => sleeveTargets[s] > 0);
  const usdSplit = allocateMinor(
    portfolio.capitalUsdMinor,
    sleeveOrder.map((s) => sleeveTargets[s]),
  );
  const allocation = sleeveOrder.map((s, i) => ({
    securityId: null,
    ticker: null,
    sleeve: s,
    weight: sleeveTargets[s],
    usdMinor: usdSplit[i],
  }));

  const version = (prev?.version ?? 0) + 1;
  const narrative = [
    `# Strategy v${version}`,
    ``,
    `Risk profile **${riskScore}/5** · horizon **${riskProfile.horizon}** · objective **${riskProfile.objective}**.`,
    `Market regime: **${regime.regime}**.`,
    ``,
    `Sleeve targets: ${sleeveOrder
      .map((s) => `${s} ${(sleeveTargets[s] * 100).toFixed(1)}%`)
      .join(" · ")}.`,
    ``,
    `_Security-level selection, scoring rationale and per-position recommendations are produced once the scoring and allocation engines are active._`,
  ].join("\n");

  const sv = await prisma.strategyVersion.create({
    data: {
      portfolioId,
      version,
      weekOf: opts.weekOf ?? new Date(),
      regimeId: regime.id,
      sleeveTargetsJson: toJson(sleeveTargets),
      allocationJson: toJson(allocation),
      fxRatesJson: toJson(fx),
      factorExposureJson: toJson({ aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0 }),
      narrativeMd: narrative,
      dataHash: inputHash,
      previousVersionId: prev?.id ?? null,
    },
  });

  return { version, created: true, strategyVersionId: sv.id };
}
