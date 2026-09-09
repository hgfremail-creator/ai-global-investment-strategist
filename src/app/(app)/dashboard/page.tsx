import Link from "next/link";
import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card, Stat, Badge, Empty, DemoBadge } from "@/components/ui";
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

export default async function DashboardPage() {
  const { ctx } = await pageContext();
  const strategy = await getLatestStrategy(ctx.portfolio.id);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="text-xs text-[var(--color-muted)]">
          {strategy ? `Strategy v${strategy.version}` : "No strategy yet"} ·{" "}
          <DemoBadge />
        </span>
      </div>

      <Card title="Your portfolio">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Invested capital"
            value={formatMoney(ctx.portfolio.capitalUsdMinor, "USD")}
          />
          <Stat label="Risk level" value={`${ctx.riskProfile.riskScore}/5`} sub={RISK_LABELS[ctx.riskProfile.riskScore as RiskScore].title} />
          <Stat label="Horizon" value={HORIZON_LABELS[ctx.riskProfile.horizon as Horizon]} />
          <Stat label="Objective" value={OBJECTIVE_LABELS[ctx.riskProfile.objective as Objective]} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Current strategy" subtitle={strategy ? `Regime: ${REGIME_LABELS[strategy.regime.regime as Regime]}` : undefined}>
          {strategy ? (
            <ul className="space-y-2">
              {Object.entries(strategy.sleeveTargets)
                .filter(([, w]) => (w as number) > 0.0005)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([sleeve, w]) => (
                  <li key={sleeve} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-muted)]">
                      {SLEEVE_LABELS[sleeve as Sleeve]}
                    </span>
                    <span className="tnum">{formatPercent(w as number)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty>Strategy not generated yet.</Empty>
          )}
          <Link
            href="/strategy"
            className="mt-4 inline-block text-xs text-[var(--color-accent)] hover:underline"
          >
            View full strategy →
          </Link>
        </Card>

        <Card title="Top convictions">
          {strategy && strategy.recommendations.length > 0 ? (
            <ol className="space-y-1.5 text-sm">
              {[...strategy.recommendations]
                .sort((a, b) => b.conviction - a.conviction)
                .slice(0, 5)
                .map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span>
                      <span className="text-[var(--color-faint)]">{i + 1}.</span> {r.security.ticker}{" "}
                      <span className="text-[var(--color-muted)]">{r.security.name}</span>
                    </span>
                    <Badge tone="accent">{r.conviction}</Badge>
                  </li>
                ))}
            </ol>
          ) : (
            <Empty>Per-security convictions appear once the scoring engine runs (Phase 3–5).</Empty>
          )}
        </Card>

        <Card title="Biggest risks">
          {strategy?.riskMetric ? (
            <ul className="space-y-1.5 text-sm text-[var(--color-muted)]">
              <li>AI-factor exposure: <span className="tnum">{formatPercent(strategy.riskMetric.aiFactorExposure)}</span></li>
              <li>Portfolio volatility: <span className="tnum">{formatPercent(strategy.riskMetric.volatility)}</span></li>
              <li>Concentration (HHI): <span className="tnum">{strategy.riskMetric.concentrationHHI.toFixed(3)}</span></li>
            </ul>
          ) : (
            <Empty>Risk dashboard is delivered in Phase 6.</Empty>
          )}
        </Card>

        <Card title="This week">
          {strategy && strategy.changes.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {strategy.changes.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <span className="text-[var(--color-fg)]">{c.label}</span>{" "}
                  <span className="text-[var(--color-muted)]">
                    {c.previousValue} → {c.newValue}
                  </span>{" "}
                  <span className="text-[var(--color-faint)]">— {c.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Weekly change tracking is delivered in Phase 7.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
