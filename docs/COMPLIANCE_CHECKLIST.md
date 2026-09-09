# Compliance / risk checklist

> This application produces investment *research and portfolio analysis*, not personalised
> investment advice. It is architected so a qualified compliance review can be layered on
> before any commercial deployment. **That review has not been done.**

## Product guardrails (implemented)

| # | Requirement (spec §37–39) | Status | Where |
|---|---|---|---|
| 1 | Never guarantee returns / claim certainty | ✅ | `src/ai/guardrails.ts` (`FORBIDDEN_PHRASES`), applied to LLM + fallback + advisor; tested |
| 2 | Never fabricate financial data, sources, or price targets | ✅ | guardrails reject numeric price targets, unknown source ids; LLM prompt forbids invention; deterministic engine can't invent |
| 3 | Never hide negative information | ✅ | every recommendation must carry ≥1 risk + ≥1 invalidation condition (schema + guardrail + integration test) |
| 4 | Never silently change an allocation | ✅ | every `StrategyChange` has a reason enriched with evidence; weekly report "Changes From Last Week" table; immutable versions |
| 5 | Don't encourage excessive trading | ✅ | incumbency bonus in the allocation engine → <1 name change/week on stable data |
| 6 | "Insufficient evidence" / "NO ACTION" are valid outcomes | ✅ | `NO_ACTION` action; fallback lowers conviction on thin data; advisor says so |
| 7 | Distinguish FACT / DATA / INTERPRETATION / AI ASSESSMENT / FORECAST / UNCERTAINTY | ✅ | `EpistemicTag` component; `fic` field on every recommendation |
| 8 | Prominent, non-footer disclaimer | ✅ | first-run `DisclaimerGate` modal + persistent `DisclaimerBanner` + `/legal` |
| 9 | Risk warning next to every recommendation and stress test | ✅ | `RecommendationCard` risk list; stress tests badged "Hypothetical" |
| 10 | Source + date + link on every important claim; freshness (LIVE/TODAY/WEEK/HISTORICAL) | ✅ | `Source` model, `RecommendationSource`, rendered on `RecommendationCard` and the weekly report |
| 11 | Simulated data never presented as real-time | ✅ | `isDemo` flag, `DemoBadge` / "SIMULATED DATA" everywhere, `freshness` |
| 12 | Conflicts-of-interest mechanism | ✅ schema | `ConflictDisclosure` model — surfaced in UI once populated (no conflicts in the demo) |
| 13 | Paper investing only; no brokerage connection | ✅ | no order-execution code exists |

## Before commercial deployment

- Legal review of the disclaimer, the "not advice" framing, and jurisdiction-specific rules.
- Compliance sign-off on the scoring methodology and the AI reasoning layer's outputs.
- Real market-data licensing (the demo dataset is for development only).
- Records retention / audit policy for `StrategyVersion`, `Recommendation`, `AIAnalysis`.
- Suitability & KYC if the tool is ever positioned as advice.
- Populate `ConflictDisclosure` with any real provider/vendor relationships.
