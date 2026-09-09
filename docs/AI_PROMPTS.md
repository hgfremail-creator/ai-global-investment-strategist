# AI reasoning layer — prompts & contract

**The LLM never computes numbers.** Scores, weights, the regime and the dollar amounts are
produced by the deterministic engine layer. The reasoning layer only writes *interpretation*
and *decision metadata* for each holding, and explains rejected candidates. If no
`ANTHROPIC_API_KEY` is set — or if the LLM output fails validation — a deterministic
**fallback writer** (`src/ai/fallback.ts`) produces the exact same structured output, clearly
labelled "generated without LLM" in the UI.

## Files

| File | Role |
|---|---|
| `src/ai/schema.ts` | Zod schemas for the input bundle (`ReasoningInput`) and output (`AiBatchOutput`). |
| `src/ai/prompts/system.ts` | The versioned system prompt (`SYSTEM_PROMPT_VERSION`). |
| `src/ai/prompts/build.ts` | `buildUserPrompt()` — compact JSON bundle — and `OUTPUT_JSON_SCHEMA` for `output_config.format`. |
| `src/ai/client.ts` | Anthropic call: `messages.stream` with adaptive thinking + JSON-schema structured output, batched 8 securities/request, re-validated with Zod. |
| `src/ai/fallback.ts` | Deterministic writer. |
| `src/ai/guardrails.ts` | Output validation applied to **both** paths. |
| `src/services/recommendations.ts` | Builds the bundle from the DB, calls the layer, applies guardrails, persists `Recommendation` + `RecommendationSource` + `AIAnalysis`. |

## System prompt (v1.0.0)

Encodes: the "you do not compute numbers" boundary; the absolute rules (no guaranteed returns,
no invented price targets, cite only provided source ids, always disclose a real risk + a
concrete invalidation condition); the FACT / INTERPRETATION / AI CONCLUSION discipline (the
`fic` field); "insufficient evidence / HOLD / WATCH / low conviction are valid honest
answers"; be specific and quantitative; the devil's-advocate section must genuinely argue the
bear case. Full text in `src/ai/prompts/system.ts`.

## Model & parameters

- Model: `process.env.ANTHROPIC_MODEL` (default `claude-sonnet-5`).
- `thinking: { type: "adaptive" }`, `max_tokens: 16000`, streamed (`.finalMessage()`).
- `output_config.format = { type: "json_schema", name: "committee_output", schema: OUTPUT_JSON_SCHEMA }`.
- System prompt carries `cache_control: { type: "ephemeral" }`; the volatile per-batch bundle
  is the only thing that changes between requests in a run, so the cache stays warm.
- `stop_reason === "refusal"` → throw → fallback.

## Output schema (per security)

`ticker, action (STRONG_BUY…WATCH/NO_ACTION), conviction 0–100, evidenceQuality 0–100,
timeHorizon, valuationView, entryStrategy, thesisMd, catalysts[], risks[] (≥1),
invalidationConditions[] (≥1), bullBearBase { bull, base, bear, keyAssumptions[] },
devilsAdvocateMd, fic { facts[], interpretations[], aiConclusion }, sourceIds[]`.

Rejections: `ticker, action="WATCH", reasons[], whatWouldChangeOurMind[], sourceIds[]`.

## Guardrails (`applyGuardrails`)

Rejects / sanitises output that:

- guarantees a return, asserts a certain price move, claims risk-free / "can't lose";
- states a price target or a numeric target price (regex);
- cites a source id not in the provided list (dropped, not fatal);
- has no risks or no invalidation conditions;
- recommends a security not in the target portfolio, or duplicates / omits a holding.

On any hard violation the batch falls back to the deterministic writer and the reason is
recorded on the strategy version and shown in the UI. Every call — LLM or fallback — writes an
`AIAnalysis` audit row (prompt hash, input summary, full output, token counts, `usedFallback`).

## Committee & devil's-advocate

`bullBearBase` is the Investment-Committee view (bull / base / bear + key assumptions).
`devilsAdvocateMd` is a mandatory second pass: "assume the thesis is wrong — what evidence
would show it", built (in the fallback) from the security's weakest score components.
