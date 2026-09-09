import type { ReasoningInput } from "../schema";

// Compact JSON bundle handed to the model. Kept small and deterministic so the
// prompt cache stays warm across a run.
export function buildUserPrompt(input: ReasoningInput): string {
  return JSON.stringify(
    {
      instruction:
        "Produce `recommendations` (one per holding) and `rejections` (one per rejected candidate), matching the schema. Use only the data below.",
      asOf: input.asOf,
      regime: input.regime,
      constraints: input.constraints,
      sleeveTargets: input.sleeveTargets,
      portfolioFactorExposure: input.portfolioFactorExposure,
      holdings: input.holdings,
      rejectedCandidates: input.rejected,
      sources: input.sources,
    },
    null,
    0,
  );
}

// JSON schema for output_config.format — mirrors src/ai/schema.ts (Zod re-validates).
export const OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations", "rejections"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ticker", "action", "conviction", "evidenceQuality", "timeHorizon",
          "valuationView", "entryStrategy", "thesisMd", "catalysts", "risks",
          "invalidationConditions", "bullBearBase", "devilsAdvocateMd", "fic", "sourceIds",
        ],
        properties: {
          ticker: { type: "string" },
          action: { type: "string", enum: ["STRONG_BUY", "BUY", "HOLD", "REDUCE", "SELL", "WATCH", "NO_ACTION"] },
          conviction: { type: "integer", minimum: 0, maximum: 100 },
          evidenceQuality: { type: "integer", minimum: 0, maximum: 100 },
          timeHorizon: { type: "string", enum: ["SHORT", "MEDIUM", "LONG"] },
          valuationView: { type: "string", enum: ["CHEAP", "FAIR", "EXPENSIVE", "UNCLEAR"] },
          entryStrategy: { type: "string" },
          thesisMd: { type: "string" },
          catalysts: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" }, minItems: 1 },
          invalidationConditions: { type: "array", items: { type: "string" }, minItems: 1 },
          bullBearBase: {
            type: "object",
            additionalProperties: false,
            required: ["bull", "base", "bear", "keyAssumptions"],
            properties: {
              bull: { type: "string" },
              base: { type: "string" },
              bear: { type: "string" },
              keyAssumptions: { type: "array", items: { type: "string" } },
            },
          },
          devilsAdvocateMd: { type: "string" },
          fic: {
            type: "object",
            additionalProperties: false,
            required: ["facts", "interpretations", "aiConclusion"],
            properties: {
              facts: { type: "array", items: { type: "string" }, minItems: 1 },
              interpretations: { type: "array", items: { type: "string" } },
              aiConclusion: { type: "string" },
            },
          },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    rejections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ticker", "action", "reasons", "whatWouldChangeOurMind", "sourceIds"],
        properties: {
          ticker: { type: "string" },
          action: { type: "string", enum: ["WATCH"] },
          reasons: { type: "array", items: { type: "string" }, minItems: 1 },
          whatWouldChangeOurMind: { type: "array", items: { type: "string" }, minItems: 1 },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
