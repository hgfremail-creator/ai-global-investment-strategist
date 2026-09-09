import { cx } from "@/components/ui";

export function ExposureBar({
  label,
  value,
  warn,
  hint,
}: {
  label: string;
  value: number; // 0..1
  warn?: boolean;
  hint?: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-fg)]">{label}</span>
        <span className={cx("tnum", warn && "text-[var(--color-reduce)]")}>{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className={cx("h-full rounded-full", warn ? "bg-[var(--color-reduce)]" : "bg-[var(--color-accent)]")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
