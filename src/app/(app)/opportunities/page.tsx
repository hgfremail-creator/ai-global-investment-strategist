import { pageContext } from "@/services/page";
import { getRecommendationsForLatest } from "@/services/recommendationsRead";
import { Card, Badge, Empty, DemoBadge } from "@/components/ui";
import { RecommendationCard } from "@/components/RecommendationCard";
import { ACTION_META } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const { ctx } = await pageContext();
  const recs = await getRecommendationsForLatest(ctx.portfolio.id);

  if (!recs) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold">Opportunities</h1>
        <Empty>No strategy / recommendations yet.</Empty>
      </div>
    );
  }

  const buys = recs.held.filter((r) => r.action === "STRONG_BUY" || r.action === "BUY");
  const holds = recs.held.filter((r) => r.action === "HOLD" || r.action === "NO_ACTION");
  const trims = recs.held.filter((r) => r.action === "REDUCE" || r.action === "SELL");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Opportunities</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Best current risk/reward from Strategy v{recs.version}. Every idea shows its thesis,
            catalysts, risks and what would invalidate it.
          </p>
        </div>
        {recs.usedFallback ? (
          <Badge tone="warn">Explanations: deterministic (no LLM key)</Badge>
        ) : (
          <Badge tone="accent">Explanations: AI reasoning layer</Badge>
        )}
      </div>

      {buys.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">
            {ACTION_META.BUY.icon} Buy / add ({buys.length})
          </h2>
          {buys.map((r) => <RecommendationCard key={r.id} r={r} />)}
        </section>
      )}

      {trims.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">{ACTION_META.REDUCE.icon} Reduce / sell ({trims.length})</h2>
          {trims.map((r) => <RecommendationCard key={r.id} r={r} />)}
        </section>
      )}

      {holds.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">{ACTION_META.HOLD.icon} Hold ({holds.length})</h2>
          {holds.map((r) => <RecommendationCard key={r.id} r={r} />)}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">⚪ Why not these? — rejected candidates</h2>
        <p className="text-xs text-[var(--color-muted)]">
          High-scoring names that were <em>not</em> added — so the strategy isn&apos;t just a list of
          fashionable stocks.
        </p>
        {recs.rejected.length === 0 ? (
          <Empty>No notable rejections this cycle.</Empty>
        ) : (
          recs.rejected.map((r) => (
            <Card key={r.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.ticker}</span>
                <span className="text-sm text-[var(--color-muted)]">{r.name}</span>
                <Badge tone="watch">WATCH</Badge>
                {r.usedFallback && <span className="text-[11px] text-[var(--color-faint)]">deterministic</span>}
              </div>
              <div className="whitespace-pre-wrap text-sm text-[var(--color-muted)]">{r.thesisMd}</div>
              {r.invalidation.length > 0 && (
                <div className="text-xs text-[var(--color-muted)]">
                  <span className="font-semibold">What would change our mind:</span>
                  <ul className="mt-1 list-disc pl-5">
                    {r.invalidation.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          ))
        )}
      </section>

      {recs.usedFallback && (
        <p className="text-[11px] text-[var(--color-faint)]">
          <DemoBadge /> Explanations were generated deterministically from the scoring model.
          Set <span className="tnum">ANTHROPIC_API_KEY</span> to enable the LLM reasoning layer.
        </p>
      )}
    </div>
  );
}
