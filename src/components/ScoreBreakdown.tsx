import { cx } from "@/components/ui";

const LABELS: Record<string, string> = {
  businessQuality: "Business quality",
  growth: "Growth",
  valuation: "Valuation",
  earningsMomentum: "Earnings momentum",
  marketMomentum: "Market momentum",
  aiExposure: "AI exposure",
  balanceSheet: "Balance sheet",
  risk: "Risk (higher = safer)",
};

export function scoreTone(v: number): string {
  if (v >= 70) return "text-[var(--color-buy)]";
  if (v >= 50) return "text-[var(--color-hold)]";
  if (v >= 35) return "text-[var(--color-reduce)]";
  return "text-[var(--color-sell)]";
}

export function ScoreDial({ value }: { value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={cx("tnum text-3xl font-bold", scoreTone(value))}>{value.toFixed(0)}</span>
      <span className="text-sm text-[var(--color-muted)]">/100</span>
    </div>
  );
}

export function ScoreBreakdown({
  components,
  contributions,
  weights,
  notes,
}: {
  components: Record<string, number>;
  contributions?: Record<string, number>;
  weights?: Record<string, number>;
  notes?: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      {Object.keys(LABELS).map((k) => {
        const v = components[k] ?? 0;
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-fg)]">
                {LABELS[k]}
                {weights?.[k] != null && (
                  <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">
                    weight {(weights[k] * 100).toFixed(0)}%
                  </span>
                )}
              </span>
              <span className="tnum">
                <span className={scoreTone(v)}>{v.toFixed(0)}</span>
                {contributions?.[k] != null && (
                  <span className="ml-2 text-[11px] text-[var(--color-faint)]">
                    +{contributions[k].toFixed(1)} pts
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
              />
            </div>
            {notes?.[k] && (
              <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted)]">{notes[k]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
