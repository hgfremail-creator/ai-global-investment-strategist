import type { Currency } from "@/lib/enums";

// Demo FX rates: units of the quote currency per 1 USD. Clearly simulated.
// A real provider adapter would replace `getFxRates`.
export const DEMO_FX_ASOF = "2026-09-05";
export const DEMO_USD_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.917, // 1 USD = 0.917 EUR
  JPY: 147.2,
  TWD: 31.85,
};

export type FxQuote = {
  base: Currency;
  quote: Currency;
  rate: number;
  asOf: string;
  source: string;
};

export function getFxRates(): FxQuote[] {
  const src =
    process.env.FX_PROVIDER === "demo" || !process.env.FX_PROVIDER
      ? "Demo dataset (simulated FX)"
      : `FX provider: ${process.env.FX_PROVIDER}`;
  return (Object.keys(DEMO_USD_RATES) as Currency[]).map((quote) => ({
    base: "USD",
    quote,
    rate: DEMO_USD_RATES[quote],
    asOf: DEMO_FX_ASOF,
    source: src,
  }));
}

/** Convert an amount in `from` currency to USD. */
export function toUsd(amount: number, from: Currency): number {
  return amount / DEMO_USD_RATES[from];
}

/** Convert a USD amount into `to` currency. */
export function fromUsd(amountUsd: number, to: Currency): number {
  return amountUsd * DEMO_USD_RATES[to];
}
