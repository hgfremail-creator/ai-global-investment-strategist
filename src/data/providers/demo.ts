// Deterministic demo provider. Every series is generated from a seeded PRNG so
// the dataset is identical on every machine and every engine test is reproducible.
// Nothing here is real market data — all rows are badged SIMULATED downstream.

import { gaussian, seededRng } from "@/lib/rng";
import { SECURITIES, type DemoSecurity } from "@/data/universe";
import { MACRO_KEYS } from "./types";
import type {
  BenchmarkSeries,
  FundamentalSnapshot,
  MacroSeries,
  MarketDataProvider,
  MacroProvider,
  NewsArticle,
  NewsProvider,
  PricePoint,
  PriceSeries,
  ProviderSourceMeta,
} from "./types";

export const DEMO_AS_OF = "2026-09-04"; // fixed anchor date for the whole demo dataset
const DAY = 86_400_000;
const CANON_CALENDAR_DAYS = 1200; // canonical history window generated once, then sliced

function tradingDates(lookbackDays: number, asOf = DEMO_AS_OF): string[] {
  const end = new Date(asOf + "T00:00:00Z").getTime();
  const out: string[] = [];
  for (let i = lookbackDays; i >= 0; i--) {
    const d = new Date(end - i * DAY);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue; // skip weekends
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Slice the canonical (fixed-origin) series to the requested lookback so any
 *  lookback yields a consistent, continuous window. */
function windowed(all: PricePoint[], lookbackDays: number): PricePoint[] {
  const cutoff = new Date(new Date(DEMO_AS_OF).getTime() - lookbackDays * DAY)
    .toISOString()
    .slice(0, 10);
  return all.filter((p) => p.date >= cutoff);
}

function demoSource(
  type: ProviderSourceMeta["type"],
  title: string,
  freshness: ProviderSourceMeta["freshness"] = "WEEK",
): ProviderSourceMeta {
  return { type, title, publisher: "Demo dataset (simulated)", freshness, isDemo: true };
}

function secByTicker(t: string): DemoSecurity | undefined {
  return SECURITIES.find((s) => s.ticker === t);
}

const canonCache = new Map<string, PricePoint[]>();

/** Canonical GBM path over a fixed window, generated once per security and
 *  cached, so every lookback is a consistent slice of the same series.
 *  The path is calibrated to finish near `anchorPrice` at DEMO_AS_OF. */
function canonicalPath(sec: DemoSecurity): PricePoint[] {
  const hit = canonCache.get(sec.ticker);
  if (hit) return hit;

  const dates = tradingDates(CANON_CALENDAR_DAYS);
  const rng = seededRng("price", sec.ticker, "v2");
  const dt = 1 / 252;
  const sigma = sec.annualVol;
  const mu = sec.drift;
  const start = Math.max(sec.anchorPrice * 0.2, sec.anchorPrice * Math.exp(-mu * (dates.length / 252)));
  let price = start;
  const pts: PricePoint[] = [];
  for (let i = 0; i < dates.length; i++) {
    price *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * gaussian(rng));
    const vol = Math.round(1_000_000 * (0.5 + rng()) * (sec.assetClass === "EQUITY" ? 1 : 0.2));
    pts.push({ date: dates[i], close: Math.round(price * 100) / 100, volume: vol });
  }
  // rescale so the final close lands exactly on the anchor price
  const scale = sec.anchorPrice / pts[pts.length - 1].close;
  const scaled = pts.map((p) => ({ ...p, close: Math.round(p.close * scale * 100) / 100 }));
  canonCache.set(sec.ticker, scaled);
  return scaled;
}

function fundamentalsFor(sec: DemoSecurity): FundamentalSnapshot {
  const rng = seededRng("fund", sec.ticker);
  const r = () => rng();
  const ai = sec.factors.aiFactor;
  const defensive = sec.factors.defensive;
  const isEquity = sec.assetClass === "EQUITY";

  // Growth scales with AI exposure; quality scales with defensiveness; valuation
  // richer for high-AI names. All plausible, all simulated.
  const revenueGrowth = isEquity ? 0.02 + ai * 0.35 + (r() - 0.5) * 0.08 : undefined;
  const epsGrowth = isEquity && revenueGrowth != null ? revenueGrowth * (0.9 + r() * 0.6) : undefined;
  const grossMargin = isEquity ? 0.3 + defensive * 0.25 + ai * 0.2 + (r() - 0.5) * 0.1 : undefined;
  const operatingMargin = grossMargin != null ? grossMargin * (0.45 + r() * 0.25) : undefined;
  const fcfMargin = operatingMargin != null ? operatingMargin * (0.6 + r() * 0.4) : undefined;
  const roic = isEquity ? 0.08 + defensive * 0.12 + ai * 0.15 + (r() - 0.5) * 0.06 : undefined;
  const netDebtToEbitda = isEquity ? Math.max(-1.5, 1.8 - defensive * 1.5 - ai * 1.2 + (r() - 0.5)) : undefined;
  const pe = isEquity ? 14 + ai * 45 + defensive * 8 + (r() - 0.5) * 10 : undefined;
  const forwardPe = pe != null ? pe / (1 + (epsGrowth ?? 0.1)) : undefined;
  const evEbitda = pe != null ? pe * (0.6 + r() * 0.2) : undefined;
  const peg = pe != null && epsGrowth ? pe / Math.max(1, epsGrowth * 100) : undefined;
  const ps = isEquity ? (pe ?? 20) * (operatingMargin ?? 0.2) : undefined;
  const fcfYield = isEquity && forwardPe ? (1 / forwardPe) * (0.5 + r() * 0.4) : undefined;

  return {
    symbol: sec.ticker,
    asOf: DEMO_AS_OF,
    revenueGrowth,
    epsGrowth,
    fcfMargin,
    roic,
    netDebtToEbitda,
    grossMargin,
    operatingMargin,
    pe,
    forwardPe,
    evEbitda,
    peg,
    ps,
    fcfYield,
    epsRevision4w: isEquity ? (r() - 0.45) * 0.06 : undefined,
    epsRevision13w: isEquity ? (r() - 0.45) * 0.12 : undefined,
    expectedRevenueGrowth: revenueGrowth != null ? revenueGrowth * (0.8 + r() * 0.4) : undefined,
    expectedEpsGrowth: epsGrowth != null ? epsGrowth * (0.8 + r() * 0.4) : undefined,
    moat: ai > 0.7 || defensive > 0.65 ? "WIDE" : ai > 0.35 || defensive > 0.4 ? "NARROW" : "NONE",
    tamTier: Math.min(5, Math.max(1, Math.round(1 + ai * 4))),
    source: demoSource("EARNINGS", `${sec.name} — simulated fundamentals snapshot`, "WEEK"),
  };
}

const MACRO_ANCHORS: Record<string, { value: number; vol: number; unit: string }> = {
  CPI_YOY: { value: 2.7, vol: 0.05, unit: "%" },
  CORE_CPI_YOY: { value: 2.9, vol: 0.04, unit: "%" },
  FEDFUNDS: { value: 4.0, vol: 0.02, unit: "%" },
  US2Y: { value: 3.55, vol: 0.03, unit: "%" },
  US10Y: { value: 4.15, vol: 0.03, unit: "%" },
  US_UNEMP: { value: 4.3, vol: 0.02, unit: "%" },
  US_REAL10Y: { value: 1.75, vol: 0.03, unit: "%" },
  IG_OAS: { value: 0.92, vol: 0.03, unit: "%" },
  HY_OAS: { value: 3.15, vol: 0.08, unit: "%" },
  DXY: { value: 121.5, vol: 0.004, unit: "index" },
  EURUSD: { value: 1.09, vol: 0.004, unit: "USD" },
  USDJPY: { value: 147.2, vol: 0.005, unit: "JPY" },
  GOLD: { value: 3480, vol: 0.008, unit: "USD/oz" },
  BRENT: { value: 71.5, vol: 0.012, unit: "USD/bbl" },
  ECB_MRO: { value: 2.15, vol: 0.01, unit: "%" },
  DE10Y: { value: 2.65, vol: 0.03, unit: "%" },
  JP10Y: { value: 1.55, vol: 0.03, unit: "%" },
};

function macroPath(key: string, region: string, dates: string[]) {
  const a = MACRO_ANCHORS[key] ?? { value: 1, vol: 0.02, unit: "" };
  const rng = seededRng("macro", key);
  let v = a.value * (1 + (rng() - 0.5) * 0.02);
  return dates.map((date) => {
    v += (a.value - v) * 0.03 + gaussian(rng) * a.value * a.vol; // mean-reverting
    return { key, region, date, value: Math.round(v * 1000) / 1000, unit: a.unit };
  });
}

export class DemoMarketDataProvider implements MarketDataProvider {
  id = "demo";
  label = "Demo dataset (simulated)";
  isDemo = true;

  async getPriceSeries(symbols: string[], lookbackDays: number): Promise<PriceSeries[]> {
    return symbols
      .map((sym) => secByTicker(sym))
      .filter((s): s is DemoSecurity => !!s)
      .map((sec) => ({
        symbol: sec.ticker,
        currency: sec.currency,
        points: windowed(canonicalPath(sec), lookbackDays),
        source: demoSource("MARKET_DATA", `${sec.name} — simulated daily closes`, "TODAY"),
      }));
  }

  async getFundamentals(symbols: string[]): Promise<FundamentalSnapshot[]> {
    return symbols
      .map((sym) => secByTicker(sym))
      .filter((s): s is DemoSecurity => !!s && s.assetClass === "EQUITY")
      .map(fundamentalsFor);
  }

  async getBenchmarks(symbols: string[], lookbackDays: number): Promise<BenchmarkSeries[]> {
    const anchors: Record<string, { name: string; price: number; vol: number; drift: number }> = {
      SP500: { name: "S&P 500", price: 6600, vol: 0.16, drift: 0.09 },
      NDX: { name: "Nasdaq 100", price: 24800, vol: 0.22, drift: 0.12 },
      MSCI_WORLD: { name: "MSCI World", price: 4100, vol: 0.15, drift: 0.08 },
      NKY: { name: "Nikkei 225", price: 43500, vol: 0.2, drift: 0.08 },
      TWSE: { name: "Taiwan Weighted", price: 24200, vol: 0.22, drift: 0.1 },
      CAC: { name: "CAC 40", price: 7950, vol: 0.17, drift: 0.06 },
      DAX: { name: "DAX", price: 24100, vol: 0.18, drift: 0.07 },
    };
    return symbols
      .filter((s) => anchors[s])
      .map((sym) => {
        const a = anchors[sym];
        const fakeSec: DemoSecurity = {
          ticker: sym, name: a.name, market: "GLOBAL", country: "GLOBAL",
          sector: "Index", industry: "Index", currency: "USD", assetClass: "EQUITY",
          anchorPrice: a.price, annualVol: a.vol, drift: a.drift,
          factors: { aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0 },
        };
        return {
          symbol: sym,
          name: a.name,
          points: windowed(canonicalPath(fakeSec), lookbackDays),
          source: demoSource("MARKET_DATA", `${a.name} — simulated index level`, "TODAY"),
        };
      });
  }

  async discoverUniverse() {
    return SECURITIES.map((s) => ({
      ticker: s.ticker, name: s.name, country: s.country, sector: s.sector,
      industry: s.industry, currency: s.currency, assetClass: s.assetClass,
    }));
  }
}

export class DemoMacroProvider implements MacroProvider {
  id = "demo";
  label = "Demo dataset (simulated)";
  isDemo = true;

  async getMacroSeries(keys: string[], lookbackDays: number): Promise<MacroSeries[]> {
    const dates = tradingDates(lookbackDays);
    return keys
      .map((k) => MACRO_KEYS.find((m) => m.key === k))
      .filter((m): m is (typeof MACRO_KEYS)[number] => !!m)
      .map((m) => ({
        key: m.key,
        region: m.region,
        points: macroPath(m.key, m.region, dates),
        source: demoSource("MACRO", `${m.label} — simulated series`, "TODAY"),
      }));
  }
}

const NEWS_TEMPLATES = [
  { t: "{name}: quarterly results in line with expectations; management reiterates outlook", s: 0.15 },
  { t: "{name} announces expanded capacity investment amid AI infrastructure demand", s: 0.4 },
  { t: "Analysts debate {name} valuation after strong run", s: -0.1 },
  { t: "{name} flags currency headwinds but underlying demand resilient", s: 0.05 },
  { t: "Supply-chain checks suggest steady order book for {name}", s: 0.2 },
  { t: "{name} faces increased competitive scrutiny in core segment", s: -0.25 },
];

export class DemoNewsProvider implements NewsProvider {
  id = "demo";
  label = "Demo dataset (simulated)";
  isDemo = true;

  async getCompanyNews(symbols: string[], sinceDays: number): Promise<NewsArticle[]> {
    const out: NewsArticle[] = [];
    for (const sym of symbols) {
      const sec = secByTicker(sym);
      if (!sec) continue;
      const rng = seededRng("news", sym, DEMO_AS_OF);
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const tpl = NEWS_TEMPLATES[Math.floor(rng() * NEWS_TEMPLATES.length)];
        const daysAgo = Math.floor(rng() * sinceDays);
        const when = new Date(new Date(DEMO_AS_OF).getTime() - daysAgo * DAY).toISOString();
        out.push({
          symbol: sym,
          title: tpl.t.replace("{name}", sec.name),
          publisher: "Demo Newswire (simulated)",
          publishedAt: when,
          summary: `Simulated headline for ${sec.name} for demo purposes. Replace with a real news provider by setting NEWS_PROVIDER + NEWSAPI_KEY.`,
          sentiment: tpl.s + (rng() - 0.5) * 0.1,
          source: demoSource("NEWS", `${sec.name} — simulated news item`, "WEEK"),
        });
      }
    }
    return out;
  }

  async getMacroNews(regions: string[], sinceDays: number): Promise<NewsArticle[]> {
    const rng = seededRng("macronews", regions.join(","), DEMO_AS_OF);
    const items = [
      "Central bank keeps policy rate unchanged; guidance broadly neutral",
      "Inflation print lands close to expectations; markets little changed",
      "Labour market data shows gradual cooling",
      "Bond yields drift as investors weigh growth outlook",
    ];
    return items.map((title, i) => ({
      region: regions[0] ?? "GLOBAL",
      title,
      publisher: "Demo Macro Wire (simulated)",
      publishedAt: new Date(new Date(DEMO_AS_OF).getTime() - i * DAY - Math.floor(rng() * sinceDays) * DAY).toISOString(),
      summary: "Simulated macro headline for demo purposes.",
      sentiment: (rng() - 0.5) * 0.2,
      source: demoSource("NEWS", "Simulated macro news item", "WEEK"),
    }));
  }
}
