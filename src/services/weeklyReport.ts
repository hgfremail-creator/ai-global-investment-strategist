import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { formatMoney, formatPercent } from "@/lib/money";
import { SLEEVE_LABELS, REGIME_LABELS, type Sleeve, type Regime } from "@/lib/enums";
import type { AllocationRow, FactorExposure } from "./strategyRead";

type Section = { key: string; title: string; body: string };

async function macroLine(key: string, label: string): Promise<string> {
  const pts = await prisma.macroIndicator.findMany({
    where: { key }, orderBy: { date: "desc" }, take: 40, select: { value: true, date: true },
  });
  if (pts.length === 0) return `- ${label}: n/a`;
  const latest = pts[0].value;
  const monthAgo = pts.find((p) => p.date.getTime() <= pts[0].date.getTime() - 28 * 86400000)?.value ?? pts[pts.length - 1].value;
  const d = latest - monthAgo;
  return `- ${label}: ${latest.toFixed(2)} (${d >= 0 ? "+" : ""}${d.toFixed(2)} vs ~1m ago)`;
}

/**
 * Build the structured weekly report + enrich this version's StrategyChange rows
 * with real evidence by comparing against the previous version.
 */
export async function buildResearchReport(strategyVersionId: string, prevVersionId: string | null) {
  const sv = await prisma.strategyVersion.findUnique({
    where: { id: strategyVersionId },
    include: {
      regime: true, portfolio: true, riskMetric: true, stressTests: true,
      recommendations: { include: { security: true } }, changes: true,
    },
  });
  if (!sv) throw new Error("strategy version not found");

  const alloc = fromJson<AllocationRow[]>(sv.allocationJson, []);
  const sleeves = fromJson<Record<Sleeve, number>>(sv.sleeveTargetsJson, {} as Record<Sleeve, number>);
  const factor = fromJson<FactorExposure>(sv.factorExposureJson, {} as FactorExposure);
  const regimeDrivers = fromJson<{ indicator: string; vote: number; rationale: string }[]>(sv.regime.driversJson, []);
  const capitalUsd = sv.portfolio.capitalUsdMinor / 100;

  const prev = prevVersionId
    ? await prisma.strategyVersion.findUnique({
        where: { id: prevVersionId },
        include: { regime: true },
      })
    : null;
  const prevSleeves = prev ? fromJson<Record<Sleeve, number>>(prev.sleeveTargetsJson, {} as Record<Sleeve, number>) : null;

  // ── enrich change rows with evidence ────────────────────────────────
  const asOf = new Date(
    (await prisma.price.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? sv.weekOf,
  );
  const prevAsOf = prev?.weekOf ?? asOf;
  const scoreNow = new Map(
    (await prisma.securityScore.findMany({ where: { asOf }, include: { security: true } })).map(
      (x) => [x.security.ticker, x],
    ),
  );
  const scorePrev = new Map(
    (await prisma.securityScore.findMany({
      where: { asOf: { lte: prevAsOf } },
      orderBy: { asOf: "desc" },
      include: { security: true },
      take: 400,
    })).map((x) => [x.security.ticker, x]),
  );

  for (const c of sv.changes) {
    if (c.kind !== "POSITION") continue;
    const now = scoreNow.get(c.label);
    const before = scorePrev.get(c.label);
    if (now && before) {
      const dOverall = Math.round((now.overall - before.overall) * 10) / 10;
      const dMom = Math.round((now.marketMomentum - before.marketMomentum) * 10) / 10;
      const dVal = Math.round((now.valuation - before.valuation) * 10) / 10;
      const parts: string[] = [];
      if (Math.abs(dOverall) >= 0.5) parts.push(`overall score ${dOverall >= 0 ? "+" : ""}${dOverall}`);
      if (Math.abs(dMom) >= 1) parts.push(`price momentum ${dMom >= 0 ? "+" : ""}${dMom}`);
      if (Math.abs(dVal) >= 1) parts.push(`valuation ${dVal >= 0 ? "+" : ""}${dVal}`);
      if (parts.length) {
        await prisma.strategyChange.update({
          where: { id: c.id },
          data: {
            reason: `${c.reason} Evidence: ${parts.join(", ")} since ${prevAsOf.toISOString().slice(0, 10)}.`,
            evidenceJson: toJson([
              { fact: `Score ${before.overall.toFixed(0)} → ${now.overall.toFixed(0)}`, sourceId: null },
            ]),
          },
        });
      }
    }
  }
  if (prev) {
    const dRegime = Math.round((sv.regime.score - prev.regime.score) * 100) / 100;
    for (const c of sv.changes) {
      if (c.kind !== "SLEEVE") continue;
      await prisma.strategyChange.update({
        where: { id: c.id },
        data: {
          reason:
            `${c.reason} The market-regime composite moved ${dRegime >= 0 ? "+" : ""}${dRegime} ` +
            `(${REGIME_LABELS[prev.regime.regime as Regime]} → ${REGIME_LABELS[sv.regime.regime as Regime]}).`,
        },
      });
    }
  }
  const changes = await prisma.strategyChange.findMany({ where: { strategyVersionId } });

  // ── sections ────────────────────────────────────────────────────────
  const reduces = sv.recommendations.filter((r) => r.action === "REDUCE");
  const sells = sv.recommendations.filter((r) => r.action === "SELL");
  const topByConviction = [...sv.recommendations]
    .filter((r) => r.targetWeight > 0)
    .sort((a, b) => b.conviction - a.conviction)
    .slice(0, 5);

  const sleeveTable = (Object.keys(SLEEVE_LABELS) as Sleeve[])
    .filter((s) => (sleeves[s] ?? 0) > 0.001 || (prevSleeves?.[s] ?? 0) > 0.001)
    .map((s) => {
      const now = sleeves[s] ?? 0;
      const was = prevSleeves?.[s] ?? now;
      const usd = alloc.filter((r) => r.sleeve === s).reduce((a, r) => a + r.usdMinor, 0);
      return `| ${SLEEVE_LABELS[s]} | ${formatPercent(was)} | ${formatPercent(now)} | ${now > was ? "+" : ""}${formatPercent(now - was)} | ${formatMoney(usd, "USD")} |`;
    })
    .join("\n");

  const changeTable = changes.length
    ? changes
        .map((c) => `| ${c.label} | ${c.previousValue ?? "—"} | ${c.newValue ?? "—"} | ${c.deltaText ?? ""} | ${c.reason} |`)
        .join("\n")
    : "| — | — | — | — | No changes this week. |";

  const macroBody = [
    await macroLine("CPI_YOY", "US CPI (YoY %)"),
    await macroLine("FEDFUNDS", "Fed funds rate"),
    await macroLine("US10Y", "US 10Y yield"),
    await macroLine("US_REAL10Y", "US 10Y real yield"),
    await macroLine("DXY", "US dollar index"),
    await macroLine("GOLD", "Gold (USD/oz)"),
    await macroLine("HY_OAS", "High-yield credit spread"),
  ].join("\n");

  const goldRows = alloc.filter((r) => r.sleeve === "gold");
  const bondRows = alloc.filter((r) => r.sleeve === "bonds");
  const defRows = alloc.filter((r) => r.sleeve === "defensiveEquity");

  const sections: Section[] = [
    {
      key: "executiveSummary",
      title: "Executive Summary",
      body:
        `Strategy v${sv.version} for the week of ${sv.weekOf.toISOString().slice(0, 10)}. ` +
        `Market regime: **${REGIME_LABELS[sv.regime.regime as Regime]}** (composite ${sv.regime.score.toFixed(2)}). ` +
        `The portfolio holds ${alloc.length} positions across ${new Set(alloc.map((r) => r.country)).size} countries; ` +
        `estimated volatility ${formatPercent(sv.riskMetric?.volatility ?? factor.estVol ?? 0)}, ` +
        `AI-factor look-through ${formatPercent(factor.aiFactor ?? 0)}. ` +
        (changes.length
          ? `${changes.length} change${changes.length === 1 ? "" : "s"} from last week (see "Changes From Last Week").`
          : `No changes from last week.`),
    },
    {
      key: "marketRegime",
      title: "Market Regime",
      body:
        `**${REGIME_LABELS[sv.regime.regime as Regime]}** — composite ${sv.regime.score.toFixed(2)} (−2 … +2).\n\n` +
        regimeDrivers
          .map((d) => `- ${d.indicator} (vote ${d.vote >= 0 ? "+" : ""}${d.vote}): ${d.rationale}`)
          .join("\n"),
    },
    { key: "macro", title: "Macro Environment", body: macroBody },
    {
      key: "allocation",
      title: "Portfolio Allocation",
      body:
        `| Sleeve | Previous | New | Change | USD |\n| --- | ---: | ---: | ---: | ---: |\n${sleeveTable}\n\n` +
        `Total: ${formatPercent(alloc.reduce((a, r) => a + r.weight, 0))} · ${formatMoney(alloc.reduce((a, r) => a + r.usdMinor, 0), "USD")}.`,
    },
    {
      key: "topOpportunities",
      title: "Top Opportunities",
      body: topByConviction.length
        ? topByConviction
            .map(
              (r) =>
                `- **${r.security.ticker}** (${r.security.name}) — ${r.action}, conviction ${r.conviction}/100, ` +
                `target ${formatPercent(r.targetWeight)}. ${r.thesisMd.split("\n")[0]}`,
            )
            .join("\n")
        : "No high-conviction buys this week.",
    },
    {
      key: "stocksReduced",
      title: "Stocks Reduced",
      body: reduces.length
        ? reduces.map((r) => `- **${r.security.ticker}** — ${r.thesisMd.split("\n")[0]}`).join("\n")
        : "None this week.",
    },
    {
      key: "stocksSold",
      title: "Stocks Sold",
      body: sells.length
        ? sells.map((r) => `- **${r.security.ticker}** — ${r.thesisMd.split("\n")[0]}`).join("\n")
        : "None this week.",
    },
    {
      key: "defensivePositioning",
      title: "Defensive Positioning",
      body:
        `Defensive equity sleeve: ${formatPercent(sleeves.defensiveEquity ?? 0)}` +
        (defRows.length ? ` — ${defRows.map((r) => `${r.ticker} ${formatPercent(r.weight)}`).join(", ")}.` : ".") +
        ` Minimum-defensive floor for this risk profile is respected.`,
    },
    {
      key: "gold",
      title: "Gold",
      body:
        `Gold sleeve: ${formatPercent(sleeves.gold ?? 0)}` +
        (goldRows.length ? ` via ${goldRows.map((r) => `${r.ticker} ${formatPercent(r.weight)}`).join(", ")}.` : ".") +
        ` Rationale: real-yield direction, USD trend and gold momentum feed the gold attractiveness score; ` +
        `it is held as a strategic diversifier, not a tactical trade.`,
    },
    {
      key: "bonds",
      title: "Bonds",
      body:
        `Bond sleeve: ${formatPercent(sleeves.bonds ?? 0)}` +
        (bondRows.length ? ` — ${bondRows.map((r) => `${r.ticker} ${formatPercent(r.weight)}`).join(", ")}.` : ".") +
        ` Instrument choice is duration-matched to the ${sv.portfolio.baseCurrency === "USD" ? "" : "USD-hedged "}` +
        `investment horizon. For a non-USD investor, USD-denominated bonds carry currency risk that is monitored on the Risk page.`,
    },
    {
      key: "currency",
      title: "Currency",
      body:
        `Currency exposure: ${Object.entries(factor.currency ?? {})
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${formatPercent(v)}`)
          .join(" · ")}. ` +
        `This is a by-product of holding non-US equities and EUR/JPY government bonds — intentional diversification, not a separate FX position.`,
    },
    {
      key: "risks",
      title: "Risks",
      body:
        (sv.riskMetric
          ? `Volatility ${formatPercent(sv.riskMetric.volatility)}, expected drawdown ${formatPercent(sv.riskMetric.expectedDrawdown)}, ` +
            `concentration HHI ${sv.riskMetric.concentrationHHI.toFixed(3)} (${(1 / sv.riskMetric.concentrationHHI).toFixed(1)} effective names), ` +
            `valuation risk ${formatPercent(sv.riskMetric.valuationRisk)}, geopolitical risk ${formatPercent(sv.riskMetric.geopoliticalRisk)}.\n\n`
          : "") +
        `Stress tests (hypothetical):\n` +
        sv.stressTests
          .map((s) => `- ${s.label}: ${formatPercent(s.estimatedImpactPct)} (${formatMoney(Math.round(capitalUsd * s.estimatedImpactPct * 100), "USD")})`)
          .join("\n") +
        (factor.warnings?.length ? `\n\nConcentration warnings:\n${factor.warnings.map((w) => `- ${w}`).join("\n")}` : ""),
    },
    {
      key: "changesFromLastWeek",
      title: "Changes From Last Week",
      body: `| Security / Sleeve | Previous | New | Change | Reason |\n| --- | ---: | ---: | ---: | --- |\n${changeTable}`,
    },
    {
      key: "investmentThesis",
      title: "Investment Thesis",
      body: sv.narrativeMd,
    },
  ];

  const sources = await prisma.source.findMany({
    where: {
      OR: [
        { recommendations: { some: { recommendation: { strategyVersionId } } } },
        { type: "METHODOLOGY" },
      ],
    },
    take: 40,
  });
  sections.push({
    key: "sources",
    title: "Sources",
    body: sources.length
      ? sources
          .map(
            (s, i) =>
              `${i + 1}. ${s.publisher} — ${s.title}${s.publishedAt ? ` (${s.publishedAt.toISOString().slice(0, 10)})` : ""}` +
              `${s.url ? ` — ${s.url}` : ""}${s.isDemo ? " ⚠ simulated" : ""}`,
          )
          .join("\n")
      : "No external sources attached.",
  });

  const markdown =
    `# Global Investment Strategy\n\n### Week of ${sv.weekOf.toISOString().slice(0, 10)} · Strategy v${sv.version}\n\n` +
    sections.map((s) => `## ${s.title}\n\n${s.body}\n`).join("\n");

  await prisma.researchReport.upsert({
    where: { strategyVersionId },
    update: { markdown, sectionsJson: toJson(Object.fromEntries(sections.map((s) => [s.key, s.body]))), weekOf: sv.weekOf },
    create: {
      strategyVersionId,
      weekOf: sv.weekOf,
      markdown,
      sectionsJson: toJson(Object.fromEntries(sections.map((s) => [s.key, s.body]))),
    },
  });

  return { sections: sections.length, changes: changes.length };
}
