# Scoring model

Every security receives a transparent **0–100 overall score**:

```
overall = Σ  weightᵢ · subScoreᵢ            (subScoreᵢ ∈ [0, 100])
```

The UI shows each `subScoreᵢ`, its `weightᵢ`, and its **point contribution**
(`weightᵢ · subScoreᵢ`, which sum to `overall`).

Implementation: `src/engine/scoring.ts` (pure), `src/engine/indicators.ts`,
`src/engine/aiExposure.ts`, `src/engine/normalize.ts`. Orchestrated + persisted by
`src/services/analysis.ts` into the `SecurityScore` table (`asOf` = latest price date).

## Default component weights

| Component | Weight | Inputs |
|---|---:|---|
| Business quality | 20% | ROIC, FCF margin, gross & operating margin, moat flag |
| Growth | 20% | revenue & EPS growth (trailing + expected), TAM tier |
| Valuation *(cheap = high)* | 15% | forward P/E, EV/EBITDA, P/S, FCF yield, PEG (growth-adjusted) |
| Earnings momentum | 10% | 4-week & 13-week consensus EPS revisions |
| Market momentum | 10% | 1/3/6/12-month total return (blended), 50/200-dma trend |
| AI exposure | 10% | `aiExposureScore()` — see below |
| Balance sheet | 5% | net debt / EBITDA |
| Risk *(safer = high)* | 10% | realised volatility, max drawdown, valuation-risk penalty |

Weights are configurable per risk profile (`RiskProfile.constraintsJson.scoreWeights`,
default `DEFAULT_SCORE_WEIGHTS` in `src/lib/config.ts`).

## Normalisation

Each sub-score blends:

- a **peer percentile** (`percentileRank`) — rank within the security's asset class
  (equities vs equities), with winsorised handling of missing data; and
- an **absolute anchor** (`scaleClamped` against sensible thresholds, e.g. ROIC 4 %→25 %,
  revenue growth 0 %→35 %, forward P/E > 40 triggers a valuation-risk penalty).

`blendRelAbs(rel, abs, relWeight=0.6)` combines them. This means a security is judged both
against its peers *and* against absolute standards, so a uniformly expensive peer group
doesn't make an expensive name look "cheap".

## AI exposure sub-model (`aiExposureScore`)

0–100 from two signals, with written drivers:

1. **Look-through factor loadings** — `0.6·aiFactor + 0.3·semiconductor + 0.1·usTech`
   (`Security.factorLoadings`).
2. **Industry / sector keywords** — semiconductors (0.9), semi equipment (0.85),
   data-centre infra (0.8), networking (0.7), cloud (0.65), cybersecurity (0.6),
   robotics (0.55), power/electrification (0.45), software (0.5), automation (0.45).

`score = 100 · min(1, 0.7·factorComponent + 0.45·keywordComponent)`.

## Non-equity scorecards

- **Gold** — attractiveness from real-yield direction (40 %), USD trend (30 %), momentum (30 %);
  no cash-flow / earnings components.
- **Government / IG bonds** — starting yield level (45 %), rate-path direction (35 %),
  credit-spread level for IG (20 %); duration risk in the risk component.
- **Cash** — front-end yield; risk component ~95 (principal stable), growth low.

## Determinism

All engine functions are pure and seeded where randomness is involved (demo data only).
`scoreUniverse` called twice on the same inputs returns byte-identical output — asserted in
`src/test/scoring.test.ts`.
