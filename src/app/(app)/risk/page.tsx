import { pageContext } from "@/services/page";
import { getRiskDashboard } from "@/services/riskRead";
import { Card, Stat, Empty, DemoBadge, Badge } from "@/components/ui";
import { Donut, LegendList } from "@/components/charts/Donut";
import { ExposureBar } from "@/components/ExposureBar";
import { formatMoney, formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

function RiskGauge({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const level = value > 0.6 ? "High" : value > 0.35 ? "Moderate" : "Low";
  return <ExposureBar label={`${label} — ${level}`} value={value} warn={value > 0.6} hint={hint} />;
}

export default async function RiskPage() {
  const { ctx } = await pageContext();
  const r = await getRiskDashboard(ctx.portfolio.id);

  if (!r || !r.metric) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold">Risk</h1>
        <Empty>Risk metrics are computed with each strategy version. Run a strategy first.</Empty>
      </div>
    );
  }

  const m = r.metric;
  const toData = (rec: Record<string, number>) =>
    Object.entries(rec).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Risk dashboard</h1>
        <span className="text-xs text-[var(--color-muted)]">Strategy v{r.version} · <DemoBadge /></span>
      </div>

      <Card title="Portfolio risk statistics">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Volatility (ann.)" value={formatPercent(m.volatility)} />
          <Stat label="Expected drawdown" value={formatPercent(m.expectedDrawdown)} sub="~2.5σ monthly" />
          <Stat label="Max historical DD" value={formatPercent(m.maxHistoricalDrawdown)} tone="down" />
          <Stat label="Concentration (HHI)" value={m.concentrationHHI.toFixed(3)} sub={`${(1 / m.concentrationHHI).toFixed(1)} effective names`} />
          <Stat label="Sharpe" value={m.sharpe?.toFixed(2) ?? "—"} />
          <Stat label="Sortino" value={m.sortino?.toFixed(2) ?? "—"} />
          <Stat label="US-tech exposure" value={formatPercent(m.usTechExposure)} />
          <Stat label="AI-factor exposure" value={formatPercent(m.aiFactorExposure)} tone={m.aiFactorExposure > 0.7 ? "down" : "neutral"} />
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Risk gauges">
          <div className="space-y-3">
            <RiskGauge label="Valuation risk" value={m.valuationRisk} hint="Equity-weighted (1 − valuation score)" />
            <RiskGauge label="Liquidity risk" value={m.liquidityRisk} hint="Heuristic by asset class & listing region" />
            <RiskGauge label="Geopolitical risk" value={m.geopoliticalRisk} hint="Weighted by country exposure" />
            <RiskGauge label="AI-factor concentration" value={m.aiFactorExposure} />
            <RiskGauge label="Semiconductor concentration" value={m.semiconductorExposure} />
          </div>
          {r.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-md border border-[var(--color-reduce)]/40 bg-[var(--color-reduce)]/10 p-3 text-xs text-[var(--color-reduce)]">
              {r.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
            </ul>
          )}
        </Card>

        <Card title="Exposure">
          <div className="space-y-4">
            <div>
              <h4 className="mb-1 text-xs uppercase tracking-wider text-[var(--color-muted)]">Country</h4>
              <div className="grid grid-cols-2 gap-2">
                <Donut data={toData(m.country)} height={140} />
                <div className="self-center"><LegendList data={toData(m.country)} /></div>
              </div>
            </div>
            <div>
              <h4 className="mb-1 text-xs uppercase tracking-wider text-[var(--color-muted)]">Currency</h4>
              <div className="grid grid-cols-2 gap-2">
                <Donut data={toData(m.currency)} height={140} />
                <div className="self-center"><LegendList data={toData(m.currency)} /></div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Sector exposure">
        <div className="grid gap-3 sm:grid-cols-2">
          <Donut data={toData(m.sector)} height={200} />
          <div className="self-center"><LegendList data={toData(m.sector)} /></div>
        </div>
      </Card>

      <Card
        title="Stress tests"
        right={<Badge tone="warn">Hypothetical</Badge>}
        subtitle="Deterministic factor-shock estimates — not forecasts"
      >
        <div className="space-y-4">
          {r.stress.map((s) => (
            <div key={s.key} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.label}</span>
                <span
                  className={`tnum text-sm font-semibold ${
                    s.estimatedImpactPct < 0 ? "text-[var(--color-sell)]" : "text-[var(--color-buy)]"
                  }`}
                >
                  {formatPercent(s.estimatedImpactPct)} ·{" "}
                  {formatMoney(Math.round((ctx.portfolio.capitalUsdMinor / 100) * s.estimatedImpactPct * 100), "USD")}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-faint)]">
                Assumptions:{" "}
                {Object.entries(s.assumptions)
                  .map(([k, v]) => `${k} ${typeof v === "number" && Math.abs(v) < 5 ? formatPercent(v) : v}`)
                  .join(" · ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.byAsset.slice(0, 5).map((b) => (
                  <span
                    key={b.ticker}
                    className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]"
                  >
                    {b.ticker} {formatPercent(b.contributionPct)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-faint)]">
          These are simplified sensitivity estimates applied instantaneously with fixed factor
          betas. Real outcomes depend on path, correlation shifts, and liquidity. The what-if tool
          (Phase 9) lets you define custom scenarios.
        </p>
      </Card>
    </div>
  );
}
