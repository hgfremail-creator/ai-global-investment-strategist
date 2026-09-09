import { pageContext } from "@/services/page";
import { prisma } from "@/lib/db";
import { Card, Empty, DemoBadge, Badge } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { RunButton } from "./RunButton";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewPage() {
  const { ctx } = await pageContext();

  const sv = await prisma.strategyVersion.findFirst({
    where: { portfolioId: ctx.portfolio.id },
    orderBy: { version: "desc" },
    include: { researchReport: true, changes: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Weekly Review</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {sv ? `Latest: Strategy v${sv.version}, week of ${sv.weekOf.toISOString().slice(0, 10)}` : "No review yet"}
          </p>
        </div>
        <DemoBadge />
      </div>

      <Card>
        <RunButton />
        <p className="mt-2 text-[11px] text-[var(--color-faint)]">
          Runs the full pipeline: refresh data → recompute scores, regime, allocation, risk →
          diff against the previous version → explain every change → store a new immutable version.
          The scheduled path is <span className="tnum">POST /api/cron/weekly-review</span> (bearer secret).
        </p>
      </Card>

      {sv && sv.changes.length > 0 && (
        <Card title="Changes this week" right={<Badge tone="accent">{sv.changes.length}</Badge>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  <th className="pb-2">Security / Sleeve</th>
                  <th className="pb-2 text-right">Prev</th>
                  <th className="pb-2 text-right">New</th>
                  <th className="pb-2 text-right">Δ</th>
                  <th className="pb-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {sv.changes.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 font-medium">
                      {c.label}{" "}
                      <span className="text-[10px] text-[var(--color-faint)]">{c.kind.toLowerCase()}</span>
                    </td>
                    <td className="py-1.5 text-right tnum">{c.previousValue}</td>
                    <td className="py-1.5 text-right tnum">{c.newValue}</td>
                    <td className="py-1.5 text-right tnum">{c.deltaText}</td>
                    <td className="py-1.5 text-xs text-[var(--color-muted)]">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {sv?.researchReport ? (
        <Card>
          <Markdown>{sv.researchReport.markdown}</Markdown>
        </Card>
      ) : (
        <Card>
          <Empty>
            No weekly report yet. Click &ldquo;Run weekly review now&rdquo; to generate the first one
            (the full week-over-week report with executive summary, regime, macro, allocation,
            opportunities, reductions, defensives, gold, bonds, currency, risks, changes and sources).
          </Empty>
        </Card>
      )}
    </div>
  );
}
