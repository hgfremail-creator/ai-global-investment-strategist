// Initial demo universe. Tickers/companies are real, but ALL numeric data attached
// to them in this app is simulated (see ARCHITECTURE.md §13). `factorLoadings` are
// hand-set 0..1 look-through estimates used by the concentration engine.

export type DemoMarket = {
  code: string;
  name: string;
  currency: string;
  benchmarkSymbol: string;
};

export type DemoSecurity = {
  ticker: string;
  name: string;
  market: string; // market code
  country: string;
  sector: string;
  industry: string;
  currency: string;
  assetClass:
    | "EQUITY"
    | "GOLD"
    | "GOV_BOND"
    | "IG_BOND"
    | "CASH"
    | "DIVERSIFIER";
  anchorPrice: number; // simulated starting price
  annualVol: number; // simulated annualised volatility
  drift: number; // simulated annual drift
  factors: {
    aiFactor: number;
    semiconductor: number;
    usTech: number;
    defensive: number;
    rates: number; // sensitivity to rates (bonds high)
    gold: number;
  };
};

export const MARKETS: DemoMarket[] = [
  { code: "US", name: "United States", currency: "USD", benchmarkSymbol: "SP500" },
  { code: "JP", name: "Japan", currency: "JPY", benchmarkSymbol: "NKY" },
  { code: "TW", name: "Taiwan", currency: "TWD", benchmarkSymbol: "TWSE" },
  { code: "FR", name: "France", currency: "EUR", benchmarkSymbol: "CAC" },
  { code: "DE", name: "Germany", currency: "EUR", benchmarkSymbol: "DAX" },
  { code: "GLOBAL", name: "Global / multi-asset", currency: "USD", benchmarkSymbol: "MSCI_WORLD" },
];

const f = (
  aiFactor = 0,
  semiconductor = 0,
  usTech = 0,
  defensive = 0,
  rates = 0,
  gold = 0,
) => ({ aiFactor, semiconductor, usTech, defensive, rates, gold });

export const SECURITIES: DemoSecurity[] = [
  // ── United States — growth / AI ───────────────────────────────
  { ticker: "NVDA", name: "NVIDIA", market: "US", country: "US", sector: "Information Technology", industry: "Semiconductors", currency: "USD", assetClass: "EQUITY", anchorPrice: 174, annualVol: 0.48, drift: 0.18, factors: f(1.0, 1.0, 1.0, 0.0, -0.05, 0) },
  { ticker: "MSFT", name: "Microsoft", market: "US", country: "US", sector: "Information Technology", industry: "Software", currency: "USD", assetClass: "EQUITY", anchorPrice: 505, annualVol: 0.26, drift: 0.12, factors: f(0.8, 0.15, 1.0, 0.2, -0.05, 0) },
  { ticker: "AMZN", name: "Amazon", market: "US", country: "US", sector: "Consumer Discretionary", industry: "Internet Retail / Cloud", currency: "USD", assetClass: "EQUITY", anchorPrice: 232, annualVol: 0.32, drift: 0.11, factors: f(0.6, 0.1, 0.9, 0.1, -0.05, 0) },
  { ticker: "GOOGL", name: "Alphabet", market: "US", country: "US", sector: "Communication Services", industry: "Interactive Media", currency: "USD", assetClass: "EQUITY", anchorPrice: 232, annualVol: 0.29, drift: 0.10, factors: f(0.7, 0.15, 0.95, 0.15, -0.05, 0) },
  { ticker: "META", name: "Meta Platforms", market: "US", country: "US", sector: "Communication Services", industry: "Interactive Media", currency: "USD", assetClass: "EQUITY", anchorPrice: 755, annualVol: 0.36, drift: 0.12, factors: f(0.65, 0.1, 0.95, 0.05, -0.05, 0) },
  { ticker: "AVGO", name: "Broadcom", market: "US", country: "US", sector: "Information Technology", industry: "Semiconductors", currency: "USD", assetClass: "EQUITY", anchorPrice: 350, annualVol: 0.4, drift: 0.14, factors: f(0.85, 0.95, 1.0, 0.05, -0.05, 0) },
  { ticker: "AMD", name: "Advanced Micro Devices", market: "US", country: "US", sector: "Information Technology", industry: "Semiconductors", currency: "USD", assetClass: "EQUITY", anchorPrice: 165, annualVol: 0.5, drift: 0.10, factors: f(0.8, 1.0, 1.0, 0.0, -0.05, 0) },
  { ticker: "PLTR", name: "Palantir Technologies", market: "US", country: "US", sector: "Information Technology", industry: "Software", currency: "USD", assetClass: "EQUITY", anchorPrice: 165, annualVol: 0.62, drift: 0.08, factors: f(0.9, 0.0, 1.0, 0.0, -0.05, 0) },
  { ticker: "NOW", name: "ServiceNow", market: "US", country: "US", sector: "Information Technology", industry: "Software", currency: "USD", assetClass: "EQUITY", anchorPrice: 920, annualVol: 0.34, drift: 0.11, factors: f(0.7, 0.0, 1.0, 0.15, -0.05, 0) },
  { ticker: "ORCL", name: "Oracle", market: "US", country: "US", sector: "Information Technology", industry: "Software / Cloud", currency: "USD", assetClass: "EQUITY", anchorPrice: 240, annualVol: 0.35, drift: 0.10, factors: f(0.75, 0.1, 0.95, 0.2, -0.05, 0) },
  { ticker: "ANET", name: "Arista Networks", market: "US", country: "US", sector: "Information Technology", industry: "Networking", currency: "USD", assetClass: "EQUITY", anchorPrice: 135, annualVol: 0.42, drift: 0.12, factors: f(0.8, 0.4, 1.0, 0.05, -0.05, 0) },
  { ticker: "VRT", name: "Vertiv Holdings", market: "US", country: "US", sector: "Industrials", industry: "Data-centre infrastructure", currency: "USD", assetClass: "EQUITY", anchorPrice: 135, annualVol: 0.52, drift: 0.13, factors: f(0.75, 0.2, 0.8, 0.05, -0.05, 0) },

  // ── United States — defensive / quality ───────────────────────
  { ticker: "LLY", name: "Eli Lilly", market: "US", country: "US", sector: "Health Care", industry: "Pharmaceuticals", currency: "USD", assetClass: "EQUITY", anchorPrice: 760, annualVol: 0.3, drift: 0.10, factors: f(0.05, 0, 0.1, 0.75, -0.05, 0) },
  { ticker: "V", name: "Visa", market: "US", country: "US", sector: "Financials", industry: "Payments", currency: "USD", assetClass: "EQUITY", anchorPrice: 345, annualVol: 0.22, drift: 0.09, factors: f(0.1, 0, 0.3, 0.6, -0.05, 0) },
  { ticker: "COST", name: "Costco Wholesale", market: "US", country: "US", sector: "Consumer Staples", industry: "Retail", currency: "USD", assetClass: "EQUITY", anchorPrice: 930, annualVol: 0.2, drift: 0.08, factors: f(0, 0, 0.15, 0.8, -0.05, 0) },
  { ticker: "BRK.B", name: "Berkshire Hathaway", market: "US", country: "US", sector: "Financials", industry: "Diversified", currency: "USD", assetClass: "EQUITY", anchorPrice: 495, annualVol: 0.18, drift: 0.08, factors: f(0.05, 0, 0.2, 0.7, -0.05, 0.05) },
  { ticker: "NEE", name: "NextEra Energy", market: "US", country: "US", sector: "Utilities", industry: "Electric utilities", currency: "USD", assetClass: "EQUITY", anchorPrice: 72, annualVol: 0.24, drift: 0.06, factors: f(0.1, 0, 0.15, 0.75, 0.25, 0) },

  // ── Japan ────────────────────────────────────────────────────
  { ticker: "8035", name: "Tokyo Electron", market: "JP", country: "JP", sector: "Information Technology", industry: "Semiconductor equipment", currency: "JPY", assetClass: "EQUITY", anchorPrice: 27000, annualVol: 0.42, drift: 0.10, factors: f(0.8, 0.95, 0.1, 0.05, -0.05, 0) },
  { ticker: "6857", name: "Advantest", market: "JP", country: "JP", sector: "Information Technology", industry: "Semiconductor test", currency: "JPY", assetClass: "EQUITY", anchorPrice: 9500, annualVol: 0.5, drift: 0.12, factors: f(0.85, 0.95, 0.1, 0.0, -0.05, 0) },
  { ticker: "9984", name: "SoftBank Group", market: "JP", country: "JP", sector: "Communication Services", industry: "Holding / tech investing", currency: "JPY", assetClass: "EQUITY", anchorPrice: 11500, annualVol: 0.55, drift: 0.09, factors: f(0.75, 0.3, 0.4, 0.0, -0.05, 0) },
  { ticker: "6758", name: "Sony Group", market: "JP", country: "JP", sector: "Consumer Discretionary", industry: "Electronics / entertainment", currency: "JPY", assetClass: "EQUITY", anchorPrice: 3800, annualVol: 0.3, drift: 0.08, factors: f(0.3, 0.25, 0.3, 0.25, -0.05, 0) },
  { ticker: "6501", name: "Hitachi", market: "JP", country: "JP", sector: "Industrials", industry: "Diversified industrials / IT", currency: "JPY", assetClass: "EQUITY", anchorPrice: 4300, annualVol: 0.32, drift: 0.09, factors: f(0.45, 0.1, 0.2, 0.35, 0, 0) },
  { ticker: "7011", name: "Mitsubishi Heavy Industries", market: "JP", country: "JP", sector: "Industrials", industry: "Aerospace & defence", currency: "JPY", assetClass: "EQUITY", anchorPrice: 3400, annualVol: 0.4, drift: 0.11, factors: f(0.1, 0.05, 0.05, 0.3, 0, 0.1) },
  { ticker: "6702", name: "Fujitsu", market: "JP", country: "JP", sector: "Information Technology", industry: "IT services", currency: "JPY", assetClass: "EQUITY", anchorPrice: 3100, annualVol: 0.3, drift: 0.07, factors: f(0.5, 0.1, 0.35, 0.3, -0.05, 0) },
  { ticker: "6861", name: "Keyence", market: "JP", country: "JP", sector: "Information Technology", industry: "Factory automation sensors", currency: "JPY", assetClass: "EQUITY", anchorPrice: 55000, annualVol: 0.3, drift: 0.08, factors: f(0.4, 0.2, 0.2, 0.4, -0.05, 0) },
  { ticker: "6954", name: "Fanuc", market: "JP", country: "JP", sector: "Industrials", industry: "Robotics", currency: "JPY", assetClass: "EQUITY", anchorPrice: 4200, annualVol: 0.32, drift: 0.06, factors: f(0.45, 0.15, 0.15, 0.35, -0.05, 0) },

  // ── Taiwan ───────────────────────────────────────────────────
  { ticker: "2330", name: "TSMC", market: "TW", country: "TW", sector: "Information Technology", industry: "Semiconductor foundry", currency: "TWD", assetClass: "EQUITY", anchorPrice: 1100, annualVol: 0.38, drift: 0.15, factors: f(0.95, 1.0, 0.2, 0.05, -0.05, 0) },
  { ticker: "2454", name: "MediaTek", market: "TW", country: "TW", sector: "Information Technology", industry: "Fabless semiconductors", currency: "TWD", assetClass: "EQUITY", anchorPrice: 1300, annualVol: 0.42, drift: 0.10, factors: f(0.8, 0.95, 0.15, 0.0, -0.05, 0) },
  { ticker: "2317", name: "Hon Hai Precision (Foxconn)", market: "TW", country: "TW", sector: "Information Technology", industry: "Electronics manufacturing", currency: "TWD", assetClass: "EQUITY", anchorPrice: 205, annualVol: 0.4, drift: 0.11, factors: f(0.7, 0.4, 0.3, 0.05, -0.05, 0) },
  { ticker: "3711", name: "ASE Technology", market: "TW", country: "TW", sector: "Information Technology", industry: "Semiconductor assembly & test", currency: "TWD", assetClass: "EQUITY", anchorPrice: 175, annualVol: 0.44, drift: 0.09, factors: f(0.75, 0.9, 0.15, 0.0, -0.05, 0) },

  // ── France ───────────────────────────────────────────────────
  { ticker: "MC", name: "LVMH", market: "FR", country: "FR", sector: "Consumer Discretionary", industry: "Luxury goods", currency: "EUR", assetClass: "EQUITY", anchorPrice: 620, annualVol: 0.3, drift: 0.06, factors: f(0.02, 0, 0.05, 0.55, -0.05, 0.05) },
  { ticker: "SU", name: "Schneider Electric", market: "FR", country: "FR", sector: "Industrials", industry: "Electrification / data-centre power", currency: "EUR", assetClass: "EQUITY", anchorPrice: 245, annualVol: 0.28, drift: 0.09, factors: f(0.55, 0.15, 0.25, 0.3, 0, 0) },
  { ticker: "AI", name: "Air Liquide", market: "FR", country: "FR", sector: "Materials", industry: "Industrial gases", currency: "EUR", assetClass: "EQUITY", anchorPrice: 185, annualVol: 0.2, drift: 0.06, factors: f(0.1, 0.05, 0.05, 0.7, 0, 0.05) },
  { ticker: "SAF", name: "Safran", market: "FR", country: "FR", sector: "Industrials", industry: "Aerospace propulsion", currency: "EUR", assetClass: "EQUITY", anchorPrice: 265, annualVol: 0.28, drift: 0.10, factors: f(0.15, 0.05, 0.1, 0.4, 0, 0.05) },
  { ticker: "OR", name: "L'Oréal", market: "FR", country: "FR", sector: "Consumer Staples", industry: "Personal care", currency: "EUR", assetClass: "EQUITY", anchorPrice: 385, annualVol: 0.22, drift: 0.05, factors: f(0.03, 0, 0.05, 0.75, -0.05, 0) },

  // ── Germany ──────────────────────────────────────────────────
  { ticker: "SAP", name: "SAP", market: "DE", country: "DE", sector: "Information Technology", industry: "Enterprise software", currency: "EUR", assetClass: "EQUITY", anchorPrice: 235, annualVol: 0.27, drift: 0.11, factors: f(0.7, 0.05, 0.6, 0.25, -0.05, 0) },
  { ticker: "SIE", name: "Siemens", market: "DE", country: "DE", sector: "Industrials", industry: "Diversified industrials / automation", currency: "EUR", assetClass: "EQUITY", anchorPrice: 235, annualVol: 0.28, drift: 0.08, factors: f(0.45, 0.15, 0.25, 0.35, 0, 0) },
  { ticker: "IFX", name: "Infineon Technologies", market: "DE", country: "DE", sector: "Information Technology", industry: "Semiconductors", currency: "EUR", assetClass: "EQUITY", anchorPrice: 38, annualVol: 0.42, drift: 0.08, factors: f(0.55, 0.9, 0.2, 0.1, -0.05, 0) },
  { ticker: "RHM", name: "Rheinmetall", market: "DE", country: "DE", sector: "Industrials", industry: "Defence", currency: "EUR", assetClass: "EQUITY", anchorPrice: 1900, annualVol: 0.45, drift: 0.16, factors: f(0.1, 0.05, 0.05, 0.3, 0, 0.15) },
  { ticker: "ALV", name: "Allianz", market: "DE", country: "DE", sector: "Financials", industry: "Insurance", currency: "EUR", assetClass: "EQUITY", anchorPrice: 360, annualVol: 0.2, drift: 0.06, factors: f(0.03, 0, 0.05, 0.65, 0.2, 0) },

  // ── Diversifying / non-equity ────────────────────────────────
  { ticker: "GLD", name: "Physical gold (spot proxy, ETF)", market: "GLOBAL", country: "GLOBAL", sector: "Precious metals", industry: "Gold", currency: "USD", assetClass: "GOLD", anchorPrice: 340, annualVol: 0.15, drift: 0.07, factors: f(0, 0, 0, 0.3, -0.2, 1.0) },
  { ticker: "IAU", name: "Gold — lower-fee ETF alternative", market: "GLOBAL", country: "GLOBAL", sector: "Precious metals", industry: "Gold", currency: "USD", assetClass: "GOLD", anchorPrice: 70, annualVol: 0.15, drift: 0.07, factors: f(0, 0, 0, 0.3, -0.2, 1.0) },
  { ticker: "IEF", name: "US Treasuries 7–10y (ETF)", market: "GLOBAL", country: "US", sector: "Government bonds", industry: "Treasuries", currency: "USD", assetClass: "GOV_BOND", anchorPrice: 96, annualVol: 0.07, drift: 0.035, factors: f(0, 0, 0, 0.6, 1.0, 0.15) },
  { ticker: "SHY", name: "US Treasuries 1–3y (ETF)", market: "GLOBAL", country: "US", sector: "Government bonds", industry: "Treasuries short", currency: "USD", assetClass: "GOV_BOND", anchorPrice: 83, annualVol: 0.02, drift: 0.04, factors: f(0, 0, 0, 0.5, 0.35, 0.05) },
  { ticker: "BUND", name: "German Bund 7–10y (ETF proxy)", market: "GLOBAL", country: "DE", sector: "Government bonds", industry: "Euro govt", currency: "EUR", assetClass: "GOV_BOND", anchorPrice: 118, annualVol: 0.06, drift: 0.028, factors: f(0, 0, 0, 0.6, 0.95, 0.1) },
  { ticker: "JGB", name: "Japanese Govt Bond 7–10y (ETF proxy)", market: "GLOBAL", country: "JP", sector: "Government bonds", industry: "JGB", currency: "JPY", assetClass: "GOV_BOND", anchorPrice: 100, annualVol: 0.05, drift: 0.012, factors: f(0, 0, 0, 0.55, 0.9, 0.05) },
  { ticker: "LQD", name: "US investment-grade corporate bonds (ETF)", market: "GLOBAL", country: "US", sector: "Credit", industry: "IG corporate", currency: "USD", assetClass: "IG_BOND", anchorPrice: 110, annualVol: 0.08, drift: 0.045, factors: f(0, 0, 0.05, 0.4, 0.8, 0.1) },
  { ticker: "USDCASH", name: "USD cash / money-market equivalent", market: "GLOBAL", country: "US", sector: "Cash", industry: "Money market", currency: "USD", assetClass: "CASH", anchorPrice: 1, annualVol: 0.001, drift: 0.045, factors: f(0, 0, 0, 0.4, 0.1, 0) },
];
