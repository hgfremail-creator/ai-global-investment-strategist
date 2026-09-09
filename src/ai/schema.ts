import { z } from "zod";
import { ACTIONS } from "@/lib/enums";

// The structured output the reasoning layer must return for each security.
// Both the LLM path and the deterministic fallback produce this exact shape;
// the portfolio engine never depends on free-form text.

export const ficSchema = z.object({
  facts: z.array(z.string()).min(1).describe("Verifiable statements grounded in the provided data"),
  interpretations: z.array(z.string()).describe("What the facts suggest"),
  aiConclusion: z.string().describe("The resulting portfolio action, e.g. 'increase from 6% to 8%'"),
});

export const bullBearBaseSchema = z.object({
  bull: z.string(),
  base: z.string(),
  bear: z.string(),
  keyAssumptions: z.array(z.string()),
});

export const recommendationOutputSchema = z.object({
  ticker: z.string(),
  action: z.enum(ACTIONS),
  conviction: z.number().int().min(0).max(100),
  evidenceQuality: z.number().int().min(0).max(100),
  timeHorizon: z.enum(["SHORT", "MEDIUM", "LONG"]),
  valuationView: z.enum(["CHEAP", "FAIR", "EXPENSIVE", "UNCLEAR"]),
  entryStrategy: z.string(),
  thesisMd: z.string().min(20),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()).min(1),
  invalidationConditions: z.array(z.string()).min(1).describe("What would prove the thesis wrong"),
  bullBearBase: bullBearBaseSchema,
  devilsAdvocateMd: z.string().min(20).describe("Assume the thesis is wrong — what evidence would show it"),
  fic: ficSchema,
  sourceIds: z.array(z.string()).describe("Only IDs from the provided source list"),
});
export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

export const rejectionOutputSchema = z.object({
  ticker: z.string(),
  action: z.literal("WATCH"),
  reasons: z.array(z.string()).min(1),
  whatWouldChangeOurMind: z.array(z.string()).min(1),
  sourceIds: z.array(z.string()),
});
export type RejectionOutput = z.infer<typeof rejectionOutputSchema>;

export const aiBatchOutputSchema = z.object({
  recommendations: z.array(recommendationOutputSchema),
  rejections: z.array(rejectionOutputSchema),
  portfolioNarrativeMd: z.string().optional(),
});
export type AiBatchOutput = z.infer<typeof aiBatchOutputSchema>;

// ── Input bundle given to the reasoning layer ────────────────────────────
export type SecurityBundle = {
  ticker: string;
  name: string;
  country: string;
  sector: string;
  industry: string;
  assetClass: string;
  sleeve: string;
  targetWeight: number | null; // null for rejected candidates
  overallScore: number;
  componentScores: Record<string, number>;
  componentContributions: Record<string, number>;
  componentNotes: Record<string, string>;
  rawMetrics: Record<string, number | null | string[]>;
  fundamentals: Record<string, number | string | null>;
  aiExposureDrivers: string[];
  existingExposure: { quantity: number; weight: number; note: string } | null;
  recentNews: { title: string; publishedAt: string; sentiment: number | null; sourceId: string }[];
};

export type ReasoningInput = {
  asOf: string;
  regime: { regime: string; score: number; drivers: { indicator: string; vote: number; rationale: string }[] };
  constraints: Record<string, number>;
  sleeveTargets: Record<string, number>;
  portfolioFactorExposure: Record<string, number>;
  holdings: SecurityBundle[];
  rejected: SecurityBundle[];
  sources: { id: string; type: string; title: string; publisher: string; publishedAt: string | null; freshness: string; isDemo: boolean }[];
};
