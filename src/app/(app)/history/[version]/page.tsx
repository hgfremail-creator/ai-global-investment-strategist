import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext } from "@/services/page";
import { getStrategyVersion } from "@/services/strategyRead";
import { prisma } from "@/lib/db";
import { Card, Badge, Empty } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { REGIME_LABELS, SLEEVE_LABELS, type Regime, type Sleeve } from "@/lib/enums";
import { formatMoney, formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HistoricalVersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { ctx } = await pageContext();
  const { version } = await params;
  const n = Number(version);
  if (!Number.isFinite(n)) notFound();

  const sv = await getStrategyVersion(ctx.portfolio.id, n);
  if (!sv) notFound();

  const report = await prisma.researchReport.findUnique({ where: { strategyVersionId: sv.id } });
  const isLatest = !(await prisma.strategyVersion.findFirst({
    where: { portfolioId: ctx.portfolio.id, version: { gt: n } },
    select: { id: true },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/history" className="text-xs text-[var(--color-accent)] hover:underline">
        ← History
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Strategy v{sv.version}</h1>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>Week of {sv.weekOf.toISOString().slice(0, 10)}</span>
          <Badge tone="accent">{REGIME_LABELS[sv.regime.regime as Regime]}</Badge>
          {isLatest ? <Badge tone="buy">current</Badge> : <Badge tone="neutral">historical — immutable</Badge>}
          {n > 1 && (
            <Link href={`/history/compare?a=${n - 1}&b=${n}`} className="text-[var(--color-accent)] hover:underline">
              vs v{n - 1}
            </Link>
          )}
        </div>
      </div>

      <Card title="Sleeve targets">
        <table className="w-full text-sm">
          <tbody>
            {(Object.entries(sv.sleeveTargets) as [Sleeve, number][])
              .filter(([, w]) => w > 0.001)
              .sort((a, b) => b[1] - a[1])
              .map(([s, w]) => (
                <tr key={s} className="border-t border-[var(--color-border)] first:border-t-0">
                  <td className="py-1.5">{SLEEVE_LABELS[s]}</td>
                  <td className="py-1.5 text-right tnum">{formatPercent(w)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <Card title="Holdings" subtitle={`${sv.allocation.length} positions`}>
        <table className="w-full text-sm">
          <tbody>
            {sv.allocation
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((r) => (
                <tr key={r.ticker} className="border-t border-[var(--color-border)] first:border-t-0">
                  <td className="py-1.5">
                    <Link href={`/research/${encodeURIComponent(r.ticker)}`} className="font-medium hover:text-[var(--color-accent)]">
                      {r.ticker}
                    </Link>{" "}
                    <span className="text-[var(--color-muted)]">{r.name}</span>
                  </td>
                  <td className="py-1.5 text-right tnum">{formatPercent(r.weight)}</td>
                  <td className="py-1.5 text-right tnum text-[var(--color-muted)]">
                    {formatMoney(r.usdMinor, "USD")}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {sv.changes.length > 0 && (
        <Card title="Changes recorded at this version">
          <ul className="space-y-2 text-sm">
            {sv.changes.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.label}</span>{" "}
                <span className="tnum text-[var(--color-muted)]">
                  {c.previousValue} → {c.newValue}
                </span>
                <p className="mt-0.5 text-xs text-[var(--color-faint)]">{c.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report ? (
        <Card title="Weekly report (as generated)">
          <Markdown>{report.markdown}</Markdown>
        </Card>
      ) : (
        <Card><Empty>No report stored for this version.</Empty></Card>
      )}
    </div>
  );
}
