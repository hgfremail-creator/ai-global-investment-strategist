import { DEMO_FX_ASOF, DEMO_USD_RATES } from "@/data/fx";
import type { Currency } from "@/lib/enums";
import type { FxProvider, ProviderSourceMeta } from "./types";

const SRC: ProviderSourceMeta = {
  type: "MARKET_DATA",
  title: "Simulated FX reference rates",
  publisher: "Demo dataset (simulated)",
  freshness: "WEEK",
  isDemo: true,
};

export class DemoFxProvider implements FxProvider {
  id = "demo";
  label = "Demo dataset (simulated)";
  isDemo = true;

  async getRates(base: Currency, quotes: Currency[]) {
    const basePerUsd = DEMO_USD_RATES[base];
    return quotes.map((quote) => ({
      base,
      quote,
      rate: DEMO_USD_RATES[quote] / basePerUsd,
      asOf: DEMO_FX_ASOF,
      source: SRC,
    }));
  }
}
