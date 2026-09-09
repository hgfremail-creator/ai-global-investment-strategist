# ARCHITECTURE — AI Global Investment Strategist

> **Status:** Living document. Updated at the end of every build phase.
> **Last updated:** 2026-09-09 (Phase 1 complete — scaffold, DB, auth, onboarding, shell)

---

## 0. What this application is

A **paper‑investing research application** that behaves like a disciplined institutional
global investment strategist. Given a user's capital, risk tolerance, investment horizon,
objective and existing holdings, it:

1. Ingests market, fundamental, macro and news data (via pluggable providers; a fully
   deterministic **demo provider** ships by default so the app runs with zero external keys).
2. Computes indicators, a **market‑regime** classification, and a transparent **0–100 score**
   for every security in the universe.
3. Constructs a diversified portfolio with a **constrained optimizer** (single‑stock, sector,
   country, currency, volatility and minimum‑defensive limits).
4. Produces per‑security recommendations (STRONG BUY / BUY / HOLD / REDUCE / SELL / WATCH)
   with thesis, catalysts, risks, invalidation conditions, conviction, evidence quality and
   sources — including **"why not"** for rejected candidates.
5. Runs a **weekly review** that diffs the new strategy against the previous version,
   explains every change, and stores an immutable **strategy version**.
6. Provides risk dashboards, stress tests, a what‑if tool and a natural‑language advisor
   that answers strictly from the application's own stored data.

It **never** guarantees returns, fabricates data/sources/price targets, hides negatives, or
silently changes an allocation. Where evidence is thin it says so and may recommend **NO ACTION**.

This is **not** a brokerage integration and gives **no personalised investment advice** in the
regulated sense — it is a research and portfolio‑analysis tool. Disclaimers are first‑class UI.

---

## 1. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript** | Server Components + Route Handlers; all secrets server‑side. |
| Styling | **Tailwind CSS v4** | Institutional "terminal" theme, dark‑first, light supported. |
| Charts | **Recharts** | Donut, bar, area, drawdown, benchmark overlays. |
| DB (dev) | **SQLite via Prisma** | Zero‑setup; `DATABASE_URL="file:./dev.db"`. Runs immediately. |
| DB (prod) | **PostgreSQL via Prisma** | `prisma/schema.prisma` `provider` swap + `docker-compose.yml`. Same models. |
| ORM | **Prisma** (`engineType = "client"`, engine‑free) + **`@prisma/adapter-better-sqlite3`** | `prisma migrate`. No native query engine → runs on Windows‑ARM and other unsupported‑engine platforms. Prod swaps to `@prisma/adapter-pg`. |
| Auth | **Auth.js (next-auth v5) — Credentials** | bcrypt password hash; JWT session cookie (httpOnly, sameSite=lax). Seeded demo user. |
| AI | **Anthropic API** (`@anthropic-ai/sdk`, `claude-sonnet-5`) | Structured output via tool-use JSON schema. **Optional** — deterministic fallback writer when `ANTHROPIC_API_KEY` is unset. |
| Market data | Provider interface + **DemoProvider** (default) | Real adapters stubbed: `FmpProvider`, `AlphaVantageProvider`. |
| News | Provider interface + **DemoNewsProvider** (default) | Real adapter stubbed: `NewsApiProvider`. |
| Scheduled jobs | **Route handler** `POST /api/cron/weekly-review` guarded by `CRON_SECRET` | Docs for Vercel Cron / `node-cron` / Task Scheduler. |
| Testing | **Vitest** (unit + integration) + **Playwright** (smoke, optional) | Deterministic engine tests are the core suite. |
| Validation | **Zod** | Every API boundary and every AI output parsed with Zod. |
| Money | **decimal.js** + integer minor units where stored | No float drift in allocations. |

### Why SQLite default, PostgreSQL for production
The spec requires "works immediately" **and** PostgreSQL. Both are satisfied: models and
Prisma Client code are identical; only the datasource `provider` and connection string
change. `npm run db:reset` seeds SQLite in seconds; `docker compose up db` + `DATABASE_PROVIDER=postgresql`
gives the production target. CI runs the suite against both.

---

## 2. Layered design

```
┌─────────────────────────────────────────────────────────────────┐
│ PRESENTATION  Next.js App Router pages / React components         │
│   Dashboard · Strategy · Opportunities · Portfolio · Markets ·    │
│   Research · Risk · Weekly Review · History · AI Advisor          │
└───────────────▲─────────────────────────────────────────────────┘
                │ typed server actions / route handlers (Zod)
┌───────────────┴─────────────────────────────────────────────────┐
│ APPLICATION SERVICES  orchestration, persistence, versioning      │
│   OnboardingService · StrategyService · WeeklyReviewService ·     │
│   AdvisorService · StressTestService · WhatIfService              │
└───────────────▲─────────────────────────────────────────────────┘
                │
   ┌────────────┼───────────────┬───────────────┬─────────────────┐
   │            │               │               │                 │
┌──┴───────┐ ┌──┴─────────┐ ┌───┴────────┐ ┌────┴───────┐ ┌───────┴──────┐
│ DATA     │ │ ANALYSIS   │ │ AI         │ │ PORTFOLIO  │ │ PERFORMANCE  │
│ LAYER    │ │ LAYER      │ │ REASONING  │ │ ENGINE     │ │ / RISK       │
│          │ │            │ │ LAYER      │ │            │ │              │
│ provider │ │ indicators │ │ structured │ │ constrained│ │ returns,     │
│ adapters │ │ scoring    │ │ JSON via   │ │ optimizer  │ │ vol, Sharpe, │
│ + cache  │ │ regime     │ │ Anthropic  │ │ + limits   │ │ Sortino, DD  │
│ + Source │ │ engine     │ │ (optional) │ │            │ │ stress tests │
│ records  │ │            │ │ fallback ▢ │ │            │ │              │
└──────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────────┘
```

**Hard rule:** the AI Reasoning Layer receives already‑computed structured data and returns
**interpretation text + structured decision metadata only**. All numbers that drive the
portfolio (scores, weights, dollar amounts, regime) come from the deterministic Analysis and
Portfolio layers. The AI can *recommend* a tilt within configured bounds; the Portfolio
Engine enforces constraints and produces the final numbers.

---

## 3. Data model (Prisma entities)

Relational, migrated. Key entities and relationships:

| Entity | Purpose | Key fields / relations |
|---|---|---|
| `User` | Account | email, passwordHash, baseCurrency |
| `RiskProfile` | One active + history per user | riskScore (1=highest…5=lowest), horizon, objective, constraintsJson (typed, validated) |
| `Security` | Universe member | ticker, name, country, sector, industry, currency, assetClass, listingExchange, isDemo |
| `Market` | Country/exchange metadata | code, name, currency, benchmarkSymbol |
| `Price` | Time series | securityId, date, close, volume, source → `Source` |
| `Fundamental` | Point‑in‑time fundamentals | securityId, asOf, revenueGrowth, epsGrowth, fcfMargin, roic, netDebtToEbitda, grossMargin, pe, forwardPe, evEbitda, peg, ps, fcfYield, source |
| `MacroIndicator` | Macro series | key (CPI, FEDFUNDS, US10Y, DXY, …), region, date, value, source |
| `MarketRegime` | Regime snapshots | asOf, regime, score, driversJson, source refs |
| `SecurityScore` | Computed score history | securityId, asOf, overall, businessQuality, growth, valuation, earningsMomentum, marketMomentum, aiExposure, balanceSheet, risk, weightsJson, contributionsJson |
| `Portfolio` | A user's paper portfolio | userId, name, baseCurrency, cashMinorUnits |
| `PortfolioPosition` | Current holdings | portfolioId, securityId, quantity, avgPriceMinorUnits, isUserSupplied |
| `StrategyVersion` | **Immutable** weekly snapshot | portfolioId, version (int), createdAt, regimeId, allocationJson, targetsJson, fxRatesJson, narrativeMd, previousVersionId |
| `Recommendation` | Per security, per strategy version | strategyVersionId, securityId, action, conviction, evidenceQuality, targetWeight, targetUsd, entryStrategy, timeHorizon, thesisMd, catalystsJson, risksJson, invalidationJson, bullBearBaseJson, devilsAdvocateMd, factInterpretationConclusionJson |
| `RecommendationSource` | M:N recommendation↔source | recommendationId, sourceId, relevance |
| `Source` | Provenance | type (FILING/EARNINGS/MARKET_DATA/MACRO/NEWS), title, publisher, url, publishedAt, retrievedAt, freshness (LIVE/TODAY/WEEK/HISTORICAL), excerpt |
| `NewsItem` | Ingested news | securityId?, region?, title, url, publisher, publishedAt, summary, sentiment, source |
| `PortfolioSnapshot` | Valuation over time | portfolioId, date, totalUsd, positionsJson, source=derived |
| `RiskMetric` | Computed risk per strategy version | volatility, expectedDrawdown, maxHistoricalDrawdown, concentrationHHI, aiFactorExposure, semiExposure, usTechExposure, countryExposureJson, currencyExposureJson, sectorExposureJson, valuationRisk, liquidityRisk, geopoliticalRisk |
| `StressTest` | Scenario results | strategyVersionId, scenarioKey, assumptionsJson, estimatedPortfolioImpactPct, byAssetJson, isHypothetical=true |
| `Benchmark` | Reference index series | symbol, name, date, close |
| `Transaction` | Paper trades | portfolioId, securityId, side, quantity, priceMinorUnits, executedAt, note |
| `ResearchReport` | Generated weekly reports (Markdown) | strategyVersionId, weekOf, markdown, sectionsJson |
| `AIAnalysis` | Raw AI request/response audit | strategyVersionId?, kind, model, promptHash, inputJson, outputJson, usedFallback, createdAt |
| `ConflictDisclosure` | COI register | scope (PROVIDER/AI_VENDOR/DATA_VENDOR), description, securityId?, active |
| `FxRate` | Currency conversion used | base, quote, rate, asOf, source |

Immutability: `StrategyVersion`, `Recommendation`, `ResearchReport`, `AIAnalysis`,
`PortfolioSnapshot` rows are never updated after creation — the weekly job always inserts a
new `StrategyVersion` with an incremented `version` and a `previousVersionId` link.

---

## 4. Analysis layer — scoring model

Per security, each sub‑score is 0–100, computed from normalised inputs (winsorised
percentile rank within the security's peer set + absolute thresholds). Default weights
(configurable per `RiskProfile.constraintsJson.scoreWeights`):

| Component | Weight | Inputs |
|---|---:|---|
| Business quality | 20% | revenue growth, EPS growth, FCF margin, ROIC, net debt/EBITDA, gross margin, moat flag |
| Growth | 20% | trailing & expected revenue/EPS growth, earnings‑revision trend, TAM tier, AI‑exposure |
| Valuation | 15% | PE, fwd PE, EV/EBITDA, PEG, P/S, FCF yield — each vs the security's own history, its sector, and growth‑adjusted |
| Earnings momentum | 10% | direction & magnitude of consensus revisions over 4/13 weeks |
| Market momentum | 10% | 1/3/6/12‑month total return, blended, volatility‑scaled |
| AI exposure | 10% | 0–100 sub‑model (infra, semis, GPU, networking, cloud, datacentre, enterprise AI, cybersecurity, robotics) |
| Balance sheet | 5% | leverage, interest coverage, liquidity, maturity wall |
| Risk (inverse) | 10% | realised vol, max drawdown, valuation risk, concentration, geo & FX exposure — higher score = lower risk |

`overall = Σ weightᵢ · subScoreᵢ`. The UI shows each component and its **point contribution**
(`weightᵢ · subScoreᵢ`) so the score is fully decomposable.

Non‑equity assets use adapted scorecards:
- **Gold**: real yields, DXY trend, central‑bank demand proxy, inflation expectations, geo risk, momentum.
- **Bonds**: yield level vs history, duration, rate‑path sensitivity, credit spread, FX (for the user's base currency).
- **Cash**: front‑end yield, regime, dry‑powder value.

---

## 5. Market‑regime engine

Inputs (all from Analysis layer, each with a Source): S&P 500 trend (50/200 dma), Nasdaq
trend, realised & implied volatility, credit spreads (IG/HY proxy), 10y & 2s10s Treasuries,
gold trend, DXY trend, market breadth proxy, earnings‑revision breadth, semiconductor
relative strength.

Each indicator → a −2…+2 vote with a written justification. Weighted sum → regime band:

| Score | Regime |
|---|---|
| ≥ +1.2 | Strong Risk‑On |
| +0.4 … +1.2 | Risk‑On |
| −0.4 … +0.4 | Neutral |
| −1.2 … −0.4 | Risk‑Off |
| ≤ −1.2 | Crisis / Defensive |

Output persisted as `MarketRegime` with `driversJson` (indicator, value, vote, rationale,
sourceId). The Strategy page renders "why this regime" directly from that.

---

## 6. Portfolio engine — construction algorithm

**Step 1 — Strategic sleeve targets.** A base allocation matrix keyed by
`(riskScore, horizonBucket)` gives sleeve weights for Growth / Defensive equity / Gold /
Bonds / Cash / Diversifiers. Example (Risk 3, 5–10y): 45 / 20 / 12 / 18 / 5.

**Step 2 — Regime tilt.** The regime shifts sleeves within bounded steps
(e.g. Risk‑Off: Growth −10pts, Gold +4, Bonds +4, Cash +2), never breaching the
risk‑profile's **minimum defensive** floor or maximum growth ceiling.

**Step 3 — Macro & valuation tilt.** Bounded adjustments from macro (real yields, curve,
USD) and aggregate universe valuation percentile.

**Step 4 — Candidate selection per sleeve.** Rank universe by `overall` score within sleeve,
filter by minimum score and data sufficiency, then select to satisfy diversification.

**Step 5 — Within‑sleeve weights.** Score‑weighted, then **risk‑parity dampened**
(divide by realised vol, renormalise), then clamp to `maxSingleName`.

**Step 6 — Constraint projection.** Iteratively project onto the feasible set:
`maxSingleName` (default 10%), `maxSector` (30%), `maxCountry` (60%), `maxCurrency` (configurable),
`maxPortfolioVol` (from risk profile), `minDefensive` (from risk profile). Uses
water‑filling / proportional redistribution until all constraints hold or the engine reports
infeasibility and falls back to a documented safe allocation.

**Step 7 — Existing‑holdings reconciliation.** User positions are mapped to the target;
overlaps reduce suggested new buys (e.g. large existing NVDA → AI‑semis target already partly
filled → recommend HOLD not BUY, and flag concentration).

**Step 8 — Rounding.** Weights rounded to 0.1%; residual assigned to Cash so the total is
**exactly 100.0%**. Dollar amounts via `decimal.js` from USD capital; residual cents to Cash.

**Step 9 — Factor‑exposure check.** Compute AI‑factor, semiconductor, US‑tech exposure by
summing look‑through factor loadings; emit a concentration warning if thresholds exceeded
even when name‑count looks diversified.

All steps are pure functions in `src/engine/*` with unit tests asserting: total = 100%,
constraints respected, monotonic response to risk score, determinism.

---

## 7. AI reasoning layer

- **Inputs:** a compact JSON bundle — regime + drivers, per‑security scores + contributions +
  raw fundamentals, sleeve targets, selected names & weights, existing holdings, relevant
  news headlines with dates and Source IDs.
- **Call:** Anthropic Messages API, `claude-sonnet-5`, with a **tool/JSON schema** forcing
  structured output (see §"Structured AI output" in the spec). Temperature low. `system`
  prompt encodes the investment philosophy, the FACT / INTERPRETATION / AI CONCLUSION
  discipline, the guardrails, and "cite only provided Source IDs — never invent".
- **Validation:** response parsed with Zod. Any security referencing an unknown Source ID,
  containing a fabricated price target, or missing required fields → rejected, one retry,
  then **fallback writer**.
- **Fallback writer** (`ANTHROPIC_API_KEY` unset or AI failed): a deterministic templating
  module turns the structured analysis into readable thesis/catalyst/risk prose. Clearly
  labelled "Generated without LLM — deterministic summary." The app is fully functional
  without any AI key.
- **Audit:** every call (prompt hash, inputs, outputs, token usage, `usedFallback`) stored in
  `AIAnalysis`.
- **Prompts** live in `src/ai/prompts/` as versioned files and are documented in `docs/AI_PROMPTS.md`.

Investment Committee mode and Devil's Advocate are second structured passes over each
high‑conviction position (bull/base/bear + "assume the thesis is wrong").

---

## 8. Weekly refresh process

`POST /api/cron/weekly-review` (auth: `Authorization: Bearer $CRON_SECRET`) →
`WeeklyReviewService.run(portfolioId)`:

1. Pull fresh data via providers (prices, fundamentals, macro, news) → persist with Sources.
2. Recompute indicators, `SecurityScore`s, `MarketRegime`.
3. Run Portfolio Engine → proposed allocation & targets.
4. Load latest `StrategyVersion` (previous). Diff sleeves, names, weights, actions.
5. AI reasoning pass (or fallback) for narrative + per‑change explanation.
6. Compute `RiskMetric`s and run the standard `StressTest` scenarios.
7. Insert **new** `StrategyVersion` (`version = prev.version + 1`, `previousVersionId` set),
   `Recommendation`s, `RiskMetric`, `StressTest`s, `ResearchReport`, `AIAnalysis`.
8. Never mutate prior rows. Return a summary ("3 changes this week").

Idempotency: a run is a no‑op (no new version) if the underlying data hash is unchanged
since the last version, unless `?force=1`.

---

## 9. Security model

- All provider keys, `CRON_SECRET`, `AUTH_SECRET`, `ANTHROPIC_API_KEY` are **server‑only**
  env vars. No `NEXT_PUBLIC_` secret. A test asserts no secret name appears in the client bundle.
- Auth.js credentials, bcrypt (cost 12), httpOnly + sameSite=lax + secure cookies, CSRF via
  Auth.js. Route handlers check session; cron route checks bearer secret with constant‑time compare.
- All external input validated with Zod; Prisma parameterises all queries.
- Rate limiting on AI/advisor routes (token bucket, per user).
- CSP header, `X-Content-Type-Options`, `Referrer-Policy`, no inline scripts beyond Next's.
- Secrets never logged; `AIAnalysis` stores prompt **hash**, not raw keys.
- `docs/SECURITY_CHECKLIST.md` maintained.

---

## 10. Compliance / guardrails

- Prominent, non‑footer disclaimer on first run and persistent banner; risk warning card
  rendered next to every recommendation and every stress test ("hypothetical").
- Guardrail module rejects any AI output that guarantees returns, states certainty,
  fabricates data/sources/targets, or hides a known negative (checked against the structured
  risk list).
- "Insufficient evidence" and "NO ACTION" are valid first‑class outcomes.
- `ConflictDisclosure` register surfaced in the UI footer and next to affected securities.
- `docs/COMPLIANCE_CHECKLIST.md` maintained; architecture leaves a seam for a real
  compliance review before any commercial deployment.

---

## 11. Implementation roadmap (phase = commit checkpoint)

| Phase | Deliverable | Exit tests |
|---|---|---|
| 1 ✅ | Scaffold, Prisma schema + migration, seed demo universe (6 markets / 48 securities), custom JWT+bcrypt auth, app shell + nav, disclaimer gate, 5‑step onboarding, sleeve‑level `StrategyVersion` + immutable history skeleton, Vitest harness | ✅ `npm run build` green, login+onboarding flow works end‑to‑end, seed populates, 9 engine tests pass |
| 2 ✅ | Data layer: `MarketDataProvider` / `MacroProvider` / `NewsProvider` / `FxProvider` interfaces; deterministic canonical-path demo provider; **FRED** + **NewsAPI** real adapters; `providerStatus()` registry with demo fallback; bulk idempotent `ingestAll()` (window-replace, history preserved); Source de-dup; Markets page (benchmarks + macro panels + provider badges) | ✅ typecheck+build green, 13 tests pass, partial re-ingest preserves history, Markets renders |
| 3 ✅ | Analysis layer: `indicators.ts` (momentum/vol/drawdown/trend), `scoring.ts` (8-component 0–100 model, peer-percentile + absolute anchor blend, non-equity scorecards), `aiExposure.ts`, `regime.ts` (10-indicator weighted-vote engine); `services/analysis.ts` persists `SecurityScore` + `MarketRegime`; `generateStrategy` uses the real regime; Research list + per-security breakdown page with price chart | ✅ 20 tests (determinism, contributions sum to overall, regime bands, ranking sanity), build green, `docs/SCORING_MODEL.md` |
| 4 ✅ | Portfolio engine (`engine/allocation.ts`): macro/valuation sleeve tilt, per-sleeve candidate selection (duration fit for bonds), score × risk-parity within-sleeve weights, water-fill single-name caps, iterative sector/country/currency projection, portfolio-vol check, existing-holdings reconciliation, factor look-through + concentration warnings, exact-100% / exact-capital rounding; FX to USD; `generateStrategy` full pipeline + `StrategyChange` diffing; Strategy / Portfolio / Dashboard rebuilt on real allocations with donut + exposure charts | ✅ 28 tests (100% sum, capital sum, all caps, monotonic vs risk, capital-scaling, name removal, AI-concentration, reconciliation), build green, `docs/PORTFOLIO_ALGORITHM.md` |
| 5 ✅ | AI layer: `ai/client.ts` (Anthropic `messages.stream`, adaptive thinking, JSON-schema structured output, 8/batch, Zod re-validation, refusal→fallback), `ai/fallback.ts` (deterministic writer, same schema), `ai/guardrails.ts` (no guaranteed returns / price targets / unknown sources / missing risks; both paths), `services/recommendations.ts` (persist `Recommendation`/`RecommendationSource`/`AIAnalysis`); SDK 0.32→0.124; Opportunities page + "why not" rejected candidates, `RecommendationCard` on Research | ✅ 35 tests, build green, `docs/AI_PROMPTS.md` |
| 6 | Risk engine: RiskMetric, factor look‑through, Risk dashboard + charts | HHI, factor exposure math, concentration warning |
| 7 | Weekly strategy engine: WeeklyReviewService, cron route, diff + change explanations, Weekly Review page + report | new version created, prior immutable, diff correctness |
| 8 | Historical tracking: StrategyVersion browser, compare view, History page | old versions byte‑stable, compare diff |
| 9 | Stress testing + What‑if + NL Advisor (data‑grounded) | scenario math, what‑if recompute, advisor cites stored data only |
| 10 | UI refinement: full chart set, terminal theme, responsive, a11y | visual smoke, Lighthouse a11y |
| 11 | Full test sweep (spec §47), fix, docs | entire suite green |
| 12 | Production hardening: Postgres path, docker-compose, rate limits, headers, CI, final docs | prod build, both DBs in CI |

Each phase ends with: run tests → fix → verify → update this file + `README.md` → commit.

---

## 12. Directory layout

```
/prisma            schema.prisma, migrations/, seed.ts, demo-data/
/src
  /app             App Router: (auth)/, dashboard/, strategy/, opportunities/,
                   portfolio/, markets/, research/, risk/, weekly-review/, history/,
                   advisor/, api/
  /components      UI: charts/, layout/, recommendation/, cards/, disclaimer/
  /engine          pure: scoring.ts, regime.ts, allocation.ts, constraints.ts,
                   factors.ts, fx.ts, risk.ts, stress.ts, performance.ts
  /data            providers/ (interface + demo + stubbed real), ingestion.ts, sources.ts
  /ai              client.ts, schema.ts, fallback.ts, prompts/, committee.ts, guardrails.ts
  /services        onboarding, strategy, weeklyReview, advisor, whatIf, stressTest
  /lib             db.ts, auth.ts, money.ts, zod schemas, config (constraint defaults)
  /test            engine specs, service specs, fixtures
/docs              METHODOLOGY.md, SCORING_MODEL.md, PORTFOLIO_ALGORITHM.md,
                   WEEKLY_REFRESH.md, DATA_SOURCES.md, AI_PROMPTS.md, API.md,
                   SECURITY_CHECKLIST.md, COMPLIANCE_CHECKLIST.md
ARCHITECTURE.md    this file
README.md          setup + methodology overview
.env.example       every variable, all optional except AUTH_SECRET + DATABASE_URL
docker-compose.yml postgres for production target
```

---

## 13. Determinism & demo data

- The DemoProvider generates prices via a **seeded** PRNG (mulberry32, seed per ticker) around
  realistic anchor values and volatilities, so every machine sees the same series and every
  engine test is reproducible.
- All demo rows carry `isDemo = true` / `Source.type` with publisher `"Demo dataset"` and are
  rendered with a "SIMULATED DATA" badge. Nothing demo is ever labelled real‑time.
- Swapping in a real provider is a one‑line change in `src/data/providers/index.ts` plus the
  provider's API key in `.env`.
