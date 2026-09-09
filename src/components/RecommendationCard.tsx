import Link from "next/link";
import { Card, Badge, EpistemicLine, DemoBadge } from "@/components/ui";
import { ACTION_META, type Action } from "@/lib/enums";
import { formatMoney, formatPercent } from "@/lib/money";
import type { RecView } from "@/services/recommendationsRead";

function List({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${tone === "risk" ? "text-[var(--color-reduce)]" : "text-[var(--color-muted)]"}`}>
        {title}
      </h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--color-muted)]">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

export function RecommendationCard({ r, showLink = true }: { r: RecView; showLink?: boolean }) {
  const meta = ACTION_META[r.action as Action] ?? ACTION_META.WATCH;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {showLink ? (
              <Link href={`/research/${encodeURIComponent(r.ticker)}`} className="text-base font-semibold hover:text-[var(--color-accent)]">
                {r.ticker}
              </Link>
            ) : (
              <span className="text-base font-semibold">{r.ticker}</span>
            )}
            <span className="text-sm text-[var(--color-muted)]">{r.name}</span>
            <Badge tone={meta.tone as "buy"}>{meta.icon} {meta.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-faint)]">
            <span>{r.country} · {r.sector}</span>
            <span>· {r.timeHorizon.toLowerCase()} term</span>
            <span>· valuation: {r.valuationView.toLowerCase()}</span>
            {r.usedFallback && <span className="text-[var(--color-reduce)]">· generated without LLM (deterministic)</span>}
          </div>
        </div>
        {r.targetWeight > 0 && (
          <div className="text-right">
            <div className="tnum text-lg font-semibold">{formatPercent(r.targetWeight)}</div>
            <div className="tnum text-[11px] text-[var(--color-faint)]">{formatMoney(r.targetUsdMinor, "USD")}</div>
          </div>
        )}
      </div>

      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-[var(--color-muted)]">Conviction </span>
          <span className="tnum font-semibold">{r.conviction}/100</span>
        </div>
        <div>
          <span className="text-[var(--color-muted)]">Evidence quality </span>
          <span className="tnum font-semibold">{r.evidenceQuality}/100</span>
        </div>
      </div>

      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
        {r.thesisMd}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <List title="Catalysts" items={r.catalysts} />
        <List title="Risks" items={r.risks} tone="risk" />
        <List title="What would prove this wrong" items={r.invalidation} />
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Entry strategy</h4>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{r.entryStrategy}</p>
        </div>
      </div>

      {(r.bullBearBase.bull || r.bullBearBase.bear) && (
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Investment committee
          </h4>
          <dl className="space-y-1.5 text-sm">
            <div><dt className="inline font-medium text-[var(--color-buy)]">Bull: </dt><dd className="inline text-[var(--color-muted)]">{r.bullBearBase.bull}</dd></div>
            <div><dt className="inline font-medium text-[var(--color-hold)]">Base: </dt><dd className="inline text-[var(--color-muted)]">{r.bullBearBase.base}</dd></div>
            <div><dt className="inline font-medium text-[var(--color-sell)]">Bear: </dt><dd className="inline text-[var(--color-muted)]">{r.bullBearBase.bear}</dd></div>
          </dl>
          {r.bullBearBase.keyAssumptions.length > 0 && (
            <div className="mt-2 text-xs text-[var(--color-faint)]">
              Key assumptions: {r.bullBearBase.keyAssumptions.join(" · ")}
            </div>
          )}
        </div>
      )}

      {r.devilsAdvocateMd && (
        <div className="rounded-lg border border-[var(--color-reduce)]/30 bg-[var(--color-reduce)]/5 p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-reduce)]">
            Devil&apos;s advocate
          </h4>
          <div className="whitespace-pre-wrap text-sm text-[var(--color-muted)]">{r.devilsAdvocateMd}</div>
        </div>
      )}

      <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
        {r.fic.facts.map((x, i) => <EpistemicLine key={`f${i}`} kind="FACT">{x}</EpistemicLine>)}
        {r.fic.interpretations.map((x, i) => <EpistemicLine key={`i${i}`} kind="INTERPRETATION">{x}</EpistemicLine>)}
        <EpistemicLine kind="AI_ASSESSMENT">{r.fic.aiConclusion}</EpistemicLine>
      </div>

      {r.sources.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-3 text-[11px] text-[var(--color-faint)]">
          <span className="font-semibold">Sources:</span>{" "}
          {r.sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " · "}
              {s.url ? <a href={s.url} className="text-[var(--color-accent)]">{s.publisher}</a> : s.publisher}
              {" "}({s.type.toLowerCase()}{s.publishedAt ? `, ${s.publishedAt}` : ""}{s.freshness ? `, ${s.freshness.toLowerCase()}` : ""})
              {s.isDemo && " ⚠"}
            </span>
          ))}
          {r.sources.some((s) => s.isDemo) && <span className="ml-1"><DemoBadge /></span>}
        </div>
      )}
    </Card>
  );
}
