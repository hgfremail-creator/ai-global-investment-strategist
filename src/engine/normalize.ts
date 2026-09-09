// Peer-relative normalisation helpers used by the scoring engine.

/** Percentile rank of `value` within `sample` (ignoring nulls), 0..1.
 *  `higherIsBetter=false` inverts (so low values rank high). */
export function percentileRank(
  value: number | null | undefined,
  sample: (number | null | undefined)[],
  higherIsBetter = true,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const xs = sample.filter((x): x is number => x != null && Number.isFinite(x));
  if (xs.length < 3) return null;
  const below = xs.filter((x) => x < value).length;
  const equal = xs.filter((x) => x === value).length;
  const p = (below + 0.5 * equal) / xs.length;
  return higherIsBetter ? p : 1 - p;
}

/** Map a value in [lo, hi] to [0, 1], clamped. */
export function scaleClamped(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0.5;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/** Blend a peer percentile with an absolute anchor score. */
export function blendRelAbs(
  rel: number | null,
  abs: number | null,
  relWeight = 0.6,
): number {
  if (rel == null && abs == null) return 0.5;
  if (rel == null) return abs!;
  if (abs == null) return rel;
  return relWeight * rel + (1 - relWeight) * abs;
}

export function to100(x: number): number {
  return Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10;
}

export function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
