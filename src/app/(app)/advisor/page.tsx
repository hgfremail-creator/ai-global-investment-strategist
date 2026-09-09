import { pageContext } from "@/services/page";
import { aiConfigured } from "@/ai/client";
import { Card, Badge } from "@/components/ui";
import { AdvisorChat } from "./AdvisorChat";

export const dynamic = "force-dynamic";

const SUGGESTIONS = [
  "Why do you hold NVDA?",
  "Why did you reduce Microsoft?",
  "Do you prefer SAP to Oracle?",
  "What is the biggest risk in my portfolio?",
  "Which three names have the best risk/reward?",
  "What if the Nasdaq falls 15%?",
];

export default async function AdvisorPage() {
  await pageContext();
  const hasKey = aiConfigured();

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">AI Advisor</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Answers come only from your current strategy, scores, recommendations and risk data —
            and cite what they used.
          </p>
        </div>
        <Badge tone={hasKey ? "accent" : "warn"}>
          {hasKey ? "LLM enabled" : "deterministic router (no LLM key)"}
        </Badge>
      </div>
      <Card className="flex flex-1 flex-col overflow-hidden">
        <AdvisorChat suggestions={SUGGESTIONS} />
      </Card>
      <p className="mt-2 text-[11px] text-[var(--color-faint)]">
        Not investment advice. The advisor will say &ldquo;insufficient evidence&rdquo; rather than
        speculate, and never invents figures.
      </p>
    </div>
  );
}
