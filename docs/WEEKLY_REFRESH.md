# Weekly refresh process

Entry points:

- **Scheduled** — `POST /api/cron/weekly-review` with `Authorization: Bearer $CRON_SECRET`
  (constant-time compared). Runs for every portfolio, or one via `?portfolioId=`.
- **In-app** — `POST /api/weekly/run` (authenticated user) → the "Run weekly review now" button.
- **CLI** — `npm run cron:weekly [-- --times N]`.

All three call `runWeeklyReview(portfolioId)` in `src/services/weeklyReview.ts`.

## Steps

1. **Date the review.** With the demo provider the simulated clock advances one week per
   existing version (`DEMO_AS_OF + 7·n`), so the review has real week-over-week movement to
   explain. With a live provider, `weekOf = now`.
2. **Ingest fresh data** — `ingestAll({ asOf, lookbackDays: 400 })`: prices, fundamentals,
   macro, benchmarks, news, FX. Window-replace, so long price history accumulates. Each value
   is linked to a `Source`.
3. **Recompute the Analysis layer** — `runAnalysis()`: `SecurityScore` rows for every
   security at the new `asOf`, and a fresh `MarketRegime` snapshot.
4. **Recompute sleeve targets** — base matrix → regime tilt → macro/valuation tilt.
5. **Construct the portfolio** — `buildPortfolio()` with `previousTickers` passed in, so an
   incumbency bonus (+4 score points, selection only) keeps turnover low — mostly weight
   moves, occasional name changes.
6. **Insert a new `StrategyVersion`** — `version = prev.version + 1`, `previousVersionId` set,
   `dataHash` of the inputs. Previous versions are **never** updated (idempotency: an
   unchanged `dataHash` is a no-op unless `force`).
7. **Diff vs the previous version** — `diffAndPersistChanges()`: sleeve-level and
   position-level changes (≥ 1 pp) become `StrategyChange` rows.
8. **Compute risk** — `RiskMetric` + the five `StressTest` scenarios.
9. **Generate recommendations** — the AI reasoning layer (or deterministic fallback) writes
   `Recommendation` + `RecommendationSource` + an `AIAnalysis` audit row.
10. **Build the weekly report + enrich changes** — `buildResearchReport()`:
    - for each `POSITION` change, look up the security's score at the new `asOf` vs the
      previous version's date and append the concrete evidence
      (`"overall score −6.1, price momentum −16.5 since 2026-09-18"`);
    - for each `SLEEVE` change, append the regime-composite delta;
    - assemble the 15-section `ResearchReport` (Executive Summary, Market Regime, Macro
      Environment, Portfolio Allocation, Top Opportunities, Stocks Reduced, Stocks Sold,
      Defensive Positioning, Gold, Bonds, Currency, Risks, Changes From Last Week, Investment
      Thesis, Sources) as Markdown + `sectionsJson`.

## Immutability & history

`StrategyVersion`, `Recommendation`, `RiskMetric`, `StressTest`, `ResearchReport`,
`AIAnalysis`, `StrategyChange` rows for a given version are written once. The version chain
(`previousVersionId`) lets the History page (Phase 8) reconstruct and compare any two weeks.
