// Portfolio risk engine (pure). Builds a synthetic portfolio return series from
// the holdings' price histories weighted by target weight, then computes the
// standard risk statistics plus concentration and exposure breakdowns.

import type { Bar } from "./indicators";
import { maxDrawdown, realisedVol } from "./indicators";
import type { FactorLoadings } from "./aiExposure";

export type RiskHolding = {
  ticker: string;
  weight: number; // 0..1
  assetClass: string;
  country: string;
  sector: string;
  currency: string;
  factors: FactorLoadings;
  bars: Bar[]; // price history (own currency is fine for returns)
  valuationScore: number; // 0..100 (low = expensive = higher valuation risk)
};

export type RiskMetrics = {
  volatility: number;
  expectedDrawdown: number; // fraction, negative-magnitude expressed positive
  maxHistoricalDrawdown: number; // fraction (negative)
  sharpe: number | null;
  sortino: number | null;
  concentrationHHI: number;
  effectiveNames: number;
  aiFactorExposure: number;
  semiconductorExposure: number;
  usTechExposure: number;
  defensiveExposure: number;
  valuationRisk: number; // 0..1
  liquidityRisk: number; // 0..1
  geopoliticalRisk: number; // 0..1
  countryExposure: Record<string, number>;
  currencyExposure: Record<string, number>;
  sectorExposure: Record<string, number>;
  portfolioSeries: { date: string; value: number }[];
};

function DEFAULT_VOL(assetClass: string): number {
  return { EQUITY: 0.3, GOLD: 0.15, GOV_BOND: 0.06, IG_BOND: 0.08, CASH: 0.01, DIVERSIFIER: 0.2 }[
    assetClass
  ] ?? 0.25;
}

const GEO_RISK: Record<string, number> = {
  US: 0.15, GLOBAL: 0.15, DE: 0.22, FR: 0.22, JP: 0.28, TW: 0.62,
};
const LIQ_RISK_BY_CLASS: Record<string, number> = {
  EQUITY: 0.15, GOLD: 0.1, GOV_BOND: 0.05, IG_BOND: 0.12, CASH: 0.02, DIVERSIFIER: 0.25,
};

function alignedReturns(holdings: RiskHolding[]): { dates: string[]; matrix: number[][] } {
  // Use the shortest common tail of dates.
  const withBars = holdings.filter((h) => h.bars.length > 5);
  if (withBars.length === 0) return { dates: [], matrix: [] };
  const minLen = Math.min(...withBars.map((h) => h.bars.length));
  const dates = withBars[0].bars.slice(-minLen).map((b) => b.date);
  const matrix = withBars.map((h) => {
    const tail = h.bars.slice(-minLen);
    const r: number[] = [];
    for (let i = 1; i < tail.length; i++) {
      r.push(tail[i - 1].close > 0 ? tail[i].close / tail[i - 1].close - 1 : 0);
    }
    return r;
  });
  return { dates: dates.slice(1), matrix };
}

export function computeRiskMetrics(holdings: RiskHolding[], frontEndYield = 0.04): RiskMetrics {
  const totalW = holdings.reduce((a, h) => a + h.weight, 0) || 1;
  const norm = holdings.map((h) => ({ ...h, weight: h.weight / totalW }));

  // synthetic portfolio return series
  const withBars = norm.filter((h) => h.bars.length > 5);
  const { dates, matrix } = alignedReturns(withBars);
  const wOfBarred = withBars.map((h) => h.weight);
  const wBarSum = wOfBarred.reduce((a, b) => a + b, 0) || 1;

  const portRets: number[] = [];
  if (matrix.length) {
    for (let t = 0; t < matrix[0].length; t++) {
      let r = 0;
      for (let i = 0; i < matrix.length; i++) r += (wOfBarred[i] / wBarSum) * matrix[i][t];
      portRets.push(r);
    }
  }

  const portBars: Bar[] = [];
  let idx = 100;
  portBars.push({ date: dates[0] ?? "", close: idx });
  for (let t = 0; t < portRets.length; t++) {
    idx *= 1 + portRets[t];
    portBars.push({ date: dates[t + 1] ?? String(t), close: idx });
  }

  const empiricalVol = realisedVol(portBars) ?? 0.1;

  // Demo price paths are independent, which understates portfolio volatility.
  // Blend the empirical figure with a correlation-floor estimate (ρ = 0.4 among
  // risk assets, 0 for cash) so the number stays realistic with any data source.
  const rhoFloor = (() => {
    const RHO = 0.4;
    let variance = 0;
    for (let i = 0; i < norm.length; i++) {
      const vi = realisedVol(norm[i].bars) ?? DEFAULT_VOL(norm[i].assetClass);
      for (let j = 0; j < norm.length; j++) {
        const vj = realisedVol(norm[j].bars) ?? DEFAULT_VOL(norm[j].assetClass);
        const rho =
          i === j ? 1 : norm[i].assetClass === "CASH" || norm[j].assetClass === "CASH" ? 0 : RHO;
        variance += norm[i].weight * norm[j].weight * vi * vj * rho;
      }
    }
    return Math.sqrt(Math.max(0, variance));
  })();
  const vol = Math.max(empiricalVol, 0.5 * empiricalVol + 0.5 * rhoFloor);
  const mdd = maxDrawdown(portBars);
  const meanDaily = portRets.length ? portRets.reduce((a, b) => a + b, 0) / portRets.length : 0;
  const annReturn = meanDaily * 252;
  const downside = portRets.filter((r) => r < 0);
  const downsideDev =
    downside.length > 1
      ? Math.sqrt(downside.reduce((a, r) => a + r * r, 0) / downside.length) * Math.sqrt(252)
      : null;

  const sharpe = vol > 0 ? Math.round(((annReturn - frontEndYield) / vol) * 100) / 100 : null;
  const sortino = downsideDev && downsideDev > 0 ? Math.round(((annReturn - frontEndYield) / downsideDev) * 100) / 100 : null;

  // concentration
  const hhi = norm.reduce((a, h) => a + h.weight * h.weight, 0);
  const effectiveNames = hhi > 0 ? Math.round((1 / hhi) * 10) / 10 : 0;

  // factor look-through
  const f = { aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0 };
  for (const h of norm) {
    f.aiFactor += h.weight * h.factors.aiFactor;
    f.semiconductor += h.weight * h.factors.semiconductor;
    f.usTech += h.weight * h.factors.usTech;
    f.defensive += h.weight * h.factors.defensive;
  }

  // valuation risk: equity-weighted (1 - valuationScore/100)
  const equityW = norm.filter((h) => h.assetClass === "EQUITY").reduce((a, h) => a + h.weight, 0);
  const valRisk = equityW > 0
    ? norm.filter((h) => h.assetClass === "EQUITY")
        .reduce((a, h) => a + (h.weight / equityW) * (1 - h.valuationScore / 100), 0)
    : 0;

  const liqRisk = norm.reduce((a, h) => a + h.weight * (LIQ_RISK_BY_CLASS[h.assetClass] ?? 0.2) * (h.country === "US" || h.country === "GLOBAL" ? 1 : 1.4), 0);
  const geoRisk = norm.reduce((a, h) => a + h.weight * (GEO_RISK[h.country] ?? 0.3), 0);

  const group = (key: (h: RiskHolding) => string) => {
    const g: Record<string, number> = {};
    for (const h of norm) g[key(h)] = (g[key(h)] ?? 0) + h.weight;
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
  };

  return {
    volatility: Math.round(vol * 1000) / 1000,
    expectedDrawdown: Math.round(Math.min(0.7, 2.5 * (vol / Math.sqrt(12))) * 1000) / 1000,
    maxHistoricalDrawdown: Math.round(mdd * 1000) / 1000,
    sharpe,
    sortino,
    concentrationHHI: Math.round(hhi * 10000) / 10000,
    effectiveNames,
    aiFactorExposure: Math.round(f.aiFactor * 1000) / 1000,
    semiconductorExposure: Math.round(f.semiconductor * 1000) / 1000,
    usTechExposure: Math.round(f.usTech * 1000) / 1000,
    defensiveExposure: Math.round(f.defensive * 1000) / 1000,
    valuationRisk: Math.round(valRisk * 1000) / 1000,
    liquidityRisk: Math.round(Math.min(1, liqRisk) * 1000) / 1000,
    geopoliticalRisk: Math.round(Math.min(1, geoRisk) * 1000) / 1000,
    countryExposure: group((h) => h.country),
    currencyExposure: group((h) => h.currency),
    sectorExposure: group((h) => h.sector),
    portfolioSeries: portBars.map((b) => ({ date: b.date, value: Math.round(b.close * 100) / 100 })),
  };
}
