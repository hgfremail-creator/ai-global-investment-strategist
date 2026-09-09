import Decimal from "decimal.js";
import type { Currency } from "./enums";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

// Money is stored as integer minor units (cents). These helpers keep conversions
// explicit and free of binary-float drift.

export function toMinor(amount: number | string | Decimal): number {
  return new Decimal(amount).times(100).toDecimalPlaces(0).toNumber();
}

export function fromMinor(minor: number): number {
  return new Decimal(minor).dividedBy(100).toNumber();
}

const SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  JPY: "¥",
  TWD: "NT$",
};

export function formatMoney(
  minor: number,
  currency: Currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  const value = fromMinor(minor);
  const fractionDigits = currency === "JPY" ? 0 : 0; // portfolio amounts shown whole
  const nf = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    notation: opts.compact ? "compact" : "standard",
  });
  return `${SYMBOL[currency]}${nf.format(value)}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/**
 * Distribute `totalMinor` across `weights` (fractions summing to ~1) so the parts
 * sum EXACTLY to totalMinor. Largest-remainder method; residual to the last entry.
 */
export function allocateMinor(totalMinor: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const raw = weights.map((w) => new Decimal(totalMinor).times(w));
  const floored = raw.map((r) => r.floor().toNumber());
  let remainder = totalMinor - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r.minus(r.floor()).toNumber() }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}
