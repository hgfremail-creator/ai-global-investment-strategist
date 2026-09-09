import { pageContext } from "@/services/page";
import { getStrategyHistory } from "@/services/strategyRead";
import { Card, Badge, Empty } from "@/components/ui";
import { REGIME_LABELS, type Regime } from "@/lib/enums";

export default async function HistoryPage() {
  const { ctx } = await pageContext();
  const versions = await getStrategyHistory(ctx.portfolio.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold">History</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Every weekly strategy version is stored immutably. Previous versions are never overwritten.
      </p>
      {versions.length === 0 ? (
        <Empty>No versions yet.</Empty>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <Card key={v.id}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Strategy v{v.version}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    Week of {v.weekOf.toISOString().slice(0, 10)} · created{" "}
                    {v.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{REGIME_LABELS[v.regime.regime as Regime]}</Badge>
                  <span className="text-xs text-[var(--color-muted)]">
                    {v._count.recommendations} recs · {v._count.changes} changes
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--color-faint)]">
        Side-by-side version comparison is delivered in Phase 8.
      </p>
    </div>
  );
}
