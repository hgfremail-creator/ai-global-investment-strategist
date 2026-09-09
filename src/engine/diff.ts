// Pure strategy-version diff. No I/O. Tested in src/test/diff.test.ts.
import { SLEEVE_LABELS, SLEEVES, type Sleeve } from "@/lib/enums";

export type AllocRowLite = { ticker: string; name?: string; sleeve?: string; weight: number };

export type ChangeRecord = {
  kind: "SLEEVE" | "POSITION";
  label: string;
  previousValue: string | null;
  newValue: string | null;
  deltaText: string | null;
  reason: string;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function computeChanges(
  prevAlloc: AllocRowLite[],
  newAlloc: AllocRowLite[],
  prevSleeves: Record<string, number>,
  newSleeves: Record<string, number>,
  threshold = 0.007,
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  for (const s of SLEEVES) {
    const p = prevSleeves[s] ?? 0;
    const n = newSleeves[s] ?? 0;
    if (Math.abs(n - p) >= threshold) {
      changes.push({
        kind: "SLEEVE",
        label: SLEEVE_LABELS[s as Sleeve],
        previousValue: pct(p),
        newValue: pct(n),
        deltaText: `${n > p ? "+" : ""}${pct(n - p)}`,
        reason: n > p ? "Increased on regime / macro signals favouring this sleeve." : "Reduced on regime / macro signals.",
      });
    }
  }

  const prevByT = new Map(prevAlloc.map((r) => [r.ticker, r.weight]));
  const newByT = new Map(newAlloc.map((r) => [r.ticker, r.weight]));

  for (const r of newAlloc) {
    const p = prevByT.get(r.ticker);
    if (p == null) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: "0%",
        newValue: pct(r.weight), deltaText: `+${pct(r.weight)}`,
        reason: "New position — entered the portfolio on an improved relative score / sleeve fit.",
      });
    } else if (Math.abs(r.weight - p) >= threshold) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: pct(p),
        newValue: pct(r.weight), deltaText: `${r.weight > p ? "+" : ""}${pct(r.weight - p)}`,
        reason: r.weight > p ? "Weight increased on relative score / momentum improvement." : "Weight trimmed on relative score / constraint pressure.",
      });
    }
  }
  for (const r of prevAlloc) {
    if (!newByT.has(r.ticker)) {
      changes.push({
        kind: "POSITION", label: r.ticker, previousValue: pct(r.weight),
        newValue: "0%", deltaText: `-${pct(r.weight)}`,
        reason: "Exited — fell below the minimum score / displaced by a higher-ranked name.",
      });
    }
  }

  return changes;
}
