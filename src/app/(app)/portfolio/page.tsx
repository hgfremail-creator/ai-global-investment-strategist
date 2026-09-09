import { pageContext } from "@/services/page";
import { prisma } from "@/lib/db";
import { Card, Empty, DemoBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export default async function PortfolioPage() {
  const { ctx } = await pageContext();
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId: ctx.portfolio.id },
    include: { security: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <DemoBadge />
      </div>

      <Card title="Invested capital">
        <div className="tnum text-2xl font-semibold">
          {formatMoney(ctx.portfolio.capitalUsdMinor, "USD")}
        </div>
      </Card>

      <Card title="Your existing holdings" subtitle="Entered during onboarding — factored into recommendations">
        {positions.length === 0 ? (
          <Empty>No existing holdings recorded.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <th className="pb-2">Ticker</th>
                <th className="pb-2">Name</th>
                <th className="pb-2 text-right">Quantity</th>
                <th className="pb-2 text-right">Avg price</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-t border-[var(--color-border)]">
                  <td className="py-2 font-medium">{p.security.ticker}</td>
                  <td className="py-2 text-[var(--color-muted)]">{p.security.name}</td>
                  <td className="py-2 text-right tnum">{p.quantity}</td>
                  <td className="py-2 text-right tnum">
                    {(p.avgPriceMinor / 100).toLocaleString("en-US")} {p.security.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Paper trading & target holdings">
        <p className="text-sm text-[var(--color-muted)]">
          Simulated buy / sell / rebalance and security-level target holdings are delivered in
          Phases 4 &amp; 9. Current strategy shows sleeve-level targets on the{" "}
          <span className="text-[var(--color-fg)]">Strategy</span> page.
        </p>
      </Card>
    </div>
  );
}
