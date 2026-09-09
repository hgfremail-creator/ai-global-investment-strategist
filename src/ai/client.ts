import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from "./prompts/system";
import { buildUserPrompt, OUTPUT_JSON_SCHEMA } from "./prompts/build";
import { aiBatchOutputSchema, type AiBatchOutput, type ReasoningInput } from "./schema";

export type AiCallResult = {
  output: AiBatchOutput;
  usedFallback: boolean;
  model: string;
  promptHash: string;
  tokensIn?: number;
  tokensOut?: number;
  note?: string;
};

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function promptHashOf(input: ReasoningInput): string {
  return createHash("sha256")
    .update(SYSTEM_PROMPT_VERSION + "::" + buildUserPrompt(input))
    .digest("hex");
}

const BATCH_SIZE = 8;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Call the Anthropic API for structured recommendations. Batches securities so
 * each request's output stays bounded. Throws on any failure — the caller
 * (services/recommendations.ts) catches and uses the deterministic fallback.
 */
export async function callReasoning(input: ReasoningInput): Promise<AiCallResult> {
  if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY not set");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const client = new Anthropic();

  const holdingBatches = chunk(input.holdings, BATCH_SIZE);
  const rejectedBatches = chunk(input.rejected, BATCH_SIZE);
  const rounds = Math.max(holdingBatches.length, rejectedBatches.length, 1);

  const merged: AiBatchOutput = { recommendations: [], rejections: [] };
  let tokensIn = 0;
  let tokensOut = 0;

  for (let i = 0; i < rounds; i++) {
    const batchInput: ReasoningInput = {
      ...input,
      holdings: holdingBatches[i] ?? [],
      rejected: rejectedBatches[i] ?? [],
    };
    if (batchInput.holdings.length === 0 && batchInput.rejected.length === 0) continue;

    const stream = client.messages.stream({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: {
        format: { type: "json_schema", name: "committee_output", schema: OUTPUT_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: buildUserPrompt(batchInput) }],
    });

    const message = await stream.finalMessage();
    tokensIn += message.usage?.input_tokens ?? 0;
    tokensOut += message.usage?.output_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      throw new Error(`AI refused: ${message.stop_details?.category ?? "unknown"}`);
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = aiBatchOutputSchema.parse(JSON.parse(text));
    merged.recommendations.push(...parsed.recommendations);
    merged.rejections.push(...parsed.rejections);
  }

  return {
    output: merged,
    usedFallback: false,
    model,
    promptHash: promptHashOf(input),
    tokensIn,
    tokensOut,
  };
}
