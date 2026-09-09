import Link from "next/link";
import { pageContext } from "@/services/page";
import { getStrategyHistory, getSleeveHistory } from "@/services/strategyRead";
import { Card, Badge, Empty, DemoBadge } from "@/components/ui";
import { SleeveHistoryChart } from "@/components/charts/SleeveHistoryChart";
import { CompareSelector } from "./CompareSelector";
import { REGIME_LABELS, type Regime } from "@/lib/enums";
import { formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { ctx } = await pageContext();
  const [versions, sleeveHistory] = await Promise.all([
    getStrategyHistory(ctx.portfolio.id),
    getSleeveHistory(ctx.portfolio.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">History</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Every weekly strategy version is stored immutably and never overwritten.
          </p>
        </div>
        <DemoBadge />
      </div>

      {versions.length === 0 ? (
        <Empty>No versions yet.</Empty>
      ) : (
        <>
          {sleeveHistory.length >= 2 && (
            <Card title="Sleeve allocation over time">
              <SleeveHistoryChart data={sleeveHistory} />
            </Card>
          )}

          {versions.length >= 2 && (
            <Card title="Compare two versions">
              <CompareSelector versions={versions.map((v) => v.version)} />
            </Card>
          )}

          <div className="space-y-3">
            {versions.map((v) => (
              <Card key={v.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/history/${v.version}`}
                      className="text-sm font-semibold hover:text-[var(--color-accent)]"
                    >
                      Strategy v{v.version}
                    </Link>
                    <div className="text-xs text-[var(--color-muted)]">
                      Week of {v.weekOf.toISOString().slice(0, 10)} · created{" "}
                      {v.createdAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge tone="accent">{REGIME_LABELS[v.regime.regime as Regime]}</Badge>
                    <span className="text-[var(--color-muted)]">
                      {v._count.recommendations} recs · {v._count.changes} changes
                    </span>
                    {v.version > 1 && (
                      <Link
                        href={`/history/compare?a=${v.version - 1}&b=${v.version}`}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        vs v{v.version - 1}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--color-faint)]">
                  {sleeveHistory
                    .find((s) => s.version === v.version)
                    ?.factor?.aiFactor != null && (
                    <span>
                      AI look-through{" "}
                      {formatPercent(sleeveHistory.find((s) => s.version === v.version)!.factor.aiFactor)}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
