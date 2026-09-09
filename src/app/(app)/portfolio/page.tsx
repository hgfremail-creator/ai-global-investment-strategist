import Link from "next/link";
import { pageContext } from "@/services/page";
import { prisma } from "@/lib/db";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card, Empty, DemoBadge, Badge } from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const { ctx } = await pageContext();
  const [positions, strategy] = await Promise.all([
    prisma.portfolioPosition.findMany({
      where: { portfolioId: ctx.portfolio.id },
      include: { security: true },
    }),
    getLatestStrategy(ctx.portfolio.id),
  ]);

  const recon = strategy?.factorExposure.reconciliation ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <DemoBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Invested capital</div>
          <div className="tnum mt-1 text-2xl font-semibold">
            {formatMoney(ctx.portfolio.capitalUsdMinor, "USD")}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Target positions</div>
          <div className="tnum mt-1 text-2xl font-semibold">{strategy?.allocation.length ?? 0}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Your existing holdings</div>
          <div className="tnum mt-1 text-2xl font-semibold">{positions.length}</div>
        </Card>
      </div>

      {strategy && (
        <Card title="Target portfolio" subtitle={`Strategy v${strategy.version}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  <th className="pb-2">Security</th>
                  <th className="pb-2">Sleeve</th>
                  <th className="pb-2 text-right">Weight</th>
                  <th className="pb-2 text-right">USD</th>
                </tr>
              </thead>
              <tbody>
                {strategy.allocation
                  .slice()
                  .sort((a, b) => b.weight - a.weight)
                  .map((r) => (
                    <tr key={r.ticker} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5">
                        <Link href={`/research/${encodeURIComponent(r.ticker)}`} className="font-medium hover:text-[var(--color-accent)]">
                          {r.ticker}
                        </Link>
                        <span className="ml-2 text-[var(--color-muted)]">{r.name}</span>
                      </td>
                      <td className="py-1.5 text-[var(--color-muted)]">{r.sleeve}</td>
                      <td className="py-1.5 text-right tnum">{formatPercent(r.weight)}</td>
                      <td className="py-1.5 text-right tnum text-[var(--color-muted)]">
                        {formatMoney(r.usdMinor, "USD")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Your existing holdings vs the target" subtitle="Recommendations take current exposure into account">
        {positions.length === 0 ? (
          <Empty>No existing holdings recorded during onboarding.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                <th className="pb-2">Ticker</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Avg price</th>
                <th className="pb-2 text-right">Current wt.</th>
                <th className="pb-2 text-right">Target wt.</th>
                <th className="pb-2">Assessment</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const r = recon.find((x) => x.ticker === p.security.ticker);
                return (
                  <tr key={p.id} className="border-t border-[var(--color-border)]">
                    <td className="py-2 font-medium">{p.security.ticker}</td>
                    <td className="py-2 text-right tnum">{p.quantity}</td>
                    <td className="py-2 text-right tnum">
                      {(p.avgPriceMinor / 100).toLocaleString("en-US")} {p.security.currency}
                    </td>
                    <td className="py-2 text-right tnum">
                      {r ? formatPercent(r.existingWeight) : "—"}
                    </td>
                    <td className="py-2 text-right tnum">
                      {r ? formatPercent(r.targetWeight) : "—"}
                    </td>
                    <td className="py-2 text-xs text-[var(--color-muted)]">{r?.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Paper trading">
        <p className="text-sm text-[var(--color-muted)]">
          Simulated buy / sell / rebalance against the target portfolio, plus hypothetical
          performance tracking, is delivered in Phase 9. Nothing here places real orders.
        </p>
        <div className="mt-2">
          <Badge tone="neutral">Coming: Phase 9</Badge>
        </div>
      </Card>
    </div>
  );
}
