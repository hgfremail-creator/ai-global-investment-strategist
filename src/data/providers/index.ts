// Provider registry. Reads env, returns the configured provider with the demo
// provider always available as a fallback. This is the ONLY place that decides
// which concrete provider is used.

import {
  DemoMarketDataProvider,
  DemoMacroProvider,
  DemoNewsProvider,
} from "./demo";
import { FredMacroProvider } from "./fred";
import { NewsApiProvider } from "./newsapi";
import { DemoFxProvider } from "./fx-demo";
import type {
  FxProvider,
  MacroProvider,
  MarketDataProvider,
  NewsProvider,
} from "./types";

export const demoMarketData = new DemoMarketDataProvider();
export const demoMacro = new DemoMacroProvider();
export const demoNews = new DemoNewsProvider();
export const demoFx = new DemoFxProvider();

export function marketDataProvider(): MarketDataProvider {
  const choice = (process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  switch (choice) {
    // Real equity/fundamentals adapters are registered here once the provider
    // is chosen (see ARCHITECTURE.md §2). Until then, demo is authoritative.
    case "demo":
    default:
      return demoMarketData;
  }
}

export function macroProvider(): MacroProvider {
  const choice = (process.env.MACRO_PROVIDER ?? "").toLowerCase();
  if (choice === "fred" && process.env.FRED_API_KEY) {
    return new FredMacroProvider(process.env.FRED_API_KEY);
  }
  if (!choice && process.env.FRED_API_KEY) {
    return new FredMacroProvider(process.env.FRED_API_KEY);
  }
  return demoMacro;
}

export function newsProvider(): NewsProvider {
  const choice = (process.env.NEWS_PROVIDER ?? "").toLowerCase();
  if ((choice === "newsapi" || !choice) && process.env.NEWSAPI_KEY) {
    return new NewsApiProvider(process.env.NEWSAPI_KEY);
  }
  return demoNews;
}

export function fxProvider(): FxProvider {
  return demoFx;
}

export type ProviderStatus = {
  marketData: { id: string; label: string; isDemo: boolean };
  macro: { id: string; label: string; isDemo: boolean };
  news: { id: string; label: string; isDemo: boolean };
  fx: { id: string; label: string; isDemo: boolean };
};

export function providerStatus(): ProviderStatus {
  const m = marketDataProvider();
  const ma = macroProvider();
  const n = newsProvider();
  const f = fxProvider();
  return {
    marketData: { id: m.id, label: m.label, isDemo: m.isDemo },
    macro: { id: ma.id, label: ma.label, isDemo: ma.isDemo },
    news: { id: n.id, label: n.label, isDemo: n.isDemo },
    fx: { id: f.id, label: f.label, isDemo: f.isDemo },
  };
}
