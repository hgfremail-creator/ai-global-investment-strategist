# Portfolio-construction algorithm

`src/engine/allocation.ts` → `buildPortfolio(input)` (pure, deterministic).
Orchestrated by `src/services/strategy.ts` → `generateStrategy()`.

## Inputs

- `capitalUsdMinor` — invested capital (USD cents).
- `sleeveTargets` — from the sleeve engine (see below).
- `constraints` — the risk profile's `ConstraintSet`.
- `candidates` — every security with a current score: `{ ticker, sleeve, assetClass,
  country, sector, currency, score (0–100), vol (annualised), factorLoadings, priceUsd }`.
- `existing` — the user's current holdings with USD market value.
- `horizonBucket` — short / medium / long.

## Step 0 — sleeve targets (`src/engine/sleeves.ts`)

1. **Base matrix** `BASE_SLEEVE_MATRIX[riskScore][horizonBucket]` — strategic weights for
   growth / defensive equity / gold / bonds / cash / diversifiers (each row sums to 1).
2. **Regime tilt** `tiltSleeves()` — `REGIME_TILTS` percentage-point deltas by regime, then
   re-enforce the profile's growth ceiling, defensive floor and minimum cash, then renormalise.
3. **Macro / valuation tilt** `macroValuationTilt()` — bounded (±6 pts out of growth) shifts
   from: real-yield direction, USD trend, and the aggregate equity forward-P/E percentile
   (proxied from the mean equity valuation sub-score). Floors/ceilings re-applied.

## Step A — candidate selection per sleeve

For each sleeve with target > 0:

- **cash** — the single cash instrument.
- **gold** — top 1–2 by score (keeps an alternative for the fee/structure comparison).
- **bonds** — score adjusted for **duration fit** to the horizon (short horizon favours
  1–3y; long favours intermediate), top 3.
- **equity sleeves / diversifiers** — filter to `score ≥ minScoreToHold`, sort by score,
  take `ceil(sleeveWeight / min(maxSingleName, sleeveWeight)) + 2` names (a diversification
  buffer), bounded by availability.

## Step B — within-sleeve weights

`weightᵢ ∝ 0.55·scoreWeightᵢ + 0.45·riskParityWeightᵢ` where `riskParityWeightᵢ ∝ 1/volᵢ`.
Then **water-fill** against each name's cap (`nameCap`: `maxSingleName` for risk assets,
`max(maxSingleName, 25%)` for government bonds, uncapped for cash), redistributing excess to
names with room. If the sleeve is too large to diversify under the cap given the instruments
available, every name is set to its cap and the **shortfall is spilled to cash** (with a
warning when > 2 %).

## Step C — global constraint projection

Iterative (≤ 40 passes): for each violated group — **single-name**, **sector**
(`maxSector`), **country** (`maxCountry`), **currency** (`maxCurrency`) — scale the
over-weight members down to the limit and redistribute the freed weight to the rest,
proportional to current weight. A final hard single-name clamp guarantees the cap, with
overflow going to cash. Group caps that still can't be met (too few diversifying
instruments) produce an explicit **warning** rather than a silent breach.

## Step D — portfolio-volatility check

`estimatePortfolioVol` — diversified estimate assuming uniform pairwise correlation ρ ≈ 0.45
among risk assets, 0 for cash. If it exceeds `maxPortfolioVol`, weight is shifted from the
highest-volatility holdings toward the lowest-volatility holding and a warning is recorded.

## Step E — existing-holdings reconciliation

For each existing position: `existingWeight = marketValueUsd / capital`, compared to the
name's target weight → note (`at target` / `below target, add ~X%` / `above target, trim X%`
/ `not in target, consider reducing`). Feeds the Portfolio page and the Phase-5 recommendations.

## Step F — factor look-through & concentration warnings

`factorExposure_k = Σ weightᵢ · factorLoadingᵢ_k` for aiFactor / semiconductor / usTech /
defensive / rates / gold. Warnings fire at aiFactor > 70 % ("owning several AI names is not
the same as being diversified") and semiconductor > 40 %.

## Step G — rounding

Weights rounded to 0.1 %; the residual is placed on cash (else the largest holding) so the
total is **exactly 100.0 %**. USD amounts via `allocateMinor` (largest-remainder) so they
sum **exactly** to the invested capital.

## Invariants (tested — `src/test/allocation.test.ts`)

- weights sum to exactly 100.0 % for every risk profile;
- USD amounts sum to exactly the invested capital;
- single-name / sector / country / currency caps respected (or an explicit warning);
- higher risk score (= lower risk) never yields more growth-sleeve weight;
- changing capital scales only the dollar amounts, not the weights;
- removing a name reallocates and still sums to 100 %;
- AI concentration is flagged; existing-holding over/under/at-target classification.
