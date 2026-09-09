// Paper-portfolio performance (pure). Chains each strategy version's allocation
// over the period it was live to build a NAV series, and the same for benchmarks.

import type { Bar } from "./indicators";
import { maxDrawdown } from "./indicators";

export type VersionHolding = { ticker: string; weight: number };
export type VersionPeriod = {
  version: number;
  from: string; // ISO date
  to: string; // ISO date (exclusive-ish)
  holdings: VersionHolding[];
};

export type PriceLookup = (ticker: string, from: string, to: string) => { start: number; end: number } | null;

export type PerfPoint = { date: string; portfolio: number; benchmark: number; blended: number };

export type PerformanceResult = {
  series: PerfPoint[];
  totalReturn: number;
  benchmarkTotalReturn: number;
  blendedTotalReturn: number;
  weekReturn: number | null;
  maxDrawdown: number;
  annualisedVol: number;
  periods: { version: number; from: string; to: string; portfolioReturn: number; benchmarkReturn: number }[];
};

function periodReturn(holdings: VersionHolding[], from: string, to: string, px: PriceLookup): number {
  const w = holdings.reduce((a, h) => a + h.weight, 0) || 1;
  let r = 0;
  let covered = 0;
  for (const h of holdings) {
    const p = px(h.ticker, from, to);
    if (!p || p.start <= 0) continue;
    r += (h.weight / w) * (p.end / p.start - 1);
    covered += h.weight / w;
  }
  // uncovered weight (missing price data) is treated as flat
  return covered > 0 ? r : 0;
}

export function computePerformance(
  periods: VersionPeriod[],
  px: PriceLookup,
  benchmarkSymbol: string,
  blendedWeights: { equity: number; bond: number },
): PerformanceResult {
  let nav = 100;
  let bench = 100;
  let blend = 100;
  const series: PerfPoint[] = [{ date: periods[0]?.from ?? "", portfolio: 100, benchmark: 100, blended: 100 }];
  const periodResults: PerformanceResult["periods"] = [];
  const navBars: Bar[] = [{ date: periods[0]?.from ?? "", close: 100 }];

  for (const p of periods) {
    const pr = periodReturn(p.holdings, p.from, p.to, px);
    const bp = px(benchmarkSymbol, p.from, p.to);
    const br = bp && bp.start > 0 ? bp.end / bp.start - 1 : 0;
    // blended: equity via benchmark, bond leg flat-ish carry (~0.1%/wk proxy)
    const blr = blendedWeights.equity * br + blendedWeights.bond * 0.001;

    nav *= 1 + pr;
    bench *= 1 + br;
    blend *= 1 + blr;
    series.push({ date: p.to, portfolio: round(nav), benchmark: round(bench), blended: round(blend) });
    navBars.push({ date: p.to, close: nav });
    periodResults.push({ version: p.version, from: p.from, to: p.to, portfolioReturn: round4(pr), benchmarkReturn: round4(br) });
  }

  const rets: number[] = [];
  for (let i = 1; i < navBars.length; i++) rets.push(navBars[i].close / navBars[i - 1].close - 1);
  const meanW = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const varW = rets.length > 1 ? rets.reduce((a, b) => a + (b - meanW) ** 2, 0) / (rets.length - 1) : 0;
  const annualisedVol = Math.sqrt(varW) * Math.sqrt(52);

  return {
    series,
    totalReturn: round4(nav / 100 - 1),
    benchmarkTotalReturn: round4(bench / 100 - 1),
    blendedTotalReturn: round4(blend / 100 - 1),
    weekReturn: rets.length ? round4(rets[rets.length - 1]) : null,
    maxDrawdown: round4(maxDrawdown(navBars)),
    annualisedVol: round4(annualisedVol),
    periods: periodResults,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 10000) / 10000;
