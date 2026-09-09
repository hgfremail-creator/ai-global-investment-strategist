import Link from "next/link";
import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { getPerformance } from "@/services/performance";
import { Card, Stat, Empty, DemoBadge } from "@/components/ui";
import { Donut, LegendList } from "@/components/charts/Donut";
import { PerformanceChart, DrawdownChart } from "@/components/charts/PerformanceChart";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  HORIZON_LABELS,
  OBJECTIVE_LABELS,
  REGIME_LABELS,
  RISK_LABELS,
  SLEEVE_LABELS,
  type Horizon,
  type Objective,
  type Regime,
  type RiskScore,
  type Sleeve,
} from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { ctx } = await pageContext();
  const [s, perf] = await Promise.all([
    getLatestStrategy(ctx.portfolio.id),
    getPerformance(ctx.portfolio.id),
  ]);

  const sleeveData = s
    ? Object.entries(s.sleeveTargets)
        .filter(([, w]) => (w as number) > 0.0005)
        .map(([k, w]) => ({ name: SLEEVE_LABELS[k as Sleeve], value: w as number }))
    : [];

  const topConvictions = s
    ? [...s.allocation].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 5)
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {s ? `Strategy v${s.version}` : "No strategy yet"} · <DemoBadge />
        </span>
      </div>

      <Card title="Your portfolio">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Invested capital" value={formatMoney(ctx.portfolio.capitalUsdMinor, "USD")} />
          <Stat
            label="Risk level"
            value={`${ctx.riskProfile.riskScore}/5`}
            sub={RISK_LABELS[ctx.riskProfile.riskScore as RiskScore].title}
          />
          <Stat label="Horizon" value={HORIZON_LABELS[ctx.riskProfile.horizon as Horizon]} />
          <Stat label="Objective" value={OBJECTIVE_LABELS[ctx.riskProfile.objective as Objective]} />
        </div>
      </Card>

      {perf && perf.series.length >= 2 && (
        <Card
          title="Paper portfolio performance"
          subtitle="Hypothetical — chains each strategy version over the period it was live · indexed to 100"
        >
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat
              label="Total return"
              value={formatPercent(perf.totalReturn)}
              tone={perf.totalReturn >= 0 ? "up" : "down"}
              sub={`vs ${formatPercent(perf.benchmarkTotalReturn)} bench`}
            />
            <Stat label="Last week" value={perf.weekReturn == null ? "—" : formatPercent(perf.weekReturn)} tone={(perf.weekReturn ?? 0) >= 0 ? "up" : "down"} />
            <Stat label="Max drawdown" value={formatPercent(perf.maxDrawdown)} tone="down" />
            <Stat label="Volatility (ann.)" value={formatPercent(perf.annualisedVol)} />
            <Stat label="Sharpe / Sortino" value={`${perf.sharpe?.toFixed(2) ?? "—"} / ${perf.sortino?.toFixed(2) ?? "—"}`} />
          </div>
          <PerformanceChart data={perf.series} benchmarkLabel={perf.benchmarkLabel} blendedLabel={perf.blendedLabel} />
          <div className="mt-2">
            <DrawdownChart data={perf.series} />
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Current strategy"
          subtitle={s ? `Regime: ${REGIME_LABELS[s.regime.regime as Regime]}` : undefined}
        >
          {s ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Donut data={sleeveData} height={180} />
              <div className="self-center">
                <LegendList data={sleeveData} />
              </div>
            </div>
          ) : (
            <Empty>Strategy not generated yet.</Empty>
          )}
          <Link href="/strategy" className="mt-3 inline-block text-xs text-[var(--color-accent)] hover:underline">
            Full strategy →
          </Link>
        </Card>

        <Card title="Top 5 convictions">
          {topConvictions.length > 0 ? (
            <ol className="space-y-1.5 text-sm">
              {topConvictions.map((r, i) => (
                <li key={r.ticker} className="flex items-center justify-between">
                  <span>
                    <span className="text-[var(--color-faint)]">{i + 1}.</span>{" "}
                    <Link
                      href={`/research/${encodeURIComponent(r.ticker)}`}
                      className="font-medium hover:text-[var(--color-accent)]"
                    >
                      {r.ticker}
                    </Link>{" "}
                    <span className="text-[var(--color-muted)]">{r.name}</span>
                  </span>
                  <span className="tnum text-xs text-[var(--color-muted)]">
                    {formatPercent(r.weight)} · score {r.score.toFixed(0)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No positions yet.</Empty>
          )}
        </Card>

        <Card title="Biggest risks">
          {s ? (
            <ul className="space-y-1.5 text-sm text-[var(--color-muted)]">
              <li>
                AI-factor exposure:{" "}
                <span className={`tnum ${s.factorExposure.aiFactor > 0.7 ? "text-[var(--color-reduce)]" : ""}`}>
                  {formatPercent(s.factorExposure.aiFactor)}
                </span>
              </li>
              <li>Estimated volatility: <span className="tnum">{formatPercent(s.factorExposure.estVol)}</span></li>
              <li>Semiconductor exposure: <span className="tnum">{formatPercent(s.factorExposure.semiconductor)}</span></li>
              {s.factorExposure.warnings.slice(0, 2).map((w, i) => (
                <li key={i} className="text-[var(--color-reduce)]">⚠ {w}</li>
              ))}
            </ul>
          ) : (
            <Empty>Risk view appears once a strategy exists.</Empty>
          )}
          <Link href="/risk" className="mt-3 inline-block text-xs text-[var(--color-accent)] hover:underline">
            Risk dashboard →
          </Link>
        </Card>

        <Card title="This week">
          {s && s.changes.length > 0 ? (
            <>
              <p className="mb-2 text-sm">
                {s.changes.length} change{s.changes.length === 1 ? "" : "s"} were made.
              </p>
              <ul className="space-y-1.5 text-sm">
                {s.changes.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <span className="text-[var(--color-fg)]">{c.label}</span>{" "}
                    <span className="tnum text-[var(--color-muted)]">
                      {c.previousValue} → {c.newValue}
                    </span>{" "}
                    <span className="text-[var(--color-faint)]">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>
              No changes yet — this is the first strategy version. Week-over-week change tracking
              runs from v2 (weekly review, Phase 7).
            </Empty>
          )}
          <Link href="/weekly-review" className="mt-3 inline-block text-xs text-[var(--color-accent)] hover:underline">
            Weekly review →
          </Link>
        </Card>
      </div>
    </div>
  );
}
