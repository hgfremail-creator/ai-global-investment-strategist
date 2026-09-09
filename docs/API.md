# API

All routes are Next.js Route Handlers under `src/app/api/`. Bodies are JSON and validated
with Zod. Auth is a signed httpOnly session cookie (`gis_session`) unless noted.

## Auth

### `POST /api/auth/register`
Body `{ email, password (≥8), name? }` → sets the session cookie, `{ ok: true }`.
`409` if the email exists.

### `POST /api/auth/login`
Body `{ email, password }` → sets the session cookie. `401` on bad credentials.
Rate-limited per IP (8 burst, ~1 / 20 s refill) → `429` with `Retry-After`.

### `POST /api/auth/logout`
Clears the session cookie.

## Onboarding

### `POST /api/onboarding`  *(auth)*
Body:
```jsonc
{
  "capitalAmount": 100000, "capitalCurrency": "USD",   // USD | EUR | JPY | TWD
  "riskScore": 3,                                        // 1 (highest risk) … 5 (lowest)
  "horizon": "Y5_10",                                    // LT_1Y | Y1_3 | Y3_5 | Y5_10 | GT_10Y
  "objective": "BALANCED_GROWTH",                        // GROWTH | BALANCED_GROWTH | PRESERVATION | INCOME | GROWTH_PROTECTION
  "existingPositions": [{ "ticker": "NVDA", "quantity": 40, "avgPrice": 120 }]
}
```
Creates the active `RiskProfile` + `Portfolio` (capital converted to USD), imports matching
existing positions, and generates the initial `StrategyVersion`.

## Data & strategy

### `POST /api/data/refresh`  *(auth)*
`?lookbackDays=N` optional. Re-ingests prices / fundamentals / macro / news / benchmarks / FX.
Returns the ingestion report.

### `POST /api/weekly/run`  *(auth)*
Runs the full weekly review for the user's portfolio (ingest → recompute → diff → new
immutable version → report). Rate-limited (3 burst). Returns `{ version, weekOf, … }`.

### `POST /api/cron/weekly-review`  *(bearer secret)*
Header `Authorization: Bearer $CRON_SECRET` (constant-time compared). Runs the weekly review
for **every** portfolio, or one via `?portfolioId=`. `?force=1` to bypass the idempotency
hash. This is the endpoint a scheduler (Vercel Cron, `node-cron`, Task Scheduler) hits.

## Advisor & What-If

### `POST /api/advisor`  *(auth)*
Body `{ question }`. Returns `{ answer, citations: [{kind, ref, detail}], usedFallback }`.
Answers only from the user's stored strategy / scores / recommendations / risk data. Uses the
LLM when `ANTHROPIC_API_KEY` is set, otherwise a deterministic intent router. Rate-limited
(10 burst).

### `POST /api/whatif`  *(auth)*
Body (all optional):
```jsonc
{
  "capitalUsd": 250000,
  "riskScore": 4,
  "horizon": "Y3_5",
  "excludeSectors": ["Information Technology"],
  "excludeAssetClasses": ["GOLD"],
  "minGoldPct": 0.25,
  "customShock": { "equity": -0.15, "growthEquity": -0.1, "gold": 0.1, "bonds": 0.02, "jpy": 0.05, "usd": 0.03 }
}
```
Recomputes the portfolio **without persisting** and returns the hypothetical allocation, its
factor exposure and volatility, a diff vs the live strategy, and (if `customShock` given) a
custom stress result.

## Error shape

`{ "error": "message", "details"?: <zod flatten> }` with an appropriate 4xx/5xx status.
