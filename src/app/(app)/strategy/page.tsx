import Link from "next/link";
import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card, Badge, Empty, EpistemicLine, DemoBadge } from "@/components/ui";
import { Donut, LegendList } from "@/components/charts/Donut";
import { ExposureBar } from "@/components/ExposureBar";
import { formatMoney, formatPercent } from "@/lib/money";
import { REGIME_LABELS, SLEEVE_LABELS, type Regime, type Sleeve } from "@/lib/enums";

export const dynamic = "force-dynamic";

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

  const sleeveData = Object.entries(s.sleeveTargets)
    .filter(([, w]) => (w as number) > 0.0005)
    .map(([k, w]) => ({ name: SLEEVE_LABELS[k as Sleeve], value: w as number }));

  const bySleeve = new Map<string, typeof s.allocation>();
  for (const row of s.allocation) {
    if (!bySleeve.has(row.sleeve)) bySleeve.set(row.sleeve, []);
    bySleeve.get(row.sleeve)!.push(row);
  }

  const fe = s.factorExposure;
  const countryData = Object.entries(fe.country).map(([k, v]) => ({ name: k, value: v }));
  const currencyData = Object.entries(fe.currency).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Strategy v{s.version}</h1>
        <span className="text-xs text-[var(--color-muted)]">
          Week of {s.weekOf.toISOString().slice(0, 10)} · <DemoBadge />
        </span>
      </div>

      <Card
        title="Market regime"
        right={<Badge tone="accent">{REGIME_LABELS[s.regime.regime as Regime]}</Badge>}
      >
        <p className="text-xs text-[var(--color-muted)]">
          Composite score {s.regime.score.toFixed(2)} (−2 … +2). Why this regime:
        </p>
        <ul className="mt-3 space-y-1.5">
          {s.regimeDrivers.map((d, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="tnum text-[var(--color-fg)]">{d.indicator}</span>
              <span
                className={`tnum text-xs ${
                  d.vote > 0
                    ? "text-[var(--color-buy)]"
                    : d.vote < 0
                      ? "text-[var(--color-sell)]"
                      : "text-[var(--color-faint)]"
                }`}
              >
                vote {d.vote > 0 ? "+" : ""}
                {d.vote}
              </span>
              <span className="text-[var(--color-muted)]">{d.rationale}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="Sleeve allocation" className="lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Donut data={sleeveData} />
            <div className="self-center">
              <LegendList data={sleeveData} />
            </div>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                <th className="pb-2">Sleeve</th>
                <th className="pb-2 text-right">Target</th>
                <th className="pb-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {sleeveData.map((d) => {
                const usd = s.allocation
                  .filter((r) => SLEEVE_LABELS[r.sleeve] === d.name)
                  .reduce((a, r) => a + r.usdMinor, 0);
                return (
                  <tr key={d.name} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5">{d.name}</td>
                    <td className="py-1.5 text-right tnum">{formatPercent(d.value)}</td>
                    <td className="py-1.5 text-right tnum">{formatMoney(usd, "USD")}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-[var(--color-border)] font-semibold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right tnum">
                  {formatPercent(s.allocation.reduce((a, r) => a + r.weight, 0))}
                </td>
                <td className="py-1.5 text-right tnum">
                  {formatMoney(s.allocation.reduce((a, r) => a + r.usdMinor, 0), "USD")}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Concentration & risk" className="lg:col-span-2">
          <div className="space-y-3">
            <ExposureBar label="Estimated volatility" value={fe.estVol} hint="Diversified estimate (ρ≈0.45 among risk assets)" />
            <ExposureBar
              label="AI-factor look-through"
              value={fe.aiFactor}
              warn={fe.aiFactor > 0.7}
              hint="Economic exposure to the AI-infrastructure theme"
            />
            <ExposureBar label="Semiconductor exposure" value={fe.semiconductor} warn={fe.semiconductor > 0.4} />
            <ExposureBar label="US technology exposure" value={fe.usTech} />
            <ExposureBar label="Defensive exposure" value={fe.defensive} />
          </div>
          {fe.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-md border border-[var(--color-reduce)]/40 bg-[var(--color-reduce)]/10 p-3 text-xs text-[var(--color-reduce)]">
              {fe.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Holdings" subtitle={`${s.allocation.length} positions · target portfolio`}>
        {[...bySleeve.entries()].map(([sleeve, rows]) => (
          <div key={sleeve} className="mb-4 last:mb-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {SLEEVE_LABELS[sleeve as Sleeve]} ·{" "}
              {formatPercent(rows.reduce((a, r) => a + r.weight, 0))}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {rows
                  .sort((a, b) => b.weight - a.weight)
                  .map((r) => (
                    <tr key={r.ticker} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5">
                        <Link
                          href={`/research/${encodeURIComponent(r.ticker)}`}
                          className="font-medium hover:text-[var(--color-accent)]"
                        >
                          {r.ticker}
                        </Link>
                        <span className="ml-2 text-[var(--color-muted)]">{r.name}</span>
                        <span className="ml-1.5 text-[10px] text-[var(--color-faint)]">
                          {r.country} · {r.currency}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tnum text-[var(--color-faint)]">
                        score {r.score.toFixed(0)}
                      </td>
                      <td className="py-1.5 pl-4 text-right tnum">{formatPercent(r.weight)}</td>
                      <td className="py-1.5 pl-4 text-right tnum text-[var(--color-muted)]">
                        {formatMoney(r.usdMinor, "USD")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Country exposure">
          <div className="grid gap-3 sm:grid-cols-2">
            <Donut data={countryData} height={180} />
            <div className="self-center">
              <LegendList data={countryData} />
            </div>
          </div>
        </Card>
        <Card title="Currency exposure" subtitle="Portfolio is constructed in USD">
          <div className="grid gap-3 sm:grid-cols-2">
            <Donut data={currencyData} height={180} />
            <div className="self-center">
              <LegendList data={currencyData} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-faint)]">
            Currency diversification here is a by-product of holding non-US equities and
            EUR/JPY government bonds — it is monitored, not separately hedged.
          </p>
        </Card>
      </div>

      <Card title="Strategy note">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-muted)]">
          {s.narrativeMd}
        </div>
        <div className="mt-4 space-y-1.5">
          <EpistemicLine kind="DATA">
            Sleeve targets come from the risk-{ctx.riskProfile.riskScore}/5 allocation matrix,
            adjusted for the {REGIME_LABELS[s.regime.regime as Regime]} regime and current macro.
          </EpistemicLine>
          <EpistemicLine kind="AI_ASSESSMENT">
            Per-position theses, catalysts, risks, entry strategy and a devil&apos;s-advocate
            review are generated by the AI reasoning layer (Phase 5).
          </EpistemicLine>
        </div>
      </Card>
    </div>
  );
}
