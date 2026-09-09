import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext } from "@/services/page";
import { getResearchDetail } from "@/services/research";
import { getRecommendationForTicker } from "@/services/recommendationsRead";
import { Card, Badge, DemoBadge, EpistemicLine } from "@/components/ui";
import { ScoreBreakdown, ScoreDial } from "@/components/ScoreBreakdown";
import { RecommendationCard } from "@/components/RecommendationCard";
import { PriceChart } from "@/components/charts/PriceChart";
import { formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

function fmt(v: number | string | null): string {
  if (v == null) return "n/a";
  if (typeof v === "string") return v;
  return Math.abs(v) < 1 && v !== 0 ? formatPercent(v) : v.toFixed(2);
}

export default async function ResearchDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ctx } = await pageContext();
  const { ticker } = await params;
  const d = await getResearchDetail(decodeURIComponent(ticker));
  if (!d) notFound();
  const rec = await getRecommendationForTicker(ctx.portfolio.id, d.ticker);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/research" className="text-xs text-[var(--color-accent)] hover:underline">
        ← All research
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {d.ticker} <span className="text-[var(--color-muted)]">{d.name}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <Badge>{d.country}</Badge>
            <Badge>{d.sector}</Badge>
            <span>{d.industry}</span>
            <span>· {d.currency}</span>
            {d.isDemo && <DemoBadge />}
          </div>
        </div>
        {d.score && <ScoreDial value={d.score.overall} />}
      </div>

      {rec && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">
            {rec.targetWeight > 0 ? "Current recommendation" : "Why this is not in the portfolio"}
          </h2>
          <RecommendationCard r={rec} showLink={false} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Price" subtitle={d.score ? `as of ${d.score.asOf}` : undefined}>
          <PriceChart data={d.priceBars} />
          {d.score && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              {[
                ["1M", d.score.raw.mom1m],
                ["3M", d.score.raw.mom3m],
                ["6M", d.score.raw.mom6m],
                ["12M", d.score.raw.mom12m],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="text-[var(--color-faint)]">{k}</div>
                  <div
                    className={`tnum ${
                      (v as number) > 0
                        ? "text-[var(--color-buy)]"
                        : (v as number) < 0
                          ? "text-[var(--color-sell)]"
                          : ""
                    }`}
                  >
                    {v == null ? "—" : formatPercent(v as number)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Score breakdown" subtitle="Each component 0–100 · contribution shown in points">
          {d.score ? (
            <ScoreBreakdown
              components={d.score.components}
              contributions={d.score.contributions}
              weights={d.score.weights}
              notes={d.score.notes}
            />
          ) : (
            <p className="text-sm text-[var(--color-muted)]">Not yet scored.</p>
          )}
        </Card>
      </div>

      {d.score && (
        <Card title="AI exposure assessment">
          <div className="mb-2 flex items-center gap-2">
            <span className="tnum text-2xl font-bold text-[var(--color-accent)]">
              {d.score.components.aiExposure.toFixed(0)}
            </span>
            <span className="text-sm text-[var(--color-muted)]">/100</span>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-muted)]">
            {d.score.raw.aiDrivers.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>
      )}

      {d.fundamentals && (
        <Card
          title="Fundamentals"
          subtitle={
            d.fundamentalsSource
              ? `${d.fundamentalsSource.publisher} · ${d.fundamentalsSource.freshness}`
              : undefined
          }
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
            {Object.entries(d.fundamentals).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[var(--color-border)] py-1">
                <span className="text-[var(--color-muted)]">{k}</span>
                <span className="tnum">{fmt(v)}</span>
              </div>
            ))}
          </div>
          {d.fundamentalsSource && (
            <p className="mt-3 text-[11px] text-[var(--color-faint)]">
              Source: {d.fundamentalsSource.title}
              {d.fundamentalsSource.url && (
                <>
                  {" "}
                  · <a href={d.fundamentalsSource.url} className="text-[var(--color-accent)]">link</a>
                </>
              )}
            </p>
          )}
        </Card>
      )}

      {d.news.length > 0 && (
        <Card title="Recent news">
          <ul className="space-y-2.5">
            {d.news.map((n, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[var(--color-fg)]">
                    {n.url ? (
                      <a href={n.url} className="hover:text-[var(--color-accent)]">
                        {n.title}
                      </a>
                    ) : (
                      n.title
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--color-faint)]">
                    {n.publisher} · {n.publishedAt}
                  </span>
                </div>
                {n.summary && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{n.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.score && (
        <Card>
          <div className="space-y-1.5">
            <EpistemicLine kind="DATA">
              Component scores are computed deterministically from prices and fundamentals as of{" "}
              {d.score.asOf}.
            </EpistemicLine>
            <EpistemicLine kind="INTERPRETATION">
              {d.score.notes.valuation}. {d.score.notes.risk}.
            </EpistemicLine>
            <EpistemicLine kind="AI_ASSESSMENT">
              A full investment thesis, catalysts, risks and a devil&apos;s-advocate pass are
              generated for portfolio candidates in Phase 5.
            </EpistemicLine>
          </div>
        </Card>
      )}
    </div>
  );
}
