# Data sources

All external data flows through provider adapters (`src/data/providers/`). The app
only ever calls the interface; the registry (`src/data/providers/index.ts`) picks the
concrete provider from environment variables and always falls back to the deterministic
demo provider for any slice a real provider can't supply.

| Domain | Interface | Demo provider (default) | Real adapter(s) | Env |
|---|---|---|---|---|
| Prices, fundamentals, benchmarks, universe | `MarketDataProvider` | `DemoMarketDataProvider` — seeded GBM canonical path calibrated to anchor prices; plausible seeded fundamentals | *(to be selected — Polygon / Tiingo / EODHD / Finnhub / Twelve Data / FMP)* | `MARKET_DATA_PROVIDER`, provider key |
| Macro (CPI, rates, yields, curves, FX, gold, oil, credit spreads) | `MacroProvider` | `DemoMacroProvider` — mean-reverting seeded series around realistic anchors | **`FredMacroProvider`** (St. Louis Fed / FRED) — free key, authoritative | `FRED_API_KEY` (`MACRO_PROVIDER=fred`) |
| News (company + macro) | `NewsProvider` | `DemoNewsProvider` — templated headlines with real-looking publishers/dates | **`NewsApiProvider`** (NewsAPI.org) | `NEWSAPI_KEY` (`NEWS_PROVIDER=newsapi`) |
| FX reference rates | `FxProvider` | `DemoFxProvider` (USD/EUR/JPY/TWD) | *(exchangerate adapter — stub)* | `FX_PROVIDER` |

## Canonical macro series

`src/data/providers/types.ts` → `MACRO_KEYS` maps the app's internal keys to FRED series IDs:

| Key | Series | FRED ID |
|---|---|---|
| `CPI_YOY` / `CORE_CPI_YOY` | US CPI / core CPI, converted to YoY % | `CPIAUCSL` / `CPILFESL` |
| `FEDFUNDS` / `ECB_MRO` | policy rates | `FEDFUNDS` / `ECBMRRFR` |
| `US2Y` `US10Y` `US_REAL10Y` | Treasury yields / TIPS | `DGS2` `DGS10` `DFII10` |
| `DE10Y` `JP10Y` | Bund / JGB 10y | `IRLTLT01DEM156N` / `IRLTLT01JPM156N` |
| `IG_OAS` `HY_OAS` | ICE BofA option-adjusted spreads | `BAMLC0A0CM` / `BAMLH0A0HYM2` |
| `DXY` `EURUSD` `USDJPY` | broad USD index / FX | `DTWEXBGS` `DEXUSEU` `DEXJPUS` |
| `GOLD` `BRENT` | gold fixing / Brent | `IR14270` / `DCOILBRENTEU` |
| `US_UNEMP` | unemployment rate | `UNRATE` |

## Provenance

Every ingested value is linked to a `Source` row (`type`, `title`, `publisher`, `url`,
`publishedAt`, `retrievedAt`, `freshness` ∈ LIVE/TODAY/WEEK/HISTORICAL, `isDemo`). Sources
are de-duplicated by `(publisher, title)`. Demo rows carry `isDemo = true` and are rendered
with a **SIMULATED DATA** badge; nothing simulated is ever labelled real-time.

## Refresh

- `npm run db:ingest [-- --lookback N]` — manual full refresh.
- `POST /api/data/refresh` — authenticated in-app refresh.
- The weekly job (`runWeeklyReview`) ingests a 60-day window before regenerating the strategy.
- Ingestion is **window-replace**: only the ingested date range is rewritten, so long price
  history accumulates across refreshes.
