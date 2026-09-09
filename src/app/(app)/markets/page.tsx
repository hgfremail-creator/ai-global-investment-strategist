import { pageContext } from "@/services/page";
import { getBenchmarkDashboard, getMacroDashboard } from "@/services/marketData";
import { providerStatus } from "@/data/providers";
import { Card, Badge, Empty, DemoBadge } from "@/components/ui";
import { formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

function Ret({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[var(--color-faint)]">—</span>;
  const tone = v > 0 ? "text-[var(--color-buy)]" : v < 0 ? "text-[var(--color-sell)]" : "";
  return (
    <span className={`tnum ${tone}`}>
      {v > 0 ? "+" : ""}
      {formatPercent(v)}
    </span>
  );
}

export default async function MarketsPage() {
  await pageContext();
  const [benchmarks, macro] = await Promise.all([
    getBenchmarkDashboard(),
    getMacroDashboard(),
  ]);
  const status = providerStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Markets</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[var(--color-muted)]">Data:</span>
          {Object.entries(status).map(([k, v]) => (
            <Badge key={k} tone={v.isDemo ? "warn" : "accent"}>
              {k}: {v.isDemo ? "simulated" : v.label}
            </Badge>
          ))}
        </div>
      </div>

      <Card title="Global equity benchmarks" right={benchmarks.some(() => true) ? undefined : undefined}>
        {benchmarks.length === 0 ? (
          <Empty>No benchmark data. Run `npm run db:ingest`.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                  <th className="pb-2">Index</th>
                  <th className="pb-2 text-right">Level</th>
                  <th className="pb-2 text-right">1W</th>
                  <th className="pb-2 text-right">1M</th>
                  <th className="pb-2 text-right">3M</th>
                  <th className="pb-2 text-right">YTD</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr key={b.symbol} className="border-t border-[var(--color-border)]">
                    <td className="py-2">
                      {b.name}
                      <span className="ml-2 text-[11px] text-[var(--color-faint)]">{b.asOf}</span>
                    </td>
                    <td className="py-2 text-right tnum">
                      {b.last.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 text-right"><Ret v={b.ret1w} /></td>
                    <td className="py-2 text-right"><Ret v={b.ret1m} /></td>
                    <td className="py-2 text-right"><Ret v={b.ret3m} /></td>
                    <td className="py-2 text-right"><Ret v={b.retYtd} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {benchmarks.length > 0 && (
          <p className="mt-2 text-[11px] text-[var(--color-faint)]">
            {status.marketData.isDemo && "Simulated index levels — not real market data. "}
            Regime classification from these series arrives in Phase 3.
          </p>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {macro.map((group) => (
          <Card key={group.title} title={group.title}>
            <table className="w-full text-sm">
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.key} className="border-t border-[var(--color-border)] first:border-t-0">
                    <td className="py-1.5 pr-2">
                      {r.label}
                      <span className="ml-1.5 text-[10px] text-[var(--color-faint)]">{r.region}</span>
                    </td>
                    <td className="py-1.5 text-right tnum">
                      {r.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      {r.unit === "%" ? "%" : ""}
                    </td>
                    <td className="w-16 py-1.5 text-right">
                      {r.change1m == null ? (
                        <span className="text-[var(--color-faint)]">—</span>
                      ) : (
                        <span
                          className={`tnum text-xs ${
                            r.change1m > 0
                              ? "text-[var(--color-buy)]"
                              : r.change1m < 0
                                ? "text-[var(--color-sell)]"
                                : ""
                          }`}
                        >
                          {r.change1m > 0 ? "+" : ""}
                          {r.change1m}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <DemoBadge />
          <span>
            1M column is the absolute change over ~30 days. Configure real providers via
            <span className="tnum"> FRED_API_KEY</span>, <span className="tnum">NEWSAPI_KEY</span> and
            a market-data key in <span className="tnum">.env</span>.
          </span>
        </div>
      </Card>
    </div>
  );
}
