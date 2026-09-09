// Pure price/return indicators. No I/O. Tested in src/test/indicators.test.ts.

export type Bar = { date: string; close: number };

export function totalReturn(bars: Bar[], tradingDays: number): number | null {
  if (bars.length < 2) return null;
  const end = bars[bars.length - 1].close;
  const idx = Math.max(0, bars.length - 1 - tradingDays);
  const start = bars[idx].close;
  if (start <= 0) return null;
  return end / start - 1;
}

/** Annualised volatility of daily log returns. */
export function realisedVol(bars: Bar[], window = 126): number | null {
  const slice = bars.slice(-Math.max(2, window + 1));
  if (slice.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1].close > 0) rets.push(Math.log(slice[i].close / slice[i - 1].close));
  }
  if (rets.length < 10) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Maximum peak-to-trough drawdown over the series (returns a negative fraction). */
export function maxDrawdown(bars: Bar[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const b of bars) {
    if (b.close > peak) peak = b.close;
    if (peak > 0) {
      const dd = b.close / peak - 1;
      if (dd < mdd) mdd = dd;
    }
  }
  return mdd;
}

/** Simple moving average of the last `n` closes. */
export function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  return slice.reduce((a, b) => a + b.close, 0) / n;
}

export type MomentumProfile = {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
  blended: number | null;
};

export function momentum(bars: Bar[]): MomentumProfile {
  const m1 = totalReturn(bars, 21);
  const m3 = totalReturn(bars, 63);
  const m6 = totalReturn(bars, 126);
  const m12 = totalReturn(bars, 252);
  const parts = [
    [m1, 0.15],
    [m3, 0.25],
    [m6, 0.3],
    [m12, 0.3],
  ] as const;
  let wsum = 0;
  let w = 0;
  for (const [v, weight] of parts) {
    if (v != null) {
      wsum += v * weight;
      w += weight;
    }
  }
  return { m1, m3, m6, m12, blended: w > 0 ? wsum / w : null };
}

/** Trend score in [-1, 1]: sign & strength of price vs 50/200-day SMAs. */
export function trendScore(bars: Bar[]): number | null {
  const last = bars.at(-1)?.close;
  const s50 = sma(bars, 50);
  const s200 = sma(bars, 200);
  if (last == null || s50 == null || s200 == null) return null;
  let s = 0;
  s += last > s50 ? 0.35 : -0.35;
  s += last > s200 ? 0.35 : -0.35;
  s += s50 > s200 ? 0.3 : -0.3;
  return Math.max(-1, Math.min(1, s));
}
