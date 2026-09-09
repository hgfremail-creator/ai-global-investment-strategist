import { describe, expect, it } from "vitest";
import {
  DemoMarketDataProvider,
  DemoMacroProvider,
  DEMO_AS_OF,
} from "@/data/providers/demo";
import { SECURITIES } from "@/data/universe";
import { MACRO_KEYS } from "@/data/providers/types";

describe("demo market-data provider", () => {
  it("produces identical price series on repeated calls (deterministic)", async () => {
    const p1 = new DemoMarketDataProvider();
    const p2 = new DemoMarketDataProvider();
    const a = await p1.getPriceSeries(["NVDA", "2330"], 120);
    const b = await p2.getPriceSeries(["NVDA", "2330"], 120);
    expect(a).toEqual(b);
    expect(a[0].points.length).toBeGreaterThan(50);
    expect(a[0].points.at(-1)!.date <= DEMO_AS_OF).toBe(true);
  });

  it("returns positive, finite closes for every security", async () => {
    const p = new DemoMarketDataProvider();
    const series = await p.getPriceSeries(SECURITIES.map((s) => s.ticker), 60);
    expect(series.length).toBe(SECURITIES.length);
    for (const s of series) {
      for (const pt of s.points) {
        expect(Number.isFinite(pt.close)).toBe(true);
        expect(pt.close).toBeGreaterThan(0);
      }
    }
  });

  it("fundamentals: valuation multiples are positive and only for equities", async () => {
    const p = new DemoMarketDataProvider();
    const f = await p.getFundamentals(SECURITIES.map((s) => s.ticker));
    const equityTickers = new Set(
      SECURITIES.filter((s) => s.assetClass === "EQUITY").map((s) => s.ticker),
    );
    expect(f.length).toBe(equityTickers.size);
    for (const row of f) {
      expect(equityTickers.has(row.symbol)).toBe(true);
      if (row.pe != null) expect(row.pe).toBeGreaterThan(0);
      if (row.grossMargin != null) expect(row.grossMargin).toBeLessThan(1.5);
    }
  });

  it("macro provider covers every canonical key", async () => {
    const p = new DemoMacroProvider();
    const series = await p.getMacroSeries(MACRO_KEYS.map((m) => m.key), 90);
    expect(series.map((s) => s.key).sort()).toEqual(MACRO_KEYS.map((m) => m.key).sort());
    for (const s of series) expect(s.points.length).toBeGreaterThan(20);
  });
});
