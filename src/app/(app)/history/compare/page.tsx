import Link from "next/link";
import { Suspense } from "react";
import { pageContext } from "@/services/page";
import { getVersionComparison } from "@/services/strategyRead";
import { Card, Badge, Empty } from "@/components/ui";
import { REGIME_LABELS, SLEEVE_LABELS, type Regime, type Sleeve } from "@/lib/enums";
import { formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

function Delta({ v }: { v: number }) {
  if (Math.abs(v) < 0.0005) return <span className="text-[var(--color-faint)]">—</span>;
  return (
    <span className={`tnum ${v > 0 ? "text-[var(--color-buy)]" : "text-[var(--color-sell)]"}`}>
      {v > 0 ? "+" : ""}
      {formatPercent(v)}
    </span>
  );
}

async function CompareBody({ a, b }: { a: number; b: number }) {
  const { ctx } = await pageContext();
  const cmp = await getVersionComparison(ctx.portfolio.id, a, b);
  if (!cmp) {
    return <Empty>One or both versions not found.</Empty>;
  }

  const KIND_TONE: Record<string, "buy" | "sell" | "hold" | "neutral"> = {
    added: "buy",
    removed: "sell",
    reweighted: "hold",
    unchanged: "neutral",
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {[cmp.a, cmp.b].map((s, i) => (
          <Card key={i} title={`Strategy v${s.version}`} subtitle={`Week of ${s.weekOf}`}>
            <Badge tone="accent">{REGIME_LABELS[s.regime as Regime]}</Badge>
            <div className="mt-2 tnum text-sm text-[var(--color-muted)]">
              Regime composite {s.regimeScore.toFixed(2)}
            </div>
          </Card>
        ))}
      </div>

      <Card title="Sleeve allocation change">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              <th className="pb-2">Sleeve</th>
              <th className="pb-2 text-right">v{cmp.a.version}</th>
              <th className="pb-2 text-right">v{cmp.b.version}</th>
              <th className="pb-2 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {cmp.sleeveDeltas.map((d) => (
              <tr key={d.sleeve} className="border-t border-[var(--color-border)]">
                <td className="py-1.5">{SLEEVE_LABELS[d.sleeve as Sleeve]}</td>
                <td className="py-1.5 text-right tnum">{formatPercent(d.a)}</td>
                <td className="py-1.5 text-right tnum">{formatPercent(d.b)}</td>
                <td className="py-1.5 text-right">
                  <Delta v={d.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Position changes">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              <th className="pb-2">Security</th>
              <th className="pb-2 text-right">v{cmp.a.version}</th>
              <th className="pb-2 text-right">v{cmp.b.version}</th>
              <th className="pb-2 text-right">Change</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {cmp.positionDeltas
              .filter((p) => p.kind !== "unchanged")
              .map((p) => (
                <tr key={p.ticker} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5">
                    <span className="font-medium">{p.ticker}</span>{" "}
                    <span className="text-[var(--color-muted)]">{p.name}</span>
                  </td>
                  <td className="py-1.5 text-right tnum">{p.a ? formatPercent(p.a) : "—"}</td>
                  <td className="py-1.5 text-right tnum">{p.b ? formatPercent(p.b) : "—"}</td>
                  <td className="py-1.5 text-right">
                    <Delta v={p.delta} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Badge tone={KIND_TONE[p.kind]}>{p.kind}</Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {cmp.positionDeltas.every((p) => p.kind === "unchanged") && (
          <p className="text-sm text-[var(--color-muted)]">No position changes between these versions.</p>
        )}
      </Card>

      <Card title="Factor exposure change">
        <div className="space-y-2">
          {cmp.factorDeltas.map((f) => (
            <div key={f.key} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">{f.key}</span>
              <span className="tnum">
                {formatPercent(f.a)} → {formatPercent(f.b)} <Delta v={f.delta} />
              </span>
            </div>
          ))}
        </div>
      </Card>

      {cmp.changes.length > 0 && (
        <Card title={`Recorded changes (v${cmp.a.version} → v${cmp.b.version})`}>
          <ul className="space-y-2 text-sm">
            {cmp.changes.map((c, i) => (
              <li key={i}>
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
    </div>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const a = Number(sp.a);
  const b = Number(sp.b);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/history" className="text-xs text-[var(--color-accent)] hover:underline">
        ← History
      </Link>
      <h1 className="text-lg font-semibold">
        Compare v{Number.isFinite(a) ? a : "?"} → v{Number.isFinite(b) ? b : "?"}
      </h1>
      {!Number.isFinite(a) || !Number.isFinite(b) ? (
        <Empty>Pick two versions from the History page.</Empty>
      ) : (
        <Suspense fallback={<Empty>Loading comparison…</Empty>}>
          <CompareBody a={a} b={b} />
        </Suspense>
      )}
    </div>
  );
}
