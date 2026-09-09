// Output guardrails. Applied to BOTH the LLM and fallback output before persistence.
// The application must not: guarantee returns, claim certainty, fabricate price
// targets, cite unknown sources, or hide a known negative.

import type { AiBatchOutput, ReasoningInput } from "./schema";

const FORBIDDEN_PHRASES: { re: RegExp; label: string }[] = [
  { re: /\bguarantee(d|s)?\b/i, label: "guarantees a return" },
  { re: /\b(will|going to)\s+(rise|increase|double|surge|rally|outperform)\b/i, label: "asserts a certain price move" },
  { re: /\bcertain(ly)?\s+to\b/i, label: "claims certainty" },
  { re: /\brisk[- ]free\b/i, label: "claims risk-free" },
  { re: /\bcan'?t\s+lose\b/i, label: "claims no downside" },
  { re: /\bprice target\b/i, label: "states a price target" },
  { re: /\$\s?\d[\d,]*\s*(price\s*)?target/i, label: "states a numeric price target" },
  { re: /\btarget price\s*(of|:)?\s*\$?\d/i, label: "states a numeric price target" },
];

export type GuardrailResult = { ok: boolean; violations: string[]; sanitised: AiBatchOutput };

function scanText(text: string, ticker: string, violations: string[]) {
  for (const { re, label } of FORBIDDEN_PHRASES) {
    if (re.test(text)) violations.push(`${ticker}: ${label} ("${text.match(re)?.[0]}")`);
  }
}

export function applyGuardrails(out: AiBatchOutput, input: ReasoningInput): GuardrailResult {
  const violations: string[] = [];
  const validSourceIds = new Set(input.sources.map((s) => s.id));

  const heldTickers = new Set(input.holdings.map((h) => h.ticker));
  const seenRecs = new Set<string>();

  for (const r of out.recommendations) {
    const texts = [
      r.thesisMd, r.devilsAdvocateMd, r.entryStrategy,
      ...r.catalysts, ...r.risks, ...r.invalidationConditions,
      r.bullBearBase.bull, r.bullBearBase.base, r.bullBearBase.bear,
      ...r.fic.facts, ...r.fic.interpretations, r.fic.aiConclusion,
    ];
    for (const t of texts) scanText(t, r.ticker, violations);

    if (!heldTickers.has(r.ticker)) violations.push(`${r.ticker}: recommendation for a security not in the target portfolio`);
    if (seenRecs.has(r.ticker)) violations.push(`${r.ticker}: duplicate recommendation`);
    seenRecs.add(r.ticker);

    if (r.risks.length === 0) violations.push(`${r.ticker}: no risks disclosed`);
    if (r.invalidationConditions.length === 0) violations.push(`${r.ticker}: no invalidation conditions`);

    // drop unknown source ids rather than failing outright
    r.sourceIds = r.sourceIds.filter((id) => validSourceIds.has(id));
  }

  // every held security must have exactly one recommendation
  for (const h of input.holdings) {
    if (!seenRecs.has(h.ticker)) violations.push(`${h.ticker}: missing recommendation for a held security`);
  }

  for (const rej of out.rejections) {
    for (const t of [...rej.reasons, ...rej.whatWouldChangeOurMind]) scanText(t, rej.ticker, violations);
    rej.sourceIds = rej.sourceIds.filter((id) => validSourceIds.has(id));
  }

  return { ok: violations.length === 0, violations, sanitised: out };
}

/** Whether the failure is recoverable by falling back (vs a hard bug). */
export function isRecoverable(): boolean {
  return true;
}

/** Free-text guardrail for the conversational advisor. */
export function applyGuardrailsText(text: string): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const { re, label } of FORBIDDEN_PHRASES) {
    if (re.test(text)) violations.push(`${label} ("${text.match(re)?.[0]}")`);
  }
  return { ok: violations.length === 0, violations };
}
