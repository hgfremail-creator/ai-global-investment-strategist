// Provider abstraction. Every concrete provider (demo or real) implements these
// interfaces; the app only ever talks to the interface. Swapping providers is a
// one-line change in src/data/providers/index.ts.
//
// Contract rules enforced by the ingestion layer:
//  * every returned data point carries enough metadata to build a Source row
//  * providers NEVER invent values — if a field is unknown it is omitted/null
//  * a provider may throw; the ingestion layer falls back to the demo provider
//    for the missing slice and records that it did so.

import type { AssetClass, Country, Currency, Freshness, SourceType } from "@/lib/enums";

export type ProviderSourceMeta = {
  type: SourceType;
  title: string;
  publisher: string;
  url?: string;
  publishedAt?: string; // ISO
  freshness: Freshness;
  excerpt?: string;
  isDemo: boolean;
};

export type PricePoint = {
  date: string; // ISO yyyy-mm-dd
  close: number;
  volume?: number;
};

export type PriceSeries = {
  symbol: string;
  currency: Currency | string;
  points: PricePoint[];
  source: ProviderSourceMeta;
};

export type FundamentalSnapshot = {
  symbol: string;
  asOf: string; // ISO
  revenueGrowth?: number;
  epsGrowth?: number;
  fcfMargin?: number;
  roic?: number;
  netDebtToEbitda?: number;
  grossMargin?: number;
  operatingMargin?: number;
  pe?: number;
  forwardPe?: number;
  evEbitda?: number;
  peg?: number;
  ps?: number;
  fcfYield?: number;
  epsRevision4w?: number;
  epsRevision13w?: number;
  expectedRevenueGrowth?: number;
  expectedEpsGrowth?: number;
  moat?: "NONE" | "NARROW" | "WIDE";
  tamTier?: number;
  source: ProviderSourceMeta;
};

export type MacroPoint = {
  key: string; // CPI_YOY | FEDFUNDS | US10Y | ...
  region: string;
  date: string;
  value: number;
  unit?: string;
};

export type MacroSeries = {
  key: string;
  region: string;
  points: MacroPoint[];
  source: ProviderSourceMeta;
};

export type NewsArticle = {
  symbol?: string;
  region?: string;
  title: string;
  url?: string;
  publisher: string;
  publishedAt: string; // ISO
  summary: string;
  sentiment?: number; // -1..1
  source: ProviderSourceMeta;
};

export type UniverseSecurity = {
  ticker: string;
  name: string;
  country: Country | string;
  sector: string;
  industry: string;
  currency: Currency | string;
  assetClass: AssetClass;
  listingExchange?: string;
};

export type BenchmarkSeries = {
  symbol: string;
  name: string;
  points: PricePoint[];
  source: ProviderSourceMeta;
};

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  /** Historical daily closes. `lookbackDays` is a hint; providers may return more. */
  getPriceSeries(symbols: string[], lookbackDays: number): Promise<PriceSeries[]>;
  getFundamentals(symbols: string[]): Promise<FundamentalSnapshot[]>;
  getBenchmarks(symbols: string[], lookbackDays: number): Promise<BenchmarkSeries[]>;
  /** Optional: expand the universe from the provider. Return [] if unsupported. */
  discoverUniverse?(countries: string[]): Promise<UniverseSecurity[]>;
}

export interface MacroProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  getMacroSeries(keys: string[], lookbackDays: number): Promise<MacroSeries[]>;
}

export interface NewsProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  getCompanyNews(symbols: string[], sinceDays: number): Promise<NewsArticle[]>;
  getMacroNews(regions: string[], sinceDays: number): Promise<NewsArticle[]>;
}

export interface FxProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  /** Units of quote per 1 unit of base. */
  getRates(base: Currency, quotes: Currency[]): Promise<
    { base: Currency; quote: Currency; rate: number; asOf: string; source: ProviderSourceMeta }[]
  >;
}

// Canonical macro series the app expects. Providers map their own codes to these.
export const MACRO_KEYS: { key: string; region: string; label: string; fred?: string }[] = [
  { key: "CPI_YOY", region: "US", label: "US CPI (YoY %)", fred: "CPIAUCSL" },
  { key: "CORE_CPI_YOY", region: "US", label: "US core CPI (YoY %)", fred: "CPILFESL" },
  { key: "FEDFUNDS", region: "US", label: "Fed funds rate", fred: "FEDFUNDS" },
  { key: "US2Y", region: "US", label: "US 2Y Treasury yield", fred: "DGS2" },
  { key: "US10Y", region: "US", label: "US 10Y Treasury yield", fred: "DGS10" },
  { key: "US_UNEMP", region: "US", label: "US unemployment rate", fred: "UNRATE" },
  { key: "US_REAL10Y", region: "US", label: "US 10Y real yield (TIPS)", fred: "DFII10" },
  { key: "IG_OAS", region: "US", label: "US IG corporate OAS", fred: "BAMLC0A0CM" },
  { key: "HY_OAS", region: "US", label: "US HY corporate OAS", fred: "BAMLH0A0HYM2" },
  { key: "DXY", region: "GLOBAL", label: "US dollar index (broad)", fred: "DTWEXBGS" },
  { key: "EURUSD", region: "EU", label: "EUR/USD", fred: "DEXUSEU" },
  { key: "USDJPY", region: "JP", label: "USD/JPY", fred: "DEXJPUS" },
  { key: "GOLD", region: "GLOBAL", label: "Gold fixing price USD/oz", fred: "IR14270" },
  { key: "BRENT", region: "GLOBAL", label: "Brent crude USD/bbl", fred: "DCOILBRENTEU" },
  { key: "ECB_MRO", region: "EU", label: "ECB main refinancing rate", fred: "ECBMRRFR" },
  { key: "DE10Y", region: "EU", label: "Germany 10Y govt yield", fred: "IRLTLT01DEM156N" },
  { key: "JP10Y", region: "JP", label: "Japan 10Y govt yield", fred: "IRLTLT01JPM156N" },
];
