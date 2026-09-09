# Investment methodology

The application behaves like a **disciplined institutional investment committee**, not a
stock-tip generator. Its goal is *"construct the best risk-adjusted portfolio that current
evidence can justify, explain the reasoning transparently, protect against major downside
risks, and continuously reassess the thesis"* — not *"find stocks that will go up"*.

## Layers

```
DATA        provider adapters → prices, fundamentals, macro, news, FX   (+ Source provenance)
ANALYSIS    indicators · 0–100 security scores · market-regime engine    (deterministic)
AI REASON   interpretation, thesis, catalysts, risks, committee, devil's advocate  (LLM or fallback)
PORTFOLIO   sleeve targets · candidate selection · constrained optimiser (deterministic)
RISK        vol / drawdown / Sharpe / Sortino · concentration · stress tests
PRESENT     dashboards, weekly report, advisor
```

The AI layer **never computes numbers** that drive the portfolio. Scores, weights, the
regime and dollar amounts come from the deterministic layers; the AI writes the *why*.

## 1. Macro & market regime

`src/engine/regime.ts` — ten indicators (S&P 500 & Nasdaq trend, realised volatility,
high-yield credit spreads, the 2s10s curve, gold momentum, the US dollar, market breadth,
earnings-revision breadth, semiconductor relative strength) each cast a weighted vote in
[−2, +2] with a written rationale. The weighted average maps to
**Strong Risk-On / Risk-On / Neutral / Risk-Off / Crisis**. No single indicator decides.

## 2. Security scoring

`docs/SCORING_MODEL.md`. Eight components (business quality, growth, valuation, earnings
momentum, market momentum, AI exposure, balance sheet, risk), each 0–100, each blending a
**peer percentile** with an **absolute anchor**. Weighted sum → an overall 0–100 score whose
component **point contributions** are shown in the UI. Non-equity assets (gold, government &
IG bonds, cash) use adapted scorecards driven by real yields, the curve, credit spreads and
front-end yield.

An **AI-exposure sub-model** (0–100) combines look-through factor loadings with
sector/industry signals and lists its drivers.

## 3. Portfolio construction

`docs/PORTFOLIO_ALGORITHM.md`. Strategic **sleeve targets** from a `(risk score, horizon)`
matrix → **regime tilt** → bounded **macro / valuation tilt** → per-sleeve **candidate
selection** (duration-fit for bonds) → **score × risk-parity** within-sleeve weights →
**constraint projection** (single-name, sector, country, currency, portfolio-vol, minimum
defensive) → **existing-holdings reconciliation** → factor look-through & concentration
warnings → exact-100 % rounding. An **incumbency bonus** keeps weekly turnover low.

Hard rules: no name can exceed the single-name cap because its score is high; the defensive
floor for the risk profile is always respected; the total is always exactly 100 %.

## 4. Recommendations

Each security gets STRONG BUY / BUY / HOLD / REDUCE / SELL / WATCH / NO ACTION, with a
thesis, catalysts, risks, **invalidation conditions** ("what would prove this wrong"),
entry strategy, time horizon, conviction (0–100), evidence quality (0–100), an
Investment-Committee **bull / base / bear**, a mandatory **devil's-advocate** pass, and
FACT / INTERPRETATION / AI-CONCLUSION tagging. Rejected candidates get a **"why not"**
explanation. Price targets are never manufactured.

## 5. Weekly review

`docs/WEEKLY_REFRESH.md`. Fresh data → recompute everything → **diff against the previous
version with a concrete reason for every change** (score / momentum / valuation deltas;
regime-composite shift) → new **immutable** `StrategyVersion` → 15-section report. Prior
versions are never modified; the whole history is browsable and comparable.

## 6. Risk & stress

Synthetic-portfolio volatility (blended with a correlation-floor estimate), max drawdown,
Sharpe / Sortino, concentration (HHI + effective names), factor look-through, and
valuation / liquidity / geopolitical gauges. Five deterministic stress scenarios (AI crash,
recession, inflation shock, geopolitical crisis, Japan rate shock) plus custom shocks in
the What-If tool. Everything hypothetical is labelled as such.

## What the system will not do

Guarantee returns · claim certainty · fabricate data, sources or price targets · hide a
negative · silently change an allocation · encourage excessive trading · present a scenario
as fact. "Insufficient evidence" and "NO ACTION" are valid, honest outcomes.
