import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className={cx("card p-4 sm:p-5", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-wide text-[var(--color-fg)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "neutral";
}) {
  const toneColor =
    tone === "up"
      ? "text-[var(--color-buy)]"
      : tone === "down"
        ? "text-[var(--color-sell)]"
        : "text-[var(--color-fg)]";
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </div>
      <div className={cx("tnum mt-1 text-xl font-semibold", toneColor)}>{value}</div>
      {sub && <div className="tnum mt-0.5 text-xs text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "accent"
    | "buy"
    | "buy-strong"
    | "hold"
    | "reduce"
    | "sell"
    | "watch"
    | "gold"
    | "warn";
}) {
  const map: Record<string, string> = {
    neutral: "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]",
    accent: "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/30",
    buy: "bg-[var(--color-buy)]/15 text-[var(--color-buy)] border-[var(--color-buy)]/30",
    "buy-strong": "bg-[var(--color-buy-strong)]/20 text-[var(--color-buy)] border-[var(--color-buy)]/40",
    hold: "bg-[var(--color-hold)]/15 text-[var(--color-hold)] border-[var(--color-hold)]/30",
    reduce: "bg-[var(--color-reduce)]/15 text-[var(--color-reduce)] border-[var(--color-reduce)]/30",
    sell: "bg-[var(--color-sell)]/15 text-[var(--color-sell)] border-[var(--color-sell)]/30",
    watch: "bg-[var(--color-watch)]/15 text-[var(--color-watch)] border-[var(--color-watch)]/30",
    gold: "bg-[var(--color-gold)]/15 text-[var(--color-gold)] border-[var(--color-gold)]/30",
    warn: "bg-[var(--color-reduce)]/15 text-[var(--color-reduce)] border-[var(--color-reduce)]/40",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}

/** FACT / DATA / INTERPRETATION / AI ASSESSMENT / FORECAST / UNCERTAINTY tagging. */
export type EpistemicKind =
  | "FACT"
  | "DATA"
  | "INTERPRETATION"
  | "AI_ASSESSMENT"
  | "FORECAST"
  | "UNCERTAINTY";

const EPI_META: Record<EpistemicKind, { label: string; cls: string }> = {
  FACT: { label: "FACT", cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" },
  DATA: { label: "DATA", cls: "border-sky-500/40 text-sky-400 bg-sky-500/10" },
  INTERPRETATION: {
    label: "ANALYST INTERPRETATION",
    cls: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  },
  AI_ASSESSMENT: {
    label: "AI ASSESSMENT",
    cls: "border-violet-500/40 text-violet-400 bg-violet-500/10",
  },
  FORECAST: { label: "FORECAST", cls: "border-orange-500/40 text-orange-400 bg-orange-500/10" },
  UNCERTAINTY: {
    label: "UNCERTAINTY",
    cls: "border-rose-500/40 text-rose-400 bg-rose-500/10",
  },
};

export function EpistemicTag({ kind }: { kind: EpistemicKind }) {
  const m = EPI_META[kind];
  return (
    <span
      className={cx(
        "inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

export function EpistemicLine({
  kind,
  children,
}: {
  kind: EpistemicKind;
  children: ReactNode;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-2 text-sm leading-relaxed text-[var(--color-fg)]">
      <EpistemicTag kind={kind} />
      <span className="text-[var(--color-muted)]">{children}</span>
    </p>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-400">
      ⚠ SIMULATED DATA
    </span>
  );
}

export function Progress({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
      <div
        className="h-full rounded-full bg-[var(--color-accent)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
      {children}
    </div>
  );
}
