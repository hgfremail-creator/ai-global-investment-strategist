import { describe, expect, it } from "vitest";
import { computePerformance, type VersionPeriod, type PriceLookup } from "@/engine/performance";

const periods: VersionPeriod[] = [
  { version: 1, from: "2026-09-04", to: "2026-09-11", holdings: [{ ticker: "A", weight: 0.6 }, { ticker: "B", weight: 0.4 }] },
  { version: 2, from: "2026-09-11", to: "2026-09-18", holdings: [{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.5 }] },
];

const table: Record<string, { date: string; close: number }[]> = {
  A: [
    { date: "2026-09-04", close: 100 },
    { date: "2026-09-11", close: 110 }, // +10%
    { date: "2026-09-18", close: 104.5 }, // -5%
  ],
  B: [
    { date: "2026-09-04", close: 100 },
    { date: "2026-09-11", close: 100 },
    { date: "2026-09-18", close: 102 }, // +2%
  ],
  MSCI_WORLD: [
    { date: "2026-09-04", close: 4000 },
    { date: "2026-09-11", close: 4040 }, // +1%
    { date: "2026-09-18", close: 4000 }, // -1%
  ],
};

const px: PriceLookup = (ticker, from, to) => {
  const arr = table[ticker];
  if (!arr) return null;
  const start = [...arr].reverse().find((b) => b.date <= from) ?? arr[0];
  const end = [...arr].reverse().find((b) => b.date <= to) ?? arr[arr.length - 1];
  return { start: start.close, end: end.close };
};

describe("performance engine", () => {
  const r = computePerformance(periods, px, "MSCI_WORLD", { equity: 0.6, bond: 0.4 });

  it("chains period returns into a NAV series indexed to 100", () => {
    expect(r.series[0].portfolio).toBe(100);
    // period 1: 0.6*10% + 0.4*0% = 6%
    expect(r.series[1].portfolio).toBeCloseTo(106, 1);
    // period 2: 0.5*-5% + 0.5*2% = -1.5% => 106 * 0.985
    expect(r.series[2].portfolio).toBeCloseTo(104.41, 1);
  });

  it("computes total return vs benchmark", () => {
    expect(r.totalReturn).toBeCloseTo(0.0441, 3);
    expect(r.benchmarkTotalReturn).toBeCloseTo(-0.0001, 3); // +1% then -1%
    expect(r.periods).toHaveLength(2);
  });

  it("reports the last-week return and a non-positive max drawdown", () => {
    expect(r.weekReturn).toBeCloseTo(-0.015, 3);
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
  });

  it("treats missing price data as flat (no crash)", () => {
    const r2 = computePerformance(
      [{ version: 1, from: "2026-09-04", to: "2026-09-11", holdings: [{ ticker: "MISSING", weight: 1 }] }],
      px,
      "MSCI_WORLD",
      { equity: 0.6, bond: 0.4 },
    );
    expect(r2.series[1].portfolio).toBe(100);
  });
});
