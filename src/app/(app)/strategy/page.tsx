import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card, Badge, Empty, EpistemicLine, DemoBadge } from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/money";
import { REGIME_LABELS, SLEEVE_LABELS, type Regime, type Sleeve } from "@/lib/enums";

export default async function StrategyPage() {
  const { ctx } = await pageContext();
  const s = await getLatestStrategy(ctx.portfolio.id);
  if (!s) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold">Strategy</h1>
        <Empty>No strategy generated yet.</Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Strategy v{s.version}</h1>
        <span className="text-xs text-[var(--color-muted)]">
          Week of {s.weekOf.toISOString().slice(0, 10)} · <DemoBadge />
        </span>
      </div>

      <Card title="Market regime" right={<Badge tone="accent">{REGIME_LABELS[s.regime.regime as Regime]}</Badge>}>
        <p className="text-xs text-[var(--color-muted)]">
          Composite score {s.regime.score.toFixed(2)} (−2 … +2). Why this regime:
        </p>
        <ul className="mt-3 space-y-2">
          {s.regimeDrivers.map((d, i) => (
            <li key={i} className="text-sm">
              <span className="tnum text-[var(--color-fg)]">{d.indicator}</span>{" "}
              <span className="tnum text-[var(--color-faint)]">
                (vote {d.vote > 0 ? "+" : ""}
                {d.vote})
              </span>
              <span className="ml-2 text-[var(--color-muted)]">{d.rationale}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Asset allocation" subtitle="Sleeve targets — total always 100%">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <th className="pb-2">Sleeve</th>
              <th className="pb-2 text-right">Allocation</th>
              <th className="pb-2 text-right">USD</th>
            </tr>
          </thead>
          <tbody>
            {s.allocation.map((a) => (
              <tr key={a.sleeve} className="border-t border-[var(--color-border)]">
                <td className="py-2">{SLEEVE_LABELS[a.sleeve as Sleeve]}</td>
                <td className="py-2 text-right tnum">{formatPercent(a.weight)}</td>
                <td className="py-2 text-right tnum">{formatMoney(a.usdMinor, "USD")}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--color-border)] font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tnum">
                {formatPercent(s.allocation.reduce((x, a) => x + a.weight, 0))}
              </td>
              <td className="py-2 text-right tnum">
                {formatMoney(s.allocation.reduce((x, a) => x + a.usdMinor, 0), "USD")}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Strategy note">
        <div className="space-y-2 whitespace-pre-wrap text-sm text-[var(--color-muted)]">
          {s.narrativeMd}
        </div>
        <div className="mt-4 space-y-1.5">
          <EpistemicLine kind="DATA">
            Sleeve targets are computed by the deterministic allocation matrix for risk{" "}
            {ctx.riskProfile.riskScore}/5, adjusted for the current market regime.
          </EpistemicLine>
          <EpistemicLine kind="AI_ASSESSMENT">
            Security-level selection and per-position recommendations are added by the scoring
            and AI-reasoning layers (Phases 3–5).
          </EpistemicLine>
        </div>
      </Card>
    </div>
  );
}
